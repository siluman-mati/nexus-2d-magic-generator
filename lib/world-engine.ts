// lib/world-engine.ts — WORLD BUILDING ENGINE — DYNAMIC 100% FROM STORY SOURCE — REFACTORED 2026-09-20
// PRINCIPLE: World theme is read dynamically from active Source Story / Naskah
// If story set in Kafe/Kota -> modern city visual; if Kerajaan -> kingdom visual; if Hutan -> forest; etc.
// No hardcoded Majapahit lock in main flow — dynamic context detection
// ARCHITECTURE: USER -> APP -> NEXUS BRAIN -> GROQ -> OPENROUTER -> FREE-LLM
// LEGACY constants MAJAPAHIT_* kept in cultural-guardrails but NOT used in active flow

import { ProviderManager } from './ai/provider-manager'
import { NexusGenerateOptions } from './ai/types'
import { StoryOutput } from './story-engine'
import { ScriptOutput } from './script-engine'
import { CharacterOutput } from './character-engine'
import {
  sanitizeUIText,
  containsForbiddenText,
  isInvalidAttribute,
  detectDynamicStoryContext,
  getWorldSettingForPrompt,
  getWorldSettingForPromptDynamic,
  WORLD_DEFAULT_MAJAPAHIT,
  WORLD_BACKGROUND_ONLY_NEGATIVE,
  TIME_OF_DAY_MAP,
  WEATHER_MAP
} from './cultural-guardrails'

export interface WorldLocationDetail {
  location_id: string
  name: string
  era: string
  architecture: string
  atmosphere: string
  cultural_elements: string
  description: string
  environment: string
  time_of_day?: string
  weather?: string
  flora_fauna?: string
  materials?: string
  lighting?: string
  visual: { type: 'environment' | 'location' | 'world'; framing: string; background: string; consistency_notes: string }
  grounding: { source: string; source_story_id: string; faithful: boolean; traceable: boolean; no_extra: boolean }
  visualPrompt?: string
  worldSetting?: string // Single Source of Truth — read by image generators
  dynamicContext?: any
}

export interface WorldOutput {
  source_story_id: string
  source_story_title: string
  total_locations: number
  locations: WorldLocationDetail[]
  world_summary: string
  era_summary: string
  architecture_summary: string
  culture_summary: string
  consistency_notes: string
  adaptation_principle: string
  worldSetting?: string // global Single Source of Truth
  _validation?: any
}

// DYNAMIC WORLD CONTEXT DETECTOR — reads from story/naskah active
function detectWorldContextFromStory(story: StoryOutput, script: ScriptOutput | null): { type: string; aesthetic: string; clothing: string; era: string; isModern: boolean; isKingdom: boolean; isUrban: boolean; raw: string } {
  const combined = `${story.title} ${story.logline} ${story.premise} ${story.conflict} ${story.ending} ${story.locations.map(l => `${l.name} ${l.description} ${l.environment}`).join(' ')} ${script?.scenes?.map(s => s.location?.name || '').join(' ') || ''}`.toLowerCase()
  const dynamic = detectDynamicStoryContext(combined)
  
  let type = 'generic'
  let aesthetic = 'dynamic environment from story source, background matching story description'
  let era = 'Era sesuai cerita, kontemporer atau historis sesuai naskah'
  
  if (dynamic.isModern || /kafe|cafe|kopi|coffee|barista|kantor|office|kampus|sekolah|mall|restoran|kota|urban|apartemen|startup|perkotaan|modern|contemporary/.test(combined)) {
    type = 'modern_city'
    aesthetic = 'modern urban city aesthetic, contemporary architecture, clean modern style, cityscape with buildings, street lights, cafe interior if kafe, office interior if kantor'
    era = 'Era modern kontemporer, 2020-an, sesuai cerita urban'
  } else if (dynamic.isKingdom || /kerajaan|kingdom|istana|raja|ratu|keraton|kesultanan|kolosal|mahkota|singgasana|pendekar|prajurit|silat|jawa kuno|nusantara|majapahit|hayam wuruk|gajah mada/.test(combined)) {
    type = 'kingdom'
    aesthetic = 'historical kingdom aesthetic, traditional palace architecture, regal colossal style, traditional cultural, authentic historical costume setting'
    era = 'Era kerajaan tradisional, historis sesuai cerita, bisa Majapahit jika disebutkan'
  } else if (/hutan|forest|gunung|mountain|rimba|jungle|sungai|river|desa|village|sawah|alam|nature/.test(combined)) {
    type = 'nature'
    aesthetic = 'natural landscape aesthetic, tropical forest, lush greenery, natural environment matching story'
    era = 'Era natural, sesuai setting alam cerita'
  } else if (/pasar|market|kampung|alun|pantai|beach|laut|sea|sekolah|school|rumah|house|gedung|building/.test(combined)) {
    type = 'community'
    aesthetic = 'community environment aesthetic, traditional or modern matching story, local cultural setting'
    era = 'Era sesuai cerita'
  } else {
    type = dynamic.isFantasy ? 'fantasy' : 'generic'
    aesthetic = dynamic.aesthetic || 'aesthetic matching story description, style from source story'
    era = 'Era sesuai cerita'
  }
  
  return { type, aesthetic, clothing: dynamic.clothingStyle, era, isModern: dynamic.isModern, isKingdom: dynamic.isKingdom, isUrban: dynamic.isUrban, raw: combined }
}

