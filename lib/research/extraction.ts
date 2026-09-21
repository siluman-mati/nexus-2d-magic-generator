// lib/research/extraction.ts — Source Extraction

import { ResearchSource, ExtractedFact } from './types'

function extractFactsFromText(source: ResearchSource): ExtractedFact[] {
  const facts: ExtractedFact[] = []
  const content = source.content || source.snippet || ''
  if (!content || content.length < 50) return facts

  const idBase = `${source.domain}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`

  // Extract sentences that look like factual statements
  const sentences = content.split(/[.!?]\s+/).filter(s => s.trim().length > 20 && s.trim().length < 400)

  let factCounter = 0

  for (const sentence of sentences.slice(0, 20)) {
    const trimmed = sentence.trim()
    if (!trimmed) continue

    // Heuristic categorization
    let category: ExtractedFact['category'] = 'GENERAL'
    const lower = trimmed.toLowerCase()

    if (/(lahir|born|tanggal lahir|kelahiran|wafat|meninggal|died)/i.test(trimmed)) {
      category = 'DATE'
    } else if (/(di .*lahir|tempat lahir|lahir di|born in|place of birth|kota|jakarta|bandung|surabaya|indonesia)/i.test(trimmed) && lower.includes('lahir')) {
      category = 'PLACE'
    } else if (/(ayah|ibu|anak|istri|suami|keluarga|father|mother|child|spouse|family)/i.test(trimmed)) {
      category = 'FAMILY'
    } else if (/(pekerjaan|bekerja|profesi|karier|job|work|career|presiden|menteri|gubernur|dokter|guru|pahlawan)/i.test(trimmed)) {
      category = 'JOB'
    } else if (/(sekolah|kuliah|universitas|pendidikan|education|school|university|sarjana|lulus)/i.test(trimmed)) {
      category = 'EDUCATION'
    } else if (/(peristiwa|kejadian|perang|kemerdekaan|proklamasi|event|battle|war|independence)/i.test(trimmed)) {
      category = 'EVENT'
    } else if (/(kutipan|berkata|mengatakan|quote|said|\"[^\"]+\")/i.test(trimmed)) {
      category = 'QUOTE'
    } else if (/(penghargaan|prestasi|award|achievement|medali|juara|nobel)/i.test(trimmed)) {
      category = 'AWARD'
    } else if (/(jabatan|posisi|menjabat|position|president|minister)/i.test(trimmed)) {
      category = 'POSITION'
    }

    facts.push({
      id: `${idBase}-${factCounter++}`,
      fact: trimmed,
      category,
      value: trimmed,
      sourceUrls: [source.url],
      sourceTitles: [source.title],
      confidence: 0.7
    })
  }

  // Also extract structured facts via regex for dates
  const dateRegex = /(\d{1,2}\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})|(\d{4})/g
  const dateMatches = content.match(dateRegex)
  if (dateMatches) {
    for (const dm of dateMatches.slice(0, 5)) {
      if (dm.length >= 4) {
        facts.push({
          id: `${idBase}-date-${factCounter++}`,
          fact: `Tanggal terkait: ${dm}`,
          category: 'DATE',
          value: dm,
          sourceUrls: [source.url],
          sourceTitles: [source.title],
          confidence: 0.6
        })
      }
    }
  }

  return facts
}

export function extractFacts(sources: ResearchSource[]): ExtractedFact[] {
  const allFacts: ExtractedFact[] = []

  console.log(`[Extraction] Extracting facts from ${sources.length} sources`)

  for (const source of sources) {
    const facts = extractFactsFromText(source)
    console.log(`[Extraction] Source ${source.title} — ${facts.length} facts extracted`)
    allFacts.push(...facts)
  }

  // Deduplicate facts by value (simple)
  const uniqueFacts = Array.from(new Map(allFacts.map(f => [f.fact.slice(0, 100), f])).values())

  console.log(`[Extraction] Total ${allFacts.length} facts, ${uniqueFacts.length} unique after dedup`)

  return uniqueFacts.slice(0, 30) // Limit
}
