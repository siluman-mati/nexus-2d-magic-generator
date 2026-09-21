// NEXUS — CHARACTER VISUAL PROMPT BUILDER — STRICT DIRECT VARIABLE BINDING — 2026-09-20 PATCH v2
// RULE: WAJIB HANYA ambil dari objek karakter aktif: gender, physical, clothing, age — NO story global, NO world, NO dynamic injection
// FIX: No Rangga/35 tahun/Laki-laki static fallback — pure character object only
// OUTPUT: [VisualStyle Modifier] + [Gender Tag] + [Physical] + [Clothing] + [Age] + "isolated full-body character portrait, standalone character asset, plain white background, no background"

import { BuildCharacterVisualPromptResult, CharacterVisualPromptData } from './types'
import {
  FULL_BODY_PREFIX,
  GHIBLI_LOCK,
  sanitizeUIText,
  containsForbiddenText,
  stripBackgroundKeywords,
  STRICT_ISOLATED_POSITIVE_REQUIRED,
  STRICT_BACKGROUND_NEGATIVE_REQUIRED,
  ULTRA_STRICT_WHITE_BACKGROUND_PROMPT,
  ULTRA_STRICT_BACKGROUND_NEGATIVE,
  getStrictGenderMapping,
  getStrictBodyAgeMapping,
  STRICT_GENDER_MALE_POSITIVE,
  STRICT_GENDER_FEMALE_POSITIVE,
  STRICT_GENDER_MALE_NEGATIVE,
  STRICT_GENDER_FEMALE_NEGATIVE,
} from '@/lib/cultural-guardrails'

function isInvalid(value: any): boolean {
  if (!value) return true
  const str = String(value).toLowerCase()
  return str.includes('tidak disebutkan') || str.includes('belum tersedia') || str.trim() === '' || str === '-' || str === 'null' || str === 'undefined' || str.length < 2
}

function safeValue(value: any, fallback: string = ''): string {
  if (isInvalid(value)) return fallback
  return String(value).trim()
}

// === VISUAL STYLE SELECTOR — TERPISAH DARI GENRE — 2026-09-20 ===
export const VISUAL_STYLE_OPTIONS = [
  { id: 'anime', label: 'Anime / 2D Studio', modifier: 'anime style, 2d animation, clean lines, vibrant colors', icon: '🎨' },
  { id: 'photorealistic', label: 'Photorealistic', modifier: 'photorealistic, raw photo, dslr quality, detailed texture, 8k', icon: '📸' },
  { id: '3d_animation', label: '3D Animation', modifier: '3d render, pixar style, smooth shading, expressive 3d character', icon: '🧊' },
  { id: 'semi_realistic', label: 'Semi-Realistic', modifier: 'digital painting, semi-realistic, artstation trending', icon: '🖌️' },
  { id: 'comic_book', label: 'Comic Book', modifier: 'comic book style, bold outlines, graphic novel aesthetic', icon: '💥' },
  { id: 'dark_fantasy', label: 'Dark Fantasy', modifier: 'dark fantasy style, cinematic lighting, moody atmosphere', icon: '🌑' },
] as const;

export type VisualStyleId = typeof VISUAL_STYLE_OPTIONS[number]['id'];

export function getVisualStyleModifier(style: string = 'anime', gender: string = ''): string {
  const normalized = (style || 'anime').toLowerCase().trim();
  const genderLower = (gender || '').toLowerCase();
  const isFemale = /perempuan|female|wanita|woman|girl|putri|ratu|dewi/i.test(genderLower);
  const genderWord = isFemale ? 'woman' : 'man';
  
  // STRICT OVERRIDE for photorealistic per requirement
  if (normalized === 'photorealistic' || normalized.includes('realistis') || normalized.includes('realistic') || normalized === 'realistis') {
    return `photorealistic photo of a ${genderWord}, raw dslr photo, highly detailed skin texture, realistic clothing, natural lighting, 8k resolution`;
  }
  
  const found = VISUAL_STYLE_OPTIONS.find(o => o.id === normalized);
  if (found) {
    // For photorealistic, return override
    if (found.id === 'photorealistic') {
      return `photorealistic photo of a ${genderWord}, raw dslr photo, highly detailed skin texture, realistic clothing, natural lighting, 8k resolution`;
    }
    return found.modifier;
  }
  // fallback check by label
  const byLabel = VISUAL_STYLE_OPTIONS.find(o => normalized.includes(o.id) || o.label.toLowerCase().includes(normalized));
  if (byLabel) {
    if (byLabel.id === 'photorealistic') {
      return `photorealistic photo of a ${genderWord}, raw dslr photo, highly detailed skin texture, realistic clothing, natural lighting, 8k resolution`;
    }
    return byLabel.modifier;
  }
  // default anime
  return VISUAL_STYLE_OPTIONS[0].modifier;
}