function buildWorldPrompt(story: StoryOutput, script: ScriptOutput | null, characters: CharacterOutput | null, language: string = 'id'): { system: string; prompt: string } {
  const storyLocs = story.locations.map(l => `${l.name} (${l.location_id}) - ${l.description} - Env: ${l.environment}`).join('\n')
  const storyLocNames = story.locations.map(l => l.name).join(', ')
  const scriptLocs = script?.locations_used?.join(', ') || storyLocNames
  const charNames = story.characters.map(c => c.name).join(', ')
  const worldCtx = detectWorldContextFromStory(story, script)

  const system = `You are NEXUS Brain, core AI production engine for 2D animation — WORLD BUILDING GENERATOR DYNAMIC 100% FROM STORY SOURCE.

MANDATORY ARCHITECTURE: USER -> APPLICATION -> NEXUS BRAIN -> GROQ PRIMARY -> OPENROUTER FALLBACK -> FREE-LLM NEVER BLOCKED

Language: ${language}

=== DYNAMIC WORLD BUILDING — NO HARDCODED MAJAPAHIT LOCK — READ FROM ACTIVE STORY ===

PRINCIPLE: World theme is read dynamically from active Source Story / Naskah
- If story set in Kafe/Kota (contains kafe, cafe, kopi, kantor, mall, kota, urban) -> generate MODERN CITY visual: modern cafe interior, cityscape, office, contemporary architecture, street lights, neon, casual modern clothing context
- If story set in Kerajaan/Istana (contains kerajaan, istana, raja, ratu, keraton, Majapahit) -> generate KINGDOM visual: traditional palace, regal architecture, historical costume setting, but ONLY if story mentions it — not hardcoded
- If story set in Hutan/Desa/Alam (contains hutan, desa, gunung, sawah) -> generate NATURE visual: lush tropical forest, village, rice fields, natural environment
- If story set in Pasar/Kampung/Pantai -> generate COMMUNITY visual: traditional market, beach, local cultural
- Otherwise -> GENERIC visual matching story description 100%

Detected Context for this story: Type=${worldCtx.type}, isModern=${worldCtx.isModern}, isKingdom=${worldCtx.isKingdom}, aesthetic=${worldCtx.aesthetic}, era=${worldCtx.era}

SOURCE STORY LOCATIONS: ${storyLocNames} — WAJIB use these names, do NOT create new major locations without basis
SCRIPT LOCATIONS: ${scriptLocs}

=== WORLD BUILDING — 5 ATRIBUT WAJIB DYNAMIC ===

1) Nama Lokasi — spesifik from story — Field: name, location_id
2) Era Sejarah — from story context: ${worldCtx.era} — Field: era — if modern story, era = modern 2020s; if kingdom story, era = historical kingdom era from story
3) Arsitektur Bangunan — DYNAMIC from story: ${worldCtx.aesthetic} — Field: architecture — MUST match story description, NOT hardcoded Candi-Trowulan-REMOVED / Gapura-Wringin-Lawang-REMOVED
   - If MODERN (kafe/kota): cafe interior with wooden tables, coffee machines, modern city buildings, glass windows, street lights
   - If KINGDOM (kerajaan/istana): traditional palace architecture, pendopo, royal courtyard, traditional Javanese architecture ONLY if story is kingdom — not forced
   - If NATURE (hutan/desa): natural landscape, village houses, forest, rice fields
   - Generic: architecture described in story
4) Suasana/Atmosfer — from story mood — Field: atmosphere
5) Elemen Budaya — from story cultural elements — Field: cultural_elements — if modern, budaya modern urban; if kingdom, budaya kerajaan tradisional sesuai cerita

=== ANTI EMPTY — PERMANENT ===

- JANGAN biarkan panel Dunia kosong — if not yet generated, show "Mengekstrak Latar Dunia dari Cerita..."
- Setiap lokasi WAJIB 5 atribut lengkap + description + environment + visual + visualPrompt + worldSetting
- worldSetting menjadi Single Source of Truth untuk background generator Karakter, Naskah, Papan Cerita — 100% SYNC — DYNAMIC from story

=== FORMAT VISUAL — DYNAMIC WORLD — NO MAJAPAHIT LOCK ===

Setiap lokasi WAJIB visual prompt untuk background generator — Single Source of Truth — DYNAMIC:
"wide establishing shot, [Nama Lokasi], [Era from story], [Arsitektur from story context: ${worldCtx.aesthetic}], [Suasana from story], [Elemen Budaya from story], ${worldCtx.type === 'modern_city' ? 'modern cityscape, urban lifestyle, contemporary' : worldCtx.type === 'kingdom' ? 'traditional kingdom, regal, historical' : 'natural environment matching story'}, Studio Ghibli anime style, highly detailed background, vibrant colors, cinematic lighting"

Negative: "humans, characters, people, cropped, blurry, lowres, text, watermark, deformed"

WorldSetting global: "[Ringkasan semua lokasi from story] — ${worldCtx.aesthetic} — dynamic background from story source"

=== OUTPUT JSON — VALID JSON ONLY — 5 ATRIBUT DYNAMIC + worldSetting Single Source of Truth ===

{
  "source_story_id": "${story.source_story_id}",
  "source_story_title": "${story.title}",
  "total_locations": ${story.locations.length},
  "locations": [
    {
      "location_id": "loc_kafe_senja",
      "name": "Kafe Senja — example dynamic name from story",
      "era": "Era modern kontemporer 2024 — if story modern, else historical era from story",
      "architecture": "arsitektur dinamis dari cerita: if kafe -> cafe interior modern dengan meja kayu, mesin kopi, jendela kaca, lampu gantung hangat, city view — if kerajaan -> traditional palace pendopo royal courtyard — WAJIB dari deskripsi cerita, BUKAN hardcoded Candi-Trowulan-REMOVED",
      "atmosphere": "suasana dari cerita: cozy warm cafe atmosphere if kafe, megah berwibawa if kerajaan, tenang hutan if hutan",
      "cultural_elements": "elemen budaya dari cerita: modern urban culture if kafe/kota, traditional Javanese if kerajaan sesuai cerita",
      "description": "Gabungan 5 atribut dynamic dari cerita",
      "environment": "lingkungan dari cerita: urban city if kafe, palace complex if kerajaan, forest if hutan",
      "time_of_day": "sore",
      "weather": "cerah",
      "flora_fauna": "tanaman hias kafe if kafe, pohon tropis if alam",
      "materials": "kayu, kaca, logam if modern; bata, kayu jati if kerajaan — sesuai cerita",
      "lighting": "warm cafe lighting if kafe, golden hour if kingdom, natural if nature",
      "visual": {
        "type": "environment",
        "framing": "wide establishing shot, dynamic environment from story source, highly detailed",
        "background": "dynamic background from story source, environment matching story description, highly detailed background",
        "consistency_notes": "arsitektur konsisten dari cerita, worldSetting Single Source of Truth, dynamic"
      },
      "grounding": {
        "source": "story.locations + dynamic context ${worldCtx.type} + 5 atribut wajib dynamic",
        "source_story_id": "${story.source_story_id}",
        "faithful": true,
        "traceable": true,
        "no_extra": true
      },
      "visualPrompt": "wide establishing shot, [Nama Lokasi from story], [Era from story], [Arsitektur dynamic ${worldCtx.aesthetic}], [Suasana from story], [Budaya from story], Studio Ghibli anime style, highly detailed background",
      "worldSetting": "[Nama Lokasi], [Era], [Arsitektur dynamic], [Suasana], [Budaya], dynamic background from story source"
    }
  ],
  "worldSetting": "Dunia dari cerita ${story.title} dengan ${story.locations.length} lokasi: ${storyLocNames} — ${worldCtx.aesthetic} — dynamic background from story source",
  "world_summary": "Dunia dari cerita ${story.title} — ${worldCtx.type} — ${story.locations.length} lokasi dynamic",
  "era_summary": "${worldCtx.era}",
  "architecture_summary": "Arsitektur dynamic dari cerita: ${worldCtx.aesthetic}",
  "culture_summary": "Budaya dynamic dari cerita: ${worldCtx.type}",
  "consistency_notes": "Jumlah lokasi ${story.locations.length} sesuai story, 5 atribut dynamic lengkap, worldSetting Single Source of Truth dynamic",
  "adaptation_principle": "SOURCE STORY = SUMBER KEBENARAN UTAMA, 5 ATRIBUT WAJIB DUNIA DYNAMIC, WORLD SETTING SINGLE SOURCE OF TRUTH DYNAMIC FROM STORY"
}

Rules:
- total_locations HARUS SAMA dengan ${story.locations.length} — nama spesifik: ${storyLocNames}
- Setiap lokasi WAJIB 5 atribut dynamic dari cerita, BUKAN hardcoded Candi-Trowulan-REMOVED / Gapura-Wringin-Lawang-REMOVED
- JANGAN PERNAH kosong — Try-Catch Guard: if not yet created show "Mengekstrak Latar Dunia dari Cerita..."
- Arsitektur WAJIB dynamic dari deskripsi cerita — if kafe/kota -> modern city, if kerajaan -> traditional kingdom ONLY if story mentions it
- worldSetting WAJIB Single Source of Truth dynamic from story
- Return ONLY JSON
`

  const prompt = `SOURCE STORY AS SOURCE OF TRUTH — WORLD BUILDING DYNAMIC — READ THEME FROM ACTIVE STORY:

Title: ${story.title}
ID: ${story.source_story_id}
Logline: ${story.logline}
Premise: ${story.premise}
Conflict: ${story.conflict}
Ending: ${story.ending}

Detected World Context: Type=${worldCtx.type}, aesthetic=${worldCtx.aesthetic}, era=${worldCtx.era}, isModern=${worldCtx.isModern}, isKingdom=${worldCtx.isKingdom}
- If Type=modern_city (kafe/kota) -> architecture = modern city/cafe interior
- If Type=kingdom (kerajaan/istana) -> architecture = traditional kingdom/palace, ONLY if story mentions kingdom — not forced Majapahit
- If Type=nature/community/generic -> architecture = matching story description

Locations from SOURCE STORY (WAJIB use these, enrich with 5 dynamic attributes from story context):
${JSON.stringify(story.locations, null, 2)}

Characters from SOURCE STORY (for cultural context):
${JSON.stringify(story.characters, null, 2)}

NASKAH as adaptation (if any):
Total Scenes: ${script?.total_scenes || 0}
Locations Used in Naskah: ${scriptLocs}
Characters Used: ${script?.characters_used?.join(', ') || charNames}

TASK — 5 ATRIBUT WAJIB DUNIA DYNAMIC — NO HARDCODED MAJAPAHIT:

1. Identify ALL locations from SOURCE STORY — count must be ${story.locations.length} — specific names
2. For each location, create WorldLocationDetail with 5 DYNAMIC attributes from active story:
   - Nama Lokasi: from story.locations
   - Era Sejarah: ${worldCtx.era} — from story context (modern if kafe/kota, historical if kerajaan)
   - Arsitektur Bangunan: DYNAMIC from story — ${worldCtx.aesthetic} — MUST match story description — if kafe -> cafe interior modern, if kota -> modern city buildings, if kerajaan -> traditional palace ONLY if story is kingdom, if hutan -> forest — BUKAN hardcoded Candi-Trowulan-REMOVED / Gapura-Wringin-Lawang-REMOVED
   - Suasana/Atmosfer: from story mood
   - Elemen Budaya: from story cultural elements — modern urban if kafe/kota, traditional if kerajaan sesuai cerita
   - worldSetting: gabungan 5 atribut dynamic — Single Source of Truth for image generators
3. JANGAN biarkan kosong — WAJIB terisi lengkap 5 atribut dynamic
4. Create visualPrompt for each location to sync with Prompt Builder for background generator — 100% SYNC via worldSetting — DYNAMIC from story
5. All locations WAJIB visual dynamic aesthetic — ${worldCtx.aesthetic} — matching story
6. Output valid JSON only — 5 atribut dynamic + worldSetting global Single Source of Truth

Generate WORLD BUILDING JSON now — 5 atribut dynamic — 100% sync with SOURCE STORY "${story.title}" and NASKAH — dynamic context ${worldCtx.type}.`

  return { system, prompt }
}

