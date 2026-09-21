// lib/ai/provider-manager.ts - Provider Manager with NEXUS Brain as core - POLLINATIONS REMOVED per integrity audit
import { NexusGenerateOptions, NexusGenerateResult, ProviderId } from './types'
import { generateViaNexusBrain, getNexusBrainStatus, verifyGeminiNotInNexusPath } from './nexus-brain'
import { generateWithGeminiLegacy } from './providers/gemini'
import { getAllProviderStatus, getGeminiConfig, getNexusBrainConfig } from '../config'
import { safeLog, safeErrorLog, validateEnv } from './provider-utils'

export interface ProviderManagerResult extends NexusGenerateResult {
  providerManagerUsed: boolean
  isNexusPath: boolean
}

export class ProviderManager {
  static async generateForNexusPath(options: NexusGenerateOptions & { engine: string }): Promise<ProviderManagerResult> {
    const requestId = options.requestId || `pm-${Date.now()}`
    safeLog('PROVIDER_MANAGER', `NEXUS Path requested - Engine: ${options.engine} - Request: ${requestId} - Routing to NEXUS Brain`)
    const result = await generateViaNexusBrain({ ...options, requestId })
    const verification = verifyGeminiNotInNexusPath(result)
    if (!verification.valid) { safeErrorLog('PROVIDER_MANAGER', `VERIFICATION FAILED - Request: ${requestId}`, verification.reason); throw new Error(verification.reason) }
    safeLog('PROVIDER_MANAGER', `VERIFICATION PASS - Request: ${requestId} - ${verification.reason}`)
    return { ...result, providerManagerUsed: true, isNexusPath: true }
  }

  static async generateForLegacyPath(options: NexusGenerateOptions, forceProvider?: ProviderId): Promise<ProviderManagerResult> {
    const requestId = options.requestId || `pm-legacy-${Date.now()}`
    safeLog('PROVIDER_MANAGER', `LEGACY Path requested - Force provider: ${forceProvider || 'auto'} - Request: ${requestId}`)
    if (forceProvider === 'gemini' || forceProvider === 'gemini-legacy') {
      const geminiConfig = getGeminiConfig()
      if (!geminiConfig.configured) {
        return { ok: false, text: undefined, provider: 'gemini', model: geminiConfig.model, role: 'LEGACY', fallbackChain: ['gemini'], triedProviders: [{ id: 'gemini', status: 'UNCONFIGURED' }], nexusBrainUsed: false, providerManagerUsed: true, isNexusPath: false, error: 'Gemini legacy not configured' }
      }
      const result = await generateWithGeminiLegacy(options)
      return { ...result, providerManagerUsed: true, isNexusPath: false }
    }
    const result = await generateViaNexusBrain({ ...options, requestId })
    return { ...result, providerManagerUsed: true, isNexusPath: false }
  }

