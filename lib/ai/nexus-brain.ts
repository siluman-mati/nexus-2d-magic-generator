// lib/ai/nexus-brain.ts - NEXUS BRAIN - Central AI orchestration - POLLINATIONS REMOVED per integrity audit
import { NexusGenerateOptions, NexusGenerateResult, ProviderId } from './types'
import { getGroqConfig, getOpenRouterConfig, getGoogleAIConfig, getLocalConfig, getAllProviderStatus, getNexusBrainConfig, isVercelProduction, isVercel } from '../config'
import { generateWithGroq } from './providers/groq'
import { generateWithOpenRouter } from './providers/openrouter'
import { generateWithLocal } from './providers/local'
import { generateWithGeminiLegacy } from './providers/gemini'
import { generateWithFreeLLM } from './providers/free-llm'
import { safeLog, safeErrorLog, validateEnv } from './provider-utils'

export interface NexusBrainStatus {
  brain: 'NEXUS'
  primaryProvider: ProviderId
  fallbackProviders: ProviderId[]
  excludedProviders: ProviderId[]
  configuredProviders: ProviderId[]
  activeProvider: ProviderId | null
  modelUsed: string | null
  isReady: boolean
  reason?: string
  envValidation?: ReturnType<typeof validateEnv>
  vercel: { isVercel: boolean; isProduction: boolean; localAllowed: boolean }
}

export function getNexusBrainStatus(): NexusBrainStatus {
  const allStatus = getAllProviderStatus()
  const envValidation = validateEnv()
  const brainConfig = getNexusBrainConfig()
  const configured: ProviderId[] = []
  if (allStatus.groq.configured && allStatus.groq.enabled) configured.push('groq')
  if (allStatus.openrouter.configured && allStatus.openrouter.enabled) configured.push('openrouter')
  if ((allStatus as any).google?.configured && (allStatus as any).google?.enabled) configured.push('google' as ProviderId)
  else if (allStatus.gemini.configured && allStatus.gemini.enabled) configured.push('gemini' as ProviderId)
  if (allStatus.local.configured && allStatus.local.enabled) configured.push('local')
  if ((allStatus as any).freeLLM?.configured) configured.push('free-llm' as ProviderId)
  const isReady = configured.length > 0
  return {
    brain: 'NEXUS', primaryProvider: 'groq', fallbackProviders: ['openrouter','google','local','free-llm'] as ProviderId[], excludedProviders: ['gemini-legacy'] as ProviderId[],
    configuredProviders: configured, activeProvider: configured[0] || null,
    modelUsed: configured[0] ? (allStatus[configured[0] as keyof typeof allStatus] as any)?.model || (allStatus as any)[configured[0]]?.model : null,
    isReady, reason: isReady ? undefined : 'NEXUS Brain tidak memiliki provider aktif.',
    envValidation, vercel: { isVercel: brainConfig.isVercel, isProduction: brainConfig.isVercelProduction, localAllowed: allStatus.local.enabled }
  }
}

export function getActiveProviderDetection(): { available: boolean; provider?: string; message?: string; order: string[] } {
  const envValidation = validateEnv()
  const order = ['GROQ_API_KEY','OPENROUTER_API_KEY','GOOGLE_AI_API_KEY']
  if (envValidation.groq.configured) return { available: true, provider: 'groq', order }
  if (envValidation.openrouter.configured) return { available: true, provider: 'openrouter', order }
  if (envValidation.google.configured) return { available: true, provider: 'google', order }
  if (envValidation.local.enabled) return { available: true, provider: 'local', order }
  return { available: false, message: 'AI provider belum dikonfigurasi', order }
}

function getSafeUserMessage(triedProviders: { id: ProviderId; status: string; error?: string }[]): string {
  const attemptedChain = triedProviders.map(p => `${p.id}:${p.status}`).join(' -> ')
  const allUnconfigured = triedProviders.length > 0 && triedProviders.every(p => p.status === 'UNCONFIGURED' || p.status === 'NOT_CONFIGURED')
  if (allUnconfigured) return `NEXUS Brain: Tidak ada provider AI yang terkonfigurasi.\n\nPeriksa konfigurasi AI provider di server.\n\nTried: ${attemptedChain}`
  return `NEXUS Brain: Provider AI terkonfigurasi tetapi mengalami kegagalan sementara.\n\nTried: ${attemptedChain}\n\nUntuk admin: cek /api/nexus/health`
}

