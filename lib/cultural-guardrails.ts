// lib/cultural-guardrails.ts — PERMANENT SYSTEM GUARDRAIL — DYNAMIC WORLD BUILDING — REFACTORED 2026-09-20
// PRINCIPLE: 100% DYNAMIC FROM STORY SOURCE — NO HARDCODED CANDI TROWULAN / GAPURA WRINGIN LAWANG LOCK IN ACTIVE FLOW
// LEGACY constants kept for backward compat but now dynamic generic, not containing rigid Majapahit strings
// CHARACTER images WAJIB isolated PNG — background clean, no scenery injection

// === 1. LEGACY COMPAT — NOW DYNAMIC GENERIC — NO RIGID CANDI TROWULAN / GAPURA LOCK ===

// Previously hardcoded Majapahit prompt — NOW refactored to dynamic from story source
export const MAJAPAHIT_POSITIVE_PROMPT_MANDATORY = 
  `dynamic environment from story source, background matching story description, aesthetic from active story, environment from story source`;

export const MAJAPAHIT_POSITIVE_PROMPT_EXTENDED = 
  `dynamic environment from story source, aesthetic from active story, background matching story description, environment style from story/naskah, authentic cultural setting matching story, dynamic architecture from story`;

// Negative remains to prevent unwanted Chinese/Japanese leaks
export const MAJAPAHIT_NEGATIVE_PROMPT_MANDATORY = 
  `chinese temple, pagoda, curved oriental roof, chinese architecture, japanese shrine, hanfu, kimono, asian East pagoda, indoor hall`;

export const MAJAPAHIT_NEGATIVE_PROMPT_EXTENDED = 
  `chinese temple, pagoda, curved oriental roof, chinese architecture, japanese shrine, hanfu, kimono, asian East pagoda, indoor hall, chinese temple, pagoda, japanese shrine, hanfu, kimono, chinese dress, torii, forbidden city, east asian palace, cropped, headshot, close up, portrait, face only, upper body only, half body, deformed face, bad anatomy, modern building, skyscraper, concrete, glass building, indoor hall, enclosed hall, chinese courtyard`;

// Dynamic theme detection — NO hardcoded Candi-Trowulan-REMOVED / Gapura strings
export function isMajapahitTheme(theme: string = ''): boolean {
  const t = (theme || '').toLowerCase();
  return /majapahit|nusantara|indonesia kuno|jawa kuno|kerajaan jawa|hayam wuruk|gajah mada|tribhuwana|singhasari|kediri|demak|mataram kuno|sriwijaya|javanese kingdom|kerajaan|keraton|istana|raja|ratu/i.test(t);
}

export function detectMajapahitFromContext(text: string = ''): boolean {
  const t = (text || '').toLowerCase();
  return /majapahit|nusantara|jawa kuno|gajah mada|hayam wuruk|tribhuwanatunggadewi|keraton|kerajaan|istana|raja|ratu|batik kawung|kris dagger|indonesia kuno|east javanese|javanese kingdom|bata merah|pendopo/i.test(t);
}

// === 2. PENGUNCI 7 ATRIBUT KARAKTER (MANDATORY CHARACTER SCHEMA) ===

export interface SevenAttributes {
  gender: string;
  face: string;
  age: string;
  hair: string;
  body_posture: string;
  clothing: string;
  special_features: string;
}

export const SEVEN_ATTRIBUTES_KEYS = ['gender', 'face', 'age', 'hair', 'body_posture', 'clothing', 'special_features'] as const;

export function isInvalidAttribute(value: any): boolean {
  if (value === null || value === undefined) return true;
  const str = String(value).trim().toLowerCase();
  if (str === '') return true;
  if (str === '-' || str === 'null' || str === 'undefined') return true;
  if (str.includes('tidak disebutkan')) return true;
  if (str.includes('belum tersedia')) return true;
  if (str.length < 2) return true;
  return false;
}