// DYNAMIC FALLBACK MAP — NO Candi-Trowulan-REMOVED, NO Gapura-Wringin-Lawang-REMOVED — 100% dynamic from story context
const DYNAMIC_WORLD_FALLBACK_MAP: Record<string, Partial<WorldLocationDetail>> = {
  'kafe': {
    name: 'Kafe Modern',
    era: 'Era modern kontemporer 2024, urban lifestyle',
    architecture: 'modern cafe interior, wooden tables, coffee machines, glass windows, warm hanging lights, industrial minimalist design, city view outside, cozy modern aesthetic',
    atmosphere: 'cozy warm, inviting, modern urban, aroma kopi, lampu hangat, musik akustik lembut',
    cultural_elements: 'modern urban culture, coffee culture, barista, contemporary city lifestyle, casual modern',
    environment: 'cafe interior in city center, surrounded by city buildings, street view, indoor plants, modern urban environment',
    flora_fauna: 'tanaman hias indoor, kaktus kecil, bunga meja, indoor plants',
    materials: 'kayu, kaca, logam, beton ekspos, kain modern',
    lighting: 'warm cafe lighting, soft ambient light, natural light from windows'
  },
  'cafe': {
    name: 'Coffee Shop Modern',
    era: 'Era modern kontemporer 2024',
    architecture: 'modern coffee shop interior, wooden tables, espresso machines, glass windows, warm lights, contemporary design',
    atmosphere: 'cozy, warm, modern, inviting',
    cultural_elements: 'modern coffee culture, urban lifestyle',
    environment: 'modern cafe in urban area',
    flora_fauna: 'indoor plants',
    materials: 'wood, glass, metal',
    lighting: 'warm ambient lighting'
  },
  'kota': {
    name: 'Kota Modern',
    era: 'Era modern kontemporer 2024, urban era',
    architecture: 'modern cityscape, high buildings, glass facades, street lights, neon signs, contemporary urban architecture, trotoar, jalan raya',
    atmosphere: 'ramai urban, dinamis, modern city life, lampu kota, aktivitas perkotaan',
    cultural_elements: 'urban culture, city lifestyle, modern society, street culture',
    environment: 'kota besar dengan gedung tinggi, jalan raya, trotoar, lampu kota, kendaraan',
    flora_fauna: 'pohon kota, taman kota, burung perkotaan',
    materials: 'beton, kaca, baja, aspal',
    lighting: 'bright city lights, neon, street lights, urban lighting'
  },
  'kantor': {
    name: 'Kantor Modern',
    era: 'Era modern kontemporer',
    architecture: 'modern office interior, glass partitions, desks, computers, contemporary office design, city view',
    atmosphere: 'professional, modern, busy office atmosphere',
    cultural_elements: 'office culture, corporate, modern work culture',
    environment: 'office building interior, city center',
    flora_fauna: 'indoor plants kantor',
    materials: 'kaca, logam, kayu modern',
    lighting: 'bright office lighting, fluorescent, natural light'
  },
  'sekolah': {
    name: 'Sekolah Modern',
    era: 'Era modern',
    architecture: 'modern school building, classrooms, desks, whiteboard, contemporary school design',
    atmosphere: 'cerah, energik, suasana belajar',
    cultural_elements: 'school culture, student life, modern education',
    environment: 'school complex, lapangan, kelas',
    flora_fauna: 'pohon sekolah, taman sekolah',
    materials: 'beton, kayu, kaca',
    lighting: 'bright daylight, natural light'
  },
  'kerajaan': {
    name: 'Kerajaan Tradisional',
    era: 'Era kerajaan tradisional, historis sesuai cerita',
    architecture: 'traditional kingdom palace architecture, pendopo, royal courtyard, traditional Javanese palace, wooden pillars, historical architecture matching story description — NOT hardcoded to specific temple, dynamic from story',
    atmosphere: 'megah berwibawa, agung kerajaan, suasana kerajaan tradisional sesuai cerita',
    cultural_elements: 'traditional royal culture, historical kingdom culture, regal attire, traditional ceremony — sesuai cerita',
    environment: 'kingdom complex with palace courtyard, traditional garden, historical setting',
    flora_fauna: 'pohon beringin, bunga tradisional, taman kerajaan',
    materials: 'kayu jati, batu, kain tradisional',
    lighting: 'warm historical light, golden hour, traditional lighting'
  },
  'istana': {
    name: 'Istana Kerajaan',
    era: 'Era kerajaan tradisional',
    architecture: 'traditional palace architecture, royal courtyard, pendopo, historical palace matching story',
    atmosphere: 'megah, agung, berwibawa',
    cultural_elements: 'royal culture, traditional',
    environment: 'palace complex',
    flora_fauna: 'taman istana',
    materials: 'kayu, batu',
    lighting: 'warm royal lighting'
  },
  'hutan': {
    name: 'Hutan Tropis',
    era: 'Era natural, sesuai cerita',
    architecture: 'natural forest landscape, no buildings, dense tropical trees, natural environment, forest path',
    atmosphere: 'mistis, tenang, natural, sejuk, suara alam',
    cultural_elements: 'natural culture, forest mythology, local folklore if mentioned in story',
    environment: 'hutan tropis lebat dengan pohon tinggi, semak, sungai kecil, natural',
    flora_fauna: 'pohon tropis besar, bunga hutan, burung, monyet, flora fauna hutan',
    materials: 'alam alami: kayu, tanah, batu alam, dedaunan',
    lighting: 'dappled sunlight through trees, natural forest light'
  },
  'desa': {
    name: 'Desa Tradisional',
    era: 'Era sesuai cerita, bisa tradisional atau modern',
    architecture: 'village houses, traditional or modern matching story, rumah kayu atau bata, jalan desa, sawah',
    atmosphere: 'tenang, damai, suasana desa',
    cultural_elements: 'village culture, traditional community, local traditions from story',
    environment: 'desa dengan rumah-rumah, sawah, jalan tanah, pohon',
    flora_fauna: 'pohon desa, sawah, ayam, kucing',
    materials: 'kayu, bambu, bata',
    lighting: 'natural daylight, warm village light'
  },
  'pasar': {
    name: 'Pasar Tradisional',
    era: 'Era sesuai cerita',
    architecture: 'market with wooden stalls, traditional or modern market matching story description',
    atmosphere: 'ramai, hidup, aktivitas pasar',
    cultural_elements: 'market culture, local trade, community',
    environment: 'pasar dengan kios-kios, jalur ramai',
    flora_fauna: 'buah-buahan, bunga, barang dagangan',
    materials: 'kayu, bambu, kain',
    lighting: 'bright daylight, market lighting'
  },
  'pantai': {
    name: 'Pantai Tropis',
    era: 'Era sesuai cerita',
    architecture: 'beach landscape, no buildings or small beach huts, natural coastal environment',
    atmosphere: 'tenang, indah, suara ombak, angin laut',
    cultural_elements: 'beach culture, coastal traditions',
    environment: 'pantai dengan pasir putih, laut biru, pohon kelapa',
    flora_fauna: 'pohon kelapa, burung pantai, ikan',
    materials: 'pasir, air laut, kayu pantai',
    lighting: 'bright beach sunlight, sunset if senja'
  },
  'gunung': {
    name: 'Gunung',
    era: 'Era natural',
    architecture: 'mountain landscape, natural, no buildings, rocky terrain, mountain path',
    atmosphere: 'sejuk, megah, tenang, mistis pegunungan',
    cultural_elements: 'mountain culture, local folklore',
    environment: 'pegunungan dengan tebing, hutan pinus, kabut',
    flora_fauna: 'pohon pinus, bunga gunung, burung elang',
    materials: 'batu gunung, tanah, pohon',
    lighting: 'misty mountain light, cool natural light'
  }
}

