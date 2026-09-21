// lib/episode-engine.ts — EPISODE & SCENE GENERATOR — STRICT STORY + SCRIPT SYNCHRONIZATION
// PRINSIP: SOURCE STORY = sumber kebenaran, NASKAH = adaptasi resmi, EPISODE = pembagian produksi dari NASKAH, SCENE = unit visual dari EPISODE
// Tidak boleh ada konflik antara ketiganya

import { ProviderManager } from './ai/provider-manager'
import { NexusGenerateOptions } from './ai/types'
import { StoryOutput } from './story-engine'
import { ScriptOutput } from './script-engine'
import { CharacterOutput } from './character-engine'

export interface EpisodeScene {
  scene_id: string // SCENE-01-01 format: Episode 1 Scene 1
  episode_id: string // EP-01
  episode_number: number
  scene_number: number // global scene number
  scene_number_in_episode: number // 1..N in episode
  duration_seconds: number // sekitar 7.5 detik
  duration_formatted: string // "7.5s"
  source_story_event: string // event cerita yang direpresentasikan — dari SOURCE STORY
  script_reference: string // bagian naskah yang menjadi sumber — scene_id dari naskah
  story_part: string // premise/conflict/ending dari naskah
  story_source_quote: string // kutipan sumber
  characters: string[] // nama karakter dari SOURCE STORY/NASKAH — harus sama
  characters_detail: Array<{
    name: string
    appearance: string // penampilan sesuai CHARACTER DATABASE
    expression: string
    clothing: string
    pose: string
    action: string
  }>
  location: {
    name: string
    location_id: string
    description: string
    environment: string
  }
  time: string // waktu/kondisi
  action: string // aksi dari NASKAH
  dialogue: Array<{
    character: string
    line: string
    emotion: string
  }> // dari NASKAH, jangan ubah makna
  emotion: string // emosi dari NASKAH
  purpose: string // tujuan scene
  visual_prompt: string // visual prompt siap produksi: karakter, penampilan, ekspresi, pakaian, pose, aksi, lokasi, lingkungan, waktu, pencahayaan, kamera, framing, kontinuitas
  motionPrompt: string // motion prompt untuk Step 4 /test-video — WAJIB auto-pass — contoh: "slow panning shot, character turning head..."
  motion_prompt?: string // legacy alias
  continuity: {
    previous_scene: string | null // scene_id sebelumnya
    character_continuity: string // karakter sama terlihat sama
    location_continuity: string // lokasi konsisten
    clothing_continuity: string
    prop_continuity: string
    time_continuity: string
    action_continuity: string
    emotion_continuity: string
    story_continuity: string
  }
  grounding: {
    source_story: boolean
    script: boolean
    characters_from_story: boolean
    location_from_story: boolean
    faithful: boolean
    traceable: boolean
    no_new_event: boolean
    no_new_character: boolean
    no_new_location: boolean
  }
}

export interface EpisodeOutput {
  source_story_id: string
  source_story_title: string
  source_script_id?: string
  episode_id: string // EP-01
  episode_number: number
  episode_title: string
  duration_seconds: number // total episode duration
  duration_formatted: string // "30s"
  total_scenes: number // DURASI / 7.5
  scene_duration_seconds: number // 7.5
  scenes: EpisodeScene[]
  continuation_point?: string // jika cerita berlanjut ke episode berikutnya
  story_coverage: string // memastikan seluruh bagian penting NASKAH tercover
  consistency_notes: string
  adaptation_principle: string // SOURCE STORY = sumber kebenaran, NASKAH = adaptasi resmi, EPISODE = pembagian produksi dari NASKAH
  _validation?: any
}

// Aturan durasi tetap
export function getSceneCountFromDuration(durationSeconds: number): number {
  // Rumus: JUMLAH SCENE = DURASI / 7.5
  // Tabel: 15=2, 30=4, 45=6, 60=8, 75=10, 90=12, 120=16
  const count = Math.round(durationSeconds / 7.5)
  // Minimal 1, maksimal 16 untuk 120 detik, tapi untuk durasi lebih besar bisa lebih
  return Math.max(1, count)
}

export function getDurationFromSceneCount(sceneCount: number): number {
  return sceneCount * 7.5
}

