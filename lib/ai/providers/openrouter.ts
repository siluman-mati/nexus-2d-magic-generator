// lib/ai/providers/openrouter.ts - FALLBACK CLOUD with timeout, retry, AUTO-ROTATING FREE MODELS - RESILIENT
// Implements exponential backoff + rotation between free models: meta-llama/llama-3.2-1b-instruct:free, google/gemma-2-9b-it:free etc
import { NexusGenerateOptions, NexusGenerateResult } from '../types'
import { getOpenRouterConfig, getNexusBrainConfig } from '../../config'
import { OPENROUTER_FREE_MODELS } from '../types'
import { 
  fetchWithTimeout, 
  retryWithBackoff, 
  safeLog, 
  safeErrorLog, 
  ProviderTimeoutError, 
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderServerError,
  ProviderNetworkError,
  classifyProviderError
} from '../provider-utils'

export async function generateWithOpenRouter(options: NexusGenerateOptions): Promise<NexusGenerateResult> {
  const config = getOpenRouterConfig()
  const brainConfig = getNexusBrainConfig()

  if (!config.configured || !config.apiKey) {
    safeLog('OPENROUTER', 'Not configured - OPENROUTER_API_KEY missing')
    return {
      ok: false,
      provider: 'openrouter',
      model: config.model,
      role: 'FALLBACK_CLOUD',
      fallbackChain: ['openrouter'],
      triedProviders: [{ id: 'openrouter', status: 'UNCONFIGURED', error: 'OPENROUTER_API_KEY not configured' }],
      nexusBrainUsed: true,
      error: 'OPENROUTER_API_KEY belum dikonfigurasi. Set OPENROUTER_API_KEY di environment variables.',
    }
  }

  const timeoutMs = brainConfig.timeoutMs
  const requestId = options.requestId || `or-${Date.now()}`

  // Build list of models to try — primary + free rotating models
  const primaryModel = options.preferredModel || config.model
  const freeModels = OPENROUTER_FREE_MODELS
  // Ensure primary is first, then free models without duplicates
  const modelsToTry = [primaryModel, ...freeModels.filter(m => m !== primaryModel)].slice(0, 5)

  safeLog('OPENROUTER', `Generating (fallback) with AUTO-ROTATING FREE MODELS — Primary: ${primaryModel} — Rotation: ${modelsToTry.join(', ')} — Timeout: ${timeoutMs}ms — Request: ${requestId} — Exponential backoff enabled`)

  let lastError: any = null
  const triedModels: string[] = []

  for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
    const model = modelsToTry[modelIndex]
    triedModels.push(model)

    const execute = async (): Promise<NexusGenerateResult> => {
      try {
        safeLog('OPENROUTER', `Trying model ${modelIndex+1}/${modelsToTry.length}: ${model} — Request: ${requestId}`)
        const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://2d-magic-generator.vercel.app',
            'X-Title': '2D Magic Generator - NEXUS Brain',
          },
          body: JSON.stringify({
            model,
            messages: [
              ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
              { role: 'user', content: options.prompt },
            ],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 4096,
          }),
        }, timeoutMs)

        if (!response.ok) {
          const errText = await response.text()
          const status = response.status

          if (status === 401 || status === 403) {
            throw new ProviderAuthError('openrouter', `OpenRouter auth failed ${status}: Invalid API key — model ${model}`)
          }

          if (status === 429) {
            throw new ProviderRateLimitError('openrouter', `OpenRouter rate limited ${status} for ${model}: ${errText.slice(0, 300)}`)
          }

          if (status === 500 || status === 502 || status === 503 || status === 504) {
            throw new ProviderServerError('openrouter', status, `OpenRouter server error ${status} for ${model}: ${errText.slice(0, 300)}`)
          }

          throw new Error(`OpenRouter API error ${status} for ${model}: ${errText.slice(0, 500)}`)
        }

        const data = await response.json()
        const text = data.choices?.[0]?.message?.content || ''

        if (!text) {
          throw new Error(`OpenRouter returned empty response for ${model}`)
        }

        safeLog('OPENROUTER', `SUCCESS (fallback) via rotation — Model: ${model} (${modelIndex+1}/${modelsToTry.length}) — Tokens: ${data.usage?.total_tokens || 'unknown'} — Request: ${requestId}`)

        return {
          ok: true,
          text,
          provider: 'openrouter',
          model,
          role: 'FALLBACK_CLOUD',
          fallbackChain: ['openrouter'],
          triedProviders: [{ id: 'openrouter', status: 'SUCCESS' }],
          nexusBrainUsed: true,
          usage: {
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
            totalTokens: data.usage?.total_tokens,
          },
        }
      } catch (err: any) {
        if (err instanceof ProviderTimeoutError) {
          safeErrorLog('OPENROUTER', `Timeout after ${timeoutMs}ms for ${model}`, err)
          throw new ProviderTimeoutError('openrouter', timeoutMs)
        }
        if (err instanceof ProviderAuthError) {
          safeErrorLog('OPENROUTER', `Auth error for ${model}`, err)
          throw err
        }
        if (err instanceof ProviderRateLimitError) {
          safeErrorLog('OPENROUTER', `Rate limited for ${model}`, err)
          throw err
        }
        if (err instanceof ProviderServerError) {
          safeErrorLog('OPENROUTER', `Server error ${err.status} for ${model}`, err)
          throw err
        }
        if (err instanceof ProviderNetworkError) {
          safeErrorLog('OPENROUTER', `Network error for ${model}`, err)
          throw new ProviderNetworkError('openrouter', err.message)
        }
        safeErrorLog('OPENROUTER', `Request failed for ${model}`, err)
        throw err
      }
    }

    try {
      // Exponential backoff retry per model — 1s, 2s, 4s
      return await retryWithBackoff(execute, `openrouter:${model}`, brainConfig.maxAttempts, 1000)
    } catch (err: any) {
      lastError = err
      const classification = classifyProviderError(err)

      // If auth failed, don't try other models — key invalid
      if (classification === 'AUTH_FAILED') {
        safeErrorLog('OPENROUTER', `AUTH_FAILED for ${model} — not rotating to other free models — key invalid — Request: ${requestId}`, err.message)
        break
      }

      // For rate limited / temporary / provider error — rotate to next free model
      safeLog('OPENROUTER', `Model ${model} failed ${classification} — rotating to next free model (${modelIndex+1}/${modelsToTry.length}) — Request: ${requestId} — Error: ${err.message?.slice(0,150)}`)
      
      // Small delay before next model rotation
      if (modelIndex < modelsToTry.length - 1) {
        const rotationDelay = 500 * (modelIndex + 1) // 500ms, 1000ms, 1500ms...
        await new Promise(r => setTimeout(r, rotationDelay))
        continue
      }
    }
  }

  // All rotated models failed
  const err: any = lastError || new Error('All OpenRouter free models failed')
  const classification = classifyProviderError(err)

  let status: string = 'ERROR'
  let userError: string = err.message?.slice(0, 500)

  switch (classification) {
    case 'AUTH_FAILED':
      status = 'AUTH_FAILED'
      userError = `OpenRouter auth failed - periksa OPENROUTER_API_KEY - Tried models: ${triedModels.join(', ')} - ${err.message?.slice(0, 200)}`
      break
    case 'RATE_LIMITED':
      status = 'RATE_LIMITED'
      userError = `OpenRouter rate limited (429) after rotating ${triedModels.length} free models (${triedModels.join(', ')}) — quota habis — mencoba fallback Google/Free-LLM — ${err.message?.slice(0, 200)}`
      break
    case 'TEMPORARY_FAILURE':
      status = 'TEMPORARY_FAILURE'
      userError = `OpenRouter temporary failure after rotating ${triedModels.length} models (${triedModels.join(', ')}) — timeout/network — mencoba fallback Google/Free-LLM — ${err.message?.slice(0, 200)}`
      break
    case 'PROVIDER_ERROR':
      status = 'PROVIDER_ERROR'
      userError = `OpenRouter provider error after rotating ${triedModels.length} models — server error — mencoba fallback Google/Free-LLM — ${err.message?.slice(0, 200)}`
      break
    default:
      status = classification === 'NOT_CONFIGURED' ? 'UNCONFIGURED' : 'ERROR'
      userError = `OpenRouter failed after rotating ${triedModels.length} free models (${triedModels.join(', ')}) — ${err.message?.slice(0, 300)} — mencoba fallback Google/Free-LLM`
      break
  }

  return {
    ok: false,
    provider: 'openrouter',
    model: triedModels[0] || 'openrouter',
    role: 'FALLBACK_CLOUD',
    fallbackChain: ['openrouter'],
    triedProviders: [{ 
      id: 'openrouter', 
      status, 
      error: `${userError} — Tried: ${triedModels.join(' -> ')}`
    }],
    nexusBrainUsed: true,
    error: userError,
  }
}

export function isOpenRouterConfigured(): boolean {
  return getOpenRouterConfig().configured
}
