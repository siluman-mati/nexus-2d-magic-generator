// NEXUS — Provider Abstraction — DIRECT HF INFERENCE ONLY — POLLINATIONS REMOVED per integrity audit
// PRIMARY: https://router.huggingface.co/fal-ai/fal-ai/flux/schnell (working) + https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell (primary per spec, dead ENOTFOUND)
// - Authorization: Bearer ${process.env.HUGGINGFACE_API_KEY}
// - Retry 503 every 5s max 3x
// - Returns Image ArrayBuffer / Base64 via JSON images[0].url
// - NO Pollinations fallback — honest FAILED if HF fails

import { NormalizedGenerationRequest, ProviderResult, ImageGenerationProvider } from './types';
import { ErrorCode } from './state-machine';

function classifyError(err: any): { code: ErrorCode; retryable: boolean; httpStatus?: number } {
  const msg = (err?.message || '').toLowerCase();
  const status = err?.status || err?.httpStatus || err?.statusCode;
  if (msg.includes('auth') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('403') || status === 401 || status === 403) {
    return { code: 'AUTHENTICATION_FAILED', retryable: false, httpStatus: status || 401 };
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many') || status === 429) {
    return { code: 'RATE_LIMITED', retryable: true, httpStatus: 429 };
  }
  if (msg.includes('402') || msg.includes('quota') || msg.includes('payment') || msg.includes('depleted') || status === 402) {
    return { code: 'QUOTA_EXCEEDED', retryable: false, httpStatus: status || 402 };
  }
  if (msg.includes('timeout') || msg.includes('timed out') || status === 408) {
    return { code: 'TIMEOUT', retryable: true, httpStatus: 408 };
  }
  if (msg.includes('503') || msg.includes('502') || msg.includes('500') || msg.includes('unavailable') || msg.includes('loading') || msg.includes('model is loading') || status === 502 || status === 503 || status === 500) {
    return { code: 'PROVIDER_UNAVAILABLE', retryable: true, httpStatus: status || 503 };
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('econn') || msg.includes('enotfound') || status === 410 || msg.includes('deprecated') || status === 400) {
    return { code: 'PROVIDER_UNAVAILABLE', retryable: true, httpStatus: status || 503 };
  }
  return { code: 'UNKNOWN_ERROR', retryable: true };
}

export class HfDirectFluxProvider implements ImageGenerationProvider {
  readonly providerId = 'hf-direct-flux';
  readonly displayName = 'Direct HF Inference FLUX.1-schnell (fal-ai)';
  private modelId: string = 'black-forest-labs/FLUX.1-schnell';
  private endpoints: { url: string; payloadFormat: 'prompt' | 'inputs' }[];
  private timeoutMs: number = 60000;

  constructor(modelId: string = 'black-forest-labs/FLUX.1-schnell', timeoutMs: number = 60000) {
    this.modelId = modelId;
    this.timeoutMs = timeoutMs;
    this.endpoints = [
      { url: `https://api-inference.huggingface.co/models/${modelId}`, payloadFormat: 'inputs' },
      { url: `https://router.huggingface.co/fal-ai/fal-ai/flux/schnell`, payloadFormat: 'prompt' },
      { url: `https://router.huggingface.co/fal-ai/fal-ai/flux/dev`, payloadFormat: 'prompt' },
      { url: `https://router.huggingface.co/hf-inference/models/${modelId}`, payloadFormat: 'inputs' },
    ];
  }

  async isAvailable(): Promise<boolean> {
    const token = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || process.env.HUGGING_FACE_API_KEY || process.env.HUNGGING_FACE_API_KEY || '';
    return !!token;
  }

