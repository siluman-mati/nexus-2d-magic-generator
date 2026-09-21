// lib/ai/providers/gemini.ts - GOOGLE AI / GEMINI provider
// Perbaikan terbatas: deteksi provider aktif urutan GROQ -> OPENROUTER -> GOOGLE_AI_API_KEY
// Support GOOGLE_AI_API_KEY (new), GOOGLE_API_KEY, GEMINI_API_KEY
// Error handling: timeout, invalid key (401/403), quota habis (429)

import { getGeminiConfig, getGoogleAIConfig, getNexusBrainConfig } from '../../config'
import { NexusGenerateOptions, NexusGenerateResult } from '../types'
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

export async function generateWithGeminiLegacy(options: NexusGenerateOptions): Promise<NexusGenerateResult> {
  const config = getGeminiConfig()
  const brainConfig = getNexusBrainConfig()

  if (!config.configured || !config.apiKey) {
    safeLog('GEMINI', 'Not configured - GOOGLE_AI_API_KEY / GEMINI_API_KEY missing')
    return {
      ok: false,
      provider: 'gemini',
      model: config.model,
      role: 'LEGACY',
      fallbackChain: ['gemini'],
      triedProviders: [{ id: 'gemini', status: 'UNCONFIGURED', error: 'GOOGLE_AI_API_KEY not configured' }],
      nexusBrainUsed: false,
      error: 'Gemini: GOOGLE_AI_API_KEY belum dikonfigurasi. Set GOOGLE_AI_API_KEY di environment variables.',
    }
  }

  const model = options.preferredModel || config.model
  const timeoutMs = brainConfig.timeoutMs

  safeLog('GEMINI', `Generating - Model: ${model} - Timeout: ${timeoutMs}ms - Request: ${options.requestId || 'unknown'}`)

  const execute = async (): Promise<NexusGenerateResult> => {
    try {
      const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 4096,
          },
        }),
      }, timeoutMs)

      if (!response.ok) {
        const errText = await response.text()
        const status = response.status

        if (status === 401 || status === 403) {
          throw new ProviderAuthError('gemini', `Google AI auth failed ${status}: Invalid API key`)
        }
        if (status === 429) {
          throw new ProviderRateLimitError('gemini', `Google AI rate limited ${status}: ${errText.slice(0, 300)}`)
        }
        if (status === 500 || status === 502 || status === 503 || status === 504) {
          throw new ProviderServerError('gemini', status, `Google AI server error ${status}: ${errText.slice(0, 300)}`)
        }

        throw new Error(`Gemini API error ${status}: ${errText.slice(0, 500)}`)
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

      if (!text) {
        throw new Error('Gemini returned empty response')
      }

      safeLog('GEMINI', `SUCCESS - Model: ${model} - Request: ${options.requestId || 'unknown'}`)

      return {
        ok: true,
        text,
        provider: 'gemini',
        model,
        role: 'LEGACY',
        fallbackChain: ['gemini'],
        triedProviders: [{ id: 'gemini', status: 'SUCCESS' }],
        nexusBrainUsed: false,
      }
    } catch (err: any) {
      if (err instanceof ProviderTimeoutError) {
        safeErrorLog('GEMINI', `Timeout after ${timeoutMs}ms`, err)
        throw new ProviderTimeoutError('gemini', timeoutMs)
      }
      if (err instanceof ProviderAuthError) {
        safeErrorLog('GEMINI', 'Auth error', err)
        throw err
      }
      if (err instanceof ProviderRateLimitError) {
        safeErrorLog('GEMINI', 'Rate limited', err)
        throw err
      }
      if (err instanceof ProviderServerError) {
        safeErrorLog('GEMINI', `Server error ${err.status}`, err)
        throw err
      }
      if (err instanceof ProviderNetworkError) {
        safeErrorLog('GEMINI', 'Network error', err)
        throw new ProviderNetworkError('gemini', err.message)
      }
      safeErrorLog('GEMINI', 'Request failed', err)
      throw err
    }
  }

  try {
    return await retryWithBackoff(execute, 'gemini', brainConfig.maxAttempts, 1000)
  } catch (err: any) {
    const classification = classifyProviderError(err)

    let status: string = 'ERROR'
    let userError: string = err.message?.slice(0, 500)

    switch (classification) {
      case 'AUTH_FAILED':
        status = 'AUTH_FAILED'
        userError = `Google AI auth failed - periksa GOOGLE_AI_API_KEY - ${err.message?.slice(0, 200)}`
        break
      case 'RATE_LIMITED':
        status = 'RATE_LIMITED'
        userError = `Google AI rate limited (429) - quota habis - periksa billing - ${err.message?.slice(0, 200)}`
        break
      case 'TEMPORARY_FAILURE':
        status = 'TEMPORARY_FAILURE'
        userError = `Google AI temporary failure (timeout/network) after ${timeoutMs}ms - ${err.message?.slice(0, 200)}`
        break
      case 'PROVIDER_ERROR':
        status = 'PROVIDER_ERROR'
        userError = `Google AI provider error (500/502/503/504) - server error - ${err.message?.slice(0, 200)}`
        break
      default:
        status = classification === 'NOT_CONFIGURED' ? 'UNCONFIGURED' : 'ERROR'
        break
    }

    return {
      ok: false,
      provider: 'gemini',
      model,
      role: 'LEGACY',
      fallbackChain: ['gemini'],
      triedProviders: [{ 
        id: 'gemini', 
        status, 
        error: err.message?.slice(0, 500) 
      }],
      nexusBrainUsed: false,
      error: userError,
    }
  }
}

// Perbaikan terbatas: Google AI as NEXUS fallback (same implementation, but marked as NEXUS usable)
export async function generateWithGoogleAI(options: NexusGenerateOptions): Promise<NexusGenerateResult> {
  const config = getGoogleAIConfig()
  const result = await generateWithGeminiLegacy(options)
  return {
    ...result,
    provider: 'google' as any,
    role: 'FALLBACK_CLOUD' as any,
    fallbackChain: result.fallbackChain.map(id => id === 'gemini' ? 'google' as any : id),
    triedProviders: result.triedProviders.map(p => ({ ...p, id: 'google' as any })),
    nexusBrainUsed: true,
  }
}

export function isGeminiConfigured(): boolean {
  return getGeminiConfig().configured
}

export function isGoogleAIConfigured(): boolean {
  return getGoogleAIConfig().configured
}

// Perbaikan terbatas: google now allowed in NEXUS as per new order
export const GEMINI_IS_LEGACY = false
export const GEMINI_NOT_IN_NEXUS = false
export const GOOGLE_AI_IS_FALLBACK = true
