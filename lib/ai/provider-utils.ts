// lib/ai/provider-utils.ts - Shared utilities for NEXUS Brain providers
// Implements timeout, retry, safe logging, Vercel compatibility
// TAHAP 1 HARDENING: Centralize config via canonical getGroqConfig/getOpenRouterConfig, distinguish errors, deterministic resolver

export const DEFAULT_TIMEOUT_MS = 30000 // 30s for AI generation
export const DEFAULT_RETRY_ATTEMPTS = 1 // 1 retry = max 2 attempts total
export const MAX_RETRY_ATTEMPTS = 2

// Direct canonical config import - no circular (config does not import provider-utils)
import { getGroqConfig as getCanonicalGroqConfig, getOpenRouterConfig as getCanonicalOpenRouterConfig, getGoogleAIConfig as getCanonicalGoogleConfig, getGeminiConfig as getCanonicalGeminiConfig, getLocalConfig as getCanonicalLocalConfig } from '../config'

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number
}

export class ProviderTimeoutError extends Error {
  constructor(public provider: string, public timeoutMs: number) {
    super(`${provider} timeout after ${timeoutMs}ms`)
    this.name = 'ProviderTimeoutError'
  }
}

export class ProviderAuthError extends Error {
  constructor(public provider: string, message: string) {
    super(message)
    this.name = 'ProviderAuthError'
  }
}

export class ProviderRateLimitError extends Error {
  constructor(public provider: string, message: string) {
    super(message)
    this.name = 'ProviderRateLimitError'
  }
}

export class ProviderServerError extends Error {
  public status: number
  constructor(public provider: string, status: number, message: string) {
    super(message)
    this.name = 'ProviderServerError'
    this.status = status
  }
}

export class ProviderNetworkError extends Error {
  constructor(public provider: string, message: string) {
    super(message)
    this.name = 'ProviderNetworkError'
  }
}

export class ProviderConfigurationError extends Error {
  constructor(public provider: string, message: string) {
    super(message)
    this.name = 'ProviderConfigurationError'
  }
}

// Error classification per TAHAP 1 spec
export type ProviderErrorClassification = 
  | 'NOT_CONFIGURED'      // env var truly missing
  | 'AUTH_FAILED'         // 401/403
  | 'RATE_LIMITED'        // 429
  | 'TEMPORARY_FAILURE'   // timeout/network
  | 'PROVIDER_ERROR'      // 500/502/503/504
  | 'ERROR'               // other

export function classifyProviderError(err: any): ProviderErrorClassification {
  if (!err) return 'ERROR'
  
  // Configuration error is not an exception, it's status UNCONFIGURED - handled separately
  // But if we get ProviderConfigurationError, it's NOT_CONFIGURED
  if (err instanceof ProviderConfigurationError) return 'NOT_CONFIGURED'
  if (err.name === 'ProviderConfigurationError') return 'NOT_CONFIGURED'
  
  if (err instanceof ProviderAuthError || err.name === 'ProviderAuthError') return 'AUTH_FAILED'
  if (err.message?.includes('401') || err.message?.includes('403') || err.message?.toLowerCase().includes('invalid key') || err.message?.toLowerCase().includes('unauthorized')) {
    // Check if it's really auth, not just containing 401 in other context
    if (err.message?.includes('401') || err.message?.includes('403') || err instanceof ProviderAuthError) {
      return 'AUTH_FAILED'
    }
  }
  
  if (err instanceof ProviderRateLimitError || err.name === 'ProviderRateLimitError') return 'RATE_LIMITED'
  if (err.message?.includes('429') || err.message?.toLowerCase().includes('rate limit') || err.message?.toLowerCase().includes('quota') && err.message?.toLowerCase().includes('exceeded')) {
    // 429 is rate limited, but quota exceeded could also be rate limited
    if (err.message?.includes('429') || err.message?.toLowerCase().includes('rate limit')) {
      return 'RATE_LIMITED'
    }
  }
  
  if (err instanceof ProviderTimeoutError || err.name === 'ProviderTimeoutError') return 'TEMPORARY_FAILURE'
  if (err instanceof ProviderNetworkError || err.name === 'ProviderNetworkError') return 'TEMPORARY_FAILURE'
  if (err.message?.toLowerCase().includes('timeout') || err.message?.toLowerCase().includes('econnreset') || err.message?.toLowerCase().includes('etimedout') || err.message?.toLowerCase().includes('network') || err.name === 'AbortError') {
    return 'TEMPORARY_FAILURE'
  }
  
  if (err instanceof ProviderServerError || err.name === 'ProviderServerError') return 'PROVIDER_ERROR'
  if (err.message?.includes('500') || err.message?.includes('502') || err.message?.includes('503') || err.message?.includes('504')) {
    return 'PROVIDER_ERROR'
  }
  
  return 'ERROR'
}

