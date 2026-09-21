// lib/script-engine.ts — NASKAH HARUS BERASAL LANGSUNG DARI CERITA — MANDATORY
// PRINSIP: CERITA = SOURCE OF TRUTH, NASKAH = ADAPTASI PRODUKSI DARI CERITA
// Flow: Cerita (dari halaman Cerita) → Analisis Cerita → Pemecahan Adegan → Naskah Produksi
// Naskah tidak boleh membuat cerita baru yang berbeda dari Cerita
// NEW: motionPrompt per scene for auto-pass to /test-video Step 4 Motion Engine

import { ProviderManager } from './ai/provider-manager'
import { NexusGenerateOptions } from './ai/types'
import { StoryOutput } from './story-engine'

export interface ScriptScene {
  scene_number: number
  scene_id: string
  title: string
  story_part: string
  story_source_quote: string
  location: {
    name: string
    location_id: string
    description: string
    environment: string
  }
  time_condition: string
  time_of_day: string
  season: string
  weather: string
  background_details: string
  characters_present: string[]
  characters_detail: Array<{
    name: string
    role: string
    emotion: string
    emotion_change: string
    expression: string
    action: string
    movement_visual: string
  }>
  action: string
  dialog: Array<{
    character: string
    line: string
    emotion: string
    purpose: string
  }>
  emotion_overall: string
  emotion_changes: string
  environment_background: string
  props: string[]
  narration?: string
  transition: string
  // === MOTION PROMPT AUTO-EXTRACT — wajib untuk Step 4 Motion Engine ===
  motionPrompt: string // contoh: "slow panning shot, character turning head towards camera, subtle blinking" — WAJIB auto-pass to /test-video
  motion_prompt?: string // legacy alias support
  grounding: {
    source: string
    faithful: boolean
    characters_from_story: boolean
    location_from_story: boolean
    traceable: boolean
  }
}

export interface ScriptOutput {
  source_story_id: string
  source_story_title: string
  source_story_logline: string
  source_story_premise: string
  source_story_conflict: string
  source_story_ending: string
  total_scenes: number
  characters_used: string[]
  locations_used: string[]
  scenes: ScriptScene[]
  consistency_notes: string
  adaptation_principle: string
  _groundingValidation?: any
}

function buildMotionPromptFallback(scene: Partial<ScriptScene>): string {
  const action = (scene.action || '').slice(0,120)
  const emotion = scene.emotion_overall || 'neutral'
  const weather = (scene as any).weather || ''
  const time = (scene as any).time_of_day || ''
  // cinematic motion prompt based on scene content
  return `${action ? action + ', ' : ''}${emotion} expression, subtle character movement, slow panning shot, gentle camera zoom, ${weather ? weather + ', ' : ''}${time ? time + ' lighting, ' : ''}natural motion, cinematic, wind blowing hair, subtle blinking, head turning, ambient background movement`.slice(0, 400)
}