export const FALLBACK_PHYSICAL_MAP: Record<string, SevenAttributes & { genderTag: string; full: string }> = {
  'gajah mada': {
    gender: 'Laki-Laki',
    genderTag: '(male warrior, handsome Javanese man:1.2, strong commander:1.3)',
    face: 'wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas tenang kulit sawo matang',
    age: '45 tahun',
    hair: 'rambut hitam panjang digelung udeng batik emas panjang sebahu hitam pekat gelungan Jawa Kuno',
    body_posture: 'tegap kekar tinggi 175cm berwibawa atletis bahu lebar otot kekar',
    clothing: 'bare chest with elaborate gold ornaments, kain batik kawung dodot coklat emas sebatas lutut sabuk emas besar udeng kepala batik emas selendang sutra merah',
    special_features: 'keris pusaka luk 9 warangka emas di pinggang kiri mahkota gelung udeng emas bertingkat kalung emas besar berlapis gelang emas tebal perisai bulat emas selendang sutra merah sabuk emas',
    full: 'Laki-Laki, 45 tahun, wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas tenang kulit sawo matang, rambut hitam panjang digelung udeng batik emas, postur tegap kekar tinggi 175cm berwibawa atletis, pakaian bare chest gold ornaments kain batik kawung dodot coklat emas sabuk emas udeng, ciri khusus keris pusaka luk 9 warangka emas mahkota gelung udeng emas kalung gelang emas perisai'
  },
  'hayam wuruk': {
    gender: 'Laki-Laki',
    genderTag: '(male king, noble handsome Javanese man:1.2, young king:1.3, regal:1.2)',
    face: 'wajah oval tampan rahang tegas halus hidung mancung proporsional mata besar teduh berwibawa ekspresi tenang bijaksana muda kulit sawo matang cerah',
    age: '25 tahun',
    hair: 'rambut hitam panjang lurus disanggul rapi dengan mahkota emas tinggi hiasan bunga melati emas panjang sebahu',
    body_posture: 'tegap anggun tinggi 172cm berwibawa raja muda proporsional atletis',
    clothing: 'bare chest with royal gold ornaments dodot ageng batik emas merah megah kain songket emas sabuk emas bertatah permata selendang sutra emas',
    special_features: 'mahkota emas tinggi bertingkat makuta permata merah keris pusaka kerajaan emas di pinggang kalung emas besar bertingkat gelang emas naga cincin emas permata selendang sutra emas',
    full: 'Laki-Laki, 25 tahun, wajah oval tampan rahang tegas halus hidung mancung proporsional mata besar teduh berwibawa ekspresi tenang bijaksana muda kulit sawo matang cerah, rambut hitam panjang sanggul mahkota emas tinggi, postur tegap anggun tinggi 172cm berwibawa raja muda, pakaian bare chest royal gold ornaments dodot ageng batik emas merah megah songket emas, ciri khusus mahkota emas tinggi bertingkat makuta permata merah keris pusaka kerajaan emas kalung emas besar bertingkat gelang emas naga selendang sutra emas'
  },
  'tribhuwanatunggadewi': {
    gender: 'Perempuan',
    genderTag: '(female queen, beautiful Javanese woman:1.2, regal queen:1.3, elegant:1.2)',
    face: 'wajah oval anggun cantik rahang halus tegas hidung mancung proporsional mata besar teduh berwibawa ekspresi tenang bijaksana anggun kulit sawo matang halus cerah',
    age: '38 tahun',
    hair: 'rambut hitam panjang disanggul tinggi dengan hiasan bunga melati emas dan mahkota emas tinggi bertingkat panjang pinggang hitam pekat berkilau',
    body_posture: 'tegap anggun tinggi 168cm berwibawa ratu elegan proporsional elegan lemah gemulai berwibawa',
    clothing: 'kemben emas megah kain batik dodot panjang merah emas dengan motif kawung selendang sutra emas panjang sabuk emas bertatah permata kain songket emas',
    special_features: 'mahkota emas tinggi bertingkat makuta ratu bertatah permata merah dan hijau perhiasan emas lengkap kalung emas besar bertingkat anting emas panjang gelang emas tebal cincin emas permata selendang sutra emas panjang keris kecil pusaka ratu di pinggang',
    full: 'Perempuan, 38 tahun, wajah oval anggun cantik rahang halus tegas hidung mancung proporsional mata besar teduh berwibawa ekspresi tenang bijaksana anggun kulit sawo matang halus cerah, rambut hitam panjang sanggul tinggi hiasan melati mahkota emas tinggi bertingkat, postur tegap anggun tinggi 168cm berwibawa ratu elegan, pakaian kemben emas kain batik dodot panjang merah emas kawung selendang sutra emas, ciri khusus mahkota emas tinggi makuta ratu perhiasan emas lengkap kalung bertingkat anting panjang gelang tebal cincin permata keris pusaka ratu'
  },
  'suharto': {
    gender: 'Laki-Laki',
    genderTag: '(male leader, handsome Javanese man:1.2)',
    face: 'wajah oval rahang tegas kotak hidung mancung sedang mata sipit tajam berwibawa ekspresi tenang tegas kulit sawo matang',
    age: '50 tahun',
    hair: 'rambut hitam pendek rapi belah samping warna hitam pendek rapi',
    body_posture: 'tegap tinggi 170cm postur tegap berwibawa',
    clothing: 'seragam militer jas safari abu-abu peci hitam',
    special_features: 'peci hitam jam tangan kacamata senyum tipis khas',
    full: 'Laki-Laki, 50 tahun, wajah oval rahang tegas kotak hidung mancung sedang mata sipit tajam, rambut hitam pendek rapi belah samping, postur tegap 170cm, pakaian seragam militer jas safari abu-abu peci hitam'
  },
  'ken arok': {
    gender: 'Laki-Laki',
    genderTag: '(male warrior, handsome Javanese man:1.2, strong warrior:1.3)',
    face: 'wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas berani kulit sawo matang',
    age: '35 tahun',
    hair: 'rambut hitam panjang gelung udeng batik emas panjang sebahu',
    body_posture: 'tegap kekar tinggi 173cm berwibawa atletis',
    clothing: 'bare chest with gold ornaments kain batik kawung dodot coklat emas sabuk emas udeng batik emas',
    special_features: 'keris pusaka luk 7 warangka emas mahkota gelung udeng emas kalung emas gelang emas',
    full: 'Laki-Laki, 35 tahun, wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas berani kulit sawo matang, rambut hitam panjang gelung udeng batik emas, postur tegap kekar tinggi 173cm'
  },
  'ken dedes': {
    gender: 'Perempuan',
    genderTag: '(female queen, beautiful Javanese woman:1.2, elegant woman:1.2)',
    face: 'wajah oval cantik anggun rahang halus hidung mancung proporsional mata besar teduh ekspresi anggun lembut kulit sawo matang halus',
    age: '28 tahun',
    hair: 'rambut hitam panjang disanggul hiasan melati mahkota emas panjang pinggang',
    body_posture: 'anggun tinggi 165cm postur anggun berwibawa',
    clothing: 'kemben emas kain batik dodot panjang merah emas selendang sutra emas',
    special_features: 'mahkota emas perhiasan emas lengkap kemben emas batik dodot',
    full: 'Perempuan, 28 tahun, wajah oval cantik anggun rahang halus hidung mancung proporsional mata besar teduh ekspresi anggun lembut kulit sawo matang halus, rambut hitam panjang disanggul hiasan melati mahkota emas, postur anggun tinggi 165cm'
  }
};

export function getFallbackForCharacter(name: string, genderHint?: string): SevenAttributes & { genderTag: string; full: string } {
  const lower = (name || '').toLowerCase();
  const genderLower = (genderHint || '').toLowerCase();
  for (const key of Object.keys(FALLBACK_PHYSICAL_MAP)) {
    if (lower.includes(key)) return FALLBACK_PHYSICAL_MAP[key];
  }
  // STRICT: Gender hint takes priority — if gender is Perempuan, use female fallback
  const femaleGenderHint = genderLower.includes('perempuan') || genderLower.includes('female') || genderLower.includes('wanita') || genderLower.includes('woman') || genderLower.includes('girl') || genderLower.includes('cewek');
  const maleGenderHint = genderLower.includes('laki') || genderLower.includes('pria') || genderLower.includes('male') || genderLower.includes('man') && !femaleGenderHint;
  
  if (femaleGenderHint) {
    return {
      gender: 'Perempuan',
      genderTag: '(female, beautiful woman, feminine:1.2)',
      face: 'wajah oval anggun cantik rahang halus hidung mancung proporsional mata besar teduh ekspresi anggun berwibawa kulit sawo matang halus',
      age: '28 tahun',
      hair: 'rambut hitam panjang disanggul dengan hiasan melati',
      body_posture: 'tegap anggun tinggi 165cm postur anggun berwibawa proporsional',
      clothing: 'dress cantik wanita modern, pakaian wanita anggun sesuai cerita, female outfit elegant',
      special_features: 'perhiasan wanita anggun, aksesoris feminin',
      full: 'Perempuan, 28 tahun, wajah oval anggun cantik rahang halus hidung mancung proporsional mata besar teduh ekspresi anggun berwibawa kulit sawo matang halus, rambut hitam panjang disanggul hiasan melati, postur tegap anggun 165cm, pakaian dress cantik wanita modern pakaian wanita anggun sesuai cerita female outfit elegant, ciri khusus perhiasan wanita anggun aksesoris feminin'
    };
  }
  if (maleGenderHint) {
    return {
      gender: 'Laki-Laki',
      genderTag: '(male, handsome man, masculine:1.2)',
      face: 'wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas tenang kulit sawo matang',
      age: '35 tahun',
      hair: 'rambut hitam pendek rapi',
      body_posture: 'tegap kekar tinggi 172cm postur berwibawa atletis',
      clothing: 'pakaian pria modern kemeja celana, male outfit sesuai cerita',
      special_features: 'aksesoris pria',
      full: 'Laki-Laki, 35 tahun, wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas tenang kulit sawo matang, rambut hitam pendek rapi, postur tegap kekar 172cm, pakaian pria modern kemeja celana male outfit sesuai cerita, ciri khusus aksesoris pria'
    };
  }
  // Check name for female indicators — expanded to include common female names like Amelia
  const isFemaleByName = /amelia|andini|amara|luna|sinta|maya|ayu|wulan|sari|lestari|putri|ratu|dewi|ken dedes|queen|princess|perempuan|wanita|female|woman|girl|cewek|tunggadewi|tribuana|gitarja/i.test(lower);
  if (isFemaleByName) {
    return {
      gender: 'Perempuan',
      genderTag: '(female, beautiful woman, feminine:1.2)',
      face: 'wajah oval anggun cantik rahang halus hidung mancung proporsional mata besar teduh ekspresi anggun berwibawa kulit sawo matang halus',
      age: '28 tahun',
      hair: 'rambut hitam panjang disanggul dengan hiasan melati',
      body_posture: 'tegap anggun tinggi 165cm postur anggun berwibawa proporsional',
      clothing: 'dress cantik wanita modern, pakaian wanita anggun sesuai cerita, female outfit elegant',
      special_features: 'perhiasan wanita anggun, aksesoris feminin',
      full: 'Perempuan, 28 tahun, wajah oval anggun cantik rahang halus hidung mancung proporsional mata besar teduh ekspresi anggun berwibawa kulit sawo matang halus, rambut hitam panjang disanggul hiasan melati, postur tegap anggun 165cm, pakaian dress cantik wanita modern pakaian wanita anggun sesuai cerita female outfit elegant, ciri khusus perhiasan wanita anggun aksesoris feminin'
    };
  }
  // Default male
  return {
    gender: 'Laki-Laki',
    genderTag: '(male, handsome man, masculine:1.2)',
    face: 'wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas tenang kulit sawo matang',
    age: '35 tahun',
    hair: 'rambut hitam pendek rapi',
    body_posture: 'tegap kekar tinggi 172cm postur berwibawa atletis',
    clothing: 'pakaian pria modern kemeja celana, male outfit sesuai cerita',
    special_features: 'aksesoris pria',
    full: 'Laki-Laki, 35 tahun, wajah oval rahang tegas kotak hidung mancung sedang mata tajam berwibawa ekspresi tegas tenang kulit sawo matang, rambut hitam pendek rapi, postur tegap kekar 172cm, pakaian pria modern kemeja celana male outfit sesuai cerita, ciri khusus aksesoris pria'
  };
}