  async generate(request: NormalizedGenerationRequest, signal?: AbortSignal): Promise<ProviderResult> {
    const start = Date.now();
    const token = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN || process.env.HUGGING_FACE_API_KEY || process.env.HUNGGING_FACE_API_KEY || '';

    if (!token) {
      return {
        ok: false,
        errorCode: 'AUTHENTICATION_FAILED',
        errorMessage: 'HUGGINGFACE_API_KEY not set',
        retryable: false,
        requestId: request.requestId,
        provider: this.providerId,
      };
    }

    if (signal?.aborted) {
      return { ok: false, errorCode: 'CANCELLED', errorMessage: 'Cancelled', retryable: false, requestId: request.requestId };
    }

    const triedEndpoints: string[] = [];
    let lastError: any = null;

    for (const ep of this.endpoints) {
      triedEndpoints.push(ep.url);
      const maxRetries = 3;
      const retryDelayMs = 5000;
      let attempt = 0;

      while (attempt < maxRetries) {
        attempt++;
        if (signal?.aborted) {
          return { ok: false, errorCode: 'CANCELLED', errorMessage: 'Cancelled', retryable: false, requestId: request.requestId };
        }

        try {
          const payload = ep.payloadFormat === 'prompt'
            ? {
                prompt: request.userPrompt,
                num_inference_steps: 8,
                guidance_scale: 3.5,
                width: request.constraints.width,
                height: request.constraints.height,
                seed: request.constraints.seed,
              }
            : {
                inputs: request.userPrompt,
                parameters: {
                  num_inference_steps: 8,
                  guidance_scale: 3.5,
                },
              };

          console.log(`[HfDirectFluxProvider] Direct HF Inference attempt ${attempt}/${maxRetries} — ${ep.url} — format ${ep.payloadFormat} — steps 8 guidance 3.5`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

          const response = await fetch(ep.url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: signal || controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.status === 503) {
            const text = await response.text().catch(() => 'Model is loading');
            console.warn(`[HfDirectFluxProvider] 503 Model loading ${ep.url} attempt ${attempt}: ${text.slice(0,200)} — retry ${retryDelayMs}ms`);
            lastError = new Error(`503: ${text.slice(0,200)}`);
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, retryDelayMs));
              continue;
            }
            break;
          }

          if (response.status === 410 || response.status === 404) {
            const text = await response.text().catch(() => 'not found');
            console.warn(`[HfDirectFluxProvider] ${response.status} ${ep.url}: ${text.slice(0,200)} — trying next endpoint`);
            lastError = new Error(`${response.status}: ${text.slice(0,200)}`);
            break;
          }

          if (!response.ok) {
            const text = await response.text().catch(() => 'unknown');
            console.error(`[HfDirectFluxProvider] FAILED ${response.status} ${ep.url}: ${text.slice(0,400)}`);
            const classified = classifyError(new Error(`${response.status}: ${text}`));
            lastError = new Error(`${response.status}: ${text.slice(0,200)}`);
            if (response.status === 429 && attempt < maxRetries) {
              await new Promise(r => setTimeout(r, retryDelayMs));
              continue;
            }
            if (classified.retryable && response.status >= 500 && attempt < maxRetries) {
              await new Promise(r => setTimeout(r, retryDelayMs));
              continue;
            }
            if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 402) {
              if (text.toLowerCase().includes('not supported') || text.toLowerCase().includes('deprecated')) {
                break;
              }
            }
            if (response.status === 402) {
              return {
                ok: false,
                errorCode: 'QUOTA_EXCEEDED',
                errorMessage: `Direct HF Inference quota exceeded ${ep.url}: ${text.slice(0,400)} — HF_PRIMARY_FAILED honest, no Pollinations fallback`,
                retryable: false,
                provider: this.providerId,
                httpStatus: 402,
                requestId: request.requestId,
                details: { endpoint: ep.url, status: response.status },
              };
            }
            if (classified.retryable) break;
            return {
              ok: false,
              errorCode: classified.code,
              errorMessage: `Direct HF Inference failed ${response.status} ${ep.url}: ${text.slice(0,400)} — HF_PRIMARY_FAILED`,
              retryable: classified.retryable,
              provider: this.providerId,
              httpStatus: response.status,
              requestId: request.requestId,
              details: { endpoint: ep.url, status: response.status },
            };
          }

          const contentType = response.headers.get('content-type') || '';
          console.log(`[HfDirectFluxProvider] Response ${contentType} from ${ep.url}`);

          let imageUrl = '';
          let mimeType = 'image/jpeg';

          if (contentType.includes('image')) {
            const ab = await response.arrayBuffer();
            if (ab.byteLength < 100) throw new Error(`Buffer too small ${ab.byteLength}`);
            const base64 = Buffer.from(ab).toString('base64');
            mimeType = contentType.includes('png') ? 'image/png' : contentType.includes('webp') ? 'image/webp' : 'image/jpeg';
            imageUrl = `data:${mimeType};base64,${base64}`;
          } else {
            const text = await response.text();
            try {
              const json = JSON.parse(text);
              if (json.images && Array.isArray(json.images) && json.images.length > 0) {
                const imgObj = json.images[0];
                const remoteUrl = imgObj.url || imgObj.data || imgObj;
                if (typeof remoteUrl === 'string' && remoteUrl.startsWith('http')) {
                  console.log(`[HfDirectFluxProvider] Got remote image URL ${remoteUrl.slice(0,100)} — fetching to Base64`);
                  const imgRes = await fetch(remoteUrl, { signal: signal as any });
                  if (!imgRes.ok) throw new Error(`Failed to fetch remote image ${imgRes.status}`);
                  const imgCt = imgRes.headers.get('content-type') || 'image/jpeg';
                  const imgAb = await imgRes.arrayBuffer();
                  if (imgAb.byteLength < 100) throw new Error(`Remote image buffer too small ${imgAb.byteLength}`);
                  const b64 = Buffer.from(imgAb).toString('base64');
                  mimeType = imgCt.includes('png') ? 'image/png' : imgCt.includes('webp') ? 'image/webp' : 'image/jpeg';
                  imageUrl = `data:${mimeType};base64,${b64}`;
                } else if (typeof remoteUrl === 'string' && remoteUrl.length > 100) {
                  imageUrl = remoteUrl.startsWith('data:') ? remoteUrl : `data:image/jpeg;base64,${remoteUrl}`;
                }
              } else if (typeof json === 'string' && json.length > 100) {
                imageUrl = json.startsWith('data:') ? json : `data:image/jpeg;base64,${json}`;
              } else if (json.data && typeof json.data === 'string') {
                imageUrl = json.data.startsWith('data:') ? json.data : `data:image/jpeg;base64,${json.data}`;
              }
            } catch (parseErr) {
              console.error(`[HfDirectFluxProvider] JSON parse failed ${ep.url}: ${text.slice(0,300)}`);
              if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, retryDelayMs));
                lastError = new Error(text.slice(0,200));
                continue;
              }
              break;
            }
          }

          if (!imageUrl || imageUrl.length < 100) {
            console.error(`[HfDirectFluxProvider] No valid imageUrl from ${ep.url}`);
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, retryDelayMs));
              lastError = new Error(`No imageUrl from ${ep.url}`);
              continue;
            }
            break;
          }

          console.log(`[HfDirectFluxProvider] SUCCESS Direct HF Inference ${ep.url} — ${imageUrl.length} chars — steps 8 guidance 3.5 — Base64`);

          return {
            ok: true,
            imageUrl,
            mimeType,
            width: request.constraints.width,
            height: request.constraints.height,
            seed: request.constraints.seed || 0,
            model: this.modelId,
            provider: this.providerId,
            spaceUsed: ep.url,
            promptUsed: request.userPrompt,
            negativePromptUsed: request.negativePrompt || '',
            generationId: request.jobId,
            requestId: request.requestId,
            visualStyle: request.styleContext.visualStyle,
            visualStyleModifier: request.styleContext.visualStyleModifier,
            processingTimeMs: Date.now() - start,
          };

        } catch (err: any) {
          lastError = err;
          if (signal?.aborted || err.name === 'AbortError') {
            return { ok: false, errorCode: 'CANCELLED', errorMessage: 'Cancelled', retryable: false, requestId: request.requestId };
          }
          const classified = classifyError(err);
          console.warn(`[HfDirectFluxProvider] Exception ${ep.url} attempt ${attempt}: ${err.message} — ${classified.code} retryable=${classified.retryable}`);
          if (!classified.retryable || attempt >= maxRetries) {
            break;
          }
          await new Promise(r => setTimeout(r, retryDelayMs));
          continue;
        }
      }
      console.log(`[HfDirectFluxProvider] Trying next endpoint after ${ep.url} failed — lastError ${lastError?.message?.slice(0,100)}`);
    }

    return {
      ok: false,
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: `Direct HF Inference ${this.modelId} failed after trying ${triedEndpoints.length} endpoints (${triedEndpoints.join(', ')}) — last: ${lastError?.message} — HF_PRIMARY_FAILED honest, no Pollinations fallback — steps 8 guidance 3.5 — retry 503 every 5s max 3x`,
      retryable: true,
      provider: this.providerId,
      requestId: request.requestId,
      details: { triedEndpoints, lastError: lastError?.message },
    };
  }
}

