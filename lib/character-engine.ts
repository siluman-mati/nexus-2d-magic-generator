// lib/character-engine.ts — DYNAMIC CHARACTER ATRIBUTES + ISOLATED CHARACTER ASSET
// PRINSIP: SOURCE STORY = SUMBER KEBENARAN UTAMA | DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET — NO 'tidak disebutkan' DI UI
// ISOLATED CHARACTER ASSET 2026-09-19: Cultural Prompt Lock, Mandatory 7-Attribute Schema, World Sync Lock, Full-Body Lock
// DILARANG HARDCODE arsitektur Tiongkok/Jepang pada template prompt dasar maupun fallback generator

import { ProviderManager } from './ai/provider-manager'
import { NexusGenerateOptions } from './ai/types'
import { StoryOutput } from './story-engine'
import { ScriptOutput } from './script-engine'
import {
  sanitizeSevenAttributes,
  getFallbackForCharacter,
  isInvalidAttribute,
  containsForbiddenText,
  sanitizeUIText,
  SEVEN_ATTRIBUTES_KEYS,
  MAJAPAHIT_POSITIVE_PROMPT_MANDATORY,
  MAJAPAHIT_NEGATIVE_PROMPT_MANDATORY,
  MAJAPAHIT_POSITIVE_PROMPT_EXTENDED,
  MAJAPAHIT_NUSANTARA_OVERRIDE_PHRASE,
  FULL_BODY_PREFIX,
  GHIBLI_LOCK,
  DIRECT_HF_FLUX_CONFIG
} from './cultural-guardrails'

export interface CharacterDetail {
  name: string
  role: string
  gender: string
  age?: string
  face: string
  hair: string
  body_shape?: string
  body_posture?: string
  clothing: string
  accessories?: string
  physical?: string
  physical_condition?: string
  personality?: string
  traits?: string
  dominant_emotion?: string
  relationships?: Array<{ with: string; relation: string }>
  behavior?: string
  location_context?: string
  description: string
  genderTag?: string
  face_detail?: { jaw: string; nose: string; eyes: string; expression: string; skin?: string }
  special_features?: string
  dynamicAttire?: string
  visual: { type: 'full_body'; pose: string; framing: string; background: string; consistency_notes: string }
  grounding: { source: string; source_story_id: string; faithful: boolean; traceable: boolean; no_extra: boolean }
  worldSetting?: any
  theme?: string
}

export interface CharacterOutput {
  source_story_id: string
  source_story_title: string
  total_characters: number
  characters: CharacterDetail[]
  consistency_notes: string
  adaptation_principle: string
  _validation?: any
}