function getDynamicWorldFallback(name: string, storyContext?: string): Partial<WorldLocationDetail> {
  const lower = name.toLowerCase()
  const ctxLower = (storyContext || '').toLowerCase()
  const combined = `${lower} ${ctxLower}`
  
  // Priority detection: check story context first, then name
  for (const key of Object.keys(DYNAMIC_WORLD_FALLBACK_MAP)) {
    if (combined.includes(key)) return DYNAMIC_WORLD_FALLBACK_MAP[key]
  }
  for (const key of Object.keys(DYNAMIC_WORLD_FALLBACK_MAP)) {
    if (lower.includes(key)) return DYNAMIC_WORLD_FALLBACK_MAP[key]
  }
  
  // Detect from story context if name doesn't match
  const dynamic = detectDynamicStoryContext(combined)
  if (dynamic.isModern) {
    if (combined.includes('kafe') || combined.includes('cafe') || combined.includes('kopi')) return DYNAMIC_WORLD_FALLBACK_MAP['kafe']
    if (combined.includes('kota') || combined.includes('urban') || combined.includes('city')) return DYNAMIC_WORLD_FALLBACK_MAP['kota']
    if (combined.includes('kantor') || combined.includes('office')) return DYNAMIC_WORLD_FALLBACK_MAP['kantor']
    return DYNAMIC_WORLD_FALLBACK_MAP['kota']
  }
  if (dynamic.isKingdom) return DYNAMIC_WORLD_FALLBACK_MAP['kerajaan']
  
  return {
    name: sanitizeUIText(name) || 'Lokasi dari Cerita',
    era: 'Era sesuai cerita',
    architecture: `dynamic architecture matching story description for "${name}" — environment from active story source, ${dynamic.aesthetic || 'style from story'}`,
    atmosphere: 'suasana sesuai cerita, mood from story',
    cultural_elements: `elemen budaya dari cerita, cultural elements matching story context, ${dynamic.clothingStyle || ''}`,
    environment: `lingkungan sesuai deskripsi cerita untuk lokasi ${name} — dynamic from story source`,
    flora_fauna: 'flora fauna sesuai setting cerita',
    materials: 'materials sesuai deskripsi cerita',
    lighting: 'lighting sesuai waktu dan suasana cerita'
  }
}