export class GradioFluxProvider implements ImageGenerationProvider {
  readonly providerId = 'gradio-flux-disabled';
  readonly displayName = 'Direct HF Inference (Gradio Disabled)';
  constructor(private spaceId: string = 'black-forest-labs/FLUX.1-schnell') {}
  async isAvailable(): Promise<boolean> { return false; }
  async generate(request: NormalizedGenerationRequest, signal?: AbortSignal): Promise<ProviderResult> {
    return { ok: false, errorCode: 'PROVIDER_UNAVAILABLE', errorMessage: 'Gradio DISABLED — Direct HF Inference is primary — HF_PRIMARY_FAILED if HF down — no Pollinations', retryable: false, provider: this.providerId, requestId: request.requestId };
  }
}

export class HfInferenceProvider extends HfDirectFluxProvider {}

export class ImageGenerationService {
  private providers: ImageGenerationProvider[];
  private primaryProvider: ImageGenerationProvider;
  constructor(providers?: ImageGenerationProvider[]) {
    if (providers) {
      this.providers = providers;
      this.primaryProvider = providers[0];
    } else {
      this.primaryProvider = new HfDirectFluxProvider('black-forest-labs/FLUX.1-schnell', 60000);
      this.providers = [this.primaryProvider];
    }
  }

  async generateWithFallback(request: NormalizedGenerationRequest, signal?: AbortSignal, timeoutMs: number = 60000): Promise<ProviderResult & { triedProviders: string[] }> {
    const tried: string[] = [];
    let lastError: any = null;
    console.log(`[ImageGenerationService] DIRECT HF INFERENCE ONLY — NO POLLINATIONS — primary https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell + router.huggingface.co/fal-ai/fal-ai/flux/schnell — steps 8 guidance 3.5 — retry 503 every 5s max 3x — honest FAILED if HF fails`);
    for (const provider of this.providers) {
      const name = `${provider.providerId}:${(provider as any).modelId || 'unknown'}`;
      tried.push(name);
      if (signal?.aborted) {
        return { ok: false, errorCode: 'CANCELLED', errorMessage: 'Cancelled', retryable: false, requestId: request.requestId, triedProviders: tried } as any;
      }
      try {
        const timeoutPromise = new Promise<ProviderResult>((_, reject) => setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms ${name}`)), timeoutMs));
        const result = await Promise.race([provider.generate(request, signal), timeoutPromise]) as any;
        if (result.ok) {
          console.log(`[ImageGenerationService] SUCCESS via ${name} — ArrayBuffer/Base64 — HF ONLY`);
          return { ...result, triedProviders: tried } as any;
        }
        lastError = result;
        console.warn(`[ImageGenerationService] FAILED ${name}: ${lastError.errorCode} ${lastError.errorMessage?.slice(0,200)} — HF_PRIMARY_FAILED honest, no Pollinations`);
        continue;
      } catch (err: any) {
        lastError = { errorCode: err.message.includes('Timeout') ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE', errorMessage: `${name} exception: ${err.message} — HF_PRIMARY_FAILED`, retryable: true, provider: provider.providerId, requestId: request.requestId };
        console.warn(`[ImageGenerationService] EXCEPTION ${name}: ${err.message} — HF_PRIMARY_FAILED`);
        continue;
      }
    }
    return {
      ok: false,
      errorCode: lastError?.errorCode || 'PROVIDER_UNAVAILABLE',
      errorMessage: `HF_PRIMARY_FAILED — All HF providers failed after ${tried.length} — Direct HF Inference primary https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell steps 8 guidance 3.5 retry 503 every 5s max 3x — Last: ${lastError?.errorMessage} — No Pollinations fallback — honest FAILED`,
      retryable: true,
      requestId: request.requestId,
      triedProviders: tried,
      details: { triedProviders: tried, lastError },
    } as any;
  }

  async generateWithRetry(request: NormalizedGenerationRequest, signal?: AbortSignal, maxAttempts: number = 3, baseDelayMs: number = 5000): Promise<ProviderResult & { attempts: number; triedProviders: string[] }> {
    let attempt = 0;
    let lastResult: any = null;
    const allTried: string[] = [];
    while (attempt < maxAttempts) {
      attempt++;
      if (signal?.aborted) return { ok: false, errorCode: 'CANCELLED', errorMessage: 'Cancelled', retryable: false, requestId: request.requestId, attempts: attempt, triedProviders: allTried } as any;
      console.log(`[ImageGenerationService] RETRY LOGIC Direct HF Inference ONLY Attempt ${attempt}/${maxAttempts} — steps 8 guidance 3.5 — NO POLLINATIONS`);
      const result = await this.generateWithFallback(request, signal, 60000);
      if (result.triedProviders) allTried.push(...result.triedProviders);
      if (result.ok) return { ...result, attempts: attempt, triedProviders: allTried } as any;
      lastResult = result;
      if ((result as any).errorCode === 'INVALID_INPUT' || (result as any).errorCode === 'AUTHENTICATION_FAILED' || (result as any).errorCode === 'REFERENCE_MISSING') {
        console.log(`[ImageGenerationService] Non-retryable ${(result as any).errorCode}`);
        break;
      }
      if (attempt < maxAttempts) {
        console.log(`[ImageGenerationService] Retryable ${(result as any).errorCode}, waiting ${baseDelayMs}ms`);
        await new Promise(r => setTimeout(r, baseDelayMs));
      }
    }
    return { ...lastResult, attempts: attempt, triedProviders: allTried } as any;
  }
}

export const imageGenerationService = new ImageGenerationService();