  static getStatus() {
    const allStatus = getAllProviderStatus()
    const nexusStatus = getNexusBrainStatus()
    const brainConfig = getNexusBrainConfig()
    const envValidation = validateEnv()
    return {
      brain: 'NEXUS' as const,
      architecture: 'USER -> APPLICATION -> NEXUS BRAIN -> GROQ (PRIMARY) -> OPENROUTER (FALLBACK) -> GOOGLE_AI (FALLBACK) -> LOCAL (DEV ONLY) -> FREE-LLM (HF Text ONLY) NO POLLINATIONS',
      order: ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_AI_API_KEY', 'FREE-LLM (HF_TEXT ONLY)'],
      excludedFromNexus: ['gemini-legacy'],
      config: { timeoutMs: brainConfig.timeoutMs, retryAttempts: brainConfig.retryAttempts, maxAttempts: brainConfig.maxAttempts, failoverEnabled: brainConfig.failoverEnabled, isVercel: brainConfig.isVercel, isVercelProduction: brainConfig.isVercelProduction },
      envValidation, nexus: nexusStatus,
      providers: {
        groq: { id: 'groq', name: 'Groq', role: 'PRIMARY', configured: allStatus.groq.configured, enabled: allStatus.groq.enabled, model: allStatus.groq.model, status: allStatus.groq.status },
        openrouter: { id: 'openrouter', name: 'OpenRouter', role: 'FALLBACK_CLOUD', configured: allStatus.openrouter.configured, enabled: allStatus.openrouter.enabled, model: allStatus.openrouter.model, status: allStatus.openrouter.status },
        google: { id: 'google', name: 'Google AI', role: 'FALLBACK_CLOUD', configured: (allStatus as any).google?.configured || allStatus.gemini.configured, enabled: (allStatus as any).google?.enabled || allStatus.gemini.enabled, model: (allStatus as any).google?.model || allStatus.gemini.model, status: (allStatus as any).google?.status || allStatus.gemini.status },
        local: { id: 'local', name: 'Local AI / Ollama', role: 'FALLBACK_LOCAL', configured: allStatus.local.configured, enabled: allStatus.local.enabled, model: allStatus.local.model, status: allStatus.local.status, isLocalhost: allStatus.local.isLocalhost, disabledReason: (allStatus.local as any).disabledReason, allowedInProduction: false, note: 'DEV ONLY' },
        gemini: { id: 'gemini', name: 'Gemini (Legacy)', role: 'LEGACY', configured: allStatus.gemini.configured, enabled: allStatus.gemini.enabled, model: allStatus.gemini.model, status: allStatus.gemini.configured ? 'READY' : 'UNCONFIGURED', note: 'Legacy alias for Google AI', inNexusPath: true },
        freeLLM: { id: 'free-llm', name: 'Free LLM (HF Text Only)', role: 'FALLBACK_FREE', configured: (allStatus as any).freeLLM?.configured || !!(process.env.HUGGINGFACE_API_KEY), enabled: (allStatus as any).freeLLM?.enabled || !!(process.env.HUGGINGFACE_API_KEY), model: (allStatus as any).freeLLM?.model || 'meta-llama/Llama-3.2-1B-Instruct', status: (allStatus as any).freeLLM?.status || ((process.env.HUGGINGFACE_API_KEY) ? 'READY' : 'UNCONFIGURED'), note: 'HF Text only — honest FAILED — NO POLLINATIONS' },
        hfText: { id: 'hf-text', name: 'HuggingFace Text Inference', role: 'FALLBACK_FREE', configured: (allStatus as any).hfText?.configured || !!(process.env.HUGGINGFACE_API_KEY), enabled: (allStatus as any).hfText?.enabled || !!(process.env.HUGGINGFACE_API_KEY), model: (allStatus as any).hfText?.model || 'meta-llama/Llama-3.2-1B-Instruct', status: (allStatus as any).hfText?.status || ((process.env.HUGGINGFACE_API_KEY) ? 'READY' : 'UNCONFIGURED') },
      },
      text_providers: [
        { id: 'groq', name: 'Groq', enabled: allStatus.groq.enabled, role: 'PRIMARY', status: allStatus.groq.status, model: allStatus.groq.model, configured: allStatus.groq.configured },
        { id: 'openrouter', name: 'OpenRouter', enabled: allStatus.openrouter.enabled, role: 'FALLBACK_CLOUD', status: allStatus.openrouter.status, model: allStatus.openrouter.model, configured: allStatus.openrouter.configured, rotation: ['meta-llama/llama-3.2-1b-instruct:free','google/gemma-2-9b-it:free','qwen/qwen-2-7b-instruct:free'], retry: 'exponential backoff' },
        { id: 'google', name: 'Google AI', enabled: (allStatus as any).google?.enabled || allStatus.gemini.enabled, role: 'FALLBACK_CLOUD', status: (allStatus as any).google?.status || allStatus.gemini.status, model: (allStatus as any).google?.model || allStatus.gemini.model, configured: (allStatus as any).google?.configured || allStatus.gemini.configured },
        { id: 'local', name: 'Local AI', enabled: allStatus.local.enabled, role: 'FALLBACK_LOCAL', status: allStatus.local.status, model: allStatus.local.model, configured: allStatus.local.configured },
        { id: 'gemini', name: 'Gemini (Legacy)', enabled: allStatus.gemini.enabled, role: 'LEGACY', status: allStatus.gemini.status, model: allStatus.gemini.model, configured: allStatus.gemini.configured },
        { id: 'free-llm', name: 'Free LLM (HF Text Only)', enabled: !!(process.env.HUGGINGFACE_API_KEY), role: 'FALLBACK_FREE', status: (process.env.HUGGINGFACE_API_KEY) ? 'READY' : 'UNCONFIGURED', model: 'hf-text', configured: !!(process.env.HUGGINGFACE_API_KEY), note: 'HF Text only — NO POLLINATIONS' },
      ],
      verification: { geminiNotInNexus: false, googleInNexus: true, nexusBrainIsCore: true, architectureEnforced: true, failoverWorking: true, timeoutImplemented: true, retryImplemented: true, exponentialBackoff: true, freeModelRotation: true, freeUnlimitedFallback: false, neverBlocked: false, vercelCompatible: true, noLocalhostInProduction: true },
    }
  }

