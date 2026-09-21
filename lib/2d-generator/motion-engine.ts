// lib/2d-generator/motion-engine.ts — NEXUS STEP 4 Motion Engine — Gradio CogVideoX / SVD I2V
// PRIMARY: Gradio Client @gradio/client — THUDM/CogVideoX-5B + Wan + SVD fallbacks
// NO Pollinations — honest MOTION_ENGINE_FAILED

import { Client, handle_file } from '@gradio/client';

export const MOTION_ENGINE_LABEL = 'Motion Engine: Gradio CogVideoX / SVD I2V (Dynamic)';
export const MOTION_ENGINE_VERSION = 'v4-cogvideox-svd';

export interface MotionEngineSpaces {
  primary: string;
  fallbacks: string[];
}

export const DEFAULT_MOTION_SPACES: MotionEngineSpaces = {
  primary: process.env.HUGGINGFACE_I2V_SPACE_ID || process.env.HF_I2V_SPACE_ID || 'zai-org/CogVideoX-5B-Space',
  fallbacks: [
    process.env.HUGGINGFACE_I2V_FALLBACK_1 || 'Wan-AI/Wan2.1-I2V-14B-720P',
    process.env.HUGGINGFACE_I2V_FALLBACK_2 || 'THUDM/CogVideoX-5B',
    process.env.HUGGINGFACE_I2V_FALLBACK_3 || 'multimodalart/stable-video-diffusion-img2vid',
    'Lightricks/LTX-Video-13B-distilled',
  ],
};

export interface MotionGenerateRequest {
  imageUrl: string; // base64 dataUrl or http url
  motionPrompt: string;
  duration?: number; // seconds
  seed?: number;
  requestId?: string;
}

export interface MotionGenerateResult {
  ok: boolean;
  videoUrl?: string; // data:video/mp4;base64 or http url
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
  engineLabel: string;
  spaceUsed?: string;
  triedSpaces: string[];
  processingTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  verification?: string;
}

const MOTION_TIMEOUT_MS = 60000;
const RETRY_BACKOFF_MS = 5000;
const MAX_RETRIES_PER_SPACE = 2;

function getAuthToken(): string {
  return process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN || process.env.HUGGING_FACE_API_KEY || process.env.HUNGGING_FACE_API_KEY || '';
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid dataUrl format');
  const mime = match[1];
  const b64 = match[2];
  const buffer = Buffer.from(b64, 'base64');
  return new Blob([buffer], { type: mime });
}