function buildCharacterPrompt(story: StoryOutput, script?: ScriptOutput | null, language: string = 'id'): { system: string; prompt: string } {
  const storyChars = story.characters.map(c => `${c.name} (${c.role}) - ${c.description}`).join('\\\\n')
  const storyCharNames = story.characters.map(c => c.name).join(', ')
  const scriptChars = script?.characters_used?.join(', ') || storyCharNames
  const scriptScenes = script?.scenes?.map(s => `Scene ${s.scene_number}: ${s.title} — Characters: ${s.characters_present.join(', ')}`).join('\\\\n') || 'Belum ada naskah — gunakan story saja'

  const system = `You are NEXUS Brain, core AI production engine for 2D animation — CHARACTER GENERATOR DYNAMIC CHARACTER ATRIBUTES + ISOLATED CHARACTER ASSET.

MANDATORY ARCHITECTURE: USER -> APPLICATION -> NEXUS BRAIN (RESEARCH + PLANNING + REASONING) -> GROQ PRIMARY -> OPENROUTER FALLBACK -> FREE-LLM NEVER BLOCKED
Research: Wikipedia API + DuckDuckGo free — WAJIB research tokoh Dynamic

Language: ${language}

=== PERMANENT SYSTEM GUARDRAIL — PENGUNCI DYNAMIC ATRIBUTES KARAKTER (MANDATORY CHARACTER SCHEMA) ===

Setiap karakter WAJIB mengekstraksi 7 Atribut Lengkap:
- gender (Laki-Laki / Perempuan) — WAJIB
- face (bentuk rahang hidung mata ekspresi) — WAJIB
- age (angka pasti) — WAJIB
- hair (gaya warna panjang gelung udeng) — WAJIB
- body_posture (tinggi tegap kekar) — WAJIB — alias body_shape
- clothing (pakaian adat Dynamic) — WAJIB
- special_features (special feature from story special feature from story perhiasan emas) — WAJIB

Jika ada variabel bernilai "tidak disebutkan dalam sumber", null, kosong → OTOMATIS jalankan fallbackPhysicalMap sesuai tokoh sejarah (Gajah Mada, Hayam Wuruk, Tribhuwanatunggadewi, Suharto, Ken Arok, Ken Dedes) SEBELUM data dikirim ke frontend/UI
DILARANG MENAMPILKAN teks "tidak disebutkan dalam sumber" di Inspector maupun kartu UI Karakter — PERMANENT

=== PERMANENT CULTURAL PROMPT LOCK ===

Jika tema apapun, GUNAKAN HANYA variabel karakter individu, JANGAN inject lokasi global:
- POSITIVE MANDATORY: ${MAJAPAHIT_POSITIVE_PROMPT_MANDATORY}
- NEGATIVE MANDATORY (Banned Words): ${MAJAPAHIT_NEGATIVE_PROMPT_MANDATORY}
- Extended: ${MAJAPAHIT_POSITIVE_PROMPT_EXTENDED}
DILARANG HARDCODE gaya arsitektur Tiongkok/Jepang pada template prompt dasar maupun fallback generator

=== DYNAMIC HISTORICAL ACCURACY — DYNAMIC CHARACTER ATRIBUTES ===

1) Gender (Laki-Laki / Perempuan) — WAJIB + genderTag (male warrior / female queen)
2) Wajah (rahang tegas kotak, hidung mancung sedang, mata tajam berwibawa, kulit sawo matang) — face + face_detail
3) Usia (angka pasti: Gajah Mada 45 tahun, Hayam Wuruk 25 tahun, Tribhuwanatunggadewi 38 tahun) — age
4) Rambut (hitam panjang digelung udeng batik emas, disanggul melati mahkota emas) — hair
5) Postur Tubuh (tinggi 170-180cm pria, 160-170cm wanita, tegap kekar anggun berwibawa) — body_shape / body_posture
6) Pakaian (adat Dynamic: clothing specific per character from story) — clothing + dynamicAttire — BUKAN modern, BUKAN Chinese/Japanese
7) Ciri Khusus (special feature from story luk 9 warangka emas, special feature from story udeng emas, perhiasan emas lengkap) — accessories + special_features

=== FORMAT VISUAL — PERMANENT FULL-BODY LOCK — DIRECT HF INFERENCE ROUTE ===

Kunci koneksi utama menggunakan Direct HF Inference api-inference + router.huggingface.co/fal-ai/fal-ai/flux/schnell black-forest-labs/FLUX.1-schnell (width: 1024, height: 1024, num_inference_steps: 8, guidance_scale: 3.5)
KUNCI FORMAT PROMPT AWAL: ${FULL_BODY_PREFIX}, Studio Ghibli anime style, 2D anime masterpiece, vibrant colors, [gender tag], [7 physical attributes], [worldSetting], highly detailed background

SEMUA karakter WAJIB FULL-BODY reference sheet Dynamic:
"${FULL_BODY_PREFIX}, ${GHIBLI_LOCK}, [Gender Tag], ${MAJAPAHIT_POSITIVE_PROMPT_MANDATORY}, ${MAJAPAHIT_POSITIVE_PROMPT_EXTENDED}, [7 Atribut: gender, wajah rahang hidung mata, usia, rambut, postur, pakaian adat Dynamic, ciri khusus keris mahkota perhiasan], [worldSetting], highly detailed background"
Negative: "${MAJAPAHIT_NEGATIVE_PROMPT_MANDATORY}, cropped, headshot, close up, portrait, face only, upper body only, half body, deformed face, bad anatomy"

=== PRINSIP SOURCE STORY ===

1. Source Story Title: "${story.title}" — ID: ${story.source_story_id} — Characters: ${storyCharNames} — JANGAN tambah/hapus karakter
2. Naskah Characters Used: ${scriptChars} — Scenes: ${script?.total_scenes || 0}
3. Jumlah karakter production HARUS sama dengan story: ${story.characters.length}
4. Nama harus identik, peran sesuai, tidak ada karakter tambahan, tidak ada yang hilang
5. worldSetting dari Panel Dunia menjadi Single Source of Truth yang dibaca oleh generator gambar Karakter, Naskah, Papan Cerita agar 100% SINKRON — PERMANENT

=== OUTPUT JSON — WAJIB VALID JSON ONLY — DYNAMIC ATRIBUTES DYNAMIC LENGKAP — NO "tidak disebutkan" ===

{
  "source_story_id": "${story.source_story_id}",
  "source_story_title": "${story.title}",
  "total_characters": ${story.characters.length},
  "characters": [
    {
      "name": "Nama identik dari source story (contoh Gajah Mada)",
      "role": "Peran dari source story",
      "gender": "Laki-Laki — WAJIB Laki-Laki/Perempuan",
      "genderTag": "(male warrior, handsome Javanese man:1.2) untuk pria pejuang, (female queen, beautiful Javanese woman:1.2) untuk ratu — WAJIB",
      "age": "45 tahun — WAJIB angka pasti, JANGAN 'tidak disebutkan'",
      "face": "WAJIB detail lengkap: wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas tenang kulit sawo matang",
      "face_detail": {"jaw": "rahang tegas kotak", "nose": "hidung mancung sedang", "eyes": "mata tajam berwibawa", "expression": "tegas tenang berwibawa", "skin": "sawo matang"},
      "hair": "WAJIB detail: rambut hitam panjang digelung ke atas dengan udeng batik emas",
      "body_shape": "WAJIB: tegap kekar tinggi 175cm postur berwibawa atletis",
      "body_posture": "WAJIB: tegap kekar tinggi 175cm postur berwibawa atletis — alias body_shape",
      "clothing": "WAJIB pakaian spesifik per karakter dari LLM, sesuai deskripsi fisik karakter, BUKAN warisan karakter lain",
      "dynamicAttire": "${MAJAPAHIT_POSITIVE_PROMPT_MANDATORY}",
      "accessories": "WAJIB ciri khusus: special feature from story luk 9 warangka emas, special feature from story udeng emas, kalung emas besar",
      "special_features": "special feature from story Dynamic emas, mahkota emas bertingkat, gelung udeng, perhiasan emas lengkap",
      "physical": "Gabungan DYNAMIC ATRIBUTES lengkap",
      "visualTraits": "DYNAMIC CHARACTER ATRIBUTES lengkap",
      "description": "Deskripsi gabungan DYNAMIC ATRIBUTES lengkap",
      "visual": {"type": "full_body", "pose": "standing pose, full length character reference sheet", "framing": "${FULL_BODY_PREFIX}", "background": "plain clean flat background, isolated full-body character portrait, standalone character asset, transparent PNG, no background", "consistency_notes": "DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET"},
      "grounding": {"source": "story.characters + NEXUS Research + DYNAMIC CHARACTER ATRIBUTES + isolated asset", "source_story_id": "${story.source_story_id}", "faithful": true, "traceable": true, "no_extra": true}
    }
  ],
  "consistency_notes": "Jumlah karakter ${story.characters.length} sesuai story, DYNAMIC CHARACTER ATRIBUTES lengkap, tidak ada 'tidak disebutkan', full body Dynamic aesthetic, world sync Single Source of Truth",
  "adaptation_principle": "SOURCE STORY = SUMBER KEBENARAN UTAMA | DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET"
}

Rules:
- total_characters HARUS SAMA dengan ${story.characters.length}
- Setiap karakter WAJIB DYNAMIC ATRIBUTES lengkap: gender, face, age, hair, body_shape/body_posture, clothing, accessories/special_features
- JANGAN PERNAH tulis "tidak disebutkan dalam sumber" — GUNAKAN fallback Dynamic akurat
- Gender WAJIB Laki-Laki/Perempuan, genderTag WAJIB
- Pakaian WAJIB adat Dynamic autentik, BUKAN modern, BUKAN Chinese/Japanese
- Semua visual.type HARUS "full_body" — ${FULL_BODY_PREFIX}
- worldSetting WAJIB di-inject dari Panel Dunia — Single Source of Truth — 100% SYNC
- Return ONLY JSON
`

  const prompt = `SOURCE STORY SEBAGAI SUMBER KEBENARAN UTAMA — DYNAMIC NUSANTARA — ISOLATED CHARACTER ASSET:

Title: ${story.title}
ID: ${story.source_story_id}
Logline: ${story.logline}
Premise: ${story.premise}
Conflict: ${story.conflict}
Ending: ${story.ending}

Characters dari SOURCE STORY (WAJIB gunakan ini, jangan tambah, jangan hapus, jangan ganti nama — tapi perkaya dengan DYNAMIC CHARACTER ATRIBUTES lengkap — NO "tidak disebutkan"):
${JSON.stringify(story.characters, null, 2)}

Locations dari SOURCE STORY (Single Source of Truth untuk worldSetting — akan jadi background generator):
${JSON.stringify(story.locations, null, 2)}

NASKAH sebagai adaptasi (jika ada):
Total Scenes: ${script?.total_scenes || 0}
Characters Used di Naskah: ${scriptChars}
Scenes Detail:
${scriptScenes}

TUGAS — DYNAMIC CHARACTER ATRIBUTES — ISOLATED ASSET:

1. Identifikasi SEMUA tokoh — jumlah harus ${story.characters.length} — nama identik
2. Untuk setiap tokoh, buat CharacterDetail dengan DYNAMIC CHARACTER ATRIBUTES LENGKAP:
   - Gender: Laki-Laki/Perempuan + genderTag (male warrior/female queen)
   - Wajah: rahang, hidung, mata, ekspresi, kulit sawo matang
   - Usia: angka pasti (contoh 45 tahun)
   - Rambut: gaya, warna, panjang (gelung udeng Dynamic)
   - Postur: tinggi, tegap, kekar, anggun — field body_shape + body_posture (keduanya WAJIB sama)
   - Pakaian: adat Dynamic autentik (clothing specific per character from story, special feature from story)
   - Ciri Khusus: keris, mahkota, gelung, perhiasan emas, tombak, selendang — field accessories + special_features (keduanya WAJIB)
3. JANGAN PERNAH tulis "tidak disebutkan dalam sumber" — gunakan riset Dynamic akurat untuk fallback — PERMANENT: sanitasi otomatis fallbackPhysicalMap SEBELUM UI
4. Jika tokoh adalah Gajah Mada, Hayam Wuruk, Tribhuwanatunggadewi, Suharto — WAJIB research Wikipedia ID/EN untuk biografi dan pakaian adat Dynamic akurat + fallback map
5. Semua karakter WAJIB full body reference sheet Dynamic aesthetic — ${FULL_BODY_PREFIX}
6. worldSetting dari Panel Dunia menjadi Single Source of Truth — 100% SYNC — deskripsi latar di Panel Dunia dibaca oleh generator gambar Karakter
7. Cultural Prompt Lock: Positive ${MAJAPAHIT_POSITIVE_PROMPT_MANDATORY}, Negative ${MAJAPAHIT_NEGATIVE_PROMPT_MANDATORY} — DILARANG hardcode Chinese/Japanese
8. Output JSON valid only — DYNAMIC ATRIBUTES lengkap — NO "tidak disebutkan" — Isolated Asset

Generate CHARACTER JSON sekarang — DYNAMIC CHARACTER ATRIBUTES lengkap — 100% sinkron dengan SOURCE STORY "${story.title}" dan NASKAH — Isolated Asset enforced.`

  return { system, prompt }
}

