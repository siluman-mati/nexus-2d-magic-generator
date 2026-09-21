// lib/gemini.ts - Compatibility seam
// IMPORTANT: This file is kept for backward compatibility but must NOT be used for NEXUS Brain paths
// For NEXUS paths (Story Generation / Buat Cerita), it MUST forward to ProviderManager which routes to NEXUS Brain
// and NEXUS Brain must NEVER select Gemini

import { ProviderManager } from './ai/provider-manager'
import { generateWithGeminiLegacy } from './ai/providers/gemini'
import { NexusGenerateOptions } from './ai/types'

export interface GeminiGenerateOptions {
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  model?: string
  // Flag to indicate if this is a NEXUS path - if true, MUST go through NEXUS Brain, not Gemini
  isNexusPath?: boolean
  engine?: string
  requestId?: string
}

/**
 * Legacy compatibility function
 * If isNexusPath=true, it MUST route through NEXUS Brain (Groq -> OpenRouter -> Local) and NOT use Gemini
 * If isNexusPath=false or undefined, it may use Gemini legacy for backward compat
 */
export async function generateWithGemini(options: GeminiGenerateOptions) {
  console.log(`[lib/gemini.ts] Called - isNexusPath: ${options.isNexusPath || false}, engine: ${options.engine || 'unknown'}`)

  // MANDATORY: If this is a NEXUS path (Story Generation), forward to NEXUS Brain via ProviderManager
  if (options.isNexusPath || options.engine === 'story' || options.engine === 'script' || options.engine === 'character' || options.engine === 'world' || options.engine === 'storyboard') {
    console.log(`[lib/gemini.ts] NEXUS path detected - Forwarding to NEXUS Brain (NOT using Gemini) - Engine: ${options.engine}`)
    
    const nexusResult = await ProviderManager.generateForNexusPath({
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      preferredModel: options.model,
      engine: options.engine || 'story',
      requestId: options.requestId,
    })

    // Return in legacy format but with NEXUS provider info
    return {
      ok: nexusResult.ok,
      text: nexusResult.text,
      provider: nexusResult.provider,
      model: nexusResult.model,
      nexusBrainUsed: nexusResult.nexusBrainUsed,
      fallbackChain: nexusResult.fallbackChain,
      verification: `NEXUS Brain used ${nexusResult.provider}, Gemini NOT used - ${nexusResult.nexusBrainUsed ? 'PASS' : 'FAIL'}`,
      error: nexusResult.error,
    }
  }

  // Legacy path - may still use Gemini for backward compatibility if needed by old features
  console.log(`[lib/gemini.ts] Legacy path - Using Gemini legacy provider for backward compat`)
  const legacyResult = await generateWithGeminiLegacy({
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    preferredModel: options.model,
    engine: 'legacy',
  })

  return {
    ok: legacyResult.ok,
    text: legacyResult.text,
    provider: legacyResult.provider,
    model: legacyResult.model,
    nexusBrainUsed: false,
    isLegacy: true,
    error: legacyResult.error,
  }
}

// For backward compat, export as default and named
export const gemini = {
  generate: generateWithGemini,
  isLegacy: true,
  notUsedInNexus: true,
}

export default gemini

// Marker that this file is compatibility seam
export const IS_COMPATIBILITY_SEAM = true
export const FORWARDS_TO_NEXUS_FOR_NEXUS_PATHS = true
export const GEMINI_NOT_USED_IN_NEXUS = true