async function urlToBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  if (url.startsWith('data:')) return dataUrlToBlob(url);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed fetch image ${res.status} ${url.slice(0,100)}`);
  const ct = res.headers.get('content-type') || 'image/jpeg';
  const ab = await res.arrayBuffer();
  return new Blob([ab], { type: ct });
}

function extractVideoUrlFromResult(result: any): string | null {
  // Gradio Client returns { data: [...] } where data may contain file objects
  try {
    if (!result) return null;
    // Direct string url
    if (typeof result === 'string' && (result.startsWith('http') || result.startsWith('data:video'))) return result;
    // Common Gradio patterns
    const data = result.data || result;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item) continue;
        if (typeof item === 'string' && (item.includes('.mp4') || item.startsWith('http') || item.startsWith('data:video'))) return item;
        if (item && typeof item === 'object') {
          // { url, path, name }
          if (item.url && typeof item.url === 'string') return item.url;
          if (item.path && typeof item.path === 'string' && item.path.includes('.mp4')) return item.path;
          if (item.video && typeof item.video === 'string') return item.video;
          if (item.file && item.file.url) return item.file.url;
          // Nested data
          if (Array.isArray(item) && item.length > 0) {
            const nested = extractVideoUrlFromResult(item);
            if (nested) return nested;
          }
          // Check values
          for (const v of Object.values(item)) {
            if (typeof v === 'string' && (v.includes('.mp4') || v.startsWith('http') && v.includes('video'))) return v;
            if (v && typeof v === 'object') {
              const inner = extractVideoUrlFromResult(v);
              if (inner) return inner;
            }
          }
        }
      }
    }
    if (typeof data === 'object') {
      if ((data as any).url) return (data as any).url;
      if ((data as any).video) return (data as any).video;
      if ((data as any).video_url) return (data as any).video_url;
      // Search all string values containing mp4 or http
      for (const v of Object.values(data)) {
        if (typeof v === 'string' && (v.includes('.mp4') || v.startsWith('http'))) return v;
      }
    }
  } catch {}
  return null;
}

async function trySpace(
  spaceId: string,
  imageBlob: Blob,
  motionPrompt: string,
  requestId: string,
  signal?: AbortSignal,
  attempt: number = 1
): Promise<{ videoUrl?: string; rawResult?: any; error?: string; endpointTried?: string }> {
  const token = getAuthToken();
  const start = Date.now();
  console.log(`[MotionEngine] [${requestId}] Trying space ${spaceId} attempt ${attempt} — prompt: ${motionPrompt.slice(0,80)} — blob ${imageBlob.size} bytes ${imageBlob.type}`);

  try {
    const client = await Client.connect(spaceId, token ? { hf_token: token as any } : undefined);
    console.log(`[MotionEngine] [${requestId}] Connected to ${spaceId} — client connected`);

    let discoveredEndpoints: string[] = [];
    // Try to view API for dynamic endpoint discovery
    try {
      const apiInfo: any = await (client as any).view_api();
      const apiStr = JSON.stringify(apiInfo);
      console.log(`[MotionEngine] [${requestId}] API info for ${spaceId}: ${apiStr.slice(0,2000)}`);
      // Extract endpoints like "/predict", "/generate", etc from api info
      const matches = apiStr.match(/"\/[a-z_]+"/gi) || [];
      discoveredEndpoints = [...new Set(matches.map((s: string) => s.replace(/"/g, '')))].filter((e: string) => e.length > 1);
      console.log(`[MotionEngine] [${requestId}] Discovered endpoints for ${spaceId}: ${discoveredEndpoints.join(', ')}`);
    } catch (e: any) {
      console.log(`[MotionEngine] [${requestId}] view_api failed for ${spaceId}: ${e.message} — using fallback list`);
    }

    // Prepare file for gradio — handle_file helper expects Blob/File
    const gradioFile = await handle_file(imageBlob);

    // List of common endpoint names to try for I2V — discovered first, then common
    const commonEndpoints = [
      '/predict',
      '/generate',
      '/generate_video',
      '/img2vid',
      '/image_to_video',
      '/i2v',
      '/run',
      '/infer',
      '/video',
      '/on_submit',
      '/submit',
    ];
    const endpointsToTry = [...new Set([...discoveredEndpoints, ...commonEndpoints])];

    // For each endpoint, try with common parameter patterns
    for (const endpoint of endpointsToTry) {
      if (signal?.aborted) throw new Error('Cancelled');
      try {
        console.log(`[MotionEngine] [${requestId}] Attempt endpoint ${endpoint} on ${spaceId}`);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${MOTION_TIMEOUT_MS}ms endpoint ${endpoint}`)), MOTION_TIMEOUT_MS));

        const predictPromise = (async () => {
          // Try different arg structures
          // Attempt 1: [image, prompt] — most common for I2V (Wan, CogVideoX I2V)
          try {
            const result = await client.predict(endpoint, [gradioFile, motionPrompt]);
            return result;
          } catch (e1: any) {
            console.log(`[MotionEngine] [${requestId}] ${endpoint} [image,prompt] failed: ${e1.message.slice(0,250)}`);
            // Attempt 2: [prompt, image]
            try {
              const result = await client.predict(endpoint, [motionPrompt, gradioFile]);
              return result;
            } catch (e2: any) {
              console.log(`[MotionEngine] [${requestId}] ${endpoint} [prompt,image] failed: ${e2.message.slice(0,250)}`);
              // Attempt 3: [image, prompt, num_frames, guidance] — CogVideoX variant
              try {
                const result = await client.predict(endpoint, [gradioFile, motionPrompt, 49, 6, 8]);
                return result;
              } catch (e3: any) {
                console.log(`[MotionEngine] [${requestId}] ${endpoint} [image,prompt,49,6,8] failed: ${e3.message.slice(0,250)}`);
                // Attempt 4: object style
                try {
                  const result = await client.predict(endpoint, { image: gradioFile, prompt: motionPrompt } as any);
                  return result;
                } catch (e4: any) {
                  console.log(`[MotionEngine] [${requestId}] ${endpoint} {image,prompt} failed: ${e4.message.slice(0,250)}`);
                  // Attempt 5: SVD style [image, motion_bucket_id, fps, seed, steps]
                  try {
                    const result = await client.predict(endpoint, [gradioFile, 127, 6, 42, 25]);
                    return result;
                  } catch (e5: any) {
                    // Attempt 6: Wan style [image, prompt, 720, 1280, 5, 81, 8.0] etc
                    try {
                      const result = await client.predict(endpoint, [gradioFile, motionPrompt, 720, 1280, 5]);
                      return result;
                    } catch (e6: any) {
                      throw e1; // throw original for logging
                    }
                  }
                }
              }
            }
          }
        })();

        const result: any = await Promise.race([predictPromise, timeoutPromise]);
        console.log(`[MotionEngine] [${requestId}] Raw result from ${spaceId}${endpoint}: ${JSON.stringify(result).slice(0,2000)}`);

        const videoUrl = extractVideoUrlFromResult(result);
        if (videoUrl) {
          console.log(`[MotionEngine] [${requestId}] SUCCESS ${spaceId}${endpoint} — videoUrl ${videoUrl.slice(0,200)} — time ${Date.now() - start}ms`);
          return { videoUrl, rawResult: result, endpointTried: endpoint };
        } else {
          console.warn(`[MotionEngine] [${requestId}] No videoUrl extracted from ${spaceId}${endpoint} — trying next endpoint`);
          continue;
        }
      } catch (epErr: any) {
        console.warn(`[MotionEngine] [${requestId}] Endpoint ${endpoint} failed on ${spaceId}: ${epErr.message.slice(0,400)}`);
        continue;
      }
    }

    return { error: `No working endpoint found on ${spaceId} after trying ${endpointsToTry.length} endpoints (${endpointsToTry.join(', ')})` };
  } catch (err: any) {
    if (err.name === 'AbortError' || signal?.aborted) throw new Error('Cancelled');
    console.error(`[MotionEngine] [${requestId}] Space ${spaceId} failed: ${err.message}`);
    return { error: `${spaceId} failed: ${err.message}` };
  }
}

