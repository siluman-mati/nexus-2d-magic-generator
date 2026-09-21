// lib/research/planner.ts — Research Planner

import { ResearchPlannerResult, SubjectType } from './types'

export function planResearch(subject: string, subjectType: SubjectType): ResearchPlannerResult {
  const queries: string[] = []
  const normalized = subject.trim()

  // Base query
  queries.push(normalized)

  // For real persons, add biography queries
  if (subjectType === 'REAL_PERSON') {
    queries.push(`${normalized} biografi`)
    queries.push(`${normalized} biography`)
    queries.push(`${normalized} tanggal lahir`)
    queries.push(`${normalized} wikipedia`)
  } else if (subjectType === 'REAL_EVENT') {
    queries.push(`${normalized} sejarah`)
    queries.push(`${normalized} wikipedia`)
    queries.push(`${normalized} fakta`)
  } else if (subjectType === 'REAL_PLACE') {
    queries.push(`${normalized} sejarah`)
    queries.push(`${normalized} wikipedia`)
  } else if (subjectType === 'REAL_ORGANIZATION' || subjectType === 'REAL_HISTORICAL') {
    queries.push(`${normalized} wikipedia`)
    queries.push(`${normalized} sejarah`)
  }

  // Deduplicate
  const uniqueQueries = [...new Set(queries)].slice(0, 5)

  return {
    queries: uniqueQueries,
    subject: normalized,
    subjectType,
    reason: `Research planner membuat ${uniqueQueries.length} query untuk subjek "${normalized}" tipe ${subjectType}: ${uniqueQueries.join(', ')}`
  }
}