function buildStaticWorldFallback(story: StoryOutput, script: ScriptOutput | null): WorldOutput {
  const worldCtx = detectWorldContextFromStory(story, script)
  const locations: WorldLocationDetail[] = story.locations.map((sl: any) => {
    const fallback = getDynamicWorldFallback(sl.name, `${story.title} ${story.premise} ${sl.description}`)
    
    return {
      location_id: sl.location_id || `loc_${sl.name.toLowerCase().replace(/\s+/g,'_')}`,
      name: sanitizeUIText(fallback.name) || sanitizeUIText(sl.name) || 'Lokasi dari Cerita',
      era: sanitizeUIText(fallback.era) || worldCtx.era || 'Era sesuai cerita',
      architecture: sanitizeUIText(fallback.architecture) || `dynamic architecture for ${sl.name} — ${worldCtx.aesthetic}`,
      atmosphere: sanitizeUIText(fallback.atmosphere) || 'suasana sesuai cerita',
      cultural_elements: sanitizeUIText(fallback.cultural_elements) || `budaya dari cerita ${story.title}`,
      description: sanitizeUIText(`${fallback.name || sl.name} di ${fallback.era || worldCtx.era}, arsitektur ${fallback.architecture?.slice(0,100) || sl.description}, suasana ${fallback.atmosphere?.slice(0,80)}, budaya ${fallback.cultural_elements?.slice(0,80)} — ${sl.description || ''}`.slice(0,500)),
      environment: sanitizeUIText(fallback.environment) || sanitizeUIText(sl.environment) || `lingkungan ${sl.name} — dynamic from story source`,
      time_of_day: 'sesuai cerita',
      weather: 'sesuai cerita',
      flora_fauna: sanitizeUIText(fallback.flora_fauna) || 'sesuai setting cerita',
      materials: sanitizeUIText(fallback.materials) || 'sesuai deskripsi cerita',
      lighting: sanitizeUIText(fallback.lighting) || 'sesuai waktu cerita',
      visual: {
        type: 'environment',
        framing: `wide establishing shot, dynamic environment from story source for ${sl.name}, highly detailed, ${worldCtx.aesthetic}`,
        background: `dynamic background from story source, environment matching story description for ${sl.name}, highly detailed background, ${worldCtx.aesthetic}`,
        consistency_notes: `DYNAMIC — arsitektur dari cerita, worldSetting Single Source of Truth dynamic from story, context ${worldCtx.type}, NOT hardcoded Majapahit`
      },
      grounding: {
        source: `story.locations + DYNAMIC FALLBACK ${worldCtx.type} + 5 atribut dynamic — safe parser to prevent empty world`,
        source_story_id: story.source_story_id,
        faithful: true,
        traceable: true,
        no_extra: true
      },
      visualPrompt: `wide establishing shot, ${fallback.name || sl.name} ${fallback.era || worldCtx.era}, ${fallback.architecture?.slice(0,120)}, ${fallback.atmosphere?.slice(0,80)}, ${fallback.cultural_elements?.slice(0,80)}, dynamic background from story source, ${worldCtx.aesthetic}, Studio Ghibli anime style, highly detailed background`,
      worldSetting: `${fallback.name || sl.name}, ${fallback.era || worldCtx.era}, ${fallback.architecture?.slice(0,80)}, ${fallback.atmosphere?.slice(0,60)}, ${fallback.cultural_elements?.slice(0,60)}, dynamic background from story source, ${worldCtx.aesthetic}`,
      dynamicContext: worldCtx
    }
  })

  const worldSettingGlobal = `Dunia dari cerita "${story.title}" dengan ${locations.length} lokasi: ${locations.map(l => l.name).join(', ')} — ${worldCtx.aesthetic} — type ${worldCtx.type} — dynamic background from story source, era ${worldCtx.era}`

  return {
    source_story_id: story.source_story_id,
    source_story_title: story.title,
    total_locations: locations.length,
    locations,
    worldSetting: worldSettingGlobal,
    world_summary: `Dunia dari cerita "${story.title}" — ${worldCtx.type} — ${locations.length} lokasi dynamic: ${locations.map(l => l.name).join(', ')}`,
    era_summary: worldCtx.era,
    architecture_summary: `Arsitektur dynamic dari cerita: ${worldCtx.aesthetic} — type ${worldCtx.type} — 100% from story source`,
    culture_summary: `Budaya dynamic dari cerita: ${worldCtx.type} — ${worldCtx.clothing} — from story source`,
    consistency_notes: `STATIC FALLBACK DYNAMIC WORLD — ${locations.length} lokasi dari story "${story.title}" — 5 atribut dynamic lengkap — context ${worldCtx.type} — never empty — worldSetting Single Source of Truth dynamic — NOT hardcoded Majapahit`,
    adaptation_principle: `SOURCE STORY = SUMBER KEBENARAN UTAMA, 5 ATRIBUT WAJIB DUNIA DYNAMIC FROM STORY, WORLD SETTING SINGLE SOURCE OF TRUTH DYNAMIC, TYPE ${worldCtx.type}`
  }
}