function getDiagnosticMessage(groqConfig: ReturnType<typeof getGroqConfig>, openRouterConfig: ReturnType<typeof getOpenRouterConfig>, localConfig: ReturnType<typeof getLocalConfig>, triedProviders: { id: ProviderId; status: string; error?: string }[]): string {
  const brainConfig = getNexusBrainConfig()
  const googleConfig = getGoogleAIConfig()
  return `NEXUS Brain diagnostic:\nArchitecture: USER -> APP -> NEXUS BRAIN -> GROQ -> OPENROUTER -> GOOGLE_AI -> LOCAL -> FREE-LLM (HF Text ONLY) NO POLLINATIONS\nVercel: ${brainConfig.isVercel ? 'YES' : 'NO'} | Production: ${brainConfig.isVercelProduction ? 'YES' : 'NO'}\nProviders: GROQ ${groqConfig.configured ? 'CONFIGURED' : 'NOT SET'} | OPENROUTER ${openRouterConfig.configured ? 'CONFIGURED' : 'NOT SET'} | GOOGLE ${googleConfig.configured ? 'CONFIGURED' : 'NOT SET'} | LOCAL ${localConfig.configured ? 'CONFIGURED' : 'NOT SET'}\nTried: ${triedProviders.map(p => `${p.id}:${p.status}`).join(' -> ') || 'none'}\nNo Pollinations — HF Text only`
}

