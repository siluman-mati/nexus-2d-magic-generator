// lib/research/ranking.ts — Source Ranking

import { ResearchSource, RankedSource } from './types'

function scoreDomain(domain: string): number {
  // Wikipedia is credible secondary source
  if (domain.includes('wikipedia.org')) return 0.85
  if (domain.includes('britannica.com')) return 0.9
  if (domain.includes('gov') || domain.includes('ac.id') || domain.includes('edu')) return 0.9
  if (domain.includes('bbc.com') || domain.includes('kompas.com') || domain.includes('tempo.co')) return 0.75
  return 0.6
}

function scoreRelevance(source: ResearchSource, query: string): number {
  const content = (source.content || source.snippet || '').toLowerCase()
  const title = source.title.toLowerCase()
  const q = query.toLowerCase()
  
  let score = 0
  
  // Title contains query
  if (title.includes(q)) score += 0.4
  else if (q.split(' ').some(word => title.includes(word) && word.length > 3)) score += 0.2
  
  // Content contains query
  if (content.includes(q)) score += 0.3
  else {
    const queryWords = q.split(' ').filter(w => w.length > 3)
    const matchedWords = queryWords.filter(w => content.includes(w)).length
    score += (matchedWords / Math.max(queryWords.length, 1)) * 0.3
  }
  
  // Content length (more content = more facts)
  if (content.length > 1000) score += 0.2
  else if (content.length > 500) score += 0.1
  
  // Has snippet
  if (source.snippet && source.snippet.length > 50) score += 0.1
  
  return Math.min(score, 1.0)
}

export function rankSources(sources: ResearchSource[], query: string): RankedSource[] {
  console.log(`[Ranking] Ranking ${sources.length} sources for query "${query}"`)

  const ranked = sources.map(source => {
    const credibilityScore = scoreDomain(source.domain)
    const relevanceScore = scoreRelevance(source, query)
    const finalScore = (credibilityScore * 0.5 + relevanceScore * 0.5)

    return {
      source,
      relevanceScore,
      credibilityScore,
      finalScore
    }
  })

  // Sort by final score descending
  ranked.sort((a, b) => b.finalScore - a.finalScore)

  console.log(`[Ranking] Ranked sources:`, ranked.map(r => `${r.source.title} — score ${r.finalScore.toFixed(2)} (rel ${r.relevanceScore.toFixed(2)}, cred ${r.credibilityScore.toFixed(2)})`))

  return ranked
}