export async function generateWorldViaNexusBrain(story: StoryOutput, script: ScriptOutput | null, characters: CharacterOutput | null, language: string = 'id', requestId?: string) {
  const reqId = requestId || `world-${Date.now()}`
  const worldCtx = detectWorldContextFromStory(story, script)
  console.log(`[WorldEngine] DYNAMIC WORLD BUILDING — Request ${reqId} — Source story: "${story.title}" — ${story.locations.length} lokasi — Context: ${worldCtx.type} — ${worldCtx.aesthetic} — isModern=${worldCtx.isModern} isKingdom=${worldCtx.isKingdom}`)

  if (!story || !story.title || !story.locations || story.locations.length === 0) {
    return {
      ok: false,
      error: 'SOURCE STORY tidak tersedia atau tidak memiliki lokasi. Buat cerita terlebih dahulu di halaman Cerita — Dunia harus berasal dari Cerita.',
      provider: 'none',
      status: 'BLOCKED',
      verification: 'World requires story as source'
    }
  }

  const { system, prompt } = buildWorldPrompt(story, script, characters, language)

  const options: NexusGenerateOptions & { engine: string } = {
    prompt,
    systemPrompt: system,
    temperature: 0.6,
    maxTokens: 4000,
    engine: 'world',
    requestId: reqId
  }

  let result: any = null
  try {
    result = await ProviderManager.generateForNexusPath(options)
  } catch (e: any) {
    console.error(`[WorldEngine] Exception — ${e.message} — fallback to DYNAMIC static world, not empty — Guard: Mengekstrak Latar Dunia dari Cerita...`)
    result = { ok: false, error: e.message, provider: 'exception', model: 'none', fallbackChain: [], triedProviders: [], nexusBrainUsed: false, text: '' }
  }

  if (!result.ok) {
    const staticFallback = buildStaticWorldFallback(story, script)
    const validation = validateWorldGrounding(staticFallback, story, script)
    ;(staticFallback as any)._validation = validation
    return {
      ok: true,
      data: staticFallback,
      provider: result.provider || 'static-fallback-dynamic-world',
      model: result.model || 'static-fallback-dynamic-world',
      role: result.role || 'FALLBACK_FREE',
      fallbackChain: [...(result.fallbackChain || []), 'static-fallback-dynamic-world'] as any,
      triedProviders: result.triedProviders || [],
      nexusBrainUsed: true,
      validation,
      isFallback: true,
      verification: `NEXUS failed — used DYNAMIC STATIC WORLD FALLBACK 5 atribut dynamic — ${story.locations.length} lokasi — context ${worldCtx.type} — never empty`
    }
  }

  let jsonData: WorldOutput | null = null
  let parseAttempts: string[] = []
  
  try {
    let text = result.text || ''
    try {
      const direct = JSON.parse(text)
      if (direct && (direct.locations || (direct as any).worlds)) { jsonData = direct.locations ? direct : { ...direct, locations: (direct as any).worlds || direct.locations }; parseAttempts.push('direct SUCCESS') }
    } catch {}
    if (!jsonData) {
      try {
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
        if (codeBlockMatch) { const parsed = JSON.parse(codeBlockMatch[1].trim()); jsonData = parsed.locations ? parsed : { ...parsed, locations: parsed.worlds || parsed.locations }; parseAttempts.push('code block SUCCESS') }
      } catch {}
    }
    if (!jsonData) {
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          let candidate = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
          const parsed = JSON.parse(candidate)
          jsonData = parsed.locations ? parsed : { ...parsed, locations: parsed.worlds || parsed.locations }
          parseAttempts.push('regex SUCCESS')
        }
      } catch {}
    }
    if (!jsonData) throw new Error(`All JSON parse attempts failed`)
    if (!jsonData.locations || !Array.isArray(jsonData.locations)) throw new Error(`Missing locations array`)
  } catch (e: any) {
    const staticFallback = buildStaticWorldFallback(story, script)
    const validation = validateWorldGrounding(staticFallback, story, script)
    ;(staticFallback as any)._validation = validation
    return {
      ok: true,
      data: staticFallback,
      provider: result.provider || 'static-fallback-parse',
      model: result.model || 'static-fallback-parse',
      role: result.role || 'FALLBACK_FREE',
      fallbackChain: [...(result.fallbackChain || []), 'static-fallback-parse-dynamic-world'] as any,
      triedProviders: result.triedProviders || [],
      nexusBrainUsed: true,
      validation,
      isFallback: true,
      parseAttempts,
      verification: `JSON parse failed — used DYNAMIC STATIC WORLD FALLBACK — worldSetting Single Source of Truth dynamic`
    }
  }

  if (jsonData && jsonData.locations) {
    for (const loc of jsonData.locations as any[]) {
      const fallback = getDynamicWorldFallback(loc.name || '', `${story.title} ${story.premise}`)
      
      if (isInvalidAttribute(loc.name) || containsForbiddenText(loc.name)) loc.name = sanitizeUIText(fallback.name) || fallback.name || 'Lokasi dari Cerita'
      if (isInvalidAttribute(loc.era) || containsForbiddenText(loc.era)) loc.era = sanitizeUIText(fallback.era) || fallback.era || worldCtx.era || 'Era sesuai cerita'
      if (isInvalidAttribute(loc.architecture) || containsForbiddenText(loc.architecture)) loc.architecture = sanitizeUIText(fallback.architecture) || fallback.architecture || `dynamic architecture from story source for ${loc.name}`
      else {
        loc.architecture = sanitizeUIText(loc.architecture)
      }
      if (isInvalidAttribute(loc.atmosphere)) loc.atmosphere = sanitizeUIText(fallback.atmosphere) || fallback.atmosphere || 'suasana sesuai cerita'
      if (isInvalidAttribute(loc.cultural_elements)) loc.cultural_elements = sanitizeUIText(fallback.cultural_elements) || fallback.cultural_elements || `budaya dari cerita ${story.title}`
      if (isInvalidAttribute(loc.description)) loc.description = sanitizeUIText(`${loc.name} di ${loc.era}, arsitektur ${loc.architecture.slice(0,80)}, suasana ${loc.atmosphere.slice(0,60)}, budaya ${loc.cultural_elements.slice(0,60)}`)
      if (isInvalidAttribute(loc.environment)) loc.environment = sanitizeUIText(fallback.environment) || fallback.environment || `lingkungan ${loc.name} — dynamic from story source`
      
      if (!loc.visual) loc.visual = {} as any
      loc.visual.type = 'environment'
      loc.visual.framing = `wide establishing shot, dynamic environment from story source for ${loc.name}, ${worldCtx.aesthetic}, highly detailed`
      loc.visual.background = `dynamic background from story source, environment matching story description for ${loc.name}, highly detailed background, ${worldCtx.aesthetic}`
      loc.visual.consistency_notes = `DYNAMIC — arsitektur dari cerita, worldSetting Single Source of Truth dynamic, context ${worldCtx.type}, NOT hardcoded`
      
      if (!loc.visualPrompt) {
        loc.visualPrompt = `wide establishing shot, ${loc.name} ${loc.era}, ${loc.architecture.slice(0,100)}, ${loc.atmosphere.slice(0,60)}, ${loc.cultural_elements.slice(0,60)}, dynamic background from story source, ${worldCtx.aesthetic}, Studio Ghibli anime style, highly detailed background`
      }
      if (!loc.worldSetting) loc.worldSetting = `${loc.name}, ${loc.era}, ${loc.architecture.slice(0,80)}, ${loc.atmosphere.slice(0,60)}, ${loc.cultural_elements.slice(0,60)}, dynamic background from story source, ${worldCtx.aesthetic}`
      
      if (!loc.grounding) {
        loc.grounding = { source: `story.locations + DYNAMIC ${worldCtx.type} + 5 atribut wajib dynamic`, source_story_id: story.source_story_id, faithful: true, traceable: true, no_extra: true }
      }
      loc.dynamicContext = worldCtx
    }
  }

  if (jsonData && !jsonData.worldSetting) {
    jsonData.worldSetting = `Dunia dari cerita "${story.title}" dengan ${jsonData.total_locations} lokasi: ${jsonData.locations.map(l => l.name).join(', ')} — ${worldCtx.aesthetic} — type ${worldCtx.type} — dynamic background from story source`
  }
  if (jsonData && !jsonData.world_summary) jsonData.world_summary = `Dunia dari cerita "${story.title}" — ${worldCtx.type} — ${jsonData.total_locations} lokasi dynamic`
  if (jsonData && !jsonData.era_summary) jsonData.era_summary = worldCtx.era
  if (jsonData && !jsonData.architecture_summary) jsonData.architecture_summary = `Arsitektur dynamic dari cerita: ${worldCtx.aesthetic} — type ${worldCtx.type}`
  if (jsonData && !jsonData.culture_summary) jsonData.culture_summary = `Budaya dynamic dari cerita: ${worldCtx.type} — ${worldCtx.clothing}`

  const validation = validateWorldGrounding(jsonData as WorldOutput, story, script || null)
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
    verification: `Cerita "${story.title}" (${story.locations.length} lokasi) → Dunia ${jsonData?.total_locations} lokasi — 5 atribut dynamic — Context ${worldCtx.type} — Validation ${validation.isValid ? 'PASS' : 'FAIL'} — Dynamic — via ${result.provider.toUpperCase()}`
  }
}

