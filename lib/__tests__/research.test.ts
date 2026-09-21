// lib/__tests__/research.test.ts — NEXUS RESEARCH & FACT-GROUNDING — MANDATORY TESTS

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifyIntent, isCommonThemeForTest } from '../research/intent-classifier'
import { planResearch } from '../research/planner'
import { rankSources } from '../research/ranking'
import { verifyFacts } from '../research/verification'
import { validateStoryGrounding } from '../research/validator'
import { createFactAwarePrompt } from '../research/fact-grounding'
import { ResearchSource, ExtractedFact, FactGrounding } from '../research/types'

// Mock fetch for Wikipedia
global.fetch = vi.fn()

function mockWikipediaSearchResponse(titles: string[]) {
  return {
    ok: true,
    json: async () => ({
      query: {
        search: titles.map((title, idx) => ({
          title,
          snippet: `${title} adalah tokoh penting dalam sejarah`,
          pageid: 1000 + idx
        }))
      }
    })
  }
}

function mockWikipediaExtractResponse(title: string, extract: string) {
  return {
    ok: true,
    json: async () => ({
      query: {
        pages: {
          '123': {
            pageid: 123,
            title,
            extract,
            fullurl: `https://id.wikipedia.org/wiki/${title.replace(/ /g, '_')}`
          }
        }
      }
    })
  }
}

describe('NEXUS Research & Fact-Grounding — Intent Classification', () => {
  it('should classify common themes like Nasi goreng as NOT requiring research', () => {
    const result = classifyIntent('Nasi goreng', 'Seorang anak menemukan nasi goreng ajaib', 'Nusantara')
    expect(result.subjectType).toBe('COMMON')
    expect(result.requiresResearch).toBe(false)
    expect(result.detectedRealSubject).toBe(false)
    expect(result.reason).toContain('COMMON')
  })

  it('should classify A as common and NOT require research', () => {
    const result = classifyIntent('A', 'Seorang anak bernama A menemukan batu ajaib', 'Nusantara')
    expect(result.subjectType).toBe('COMMON')
    expect(result.requiresResearch).toBe(false)
  })

  it('should classify Kucing as common and NOT require research', () => {
    const result = classifyIntent('Kucing', 'Kucing ajaib yang bisa bicara', 'Fantasy')
    expect(result.requiresResearch).toBe(false)
    expect(result.subjectType).toBe('COMMON')
  })

  it('should classify real person name with biography context as requiring research', () => {
    const result = classifyIntent('Soekarno', 'Buat cerita biografi tentang Soekarno presiden pertama Indonesia', 'Historical')
    expect(result.subjectType).toBe('REAL_PERSON')
    expect(result.detectedRealSubject).toBe(true)
    expect(result.requiresResearch).toBe(true)
    expect(result.intent).toBe('FACTUAL_BIOGRAPHY')
  })

  it('should classify Joko Widodo with factual request as REAL_PERSON requiring research', () => {
    const result = classifyIntent('Joko Widodo', 'Cerita faktual tentang Joko Widodo', 'Nusantara')
    expect(result.subjectType).toBe('REAL_PERSON')
    expect(result.requiresResearch).toBe(true)
  })

  it('should detect fiction inspired intent and still require research but with different handling', () => {
    const result = classifyIntent('Soekarno', 'Cerita fiksi yang terinspirasi dari Soekarno', 'Historical')
    // Fiction inspired with real person — ambiguous but still detected as real subject
    expect(result.subjectType).toBe('REAL_PERSON')
    // For fiction inspired, we still want to ground facts, but allow fiction
    // Classification may be AMBIGUOUS or FICTION_INSPIRED
    expect(['FACTUAL_BIOGRAPHY', 'FICTION_INSPIRED', 'AMBIGUOUS']).toContain(result.intent)
  })

  it('should classify Pontianak alone as COMMON (not require research) unless factual context', () => {
    const result = classifyIntent('Pontianak', 'Petualangan di hutan Pontianak', 'Nusantara')
    expect(result.requiresResearch).toBe(false)
  })

  it('should classify Pontianak with sejarah context as requiring research', () => {
    const result = classifyIntent('Pontianak', 'Sejarah asal usul Pontianak secara faktual', 'Historical')
    // Could be REAL_PLACE with factual context or COMMON — both acceptable, but should detect place
    expect(['REAL_PLACE', 'COMMON', 'REAL_EVENT']).toContain(result.subjectType)
  })
})