export async function generateViaNexusBrain(options: NexusGenerateOptions): Promise<NexusGenerateResult> {
  const requestId = options.requestId || `nexus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const triedProviders: { id: ProviderId; status: string; error?: string }[] = []
  const fallbackChain: ProviderId[] = []
  const brainConfig = getNexusBrainConfig()
  safeLog('BRAIN', `Request ${requestId} - Engine: ${options.engine || 'unknown'} - Starting`)
  safeLog('BRAIN', `Provider order: GROQ -> OPENROUTER -> GOOGLE_AI -> LOCAL -> FREE-LLM (HF Text ONLY) NO POLLINATIONS`)
  const groqConfig = getGroqConfig(); const openRouterConfig = getOpenRouterConfig(); const googleConfig = getGoogleAIConfig(); const localConfig = getLocalConfig()
  const envValidation = validateEnv()
  safeLog('BRAIN', `Env check - Groq: ${envValidation.groq.configured ? 'CONFIGURED' : 'NOT SET'} | OpenRouter: ${envValidation.openrouter.configured ? 'CONFIGURED' : 'NOT SET'} | Google: ${envValidation.google.configured ? 'CONFIGURED' : 'NOT SET'} | Local: ${envValidation.local.configured ? 'CONFIGURED' : 'NOT SET'}`)

  if (groqConfig.configured && groqConfig.enabled) {
    safeLog('BRAIN', `Trying PRIMARY: GROQ - Request: ${requestId}`); fallbackChain.push('groq')
    const result = await generateWithGroq({ ...options, requestId }); triedProviders.push(...result.triedProviders)
    if (result.ok) { safeLog('BRAIN', `SUCCESS via GROQ - Request: ${requestId}`); return { ...result, fallbackChain, triedProviders, nexusBrainUsed: true } }
    safeErrorLog('BRAIN', `GROQ failed - trying fallback - Request: ${requestId}`, result.error)
    if (!brainConfig.failoverEnabled) return { ...result, fallbackChain, triedProviders, nexusBrainUsed: true }
  } else { triedProviders.push({ id: 'groq', status: 'UNCONFIGURED', error: 'GROQ_API_KEY missing' }) }

  if (openRouterConfig.configured && openRouterConfig.enabled) {
    safeLog('BRAIN', `Trying FALLBACK: OPENROUTER - Request: ${requestId}`); fallbackChain.push('openrouter')
    const result = await generateWithOpenRouter({ ...options, requestId }); triedProviders.push(...result.triedProviders)
    if (result.ok) { safeLog('BRAIN', `SUCCESS via OPENROUTER - Request: ${requestId}`); return { ...result, fallbackChain, triedProviders, nexusBrainUsed: true } }
    safeErrorLog('BRAIN', `OPENROUTER failed - Request: ${requestId}`, result.error)
    if (!brainConfig.failoverEnabled) return { ...result, fallbackChain, triedProviders, nexusBrainUsed: true }
  } else { triedProviders.push({ id: 'openrouter', status: 'UNCONFIGURED', error: 'OPENROUTER_API_KEY missing' }) }

  if (googleConfig.configured && googleConfig.enabled) {
    safeLog('BRAIN', `Trying FALLBACK: GOOGLE_AI - Request: ${requestId}`); fallbackChain.push('google' as ProviderId)
    const result = await generateWithGeminiLegacy({ ...options, requestId })
    const mappedResult = { ...result, provider: 'google' as ProviderId, fallbackChain: [...fallbackChain] }
    triedProviders.push(...result.triedProviders.map(p => ({ ...p, id: 'google' as ProviderId })))
    if (mappedResult.ok) { safeLog('BRAIN', `SUCCESS via GOOGLE_AI - Request: ${requestId}`); return { ...mappedResult, fallbackChain, triedProviders, nexusBrainUsed: true } }
    safeErrorLog('BRAIN', `GOOGLE_AI failed - Request: ${requestId}`, mappedResult.error)
    if (!brainConfig.failoverEnabled) return { ...mappedResult, fallbackChain, triedProviders, nexusBrainUsed: true }
  } else { triedProviders.push({ id: 'google' as ProviderId, status: 'UNCONFIGURED', error: 'GOOGLE_AI_API_KEY missing' }) }

  const shouldTryLocal = localConfig.configured && localConfig.enabled && !isVercelProduction()
  if (shouldTryLocal) {
    if (localConfig.isLocalhost && isVercel() && process.env.LOCAL_AI_ENABLED !== 'true') { triedProviders.push({ id: 'local', status: 'SKIPPED', error: 'Localhost not available in Vercel' }) }
    else {
      safeLog('BRAIN', `Trying FALLBACK_LOCAL: LOCAL - Request: ${requestId}`); fallbackChain.push('local')
      const result = await generateWithLocal({ ...options, requestId }); triedProviders.push(...result.triedProviders)
      if (result.ok) { safeLog('BRAIN', `SUCCESS via LOCAL - Request: ${requestId}`); return { ...result, fallbackChain, triedProviders, nexusBrainUsed: true } }
      safeErrorLog('BRAIN', `LOCAL failed - Request: ${requestId}`, result.error)
    }
  } else { triedProviders.push({ id: 'local', status: 'UNCONFIGURED', error: 'LOCAL_AI not configured' }) }

  safeLog('BRAIN', `Trying FINAL FALLBACK: FREE-LLM (HF Text ONLY) — Request: ${requestId} — Chain so far: ${fallbackChain.join(' -> ')} — NO POLLINATIONS`)
  fallbackChain.push('free-llm' as ProviderId)
  try {
    const freeResult = await generateWithFreeLLM({ ...options, requestId }); triedProviders.push(...freeResult.triedProviders)
    if (freeResult.ok) { safeLog('BRAIN', `SUCCESS via FREE-LLM (HF Text) — Request: ${requestId}`); return { ...freeResult, fallbackChain, triedProviders, nexusBrainUsed: true } }
    safeErrorLog('BRAIN', `FREE-LLM failed — honest FAILED — Request: ${requestId}`, freeResult.error)
  } catch (e: any) { safeErrorLog('BRAIN', `FREE-LLM exception — Request: ${requestId}`, e.message); triedProviders.push({ id: 'free-llm' as ProviderId, status: 'FAILED', error: e.message?.slice(0,200) }) }

  safeErrorLog('BRAIN', `ALL PROVIDERS FAILED — Request: ${requestId} — Tried: ${triedProviders.map(p => `${p.id}:${p.status}`).join(' -> ')} — NO POLLINATIONS — honest FAILED`)
  const safeUserMessage = getSafeUserMessage(triedProviders)
  const diagnosticMessage = getDiagnosticMessage(groqConfig, openRouterConfig, localConfig, triedProviders)
  return { ok: false, provider: fallbackChain[0] || 'groq', model: groqConfig.model, role: 'PRIMARY', fallbackChain, triedProviders, nexusBrainUsed: true, error: safeUserMessage, diagnostic: diagnosticMessage } as any
}

export function verifyGeminiNotInNexusPath(result: NexusGenerateResult): { valid: boolean; reason: string } {
  if (result.provider === 'gemini-legacy') return { valid: false, reason: `VIOLATION: NEXUS Brain used Gemini Legacy (${result.provider}) which is forbidden.` }
  if (result.fallbackChain.includes('gemini-legacy' as any)) return { valid: false, reason: `VIOLATION: Fallback chain includes Gemini Legacy: ${result.fallbackChain.join(' -> ')}` }
  if (!result.nexusBrainUsed) return { valid: false, reason: `VIOLATION: Result does not mark nexusBrainUsed=true` }
  return { valid: true, reason: `PASS: NEXUS Brain correctly used ${result.provider} (role: ${result.role}) with chain ${result.fallbackChain.join(' -> ')}` }
}
