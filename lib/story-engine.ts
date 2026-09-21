// lib/story-engine.ts - Story Generation Engine with RESEARCH + FACT-GROUNDING
// ARCHITECTURE WAJIB:
// User Input → Intent/Subject Classification → Research Planner → Source Retrieval → Source Extraction → Source Ranking → Cross-Source Verification → Fact Grounding → Story Planner → Story Generator → Grounding Validation → Final Story
// MANDATORY: This MUST use NEXUS Brain, NOT Gemini directly
// Flow: Buat Cerita -> Research Layer (if real subject) -> NEXUS Brain -> GROQ -> OpenRouter -> Local

import { ProviderManager } from './ai/provider-manager'
import { NexusGenerateOptions } from './ai/types'
import { runResearchPipeline, createFactAwarePrompt, validateStoryGrounding } from './research'
import { getResearchConfig } from './config'

export interface StoryInput {
  theme: string
  genre: string
  tone: string
  storyIdea: string
  episodeCount: number
  duration_per_episode_seconds: number
  total_duration_seconds: number
  language?: string
}

export interface StoryOutput {
  title: string
  logline: string
  premise: string
  conflict: string
  ending: string
  characters: Array<{ name: string; role: string; description: string }>
  locations: Array<{ name: string; location_id: string; description: string; environment: string }>
  episode_structure: Array<{ episode: number; title: string; summary: string }>
  source_story_id: string
  // Fact-grounding metadata (optional, for validation)
  _research?: any
  _groundingValidation?: any
}

function buildStoryPrompt(input: StoryInput): { system: string; prompt: string } {
  const system = `You are NEXUS Brain, the core AI production engine for 2D animation.
You are model-agnostic and provider-agnostic. You generate structured story data for 2D animation.
You MUST output valid JSON only, no markdown, no explanation.

Architecture: USER -> APPLICATION -> NEXUS BRAIN -> GROQ (PRIMARY) -> OPENROUTER (FALLBACK) -> LOCAL (FALLBACK)
You are NEXUS Brain, NOT Gemini. Gemini is legacy and not used in this path.

Language: ${input.language || 'id'} - Respond in Indonesian if language is id, English if en.

Requirements:
- Theme: ${input.genre} - ${input.theme}
- Tone: ${input.tone}
- Episodes: ${input.episodeCount}
- Duration per episode: ${input.duration_per_episode_seconds} seconds
- Total duration: ${input.total_duration_seconds} seconds

Output JSON structure:
{
  "title": "string",
  "logline": "string - 1 sentence hook",
  "premise": "string - 2-3 sentences",
  "conflict": "string - main conflict",
  "ending": "string - ending description",
  "characters": [{"name": "...", "role": "...", "description": "..."}],
  "locations": [{"name": "...", "location_id": "loc_...", "description": "...", "environment": "..."}],
  "episode_structure": [{"episode": 1, "title": "...", "summary": "..."}],
  "source_story_id": "kebab-case-title"
}

Rules:
- Characters must have logical_location_hint matching locations
- No contradictions in setting/era
- Duration must match episode count
- Return ONLY JSON, no extra text`

  const prompt = `Story Idea: ${input.storyIdea}

Theme: ${input.theme}
Genre: ${input.genre}
Tone: ${input.tone}
Episodes: ${input.episodeCount}
Duration: ${input.duration_per_episode_seconds}s per episode, total ${input.total_duration_seconds}s

Generate story JSON now. Output valid JSON only.`

  return { system, prompt }
}