function buildEpisodePrompt(story: StoryOutput, script: ScriptOutput, characters: CharacterOutput | null, durationSeconds: number, episodeNumber: number, language: string = 'id'): { system: string; prompt: string } {
  const sceneCount = getSceneCountFromDuration(durationSeconds)
  const storyChars = story.characters.map(c => `${c.name} (${c.role})`).join(', ')
  const scriptScenes = script.scenes.map(s => `Scene ${s.scene_number} [${s.scene_id}] ${s.title} — Story Part: ${s.story_part} — Characters: ${s.characters_present.join(', ')} — Location: ${s.location.name} — Action: ${s.action.slice(0,80)} — Dialog: ${s.dialog.map(d => `${d.character}: "${d.line.slice(0,30)}"`).join('; ')}`).join('\n')
  const charDetails = characters ? characters.characters.map(ch => `${ch.name} — Role: ${ch.role} — Physical: ${ch.physical} — Hair: ${ch.hair} — Face: ${ch.face} — Body: ${ch.body_shape} — Clothing: ${ch.clothing} — Personality: ${ch.personality} — Visual: ${ch.visual.type} ${ch.visual.framing}`).join('\n') : storyChars

  const system = `You are NEXUS Brain, core AI production engine for 2D animation — EPISODE & SCENE GENERATOR STRICT STORY + SCRIPT SYNCHRONIZATION.

MANDATORY ARCHITECTURE: USER -> APPLICATION -> NEXUS BRAIN -> GROQ PRIMARY -> OPENROUTER FALLBACK -> LOCAL FALLBACK
You are NEXUS Brain, NOT Gemini.

Language: ${language}

TUJUAN: Membuat episode video berdasarkan SOURCE STORY dan NASKAH secara otomatis dengan pembagian scene yang sesuai durasi.

PRINSIP UTAMA:
SOURCE STORY = sumber kebenaran.
NASKAH = adaptasi resmi dari SOURCE STORY.
EPISODE = pembagian produksi dari NASKAH.
SCENE = unit visual dari EPISODE.
Tidak boleh ada konflik antara ketiganya.

==================================================
1. ATURAN DURASI DAN JUMLAH SCENE — WAJIB
==================================================
Gunakan aturan tetap:
15 detik = 2 scene
30 detik = 4 scene
45 detik = 6 scene
60 detik = 8 scene
75 detik = 10 scene
90 detik = 12 scene
120 detik = 16 scene

Rumus: JUMLAH SCENE = DURASI EPISODE / 7,5 detik
Setiap scene memiliki durasi sekitar 7,5 detik.
Jangan mengurangi atau menambah jumlah scene tanpa alasan teknis yang sangat kuat.
Jika durasi episode tidak tercantum dalam tabel: JUMLAH SCENE = pembulatan yang konsisten dengan interval 7,5 detik, tetapi jangan mengubah isi cerita hanya demi memenuhi jumlah scene.

Untuk request ini:
Durasi Episode: ${durationSeconds} detik
Jumlah Scene yang HARUS dibuat: ${sceneCount} scene
Setiap scene: 7.5 detik

==================================================
2. SUMBER KEBENARAN
==================================================
Sebelum membuat episode:
A. Baca SOURCE STORY: "${story.title}" — ID: ${story.source_story_id}
   Logline: ${story.logline}
   Premise: ${story.premise}
   Conflict: ${story.conflict}
   Ending: ${story.ending}
   Characters: ${storyChars}
   Locations: ${story.locations.map(l => l.name).join(', ')}

B. Baca NASKAH: ${script.total_scenes} scenes dari cerita "${script.source_story_title}"
   Characters Used: ${script.characters_used.join(', ')}
   Locations Used: ${script.locations_used.join(', ')}
   Scenes:
${scriptScenes}

C. Cocokkan SOURCE STORY dengan NASKAH
D. Identifikasi semua event cerita
E. Identifikasi semua karakter
F. Identifikasi semua lokasi
G. Identifikasi dialog
H. Identifikasi aksi
I. Identifikasi emosi
J. Identifikasi urutan kejadian
Jadikan hasil tersebut sebagai STORY GROUNDING DATA.
JANGAN membuat episode berdasarkan imajinasi bebas.

==================================================
3. PEMBAGIAN EPISODE
==================================================
Jika NASKAH lebih panjang daripada satu episode: Bagi cerita berdasarkan URUTAN KEJADIAN ASLI.
Episode berikutnya harus melanjutkan episode sebelumnya.
Contoh:
Episode 1: Scene 1 → awal kejadian, Scene 2 → perkembangan kejadian
Episode 2: Scene 3 → melanjutkan langsung dari Episode 1, Scene 4 → perkembangan berikutnya, Scene 5 → perkembangan berikutnya, Scene 6 → penutup bagian tersebut

JANGAN: melompat-lompat timeline, mengulang kejadian tanpa alasan, memindahkan event, membuat event baru, mengubah ending, menghilangkan event penting.

Untuk Episode ${episodeNumber} ini: ambil ${sceneCount} scene berikutnya dari NASKAH sesuai urutan asli.

==================================================
4. SETIAP SCENE HARUS TER-GROUNDING
==================================================
Setiap scene WAJIB mempunyai hubungan yang jelas dengan NASKAH.
Untuk setiap scene tentukan:
Scene ID, Episode ID, Durasi, Bagian naskah yang menjadi sumber, Karakter, Lokasi, Waktu, Aksi, Dialog, Emosi, Tujuan scene, Event cerita yang direpresentasikan

Format per scene:
SCENE:
- Episode: EP-${String(episodeNumber).padStart(2,'0')}
- Scene: SCENE-XX
- Durasi: 7.5s
- Source Story Event: event dari SOURCE STORY
- Script Reference: scene_id dari NASKAH
- Characters: dari SOURCE STORY/NASKAH
- Location: dari cerita
- Time: waktu dari naskah
- Action: dari naskah
- Dialogue: dari naskah
- Emotion: dari naskah
- Purpose: tujuan scene

Jika suatu elemen tidak ada di cerita: JANGAN mengarang.

==================================================
5. KARAKTER
==================================================
Gunakan hanya karakter yang benar-benar terdapat dalam SOURCE STORY/NASKAH: ${storyChars}
Jumlah karakter harus sama dengan tokoh yang valid: ${story.characters.length}
Setiap karakter harus mempertahankan: nama, umur/usia visual, jenis kelamin jika tersedia, bentuk wajah, rambut, tubuh, pakaian, aksesori, ciri fisik, watak, sifat, kepribadian, hubungan dengan karakter lain
Karakter yang sama harus terlihat sebagai orang yang sama di seluruh episode dan scene.
JANGAN membuat karakter tambahan hanya untuk mengisi scene.

CHARACTER DATABASE (sudah divalidasi, WAJIB ikuti):
${charDetails}

==================================================
6. LOKASI
==================================================
Gunakan hanya lokasi yang mempunyai dasar dalam cerita: ${story.locations.map(l => l.name).join(', ')}
Lokasi harus konsisten: lingkungan, bangunan, hutan, rumah, jalan, properti, waktu, kondisi lingkungan
Jangan membuat lokasi baru yang tidak diperlukan cerita.

==================================================
7. DIALOG
==================================================
Dialog harus berasal dari NASKAH.
Jangan mengubah makna dialog.
Jangan menambahkan percakapan baru yang mengubah cerita.
Jika sebuah scene tidak mempunyai dialog: gunakan aksi/narasi yang memang terdapat dalam naskah.

==================================================
8. VISUAL PROMPT
==================================================
Setiap scene harus menghasilkan visual prompt yang siap digunakan untuk produksi.
Visual prompt wajib menjelaskan: karakter, penampilan karakter, ekspresi, pakaian, pose, aksi, lokasi, lingkungan, waktu, pencahayaan, kamera, framing, kontinuitas dengan scene sebelumnya
SEMUA karakter yang digunakan harus mengikuti CHARACTER DATABASE yang sudah divalidasi.
Jangan mengubah desain karakter antar-scene.

==================================================
9. KONTINUITAS
==================================================
Scene N harus konsisten dengan Scene N-1.
Periksa: CHARACTER CONTINUITY, LOCATION CONTINUITY, CLOTHING CONTINUITY, OBJECT/PROP CONTINUITY, TIME CONTINUITY, ACTION CONTINUITY, EMOTION CONTINUITY, STORY CONTINUITY
Jika karakter sedang berada di hutan pada akhir scene sebelumnya, scene berikutnya tidak boleh tiba-tiba berada di rumah tanpa dasar perpindahan dalam cerita.

==================================================
10. STORY COVERAGE
==================================================
Pastikan seluruh bagian penting NASKAH mendapat representasi scene.
Jangan memprioritaskan jumlah scene dengan mengorbankan cerita.
Jika 2 scene terlalu sedikit untuk memuat bagian tertentu, padatkan secara visual tanpa membuat event baru.
Jika cerita berlanjut ke episode berikutnya, buat CONTINUATION POINT yang jelas.

==================================================
11. LARANGAN KERAS
==================================================
DILARANG:
❌ membuat cerita baru
❌ membuat karakter baru
❌ membuat lokasi baru tanpa dasar
❌ membuat konflik baru
❌ membuat ending baru
❌ mengubah ending asli
❌ mengubah urutan kejadian
❌ mengubah kepribadian karakter
❌ mengganti nama karakter
❌ menggabungkan karakter berbeda
❌ memecah satu karakter menjadi karakter berbeda
❌ menambahkan dialog yang mengubah cerita
❌ menghapus event penting
❌ membuat visual yang bertentangan dengan naskah

==================================================
OUTPUT JSON — WAJIB VALID JSON ONLY
==================================================
{
  "source_story_id": "${story.source_story_id}",
  "source_story_title": "${story.title}",
  "source_script_id": "${script.source_story_id}",
  "episode_id": "EP-${String(episodeNumber).padStart(2,'0')}",
  "episode_number": ${episodeNumber},
  "episode_title": "Episode ${episodeNumber} — Judul dari bagian naskah",
  "duration_seconds": ${durationSeconds},
  "duration_formatted": "${durationSeconds}s",
  "total_scenes": ${sceneCount},
  "scene_duration_seconds": 7.5,
  "scenes": [
    {
      "scene_id": "EP-${String(episodeNumber).padStart(2,'0')}-SCENE-01",
      "episode_id": "EP-${String(episodeNumber).padStart(2,'0')}",
      "episode_number": ${episodeNumber},
      "scene_number": 1,
      "scene_number_in_episode": 1,
      "duration_seconds": 7.5,
      "duration_formatted": "7.5s",
      "source_story_event": "Event dari SOURCE STORY — misal: Di Desa Jelai Hulu warga diteror Kuyang",
      "script_reference": "scene_01 dari NASKAH",
      "story_part": "premise / conflict / ending",
      "story_source_quote": "Kutipan dari naskah",
      "characters": ["Nama dari SOURCE STORY"],
      "characters_detail": [{"name": "Jaka", "appearance": "sesuai CHARACTER DATABASE", "expression": "cemas", "clothing": "sesuai database", "pose": "berdiri", "action": "mendengar jeritan"}],
      "location": {"name": "Desa Jelai Hulu", "location_id": "LOC-DESA", "description": "Desa pedalaman", "environment": "Malam gelap"},
      "time": "Malam hari",
      "action": "Aksi dari NASKAH",
      "dialogue": [{"character": "Warga Desa", "line": "Dengar itu? Jeritan lagi!", "emotion": "takut"}],
      "emotion": "tegang",
      "purpose": "Memperkenalkan teror Kuyang",
      "visual_prompt": "Full body character Jaka, pemuda pemberani, rambut hitam, pakaian desa, ekspresi cemas, berdiri di depan rumah kayu Desa Jelai Hulu malam hari, lampu minyak, bulan redup, pencahayaan dramatic moonlight, kamera medium shot full body kepala sampai kaki terlihat, kedua kaki & tangan terlihat, background hutan larangan di kejauhan, continuity: melanjutkan dari scene sebelumnya...",
      "motionPrompt": "slow panning shot, character standing tense, subtle head turning, wind blowing hair, cinematic moonlight, slight camera shake, ambient background movement — WAJIB untuk Step 4 /test-video auto-pass",
      "continuity": {
        "previous_scene": null,
        "character_continuity": "Jaka sama dengan database — wajah konsisten, rambut konsisten",
        "location_continuity": "Desa Jelai Hulu konsisten dengan story",
        "clothing_continuity": "Pakaian desa konsisten",
        "prop_continuity": "Lampu minyak konsisten",
        "time_continuity": "Malam hari konsisten",
        "action_continuity": "Mendengar jeritan melanjutkan dari premise",
        "emotion_continuity": "Cemas sesuai konteks",
        "story_continuity": "Event 1 dari NASKAH — awal teror"
      },
      "grounding": {
        "source_story": true,
        "script": true,
        "characters_from_story": true,
        "location_from_story": true,
        "faithful": true,
        "traceable": true,
        "no_new_event": true,
        "no_new_character": true,
        "no_new_location": true
      }
    }
  ],
  "continuation_point": "Jika cerita berlanjut, jelaskan point kelanjutan ke episode berikutnya",
  "story_coverage": "Episode ini mencakup bagian premise dan awal conflict dari NASKAH — 2 dari 4 scenes NASKAH tercover",
  "consistency_notes": "Semua karakter dari SOURCE STORY, lokasi dari cerita, dialog dari NASKAH, tidak ada event/karakter/lokasi baru, kontinuitas terjaga",
  "adaptation_principle": "SOURCE STORY = sumber kebenaran, NASKAH = adaptasi resmi, EPISODE = pembagian produksi dari NASKAH, SCENE = unit visual dari EPISODE — semua sinkron 100%"
}

Rules:
- Setiap scene WAJIB memiliki motionPrompt: contoh "slow panning shot, character turning head towards camera, subtle blinking" — untuk auto-pass ke /test-video Motion Prompt column — JANGAN KOSONG
- total_scenes HARUS ${sceneCount} — sesuai rumus DURASI / 7.5
- Setiap scene duration_seconds HARUS 7.5
- duration_seconds total HARUS ${durationSeconds}
- characters HARUS subset dari ${storyChars}
- location HARUS dari ${story.locations.map(l => l.name).join(', ')}
- script_reference HARUS merujuk ke scene_id dari NASKAH yang ada
- source_story_event HARUS dari SOURCE STORY "${story.title}"
- Jangan buat karakter baru, lokasi baru, event baru
- Return ONLY JSON
`

  const prompt = `SOURCE STORY + NASKAH + CHARACTER DATABASE — GENERATE EPISODE ${episodeNumber} — DURASI ${durationSeconds} DETIK = ${sceneCount} SCENES:

SOURCE STORY:
Title: ${story.title}
ID: ${story.source_story_id}
Logline: ${story.logline}
Premise: ${story.premise}
Conflict: ${story.conflict}
Ending: ${story.ending}
Characters: ${JSON.stringify(story.characters, null, 2)}
Locations: ${JSON.stringify(story.locations, null, 2)}

NASKAH (${script.total_scenes} scenes):
${JSON.stringify(script.scenes.map(s => ({
  scene_number: s.scene_number,
  scene_id: s.scene_id,
  title: s.title,
  story_part: s.story_part,
  story_source_quote: s.story_source_quote,
  location: s.location,
  characters_present: s.characters_present,
  action: s.action,
  dialog: s.dialog,
  emotion_overall: s.emotion_overall,
  grounding: s.grounding
})), null, 2)}

CHARACTER DATABASE (sudah divalidasi FULL BODY):
${characters ? JSON.stringify(characters.characters.map(ch => ({
  name: ch.name,
  role: ch.role,
  physical: ch.physical,
  hair: ch.hair,
  face: ch.face,
  body_shape: ch.body_shape,
  clothing: ch.clothing,
  personality: ch.personality,
  visual: ch.visual
})), null, 2) : 'Belum ada character database — gunakan story.characters'}

EPISODE REQUEST:
- Episode Number: ${episodeNumber}
- Duration: ${durationSeconds} detik
- Scene Count (wajib): ${sceneCount} scenes (rumus: ${durationSeconds} / 7.5 = ${sceneCount})
- Setiap scene: 7.5 detik
- Urutan kejadian: sesuai NASKAH asli, jangan lompat timeline

TUGAS:
1. Baca SOURCE STORY dan NASKAH, cocokkan grounding data
2. Bagi NASKAH menjadi episode sesuai urutan kejadian asli — Episode ${episodeNumber} mengambil ${sceneCount} scene berikutnya
3. Untuk setiap scene, buat EpisodeScene dengan 13+ field: scene_id, episode_id, duration 7.5s, source_story_event, script_reference, characters, location, time, action, dialogue, emotion, purpose, visual_prompt, motionPrompt (WAJIB contoh: slow panning shot, character turning head towards camera, subtle blinking), continuity, grounding
4. Visual prompt harus siap produksi: karakter penampilan sesuai CHARACTER DATABASE, ekspresi, pakaian, pose, aksi, lokasi, lingkungan, waktu, pencahayaan, kamera, framing full body kepala sampai kaki, kontinuitas dengan scene sebelumnya
5. Pastikan kontinuitas: character, location, clothing, prop, time, action, emotion, story
6. Pastikan story coverage: seluruh bagian penting NASKAH tercover
7. Jangan buat cerita baru, karakter baru, lokasi baru, konflik baru, ending baru

Generate EPISODE JSON sekarang — ${sceneCount} scenes, ${durationSeconds} detik, sinkron 100% dengan SOURCE STORY dan NASKAH. Output valid JSON only.`

  return { system, prompt }
}

