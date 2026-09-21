// lib/research/verification.ts — Cross-Source Verification + Fact Grounding

import { ResearchSource, ExtractedFact, VerificationResult, FactGrounding, FactStatus } from './types'

function normalizeFact(fact: string): string {
  return fact.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
}

function factsAreSimilar(f1: string, f2: string): boolean {
  const n1 = normalizeFact(f1)
  const n2 = normalizeFact(f2)
  // Simple similarity: share significant words
  const words1 = n1.split(' ').filter(w => w.length > 3)
  const words2 = n2.split(' ').filter(w => w.length > 3)
  const common = words1.filter(w => words2.includes(w)).length
  return common >= 2 && common / Math.max(words1.length, words2.length, 1) > 0.3
}

export function verifyFacts(extractedFacts: ExtractedFact[], sources: ResearchSource[]): FactGrounding {
  console.log(`[Verification] Verifying ${extractedFacts.length} facts across ${sources.length} sources`)

  const verifications: VerificationResult[] = []
  const grouped = new Map<string, ExtractedFact[]>()

  // Group similar facts
  for (const fact of extractedFacts) {
    let foundGroup = false
    for (const [key, group] of grouped) {
      if (factsAreSimilar(fact.fact, key)) {
        group.push(fact)
        foundGroup = true
        break
      }
    }
    if (!foundGroup) {
      grouped.set(fact.fact, [fact])
    }
  }

  console.log(`[Verification] Grouped into ${grouped.size} fact groups`)

  for (const [representative, group] of grouped) {
    const allUrls = [...new Set(group.flatMap(g => g.sourceUrls))]
    const allTitles = [...new Set(group.flatMap(g => g.sourceTitles))]
    const supportingSources = sources.filter(s => allUrls.includes(s.url))

    let status: FactStatus = 'UNKNOWN'
    let reason = ''

    if (supportingSources.length >= 2) {
      // Multiple independent sources
      status = 'SUPPORTED'
      reason = `Didukung oleh ${supportingSources.length} sumber independen: ${allTitles.join(', ')}`
    } else if (supportingSources.length === 1) {
      // Single source
      status = 'SUPPORTED'
      reason = `Didukung oleh 1 sumber: ${allTitles[0]} — perlu verifikasi silang untuk fakta penting`
    } else {
      status = 'UNKNOWN'
      reason = `Tidak ditemukan sumber yang mendukung fakta ini`
    }

    // Check for conflicting facts in same category
    // For simplicity, if same category has very different values, mark as conflicting
    // (In real implementation, would need more sophisticated conflict detection)

    verifications.push({
      fact: representative,
      status,
      supportingSources,
      reason,
      extractedFrom: group
    })
  }

  // Categorize
  const supportedFacts = verifications.filter(v => v.status === 'SUPPORTED')
  const inferredFacts = verifications.filter(v => v.status === 'INFERRED')
  const unknownFacts = verifications.filter(v => v.status === 'UNKNOWN')
  const conflictingFacts = verifications.filter(v => v.status === 'CONFLICTING')

  const grounding: FactGrounding = {
    verifications,
    supportedFacts,
    inferredFacts,
    unknownFacts,
    conflictingFacts,
    summary: {
      total: verifications.length,
      supported: supportedFacts.length,
      inferred: inferredFacts.length,
      unknown: unknownFacts.length,
      conflicting: conflictingFacts.length
    }
  }

  console.log(`[Verification] Grounding summary: Total ${grounding.summary.total}, Supported ${grounding.summary.supported}, Inferred ${grounding.summary.inferred}, Unknown ${grounding.summary.unknown}, Conflicting ${grounding.summary.conflicting}`)

  return grounding
}

export function groundImportantFacts(facts: string[], grounding: FactGrounding, sources: ResearchSource[]): VerificationResult[] {
  // For each important fact that will be used in story, check its grounding status
  const results: VerificationResult[] = []

  for (const fact of facts) {
    // Find supporting verification
    const supporting = grounding.verifications.find(v => factsAreSimilar(v.fact, fact))
    
    if (supporting) {
      results.push(supporting)
    } else {
      // Fact not found in extracted facts — UNKNOWN
      results.push({
        fact,
        status: 'UNKNOWN',
        supportingSources: [],
        reason: `Fakta "${fact.slice(0, 80)}..." tidak ditemukan dalam sumber yang diambil — status UNKNOWN, jangan diarang`,
        extractedFrom: []
      })
    }
  }

  return results
}