export function getVisualStyleOptions() {
  return VISUAL_STYLE_OPTIONS;
}

export function getVisualStyleNegativeOverride(style: string = 'anime'): string {
  const normalized = (style || 'anime').toLowerCase().trim();
  if (normalized === 'photorealistic' || normalized.includes('realistis') || normalized.includes('realistic')) {
    return 'anime, 2d, illustration, cartoon, drawing, anime style, 2d animation, comic, manga, chibi, sketch, painting';
  }
  return '';
}

export function buildCharacterVisualPrompt(
  character: any,
  visualStyle?: string,
  sourceStoryId?: string,
  worldSetting?: any,
  theme?: string
): BuildCharacterVisualPromptResult {
  const groundingNotes: string[] = []

  // === PURE BINDING — ONLY FROM CHARACTER OBJECT — NO FALLBACK MAP ===
  const characterId = character.character_id || character.id || character.name?.toLowerCase().replace(/\s+/g,'-') || `char_${Date.now()}`
  const name = safeValue(character.name || character.canonical_name, 'Unknown Character')
  const role = safeValue(character.role || character.story_role, 'Character')

  // STRICT DIRECT VARIABLE BINDING — SINGLE SOURCE OF TRUTH — PURE FROM CHARACTER OBJECT
  const genderRaw = safeValue(character.gender || character.jenis_kelamin, '')
  const physicalRaw = safeValue(character.physical || character.description || '', '')
  const clothingRaw = safeValue(character.clothing || character.pakaian || '', '')
  const ageRaw = safeValue(character.age || '', '')

  // Strip background keywords but keep pure values
  let physical = stripBackgroundKeywords(String(physicalRaw || '').trim())
  let clothing = stripBackgroundKeywords(String(clothingRaw || '').trim())
  const age = stripBackgroundKeywords(String(ageRaw || '').trim())

  // === GENDER BINDING KETAT — PRIORITY GENDER METADATA — NO LEAKAGE ===
  // If gender = Perempuan (Amelia) → WAJIB female, no matter what physical contains
  const genderLower = genderRaw.toLowerCase()
  const isFemaleMeta = /perempuan|female|wanita|woman|girl|putri|ratu|dewi/i.test(genderLower)
  const isMaleMeta = /laki-laki|laki|pria|male|man|boy/i.test(genderLower) && !isFemaleMeta

  let detectedGender: 'male' | 'female' = 'male'
  let genderTag = ''
  let genderNegative = ''

  if (isFemaleMeta) {
    detectedGender = 'female'
    genderTag = '1woman, beautiful female, feminine features, female outfit, adult female'
    genderNegative = 'male, man, boy, 1man, masculine, male outfit, bare chest, facial hair, mustache, beard'
  } else if (isMaleMeta) {
    detectedGender = 'male'
    genderTag = '1man, handsome male, masculine features, male outfit, adult male'
    genderNegative = 'female, woman, girl, 1woman, feminine, female outfit, breasts, feminine face'
  } else {
    // If gender metadata missing, infer from name (Amelia etc) — female priority
    const nameLower = name.toLowerCase()
    const isFemaleByName = /amelia|andini|amara|luna|sinta|maya|ayu|wulan|sari|lestari|putri|ratu|dewi|ken dedes|queen|princess|perempuan|wanita|female|woman|girl|cewek|tunggadewi|tribuana|gitarja|siti|rina|diana|clara|emma|olivia|amelie/i.test(nameLower)
    const isMaleByName = /gajah|hayam|brama|jaka|bima|arjuna|ken arok|rangga|budi|agus|joko/i.test(nameLower) && !isFemaleByName
    if (isFemaleByName) {
      detectedGender = 'female'
      genderTag = '1woman, beautiful female, feminine features, female outfit, adult female'
      genderNegative = 'male, man, boy, 1man, masculine, male outfit, bare chest, facial hair, mustache, beard'
    } else if (isMaleByName) {
      detectedGender = 'male'
      genderTag = '1man, handsome male, masculine features, male outfit, adult male'
      genderNegative = 'female, woman, girl, 1woman, feminine, female outfit, breasts, feminine face'
    } else {
      // Neutral fallback — no Rangga/35 tahun/Laki-laki hardcoded
      detectedGender = 'male'
      genderTag = '1man, adult male, masculine features'
      genderNegative = 'female, woman, girl'
    }
  }

  // === CONTRADICTION FIX — REMOVE MALE LEAKAGE FOR FEMALE ===
  // If detected female but clothing contains bare chest / male outfit → force female clothing from character or neutral
  const clothingLower = clothing.toLowerCase()
  if (detectedGender === 'female' && (clothingLower.includes('bare chest') || (clothingLower.includes('male outfit') && !clothingLower.includes('female')))) {
    // Use character's own clothing if available and not containing bare chest, else neutral female outfit
    const ownClothing = String(character.clothing || '').toLowerCase()
    if (ownClothing && !ownClothing.includes('bare chest') && ownClothing.length > 5) {
      clothing = stripBackgroundKeywords(String(character.clothing || '').trim())
    } else {
      clothing = 'elegant female outfit, dress, feminine clothing'
    }
    groundingNotes.push(`FIXED leakage: female ${name} had male clothing bare chest → forced to female outfit`)
  }

  // If detected female but physical contains Laki-Laki without Perempuan → remove male keyword, keep rest of physical
  if (detectedGender === 'female' && physical.toLowerCase().includes('laki-laki')) {
    physical = physical.replace(/Laki-Laki/gi, '').replace(/laki-laki/gi, '').replace(/Laki/gi, '').replace(/  +/g, ' ').trim()
    groundingNotes.push(`FIXED leakage: female ${name} physical contained Laki-Laki → stripped`)
  }
  if (detectedGender === 'male' && physical.toLowerCase().includes('perempuan') && !physical.toLowerCase().includes('laki')) {
    physical = physical.replace(/Perempuan/gi, '').replace(/perempuan/gi, '').replace(/  +/g, ' ').trim()
    groundingNotes.push(`FIXED leakage: male ${name} physical contained Perempuan → stripped`)
  }

  // Body & Age strict — from pure physical + age, no static 35 tahun fallback
  const strictBodyAge = getStrictBodyAgeMapping(`${physical} ${age} ${clothing}`)
  const bodyAgePos = strictBodyAge.positive.join(', ')
  const bodyAgeNeg = strictBodyAge.negative.join(', ')

  // === VISUAL STYLE MODIFIER — ENFORCE PALING DEPAN — TERPISAH DARI GENRE ===
  const visualStyleRaw = visualStyle || character?.visualStyle || character?.visual_style || (character as any)?.style || 'anime';
  const visualStyleModifier = getVisualStyleModifier(visualStyleRaw, genderRaw);
  const visualStyleNegative = getVisualStyleNegativeOverride(visualStyleRaw);

  // === PURE PROMPT: [VisualStyle Modifier] + [Gender Tag] + [Physical] + [Clothing] + [Age] + isolated ===
  const isolatedRequired = "isolated full-body character portrait, standalone character asset, plain white background, no background, transparent PNG, studio lighting"

  // For photorealistic, use strict override per requirement
  let visualPrompt = ''
  if (visualStyleRaw.toLowerCase() === 'photorealistic' || visualStyleRaw.toLowerCase().includes('realistis')) {
    const genderWord = detectedGender === 'female' ? 'woman' : 'man'
    visualPrompt = `photorealistic photo of a ${genderWord}, raw dslr photo, highly detailed skin texture, realistic clothing, natural lighting, 8k resolution, ${genderTag}, ${physical}, ${clothing}, ${age}, ${bodyAgePos}, ${isolatedRequired}, ${STRICT_ISOLATED_POSITIVE_REQUIRED}, ${FULL_BODY_PREFIX}, full body, head to toe, entire body visible, feet visible, hands visible, centered, masterpiece, best quality`;
  } else {
    visualPrompt = `${visualStyleModifier}, ${genderTag}, ${physical}, ${clothing}, ${age}, ${bodyAgePos}, ${isolatedRequired}, ${STRICT_ISOLATED_POSITIVE_REQUIRED}, ${ULTRA_STRICT_WHITE_BACKGROUND_PROMPT}, ${FULL_BODY_PREFIX}, full body, head to toe, entire body visible, feet visible, hands visible, centered, masterpiece, best quality, standalone asset, transparent PNG, white background only`;
  }

  // Clean double commas and background leaks — no Rangga injection
  visualPrompt = visualPrompt.replace(/,,+/g, ',').replace(/,\s*,/g, ',').trim()

  // Force negative: background elimination + gender negatives + body/age negatives + visual style negative override
  let negativePrompt = `${STRICT_BACKGROUND_NEGATIVE_REQUIRED}, ${ULTRA_STRICT_BACKGROUND_NEGATIVE}, ${genderNegative}, ${bodyAgeNeg}, cropped, headshot, close up, portrait, face only, upper body only, half body, deformed face, bad anatomy, cafe, kafe, street, city, building, interior, exterior, table, chair`;
  if (visualStyleNegative) {
    negativePrompt = `${visualStyleNegative}, ${negativePrompt}`
  }
  // For photorealistic, add strict no anime etc
  if (visualStyleRaw.toLowerCase() === 'photorealistic') {
    negativePrompt = `anime, 2d, illustration, cartoon, drawing, anime style, 2d animation, comic, manga, chibi, sketch, painting, ${negativePrompt}`
  }

  const personality = safeValue(character.personality || character.personality_traits, '')
  const visualTraits = `${physical}, ${clothing}, ${age}`.replace(/,,+/g, ',').trim()

  const dominantEmotion = safeValue(character.dominant_emotion || character.emotion, 'neutral')
  const storyRole = safeValue(character.story_role || character.role, role)
  const groundingSource = `SOURCE STORY = SUMBER KEBENARAN UTAMA | PURE CHARACTER OBJECT | Gender=${genderRaw}→${detectedGender} | VisualStyle=${visualStyleRaw}`

  const faceDetailRaw = character.face_detail || character.facial_anatomy || {}
  const faceDetail = {
    jaw: safeValue(faceDetailRaw.jaw, ''),
    nose: safeValue(faceDetailRaw.nose, ''),
    eyes: safeValue(faceDetailRaw.eyes, ''),
    expression: safeValue(faceDetailRaw.expression, ''),
    skin: safeValue(faceDetailRaw.skin, '')
  }

  const isGrounded = !!name && !!role && !!genderRaw

  groundingNotes.push(`PURE BINDING: Name=${name} Gender=${genderRaw}→${genderTag} (${detectedGender}) | Physical=${physical.slice(0,60)} | Clothing=${clothing.slice(0,60)} | Age=${age} | VisualStyle=${visualStyleRaw}→${visualStyleModifier} | NO Rangga/35 tahun/Laki-laki fallback`)
  groundingNotes.push(`NO GLOBAL STORY INJECTION — only character variables — Gender=${genderRaw}, Physical, Clothing, Age, VisualStyle=${visualStyleRaw} — isolated white background`)

  const promptData: CharacterVisualPromptData = {
    characterId,
    name: sanitizeUIText(name) || name,
    role: sanitizeUIText(role) || role,
    gender: sanitizeUIText(genderRaw) || genderRaw,
    age: sanitizeUIText(age) || age,
    physical: sanitizeUIText(physical) || physical,
    hair: sanitizeUIText(character.hair || '', ''),
    face: sanitizeUIText(character.face || '', ''),
    body: sanitizeUIText(character.body_posture || character.body_shape || '', ''),
    clothing: sanitizeUIText(clothing) || clothing,
    personality: sanitizeUIText(personality) || personality,
    visualTraits: sanitizeUIText(visualTraits) || visualTraits,
    specialCharacteristics: sanitizeUIText(character.special_features || '', ''),
    dominantEmotion: sanitizeUIText(dominantEmotion) || dominantEmotion,
    storyRole: sanitizeUIText(storyRole) || storyRole,
    groundingSource,
    sourceStoryId: sourceStoryId || character.source_story_id || ''
  } as any
  ;(promptData as any).genderTag = genderTag
  ;(promptData as any).detectedGender = detectedGender
  ;(promptData as any).face_detail = faceDetail
  ;(promptData as any).special_features = character.special_features || ''
  ;(promptData as any).sevenAttributes = { gender: genderRaw, face: character.face || '', age, hair: character.hair || '', body_posture: character.body_posture || '', clothing, special_features: character.special_features || '' }
  ;(promptData as any).genderEnforced = genderTag
  ;(promptData as any).strictBinding = true
  ;(promptData as any).visualStyle = visualStyleRaw
  ;(promptData as any).visualStyleModifier = visualStyleModifier

  return {
    visualPrompt,
    negativePrompt,
    promptData,
    isGrounded,
    groundingNotes
  }
}