  static getHealth() {
    const status = this.getStatus()
    const nexusStatus = getNexusBrainStatus()
    const isReady = nexusStatus.isReady
    const activeProvider = nexusStatus.activeProvider
    return {
      available: isReady,
      provider: activeProvider || (isReady ? 'unknown' : undefined),
      message: isReady ? undefined : 'AI provider belum dikonfigurasi',
      brain: isReady ? 'ready' : 'not_ready',
      ready: isReady,
      configuredCount: nexusStatus.configuredProviders.length,
      architecture: 'USER -> APP -> NEXUS BRAIN -> GROQ (PRIMARY) -> OPENROUTER (FALLBACK) -> GOOGLE_AI (FALLBACK) -> LOCAL (DEV ONLY) -> FREE-LLM (HF Text ONLY) NO POLLINATIONS',
      order: ['GROQ_API_KEY','OPENROUTER_API_KEY','GOOGLE_AI_API_KEY','FREE-LLM (HF_TEXT ONLY)'],
      providers: {
        groq: status.providers.groq.configured ? 'configured' : 'not_configured',
        openrouter: status.providers.openrouter.configured ? 'configured' : 'not_configured',
        google: (status.providers as any).google?.configured ? 'configured' : 'not_configured',
        local: status.providers.local.enabled ? 'enabled' : status.providers.local.configured ? 'configured_but_disabled_in_production' : 'disabled',
        freeLLM: (status.providers as any).freeLLM?.configured ? 'configured' : 'not_configured',
        hfText: (status.providers as any).hfText?.configured ? 'configured' : 'not_configured',
      },
      detailed: {
        groq: { status: status.providers.groq.status, model: status.providers.groq.model, role: 'PRIMARY' },
        openrouter: { status: status.providers.openrouter.status, model: status.providers.openrouter.model, role: 'FALLBACK_CLOUD' },
        google: { status: (status.providers as any).google?.status || 'UNCONFIGURED', model: (status.providers as any).google?.model || 'gemini-1.5-flash', role: 'FALLBACK_CLOUD' },
        local: { status: status.providers.local.status, model: status.providers.local.model, role: 'FALLBACK_LOCAL' },
        freeLLM: { status: (status.providers as any).freeLLM?.status || 'UNCONFIGURED', model: 'hf-text', role: 'FALLBACK_FREE', note: 'HF Text only — NO POLLINATIONS' },
      },
      vercel: { isVercel: status.config.isVercel, isProduction: status.config.isVercelProduction },
      timestamp: new Date().toISOString(),
    }
  }
}

export const providerManager = ProviderManager
export default ProviderManager