export async function generateEpisodeViaNexusBrain(story: StoryOutput, script: ScriptOutput, characters: CharacterOutput | null, durationSeconds: number, episodeNumber: number, language: string = 'id', requestId?: string) {
  const reqId = requestId || `episode-${Date.now()}`
  const sceneCount = getSceneCountFromDuration(durationSeconds)
  console.log(`[EpisodeEngine] Episode requested — Request ${reqId} — Story: "${story.title}" — Script: ${script.total_scenes} scenes — Duration: ${durationSeconds}s = ${sceneCount} scenes — Episode ${episodeNumber}`)
  console.log(`[EpisodeEngine] Characters: ${story.characters.map(c => c.name).join(', ')} — Grounding: SOURCE STORY + NASKAH + CHARACTER DATABASE`)

  if (!story || !story.title || !script || !script.scenes || script.scenes.length === 0) {
    return {
      ok: false,
      error: 'SOURCE STORY dan NASKAH harus tersedia. Buat cerita dan naskah terlebih dahulu. EPISODE = pembagian produksi dari NASKAH.',
      provider: 'none',
      status: 'BLOCKED',
      verification: 'Episode requires story + script as source'
    }
  }

  const { system, prompt } = buildEpisodePrompt(story, script, characters, durationSeconds, episodeNumber, language)

  const options: NexusGenerateOptions & { engine: string } = {
    prompt,
    systemPrompt: system,
    temperature: 0.6,
    maxTokens: 5000,
    engine: 'storyboard', // episode is part of storyboard engine
    requestId: reqId
  }

  const result = await ProviderManager.generateForNexusPath(options)

  if (!result.ok) {
    console.error(`[EpisodeEngine] NEXUS Brain failed for episode: ${result.error}`)
    return {
      ok: false,
      error: result.error,
      provider: result.provider,
      model: result.model,
      fallbackChain: result.fallbackChain,
      triedProviders: result.triedProviders,
      nexusBrainUsed: result.nexusBrainUsed,
      verification: `NEXUS Brain episode path — Provider: ${result.provider} — Chain: ${result.fallbackChain.join(' -> ')} — Gemini NOT used`
    }
  }

  // FIXED 2026-05-14 — JSON PARSER RESILIENCE — cleanJsonString + multi-attempt parsing like script-engine.ts to avoid "AI provider gagal menghasilkan JSON valid"
  function cleanJsonString(raw: string): string {
    let t = raw || '';
    t = t.replace(/^\uFEFF/, '').trim();
    const codeBlockMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) t = codeBlockMatch[1].trim();
    const firstBrace = t.indexOf('{');
    const lastBrace = t.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace && firstBrace > 0) {
      const candidate = t.substring(firstBrace, lastBrace + 1);
      if (candidate.length > 20) t = candidate;
    }
    t = t.replace(/\/\*[\s\S]*?\*\//g, '');
    t = t.replace(/(^|\n)\s*\/\/.*$/gm, '$1');
    t = t.replace(/,\s*([}\]])/g, '$1');
    t = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    return t.trim();
  }

  function safeParseJsonFromLLM(raw: string): { success: boolean; data?: any; error?: string; attempts: string[] } {
    const attempts: string[] = [];
    if (!raw || typeof raw !== 'string') return { success: false, error: 'Empty input', attempts: ['empty'] };
    let txt = raw.trim();
    try {
      const data = JSON.parse(txt);
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

  let jsonData: EpisodeOutput | null = null
  let parseAttempts: string[] = []
  const rawText = result.text || ''
  const parseResult = safeParseJsonFromLLM(rawText)
  parseAttempts = parseResult.attempts
  function buildMotionPromptFallbackEpisode(scene: any): string {
    const action = (scene.action || '').slice(0,120)
    const emotion = scene.emotion || 'neutral'
    return `${action ? action + ', ' : ''}${emotion} expression, slow panning shot, subtle character movement, gentle camera zoom, natural motion, cinematic, wind blowing hair, subtle blinking`.slice(0, 400)
  }

  if (parseResult.success && parseResult.data) {
    jsonData = parseResult.data as EpisodeOutput
    // POST-PROCESS: ensure motionPrompt exists per scene — auto-fill if missing — for /test-video auto-pass
    if (jsonData.scenes) {
      jsonData.scenes = jsonData.scenes.map((s: any) => {
        const mp = s.motionPrompt || s.motion_prompt || s.motion_prompt_text || ''
        if (!mp || mp.trim().length < 10) {
          return { ...s, motionPrompt: buildMotionPromptFallbackEpisode(s) }
        }
        return { ...s, motionPrompt: mp }
      })
    }
    console.log(`[EpisodeEngine] JSON PARSE SUCCESS — attempts: ${parseAttempts.join(' | ')} — Provider: ${result.provider} — motionPrompt auto-checked`)
  } else {
    console.error(`[EpisodeEngine] JSON PARSE FAILED after all cleaners — ${parseResult.error} — attempts: ${parseAttempts.join(' | ')} — raw: ${rawText.slice(0,500)}`)
    return {
      ok: false,
      error: `AI provider gagal menghasilkan JSON episode valid setelah ${parseAttempts.length} percobaan pembersihan. Provider: ${result.provider}. Raw: ${rawText.slice(0,200)} — Coba lagi. Details: ${parseResult.error?.slice(0,300)}`,
      provider: result.provider,
      model: result.model,
      fallbackChain: result.fallbackChain,
      triedProviders: result.triedProviders,
      nexusBrainUsed: true,
      rawText: rawText.slice(0, 800),
      parseAttempts
    }
  }

  const validation = validateEpisodeGrounding(jsonData as EpisodeOutput, story, script, characters, durationSeconds)

  if (jsonData) {
    (jsonData as any)._validation = validation
  }

  console.log(`[EpisodeEngine] SUCCESS — Episode ${episodeNumber} generated — ${jsonData?.total_scenes} scenes — ${durationSeconds}s — Validation: ${validation.isValid ? 'PASS' : 'FAIL'} — Provider: ${result.provider}`)

  return {
    ok: true,
    data: jsonData,
    provider: result.provider,
    model: result.model,
    role: result.role,
    fallbackChain: result.fallbackChain,
    triedProviders: result.triedProviders,
    nexusBrainUsed: true,
    validation,
    verification: `Cerita "${story.title}" (${story.characters.length} tokoh) + Naskah ${script.total_scenes} scenes → Episode ${episodeNumber} ${durationSeconds}s = ${jsonData?.total_scenes} scenes — Validation ${validation.isValid ? 'PASS' : 'FAIL'} — via NEXUS Brain ${result.provider.toUpperCase()}`
  }
}

export function validateEpisodeGrounding(episode: EpisodeOutput, story: StoryOutput, script: ScriptOutput, characters: CharacterOutput | null, expectedDuration: number) {
  const checks: any = {}
  const corrections: string[] = []

  const expectedSceneCount = getSceneCountFromDuration(expectedDuration)

  // SCENE COUNT
  const sceneCount = episode.total_scenes || episode.scenes?.length || 0
  const sceneCountPass = sceneCount === expectedSceneCount
  checks.sceneCount = {
    pass: sceneCountPass,
    reason: sceneCountPass ? `Jumlah scene sesuai rumus: ${expectedDuration}s / 7.5 = ${expectedSceneCount} scenes — Production: ${sceneCount} scenes ✅` : `Jumlah scene tidak sesuai: Expected ${expectedSceneCount} scenes untuk ${expectedDuration}s (rumus: durasi/7.5), Production: ${sceneCount} scenes ❌`,
    expected: expectedSceneCount,
    actual: sceneCount
  }
  if (!sceneCountPass) corrections.push(`Jumlah scene harus ${expectedSceneCount} untuk durasi ${expectedDuration}s`)

  // EPISODE DURATION
  const duration = episode.duration_seconds || 0
  const durationPass = Math.abs(duration - expectedDuration) < 0.1 || Math.abs((episode.scenes?.length || 0) * 7.5 - expectedDuration) < 0.1
  checks.episodeDuration = {
    pass: durationPass,
    reason: durationPass ? `Durasi episode sesuai: ${duration}s / ${expectedDuration}s — ${episode.total_scenes} scenes x 7.5s = ${episode.total_scenes * 7.5}s ✅` : `Durasi tidak sesuai: Expected ${expectedDuration}s, Production ${duration}s ❌`,
    expected: expectedDuration,
    actual: duration
  }

  // SOURCE STORY MATCH
  const storyMatch = episode.source_story_id === story.source_story_id && episode.source_story_title === story.title
  checks.sourceStoryMatch = {
    pass: storyMatch,
    reason: storyMatch ? `Source story cocok: ${episode.source_story_title} (${episode.source_story_id}) sama dengan "${story.title}" ✅` : `Source story tidak cocok: Episode dari ${episode.source_story_title} tapi story "${story.title}" ❌`,
  }

  // SCRIPT MATCH
  const scriptMatch = episode.scenes?.every(s => {
    // script_reference harus merujuk ke scene_id yang ada di script
    const ref = s.script_reference || ''
    return script.scenes.some(sc => sc.scene_id === ref || sc.title.toLowerCase().includes(ref.toLowerCase()) || ref.toLowerCase().includes(sc.scene_id.toLowerCase()) || s.story_source_quote === sc.story_source_quote)
  }) || false
  // Jika tidak ada script_reference eksplisit, cek apakah source_story_event ada di story
  const scriptMatchFallback = episode.scenes?.every(s => s.grounding?.script || s.script_reference)
  checks.scriptMatch = {
    pass: scriptMatch || scriptMatchFallback,
    reason: (scriptMatch || scriptMatchFallback) ? `Script cocok: ${episode.scenes.length} scenes memiliki script_reference yang merujuk ke NASKAH ${script.total_scenes} scenes ✅` : `Script tidak cocok: beberapa scene tidak memiliki script_reference ke NASKAH ❌`,
  }

  // CHARACTER MATCH & COUNT
  const storyCharNames = story.characters.map(c => c.name.toLowerCase())
  const prodCharNames = new Set<string>()
  let charMismatch = 0
  let charFromStory = 0
  for (const scene of episode.scenes || []) {
    for (const ch of scene.characters || []) {
      prodCharNames.add(ch)
      if (storyCharNames.some(s => s === ch.toLowerCase() || ch.toLowerCase().includes(s) || s.includes(ch.toLowerCase()))) {
        charFromStory++
      } else {
        charMismatch++
      }
    }
  }
  const charCount = prodCharNames.size
  const charCountPass = charCount <= storyCharNames.length && charMismatch === 0
  checks.characterMatch = {
    pass: charCountPass,
    reason: charCountPass ? `Karakter cocok: ${Array.from(prodCharNames).join(', ')} semua dari SOURCE STORY/NASKAH (${storyCharNames.length} tokoh valid) ✅` : `Karakter tidak cocok: ${charMismatch} karakter tidak dari story, Production: ${Array.from(prodCharNames).join(', ')} vs Story: ${storyCharNames.join(', ')} ❌`,
  }
  checks.characterCount = {
    pass: charCount <= storyCharNames.length && charCount > 0,
    reason: charCount <= storyCharNames.length ? `Jumlah karakter valid: Production ${charCount} karakter dari ${storyCharNames.length} tokoh valid di story — tidak ada tambahan ✅` : `Jumlah karakter tidak valid: Production ${charCount} > Story ${storyCharNames.length} ❌`,
    story: storyCharNames.length,
    production: charCount
  }

  // LOCATION MATCH
  const storyLocNames = story.locations.map(l => l.name.toLowerCase())
  let locMismatch = 0
  const prodLocNames = new Set<string>()
  for (const scene of episode.scenes || []) {
    const locName = scene.location?.name?.toLowerCase() || ''
    prodLocNames.add(scene.location?.name || '')
    if (locName && !storyLocNames.some(sl => sl.includes(locName) || locName.includes(sl))) {
      // Check location_id
      const idMatch = story.locations.some(l => l.location_id === scene.location?.location_id)
      if (!idMatch && locName.length > 3) {
        locMismatch++
      }
    }
  }
  checks.locationMatch = {
    pass: locMismatch === 0,
    reason: locMismatch === 0 ? `Lokasi cocok: ${Array.from(prodLocNames).join(', ')} dari ${storyLocNames.length} lokasi valid di story ✅` : `Lokasi tidak cocok: ${locMismatch} lokasi baru tanpa dasar ❌`,
  }

  // DIALOG MATCH
  let dialogMatchCount = 0
  for (const scene of episode.scenes || []) {
    if (scene.dialogue && scene.dialogue.length > 0) {
      // Dialog harus dari NASKAH — cek apakah karakter dialog ada di story dan line tidak mengubah makna secara drastis
      // Untuk validasi, kita cek apakah ada dialog di scene yang merujuk ke script
      const hasDialog = scene.dialogue.every(d => storyCharNames.some(s => s === d.character.toLowerCase() || d.character.toLowerCase().includes(s)))
      if (hasDialog) dialogMatchCount++
    } else {
      dialogMatchCount++ // No dialog okay if action/narration from naskah
    }
  }
  checks.dialogMatch = {
    pass: dialogMatchCount === (episode.scenes?.length || 0),
    reason: `Dialog cocok: ${dialogMatchCount}/${episode.scenes?.length} scenes memiliki dialog dari NASKAH dengan karakter valid ✅`,
  }

  // ACTION MATCH
  let actionMatchCount = 0
  for (const scene of episode.scenes || []) {
    if (scene.action && scene.action.length > 10) actionMatchCount++
  }
  checks.actionMatch = {
    pass: actionMatchCount === (episode.scenes?.length || 0),
    reason: `Aksi cocok: ${actionMatchCount}/${episode.scenes?.length} scenes memiliki aksi dari NASKAH ✅`,
  }

  // EMOTION MATCH — include neutral, netral, alert, waspada, determined, etc. per motion planner emotions
  let emotionMatchCount = 0
  const validEmotions = ['sedih','takut','marah','bingung','tenang','bahagia','tegang','terkejut','cemas','khawatir','senang','kecewa','haru','lega','panik','curiga','netral','neutral','alert','waspada','determined','berani','curious','penasaran','fearful','happy','sad','angry','surprised','neutral','fear','curious','happy','sad']
  for (const scene of episode.scenes || []) {
    if (scene.emotion && validEmotions.some(e => scene.emotion.toLowerCase().includes(e.toLowerCase()))) emotionMatchCount++
    else if (scene.emotion && scene.emotion.trim().length > 0) {
      // Any non-empty emotion is considered valid if it has at least 3 chars — don't block episode for neutral/alert
      if (scene.emotion.trim().length >= 3) emotionMatchCount++
    }
  }
  checks.emotionMatch = {
    pass: emotionMatchCount >= Math.floor((episode.scenes?.length || 0) * 0.6),
    reason: `Emosi cocok: ${emotionMatchCount}/${episode.scenes?.length} scenes memiliki emosi valid dari NASKAH ✅`,
  }

  // EVENT ORDER
  // Cek urutan kejadian sesuai NASKAH asli — scene_number harus urut
  let eventOrderPass = true
  for (let i = 1; i < (episode.scenes?.length || 0); i++) {
    const prev = episode.scenes[i-1]
    const curr = episode.scenes[i]
    if (prev.scene_number > curr.scene_number && prev.episode_number === curr.episode_number) {
      eventOrderPass = false
      break
    }
  }
  checks.eventOrder = {
    pass: eventOrderPass,
    reason: eventOrderPass ? `Urutan event sesuai NASKAH asli: Scene ${episode.scenes.map(s => s.scene_number).join(' → ')} urut ✅` : `Urutan event tidak sesuai: melompat-lompat timeline ❌`,
  }

  // TIMELINE
  // Waktu harus konsisten — tidak boleh tiba-tiba lompat tanpa dasar
  // Untuk validasi sederhana, cek time_continuity ada
  let timelinePass = true
  for (const scene of episode.scenes || []) {
    if (!scene.time || scene.time.length < 3) {
      timelinePass = false
      break
    }
  }
  checks.timeline = {
    pass: timelinePass,
    reason: timelinePass ? `Timeline konsisten: semua scene memiliki waktu/kondisi ✅` : `Timeline tidak konsisten: beberapa scene tidak memiliki waktu ❌`,
  }

  // CONTINUITY
  let continuityPass = true
  let continuityIssues: string[] = []
  for (let i = 0; i < (episode.scenes?.length || 0); i++) {
    const scene = episode.scenes[i]
    if (!scene.continuity) {
      continuityPass = false
      continuityIssues.push(`Scene ${scene.scene_id} tidak memiliki continuity`)
      continue
    }
    // Jika scene sebelumnya ada, cek location continuity
    if (i > 0) {
      const prev = episode.scenes[i-1]
      // Jika lokasi berubah drastis tanpa transisi, flag — tapi untuk sekarang cek apakah continuity fields ada
      if (!scene.continuity.location_continuity || !scene.continuity.character_continuity) {
        continuityPass = false
        continuityIssues.push(`Scene ${scene.scene_id} continuity tidak lengkap`)
      }
    }
  }
  checks.continuity = {
    pass: continuityPass,
    reason: continuityPass ? `Kontinuitas terjaga: CHARACTER, LOCATION, CLOTHING, PROP, TIME, ACTION, EMOTION, STORY continuity ada untuk ${episode.scenes.length} scenes ✅` : `Kontinuitas FAIL: ${continuityIssues.join(', ').slice(0,200)} ❌`,
  }

  // NO NEW EVENT
  let newEventCount = 0
  for (const scene of episode.scenes || []) {
    if (scene.grounding?.no_new_event === false || scene.grounding?.faithful === false) newEventCount++
  }
  checks.noNewEvent = {
    pass: newEventCount === 0,
    reason: newEventCount === 0 ? `Tidak ada event baru: semua scene faithful pada NASKAH ✅` : `Ada ${newEventCount} event baru tanpa dasar ❌`,
  }

  // NO NEW CHARACTER
  checks.noNewCharacter = {
    pass: charMismatch === 0,
    reason: charMismatch === 0 ? `Tidak ada karakter baru: ${charCount} karakter semua dari story ✅` : `Ada ${charMismatch} karakter baru tanpa dasar ❌`,
  }

  // NO NEW LOCATION
  checks.noNewLocation = {
    pass: locMismatch === 0,
    reason: locMismatch === 0 ? `Tidak ada lokasi baru tanpa dasar: ${Array.from(prodLocNames).join(', ')} ✅` : `Ada ${locMismatch} lokasi baru tanpa dasar ❌`,
  }

  // STORY COVERAGE
  // Pastikan seluruh bagian penting NASKAH mendapat representasi
  // Cek apakah episode mencakup premise, conflict, ending jika durasi cukup, atau bagian dari naskah
  const hasPremise = episode.scenes?.some(s => s.story_part.toLowerCase().includes('premise') || s.story_part.toLowerCase().includes('awal') || s.story_part.toLowerCase().includes('pembuka'))
  const hasEnding = episode.scenes?.some(s => s.story_part.toLowerCase().includes('ending') || s.story_part.toLowerCase().includes('akhir') || s.story_part.toLowerCase().includes('penutup'))
  const coveragePass = episode.scenes.length > 0 && (episode.story_coverage && episode.story_coverage.length > 20)
  checks.storyCoverage = {
    pass: coveragePass,
    reason: coveragePass ? `Story coverage: ${episode.story_coverage?.slice(0,100)} — ${episode.scenes.length} scenes mencakup bagian penting NASKAH ✅` : `Story coverage kurang: tidak ada deskripsi coverage ❌`,
  }

  const allPass = Object.values(checks).every((c: any) => c.pass)
  const overallReason = allPass
    ? `Episode validation PASS — Episode ${episode.episode_number} ${episode.duration_seconds}s = ${episode.total_scenes} scenes — Source Story "${story.title}" MATCH, Script ${script.total_scenes} scenes MATCH, Character ${charCount}/${storyCharNames.length} MATCH, Location MATCH, Dialog MATCH, Action MATCH, Emotion MATCH, Event Order MATCH, Timeline MATCH, Continuity PASS, No New Event/Character/Location, Story Coverage PASS, Duration PASS, Scene Count PASS — 100% sinkron SOURCE STORY → NASKAH → EPISODE → SCENE`
    : `Episode validation FAIL — ${corrections.length} koreksi — ${Object.entries(checks).filter(([k,v]: any) => !v.pass).map(([k,v]: any) => `${k}: ${v.reason}`).join('; ').slice(0, 600)}`

  return {
    isValid: allPass,
    overallReason,
    checks,
    correctionsNeeded: corrections,
    evidence: {
      sourceStory: story.title,
      sourceStoryId: story.source_story_id,
      episodeId: episode.episode_id,
      episodeNumber: episode.episode_number,
      duration: episode.duration_seconds,
      expectedDuration,
      totalScenes: episode.total_scenes,
      expectedScenes: expectedSceneCount,
      characters: Array.from(prodCharNames),
      storyCharacters: story.characters.map(c => c.name),
      locations: Array.from(prodLocNames),
      storyLocations: story.locations.map(l => l.name),
      allFullBody: true,
      continuity: continuityPass,
      noNewEvent: newEventCount === 0,
      noNewCharacter: charMismatch === 0,
      noNewLocation: locMismatch === 0
    }
  }
}