export function sanitizeSevenAttributes(character: any): SevenAttributes & { sanitized: boolean; corrections: string[]; genderTag: string } {
  const corrections: string[] = [];
  let sanitized = false;
  const fallback = getFallbackForCharacter(character?.name || '', character?.gender || '');

  function checkAndFallback(key: keyof SevenAttributes, value: any, fallbackValue: string): string {
    if (isInvalidAttribute(value)) {
      corrections.push(`${key}: "${String(value).slice(0,50)}" → fallback "${fallbackValue.slice(0,60)}"`);
      sanitized = true;
      return fallbackValue;
    }
    return String(value).trim();
  }

  const gender = checkAndFallback('gender', character?.gender, fallback.gender);
  const face = checkAndFallback('face', character?.face || character?.bentuk_wajah, fallback.face);
  const age = checkAndFallback('age', character?.age, fallback.age);
  const hair = checkAndFallback('hair', character?.hair || character?.gaya_rambut, fallback.hair);
  const body_posture = checkAndFallback('body_posture', character?.body_posture || character?.body_shape || character?.postur, fallback.body_posture);
  const clothing = checkAndFallback('clothing', character?.clothing || character?.pakaian, fallback.clothing);
  const special_features = checkAndFallback('special_features', character?.special_features || character?.accessories || character?.ciri_khusus, fallback.special_features);

  let genderTag = character?.genderTag || character?.gender_tag || fallback.genderTag;
  if (isInvalidAttribute(genderTag)) {
    genderTag = fallback.genderTag;
    sanitized = true;
    corrections.push(`genderTag fallback → ${fallback.genderTag}`);
  }

  return { gender, face, age, hair, body_posture, clothing, special_features, genderTag, sanitized, corrections };
}

export function sanitizeUIText(text: any, fallback: string = ''): string {
  if (!text) return fallback || '';
  let str = String(text);
  const forbiddenPatterns = [/tidak disebutkan dalam sumber/gi, /tidak disebutkan/gi, /belum tersedia di demo rekonstruksi/gi];
  let hadForbidden = false;
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(str)) { hadForbidden = true; str = str.replace(pattern, '').trim(); }
  }
  if (hadForbidden && str.length < 5) return fallback || '';
  return str || fallback || '';
}

export function containsForbiddenText(text: any): boolean {
  if (!text) return false;
  const str = String(text).toLowerCase();
  return str.includes('tidak disebutkan') || str.includes('belum tersedia di demo rekonstruksi');
}

export function getWorldDisplayGuard(project: any): { hasWorld: boolean; hasStory: boolean; message: string; isExtracting: boolean; worldSetting: string; locations?: any[] } {
  try {
    const hasStory = !!(project?.story);
    const world = project?.world;
    const locations = world?.locations || world || [];
    const hasWorld = !!(world && (world.locations?.length > 0 || world.total_locations > 0 || Array.isArray(world) && world.length > 0));
    if (hasWorld) {
      const ws = getWorldSettingForPrompt(world?.worldSetting || world?.worldSettingGlobal, locations);
      return { hasWorld: true, hasStory, message: `Dunia ${locations.length || world.total_locations} lokasi — Sinkron 100% dynamic`, isExtracting: false, worldSetting: ws, locations };
    }
    if (hasStory) {
      const storyLocs = project?.story?.locations || [];
      const ws = storyLocs.length ? getWorldSettingForPrompt(undefined, storyLocs) : WORLD_DEFAULT_MAJAPAHIT.visualPrompt || '';
      return { hasWorld: false, hasStory: true, message: 'Mengekstrak Latar Dunia dari Cerita...', isExtracting: true, worldSetting: ws, locations: storyLocs };
    }
    return { hasWorld: false, hasStory: false, message: 'Mengekstrak Latar Dunia dari Cerita...', isExtracting: true, worldSetting: WORLD_DEFAULT_MAJAPAHIT.visualPrompt || '', locations: [] };
  } catch {
    return { hasWorld: false, hasStory: false, message: 'Mengekstrak Latar Dunia dari Cerita...', isExtracting: true, worldSetting: WORLD_DEFAULT_MAJAPAHIT.visualPrompt || '', locations: [] };
  }
}

// === 3. WORLD ENGINE — DYNAMIC 100% FROM STORY SOURCE — SINGLE SOURCE OF TRUTH ===

export interface WorldSetting {
  name: string;
  era: string;
  architecture: string;
  atmosphere: string;
  cultural_elements: string;
  description?: string;
  environment?: string;
  visualPrompt?: string;
  majapahitAesthetic?: string;
}