/**
 * Fetch with timeout using AbortController - Vercel serverless compatible
 * Does NOT log secrets
 * Throws classified errors: ProviderTimeoutError, ProviderNetworkError
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (err: any) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      throw new ProviderTimeoutError('unknown', timeoutMs)
    }
    // Network errors: ECONNRESET, ETIMEDOUT, network failure, etc.
    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('network') || msg.includes('fetch failed') || msg.includes('enotfound') || msg.includes('econnrefused')) {
      throw new ProviderNetworkError('unknown', err.message || 'Network error')
    }
    throw new ProviderNetworkError('unknown', err.message || 'Network error')
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Retry with limited attempts and exponential backoff
 * Only retries on transient errors (timeout, 429, 500, 502, 503, 504, network)
 * Does NOT retry auth errors (401,403) or configuration errors
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  provider: string,
  maxAttempts: number = DEFAULT_RETRY_ATTEMPTS + 1,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: any
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Provider:${provider}] Retry attempt ${attempt}/${maxAttempts}`)
      }
      return await fn()
    } catch (err: any) {
      lastError = err
      
      // Don't retry on auth errors (401, 403) or configuration errors
      if (err instanceof ProviderAuthError || err instanceof ProviderConfigurationError ||
          err.name === 'ProviderAuthError' || err.name === 'ProviderConfigurationError' ||
          err.message?.includes('401') || 
          err.message?.includes('403') ||
          err.message?.includes('API key') && (err.message?.includes('invalid') || err.message?.includes('missing')) ||
          err.message?.includes('Unauthorized')) {
        console.log(`[Provider:${provider}] Auth/Config error - not retrying: ${err.message?.slice(0, 200)}`)
        throw err
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break
      }

      // Only retry on transient errors: timeout, rate limit, server error, network
      const classification = classifyProviderError(err)
      const isTransient = 
        classification === 'TEMPORARY_FAILURE' ||
        classification === 'RATE_LIMITED' ||
        classification === 'PROVIDER_ERROR' ||
        err instanceof ProviderTimeoutError ||
        err instanceof ProviderRateLimitError ||
        err instanceof ProviderServerError ||
        err instanceof ProviderNetworkError ||
        err.message?.includes('timeout') ||
        err.message?.includes('429') ||
        err.message?.includes('500') ||
        err.message?.includes('502') ||
        err.message?.includes('503') ||
        err.message?.includes('504') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('network')

      if (!isTransient) {
        console.log(`[Provider:${provider}] Non-transient error (${classification}) - not retrying: ${err.message?.slice(0, 200)}`)
        throw err
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1) // exponential backoff: 1s, 2s, 4s
      console.log(`[Provider:${provider}] Transient error (${classification}) (attempt ${attempt}/${maxAttempts}): ${err.message?.slice(0, 200)} - retrying in ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Safe logging - NEVER log API keys, auth headers, tokens
 */
export function safeLog(provider: string, message: string, data?: any) {
  // Redact any potential secrets from data
  const redactedData = data ? redactSecrets(data) : undefined
  
  if (redactedData) {
    console.log(`[NEXUS Brain][${provider}] ${message}`, redactedData)
  } else {
    console.log(`[NEXUS Brain][${provider}] ${message}`)
  }
}

export function safeErrorLog(provider: string, message: string, error?: any) {
  const errorMessage = error?.message || error || 'unknown'
  // Never log full error if it might contain secrets - slice and redact
  const safeMessage = redactSecrets(errorMessage.slice ? errorMessage.slice(0, 500) : String(errorMessage).slice(0, 500))
  console.error(`[NEXUS Brain][${provider}] ${message}: ${safeMessage}`)
}