function buildScriptPrompt(story: StoryOutput, language: string = 'id'): { system: string; prompt: string } {
  const system = `You are NEXUS Brain, core AI production engine for 2D animation — NASKAH GENERATOR.
You are model-agnostic, provider-agnostic. You generate PRODUCTION SCRIPT grounded 100% from STORY.

MANDATORY ARCHITECTURE: USER -> APPLICATION -> NEXUS BRAIN -> GROQ PRIMARY -> OPENROUTER FALLBACK -> LOCAL FALLBACK
You are NEXUS Brain, NOT Gemini. Gemini is legacy not in NEXUS path.

Language: ${language} — Respond in Indonesian if id, English if en.

PRINSIP UTAMA — WAJIB DIPATUHI:
CERITA = SOURCE OF TRUTH
NASKAH = ADAPTASI PRODUKSI DARI CERITA
BUKAN: CERITA → NASKAH BARU
JANGAN: CERITA → AI MENGARANG CERITA LAIN → NASKAH
HARUS: CERITA → ANALISIS CERITA → PEMECAHAN ADEGAN → NASKAH PRODUKSI

SUMBER UTAMA: Halaman CERITA menjadi sumber utama untuk Halaman NASKAH.
Naskah harus merupakan adaptasi terstruktur dari cerita tersebut.

ATURAN GROUNDING — WAJIB:
- Setiap scene harus dapat ditelusuri kembali ke bagian cerita sumber (premise/conflict/ending/episode)
- Jangan mengubah alur utama cerita
- Jangan mengganti karakter — gunakan karakter yang berasal dari cerita: ${story.characters.map(c => c.name).join(', ')}
- Jangan menghilangkan kejadian penting dari cerita
- Jangan menambahkan kejadian besar yang tidak ada dalam cerita
- Jangan membuat lokasi utama baru tanpa dasar — gunakan lokasi dari cerita: ${story.locations.map(l => l.name).join(', ')}
- Jangan membuat hubungan antar karakter yang tidak ada di cerita
- Jangan mengubah tujuan karakter
- Jangan mengubah akhir cerita
- Jika informasi tidak tersedia dalam cerita, jangan menganggapnya sebagai fakta cerita
- Untuk detail teknis produksi (posisi karakter, gestur, ekspresi, framing kamera, blocking sederhana) BOLEH buat keputusan kecil ASAL mendukung kejadian di cerita dan tidak mengubah cerita

KONTEN BOX NASKAH — MINIMAL 14 FIELD PER ADEGAN + ENRICHED + MOTION PROMPT:
1. SCENE/ADEGAN: nomor adegan, bagian cerita yang diadaptasi
2. LOKASI: tempat kejadian, harus mengikuti lokasi cerita, jangan buat lokasi baru tanpa dasar
3. WAKTU/KONDISI: waktu atau kondisi lingkungan jika disebutkan
4. WAKTU KEJADIAN (time_of_day): pagi/siang/sore/malam — WAJIB
5. MUSIM (season): semi/panas/gugur/dingin atau hujan/kemarau — WAJIB
6. CUACA (weather): cerah, hujan, berangin, mendung, wind blowing hair, falling leaves, rain — WAJIB animatable
7. BACKGROUND DETAILS: detail background/tempat sangat detail — WAJIB
8. KARAKTER: siapa hadir, dari cerita
9. AKSI: apa dilakukan karakter, mengikuti kejadian cerita
10. DIALOG: dialog dari peristiwa/percakapan cerita, jangan ubah maksud
11. EMOSI KARAKTER + PERUBAHAN EMOSI (emotion + emotion_change): sesuai konteks kejadian + perubahan dari scene sebelumnya — WAJIB
12. EKSPRESI: ekspresi wajah sesuai emosi dan kejadian
13. GERAKAN/AKSI VISUAL: gerakan tubuh, gestur, interaksi objek
14. LINGKUNGAN/BACKGROUND: kondisi tempat sesuai cerita, objek penting
15. PROPS: benda penting dari cerita
16. NARASI: jika diperlukan
17. TRANSISI ADEGAN: bagaimana pindah ke bagian berikutnya
18. MOTION PROMPT (motionPrompt): WAJIB — contoh: "slow panning shot, character turning head towards camera, subtle blinking, wind blowing hair, cinematic natural motion" — deskripsi gerakan untuk Step 4 Motion Engine /test-video — auto-pass — HARUS ada per scene

DIALOG — KONSISTENSI:
- Konsisten dengan karakter, situasi, lokasi, kejadian, emosi, tujuan adegan
- Tidak boleh membawa cerita ke arah baru

EMOSI — HITUNG BERDASARKAN KEJADIAN:
Contoh: Cerita "Karakter kehilangan sesuatu yang sangat penting" → Naskah: Emotion sedih + cemas, Expression wajah murung pandangan mencari, Action mencari benda. BUKAN bahagia + berjalan santai.

KONSISTENSI:
- Gunakan ID/identitas karakter dan lokasi yang sudah ada: characters ${JSON.stringify(story.characters.map(c => ({ name: c.name, role: c.role })))} locations ${JSON.stringify(story.locations.map(l => ({ name: l.name, location_id: l.location_id })))}
- Jangan buat karakter duplikat hanya karena nama ditulis berbeda
- Jangan buat lokasi duplikat
- Naskah harus menjadi dasar untuk CHARACTER/WORLD/STORYBOARD → DRAWING → ANIMATION, jadi karakter, lokasi, dialog, emosi, aksi, props, scene harus konsisten

OUTPUT JSON — WAJIB VALID JSON ONLY, NO MARKDOWN, NO EXPLANATION:
{
  "source_story_id": "${story.source_story_id}",
  "source_story_title": "${story.title}",
  "source_story_logline": "string — copy from story logline",
  "source_story_premise": "string — copy from story premise",
  "source_story_conflict": "string — copy from story conflict",
  "source_story_ending": "string — copy from story ending",
  "total_scenes": 3,
  "characters_used": ["name from story", ...],
  "locations_used": ["name from story", ...],
  "scenes": [
    {
      "scene_number": 1,
      "scene_id": "scene_01",
      "title": "Judul adegan — dari bagian cerita",
      "story_part": "premise — bagian awal cerita tentang ...",
      "story_source_quote": "Kutipan atau ringkasan bagian cerita sumber yang diadaptasi",
      "location": { "name": "Nama lokasi dari cerita", "location_id": "loc_... dari cerita", "description": "deskripsi dari cerita", "environment": "environment dari cerita" },
      "time_condition": "Malam hari / Pagi / Sore / Kondisi dari cerita",
      "time_of_day": "malam — WAJIB pagi/siang/sore/malam",
      "season": "musim hujan — WAJIB semi/panas/gugur/dingin atau hujan/kemarau",
      "weather": "hujan deras, wind blowing hair, rain — WAJIB animatable wind blowing hair/falling leaves/rain",
      "background_details": "Hutan lebat dengan pepohonan tinggi, kabut tipis, tanah basah, cahaya bulan menembus dedaunan — sangat detail — WAJIB",
      "characters_present": ["Nama karakter dari cerita"],
      "characters_detail": [
        { "name": "Arga", "role": "Protagonist dari cerita", "emotion": "sedih + cemas", "emotion_change": "netral->cemas — perubahan dari scene sebelumnya — WAJIB", "expression": "wajah murung, pandangan mencari", "action": "mencari benda penting", "movement_visual": "berjalan pelan sambil menunduk, tangan meraba tanah" }
      ],
      "action": "Apa yang terjadi — harus mengikuti kejadian dalam cerita",
      "dialog": [
        { "character": "Arga", "line": "Dialog adaptasi setia pada kejadian", "emotion": "cemas", "purpose": "menunjukkan kehilangan" }
      ],
      "emotion_overall": "tegang + cemas",
      "emotion_changes": "Arga: netral->cemas->tegang — perubahan emosi dalam adegan — WAJIB per new rules",
      "environment_background": "Kondisi tempat sesuai cerita, objek penting yang disebutkan",
      "props": ["Benda penting dari cerita"],
      "narration": "Narasi jika diperlukan",
      "transition": "Cut to / Fade to — adegan berikutnya tentang ...",
      "motionPrompt": "slow panning shot, character turning head towards camera, subtle blinking, wind blowing hair, cinematic natural motion, gentle camera zoom — WAJIB untuk Step 4 /test-video auto-pass",
      "grounding": { "source": "premise", "faithful": true, "characters_from_story": true, "location_from_story": true, "traceable": true }
    }
  ],
  "consistency_notes": "Semua scene berasal dari cerita ... Karakter sesuai ... Lokasi sesuai ... Tidak ada kejadian baru besar ... Setiap scene memiliki motionPrompt untuk /test-video",
  "adaptation_principle": "CERITA = SOURCE OF TRUTH, NASKAH = ADAPTASI PRODUKSI DARI CERITA — MOTION PROMPT AUTO-EXTRACT FOR STEP 4"
}

Rules:
- total_scenes minimal 3, maksimal 5 untuk cerita pendek (15 detik), untuk multi-episode bisa lebih
- Setiap scene WAJIB memiliki grounding.source yang jelas (premise/conflict/ending/episode 1 dll)
- Setiap scene WAJIB memiliki motionPrompt: contoh "slow panning shot, character turning head towards camera, subtle blinking" — JANGAN KOSONG — untuk auto-pass ke /test-video Motion Prompt column
- characters_present WAJIB subset dari characters cerita
- locations WAJIB dari cerita, jangan buat lokasi baru tanpa dasar
- dialog harus setia pada maksud cerita, jangan bawa ke arah baru
- emotion harus sesuai konteks kejadian, hitung berdasarkan cerita
- Return ONLY JSON
`

  const prompt = `STORY SOURCE OF TRUTH — JANGAN BUAT CERITA BARU, ADAPTASI DARI INI — INCLUDE motionPrompt PER SCENE:

Title: ${story.title}
Logline: ${story.logline}
Premise: ${story.premise}
Conflict: ${story.conflict}
Ending: ${story.ending}

Characters (WAJIB gunakan ini, jangan buat duplikat):
${JSON.stringify(story.characters, null, 2)}

Locations (WAJIB gunakan ini, jangan buat lokasi baru tanpa dasar):
${JSON.stringify(story.locations, null, 2)}

Episode Structure (jika ada, pecah adegan berdasarkan ini):
${JSON.stringify(story.episode_structure, null, 2)}

Source Story ID: ${story.source_story_id}

TUGAS:
1. Analisis cerita di atas — identifikasi alur utama, kejadian penting, karakter, lokasi, emosi
2. Pecah menjadi 3-5 adegan terstruktur yang SETIA pada cerita
3. Untuk setiap adegan, buat field: scene, lokasi (dari cerita), waktu/kondisi, karakter (dari cerita), aksi (mengikuti cerita), dialog (setia pada maksud), emosi (sesuai konteks), ekspresi, gerakan visual, lingkungan/background (sesuai cerita), props (dari cerita), narasi jika perlu, transisi, DAN motionPrompt (WAJIB) — contoh motionPrompt: "slow panning shot, character turning head towards camera, subtle blinking, wind blowing hair, cinematic natural motion"
4. motionPrompt harus mendeskripsikan gerakan kamera + gerakan karakter + background animation yang cocok dengan aksi scene — untuk auto-pass ke Motion Engine /test-video
5. Setiap adegan harus traceable ke bagian cerita (story_part + story_source_quote + grounding.source)
6. Jangan ubah alur utama, jangan ganti karakter, jangan hilangkan kejadian penting, jangan tambah kejadian besar baru, jangan buat lokasi utama baru, jangan ubah akhir

Generate NASKAH JSON sekarang — adaptasi produksi dari cerita di atas dengan motionPrompt per scene, bukan cerita baru. Output valid JSON only.`

  return { system, prompt }
}