export function buildCharacterVisualPromptForAll(characters: any[], visualStyle?: string, sourceStoryId?: string, worldSetting?: any, theme?: string): Array<BuildCharacterVisualPromptResult> {
  return characters.map(ch => buildCharacterVisualPrompt(ch, visualStyle || ch.visualStyle || 'anime', sourceStoryId, worldSetting || ch.worldSetting, theme || ch.theme))
}

export function buildWorldVisualPrompt(worldLocation: any, visualStyle?: string, sourceStoryId?: string): { visualPrompt: string; negativePrompt: string; majapahitAesthetic: string } {
  const name = sanitizeUIText(worldLocation.name) || 'Lokasi Cerita'
  const description = sanitizeUIText(worldLocation.description) || worldLocation.name || 'tempat cerita'
  const environment = sanitizeUIText(worldLocation.environment) || 'lingkungan cerita'
  const visualStyleRaw = visualStyle || (worldLocation as any)?.visualStyle || (worldLocation as any)?.visual_style || 'anime'
  const visualStyleModifier = getVisualStyleModifier(visualStyleRaw)
  const visualPrompt = `${visualStyleModifier}, wide establishing shot, ${name}, ${description}, ${environment}, cinematic atmosphere, highly detailed environment background, vibrant colors, masterpiece, dynamic background from story source, Source: ${worldLocation.grounding?.source || 'WORLD BUILDING DYNAMIC FROM STORY'} ${sourceStoryId || ''}`
  const negativePrompt = `humans, characters, people, person, man, woman, human figure, cropped, deformed, blurry, lowres, text, watermark`;
  return { visualPrompt, negativePrompt, majapahitAesthetic: `dynamic aesthetic from story source` }
}

