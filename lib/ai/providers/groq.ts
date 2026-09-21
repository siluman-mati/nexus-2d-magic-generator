// lib/ai/providers/groq.ts - PRIMARY provider with timeout, retry, safe logging - TAHAP 1 HARDENING
// Error classification: NOT_CONFIGURED, AUTH_FAILED, RATE_LIMITED, TEMPORARY_FAILURE, PROVIDER_ERROR
import { NexusGenerateOptions, NexusGenerateResult } from '../types'
import { getGroqConfig, getNexusBrainConfig } from '../../config'
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

export async function generateWithGroq(options: NexusGenerateOptions): Promise<NexusGenerateResult> {
  const config = getGroqConfig()
  const brainConfig = getNexusBrainConfig()
  
  if (!config.configured || !config.apiKey) {
    safeLog('GROQ', 'Not configured - GROQ_API_KEY missing')
    return {
      ok: false,
      provider: 'groq',
      model: config.model,
      role: 'PRIMARY',
      fallbackChain: ['groq'],
      triedProviders: [{ id: 'groq', status: 'UNCONFIGURED', error: 'GROQ_API_KEY not configured' }],
      nexusBrainUsed: true,
      error: 'GROQ_API_KEY belum dikonfigurasi. Set GROQ_API_KEY di environment variables Vercel.',
    }
  }

  const model = options.preferredModel || config.model
  const timeoutMs = brainConfig.timeoutMs

  safeLog('GROQ', `Generating - Model: ${model} - Timeout: ${timeoutMs}ms - Request: ${options.requestId || 'unknown'}`)

  const execute = async (): Promise<NexusGenerateResult> => {
    try {
      const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
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

        // Auth errors should not be retried - 401/403
        if (status === 401 || status === 403) {
          throw new ProviderAuthError('groq', `Groq auth failed ${status}: Invalid API key`)
        }

        // Rate limit - 429
        if (status === 429) {
          throw new ProviderRateLimitError('groq', `Groq rate limited ${status}: ${errText.slice(0, 300)}`)
        }

        // Server errors - 500/502/503/504
        if (status === 500 || status === 502 || status === 503 || status === 504) {
          throw new ProviderServerError('groq', status, `Groq server error ${status}: ${errText.slice(0, 300)}`)
        }

        throw new Error(`Groq API error ${status}: ${errText.slice(0, 500)}`)
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content || ''

      if (!text) {
        throw new Error('Groq returned empty response')
      }

      safeLog('GROQ', `SUCCESS - Model: ${model} - Tokens: ${data.usage?.total_tokens || 'unknown'} - Request: ${options.requestId || 'unknown'}`)

      return {
        ok: true,
        text,
        provider: 'groq',
        model,
        role: 'PRIMARY',
        fallbackChain: ['groq'],
        triedProviders: [{ id: 'groq', status: 'SUCCESS' }],
        nexusBrainUsed: true,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        },
      }
    } catch (err: any) {
      // Preserve classified errors
      if (err instanceof ProviderTimeoutError) {
        safeErrorLog('GROQ', `Timeout after ${timeoutMs}ms`, err)
        throw new ProviderTimeoutError('groq', timeoutMs)
      }
      if (err instanceof ProviderAuthError) {
        safeErrorLog('GROQ', 'Auth error', err)
        throw err
      }
      if (err instanceof ProviderRateLimitError) {
        safeErrorLog('GROQ', 'Rate limited', err)
        throw err
      }
      if (err instanceof ProviderServerError) {
        safeErrorLog('GROQ', `Server error ${err.status}`, err)
        throw err
      }
      if (err instanceof ProviderNetworkError) {
        safeErrorLog('GROQ', 'Network error', err)
        throw new ProviderNetworkError('groq', err.message)
      }
      safeErrorLog('GROQ', 'Request failed', err)
      throw err
    }
  }

  try {
    // ENHANCED: Exponential backoff retry for Groq rate limits — 1s, 2s, 4s, 8s
    // When 429 hits, retry with backoff, then fallback to OpenRouter free rotation
    const maxAttempts = Math.max(brainConfig.maxAttempts, 3) // at least 3 attempts for rate limit resilience
    safeLog('GROQ', `Starting with exponential backoff — maxAttempts ${maxAttempts} — baseDelay 1000ms — Request: ${options.requestId || 'unknown'} — Will retry on 429 RATE_LIMITED with 1s,2s,4s backoff`)
    return await retryWithBackoff(execute, 'groq', maxAttempts, 1000)
  } catch (err: any) {
    const classification = classifyProviderError(err)

    // Map to status per TAHAP 1 spec
    let status: string = 'ERROR'
    let userError: string = err.message?.slice(0, 500)

    switch (classification) {
      case 'AUTH_FAILED':
        status = 'AUTH_FAILED'
        userError = `Groq auth failed - periksa GROQ_API_KEY di Vercel env - ${err.message?.slice(0, 200)}`
        break
      case 'RATE_LIMITED':
        status = 'RATE_LIMITED'
        userError = `Groq rate limited (429) - quota habis atau rate limit - mencoba fallback OpenRouter - ${err.message?.slice(0, 200)}`
        break
      case 'TEMPORARY_FAILURE':
        status = 'TEMPORARY_FAILURE'
        userError = `Groq temporary failure (timeout/network) after ${timeoutMs}ms - mencoba fallback OpenRouter - ${err.message?.slice(0, 200)}`
        break
      case 'PROVIDER_ERROR':
        status = 'PROVIDER_ERROR'
        userError = `Groq provider error (500/502/503/504) - server error - mencoba fallback OpenRouter - ${err.message?.slice(0, 200)}`
        break
      default:
        status = classification === 'NOT_CONFIGURED' ? 'UNCONFIGURED' : 'ERROR'
        break
    }

    return {
      ok: false,
      provider: 'groq',
      model,
      role: 'PRIMARY',
      fallbackChain: ['groq'],
      triedProviders: [{ 
        id: 'groq', 
        status, 
        error: err.message?.slice(0, 500) 
      }],
      nexusBrainUsed: true,
      error: userError,
    }
  }
}

export function isGroqConfigured(): boolean {
  return getGroqConfig().configured
}