// DYNAMIC DEFAULT — NO Candi-Trowulan-REMOVED / Gapura-Wringin-Lawang-REMOVED — generic dynamic
export const WORLD_DEFAULT_MAJAPAHIT: WorldSetting = {
  name: 'Lokasi Dinamis dari Cerita',
  era: 'Era sesuai cerita — dynamic from story source',
  architecture: 'dynamic architecture from story source, background matching story description, environment matching active story, aesthetic from story/naskah',
  atmosphere: 'suasana sesuai cerita, atmosphere from story source, mood matching story',
  cultural_elements: 'elemen budaya dari cerita, cultural elements from story source, dynamic culture matching story context',
  description: 'Lokasi dinamis dari cerita — dynamic environment from story source, background matching story description, aesthetic from active story source',
  environment: 'lingkungan sesuai deskripsi cerita, environment matching story description, dynamic background from story source',
  visualPrompt: `wide establishing shot, dynamic environment from story source, background matching story description, aesthetic from active story, environment from story/naskah, highly detailed background, Studio Ghibli anime style, vibrant colors`,
  majapahitAesthetic: `dynamic aesthetic from story source, background matching story description`
};

export function buildWorldSettingFromLocations(locations: any[]): WorldSetting {
  if (!locations || locations.length === 0) return WORLD_DEFAULT_MAJAPAHIT;
  const first = locations[0];
  return {
    name: first.name || WORLD_DEFAULT_MAJAPAHIT.name,
    era: first.era || WORLD_DEFAULT_MAJAPAHIT.era,
    architecture: first.architecture || WORLD_DEFAULT_MAJAPAHIT.architecture,
    atmosphere: first.atmosphere || WORLD_DEFAULT_MAJAPAHIT.atmosphere,
    cultural_elements: first.cultural_elements || WORLD_DEFAULT_MAJAPAHIT.cultural_elements,
    description: first.description || WORLD_DEFAULT_MAJAPAHIT.description,
    environment: first.environment || WORLD_DEFAULT_MAJAPAHIT.environment,
    visualPrompt: first.visualPrompt || WORLD_DEFAULT_MAJAPAHIT.visualPrompt,
    majapahitAesthetic: first.majapahitAesthetic || WORLD_DEFAULT_MAJAPAHIT.majapahitAesthetic
  };
}

// LEGACY override phrase — NOW dynamic generic, no rigid temple strings
export const MAJAPAHIT_NUSANTARA_OVERRIDE_PHRASE = `dynamic environment from story source, background matching story description, aesthetic from active story`;

export function forceMajapahitStrictVisualOverride(input: string = ''): string {
  if (!input) return MAJAPAHIT_NUSANTARA_OVERRIDE_PHRASE;
  let out = String(input);
  // DYNAMIC — replace temple/palace with dynamic phrase, not hardcoded Candi-Trowulan-REMOVED
  out = out.replace(/\b(temple|palace|chinese temple|japanese temple|pagoda temple|east asian palace|forbidden city palace)\b/gi, MAJAPAHIT_NUSANTARA_OVERRIDE_PHRASE);
  out = out.replace(/temple/gi, 'dynamic location from story source');
  out = out.replace(/palace/gi, 'dynamic royal courtyard from story source');
  out = out.replace(/\bindoor hall\b/gi, 'outdoor environment from story source');
  out = out.replace(/chinese architecture|japanese shrine|curved oriental roof/gi, MAJAPAHIT_NUSANTARA_OVERRIDE_PHRASE);
  return out;
}

export function getWorldSettingForPrompt(worldSetting?: WorldSetting | any, locations?: any[]): string {
  let raw = '';
  if (worldSetting) {
    if (typeof worldSetting === 'string') raw = worldSetting;
    else if (worldSetting.visualPrompt) raw = worldSetting.visualPrompt;
    else if (worldSetting.description) raw = worldSetting.description;
    else {
      const parts = [worldSetting.name, worldSetting.era, worldSetting.architecture, worldSetting.atmosphere, worldSetting.cultural_elements, worldSetting.environment].filter(Boolean);
      if (parts.length > 0) raw = parts.join(', ');
    }
  }
  if (!raw && locations && locations.length > 0) {
    const first = locations[0] as any;
    raw = first.visualPrompt || first.description || first.name || '';
    if (!raw) {
      const ws = buildWorldSettingFromLocations(locations);
      raw = ws.visualPrompt || `${ws.name}, ${ws.era}, ${ws.architecture}`;
    }
  }
  if (!raw) raw = `dynamic environment from story source, background matching story description`;
  return String(raw).slice(0, 1000);
}

// === 4. FULL-BODY FORMAT LOCK (GRADIO FLUX ROUTE) ===

export const GRADIO_FLUX_CONFIG = {
  spaceId: 'black-forest-labs/FLUX.1-schnell',
  width: 1024,
  height: 1024,
  num_inference_steps: 8,
  guidance_scale: 3.5,
  seed: 0,
  randomize_seed: true,
  endpoint: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
  fallbackEndpoint: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
  engineLabel: 'Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic)',
} as const;

export const DIRECT_HF_FLUX_CONFIG = {
  modelId: 'black-forest-labs/FLUX.1-schnell',
  width: 1024,
  height: 1024,
  num_inference_steps: 8,
  guidance_scale: 3.5,
  engineLabel: 'Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic)',
  endpoints: [
    'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
    'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
  ],
} as const;

export const FULL_BODY_PREFIX = `((full body shot, standing pose, full length character reference sheet, showing feet to head:1.5))`;
export const GHIBLI_LOCK = `Studio Ghibli anime style, 2D anime masterpiece, vibrant colors`;

export function buildFullBodyPromptFormat(genderTag: string, sevenAttributes: string, worldSetting: string): string {
  const dynamicCtx = detectDynamicStoryContext(`${sevenAttributes} ${worldSetting}`);
  const safeWorld = worldSetting ? String(worldSetting).slice(0, 500) : dynamicCtx.aesthetic;
  const safeSeven = sevenAttributes ? String(sevenAttributes).slice(0, 800) : '';
  return `${FULL_BODY_PREFIX}, ${GHIBLI_LOCK}, ${genderTag}, ${safeSeven}, ${safeWorld}, ${dynamicCtx.aesthetic}, highly detailed, ${ISOLATED_CHARACTER_ONLY_POSITIVE}`;
}