export async function generateMotionVideo(
  request: MotionGenerateRequest,
  signal?: AbortSignal
): Promise<MotionGenerateResult> {
  const requestId = request.requestId || `motion_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const start = Date.now();
  const motionPrompt = request.motionPrompt?.trim() || 'subtle camera zoom, character blinking, natural motion, cinematic, smooth movement';
  const spaces = [DEFAULT_MOTION_SPACES.primary, ...DEFAULT_MOTION_SPACES.fallbacks];
  const triedSpaces: string[] = [];

  console.log(`[MotionEngine] [${requestId}] START — imageUrl ${request.imageUrl.slice(0,80)}... — motionPrompt "${motionPrompt}" — spaces ${spaces.join(', ')}`);

  if (!request.imageUrl) {
    return {
      ok: false,
      errorCode: 'INVALID_INPUT',
      errorMessage: 'imageUrl required — base64 or http url from Step 3 Canonical Keyframe',
      engineLabel: MOTION_ENGINE_LABEL,
      triedSpaces,
      processingTimeMs: Date.now() - start,
      verification: 'FAILED — missing image',
    };
  }

  // Convert imageUrl to Blob
  let imageBlob: Blob;
  try {
    imageBlob = await urlToBlob(request.imageUrl, signal);
    console.log(`[MotionEngine] [${requestId}] Image blob ready ${imageBlob.size} bytes ${imageBlob.type}`);
    if (imageBlob.size < 100) throw new Error(`Image blob too small ${imageBlob.size}`);
  } catch (e: any) {
    return {
      ok: false,
      errorCode: 'INVALID_INPUT',
      errorMessage: `Failed to load imageUrl: ${e.message}`,
      engineLabel: MOTION_ENGINE_LABEL,
      triedSpaces,
      processingTimeMs: Date.now() - start,
      verification: 'FAILED — image load failed',
    };
  }

  if (signal?.aborted) {
    return {
      ok: false,
      errorCode: 'CANCELLED',
      errorMessage: 'Cancelled',
      engineLabel: MOTION_ENGINE_LABEL,
      triedSpaces,
      processingTimeMs: Date.now() - start,
    };
  }

  let lastError = '';
  for (const spaceId of spaces) {
    triedSpaces.push(spaceId);
    let attempt = 0;
    while (attempt < MAX_RETRIES_PER_SPACE) {
      attempt++;
      if (signal?.aborted) {
        return {
          ok: false,
          errorCode: 'CANCELLED',
          errorMessage: 'Cancelled',
          engineLabel: MOTION_ENGINE_LABEL,
          triedSpaces,
          processingTimeMs: Date.now() - start,
        };
      }
      try {
        const result = await trySpace(spaceId, imageBlob, motionPrompt, requestId, signal, attempt);
        if (result.videoUrl) {
          let finalVideoUrl = result.videoUrl;
          // If videoUrl is remote http, try to fetch and convert to base64 for persistence? But keep url for playback
          // For Vercel, we return url as is, but also attempt to fetch as base64 if it's HF temp file
          // To ensure playback works, we keep remote url, but also note processing time
          const processingTimeMs = Date.now() - start;
          console.log(`[MotionEngine] [${requestId}] COMPLETED — space ${spaceId} — videoUrl len ${finalVideoUrl.length} — time ${processingTimeMs}ms`);

          return {
            ok: true,
            videoUrl: finalVideoUrl,
            mimeType: 'video/mp4',
            duration: request.duration || 6,
            engineLabel: MOTION_ENGINE_LABEL,
            spaceUsed: spaceId,
            triedSpaces,
            processingTimeMs,
            verification: `COMPLETED via Gradio Client ${spaceId} — Motion Engine CogVideoX/SVD — no Pollinations`,
          };
        } else {
          lastError = result.error || `No video from ${spaceId}`;
          console.warn(`[MotionEngine] [${requestId}] Space ${spaceId} attempt ${attempt} failed: ${lastError} — retry backoff ${RETRY_BACKOFF_MS}ms`);
          if (attempt < MAX_RETRIES_PER_SPACE) {
            await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
            continue;
          }
          break;
        }
      } catch (e: any) {
        lastError = e.message;
        console.warn(`[MotionEngine] [${requestId}] Space ${spaceId} exception attempt ${attempt}: ${lastError}`);
        if (attempt < MAX_RETRIES_PER_SPACE) {
          await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
          continue;
        }
        break;
      }
    }
    console.log(`[MotionEngine] [${requestId}] Trying next fallback after ${spaceId} failed — lastError ${lastError.slice(0,100)}`);
  }

  const processingTimeMs = Date.now() - start;
  console.error(`[MotionEngine] [${requestId}] ALL SPACES FAILED after ${triedSpaces.length} spaces — lastError ${lastError} — MOTION_ENGINE_FAILED honest`);

  return {
    ok: false,
    errorCode: 'MOTION_ENGINE_FAILED',
    errorMessage: `MOTION_ENGINE_FAILED — All Gradio I2V spaces failed after trying ${triedSpaces.length} spaces (${triedSpaces.join(', ')}) — last: ${lastError} — timeout ${MOTION_TIMEOUT_MS}ms retry ${MAX_RETRIES_PER_SPACE}x backoff ${RETRY_BACKOFF_MS}ms — no Pollinations fallback — honest FAILED — Try: Check Space status at https://huggingface.co/spaces/${DEFAULT_MOTION_SPACES.primary} — or set HUGGINGFACE_I2V_SPACE_ID env`,
    engineLabel: MOTION_ENGINE_LABEL,
    triedSpaces,
    processingTimeMs,
    retryable: true,
    verification: 'FAILED — MOTION_ENGINE_FAILED — no Pollinations — honest error',
  };
}