function redactSecrets(input: any): any {
  if (typeof input === 'string') {
    return input
      .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]')
      .replace(/sk-[A-Za-z0-9\-_]+/g, 'sk-[REDACTED]')
      .replace(/gsk_[A-Za-z0-9\-_]+/g, 'gsk_[REDACTED]')
      .replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey":"[REDACTED]"')
      .replace(/"api_key"\s*:\s*"[^"]+"/g, '"api_key":"[REDACTED]"')
      .replace(/x-api-key[^:]*:[^\n]*/gi, 'x-api-key: [REDACTED]')
  }
  if (typeof input === 'object' && input !== null) {
    const copy: any = Array.isArray(input) ? [] : {}
    for (const key in input) {
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes('apikey') || lowerKey.includes('api_key') || lowerKey.includes('authorization') || lowerKey.includes('secret') || lowerKey.includes('token')) {
        copy[key] = '[REDACTED]'
      } else {
        copy[key] = typeof input[key] === 'object' ? redactSecrets(input[key]) : input[key]
      }
    }
    return copy
  }
  return input
}

/**
 * Check if running in Vercel production - disable localhost
 */
export function isVercelProduction(): boolean {
  return process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production'
}

export function isVercel(): boolean {
  return process.env.VERCEL === '1'
}

export function shouldUseLocalProvider(): boolean {
  const localConfigUrl = process.env.LOCAL_AI_URL || process.env.OLLAMA_URL || 'http://localhost:11434'
  const isLocalhost = localConfigUrl.includes('localhost') || localConfigUrl.includes('127.0.0.1') || localConfigUrl.includes('0.0.0.0')
  
  // In Vercel production, localhost is NEVER allowed - even if explicitly enabled
  // Spec: "Jangan mencoba mengakses localhost dari production Vercel" + "Bila production, Local AI otomatis dinonaktifkan"
  if (isVercelProduction() && isLocalhost) {
    return false
  }
  
  // In any Vercel environment (preview), localhost is not reachable unless explicitly enabled with non-localhost URL
  if (isVercel() && isLocalhost) {
    return false
  }

  // Local dev: allow if explicitly enabled or custom non-localhost URL
  return process.env.LOCAL_AI_ENABLED === 'true' || !isLocalhost
}

/**
 * Environment validation without leaking secrets
 * TAHAP 1 HARDENING: Centralize provider configuration - use canonical config from lib/config.ts
 * Single source of truth: process.env via getGroqConfig, getOpenRouterConfig, etc.
 */
export interface EnvValidationResult {
  groq: { configured: boolean; enabled: boolean; model: string; status: string }
  openrouter: { configured: boolean; enabled: boolean; model: string; status: string }
  google: { configured: boolean; enabled: boolean; model: string; status: string }
  local: { configured: boolean; enabled: boolean; model: string; status: string; isLocalhost: boolean; allowedInProduction: boolean }
  brain: { ready: boolean; activeProvider: string | null; configuredCount: number }
}