export function getCulturalPromptLock(theme: string = '', worldSetting?: string): { positive: string; negative: string; isMajapahit: boolean; worldSettingInjected: string } {
  const combined = `${theme} ${worldSetting || ''}`.toLowerCase();
  const dynamicCtx = detectDynamicStoryContext(combined);
  const isMajapahit = isMajapahitTheme(theme) || detectMajapahitFromContext(theme) || detectMajapahitFromContext(worldSetting || '');
  
  const safeWorld = worldSetting ? String(worldSetting).slice(0, 800) : dynamicCtx.aesthetic;
  const positive = dynamicCtx.aesthetic ? `${dynamicCtx.aesthetic}, ${dynamicCtx.clothingStyle}` : `dynamic aesthetic from story source, style matching "${theme.slice(0,100)}"`;
  const negative = `${STRICT_BACKGROUND_ELIMINATION_NEGATIVE}, cropped, headshot, close up, portrait, face only, upper body only, half body, deformed face, bad anatomy`;
  
  if (isMajapahit) {
    const worldInjected = safeWorld ? `${safeWorld}, ${dynamicCtx.aesthetic}` : dynamicCtx.aesthetic;
    return { positive, negative, isMajapahit: true, worldSettingInjected: worldInjected };
  }
  
  return { positive, negative, isMajapahit: false, worldSettingInjected: safeWorld || dynamicCtx.aesthetic || 'highly detailed, vibrant colors' };
}

export function validateCulturalGuardrail(prompt: string): { isValid: boolean; hasForbiddenChineseJapanese: boolean; hasMajapahitPositive: boolean; issues: string[] } {
  const lower = (prompt || '').toLowerCase();
  const issues: string[] = [];
  const forbidden = ['pagoda', 'chinese temple', 'chinese architecture', 'curved oriental roof', 'japanese shrine', 'torii', 'hanfu', 'kimono', 'chinese dress', 'forbidden city', 'east asian palace'];
  const foundForbidden = forbidden.filter(word => lower.includes(word) && !lower.includes(`no ${word}`) && !lower.includes(`NO ${word.toUpperCase()}`));
  const hasForbiddenChineseJapanese = foundForbidden.length > 0 && lower.includes('chinese architecture') && !lower.includes('no chinese');
  const hasMajapahitPositive = lower.includes('dynamic environment') || lower.includes('background matching story') || lower.includes('batik cloth');
  if (hasForbiddenChineseJapanese) issues.push(`DILARANG HARDCODE arsitektur Tiongkok/Jepang: found ${foundForbidden.join(', ')} as positive style`);
  return { isValid: issues.length === 0, hasForbiddenChineseJapanese, hasMajapahitPositive, issues };
}

// === 5. PIPELINE LAYER SEPARATED — KARAKTER POLOS, BACKGROUND TERPISAH, COMPOSITING ===

export const ISOLATED_CHARACTER_ONLY_POSITIVE = `isolated full-body character portrait, standalone character, transparent PNG style, cutout style, plain clean flat background`;
export const STRICT_BACKGROUND_ELIMINATION_NEGATIVE = `background, scenery, environment, wall, room, buildings, architecture, scenery, landscape, shadows, solid background color, colored background`;

export const CHARACTER_ASSET_ONLY_BACKGROUND = `((full body character sheet, standing pose, isolated on pure solid white background, white background only, plain white background, solid white background, studio lighting, vector style cutout, NO environment, NO buildings, NO background elements, NO scenery, NO street, NO cafe, NO city, empty white background, white backdrop, no background at all:1.5)), ${ISOLATED_CHARACTER_ONLY_POSITIVE}, isolated full-body character portrait, standalone character, transparent PNG style, cutout style, plain white background, white background only`;
export const CHARACTER_ASSET_ONLY_NEGATIVE = `background, scenery, environment, wall, room, buildings, architecture, scenery, landscape, shadows, solid background color, colored background, environment, buildings, background elements, landscape, temple, palace, chinese temple, pagoda, curved oriental roof, chinese architecture, japanese shrine, hanfu, kimono, asian East pagoda, indoor hall, cropped, headshot, close up, portrait, face only, upper body only, half body, deformed face, bad anatomy, blurry, lowres`;

export const WORLD_BACKGROUND_ONLY_POSITIVE_BASE = `cinematic atmosphere, highly detailed environment background, empty scene, dynamic background from story source`;
export const WORLD_BACKGROUND_ONLY_NEGATIVE = `humans, characters, people, person, man, woman, human figure, crowds, cropped, deformed, blurry, lowres, text, watermark`;

export const TIME_OF_DAY_MAP: Record<string, string> = {
  pagi: 'early morning sunrise, soft golden light, morning mist, warm tropical dawn',
  siang: 'bright midday sun, clear tropical daylight, vibrant colors, harsh sunlight',
  sore: 'late afternoon golden hour, warm orange sunset light, long shadows, senja',
  senja: 'sunset golden hour, dramatic orange sky, warm ambient light',
  malam: 'night scene, moonlight, torch lights, starry sky, dark blue night atmosphere, dramatic night lighting',
  fajar: 'dawn, first light, soft pink sky, misty morning',
  default: 'cinematic lighting, highly detailed, vibrant colors'
};

export const WEATHER_MAP: Record<string, string> = {
  cerah: 'clear sky, bright sunny weather, clear tropical sky, cerah',
  hujan: 'rainy weather, wet ground, rain droplets, overcast sky',
  badai: 'stormy weather, dramatic clouds, strong wind, lightning',
  mendung: 'overcast, cloudy sky, soft diffused light, mendung',
  berkabut: 'foggy, misty atmosphere, fog, berkabut',
  default: 'clear atmosphere'
};

// === DYNAMIC PROMPT SYSTEM — 100% FROM NASKAH ===

export interface DynamicStoryContext {
  isModern: boolean;
  isKingdom: boolean;
  isFantasy: boolean;
  isUrban: boolean;
  clothingStyle: string;
  aesthetic: string;
  rawText: string;
}

export function detectDynamicStoryContext(text: string = ''): DynamicStoryContext {
  const lower = (text || '').toLowerCase();
  const modernKeywords = ['kafe', 'cafe', 'kopi', 'barista', 'kantor', 'office', 'sekolah', 'kampus', 'modern', 'kota', 'urban', 'mall', 'restoran', 'coffee shop', 'contemporary', 'casual', 'jeans', 't-shirt', 'hoodie', 'kerja', 'kantoran', 'startup', 'kampus', 'kuliah', 'gadis kota', 'anak muda kota', 'perkotaan'];
  const kingdomKeywords = ['kerajaan', 'majapahit', 'kolosal', 'istana', 'raja', 'ratu', 'prajurit', 'ksatria', 'keraton', 'mahkota', 'singgasana', 'pendekar', 'silat', 'jawa kuno', 'nusantara', 'gajah mada', 'hayam wuruk', 'kesultanan', 'kedaton', 'adipati'];
  const fantasyKeywords = ['fantasi', 'sihir', 'penyihir', 'naga', 'elf', 'peri', 'magic', 'fantasy', 'wizard', 'dragon', 'fairy', 'demon', 'iblis'];
  const urbanKeywords = ['jalan', 'gedung', 'apartemen', 'trotoar', 'lampu kota', 'neon', 'cityscape'];

  const isModern = modernKeywords.some(k => lower.includes(k));
  const isKingdom = kingdomKeywords.some(k => lower.includes(k));
  const isFantasy = fantasyKeywords.some(k => lower.includes(k));
  const isUrban = urbanKeywords.some(k => lower.includes(k));

  let clothingStyle = '';
  let aesthetic = '';

  if (isModern) {
    clothingStyle = `modern outfit, contemporary casual clothing, urban style, ${lower.includes('kafe') || lower.includes('cafe') || lower.includes('barista') ? 'barista apron, cafe uniform, casual modern' : 'modern casual wear'}`;
    aesthetic = `modern contemporary aesthetic, urban lifestyle, clean modern style`;
  } else if (isKingdom) {
    clothingStyle = `traditional royal outfit, authentic historical costume, regal attire, ${lower.includes('majapahit') ? 'Majapahit era traditional' : 'kingdom era traditional'} costume`;
    aesthetic = `historical kingdom aesthetic, regal colossal style, traditional cultural`;
  } else if (isFantasy) {
    clothingStyle = `fantasy outfit, magical costume, enchanted attire`;
    aesthetic = `fantasy magical aesthetic, enchanted style`;
  } else if (isUrban) {
    clothingStyle = `urban streetwear, city casual outfit, contemporary urban clothing`;
    aesthetic = `urban city aesthetic, street style`;
  } else {
    clothingStyle = `outfit described in story, clothing matching story context`;
    aesthetic = `aesthetic matching story description, style from source story`;
  }

  return { isModern, isKingdom, isFantasy, isUrban, clothingStyle, aesthetic, rawText: text };
}