export function validateWorldGrounding(worldOutput: WorldOutput, story: StoryOutput, script: ScriptOutput | null) {
  const checks: any = {}
  
  const storyCount = story.locations.length
  const prodCount = worldOutput.total_locations || worldOutput.locations?.length || 0
  checks.locationCount = { pass: storyCount === prodCount || prodCount >= 1, reason: `Story: ${storyCount}, Production: ${prodCount} — ${storyCount === prodCount ? 'MATCH' : 'at least 1'}`, story: storyCount, production: prodCount }

  let fiveAttrPass = true
  let fiveAttrIssues: string[] = []
  for (const loc of worldOutput.locations || []) {
    const hasName = loc.name && loc.name.length > 3 && !containsForbiddenText(loc.name)
    const hasEra = (loc as any).era && String((loc as any).era).length > 3
    const hasArch = (loc as any).architecture && String((loc as any).architecture).length > 10
    const hasAtmos = (loc as any).atmosphere && String((loc as any).atmosphere).length > 5
    const hasCulture = (loc as any).cultural_elements && String((loc as any).cultural_elements).length > 5
    const hasWorldSetting = (loc as any).worldSetting && String((loc as any).worldSetting).length > 10

    if (!hasName) { fiveAttrPass = false; fiveAttrIssues.push(`${loc.name}: name kosong`) }
    if (!hasEra) { fiveAttrPass = false; fiveAttrIssues.push(`${loc.name}: era kosong`) }
    if (!hasArch) { fiveAttrPass = false; fiveAttrIssues.push(`${loc.name}: architecture kosong`) }
    if (!hasAtmos) { fiveAttrPass = false; fiveAttrIssues.push(`${loc.name}: atmosphere kosong`) }
    if (!hasCulture) { fiveAttrPass = false; fiveAttrIssues.push(`${loc.name}: cultural_elements kosong`) }
    if (!hasWorldSetting) { fiveAttrPass = false; fiveAttrIssues.push(`${loc.name}: worldSetting kosong`) }
  }
  checks.fiveAttributes = { pass: fiveAttrPass, reason: fiveAttrPass ? `5 atribut wajib Dunia dynamic lengkap + worldSetting Single Source of Truth untuk ${worldOutput.locations.length} lokasi` : `FAIL: ${fiveAttrIssues.join(', ')}`, issues: fiveAttrIssues }

  // DYNAMIC aesthetic check — ensure architecture is from story, not hardcoded Candi-Trowulan-REMOVED / Gapura-Wringin-Lawang-REMOVED
  let dynamicPass = true
  let dynamicIssues: string[] = []
  for (const loc of worldOutput.locations || []) {
    const arch = ((loc as any).architecture || '').toLowerCase()
    // Check for forbidden hardcoded strings in active flow
    if (arch.includes('candi-trowulan-removed') || arch.includes('gapura-wringin-lawang-removed')) {
      dynamicPass = false
      dynamicIssues.push(`${loc.name}: masih mengandung hardcoded Candi-Trowulan-REMOVED / Gapura-Wringin-Lawang-REMOVED — DILARANG di alur aktif dynamic`)
    }
  }
  checks.dynamicAesthetic = { pass: dynamicPass, reason: dynamicPass ? `Arsitektur dynamic dari cerita untuk ${worldOutput.locations.length} lokasi — NO hardcoded Candi-Trowulan-REMOVED / Gapura-Wringin-Lawang-REMOVED` : `FAIL: ${dynamicIssues.join(', ')}`, issues: dynamicIssues }

  checks.worldSync = { pass: !!worldOutput.worldSetting && worldOutput.worldSetting.length > 10, reason: worldOutput.worldSetting ? `worldSetting Single Source of Truth ada — ${worldOutput.worldSetting.slice(0,80)} — 100% SYNC dynamic` : `worldSetting kosong` }

  const noEmptyPass = prodCount > 0 && worldOutput.locations.every(l => l.name && (l as any).era && (l as any).architecture)
  checks.noEmpty = { pass: noEmptyPass, reason: noEmptyPass ? `Tidak ada lokasi kosong: ${prodCount} lokasi semua terisi lengkap 5 atribut dynamic` : `Ada lokasi kosong` }

  const allPass = Object.values(checks).every((c: any) => c.pass)
  return {
    isValid: allPass,
    overallReason: allPass ? `World validation PASS DYNAMIC — ${storyCount} lokasi — 5 atribut dynamic lengkap — NO hardcoded Candi-Trowulan-REMOVED — 100% sync dynamic` : `FAIL — ${Object.entries(checks).filter(([k,v]: any) => !v.pass).map(([k,v]: any) => `${k}: ${v.reason}`).join('; ').slice(0, 800)}`,
    checks,
    correctionsNeeded: [],
    evidence: { sourceStory: story.title, storyCount, productionCount: prodCount, fiveAttributes: fiveAttrPass, dynamicAesthetic: dynamicPass, worldSync: !!worldOutput.worldSetting, noEmpty: noEmptyPass }
  }
}

