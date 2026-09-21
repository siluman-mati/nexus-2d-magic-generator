// lib/research/types.ts — NEXUS RESEARCH & FACT-GROUNDING — MANDATORY

export type FactStatus = 'SUPPORTED' | 'INFERRED' | 'UNKNOWN' | 'CONFLICTING'

export type SubjectType = 
  | 'REAL_PERSON' 
  | 'REAL_EVENT' 
  | 'REAL_PLACE' 
  | 'REAL_ORGANIZATION' 
  | 'REAL_HISTORICAL' 
  | 'FICTIONAL' 
  | 'COMMON' // e.g. Nasi goreng, Kucing
  | 'UNKNOWN'

export type IntentType = 
  | 'FACTUAL_BIOGRAPHY' // A: cerita faktual/biografi
  | 'FICTION_INSPIRED' // B: cerita fiksi yang hanya menggunakan tokoh sebagai inspirasi
  | 'AMBIGUOUS'
  | 'FICTIONAL_STORY' // tema biasa

export interface ClassifiedIntent {
  subject: string
  subjectType: SubjectType
  intent: IntentType
  confidence: number
  requiresResearch: boolean
  reason: string
  detectedRealSubject: boolean
}

export interface ResearchSource {
  url: string
  title: string
  type: 'PRIMARY' | 'SECONDARY'
  domain: string
  accessedAt: string
  snippet?: string
  content?: string
  language?: string
}

export interface ExtractedFact {
  id: string
  fact: string
  category: 'DATE' | 'PLACE' | 'FAMILY' | 'JOB' | 'EDUCATION' | 'EVENT' | 'QUOTE' | 'ACHIEVEMENT' | 'AWARD' | 'POSITION' | 'TRAVEL' | 'HISTORICAL' | 'DIALOG' | 'PERSONAL' | 'GENERAL'
  value: string
  sourceUrls: string[]
  sourceTitles: string[]
  confidence: number
}

export interface RankedSource {
  source: ResearchSource
  relevanceScore: number
  credibilityScore: number
  finalScore: number
}

export interface VerificationResult {
  fact: string
  status: FactStatus
  supportingSources: ResearchSource[]
  conflictingSources?: ResearchSource[]
  reason: string
  extractedFrom: ExtractedFact[]
}

export interface FactGrounding {
  verifications: VerificationResult[]
  supportedFacts: VerificationResult[]
  inferredFacts: VerificationResult[]
  unknownFacts: VerificationResult[]
  conflictingFacts: VerificationResult[]
  summary: {
    total: number
    supported: number
    inferred: number
    unknown: number
    conflicting: number
  }
}

export interface ResearchPlannerResult {
  queries: string[]
  subject: string
  subjectType: SubjectType
  reason: string
}

export interface RetrievalResult {
  sources: ResearchSource[]
  query: string
  retrievedAt: string
  success: boolean
  error?: string
}

export interface ResearchResult {
  requestId: string
  subject: string
  subjectType: SubjectType
  intent: IntentType
  classified: ClassifiedIntent
  planner: ResearchPlannerResult
  retrievals: RetrievalResult[]
  rankedSources: RankedSource[]
  extractedFacts: ExtractedFact[]
  grounding: FactGrounding
  status: 'COMPLETED' | 'PARTIAL' | 'BLOCKED' | 'NOT_REQUIRED' | 'FAILED'
  statusReason: string
  totalSources: number
  sourcesUsed: ResearchSource[]
  researchTimestamp: string
}

export interface GroundingValidationResult {
  isValid: boolean
  checks: {
    nameCorrect: { pass: boolean; reason: string }
    mainFactsSupported: { pass: boolean; reason: string; unsupportedFacts?: string[] }
    noFabricatedDetails: { pass: boolean; reason: string; fabricated?: string[] }
    noModelOnlyFacts: { pass: boolean; reason: string }
    sourcesReallyUsed: { pass: boolean; reason: string }
    noUnknownAsFact: { pass: boolean; reason: string; violations?: string[] }
  }
  overallReason: string
  correctionsNeeded?: string[]
  factsUsedInStory: { fact: string; status: FactStatus; sourceUrl?: string }[]
}

export interface ResearchConfig {
  enabled: boolean
  wikipediaEnabled: boolean
  minSources: number
  requireMultipleSourcesForImportantFacts: boolean
  blockOnNoSourcesForRealSubject: boolean
}