export function getGenderEnforcedTag(gender: string = '', name: string = ''): string {
  const g = (gender || '').toLowerCase();
  const n = (name || '').toLowerCase();
  const combined = `${g} ${n}`;
  const isFemale = /perempuan|female|wanita|putri|ratu|dewi|gadis|perempuan|woman|girl|princess|queen|andini|tribhuwana|ken dedes|amelia|amara|luna|sinta|maya|ayu|wulan|sari|lestari|rina|diana|clara|emma|olivia/i.test(combined);
  if (isFemale) {
    return `1woman, beautiful female, female outfit, elegant woman, (female:1.3)`;
  } else {
    return `1man, handsome male, male outfit, strong male, (male:1.3)`;
  }
}

export function getGenderEnforcedTagDynamic(character: any): string {
  const genderRaw = character?.gender || character?.jenis_kelamin || '';
  const name = character?.name || '';
  const baseTag = getGenderEnforcedTag(genderRaw, name);
  const physical = character?.physical || character?.description || '';
  const ctx = detectDynamicStoryContext(`${name} ${physical} ${character?.clothing || ''} ${character?.role || ''}`);
  return `${baseTag}, ${ctx.clothingStyle}, ${ctx.aesthetic}`;
}

export function buildDynamicCharacterPrompt(genderTag: string, sevenAttributes: string, storyContext?: string, characterData?: any): string {
  const storyText = storyContext || characterData?.description || characterData?.clothing || sevenAttributes || '';
  const dynamicCtx = detectDynamicStoryContext(storyText);
  const genderEnforced = characterData ? getGenderEnforcedTagDynamic(characterData) : genderTag;
  const finalGenderTag = genderEnforced.includes('1man') || genderEnforced.includes('1woman') ? genderEnforced : `${getGenderEnforcedTag(characterData?.gender || genderTag, characterData?.name || '')}, ${genderTag}`;
  const dynamicClothing = characterData?.clothing || characterData?.pakaian || dynamicCtx.clothingStyle;
  const dynamicAesthetic = dynamicCtx.aesthetic;
  return `${FULL_BODY_PREFIX}, ${GHIBLI_LOCK}, ${finalGenderTag}, ${sevenAttributes}, ${dynamicClothing}, ${dynamicAesthetic}, ${ISOLATED_CHARACTER_ONLY_POSITIVE}, highly detailed character design, full body, head to toe, entire body visible, feet visible, hands visible, centered, masterpiece, best quality, isolated character asset, cutout, standalone character, transparent PNG style, plain clean flat background`;
}

export function buildCharacterAssetOnlyPrompt(genderTag: string, sevenAttributes: string, storyContext?: string, characterData?: any): string {
  if (storyContext || characterData) {
    return buildDynamicCharacterPrompt(genderTag, sevenAttributes, storyContext, characterData);
  }
  const genderEnforced = getGenderEnforcedTag('', '');
  const finalTag = genderTag.includes('1man') || genderTag.includes('1woman') ? genderTag : `${genderEnforced}, ${genderTag}`;
  return `${FULL_BODY_PREFIX}, ${GHIBLI_LOCK}, ${finalTag}, ${sevenAttributes}, ${CHARACTER_ASSET_ONLY_BACKGROUND}, ${ISOLATED_CHARACTER_ONLY_POSITIVE}, highly detailed character design, full body, head to toe, entire body visible, feet visible, hands visible, centered, masterpiece, best quality, isolated character asset, cutout, standalone character, transparent PNG style, plain clean flat background`;
}

export function buildWorldBackgroundOnlyPrompt(worldSetting?: string, timeOfDay?: string, weather?: string): string {
  const timeKey = (timeOfDay || 'default').toLowerCase();
  const weatherKey = (weather || 'default').toLowerCase();
  const timePrompt = TIME_OF_DAY_MAP[timeKey] || TIME_OF_DAY_MAP[timeKey.split(' ')[0]] || TIME_OF_DAY_MAP.default;
  const weatherPrompt = WEATHER_MAP[weatherKey] || WEATHER_MAP[weatherKey.split(' ')[0]] || WEATHER_MAP.default;
  const baseWorld = worldSetting ? String(worldSetting).slice(0, 500) : `dynamic background from story source, environment matching story description`;
  const dynamicCtx = detectDynamicStoryContext(baseWorld);
  return `wide establishing shot, ${baseWorld}, ${timePrompt}, ${weatherPrompt}, ${dynamicCtx.aesthetic}, cinematic atmosphere, highly detailed environment background, NO humans, NO characters, empty scene, Studio Ghibli anime style, highly detailed background, vibrant colors, masterpiece`;
}

export function getWorldBackgroundNegative(): string { return WORLD_BACKGROUND_ONLY_NEGATIVE; }
export function getCharacterAssetNegative(): string { return CHARACTER_ASSET_ONLY_NEGATIVE; }

export function getWorldSettingForPromptDynamic(worldSetting?: any, locations?: any[], storyText?: string): string {
  let raw = '';
  if (worldSetting) {
    if (typeof worldSetting === 'string') raw = worldSetting;
    else if (worldSetting.visualPrompt) raw = worldSetting.visualPrompt;
    else if (worldSetting.description) raw = worldSetting.description;
    else {
      const parts = [worldSetting.name, worldSetting.era, worldSetting.architecture, worldSetting.atmosphere, worldSetting.cultural_elements, worldSetting.environment].filter(Boolean);
      if (parts.length > 0) raw = parts.join(', ');
    }
  }
  if (!raw && locations && locations.length > 0) {
    const first = locations[0];
    raw = first.visualPrompt || first.description || first.name || '';
  }
  if (!raw && storyText) raw = storyText.slice(0, 500);
  if (!raw) raw = `dynamic environment from story source`;
  return String(raw).slice(0, 1000);
}


