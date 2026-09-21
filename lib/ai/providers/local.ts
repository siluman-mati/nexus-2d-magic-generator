// lib/ai/providers/local.ts - FALLBACK LOCAL / OLLAMA - DEV ONLY - TAHAP 1 HARDENING
// IMPORTANT: Never use localhost in Vercel production - this is dev fallback only
import { NexusGenerateOptions, NexusGenerateResult } from '../types'
import { getLocalConfig, getNexusBrainConfig, isVercelProduction, isVercel } from '../../config'
import { 
  fetchWithTimeout, 
  retryWithBackoff, 
  safeLog, 
  safeErrorLog, 
  ProviderTimeoutError,
  ProviderNetworkError,
  ProviderServerError,
  classifyProviderError
} from '../provider-utils'

export async function generateWithLocal(options: NexusGenerateOptions): Promise<NexusGenerateResult> {
  const config = getLocalConfig()
  const brainConfig = getNexusBrainConfig()

  if (!config.configured) {
    safeLog('LOCAL', 'Not configured - LOCAL_AI_ENABLED not set')
    return {
      ok: false,
      provider: 'local',
      model: config.model,
      role: 'FALLBACK_LOCAL',
      fallbackChain: ['local'],
      triedProviders: [{ id: 'local', status: 'UNCONFIGURED', error: 'LOCAL_AI not configured. Set LOCAL_AI_ENABLED=true and LOCAL_AI_URL' }],
      nexusBrainUsed: true,
      error: 'Local AI belum dikonfigurasi. Untuk production Vercel, gunakan Groq atau OpenRouter.',
    }
  }

  // Vercel production: localhost is NEVER available
  if (isVercelProduction() && config.isLocalhost) {
    safeLog('LOCAL', 'Skipped - localhost not available in Vercel production')
    return {
      ok: false,
      provider: 'local',
      model: config.model,
      role: 'FALLBACK_LOCAL',
      fallbackChain: ['local'],
      triedProviders: [{ id: 'local', status: 'SKIPPED', error: 'Localhost not available in Vercel production' }],
      nexusBrainUsed: true,
      error: 'Local AI (localhost) tidak tersedia di production Vercel. Gunakan GROQ_API_KEY atau OPENROUTER_API_KEY.',
    }
  }

  // Vercel preview: localhost also not available
  if (isVercel() && config.isLocalhost && process.env.LOCAL_AI_ENABLED !== 'true') {
    safeLog('LOCAL', 'Skipped - localhost not available in Vercel preview without explicit enable')
    return {
      ok: false,
      provider: 'local',
      model: config.model,
      role: 'FALLBACK_LOCAL',
      fallbackChain: ['local'],
      triedProviders: [{ id: 'local', status: 'SKIPPED', error: 'Localhost not available in Vercel' }],
      nexusBrainUsed: true,
      error: 'Local AI (localhost) tidak tersedia di Vercel. Gunakan cloud providers.',
    }
  }

  if (!config.enabled) {
    safeLog('LOCAL', `Disabled - ${config.disabledReason || 'not enabled'}`)
    return {
      ok: false,
      provider: 'local',
      model: config.model,
      role: 'FALLBACK_LOCAL',
      fallbackChain: ['local'],
      triedProviders: [{ id: 'local', status: 'DISABLED', error: config.disabledReason || 'Local AI disabled' }],
      nexusBrainUsed: true,
      error: config.disabledReason || 'Local AI disabled',
    }
  }

  const model = options.preferredModel || config.model
  const timeoutMs = brainConfig.timeoutMs

  safeLog('LOCAL', `Generating (fallback dev) - Model: ${model} - URL: ${config.url} - Timeout: ${timeoutMs}ms - Request: ${options.requestId || 'unknown'}`)

  const execute = async (): Promise<NexusGenerateResult> => {
    try {
      const baseUrl = config.url.replace(/\/$/, '')
      const openaiCompatUrl = baseUrl + '/v1/chat/completions'
      const ollamaUrl = baseUrl + '/api/generate'

      let response: Response
      let isOllama = false

      try {
        response = await fetchWithTimeout(openaiCompatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        
        if (response.status === 404) {
          throw new Error('OpenAI compat not found, try Ollama')
        }
      } catch (err: any) {
        if (err instanceof ProviderTimeoutError) throw err
        // Fallback to Ollama native API
        isOllama = true
        safeLog('LOCAL', 'OpenAI compat failed, trying Ollama native API')
        response = await fetchWithTimeout(ollamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt,
            stream: false,
            options: {
              temperature: options.temperature ?? 0.7,
              num_predict: options.maxTokens ?? 4096,
            },
          }),
        }, timeoutMs)
      }

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Local AI error ${response.status}: ${errText.slice(0, 500)}`)
      }

      const data = await response.json()
      const text = isOllama ? data.response : data.choices?.[0]?.message?.content

      if (!text) {
        throw new Error('Local AI returned empty response')
      }

      safeLog('LOCAL', `SUCCESS (fallback dev) - Model: ${model} - Request: ${options.requestId || 'unknown'}`)

      return {
        ok: true,
        text,
        provider: 'local',
        model,
        role: 'FALLBACK_LOCAL',
        fallbackChain: ['local'],
        triedProviders: [{ id: 'local', status: 'SUCCESS' }],
        nexusBrainUsed: true,
      }
    } catch (err: any) {
      if (err instanceof ProviderTimeoutError) {
        safeErrorLog('LOCAL', `Timeout after ${timeoutMs}ms`, err)
        throw new ProviderTimeoutError('local', timeoutMs)
      }
      if (err instanceof ProviderNetworkError) {
        safeErrorLog('LOCAL', 'Network error', err)
        throw err
      }
      if (err instanceof ProviderServerError) {
        safeErrorLog('LOCAL', `Server error ${err.status}`, err)
        throw err
      }
      safeErrorLog('LOCAL', 'Request failed', err)
      throw err
    }
  }

  try {
    // Local gets fewer retries (it's dev only)
    return await retryWithBackoff(execute, 'local', Math.min(brainConfig.maxAttempts, 2), 1000)
  } catch (err: any) {
    const classification = classifyProviderError(err)

    let status: string = 'ERROR'
    switch (classification) {
      case 'TEMPORARY_FAILURE':
        status = 'TEMPORARY_FAILURE'
        break
      case 'PROVIDER_ERROR':
        status = 'PROVIDER_ERROR'
        break
      default:
        status = classification
        break
    }

    return {
      ok: false,
      provider: 'local',
      model,
      role: 'FALLBACK_LOCAL',
      fallbackChain: ['local'],
      triedProviders: [{ 
        id: 'local', 
        status, 
        error: err.message?.slice(0, 500) 
      }],
      nexusBrainUsed: true,
      error: classification === 'TEMPORARY_FAILURE'
        ? `Local AI temporary failure (timeout/network) after ${timeoutMs}ms - ${err.message?.slice(0, 200)}`
        : err.message?.slice(0, 500),
    }
  }
}

export function isLocalConfigured(): boolean {
  return getLocalConfig().configured
}