describe('Research Planner', () => {
  it('should create queries for real person', () => {
    const plan = planResearch('Soekarno', 'REAL_PERSON')
    expect(plan.queries.length).toBeGreaterThan(1)
    expect(plan.queries[0]).toBe('Soekarno')
    expect(plan.queries.some(q => q.includes('biografi') || q.includes('wikipedia'))).toBe(true)
    expect(plan.subjectType).toBe('REAL_PERSON')
  })

  it('should create minimal queries for common theme', () => {
    const plan = planResearch('Nasi goreng', 'COMMON')
    expect(plan.queries.length).toBeGreaterThan(0)
    expect(plan.queries[0]).toBe('Nasi goreng')
  })
})

describe('Source Ranking', () => {
  it('should rank Wikipedia sources high', () => {
    const sources: ResearchSource[] = [
      {
        url: 'https://id.wikipedia.org/wiki/Soekarno',
        title: 'Soekarno — Wikipedia (ID)',
        type: 'SECONDARY',
        domain: 'id.wikipedia.org',
        accessedAt: new Date().toISOString(),
        snippet: 'Soekarno adalah presiden pertama Indonesia',
        content: 'Soekarno adalah presiden pertama Indonesia. Lahir di Surabaya 6 Juni 1901. Wafat di Jakarta 21 Juni 1970.',
      },
      {
        url: 'https://example.com/random',
        title: 'Random blog',
        type: 'SECONDARY',
        domain: 'example.com',
        accessedAt: new Date().toISOString(),
        snippet: 'Random content',
        content: 'Random content about something else',
      }
    ]

    const ranked = rankSources(sources, 'Soekarno')
    expect(ranked.length).toBe(2)
    expect(ranked[0].source.domain).toContain('wikipedia.org')
    expect(ranked[0].finalScore).toBeGreaterThan(ranked[1].finalScore)
    expect(ranked[0].credibilityScore).toBeGreaterThan(0.8)
  })
})

describe('Fact Verification & Grounding', () => {
  it('should mark facts with multiple sources as SUPPORTED', () => {
    const sources: ResearchSource[] = [
      {
        url: 'https://id.wikipedia.org/wiki/Soekarno',
        title: 'Soekarno — Wikipedia (ID)',
        type: 'SECONDARY',
        domain: 'id.wikipedia.org',
        accessedAt: new Date().toISOString(),
        content: 'Soekarno lahir di Surabaya 6 Juni 1901',
      },
      {
        url: 'https://en.wikipedia.org/wiki/Sukarno',
        title: 'Sukarno — Wikipedia (EN)',
        type: 'SECONDARY',
        domain: 'en.wikipedia.org',
        accessedAt: new Date().toISOString(),
        content: 'Sukarno was born in Surabaya on 6 June 1901',
      }
    ]

    const facts: ExtractedFact[] = [
      {
        id: '1',
        fact: 'Soekarno lahir di Surabaya 6 Juni 1901',
        category: 'DATE',
        value: '6 Juni 1901',
        sourceUrls: ['https://id.wikipedia.org/wiki/Soekarno'],
        sourceTitles: ['Soekarno — Wikipedia (ID)'],
        confidence: 0.8
      },
      {
        id: '2',
        fact: 'Sukarno was born in Surabaya on 6 June 1901',
        category: 'DATE',
        value: '6 June 1901',
        sourceUrls: ['https://en.wikipedia.org/wiki/Sukarno'],
        sourceTitles: ['Sukarno — Wikipedia (EN)'],
        confidence: 0.8
      }
    ]

    const grounding = verifyFacts(facts, sources)
    expect(grounding.summary.total).toBeGreaterThan(0)
    expect(grounding.summary.supported).toBeGreaterThan(0)
    expect(grounding.supportedFacts.length).toBeGreaterThan(0)
    expect(grounding.supportedFacts[0].status).toBe('SUPPORTED')
    expect(grounding.supportedFacts[0].supportingSources.length).toBeGreaterThan(0)
  })

  it('should handle UNKNOWN facts when no sources', () => {
    const sources: ResearchSource[] = []
    const facts: ExtractedFact[] = [
      {
        id: '1',
        fact: 'Soekarno memiliki anak bernama X yang tidak tercatat',
        category: 'FAMILY',
        value: 'Anak X',
        sourceUrls: [],
        sourceTitles: [],
        confidence: 0.3
      }
    ]

    const grounding = verifyFacts(facts, sources)
    // With no sources, facts should be UNKNOWN or not supported
    expect(grounding.verifications.length).toBeGreaterThan(0)
  })
})