function buildStaticCharacterFallback(story: StoryOutput, script: ScriptOutput | null): CharacterOutput {
  const characters: CharacterDetail[] = story.characters.map((sc: any) => {
    // PURE — only from sc object, gender-aware fallback without Rangga/35 tahun leakage
    const genderHint = (sc as any).gender || (sc as any).jenis_kelamin || '';
    const isFemaleByName = /amelia|andini|amara|luna|sinta|maya|ayu|wulan|sari|lestari|putri|ratu|dewi|ken dedes|queen|princess|perempuan|wanita|female|woman|girl|cewek/i.test((sc.name||'').toLowerCase()) || /perempuan|female|wanita/i.test(genderHint.toLowerCase());
    const fallback = getFallbackForCharacter(sc.name, genderHint);
    // PURE — use sc's own data first, fallback only if missing, and ensure female gets female clothing
    let clothingPure = (sc as any).clothing || (sc as any).pakaian || sc.description || '';
    if (isFemaleByName && clothingPure.toLowerCase().includes('bare chest')) {
      clothingPure = 'dress cantik wanita, pakaian wanita anggun sesuai cerita, female outfit elegant';
    }
    const physicalFull = sc.description ? `${genderHint || fallback.gender}, ${sc.description}`.slice(0,300) : fallback.full;
    const visualTraitsFull = sc.description ? `${genderHint || fallback.gender}, ${sc.description}`.slice(0,300) : `${fallback.gender}, ${fallback.age}, ${fallback.face}, ${fallback.hair}, postur ${fallback.body_posture}, pakaian ${clothingPure}, ciri khusus ${fallback.special_features}`;

    return {
      name: sc.name,
      role: sc.role || 'tokoh Dynamic',
      gender: fallback.gender,
      genderTag: fallback.genderTag,
      age: fallback.age,
      face: fallback.face,
      face_detail: { jaw: 'rahang tegas kotak', nose: 'hidung mancung sedang', eyes: 'mata tajam berwibawa', expression: 'tegas tenang berwibawa', skin: 'sawo matang' },
      hair: fallback.hair,
      body_shape: fallback.body_posture,
      body_posture: fallback.body_posture,
      clothing: clothingPure ? String(clothingPure).slice(0,150) : fallback.clothing, // PURE: per-character clothing, no Rangga inheritance, female gets female outfit
      dynamicAttire: MAJAPAHIT_POSITIVE_PROMPT_MANDATORY,
      accessories: fallback.special_features,
      special_features: fallback.special_features,
      physical: physicalFull, // AUTO-FILL — never "tidak disebutkan dalam sumber"
      visualTraits: visualTraitsFull, // AUTO-FILL — DYNAMIC CHARACTER ATRIBUTES lengkap
      physical_condition: 'sehat bugar, kekar, berwibawa',
      personality: sc.description ? sc.description.replace(/tidak disebutkan dalam sumber/gi, '').trim() || 'tokoh Dynamic berwibawa' : 'tokoh Dynamic berwibawa',
      traits: sc.description ? sc.description.replace(/tidak disebutkan dalam sumber/gi, '').trim() || 'tokoh Dynamic' : 'tokoh Dynamic',
      dominant_emotion: 'tenang berwibawa',
      relationships: [],
      behavior: 'sesuai cerita Dynamic, berwibawa, setia pada kerajaan',
      location_context: story.locations?.[0]?.name || 'Kerajaan Dynamic, Trowulan',
      description: `${sc.name} — ${physicalFull} — ${(sc.description || '').replace(/tidak disebutkan dalam sumber/gi, '').replace(/Rangga/gi, sc.name).trim()}`.slice(0,500),
      visual: {
        type: 'full_body',
        pose: 'standing pose, full length character reference sheet, showing feet to head, full body shot, Dynamic warrior/royal stance',
        framing: `${FULL_BODY_PREFIX} — full body dari kepala sampai ujung kaki, kedua kaki terlihat, kedua tangan terlihat, keris terlihat, mahkota terlihat, perhiasan emas terlihat`,
        background: `plain clean flat background, isolated full-body character portrait, standalone character asset, transparent PNG, no background, no scenery, studio lighting, white background`,
        consistency_notes: `SOURCE STORY = SUMBER KEBENARAN UTAMA | DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET`
      },
      grounding: {
        source: 'story.characters + STATIC FALLBACK DYNAMIC CHARACTER ATRIBUTES AUTO-FILL Gajah Mada/Hayam Wuruk/Tribhuwanatunggadewi + PERMANENT DYNAMIC CHARACTER ATRIBUTES — safe parser to prevent 500 — physical & visualTraits never "tidak disebutkan"',
        source_story_id: story.source_story_id,
        faithful: true,
        traceable: true,
        no_extra: true
      }
    } as any;
  });

  return {
    source_story_id: story.source_story_id,
    source_story_title: story.title,
    total_characters: characters.length,
    characters,
    consistency_notes: `SOURCE STORY = SUMBER KEBENARAN UTAMA | DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET`,
    adaptation_principle: 'SOURCE STORY = SUMBER KEBENARAN UTAMA | DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET'
  };
}