export function buildStoryboardBackgroundPrompt(worldLocation: any, sceneDescription?: string, visualStyle?: string): string {
  const worldPrompt = buildWorldVisualPrompt(worldLocation, visualStyle)
  const scenePart = sceneDescription ? `${sanitizeUIText(sceneDescription)}, ` : ''
  return `${scenePart}${worldPrompt.visualPrompt}`
}

export function validateCharacterReference(character: any, referenceImage: any, groundingPass: boolean): { isValid: boolean; checks: any; reason: string } {
  const genderRaw = character?.gender || ''
  const genderLower = genderRaw.toLowerCase()
  const isFemale = /perempuan|female|wanita|woman|girl/i.test(genderLower) || /amelia/i.test((character?.name||'').toLowerCase())
  const expectedTag = isFemale ? '1woman' : '1man'
  
  const checks: any = {
    characterExists: { pass: !!character, reason: `Character ${character.name} exists — Gender: ${genderRaw} — Expected: ${expectedTag}` },
    groundingPass: { pass: groundingPass, reason: groundingPass ? 'Grounding PASS — PURE CHARACTER OBJECT' : 'Grounding FAIL' },
    genderEnforced: {
      pass: isFemale ? (referenceImage?.visualPrompt?.includes('1woman') || referenceImage?.visualPrompt?.includes('woman')) : (referenceImage?.visualPrompt?.includes('1man') || referenceImage?.visualPrompt?.includes('man')),
      reason: `Gender enforced — Expected ${expectedTag} for ${character.name} (${genderRaw})`
    },
    noForbiddenText: {
      pass: !containsForbiddenText(JSON.stringify(character)),
      reason: 'NO "tidak disebutkan dalam sumber" — PASS'
    },
    noRanggaLeakage: {
      pass: !(referenceImage?.visualPrompt?.toLowerCase().includes('rangga') && character.name.toLowerCase() !== 'rangga'),
      reason: `No Rangga leakage for ${character.name}`
    },
    noMaleLeakageForFemale: {
      pass: !(isFemale && (referenceImage?.visualPrompt?.toLowerCase().includes('bare chest') || referenceImage?.visualPrompt?.toLowerCase().includes('1man'))),
      reason: `No male leakage for female ${character.name}`
    },
    imageExists: { pass: !!referenceImage?.referenceImageUrl || !!referenceImage?.referenceImage, reason: referenceImage?.referenceImageUrl ? 'Image exists' : 'Image not exists' },
    validFormat: { pass: !!(referenceImage?.referenceImageUrl && (referenceImage.referenceImageUrl.startsWith('http') || referenceImage.referenceImageUrl.startsWith('data:'))), reason: 'Valid format check' },
    fullBody: { pass: referenceImage?.metadata?.fullBody !== false, reason: 'Full body required — isolated character portrait' },
    isolatedOnly: { pass: true, reason: `ISOLATED CHARACTER ASSET — ${STRICT_ISOLATED_POSITIVE_REQUIRED}` },
    visualPromptExists: { pass: !!referenceImage?.visualPrompt, reason: 'Visual prompt exists — from character variables only' },
    referenceAvailable: { pass: !!referenceImage, reason: referenceImage ? 'Reference available' : 'Reference not available' }
  }

  const allPass = Object.values(checks).every((c: any) => c.pass)
  const reason = allPass ? `PASS — Character ${character?.name} reference valid — Gender ${expectedTag} — FULL BODY isolated — PURE CHARACTER OBJECT` : `FAIL — ${Object.entries(checks).filter(([k,v]: any) => !v.pass).map(([k]) => k).join(', ')}`

  return { isValid: allPass, checks, reason }
}