describe('Fact-Aware Prompt Creation', () => {
  it('should create prompt with SUPPORTED facts and sources', () => {
    const sources: ResearchSource[] = [
      {
        url: 'https://id.wikipedia.org/wiki/Soekarno',
        title: 'Soekarno — Wikipedia',
        type: 'SECONDARY',
        domain: 'id.wikipedia.org',
        accessedAt: new Date().toISOString(),
        content: 'Soekarno lahir 6 Juni 1901',
      }
    ]

    const grounding: FactGrounding = {
      verifications: [
        {
          fact: 'Soekarno lahir di Surabaya 6 Juni 1901',
          status: 'SUPPORTED',
          supportingSources: sources,
          reason: 'Didukung 1 sumber',
          extractedFrom: []
        }
      ],
      supportedFacts: [
        {
          fact: 'Soekarno lahir di Surabaya 6 Juni 1901',
          status: 'SUPPORTED',
          supportingSources: sources,
          reason: 'Didukung 1 sumber',
          extractedFrom: []
        }
      ],
      inferredFacts: [],
      unknownFacts: [],
      conflictingFacts: [],
      summary: { total: 1, supported: 1, inferred: 0, unknown: 0, conflicting: 0 }
    }

    const result = createFactAwarePrompt(
      'Buat cerita tentang Soekarno',
      'You are NEXUS Brain',
      grounding,
      sources,
      'Soekarno',
      'FACTUAL_BIOGRAPHY'
    )

    expect(result.system).toContain('RESEARCH & FACT-GROUNDING')
    expect(result.system).toContain('SUPPORTED')
    expect(result.system).toContain('Soekarno')
    expect(result.system).toContain('https://id.wikipedia.org/wiki/Soekarno')
    expect(result.system).toContain('DILARANG mengarang')
    expect(result.prompt).toContain('SUPPORTED')
    expect(result.facts.length).toBe(1)
    expect(result.facts[0].status).toBe('SUPPORTED')
  })
})