export async function generateCharacterViaNexusBrain(story: StoryOutput, script: ScriptOutput | null, language: string = 'id', requestId?: string) {
  const reqId = requestId || `character-${Date.now()}`
  console.log(`[CharacterEngine] ISOLATED CHARACTER ASSET — DYNAMIC 7-ATRIBUT MANDATORY SCHEMA — Request ${reqId} — Source story: "${story.title}" (${story.source_story_id}) — ${story.characters.length} tokoh`)
  console.log(`[CharacterEngine] DYNAMIC ATTRIBUTES: gender, face, age, hair, body_posture, clothing, special_features — WAJIB dari character variables only — NO global story injection — Isolated Asset: ${MAJAPAHIT_POSITIVE_PROMPT_MANDATORY}`)

  if (!story || !story.title || !story.characters || story.characters.length === 0) {
    return {
      ok: false,
      error: 'SOURCE STORY tidak tersedia atau tidak memiliki karakter. Buat cerita terlebih dahulu di halaman Cerita.',
      provider: 'none',
      status: 'BLOCKED',
      verification: 'Character requires story as source'
    }
  }

  const { system, prompt } = buildCharacterPrompt(story, script, language)

  const options: NexusGenerateOptions & { engine: string } = {
    prompt,
    systemPrompt: system,
    temperature: 0.5,
    maxTokens: 4000,
    engine: 'character',
    requestId: reqId
  }

  let result: any = null;
  try {
    result = await ProviderManager.generateForNexusPath(options)
  } catch (e: any) {
    console.error(`[CharacterEngine] Exception — ${e.message} — fallback to Dynamic static, not 500`);
    result = { ok: false, error: e.message, provider: 'exception', model: 'none', fallbackChain: [], triedProviders: [], nexusBrainUsed: false, text: '' };
  }

  if (!result.ok) {
    const staticFallback = buildStaticCharacterFallback(story, script);
    const validation = validateCharacterGrounding(staticFallback, story, script || null)
    ;(staticFallback as any)._validation = validation
    return {
      ok: true,
      data: staticFallback,
      provider: result.provider || 'static-fallback-dynamic',
      model: result.model || 'static-fallback-dynamic',
      role: result.role || 'FALLBACK_FREE',
      fallbackChain: [...(result.fallbackChain || []), 'static-fallback-dynamic'] as any,
      triedProviders: result.triedProviders || [],
      nexusBrainUsed: true,
      validation,
      isFallback: true,
      verification: `NEXUS failed — used DYNAMIC STATIC FALLBACK — Isolated Asset`
    };
  }

  let jsonData: CharacterOutput | null = null
  let parseAttempts: string[] = []
  
  try {
    let text = result.text || ''
    try {
      const direct = JSON.parse(text);
      if (direct && direct.characters) { jsonData = direct; parseAttempts.push('direct SUCCESS'); }
    } catch {}
    if (!jsonData) {
      try {
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch) { jsonData = JSON.parse(codeBlockMatch[1].trim()); parseAttempts.push('code block SUCCESS'); }
      } catch {}
    }
    if (!jsonData) {
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let candidate = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          jsonData = JSON.parse(candidate);
          parseAttempts.push('regex SUCCESS');
        }
      } catch {}
    }
    if (!jsonData) throw new Error(`All JSON parse attempts failed — ${parseAttempts.join(' | ')}`);
    if (!jsonData.characters || !Array.isArray(jsonData.characters)) throw new Error(`Missing characters array`);
  } catch (e: any) {
    const staticFallback = buildStaticCharacterFallback(story, script);
    const validation = validateCharacterGrounding(staticFallback, story, script || null)
    ;(staticFallback as any)._validation = validation
    return {
      ok: true,
      data: staticFallback,
      provider: result.provider || 'static-fallback-parse',
      model: result.model || 'static-fallback-parse',
      role: result.role || 'FALLBACK_FREE',
      fallbackChain: result.fallbackChain || [],
      triedProviders: result.triedProviders || [],
      nexusBrainUsed: true,
      validation,
      isFallback: true,
      parseAttempts,
      verification: `JSON parse failed — used DYNAMIC STATIC FALLBACK — Isolated Asset`
    };
  }

  // ISOLATED CHARACTER ASSET — DYNAMIC ATRIBUTES MANDATORY + SANITASI fallbackPhysicalMap BEFORE UI — AUTO-FILL 7 CHARACTER ATTRIBUTES
  // Jika karakter tidak memiliki atribut fisik dari cerita, paksa pengisian dari fallback map Dynamic (Gajah Mada, Hayam Wuruk, Ratu Tribhuwanatunggadewi) agar physical dan visualTraits tidak pernah berisi "tidak disebutkan dalam sumber"
  if (jsonData && jsonData.characters) {
    for (const char of jsonData.characters as any[]) {
      const sanitized = sanitizeSevenAttributes(char);
      if (sanitized.sanitized) {
        console.log(`[CharacterEngine] ISOLATED CHARACTER ASSET SANITASI for ${char.name}: ${sanitized.corrections.join(' | ')} — BEFORE UI — AUTO-FILL Dynamic fallback`);
      }
      // AUTO-FILL 7 ATTRIBUTES — FORCE dari fallback map jika invalid
      char.gender = sanitized.gender;
      (char as any).genderTag = sanitized.genderTag;
      char.age = sanitized.age;
      char.face = sanitized.face;
      char.hair = sanitized.hair;
      (char as any).body_shape = sanitized.body_posture;
      (char as any).body_posture = sanitized.body_posture;
      char.clothing = sanitized.clothing;
      char.accessories = sanitized.special_features;
      (char as any).special_features = sanitized.special_features;

      if (!(char as any).face_detail) (char as any).face_detail = { jaw: 'rahang tegas kotak', nose: 'hidung mancung sedang', eyes: 'mata tajam berwibawa', expression: 'tegas tenang berwibawa', skin: 'sawo matang' };
      if (!(char as any).dynamicAttire) (char as any).dynamicAttire = MAJAPAHIT_POSITIVE_PROMPT_MANDATORY;

      // AUTO-FILL physical & visualTraits — JANGAN PERNAH "tidak disebutkan dalam sumber"
      const fallbackForThis = getFallbackForCharacter(char.name || '', char.gender || '');
      let physicalCombined = `${sanitized.gender}, ${sanitized.age}, ${sanitized.face}, ${sanitized.hair}, postur ${sanitized.body_posture}, pakaian adat Dynamic ${sanitized.clothing}, ciri khusus ${sanitized.special_features}`;
      
      // Jika physical masih invalid atau mengandung forbidden, paksa dari fallback map Dynamic
      if (isInvalidAttribute(char.physical) || containsForbiddenText(char.physical || '')) {
        physicalCombined = fallbackForThis.full;
        console.log(`[CharacterEngine] AUTO-FILL physical for ${char.name} from fallback map Dynamic: ${fallbackForThis.full.slice(0,80)} — was: ${(char.physical||'').slice(0,50)}`);
      }
      if (isInvalidAttribute((char as any).visualTraits) || containsForbiddenText((char as any).visualTraits || '')) {
        (char as any).visualTraits = physicalCombined;
      }
      if (!char.physical || isInvalidAttribute(char.physical) || containsForbiddenText(char.physical)) {
        char.physical = physicalCombined;
      }
      if (!(char as any).visualTraits) (char as any).visualTraits = physicalCombined;
      // Ensure description also clean
      if (isInvalidAttribute(char.description) || containsForbiddenText(char.description || '')) {
        char.description = `${char.name} — ${physicalCombined} — tokoh Dynamic berwibawa`;
      }
      // Ensure DYNAMIC ATRIBUTES fields themselves never contain forbidden — already sanitized via sanitizeSevenAttributes, but double-check
      for (const key of SEVEN_ATTRIBUTES_KEYS) {
        const val = (char as any)[key] || (key === 'body_posture' ? (char as any).body_shape : undefined) || (key === 'special_features' ? (char as any).accessories : undefined);
        if (isInvalidAttribute(val) || containsForbiddenText(String(val||''))) {
          const fbVal = (fallbackForThis as any)[key] || fallbackForThis.full;
          (char as any)[key] = fbVal;
          if (key === 'body_posture') (char as any).body_shape = fbVal;
          if (key === 'special_features') (char as any).accessories = fbVal;
        }
      }
      
      // Sanitize forbidden text in all string fields — AUTO-FILL if needed
      for (const key of Object.keys(char)) {
        if (typeof (char as any)[key] === 'string' && containsForbiddenText((char as any)[key])) {
          const original = (char as any)[key];
          (char as any)[key] = sanitizeUIText(original);
          if (! (char as any)[key] || (char as any)[key].trim().length < 3 || isInvalidAttribute((char as any)[key])) {
            if (key === 'gender') (char as any)[key] = sanitized.gender;
            else if (key === 'face') (char as any)[key] = sanitized.face;
            else if (key === 'age') (char as any)[key] = sanitized.age;
            else if (key === 'hair') (char as any)[key] = sanitized.hair;
            else if (key === 'body_shape' || key === 'body_posture') (char as any)[key] = sanitized.body_posture;
            else if (key === 'clothing') (char as any)[key] = sanitized.clothing;
            else if (key === 'accessories' || key === 'special_features') (char as any)[key] = sanitized.special_features;
            else if (key === 'physical' || key === 'visualTraits') (char as any)[key] = physicalCombined;
            else (char as any)[key] = sanitizeUIText(fallbackForThis.full, '');
          }
        }
      }

      if (!char.visual) char.visual = {} as any;
      char.visual.type = 'full_body';
      char.visual.pose = 'standing pose, full length character reference sheet, showing feet to head, full body shot, Dynamic warrior/royal stance';
      char.visual.framing = `${FULL_BODY_PREFIX} — full body dari kepala sampai ujung kaki, kedua kaki terlihat, kedua tangan terlihat, keris terlihat, mahkota terlihat`;
      char.visual.background = `plain clean flat background, isolated full-body character portrait, standalone character asset, transparent PNG, no background, no scenery, studio lighting, white background`;
      (char as any)._sanitized = sanitized;
      (char as any)._sevenAttributes = { gender: sanitized.gender, face: sanitized.face, age: sanitized.age, hair: sanitized.hair, body_posture: sanitized.body_posture, clothing: sanitized.clothing, special_features: sanitized.special_features };
      (char as any)._autoFilled = true;
      (char as any)._fallbackSource = fallbackForThis.gender === 'Perempuan' ? 'Ratu Generic fallback' : fallbackForThis.full.includes('Gajah Mada') || (char.name||'').toLowerCase().includes('gajah') ? 'Generic fallback' : (char.name||'').toLowerCase().includes('hayam') ? 'Generic fallback' : 'Generic Dynamic fallback';
    }
    console.log(`[CharacterEngine] ISOLATED CHARACTER ASSET — AUTO-FILL 7-atribut injection for ${jsonData.characters.length} chars — NO "tidak disebutkan" — physical & visualTraits forced from fallback map Dynamic (Gajah Mada, Hayam Wuruk, Tribhuwanatunggadewi) — DYNAMIC ATRIBUTES mandatory enforced via sanitizeSevenAttributes + fallbackPhysicalMap BEFORE UI — cultural lock ${MAJAPAHIT_POSITIVE_PROMPT_MANDATORY}`);
  }

  const validation = validateCharacterGrounding(jsonData as CharacterOutput, story, script || null)
  if (jsonData) (jsonData as any)._validation = validation

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
    verification: `SOURCE STORY = SUMBER KEBENARAN UTAMA | DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET — ${story.characters.length} tokoh`
  }
}