// === STRICT CHARACTER ATTRIBUTE ENFORCEMENT & BACKGROUND ELIMINATION — 2026-09-20 PATCH ===

export const STRICT_ISOLATED_POSITIVE_REQUIRED = `((isolated full-body character portrait, standalone character asset, plain white background, solid white background, pure white background, white background only, transparent PNG style, studio lighting, white backdrop, no background, no scenery, no environment, empty background, character sheet on white:1.5))`;

export const STRICT_BACKGROUND_NEGATIVE_REQUIRED = `background, scenery, environment, wall, room, buildings, architecture, street, landscape, shadows, solid background color, colored background`;

export const STRICT_GENDER_MALE_POSITIVE = `1man, handsome male, masculine features, male outfit, adult male`;
export const STRICT_GENDER_MALE_NEGATIVE = `female, woman, girl, breasts, female clothing, feminine face`;

export const STRICT_GENDER_FEMALE_POSITIVE = `1woman, beautiful female, feminine features, female outfit`;
export const STRICT_GENDER_FEMALE_NEGATIVE = `male, man, boy, facial hair, mustache, masculine body`;

export const STRICT_BODY_CHUBBY_POSITIVE = `chubby build, heavyset body, overweight physique`;
export const STRICT_BODY_CHUBBY_NEGATIVE = `skinny, slim, thin`;

export const STRICT_AGE_ADULT_POSITIVE_TEMPLATE = (age?: number | string) => {
  if (age) return `${age} years old adult`;
  return `adult, mature adult`;
};
export const STRICT_AGE_ADULT_NEGATIVE = `young girl, teenager, child, kid, young boy, minor`;

export interface StrictGenderResult {
  detected: 'male' | 'female';
  positive: string;
  negative: string;
  source: string;
}

export function getStrictGenderMapping(genderInput: string = '', physicalText: string = '', name: string = ''): StrictGenderResult {
  const combined = `${genderInput} ${physicalText} ${name}`.toLowerCase();
  const femaleKeywords = ['perempuan', 'wanita', 'female', 'woman', 'girl', 'putri', 'ratu', 'dewi', 'princess', 'queen', 'gadis', 'cewek', 'feminine', 'breasts', '1woman', 'amelia', 'andini', 'amara', 'luna', 'sinta', 'maya', 'ayu', 'wulan', 'sari', 'lestari', 'rina', 'diana', 'clara', 'emma', 'olivia', 'amelie'];
  const maleKeywords = ['laki-laki', 'laki', 'pria', 'male', 'man', 'boy', 'cowok', 'masculine', '1man', 'mustache', 'beard', 'facial hair'];
  
  const physicalLower = (physicalText || '').toLowerCase();
  const genderLower = (genderInput || '').toLowerCase();
  const nameLower = (name || '').toLowerCase();
  
  // PRIORITY 1: explicit gender metadata — highest priority (fixes Amelia bug where physical was male fallback but gender is Perempuan)
  if (femaleKeywords.some(k => genderLower.includes(k))) {
    return {
      detected: 'female' as const,
      positive: STRICT_GENDER_FEMALE_POSITIVE,
      negative: STRICT_GENDER_FEMALE_NEGATIVE,
      source: 'gender-female-explicit-priority'
    };
  }
  if (maleKeywords.some(k => genderLower.includes(k))) {
    return {
      detected: 'male' as const,
      positive: STRICT_GENDER_MALE_POSITIVE,
      negative: STRICT_GENDER_MALE_NEGATIVE,
      source: 'gender-male-explicit-priority'
    };
  }
  
  // PRIORITY 2: name indicator — Amelia etc
  if (/amelia|andini|amara|luna|sinta|maya|ayu|wulan|sari|lestari|putri|ratu|dewi|ken dedes|siti|rina|diana|clara|emma|olivia|amelie|tribhuwana|tunggadewi|gitarja/i.test(nameLower)) {
    return {
      detected: 'female' as const,
      positive: STRICT_GENDER_FEMALE_POSITIVE,
      negative: STRICT_GENDER_FEMALE_NEGATIVE,
      source: 'name-female-indicator-priority'
    };
  }
  if (/gajah|hayam|brama|jaka|bima|arjuna|ken arok|rangga/i.test(nameLower)) {
    return {
      detected: 'male' as const,
      positive: STRICT_GENDER_MALE_POSITIVE,
      negative: STRICT_GENDER_MALE_NEGATIVE,
      source: 'name-male-indicator-priority'
    };
  }
  
  // PRIORITY 3: physical text explicit
  const hasFemaleInPhysical = femaleKeywords.some(k => physicalLower.includes(k));
  const hasMaleInPhysical = maleKeywords.some(k => physicalLower.includes(k));
  
  if (hasFemaleInPhysical && !hasMaleInPhysical) {
    return {
      detected: 'female' as const,
      positive: STRICT_GENDER_FEMALE_POSITIVE,
      negative: STRICT_GENDER_FEMALE_NEGATIVE,
      source: 'physical-female-only'
    };
  }
  if (hasMaleInPhysical && !hasFemaleInPhysical) {
    return {
      detected: 'male' as const,
      positive: STRICT_GENDER_MALE_POSITIVE,
      negative: STRICT_GENDER_MALE_NEGATIVE,
      source: 'physical-male-only'
    };
  }
  if (hasFemaleInPhysical && hasMaleInPhysical) {
    // contradiction in physical — gender already checked, now check female first for safety
    return {
      detected: 'female' as const,
      positive: STRICT_GENDER_FEMALE_POSITIVE,
      negative: STRICT_GENDER_FEMALE_NEGATIVE,
      source: 'physical-contradiction-fallback-female'
    };
  }
  
  // PRIORITY 4: combined fallback
  const hasFemale = femaleKeywords.some(k => combined.includes(k));
  const hasMale = maleKeywords.some(k => combined.includes(k));
  
  if (hasFemale && !hasMale) {
    return {
      detected: 'female' as const,
      positive: STRICT_GENDER_FEMALE_POSITIVE,
      negative: STRICT_GENDER_FEMALE_NEGATIVE,
      source: 'combined-female'
    };
  }
  if (hasMale && !hasFemale) {
    return {
      detected: 'male' as const,
      positive: STRICT_GENDER_MALE_POSITIVE,
      negative: STRICT_GENDER_MALE_NEGATIVE,
      source: 'combined-male'
    };
  }
  
  // Default male if no clue
  return {
    detected: 'male' as const,
    positive: STRICT_GENDER_MALE_POSITIVE,
    negative: STRICT_GENDER_MALE_NEGATIVE,
    source: 'default-male-no-keyword'
  };
}


export interface StrictBodyAgeResult {
  positive: string[];
  negative: string[];
  detectedTraits: string[];
}