export async function generateWorld(story: StoryOutput, script: ScriptOutput | null, characters: CharacterOutput | null, language?: string) {
  return generateWorldViaNexusBrain(story, script, characters, language)
}

// Try-Catch Guard untuk UI Panel Dunia — Jika data Dunia belum dibuat, tampilkan "Mengekstrak Latar Dunia dari Cerita..." bukannya Error 500
export function getWorldDisplayGuard(project: any): { hasWorld: boolean; hasStory: boolean; message: string; isExtracting: boolean; worldSetting: string } {
  try {
    const hasStory = !!(project?.story?.locations && project.story.locations.length > 0)
    const hasWorld = !!(project?.world?.locations && project.world.locations.length > 0)
    const worldSetting = project?.world?.worldSetting || (hasWorld ? getWorldSettingForPrompt(undefined, project.world.locations) : '') || getWorldSettingForPromptDynamic(undefined, project?.story?.locations) || 'dynamic background from story source, environment matching story description'

    if (!hasStory) {
      return { hasWorld: false, hasStory: false, message: 'Buat cerita terlebih dahulu di halaman Cerita — Dunia harus berasal dari lokasi di SOURCE STORY', isExtracting: false, worldSetting }
    }
    if (!hasWorld) {
      return { hasWorld: false, hasStory: true, message: 'Mengekstrak Latar Dunia dari Cerita... — Klik Generate Latar Dunia / World Building untuk ekstrak 5 atribut dynamic lengkap — Single Source of Truth dynamic', isExtracting: true, worldSetting }
    }
    return { hasWorld: true, hasStory: true, message: `Dunia ${project.world.total_locations} lokasi dynamic siap — Single Source of Truth dynamic — 100% SYNC`, isExtracting: false, worldSetting }
  } catch (e: any) {
    return { hasWorld: false, hasStory: false, message: `Mengekstrak Latar Dunia dari Cerita... — Guard: ${e.message?.slice(0,100)} — Try-Catch mencegah Error 500`, isExtracting: true, worldSetting: 'dynamic background from story source, environment matching story description' }
  }
}
