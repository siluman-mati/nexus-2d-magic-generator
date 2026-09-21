// lib/research/fact-grounding.ts — Fact Grounding + Story Planner integration

import { FactGrounding, ResearchSource, VerificationResult, FactStatus } from './types'

export interface StoryFact {
  fact: string
  category: string
  status: FactStatus
  sourceUrl?: string
  sourceTitle?: string
  reason: string
}

export function createFactAwarePrompt(
  originalPrompt: string,
  systemPrompt: string,
  grounding: FactGrounding,
  sources: ResearchSource[],
  subject: string,
  intent: string
): { system: string; prompt: string; facts: StoryFact[] } {

  const supportedFacts = grounding.supportedFacts.slice(0, 15)
  const unknownFacts: string[] = []

  const facts: StoryFact[] = supportedFacts.map(v => ({
    fact: v.fact,
    category: v.extractedFrom[0]?.category || 'GENERAL',
    status: v.status,
    sourceUrl: v.supportingSources[0]?.url,
    sourceTitle: v.supportingSources[0]?.title,
    reason: v.reason
  }))

  // Build fact-grounded system prompt addition
  const groundingInstructions = `
=== NEXUS RESEARCH & FACT-GROUNDING LAYER — MANDATORY ===

Subjek: "${subject}" — Intent: ${intent}
Status Research: ${grounding.summary.supported} fakta SUPPORTED, ${grounding.summary.unknown} UNKNOWN, ${grounding.summary.conflicting} CONFLICTING dari ${sources.length} sumber

SUMBER YANG BENAR-BENAR DIGUNAKAN (jangan buat URL palsu):
${sources.map((s, i) => `${i+1}. ${s.title} — ${s.url} — Type: ${s.type} — Domain: ${s.domain}`).join('\n')}

FAKTA YANG DIDUKUNG SUMBER (SUPPORTED — boleh digunakan sebagai fakta):
${supportedFacts.map((f, i) => `${i+1}. [SUPPORTED] ${f.fact} — Sumber: ${f.supportingSources.map(s => s.title).join(', ')} — ${f.reason}`).join('\n') || 'Tidak ada fakta SUPPORTED yang diekstrak — jangan mengarang fakta.'}

ATURAN ANTI-HALLUCINATION — WAJIB DIPATUHI:
- DILARANG mengarang: tanggal, tempat, hubungan keluarga, pekerjaan, pendidikan, peristiwa kehidupan, kutipan, prestasi, penghargaan, jabatan, perjalanan, kejadian sejarah, dialog nyata, fakta pribadi jika tidak didukung sumber
- Setiap fakta penting harus memiliki status: SUPPORTED (didukung sumber), INFERRED (kesimpulan masuk akal bukan fakta eksplisit), UNKNOWN (tidak ditemukan), CONFLICTING (sumber berbeda konflik)
- SUPPORTED: Boleh digunakan sebagai fakta
- INFERRED: Tidak boleh ditulis seolah-olah fakta pasti — gunakan bahasa "diperkirakan", "kemungkinan", "menurut beberapa sumber"
- UNKNOWN: Jangan diisi dengan karangan — tulis "informasi tidak tersedia" atau jangan sebutkan
- CONFLICTING: Jangan memilih diam-diam — tandai konflik dan gunakan sumber lebih kuat atau nyatakan ketidakpastian

KHUSUS CERITA TOKOH NYATA:
- Jika pengguna meminta "buat cerita tentang [tokoh nyata]" dan intent adalah FACTUAL_BIOGRAPHY → wajib fact-grounded
- Jika intent FICTION_INSPIRED → tetap jangan mengklaim kejadian fiksi sebagai kejadian nyata — bedakan fiksi dan fakta
- Jika ambigu → jangan menyamarkan fiksi sebagai fakta

Jika sumber tidak cukup untuk fakta penting:
- Jangan mengarang tanggal lahir, tempat lahir, keluarga, pendidikan, pekerjaan, prestasi
- Gunakan hanya fakta SUPPORTED
- Untuk fakta UNKNOWN, tulis "informasi tidak tersedia dalam sumber yang diambil" atau jangan sebutkan sama sekali
- Jangan membuat kutipan palsu

Jika research PARTIAL atau BLOCKED:
- Nyatakan dengan jujur di cerita bahwa informasi terbatas
- Jangan mengganti dengan karangan model

Output tetap JSON valid seperti diminta, TAPI fakta harus didukung sumber di atas.
Jika tidak ada sumber yang mendukung, jangan mengarang — kosongkan atau tandai UNKNOWN.
`

  const enhancedSystem = `${systemPrompt}\n\n${groundingInstructions}`

  const enhancedPrompt = `${originalPrompt}

=== EVIDENCE DARI RESEARCH LAYER (gunakan hanya fakta SUPPORTED) ===
Subjek: ${subject}
Sumber: ${sources.map(s => `${s.title} (${s.url})`).join('; ')}

Fakta SUPPORTED yang boleh digunakan:
${supportedFacts.map(f => `- ${f.fact}`).join('\n') || '- Tidak ada fakta SUPPORTED — jangan mengarang, gunakan hanya tema umum'}

INSTRUKSI: 
- Gunakan HANYA fakta SUPPORTED di atas untuk detail biografis
- Untuk fakta yang tidak ada di daftar SUPPORTED, JANGAN mengarang — biarkan kosong atau tulis UNKNOWN
- Jika tema adalah tokoh nyata dan intent FACTUAL_BIOGRAPHY, wajib gunakan fakta SUPPORTED, jangan karangan
- Jika intent FICTION_INSPIRED, boleh fiksi tapi jangan klaim fiksi sebagai fakta nyata
- Output JSON valid only
`

  return {
    system: enhancedSystem,
    prompt: enhancedPrompt,
    facts
  }
}