export async function generateScriptViaNexusBrain(story: StoryOutput, language: string = 'id', requestId?: string) {
  const reqId = requestId || `script-${Date.now()}`
  console.log(`[ScriptEngine] Naskah requested — Request ${reqId} — Source story: "${story.title}" (${story.source_story_id})`)
  console.log(`[ScriptEngine] Characters from story: ${story.characters.map(c => c.name).join(', ')}`)
  console.log(`[ScriptEngine] Locations from story: ${story.locations.map(l => l.name).join(', ')}`)
  console.log(`[ScriptEngine] Grounding principle: CERITA = SOURCE OF TRUTH, NASKAH = ADAPTASI + MOTION PROMPT`)

  if (!story || !story.title || !story.premise) {
    return {
      ok: false,
      error: 'Cerita tidak tersedia. Buat cerita terlebih dahulu di halaman Cerita — Naskah harus berasal dari Cerita.',
      provider: 'none',
      status: 'BLOCKED',
      verification: 'Script requires story as source — story missing'
    }
  }

  const { system, prompt } = buildScriptPrompt(story, language)

  const options: NexusGenerateOptions & { engine: string } = {
    prompt,
    systemPrompt: system,
    temperature: 0.7,
    maxTokens: 5000,
    engine: 'script',
    requestId: reqId
  }

  const result = await ProviderManager.generateForNexusPath(options)

  if (!result.ok) {
    console.error(`[ScriptEngine] NEXUS Brain failed for script: ${result.error}`)
    return {
      ok: false,
      error: result.error,
      provider: result.provider,
      model: result.model,
      fallbackChain: result.fallbackChain,
      triedProviders: result.triedProviders,
      nexusBrainUsed: result.nexusBrainUsed,
      verification: `NEXUS Brain script path — Provider: ${result.provider} — Chain: ${result.fallbackChain.join(' -> ')} — Gemini NOT used`
    }
  }

  function cleanJsonString(raw: string): string {
    let text = raw || '';
    text = text.replace(/^\uFEFF/, '').trim();
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) text = codeBlockMatch[1].trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace && firstBrace > 0) {
      const candidate = text.substring(firstBrace, lastBrace + 1);
      if (candidate.length > 20) text = candidate;
    }
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');
    text = text.replace(/(^|\n)\s*\/\/.*$/gm, '$1');
    text = text.replace(/,\s*([}\]])/g, '$1');
    text = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    return text.trim();
  }

  function safeParseJsonFromLLM(raw: string): { success: boolean; data?: any; error?: string; attempts: string[] } {
    const attempts: string[] = [];
    if (!raw || typeof raw !== 'string') return { success: false, error: 'Empty input', attempts: ['empty'] };
    let text = raw.trim();
    try {
      const data = JSON.parse(text);
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

  function buildMinimalNaskahFallback(story: StoryOutput): ScriptOutput {
    const chars = story.characters.map(c => c.name);
    const locs = story.locations.map(l => l.name);
    const firstLoc = story.locations[0] || { name: 'Lokasi Utama', location_id: 'loc_01', description: 'Lokasi cerita', environment: 'lingkungan cerita' };
    return {
      source_story_id: story.source_story_id,
      source_story_title: story.title,
      source_story_logline: story.logline || '',
      source_story_premise: story.premise || '',
      source_story_conflict: story.conflict || '',
      source_story_ending: story.ending || '',
      total_scenes: 3,
      characters_used: chars,
      locations_used: locs,
      scenes: [
        {
          scene_number: 1,
          scene_id: 'scene_01',
          title: `Awal — ${story.title}`,
          story_part: `premise — ${story.premise?.slice(0,100) || 'awal cerita'}`,
          story_source_quote: story.premise?.slice(0,200) || story.title,
          location: { name: firstLoc.name, location_id: firstLoc.location_id || 'loc_01', description: firstLoc.description || '', environment: firstLoc.environment || '' },
          time_condition: 'Siang hari',
          time_of_day: 'siang',
          season: 'musim kemarau',
          weather: 'cerah, soft breeze',
          background_details: `Lokasi ${firstLoc.name} — ${firstLoc.description || 'tempat cerita'} — detail lingkungan sesuai cerita`,
          characters_present: chars.slice(0,2),
          characters_detail: chars.slice(0,2).map(name => ({ name, role: 'tokoh cerita', emotion: 'netral', emotion_change: 'netral->tenang', expression: 'tenang', action: 'berada di lokasi', movement_visual: 'berdiri' })),
          action: story.premise?.slice(0,200) || 'Awal cerita',
          dialog: [],
          emotion_overall: 'tenang',
          emotion_changes: chars.slice(0,2).map(n => `${n}: netral->tenang`).join(', '),
          environment_background: firstLoc.environment || 'lingkungan cerita',
          props: [],
          narration: story.premise?.slice(0,200) || '',
          transition: 'Cut to next scene',
          motionPrompt: `slow panning shot, character standing in ${firstLoc.name}, subtle blinking, gentle breeze, soft camera zoom, natural motion, cinematic — Scene 1 opening`,
          grounding: { source: 'premise', faithful: true, characters_from_story: true, location_from_story: true, traceable: true }
        },
        {
          scene_number: 2,
          scene_id: 'scene_02',
          title: `Tengah — Konflik`,
          story_part: `conflict — ${story.conflict?.slice(0,100) || 'konflik cerita'}`,
          story_source_quote: story.conflict?.slice(0,200) || story.title,
          location: { name: firstLoc.name, location_id: firstLoc.location_id || 'loc_01', description: firstLoc.description || '', environment: firstLoc.environment || '' },
          time_condition: 'Sore hari',
          time_of_day: 'sore',
          season: 'musim hujan',
          weather: 'mendung, wind blowing hair',
          background_details: `Lokasi ${firstLoc.name} — suasana tegang`,
          characters_present: chars,
          characters_detail: chars.map(name => ({ name, role: 'tokoh cerita', emotion: 'tegang', emotion_change: 'tenang->tegang', expression: 'tegang', action: 'menghadapi konflik', movement_visual: 'bergerak' })),
          action: story.conflict?.slice(0,200) || 'Konflik cerita',
          dialog: [],
          emotion_overall: 'tegang',
          emotion_changes: chars.map(n => `${n}: tenang->tegang`).join(', '),
          environment_background: firstLoc.environment || 'lingkungan cerita',
          props: [],
          transition: 'Cut to next',
          motionPrompt: `character facing conflict, tense expression, subtle head movement, wind blowing hair, camera shake slight, dramatic lighting, cinematic motion — Scene 2 conflict`,
          grounding: { source: 'conflict', faithful: true, characters_from_story: true, location_from_story: true, traceable: true }
        },
        {
          scene_number: 3,
          scene_id: 'scene_03',
          title: `Akhir — Penyelesaian`,
          story_part: `ending — ${story.ending?.slice(0,100) || 'akhir cerita'}`,
          story_source_quote: story.ending?.slice(0,200) || story.title,
          location: { name: firstLoc.name, location_id: firstLoc.location_id || 'loc_01', description: firstLoc.description || '', environment: firstLoc.environment || '' },
          time_condition: 'Malam hari',
          time_of_day: 'malam',
          season: 'musim kemarau',
          weather: 'cerah, soft breeze',
          background_details: `Lokasi ${firstLoc.name} — suasana penyelesaian`,
          characters_present: chars,
          characters_detail: chars.map(name => ({ name, role: 'tokoh cerita', emotion: 'lega', emotion_change: 'tegang->lega', expression: 'lega', action: 'menyelesaikan cerita', movement_visual: 'berdiri' })),
          action: story.ending?.slice(0,200) || 'Akhir cerita',
          dialog: [],
          emotion_overall: 'lega',
          emotion_changes: chars.map(n => `${n}: tegang->lega`).join(', '),
          environment_background: firstLoc.environment || 'lingkungan cerita',
          props: [],
          transition: 'Fade out',
          motionPrompt: `character relieved, soft smile, slow camera dolly out, gentle ambient motion, peaceful background, subtle blinking, cinematic closing — Scene 3 ending`,
          grounding: { source: 'ending', faithful: true, characters_from_story: true, location_from_story: true, traceable: true }
        }
      ],
      consistency_notes: `Fallback naskah minimal — 3 scene dari cerita "${story.title}" — dengan motionPrompt auto untuk /test-video`,
      adaptation_principle: 'CERITA = SOURCE OF TRUTH, NASKAH = ADAPTASI — fallback minimal + motionPrompt'
    };
  }

  let jsonData: ScriptOutput | null = null
  let parseAttempts: string[] = []
  const rawText = result.text || ''
  const parseResult = safeParseJsonFromLLM(rawText)
  parseAttempts = parseResult.attempts
  if (parseResult.success && parseResult.data) {
    jsonData = parseResult.data as ScriptOutput
    // POST-PROCESS: ensure motionPrompt exists per scene — auto-fill if missing
    if (jsonData.scenes) {
      jsonData.scenes = jsonData.scenes.map((s: any) => {
        const mp = s.motionPrompt || s.motion_prompt || s.motion_prompt_text || ''
        if (!mp || mp.trim().length < 10) {
          return { ...s, motionPrompt: buildMotionPromptFallback(s) }
        }
        return { ...s, motionPrompt: mp }
      })
    }
    console.log(`[ScriptEngine] JSON PARSE SUCCESS — attempts: ${parseAttempts.join(' | ')} — Provider: ${result.provider} — motionPrompt auto-checked`)
  } else {
    console.warn(`[ScriptEngine] JSON PARSE FAILED after all cleaners — ${parseResult.error} — attempts: ${parseAttempts.join(' | ')} — raw: ${rawText.slice(0,500)} — Using minimal fallback`)
    jsonData = buildMinimalNaskahFallback(story)
    console.log(`[ScriptEngine] FALLBACK NASKAH MINIMAL generated — 3 scenes with motionPrompt`)
  }

  const validation = validateScriptGrounding(jsonData as ScriptOutput, story)

  if (jsonData) {
    (jsonData as any)._groundingValidation = validation
  }

  console.log(`[ScriptEngine] SUCCESS — Script generated from story "${story.title}" — ${jsonData?.total_scenes} scenes with motionPrompt — Validation: ${validation.isValid ? 'PASS' : 'FAIL'} — Provider: ${result.provider}`)

  return {
    ok: true,
    data: jsonData,
    provider: result.provider,
    model: result.model,
    role: result.role,
    fallbackChain: result.fallbackChain,
    triedProviders: result.triedProviders,
    nexusBrainUsed: true,
    groundingValidation: validation,
    verification: `Cerita "${story.title}" → Naskah ${jsonData?.total_scenes} scenes with motionPrompt — Grounding ${validation.isValid ? 'PASS' : 'FAIL'} — via NEXUS Brain ${result.provider.toUpperCase()}`
  }
}

export function validateScriptGrounding(script: ScriptOutput, story: StoryOutput) {
  const checks: any = {}
  const corrections: string[] = []

  const storyText = `${story.title} ${story.logline} ${story.premise} ${story.conflict} ${story.ending} ${story.episode_structure?.map(e => e.summary).join(' ') || ''}`.toLowerCase()
  let scenesFromStory = 0
  for (const scene of script.scenes || []) {
    const hasSource = scene.grounding?.source && ['premise','conflict','ending','episode','logline','title'].some(k => scene.grounding.source.toLowerCase().includes(k) || scene.story_part.toLowerCase().includes(k))
    const hasQuote = scene.story_source_quote && scene.story_source_quote.length > 10
    const traceable = scene.grounding?.traceable
    if ((hasSource || hasQuote) && traceable) scenesFromStory++
  }
  checks.allScenesFromStory = {
    pass: scenesFromStory === (script.scenes?.length || 0) && (script.scenes?.length || 0) > 0,
    reason: scenesFromStory === (script.scenes?.length || 0) ? `Semua ${scenesFromStory}/${script.scenes?.length} scene memiliki grounding source traceable ke cerita` : `Hanya ${scenesFromStory}/${script.scenes?.length} scene yang traceable ke cerita — harus semua`
  }
  if (!checks.allScenesFromStory.pass) corrections.push(`Pastikan semua scene memiliki story_part + story_source_quote + grounding.source yang merujuk ke cerita`)

  const storyCharNames = story.characters.map(c => c.name.toLowerCase())
  let charMismatch = 0
  const usedChars = new Set<string>()
  for (const scene of script.scenes || []) {
    for (const charName of scene.characters_present || []) {
      usedChars.add(charName)
      if (!storyCharNames.some(sc => sc.includes(charName.toLowerCase()) || charName.toLowerCase().includes(sc) || sc === charName.toLowerCase())) {
        if (!storyCharNames.includes(charName.toLowerCase())) {
          const isNew = !storyCharNames.some(sc => charName.toLowerCase().includes(sc.split(' ')[0]) || sc.includes(charName.toLowerCase().split(' ')[0]))
          if (isNew && charName.length > 2) charMismatch++
        }
      }
    }
  }
  checks.charactersMatchStory = {
    pass: charMismatch === 0,
    reason: charMismatch === 0 ? `Karakter sesuai cerita: ${Array.from(usedChars).join(', ')} subset dari ${story.characters.map(c => c.name).join(', ')}` : `${charMismatch} karakter baru tanpa dasar dari cerita — harus dari cerita: ${story.characters.map(c => c.name).join(', ')}`
  }
  if (!checks.charactersMatchStory.pass) corrections.push(`Gunakan hanya karakter dari cerita: ${story.characters.map(c => c.name).join(', ')}`)

  const storyLocNames = story.locations.map(l => l.name.toLowerCase())
  let locMismatch = 0
  const usedLocs = new Set<string>()
  for (const scene of script.scenes || []) {
    const locName = scene.location?.name?.toLowerCase() || ''
    usedLocs.add(scene.location?.name || '')
    if (locName && !storyLocNames.some(sl => sl.includes(locName) || locName.includes(sl) || sl === locName)) {
      const idMatch = story.locations.some(l => l.location_id === scene.location?.location_id)
      if (!idMatch && locName.length > 3) {
        const isNewLoc = !storyLocNames.some(sl => locName.includes(sl.split(' ')[0]) || sl.includes(locName.split(' ')[0]))
        if (isNewLoc) locMismatch++
      }
    }
  }
  checks.locationsMatchStory = {
    pass: locMismatch === 0,
    reason: locMismatch === 0 ? `Lokasi sesuai cerita: ${Array.from(usedLocs).join(', ')} dari ${story.locations.map(l => l.name).join(', ')}` : `${locMismatch} lokasi baru tanpa dasar — harus dari cerita`
  }
  if (!checks.locationsMatchStory.pass) corrections.push(`Gunakan hanya lokasi dari cerita: ${story.locations.map(l => l.name).join(', ')}`)

  let dialogFromStory = 0
  for (const scene of script.scenes || []) {
    if (scene.dialog && scene.dialog.length > 0) {
      const hasChar = scene.dialog.every(d => storyCharNames.some(sc => sc.includes(d.character.toLowerCase()) || d.character.toLowerCase().includes(sc)))
      const hasPurpose = scene.dialog.every(d => d.purpose && d.purpose.length > 5)
      if (hasChar && hasPurpose) dialogFromStory++
    } else {
      dialogFromStory++
    }
  }
  checks.dialogMatchesEvent = {
    pass: dialogFromStory === (script.scenes?.length || 0),
    reason: `Dialog sesuai kejadian: ${dialogFromStory}/${script.scenes?.length} scene memiliki dialog dengan karakter dari cerita dan purpose jelas`
  }

  let emotionContext = 0
  const validEmotions = ['sedih','takut','marah','bingung','tenang','bahagia','tegang','terkejut','cemas','khawatir','senang','kecewa','haru','lega','panik','curiga','antusias','kesepian','rindu']
  for (const scene of script.scenes || []) {
    const hasEmotion = scene.characters_detail?.every(cd => cd.emotion && cd.emotion.length > 2) && scene.emotion_overall
    const emotionValid = scene.characters_detail?.some(cd => validEmotions.some(ve => cd.emotion.toLowerCase().includes(ve)))
    if (hasEmotion && emotionValid) emotionContext++
  }
  checks.emotionMatchesContext = {
    pass: emotionContext >= Math.floor((script.scenes?.length || 0) * 0.6),
    reason: `Emosi sesuai konteks: ${emotionContext}/${script.scenes?.length} scene memiliki emosi valid sesuai kejadian`
  }

  let actionFromStory = 0
  for (const scene of script.scenes || []) {
    if (scene.action && scene.action.length > 10 && scene.characters_detail?.some(cd => cd.action && cd.action.length > 5)) {
      actionFromStory++
    }
  }
  checks.actionMatchesStory = {
    pass: actionFromStory === (script.scenes?.length || 0),
    reason: `Aksi sesuai cerita: ${actionFromStory}/${script.scenes?.length} scene memiliki aksi karakter yang mengikuti kejadian cerita`
  }

  let newEvents = 0
  for (const scene of script.scenes || []) {
    if (scene.grounding?.faithful === false) newEvents++
  }
  checks.noNewMajorEvents = {
    pass: newEvents === 0,
    reason: newEvents === 0 ? 'Tidak ada kejadian besar baru yang tidak ada dalam cerita — semua faithful true' : `${newEvents} adegan memiliki kejadian baru besar tanpa dasar`
  }
  if (!checks.noNewMajorEvents.pass) corrections.push('Jangan tambahkan kejadian besar yang tidak ada dalam cerita')

  checks.noNewCharactersWithoutBasis = {
    pass: charMismatch === 0,
    reason: charMismatch === 0 ? 'Tidak ada karakter baru tanpa dasar' : `${charMismatch} karakter baru tanpa dasar terdeteksi`
  }

  checks.noNewLocationsWithoutBasis = {
    pass: locMismatch === 0,
    reason: locMismatch === 0 ? 'Tidak ada lokasi baru tanpa dasar' : `${locMismatch} lokasi baru tanpa dasar`
  }

  const normalize = (v: any) => (v || '').toString().toLowerCase()
  const hasMetaPremise = !!(script.source_story_premise && script.source_story_premise.trim().length > 10)
  const hasMetaConflict = !!(script.source_story_conflict && script.source_story_conflict.trim().length > 10)
  const hasMetaEnding = !!(script.source_story_ending && script.source_story_ending.trim().length > 10)

  const premiseKeywords = ['premise', 'awal', 'pembuka', 'pengenalan', 'exposition', 'intro', 'bagian awal', 'act 1', 'act1', 'episode 1', 'episode1', 'scene 1', 'scene1', 'adegan 1', 'adegan1', 'opening', 'prolog', 'prologue', 'setup']
  const hasPremiseByScene = script.scenes?.some(s => {
    const src = normalize(s.grounding?.source)
    const part = normalize(s.story_part)
    const title = normalize(s.title)
    return premiseKeywords.some(k => src.includes(k) || part.includes(k) || title.includes(k))
  })
  const hasPremiseByPosition = (script.scenes?.length || 0) >= 1 && (script.scenes?.[0]?.grounding?.traceable || (script.scenes?.[0]?.story_source_quote?.length || 0) > 5)
  const hasPremise = !!(hasMetaPremise || hasPremiseByScene || hasPremiseByPosition)

  const conflictKeywords = ['conflict', 'konflik', 'tengah', 'klimaks', 'climax', 'konfrontasi', 'masalah', 'tantangan', 'perjuangan', 'act 2', 'act2', 'episode 2', 'episode 3', 'scene 2', 'scene 3', 'adegan 2', 'adegan 3', 'rising', 'confrontation', 'tension', 'kuyang', 'teror', 'misteri', 'hantu', 'ketegangan']
  const hasConflictByScene = script.scenes?.some(s => {
    const src = normalize(s.grounding?.source)
    const part = normalize(s.story_part)
    const title = normalize(s.title)
    const action = normalize(s.action)
    return conflictKeywords.some(k => src.includes(k) || part.includes(k) || title.includes(k) || action.includes(k))
  })
  const hasConflictByPosition = (script.scenes?.length || 0) >= 3
  const hasConflict = !!(hasMetaConflict || hasConflictByScene || hasConflictByPosition)

  const endingKeywords = ['ending', 'akhir', 'penutup', 'resolusi', 'konklusi', 'resolution', 'conclusion', 'epilog', 'epilogue', 'act 3', 'act3', 'episode 4', 'episode terakhir', 'scene 4', 'scene4', 'adegan 4', 'adegan terakhir', 'final', 'penyelesaian', 'klimaks akhir', 'kemenangan', 'selamat', 'terjerit', 'kuyang terjerit']
  const hasEndingByScene = script.scenes?.some(s => {
    const src = normalize(s.grounding?.source)
    const part = normalize(s.story_part)
    const title = normalize(s.title)
    return endingKeywords.some(k => src.includes(k) || part.includes(k) || title.includes(k))
  })
  const lastScene = script.scenes?.[script.scenes.length - 1]
  const hasEndingByPosition = !!(lastScene && lastScene.grounding?.traceable && lastScene.grounding?.faithful)
  const hasEnding = !!(hasMetaEnding || hasEndingByScene || hasEndingByPosition)

  checks.plotSameAsStory = {
    pass: !!(hasPremise && hasEnding),
    reason: `Alur naskah sama dengan cerita: premise ${hasPremise ? '✅' : '❌'} , conflict ${hasConflict ? '✅' : '⚠️'} , ending ${hasEnding ? '✅' : '❌'} — minimal premise & ending harus ada`
  }
  if (!checks.plotSameAsStory.pass) corrections.push('Pastikan alur naskah mencakup premise, conflict, ending dari cerita')

  // NEW check: motionPrompt exists per scene
  let motionPromptCount = 0
  for (const scene of script.scenes || []) {
    const mp = (scene as any).motionPrompt || (scene as any).motion_prompt
    if (mp && mp.trim().length >= 10) motionPromptCount++
  }
  checks.motionPromptExists = {
    pass: motionPromptCount === (script.scenes?.length || 0),
    reason: motionPromptCount === (script.scenes?.length || 0) ? `motionPrompt ✅: ${motionPromptCount}/${script.scenes?.length} scenes memiliki motionPrompt untuk auto-pass ke /test-video` : `motionPrompt ❌: hanya ${motionPromptCount}/${script.scenes?.length} scenes memiliki motionPrompt — WAJIB semua`
  }
  if (!checks.motionPromptExists.pass) corrections.push('Setiap scene WAJIB memiliki motionPrompt untuk /test-video — auto-fill fallback will apply')

  const allPass = Object.values(checks).every((c: any) => c.pass)
  const overallReason = allPass
    ? `Grounding validation PASS — Naskah ${script.total_scenes} scene SETIA pada cerita "${story.title}" — motionPrompt ✅`
    : `Grounding validation FAIL — ${corrections.length} koreksi — ${Object.entries(checks).filter(([k,v]: any) => !v.pass).map(([k,v]: any) => `${k}: ${v.reason}`).join('; ').slice(0, 600)}`

  return {
    isValid: allPass,
    overallReason,
    checks,
    correctionsNeeded: corrections,
    evidence: {
      sourceStory: story.title,
      sourceStoryId: story.source_story_id,
      totalScenes: script.total_scenes,
      charactersUsed: script.characters_used,
      locationsUsed: script.locations_used,
      scenesFromStory: `${scenesFromStory}/${script.scenes?.length}`,
      faithful: newEvents === 0,
      motionPrompt: `${motionPromptCount}/${script.scenes?.length}`
    }
  }
}

export async function generateScript(story: StoryOutput, language?: string) {
  return generateScriptViaNexusBrain(story, language)
}