export function validateEnv(): EnvValidationResult {
  // TAHAP 1: Use canonical config from lib/config.ts to ensure single source
  // This ensures health endpoint and runtime resolver use same config source
  // Direct import, no eval, deterministic, server-side only
  try {
    const groqCfg = getCanonicalGroqConfig()
    const openRouterCfg = getCanonicalOpenRouterConfig()
    const googleCfg = getCanonicalGoogleConfig ? getCanonicalGoogleConfig() : getCanonicalGeminiConfig()
    const localCfg = getCanonicalLocalConfig()

    const groqConfigured = groqCfg.configured
    const openRouterConfigured = openRouterCfg.configured
    const googleConfigured = googleCfg.configured
    const localEnabled = localCfg.enabled
    const localConfigured = localCfg.configured
    const isLocalhost = localCfg.isLocalhost

    let localStatus = 'UNCONFIGURED'
    if (localConfigured) {
      if (!localCfg.enabled) {
        localStatus = localCfg.disabledReason?.includes('production') ? 'DISABLED_IN_PRODUCTION' : localCfg.disabledReason?.includes('Vercel') ? 'DISABLED_IN_VERCEL' : 'DISABLED'
      } else {
        localStatus = 'READY'
      }
    }

    const configuredCount = [groqConfigured && groqCfg.enabled, openRouterConfigured && openRouterCfg.enabled, googleConfigured && googleCfg.enabled, localEnabled].filter(Boolean).length

    return {
      groq: {
        configured: groqConfigured,
        enabled: groqCfg.enabled,
        model: groqCfg.model,
        status: groqConfigured ? (groqCfg.enabled ? 'READY' : 'DISABLED') : 'UNCONFIGURED'
      },
      openrouter: {
        configured: openRouterConfigured,
        enabled: openRouterCfg.enabled,
        model: openRouterCfg.model,
        status: openRouterConfigured ? (openRouterCfg.enabled ? 'READY' : 'DISABLED') : 'UNCONFIGURED'
      },
      google: {
        configured: googleConfigured,
        enabled: googleCfg.enabled,
        model: googleCfg.model,
        status: googleConfigured ? (googleCfg.enabled ? 'READY' : 'DISABLED') : 'UNCONFIGURED'
      },
      local: {
        configured: localConfigured,
        enabled: localEnabled,
        model: localCfg.model,
        status: localStatus,
        isLocalhost,
        allowedInProduction: false
      },
      brain: {
        ready: configuredCount > 0,
        activeProvider: groqConfigured && groqCfg.enabled ? 'groq' : openRouterConfigured && openRouterCfg.enabled ? 'openrouter' : googleConfigured && googleCfg.enabled ? 'google' : localEnabled ? 'local' : null,
        configuredCount
      }
    }
  } catch (err) {
    // Fallback to direct env reading if config module fails (should not happen, but safe)
    console.error('[validateEnv] Canonical config failed, fallback to direct env:', (err as any)?.message?.slice(0, 200))
    const groqKey = !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim())
    const openRouterKey = !!(process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_APIKEY)
    const googleKey = !!(process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)
    const localEnabledFlag = process.env.LOCAL_AI_ENABLED === 'true'
    const localUrl = process.env.LOCAL_AI_URL || process.env.OLLAMA_URL || 'http://localhost:11434'
    const isLocalhost = localUrl.includes('localhost') || localUrl.includes('127.0.0.1') || localUrl.includes('0.0.0.0')
    
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'
    const openRouterModel = process.env.OPENROUTER_MODEL || process.env.OPEN_ROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
    const googleModel = process.env.GEMINI_MODEL || process.env.GOOGLE_AI_MODEL || 'gemini-1.5-flash'
    const localModel = process.env.LOCAL_AI_MODEL || 'llama3.1'

    const groqConfigured = groqKey
    const openRouterConfigured = openRouterKey
    const googleConfigured = googleKey
    const localConfigured = localEnabledFlag || !!process.env.LOCAL_AI_URL

    let localEnabled = false
    let localStatus = 'UNCONFIGURED'
    
    if (localConfigured) {
      if (isVercelProduction() && isLocalhost) {
        localEnabled = false
        localStatus = 'DISABLED_IN_PRODUCTION'
      } else if (isVercel() && isLocalhost) {
        localEnabled = false
        localStatus = 'DISABLED_IN_VERCEL'
      } else {
        localEnabled = shouldUseLocalProvider()
        localStatus = localEnabled ? 'READY' : 'DISABLED'
      }
    }

    const configuredCount = [groqConfigured, openRouterConfigured, googleConfigured, localEnabled].filter(Boolean).length

    return {
      groq: {
        configured: groqConfigured,
        enabled: groqConfigured && process.env.GROQ_ENABLED !== 'false',
        model: groqModel,
        status: groqConfigured ? 'READY' : 'UNCONFIGURED'
      },
      openrouter: {
        configured: openRouterConfigured,
        enabled: openRouterConfigured && process.env.OPENROUTER_ENABLED !== 'false',
        model: openRouterModel,
        status: openRouterConfigured ? 'READY' : 'UNCONFIGURED'
      },
      google: {
        configured: googleConfigured,
        enabled: googleConfigured && process.env.GEMINI_ENABLED !== 'false' && process.env.GOOGLE_AI_ENABLED !== 'false',
        model: googleModel,
        status: googleConfigured ? 'READY' : 'UNCONFIGURED'
      },
      local: {
        configured: localConfigured,
        enabled: localEnabled,
        model: localModel,
        status: localStatus,
        isLocalhost,
        allowedInProduction: false
      },
      brain: {
        ready: configuredCount > 0,
        activeProvider: groqConfigured ? 'groq' : openRouterConfigured ? 'openrouter' : googleConfigured ? 'google' : localEnabled ? 'local' : null,
        configuredCount
      }
    }
  }
}