export async function generateStoryViaNexusBrain(input: StoryInput) {
  const requestId = `story-${Date.now()}`
  console.log(`[StoryEngine] Buat Cerita requested - Request ${requestId} - Routing to NEXUS RESEARCH + NEXUS Brain`)
  console.log(`[StoryEngine] Input: Theme="${input.theme}", Genre=${input.genre}, Episodes=${input.episodeCount}, Idea=${input.storyIdea.slice(0, 100)}...`)

  // === STEP 1-7: RESEARCH LAYER (if required) ===
  let researchResult: any = null
  let finalSystemPrompt = ''
  let finalPrompt = ''
  let factsForPrompt: any[] = []

  try {
    const researchConfig = getResearchConfig()
    console.log(`[StoryEngine] Research config: enabled=${researchConfig.enabled}, wikipedia=${researchConfig.wikipediaEnabled}`)

    if (researchConfig.enabled) {
      console.log(`[StoryEngine] Step 1-7: Running RESEARCH PIPELINE for "${input.theme}"`)
      researchResult = await runResearchPipeline(input.theme, input.storyIdea, input.genre, requestId)
      
      console.log(`[StoryEngine] Research result: Status=${researchResult.status}, SubjectType=${researchResult.subjectType}, Intent=${researchResult.intent}, RequiresResearch=${researchResult.classified.requiresResearch}`)
      console.log(`[StoryEngine] Research sources: ${researchResult.totalSources}, Supported facts: ${researchResult.grounding.summary.supported}, Reason: ${researchResult.statusReason}`)

      // If research BLOCKED for real subject, return BLOCKED status — don't fake story
      if (researchResult.status === 'BLOCKED' && researchResult.classified.requiresResearch) {
        console.warn(`[StoryEngine] Research BLOCKED for real subject "${input.theme}" — returning BLOCKED status, not fake story`)
        return {
          ok: false,
          error: `RESEARCH NOT CONFIGURED / BLOCKED — ${researchResult.statusReason}\n\nSubjek "${input.theme}" terdeteksi sebagai ${researchResult.subjectType} dengan intent ${researchResult.intent} yang memerlukan research faktual, tapi tidak ada sumber publik yang berhasil diambil. NEXUS tidak boleh mengarang fakta biografi. Status: BLOCKED, bukan PASS dengan karangan.\n\nSumber yang dicoba: Wikipedia ID/EN via ${researchResult.planner.queries.join(', ')}\nHasil: 0 sumber\n\nJika ini adalah tokoh nyata, pastikan nama dieja dengan benar dan memiliki halaman Wikipedia. Jika tema biasa seperti Nasi goreng, research tidak diperlukan dan akan otomatis NOT_REQUIRED.`,
          provider: 'none',
          model: null,
          fallbackChain: [],
          triedProviders: [],
          nexusBrainUsed: false,
          research: researchResult,
          status: 'BLOCKED',
          verification: `Research BLOCKED for real subject "${input.theme}" — no sources — must not fabricate`,
        }
      }

      // If research NOT_REQUIRED (e.g., Nasi goreng), proceed with normal prompt
      if (researchResult.status === 'NOT_REQUIRED') {
        console.log(`[StoryEngine] Research NOT_REQUIRED for "${input.theme}" — proceeding with normal story generation (like Nasi goreng, Kucing, A, etc.)`)
        const { system, prompt } = buildStoryPrompt(input)
        finalSystemPrompt = system
        finalPrompt = prompt
      } else {
        // Research COMPLETED or PARTIAL — create fact-aware prompt
        console.log(`[StoryEngine] Research ${researchResult.status} — creating fact-aware prompt with ${researchResult.grounding.summary.supported} SUPPORTED facts from ${researchResult.sourcesUsed.length} sources`)
        const { system, prompt } = buildStoryPrompt(input)
        const factAware = createFactAwarePrompt(
          prompt,
          system,
          researchResult.grounding,
          researchResult.sourcesUsed,
          input.theme,
          researchResult.intent
        )
        finalSystemPrompt = factAware.system
        finalPrompt = factAware.prompt
        factsForPrompt = factAware.facts
      }
    } else {
      console.log(`[StoryEngine] Research disabled via config — proceeding with normal prompt`)
      const { system, prompt } = buildStoryPrompt(input)
      finalSystemPrompt = system
      finalPrompt = prompt
    }
  } catch (e: any) {
    console.error(`[StoryEngine] Research pipeline error: ${e.message} — proceeding with normal generation but marking research as FAILED`)
    // Don't block story generation if research fails for non-real subjects
    // For real subjects, we should still try to generate but with warning
    const { system, prompt } = buildStoryPrompt(input)
    finalSystemPrompt = system
    finalPrompt = prompt
    researchResult = {
      status: 'FAILED',
      statusReason: `Research pipeline error: ${e.message}`,
      subject: input.theme,
      subjectType: 'UNKNOWN',
      sourcesUsed: [],
      grounding: { summary: { supported: 0, total: 0 } },
      classified: { requiresResearch: false, subjectType: 'UNKNOWN' }
    }
  }

  // === STEP 8-9: STORY PLANNER + STORY GENERATOR via NEXUS BRAIN ===
  console.log(`[StoryEngine] Step 8-9: Story Planner + Generator via NEXUS Brain — Request ${requestId}`)

  const options: NexusGenerateOptions & { engine: string } = {
    prompt: finalPrompt,
    systemPrompt: finalSystemPrompt,
    temperature: 0.8,
    maxTokens: 4000,
    engine: 'story',
    requestId,
  }

  // MANDATORY: Use NEXUS Brain via ProviderManager, NOT Gemini directly
  const result = await ProviderManager.generateForNexusPath(options)

  if (!result.ok) {
    console.error(`[StoryEngine] NEXUS Brain failed: ${result.error}`)
    return {
      ok: false,
      error: result.error,
      provider: result.provider,
      model: result.model,
      fallbackChain: result.fallbackChain,
      triedProviders: result.triedProviders,
      nexusBrainUsed: result.nexusBrainUsed,
      research: researchResult,
      verification: `NEXUS Brain path enforced - Provider: ${result.provider} - Chain: ${result.fallbackChain.join(' -> ')} - Gemini NOT used`,
    }
  }

  // FIXED 2026-05-14 — JSON PARSER RESILIENCE — cleanJsonString + multi-attempt parsing like script-engine.ts to avoid "AI provider gagal menghasilkan JSON valid"
  function cleanJsonString(raw: string): string {
    let t = raw || '';
    t = t.replace(/^\uFEFF/, '').trim();
    const codeBlockMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) t = codeBlockMatch[1].trim();
    const firstBrace = t.indexOf('{');
    const lastBrace = t.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace && firstBrace > 0) {
      const candidate = t.substring(firstBrace, lastBrace + 1);
      if (candidate.length > 20) t = candidate;
    }
    t = t.replace(/\/\*[\s\S]*?\*\//g, '');
    t = t.replace(/(^|\n)\s*\/\/.*$/gm, '$1');
    t = t.replace(/,\s*([}\]])/g, '$1');
    t = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    return t.trim();
  }

  function safeParseJsonFromLLM(raw: string): { success: boolean; data?: any; error?: string; attempts: string[] } {
    const attempts: string[] = [];
    if (!raw || typeof raw !== 'string') return { success: false, error: 'Empty input', attempts: ['empty'] };
    let txt = raw.trim();
    try {
      const data = JSON.parse(txt);
      attempts.push('direct SUCCESS');
      return { success: true, data, attempts };
    } catch (e: any) { attempts.push(`direct FAIL: ${e.message.slice(0,100)}`); }
    try {
      const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch) {
        const inner = codeBlockMatch[1].trim();
        const data = JSON.parse(inner);
        attempts.push('codeblock SUCCESS');
        return { success: true, data, attempts };
      } else attempts.push('codeblock not found');
    } catch (e: any) { attempts.push(`codeblock FAIL: ${e.message.slice(0,100)}`); }
    try {
      const cleaned = cleanJsonString(raw);
      const data = JSON.parse(cleaned);
      attempts.push('cleaned SUCCESS');
      return { success: true, data, attempts };
    } catch (e: any) { attempts.push(`cleaned FAIL: ${e.message.slice(0,100)}`); }
    try {
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        let candidate = raw.substring(first, last + 1);
        candidate = cleanJsonString(candidate);
        const data = JSON.parse(candidate);
        attempts.push('extract-braces SUCCESS');
        return { success: true, data, attempts };
      } else attempts.push('extract-braces no braces');
    } catch (e: any) { attempts.push(`extract-braces FAIL: ${e.message.slice(0,100)}`); }
    try {
      let candidate = raw;
      const first = candidate.indexOf('{');
      const last = candidate.lastIndexOf('}');
      if (first !== -1 && last !== -1) candidate = candidate.substring(first, last + 1);
      candidate = candidate.replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1').replace(/,\s*([}\]])/g, '$1').replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/'([^']*)'\s*:/g, '"$1":').replace(/:\s*'([^']*)'/g, ': "$1"').replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
      candidate = candidate.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      const data = JSON.parse(candidate);
      attempts.push('aggressive SUCCESS');
      return { success: true, data, attempts };
    } catch (e: any) { attempts.push(`aggressive FAIL: ${e.message.slice(0,100)}`); }
    return { success: false, error: `All parse attempts failed: ${attempts.join(' | ')}`, attempts };
  }

  let jsonData: StoryOutput | null = null
  let parseAttempts: string[] = []
  const rawText = result.text || ''
  const parseResult = safeParseJsonFromLLM(rawText)
  parseAttempts = parseResult.attempts
  if (parseResult.success && parseResult.data) {
    jsonData = parseResult.data as StoryOutput
    console.log(`[StoryEngine] JSON PARSE SUCCESS — attempts: ${parseAttempts.join(' | ')} — Provider: ${result.provider}`)
  } else {
    console.error(`[StoryEngine] JSON PARSE FAILED after all cleaners — ${parseResult.error} — attempts: ${parseAttempts.join(' | ')} — raw: ${rawText.slice(0,500)}`)
    return {
      ok: false,
      error: `AI provider gagal menghasilkan JSON valid setelah ${parseAttempts.length} percobaan pembersihan. Provider: ${result.provider}. Raw: ${rawText.slice(0,200)} — Coba lagi. Details: ${parseResult.error?.slice(0,300)}`,
      provider: result.provider,
      model: result.model,
      fallbackChain: result.fallbackChain,
      triedProviders: result.triedProviders,
      nexusBrainUsed: true,
      research: researchResult,
      rawText: rawText.slice(0, 500),
      parseAttempts
    }
  }

  console.log(`[StoryEngine] SUCCESS via NEXUS Brain - Provider: ${result.provider}, Model: ${result.model} - Now validating grounding`)

  // === STEP 10: GROUNDING VALIDATION ===
  let groundingValidation: any = null
  if (researchResult && researchResult.classified?.requiresResearch) {
    console.log(`[StoryEngine] Step 10: Grounding Validation for "${input.theme}"`)
    try {
      groundingValidation = validateStoryGrounding(jsonData as any, researchResult, input.theme)
      console.log(`[StoryEngine] Grounding validation: ${groundingValidation.isValid ? 'PASS' : 'FAIL'} — ${groundingValidation.overallReason}`)
      
      if (!groundingValidation.isValid) {
        console.warn(`[StoryEngine] Grounding validation FAIL — corrections needed:`, groundingValidation.correctionsNeeded)
        // Don't block story, but include validation result for transparency
        // If critical failure (e.g., name incorrect), we could return error, but for now include warning
      }
    } catch (e: any) {
      console.error(`[StoryEngine] Grounding validation error: ${e.message}`)
      groundingValidation = {
        isValid: false,
        overallReason: `Validation error: ${e.message}`,
        checks: {},
        factsUsedInStory: []
      }
    }
  }

  // Attach research and validation to story for evidence
  if (jsonData) {
    (jsonData as any)._research = researchResult ? {
      requestId: researchResult.requestId,
      subject: researchResult.subject,
      subjectType: researchResult.subjectType,
      intent: researchResult.intent,
      status: researchResult.status,
      statusReason: researchResult.statusReason,
      totalSources: researchResult.totalSources,
      sourcesUsed: researchResult.sourcesUsed.map((s: any) => ({ url: s.url, title: s.title, type: s.type, domain: s.domain })),
      groundingSummary: researchResult.grounding?.summary,
      supportedFacts: researchResult.grounding?.supportedFacts?.slice(0, 5).map((f: any) => ({ fact: f.fact, status: f.status, reason: f.reason, sources: f.supportingSources.map((s: any) => s.title) })),
      classified: researchResult.classified,
      timestamp: researchResult.researchTimestamp
    } : null
    ;(jsonData as any)._groundingValidation = groundingValidation
  }

  console.log(`[StoryEngine] FINAL — SUCCESS via NEXUS Brain - Provider: ${result.provider}, Model: ${result.model}, Research: ${researchResult?.status || 'NONE'}, Validation: ${groundingValidation?.isValid ? 'PASS' : groundingValidation ? 'FAIL' : 'SKIPPED'}`)

  return {
    ok: true,
    data: jsonData,
    provider: result.provider,
    model: result.model,
    role: result.role,
    fallbackChain: result.fallbackChain,
    triedProviders: result.triedProviders,
    nexusBrainUsed: true,
    research: researchResult,
    groundingValidation,
    verification: `Buat Cerita -> Research(${researchResult?.status || 'SKIPPED'}) -> NEXUS Brain -> ${result.provider.toUpperCase()} -> SUCCESS - Gemini NOT used - Chain: ${result.fallbackChain.join(' -> ')}`,
  }
}

// Legacy wrapper for backward compat - but still routes to NEXUS for story
export async function generateStory(input: StoryInput) {
  return generateStoryViaNexusBrain(input)
}