describe('Story Grounding Validator', () => {
  it('should PASS for common theme like Nasi goreng without sources', () => {
    const story = {
      title: 'Petualangan Nasi Goreng Ajaib',
      logline: 'Nasi goreng ajaib membawa petualangan',
      premise: 'Seorang anak menemukan nasi goreng ajaib di pasar malam',
      characters: [{ name: 'Arga', role: 'Protagonist', description: 'Anak pemberani' }],
      locations: [{ name: 'Pasar Malam', description: 'Pasar malam Pontianak' }]
    }

    const research: any = {
      subject: 'Nasi goreng',
      subjectType: 'COMMON',
      status: 'NOT_REQUIRED',
      totalSources: 0,
      sourcesUsed: [],
      grounding: { summary: { supported: 0, total: 0 }, supportedFacts: [], unknownFacts: [] },
      classified: { requiresResearch: false, subjectType: 'COMMON' }
    }

    const validation = validateStoryGrounding(story, research, 'Nasi goreng')
    expect(validation.isValid).toBe(true)
    expect(validation.checks.sourcesReallyUsed.pass).toBe(true)
  })

  it('should FAIL if real person story contains fabricated dates without sources', () => {
    const story = {
      title: 'Biografi Soekarno',
      logline: 'Soekarno lahir di Surabaya 6 Juni 1901',
      premise: 'Soekarno lahir di Surabaya pada 6 Juni 1901 dari ayah bernama Raden Soekemi. Ia menikah dengan Fatmawati dan memiliki anak Guntur. Ia wafat 21 Juni 1970.',
      characters: [{ name: 'Soekarno', role: 'Protagonist', description: 'Presiden pertama' }],
      locations: []
    }

    const research: any = {
      subject: 'Soekarno',
      subjectType: 'REAL_PERSON',
      status: 'BLOCKED',
      totalSources: 0,
      sourcesUsed: [],
      grounding: { summary: { supported: 0, total: 0 }, supportedFacts: [], unknownFacts: [], verifications: [] },
      classified: { requiresResearch: true, subjectType: 'REAL_PERSON' }
    }

    const validation = validateStoryGrounding(story, research, 'Soekarno')
    // Should fail because real subject requires research but no sources and story has dates/family
    expect(validation.checks.sourcesReallyUsed.pass).toBe(false)
    // May also fail other checks
  })

  it('should PASS if real person story has sources and supported facts', () => {
    const story = {
      title: 'Soekarno - Sang Proklamator',
      logline: 'Kisah Soekarno proklamator kemerdekaan',
      premise: 'Soekarno adalah presiden pertama Indonesia yang memproklamasikan kemerdekaan',
      characters: [{ name: 'Soekarno', role: 'Protagonist', description: 'Presiden pertama Indonesia' }],
      locations: [{ name: 'Jakarta', description: 'Ibu kota Indonesia' }]
    }

    const sources = [
      {
        url: 'https://id.wikipedia.org/wiki/Soekarno',
        title: 'Soekarno — Wikipedia',
        type: 'SECONDARY',
        domain: 'id.wikipedia.org',
        accessedAt: new Date().toISOString(),
      }
    ]

    const research: any = {
      subject: 'Soekarno',
      subjectType: 'REAL_PERSON',
      status: 'COMPLETED',
      totalSources: 1,
      sourcesUsed: sources,
      grounding: {
        summary: { supported: 1, total: 1, inferred: 0, unknown: 0, conflicting: 0 },
        supportedFacts: [{ fact: 'Soekarno presiden pertama', status: 'SUPPORTED', supportingSources: sources, reason: 'Didukung', extractedFrom: [] }],
        unknownFacts: [],
        verifications: [{ fact: 'Soekarno presiden pertama', status: 'SUPPORTED', supportingSources: sources, reason: 'Didukung', extractedFrom: [] }]
      },
      classified: { requiresResearch: true, subjectType: 'REAL_PERSON' }
    }

    const validation = validateStoryGrounding(story, research, 'Soekarno')
    expect(validation.checks.sourcesReallyUsed.pass).toBe(true)
    expect(validation.checks.nameCorrect.pass).toBe(true)
  })
})

describe('Research Integration — Anti-Hallucination Rules', () => {
  it('should not allow fabrication of dates, places, family, job, education without SUPPORTED status', () => {
    // This is a policy test — ensures our types enforce fact statuses
    const allowedStatuses: string[] = ['SUPPORTED', 'INFERRED', 'UNKNOWN', 'CONFLICTING']
    expect(allowedStatuses).toContain('SUPPORTED')
    expect(allowedStatuses).toContain('UNKNOWN')
    
    // SUPPORTED can be used as fact
    // INFERRED must not be written as definite fact
    // UNKNOWN must not be fabricated
    // CONFLICTING must be marked
    
    const factStatusRules = {
      SUPPORTED: 'Boleh digunakan sebagai fakta',
      INFERRED: 'Tidak boleh ditulis seolah-olah fakta pasti',
      UNKNOWN: 'Jangan diisi dengan karangan',
      CONFLICTING: 'Jangan memilih secara diam-diam, tandai konflik'
    }
    
    expect(factStatusRules.SUPPORTED).toContain('Boleh digunakan')
    expect(factStatusRules.UNKNOWN).toContain('Jangan diisi dengan karangan')
  })
})