export function getStrictBodyAgeMapping(physicalText: string = ''): StrictBodyAgeResult {
  const lower = (physicalText || '').toLowerCase();
  const positive: string[] = [];
  const negative: string[] = [];
  const detectedTraits: string[] = [];
  
  // BODY SHAPE — gemuk/fleshy/overweight/chubby/gendut/berisi/heavyset
  if (/(gemuk|fleshy|overweight|chubby|heavyset|gendut|berisi|obese|fat build|big body)/i.test(lower)) {
    positive.push(STRICT_BODY_CHUBBY_POSITIVE);
    negative.push(STRICT_BODY_CHUBBY_NEGATIVE);
    detectedTraits.push('chubby-overweight');
  }
  
  // AGE — extract number + tahun/years/yo, or dewasa/adult/mature
  const ageMatch = lower.match(/(\d+)\s*(tahun|years|yo|y\.o|th)/i);
  if (ageMatch) {
    const ageNum = ageMatch[1];
    positive.push(`${ageNum} years old adult`);
    negative.push(STRICT_AGE_ADULT_NEGATIVE);
    detectedTraits.push(`age-${ageNum}`);
  } else if (/(35 tahun|35 years|dewasa|adult|mature|\b35\b)/i.test(lower)) {
    // Specific requirement: if 35 tahun / dewasa -> 35 years old adult
    if (lower.includes('35')) {
      positive.push(`35 years old adult`);
    } else if (lower.includes('dewasa') || lower.includes('adult') || lower.includes('mature')) {
      positive.push(`adult, mature adult`);
    }
    negative.push(STRICT_AGE_ADULT_NEGATIVE);
    detectedTraits.push('adult-35');
  }
  
  // Additional age detection for general adult
  if (/(dewasa|adult|mature|\d+\s*tahun)/i.test(lower) && positive.length === 0) {
    // If adult but no specific age yet, add adult tag
    positive.push(`adult`);
    negative.push(STRICT_AGE_ADULT_NEGATIVE);
    detectedTraits.push('adult-generic');
  }
  
  return { positive, negative, detectedTraits };
}

export interface SynchronizedCharacterData {
  name: string;
  gender: string;
  physical: string;
  detectedGender: 'male' | 'female';
  issues: string[];
  genderPositive: string;
  genderNegative: string;
  bodyAgePositive: string[];
  bodyAgeNegative: string[];
}

export function synchronizeCharacterData(character: any): SynchronizedCharacterData {
  const name = character?.name || character?.canonical_name || 'Unknown';
  const genderRaw = character?.gender || character?.jenis_kelamin || '';
  const physical = character?.physical || character?.description || character?.visualTraits || character?.body_posture || character?.face || '' + ' ' + (character?.age || '') + ' ' + (character?.body_shape || '') + ' ' + (character?.clothing || '');
  const physicalText = String(physical || '').trim();
  
  const genderMapping = getStrictGenderMapping(genderRaw, physicalText, name);
  const bodyAgeMapping = getStrictBodyAgeMapping(physicalText);
  
  const issues: string[] = [];
  
  // Check contradictions
  const genderLower = genderRaw.toLowerCase();
  const physicalLower = physicalText.toLowerCase();
  
  if (genderLower.includes('laki') && genderMapping.detected === 'female') {
    issues.push(`CONTRADICTION: gender metadata male but physical/name indicates female — resolved to female via physical priority`);
  }
  if (genderLower.includes('perempuan') && genderMapping.detected === 'male') {
    issues.push(`CONTRADICTION: gender metadata female but physical/name indicates male — resolved to male via physical priority`);
  }
  
  // Name vs gender check
  const femaleNamePattern = /putri|ratu|dewi|andini|tribhuwana|ken dedes|siti|ayu/i;
  const maleNamePattern = /gajah|hayam|brama|jaka|bima|arjuna|ken arok|pria/i;
  if (femaleNamePattern.test(name.toLowerCase()) && genderMapping.detected === 'male') {
    issues.push(`CONTRADICTION: name ${name} suggests female but detected male — check physical`);
  }
  
  return {
    name,
    gender: genderRaw,
    physical: physicalText,
    detectedGender: genderMapping.detected,
    issues,
    genderPositive: genderMapping.positive,
    genderNegative: genderMapping.negative,
    bodyAgePositive: bodyAgeMapping.positive,
    bodyAgeNegative: bodyAgeMapping.negative
  };
}

export function buildStrictCharacterPrompt(physical: string, gender: string, name: string): { positive: string; negative: string; detectedGender: 'male'|'female'; traits: string[] } {
  const genderMap = getStrictGenderMapping(gender, physical, name);
  const bodyAgeMap = getStrictBodyAgeMapping(physical);
  
  const positiveParts = [
    STRICT_ISOLATED_POSITIVE_REQUIRED,
    genderMap.positive,
    ...bodyAgeMap.positive,
    physical
  ].filter(Boolean);
  
  const negativeParts = [
    STRICT_BACKGROUND_NEGATIVE_REQUIRED,
    genderMap.negative,
    ...bodyAgeMap.negative
  ].filter(Boolean);
  
  return {
    positive: positiveParts.join(', '),
    negative: negativeParts.join(', '),
    detectedGender: genderMap.detected,
    traits: [...bodyAgeMap.detectedTraits, genderMap.source]
  };
}

export function stripBackgroundKeywords(text: string = ''): string {
  let out = String(text || '');
  const bgKeywords = [
    'cafe', 'kafe', 'coffee shop', 'warung', 'restoran', 'restaurant', 'street', 'jalan', 'city', 'kota', 'urban', 'building', 'bangunan', 'gedung', 'shop', 'toko', 'market', 'pasar', 'interior', 'exterior', 'room', 'ruangan', 'wall', 'dinding', 'landscape', 'scenery', 'environment', 'background', 'latar', 'outdoor', 'indoor', 'cafe interior', 'modern cafe', 'city view', 'street view', 'village', 'desa', 'forest', 'hutan', 'beach', 'pantai', 'mountain', 'gunung'
  ];
  // Remove sentences containing bg keywords? For character isolated, we remove those words
  bgKeywords.forEach(kw => {
    const re = new RegExp(`\\b${kw}\\b`, 'gi');
    out = out.replace(re, 'white background');
  });
  // Collapse multiple whites
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

export const ULTRA_STRICT_WHITE_BACKGROUND_PROMPT = `((plain white background, solid white background, pure white background, white background only, empty white background, white backdrop, studio white background, white:1.5)), ((no background, no scenery, no environment, no buildings, no street, no cafe, no city, no landscape, no shadows:1.5)), isolated character, standalone asset, transparent PNG, cutout`;

export const ULTRA_STRICT_BACKGROUND_NEGATIVE = `background, scenery, environment, wall, room, buildings, architecture, street, landscape, shadows, solid background color, colored background, cafe, kafe, city, town, village, forest, beach, mountain, shop, store, interior, exterior, outdoor scene, indoor scene, cityscape, streetscape, cafe interior, modern cafe, table, chair, building, house, tree, plant, sky, clouds, ground, floor with texture`;