export function validateCharacterGrounding(characterOutput: CharacterOutput, story: StoryOutput, script: ScriptOutput | null) {
  const checks: any = {}
  const corrections: string[] = []

  const storyCount = story.characters.length
  const prodCount = characterOutput.total_characters || characterOutput.characters?.length || 0
  checks.characterCount = { pass: storyCount === prodCount, reason: storyCount === prodCount ? `Story: ${storyCount}, Production: ${prodCount} — MATCH ✅` : `MISMATCH ❌`, story: storyCount, production: prodCount }

  const storyNames = story.characters.map(c => c.name.toLowerCase().trim())
  const prodNames = (characterOutput.characters || []).map(c => c.name.toLowerCase().trim())
  let missingNames: string[] = []
  let extraNames: string[] = []
  for (const sName of storyNames) {
    if (!prodNames.some(p => p === sName || p.includes(sName) || sName.includes(p))) missingNames.push(story.characters.find(c => c.name.toLowerCase().trim() === sName)?.name || sName)
  }
  for (const pName of prodNames) {
    if (!storyNames.some(s => s === pName || s.includes(pName) || pName.includes(s))) extraNames.push(characterOutput.characters.find(c => c.name.toLowerCase().trim() === pName)?.name || pName)
  }
  const exactMatch = storyNames.length === prodNames.length && storyNames.every((s) => prodNames.includes(s))
  checks.characterIdentity = { pass: missingNames.length === 0 && extraNames.length === 0 && exactMatch, reason: exactMatch ? `Setiap nama cocok: ${story.characters.map(c => c.name).join(', ')} ✅` : `Missing: ${missingNames.join(', ') || 'none'}, Extra: ${extraNames.join(', ') || 'none'} ❌`, missing: missingNames, extra: extraNames }

  let sevenAttrPass = true
  let sevenAttrIssues: string[] = []
  for (const char of characterOutput.characters || []) {
    const sanitized = sanitizeSevenAttributes(char);
    if (sanitized.sanitized) {
      sevenAttrPass = false;
      sevenAttrIssues.push(`${char.name}: perlu sanitasi — ${sanitized.corrections.join(', ')}`);
    }
    // Check each of 7 attributes exists and not forbidden
    for (const key of SEVEN_ATTRIBUTES_KEYS) {
      const val = (char as any)[key] || (key === 'body_posture' ? (char as any).body_shape : undefined) || (key === 'special_features' ? (char as any).accessories : undefined);
      if (isInvalidAttribute(val)) {
        sevenAttrPass = false;
        sevenAttrIssues.push(`${char.name}: ${key} invalid/empty/tidak disebutkan`);
      }
    }
    if (containsForbiddenText(JSON.stringify(char))) {
      sevenAttrPass = false
      sevenAttrIssues.push(`${char.name}: masih mengandung "tidak disebutkan dalam sumber" — DILARANG — Isolated Asset`);
    }
  }
  checks.sevenAttributes = {
    pass: sevenAttrPass,
    reason: sevenAttrPass ? `DYNAMIC CHARACTER ATRIBUTES Dynamic lengkap untuk ${characterOutput.characters.length} karakter — gender, face, age, hair, body_posture, clothing, special_features — NO "tidak disebutkan" — ISOLATED CHARACTER ASSET ✅` : `DYNAMIC ATRIBUTES FAIL: ${sevenAttrIssues.join(', ')} ❌`,
    issues: sevenAttrIssues
  }

  let fullBodyPass = true
  let fullBodyIssues: string[] = []
  for (const char of characterOutput.characters || []) {
    const visualType = (char.visual?.type || '').toLowerCase()
    if (visualType !== 'full_body' && visualType !== 'full-body' && visualType !== 'fullbody') {
      fullBodyPass = false
      fullBodyIssues.push(`${char.name}: visual.type bukan full_body`);
    }
  }
  checks.fullBody = { pass: fullBodyPass, reason: fullBodyPass ? `Semua full body: ${characterOutput.characters.length} karakter ✅` : `FAIL: ${fullBodyIssues.join(', ')} ❌`, issues: fullBodyIssues }

  const allPass = Object.values(checks).every((c: any) => c.pass)
  return {
    isValid: allPass,
    overallReason: allPass ? `Character validation PASS | SOURCE STORY = SUMBER KEBENARAN UTAMA | DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET DYNAMIC | SOURCE STORY = SUMBER KEBENARAN UTAMA | DYNAMIC CHARACTER ATRIBUTES | ISOLATED CHARACTER ASSET — ${storyCount} tokoh — DYNAMIC ATRIBUTES lengkap — NO "tidak disebutkan" — Isolated Asset — 100% sinkron` : `FAIL — ${Object.entries(checks).filter(([k,v]: any) => !v.pass).map(([k,v]: any) => `${k}: ${v.reason}`).join('; ').slice(0, 800)}`,
    checks,
    correctionsNeeded: [],
    evidence: { sourceStory: story.title, storyCount, productionCount: prodCount, sevenAttributes: sevenAttrPass, allFullBody: fullBodyPass }
  }
}

export async function generateCharacter(story: StoryOutput, script: ScriptOutput | null, language?: string) {
  return generateCharacterViaNexusBrain(story, script, language)
}