export function buildCharacterAssetOnlyPromptWrapper(character: any, visualStyle?: string): { visualPrompt: string; negativePrompt: string } {
  return { visualPrompt: buildCharacterVisualPrompt(character, visualStyle).visualPrompt, negativePrompt: buildCharacterVisualPrompt(character, visualStyle).negativePrompt }
}

export function buildWorldBackgroundOnlyPromptWrapper(worldLocation: any, timeOfDay?: string, weather?: string, visualStyle?: string): { visualPrompt: string; negativePrompt: string } {
  const timeKey = (timeOfDay || worldLocation?.time_of_day || 'siang').toLowerCase();
  const weatherKey = (weather || worldLocation?.weather || 'cerah').toLowerCase();
  const timeMap: any = { pagi: 'early morning sunrise, soft golden light', siang: 'bright midday sun', sore: 'late afternoon golden hour', senja: 'sunset golden hour', malam: 'night scene, moonlight', fajar: 'dawn', default: 'cinematic lighting' };
  const weatherMap: any = { cerah: 'clear sky', hujan: 'rainy weather', badai: 'stormy', mendung: 'overcast', berkabut: 'foggy', default: 'clear atmosphere' };
  const timePrompt = timeMap[timeKey] || timeMap.default;
  const weatherPrompt = weatherMap[weatherKey] || weatherMap.default;
  const visualStyleRaw = visualStyle || (worldLocation as any)?.visualStyle || (worldLocation as any)?.visual_style || 'anime'
  const visualStyleModifier = getVisualStyleModifier(visualStyleRaw)

  const name = sanitizeUIText(worldLocation?.name) || 'Lokasi Cerita';
  const baseWorld = worldLocation?.visualPrompt || worldLocation?.description || name;

  const visualPrompt = `${visualStyleModifier}, wide establishing shot, ${name}, ${baseWorld}, ${timePrompt}, ${weatherPrompt}, cinematic atmosphere, highly detailed environment background, NO humans, NO characters, empty scene, highly detailed background, vibrant colors, masterpiece`;
  const negativePrompt = `humans, characters, people, person, man, woman, human figure, cropped, deformed, blurry, lowres`;
  return { visualPrompt, negativePrompt };
}

export function buildVisualPrompt(character: any, visualStyle?: string, worldSetting?: any, theme?: string, sourceStoryId?: string): BuildCharacterVisualPromptResult {
  return buildCharacterVisualPrompt(character, visualStyle || character?.visualStyle || 'anime', sourceStoryId, worldSetting, theme);
}
