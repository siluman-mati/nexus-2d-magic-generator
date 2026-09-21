// lib/research/index.ts — NEXUS RESEARCH & FACT-GROUNDING — Orchestrator
// ARCHITECTURE WAJIB:
// User Input → Intent/Subject Classification → Research Planner → Source Retrieval → Source Extraction → Source Ranking → Cross-Source Verification → Fact Grounding → Story Planner → Story Generator → Grounding Validation → Final Story

import { classifyIntent } from './intent-classifier'
import { planResearch } from './planner'
import { retrieveForQueries } from './retrieval'
import { extractFacts } from './extraction'
import { rankSources } from './ranking'
import { verifyFacts } from './verification'
import { ResearchResult, ResearchSource, RankedSource, ExtractedFact, FactGrounding, RetrievalResult } from './types'
import { getResearchConfig } from '../config'

export async function runResearchPipeline(
  theme: string,
  storyIdea: string,
  genre: string,
  requestId: string
): Promise<ResearchResult> {

  const timestamp = new Date().toISOString()
  console.log(`[Research] Request ${requestId} — Starting pipeline for theme "${theme}" — ${timestamp}`)

  // 1. Intent/Subject Classification
  console.log(`[Research] Step 1: Intent/Subject Classification`)
  const classified = classifyIntent(theme, storyIdea, genre)
  console.log(`[Research] Classification:`, classified)

  // If not requiring research (e.g., Nasi goreng, Kucing, A), return NOT_REQUIRED
  if (!classified.requiresResearch) {
    console.log(`[Research] Research NOT_REQUIRED for "${theme}" — ${classified.reason}`)
    return {
      requestId,
      subject: theme,
      subjectType: classified.subjectType,
      intent: classified.intent,
      classified,
      planner: {
        queries: [],
        subject: theme,
        subjectType: classified.subjectType,
        reason: `Tidak perlu research — ${classified.reason}`
      },
      retrievals: [],
      rankedSources: [],
      extractedFacts: [],
      grounding: {
        verifications: [],
        supportedFacts: [],
        inferredFacts: [],
        unknownFacts: [],
        conflictingFacts: [],
        summary: { total: 0, supported: 0, inferred: 0, unknown: 0, conflicting: 0 }
      },
      status: 'NOT_REQUIRED',
      statusReason: `Research tidak diperlukan untuk tema "${theme}" tipe ${classified.subjectType} — contoh: Nasi goreng, Kucing, A, Arga, Batu ajaib tetap dapat dibuat tanpa research`,
      totalSources: 0,
      sourcesUsed: [],
      researchTimestamp: timestamp
    }
  }

  // 2. Research Planner
  console.log(`[Research] Step 2: Research Planner`)
  const planner = planResearch(theme, classified.subjectType)
  console.log(`[Research] Planner:`, planner)

  // 3. Source Retrieval
  console.log(`[Research] Step 3: Source Retrieval — ${planner.queries.length} queries`)
  const retrievals = await retrieveForQueries(planner.queries, requestId)
  
  const allSources: ResearchSource[] = []
  for (const ret of retrievals) {
    allSources.push(...ret.sources)
  }

  // Deduplicate sources by URL
  const uniqueSources = Array.from(new Map(allSources.map(s => [s.url, s])).values())
  console.log(`[Research] Retrieval completed — ${uniqueSources.length} unique sources from ${retrievals.length} queries`)

  // If no sources found for real subject → BLOCKED
  if (uniqueSources.length === 0) {
    const config = getResearchConfig()
    console.warn(`[Research] No sources found for real subject "${theme}" — Status BLOCKED`)
    
    if (config.blockOnNoSourcesForRealSubject) {
      return {
        requestId,
        subject: theme,
        subjectType: classified.subjectType,
        intent: classified.intent,
        classified,
        planner,
        retrievals,
        rankedSources: [],
        extractedFacts: [],
        grounding: {
          verifications: [],
          supportedFacts: [],
          inferredFacts: [],
          unknownFacts: [],
          conflictingFacts: [],
          summary: { total: 0, supported: 0, inferred: 0, unknown: 0, conflicting: 0 }
        },
        status: 'BLOCKED',
        statusReason: `RESEARCH NOT CONFIGURED / BLOCKED — Tidak ada sumber publik yang ditemukan untuk subjek nyata "${theme}" tipe ${classified.subjectType}. Retrieval dari Wikipedia ID/EN gagal atau tidak ada hasil. Jangan gunakan karangan model sebagai pengganti. Status harus BLOCKED, bukan PASS dengan karangan.`,
        totalSources: 0,
        sourcesUsed: [],
        researchTimestamp: timestamp
      }
    }
  }

  // 4. Source Extraction
  console.log(`[Research] Step 4: Source Extraction from ${uniqueSources.length} sources`)
  const extractedFacts = extractFacts(uniqueSources)

  // 5. Source Ranking
  console.log(`[Research] Step 5: Source Ranking`)
  const rankedSources: RankedSource[] = []
  for (const query of planner.queries.slice(0, 2)) {
    const ranked = rankSources(uniqueSources, query)
    rankedSources.push(...ranked)
  }
  // Deduplicate ranked and sort
  const uniqueRanked = Array.from(new Map(rankedSources.map(r => [r.source.url, r])).values())
  uniqueRanked.sort((a, b) => b.finalScore - a.finalScore)

  // 6. Cross-Source Verification & 7. Fact Grounding
  console.log(`[Research] Step 6-7: Cross-Source Verification & Fact Grounding`)
  const grounding = verifyFacts(extractedFacts, uniqueSources)

  // Determine final status
  let status: ResearchResult['status'] = 'COMPLETED'
  let statusReason = ''

  if (uniqueSources.length === 0) {
    status = 'BLOCKED'
    statusReason = `BLOCKED — No sources retrieved for "${theme}"`
  } else if (grounding.summary.supported === 0) {
    status = 'PARTIAL'
    statusReason = `PARTIAL — ${uniqueSources.length} sumber diambil tapi 0 fakta SUPPORTED diekstrak — mungkin konten sumber terlalu pendek atau tidak relevan`
  } else if (uniqueSources.length >= 2 && grounding.summary.supported >= 2) {
    status = 'COMPLETED'
    statusReason = `COMPLETED — ${uniqueSources.length} sumber independen, ${grounding.summary.supported} fakta SUPPORTED — memenuhi aturan multi-source untuk fakta penting`
  } else {
    status = 'PARTIAL'
    statusReason = `PARTIAL — ${uniqueSources.length} sumber, ${grounding.summary.supported} SUPPORTED — research berhasil tapi terbatas`
  }

  const result: ResearchResult = {
    requestId,
    subject: theme,
    subjectType: classified.subjectType,
    intent: classified.intent,
    classified,
    planner,
    retrievals,
    rankedSources: uniqueRanked.slice(0, 5),
    extractedFacts: extractedFacts.slice(0, 20),
    grounding,
    status,
    statusReason,
    totalSources: uniqueSources.length,
    sourcesUsed: uniqueSources.slice(0, 5),
    researchTimestamp: timestamp
  }

  console.log(`[Research] Pipeline completed — Status: ${status} — ${statusReason} — Sources: ${result.totalSources}, Supported facts: ${grounding.summary.supported}`)

  return result
}

export function isResearchRequired(theme: string, storyIdea: string, genre: string): boolean {
  const classified = classifyIntent(theme, storyIdea, genre)
  return classified.requiresResearch
}

// Re-export types and functions
export * from './types'
export { classifyIntent } from './intent-classifier'
export { planResearch } from './planner'
export { retrieveSources, retrieveForQueries } from './retrieval'
export { extractFacts } from './extraction'
export { rankSources } from './ranking'
export { verifyFacts } from './verification'
export { createFactAwarePrompt } from './fact-grounding'
export { validateStoryGrounding } from './validator'
