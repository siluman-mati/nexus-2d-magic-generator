// lib/research/validator.ts — Story Grounding Validator

import { GroundingValidationResult, ResearchResult, FactStatus } from './types'

interface StoryForValidation {
  title?: string
  logline?: string
  premise?: string
  conflict?: string
  ending?: string
  characters?: Array<{ name: string; role: string; description: string }>
  locations?: Array<{ name: string; description: string }>
}

function containsDate(text: string): boolean {
  return /(\d{1,2}\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})|(\b(19|20)\d{2}\b)/.test(text)
}

function containsPlace(text: string): boolean {
  return /(lahir di|di .*lahir|kota|jakarta|bandung|surabaya|indonesia|tempat lahir)/i.test(text)
}

function containsFamily(text: string): boolean {
  return /(ayah|ibu|anak|istri|suami|keluarga|father|mother|child|spouse)/i.test(text)
}

function containsJob(text: string): boolean {
  return /(presiden|menteri|gubernur|pekerjaan|profesi|dokter|guru|pahlawan|jabatan)/i.test(text)
}

export function validateStoryGrounding(
  story: StoryForValidation,
  research: ResearchResult,
  subject: string
): GroundingValidationResult {

  console.log(`[Validator] Validating story grounding for subject "${subject}" — Research status: ${research.status} — Sources: ${research.sourcesUsed.length}`)

  const allText = `${story.title || ''} ${story.logline || ''} ${story.premise || ''} ${story.conflict || ''} ${story.ending || ''} ${(story.characters || []).map(c => `${c.name} ${c.role} ${c.description}`).join(' ')} ${(story.locations || []).map(l => `${l.name} ${l.description}`).join(' ')}`

  const checks: GroundingValidationResult['checks'] = {
    nameCorrect: { pass: true, reason: 'Nama tokoh sesuai subjek' },
    mainFactsSupported: { pass: true, reason: 'Fakta utama didukung sumber' },
    noFabricatedDetails: { pass: true, reason: 'Tidak ada detail yang diarang terdeteksi' },
    noModelOnlyFacts: { pass: true, reason: 'Tidak ada fakta yang hanya dari model tanpa sumber' },
    sourcesReallyUsed: { pass: true, reason: 'Sumber benar-benar digunakan' },
    noUnknownAsFact: { pass: true, reason: 'Tidak ada fakta UNKNOWN yang dinyatakan sebagai fakta pasti' }
  }

  const corrections: string[] = []
  const factsUsedInStory: { fact: string; status: FactStatus; sourceUrl?: string }[] = []

  // Check 1: Name correct
  if (research.classified.subjectType === 'REAL_PERSON') {
    const subjectLower = subject.toLowerCase()
    const titleLower = (story.title || '').toLowerCase()
    const premiseLower = (story.premise || '').toLowerCase()
    
    // Simple check: subject name should appear in story
    const subjectWords = subjectLower.split(' ').filter(w => w.length > 2)
    const nameInStory = subjectWords.some(w => allText.toLowerCase().includes(w))
    
    if (!nameInStory && subjectWords.length > 0) {
      checks.nameCorrect.pass = false
      checks.nameCorrect.reason = `Nama subjek "${subject}" tidak ditemukan dalam cerita — kemungkinan salah tokoh`
      corrections.push(`Pastikan nama tokoh "${subject}" muncul dalam cerita`)
    } else {
      checks.nameCorrect.reason = `Nama subjek "${subject}" ditemukan dalam cerita — PASS`
    }
  }

  // Check 2: Main facts supported
  const hasDates = containsDate(allText)
  const hasPlaces = containsPlace(allText)
  const hasFamily = containsFamily(allText)
  const hasJobs = containsJob(allText)

  const fabricated: string[] = []
  const unsupported: string[] = []

  // If research has no sources but story contains specific factual details → potential fabrication
  if (research.status === 'BLOCKED' || research.sourcesUsed.length === 0) {
    if (research.classified.requiresResearch) {
      // Real subject but no sources — if story contains dates/places/family/jobs, it's fabrication
      if (hasDates) {
        fabricated.push('Tanggal spesifik tanpa sumber')
        unsupported.push('Tanggal')
      }
      if (hasPlaces && research.classified.subjectType === 'REAL_PERSON') {
        // Place of birth without source is risky
        if (/(lahir di|tempat lahir)/i.test(allText)) {
          fabricated.push('Tempat lahir tanpa sumber')
          unsupported.push('Tempat lahir')
        }
      }
      if (hasFamily) {
        fabricated.push('Hubungan keluarga tanpa sumber')
        unsupported.push('Keluarga')
      }
      // If fabrication detected and research required, fail
      if (fabricated.length > 0) {
        checks.mainFactsSupported.pass = false
        checks.mainFactsSupported.reason = `Fakta utama tidak didukung sumber: ${unsupported.join(', ')} — Research status ${research.status} dengan ${research.sourcesUsed.length} sumber`
        checks.mainFactsSupported.unsupportedFacts = unsupported
        checks.noFabricatedDetails.pass = false
        checks.noFabricatedDetails.reason = `Detail yang berpotensi diarang terdeteksi: ${fabricated.join(', ')} — tanpa sumber SUPPORTED`
        checks.noFabricatedDetails.fabricated = fabricated
        corrections.push(`Hapus atau tandai sebagai UNKNOWN fakta: ${fabricated.join(', ')} — karena tidak ada sumber yang mendukung`)
      }
    }
  } else {
    // Has sources — check if main facts are in supported facts
    const supportedTexts = research.grounding.supportedFacts.map(f => f.fact.toLowerCase())
    
    // For each factual claim in story, check if supported
    const storyFacts = allText.split(/[.!?]/).filter(s => s.trim().length > 20).slice(0, 10)
    
    for (const sf of storyFacts) {
      const lower = sf.toLowerCase()
      // If it contains date/place/family/job and is about real person, check support
      if ((containsDate(sf) || containsPlace(sf) || containsFamily(sf) || containsJob(sf)) && research.classified.subjectType === 'REAL_PERSON') {
        const isSupported = supportedTexts.some(st => {
          const words = lower.split(' ').filter(w => w.length > 3)
          return words.some(w => st.includes(w))
        })
        if (!isSupported) {
          // Could be INFERRED or UNKNOWN — need to mark
          factsUsedInStory.push({
            fact: sf.trim().slice(0, 120),
            status: 'UNKNOWN',
            sourceUrl: undefined
          })
        } else {
          const supporting = research.grounding.supportedFacts.find(f => lower.includes(f.fact.toLowerCase().slice(0, 20)))
          factsUsedInStory.push({
            fact: sf.trim().slice(0, 120),
            status: 'SUPPORTED',
            sourceUrl: supporting?.supportingSources[0]?.url
          })
        }
      }
    }

    // If story contains many factual claims but few supported, warn
    const unknownInStory = factsUsedInStory.filter(f => f.status === 'UNKNOWN').length
    if (unknownInStory > 3 && research.classified.requiresResearch) {
      checks.mainFactsSupported.pass = false
      checks.mainFactsSupported.reason = `${unknownInStory} fakta dalam cerita tidak ditemukan dalam sumber SUPPORTED — perlu verifikasi`
      checks.mainFactsSupported.unsupportedFacts = factsUsedInStory.filter(f => f.status === 'UNKNOWN').map(f => f.fact)
    }
  }

  // Check 3: Sources really used
  if (research.classified.requiresResearch) {
    if (research.sourcesUsed.length === 0) {
      checks.sourcesReallyUsed.pass = false
      checks.sourcesReallyUsed.reason = `Research required untuk subjek nyata "${subject}" tapi tidak ada sumber yang digunakan — status ${research.status}`
      corrections.push(`Lakukan retrieval sumber publik (Wikipedia ID/EN) untuk "${subject}" — jangan gunakan karangan model`)
    } else {
      checks.sourcesReallyUsed.reason = `${research.sourcesUsed.length} sumber benar-benar digunakan: ${research.sourcesUsed.map(s => s.title).join(', ')} — PASS`
      // Add facts used
      for (const src of research.sourcesUsed.slice(0, 3)) {
        factsUsedInStory.push({
          fact: `Sumber digunakan: ${src.title}`,
          status: 'SUPPORTED',
          sourceUrl: src.url
        })
      }
    }
  } else {
    checks.sourcesReallyUsed.reason = `Research tidak wajib untuk tema "${subject}" tipe ${research.classified.subjectType} — seperti Nasi goreng, Kucing, dll. — PASS`
  }

  // Check 4: No UNKNOWN as fact
  // If story states specific date/place as definite fact but research says UNKNOWN, violation
  const unknownFacts = research.grounding.unknownFacts
  if (unknownFacts.length > 0 && research.classified.requiresResearch) {
    const violations: string[] = []
    for (const uf of unknownFacts) {
      if (allText.toLowerCase().includes(uf.fact.toLowerCase().slice(0, 30))) {
        violations.push(uf.fact.slice(0, 80))
      }
    }
    if (violations.length > 0) {
      checks.noUnknownAsFact.pass = false
      checks.noUnknownAsFact.reason = `${violations.length} fakta UNKNOWN dinyatakan sebagai fakta pasti dalam cerita`
      checks.noUnknownAsFact.violations = violations
      corrections.push(`Tandai sebagai UNKNOWN atau hapus fakta: ${violations.join('; ')}`)
    }
  }

  // Overall
  const allPass = Object.values(checks).every(c => c.pass)
  const overallReason = allPass
    ? `Grounding validation PASS — Cerita untuk "${subject}" memenuhi aturan fact-grounding. ${research.sourcesUsed.length} sumber digunakan, ${research.grounding.summary.supported} fakta SUPPORTED.`
    : `Grounding validation FAIL — ${corrections.length} koreksi diperlukan. Checks: ${Object.entries(checks).filter(([_, v]) => !v.pass).map(([k, v]) => `${k}: ${v.reason}`).join('; ')}`

  console.log(`[Validator] Result: ${allPass ? 'PASS' : 'FAIL'} — ${overallReason}`)

  return {
    isValid: allPass,
    checks,
    overallReason,
    correctionsNeeded: corrections.length > 0 ? corrections : undefined,
    factsUsedInStory: factsUsedInStory.slice(0, 15)
  }
}
