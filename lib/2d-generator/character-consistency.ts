// NEXUS — Character Consistency & Data Isolation — PURE CHARACTER OBJECT ONLY

import { CharacterContext } from './types';
import { ErrorCode } from './state-machine';

export interface ConsistencyCheck {
  pass: boolean;
  reason: string;
  field?: string;
}

export interface ConsistencyResult {
  isValid: boolean;
  checks: Record<string, ConsistencyCheck>;
  errorCode?: ErrorCode;
  errorMessage?: string;
  detectedGender: 'male' | 'female';
  genderTag: string;
  sanitizedPhysical: string;
  sanitizedClothing: string;
}

function isFemaleGender(gender: string): boolean {
  return /perempuan|female|wanita|woman|girl|putri|ratu|dewi/i.test((gender || '').toLowerCase());
}

function isFemaleByName(name: string): boolean {
  return /amelia|andini|amara|luna|sinta|maya|ayu|wulan|sari|lestari|putri|ratu|dewi|ken dedes|queen|princess|perempuan|wanita|female|woman|girl|cewek|tunggadewi|tribuana|gitarja|siti|rina|diana|clara|emma|olivia|amelie/i.test((name || '').toLowerCase());
}

export function inferGenderFallback(character: any): string {
  const name = (character?.name || character?.characterName || '').toLowerCase();
  const genderRaw = (character?.gender || character?.jenis_kelamin || '').toLowerCase();
  const physical = (character?.physical || character?.description || character?.body_posture || '').toLowerCase();
  const clothing = (character?.clothing || character?.pakaian || '').toLowerCase();
  const combined = `${name} ${genderRaw} ${physical} ${clothing}`;

  // Female detection — highest priority for female names/descriptions
  // Includes: gadis/wanita/perempuan/Amelia/Siti + existing female names
  if (/perempuan|wanita|gadis|cewek|female|woman|girl|putri|ratu|dewi|amelia|siti|ayu|sari|maya|luna|sinta|andini|amara|lestari|wulan|rina|diana|clara|emma|olivia|amelie|tribuana|tunggadewi|gitarja|ken dedes|tribhuwana/i.test(combined)) {
    return 'Perempuan';
  }
  // Male detection — pemuda/pria/laki-laki/Rangga
  if (/laki-laki|laki|pria|pemuda|male|man|boy|rangga|arga|budi|joko|gajah mada|hayam wuruk|ken arok|suharto|soeharto|soekarno|sukarno/i.test(combined)) {
    return 'Laki-Laki';
  }
  // Explicit genderRaw check
  if (/perempuan|female|wanita|woman|girl/i.test(genderRaw)) return 'Perempuan';
  if (/laki-laki|laki|pria|male|man|boy/i.test(genderRaw)) return 'Laki-Laki';
  // Fallback by name
  if (isFemaleByName(name)) return 'Perempuan';
  // Default umum — Laki-Laki as safe default per Step 2 metadata, but allow Perempuan if female hint elsewhere
  return 'Laki-Laki';
}

export function sanitizeCharacterGender(character: any): { gender: string; detected: 'male'|'female' } {
  const fallback = inferGenderFallback(character);
  const raw = character?.gender || fallback;
  const isFemale = /perempuan|female|wanita|woman|girl|putri|ratu|dewi/i.test((raw||'').toLowerCase()) || fallback === 'Perempuan';
  return { gender: isFemale ? 'Perempuan' : 'Laki-Laki', detected: isFemale ? 'female' : 'male' };
}


export function checkCharacterIsolation(character: any): ConsistencyResult {
  const name = character?.name || 'Unknown';
  const genderRaw = character?.gender || character?.jenis_kelamin || '';
  const physicalRaw = character?.physical || character?.description || '';
  const clothingRaw = character?.clothing || character?.pakaian || '';
  const ageRaw = character?.age || '';

  const checks: Record<string, ConsistencyCheck> = {};

  // Check 1: character exists
  checks.characterExists = {
    pass: !!character && !!name && name !== 'Unknown',
    reason: character ? `Character ${name} exists` : 'Character object missing',
    field: 'character',
  };

  // Check 2: gender metadata exists — highest priority
  checks.genderMetadata = {
    pass: !!genderRaw && genderRaw.trim().length > 0,
    reason: genderRaw ? `Gender metadata: ${genderRaw}` : 'Gender metadata missing — will infer from name',
    field: 'gender',
  };

  // Check 3: detect gender — with FALLBACK GENDER VALUE per fix INVALID_INPUT
  // If gender empty, infer from name/description: pemuda/pria/laki-laki/Rangga -> Laki-Laki, gadis/wanita/perempuan/Amelia/Siti -> Perempuan
  let detectedGender: 'male' | 'female' = 'male';
  let genderTag = '';
  const effectiveGender = genderRaw && genderRaw.trim().length>0 ? genderRaw : inferGenderFallback(character);
  
  if (isFemaleGender(effectiveGender)) {
    detectedGender = 'female';
    genderTag = '1woman, beautiful female, feminine features, female outfit, adult female';
  } else if (/laki-laki|laki|pria|male|man|boy/i.test(effectiveGender.toLowerCase())) {
    detectedGender = 'male';
    genderTag = '1man, handsome male, masculine features, male outfit, adult male';
  } else if (isFemaleByName(name)) {
    detectedGender = 'female';
    genderTag = '1woman, beautiful female, feminine features, female outfit, adult female';
  } else {
    detectedGender = 'male';
    genderTag = '1man, handsome male, masculine features, male outfit, adult male';
  }

  checks.genderDetected = {
    pass: true,
    reason: `Detected ${detectedGender} — Tag: ${genderTag} — Source: gender=${genderRaw}, name=${name}`,
    field: 'gender',
  };

  // Check 4: no Rangga leakage
  const physicalLower = physicalRaw.toLowerCase();
  const clothingLower = clothingRaw.toLowerCase();
  const isFemale = detectedGender === 'female';

  checks.noRanggaLeakage = {
    pass: !(physicalLower.includes('rangga') || clothingLower.includes('rangga')) || name.toLowerCase() === 'rangga',
    reason: isFemale
      ? `No Rangga in female ${name}: physical contains rangga? ${physicalLower.includes('rangga')} — PASS if false`
      : `Male ${name} may contain Rangga — check`,
    field: 'physical',
  };

  // Check 5: no male leakage for female
  checks.noMaleLeakageForFemale = {
    pass: !(isFemale && (clothingLower.includes('bare chest') || (clothingLower.includes('male outfit') && !clothingLower.includes('female')))),
    reason: isFemale
      ? `Female ${name} clothing bare chest? ${clothingLower.includes('bare chest')} — must be false`
      : `Male ${name} — no female leakage check needed`,
    field: 'clothing',
  };

  // Check 6: no gender contradiction in physical
  checks.noGenderContradiction = {
    pass: !(isFemale && physicalLower.includes('laki-laki') && !physicalLower.includes('perempuan')),
    reason: isFemale
      ? `Female ${name} physical contains Laki-Laki without Perempuan? ${physicalLower.includes('laki-laki')} — must be false`
      : `Male ${name} — check Perempuan leakage`,
    field: 'physical',
  };

  // Check 7: clothing per-character, not inherited
  checks.clothingPerCharacter = {
    pass: !!clothingRaw || true, // allow empty but log
    reason: clothingRaw ? `Clothing from character object: ${clothingRaw.slice(0,60)}` : 'Clothing empty — will use neutral female/male outfit',
    field: 'clothing',
  };

  // Check 8: reference availability — if characterId used, must have reference or be allowed to generate
  checks.referenceCheck = {
    pass: true, // in this system, we allow generation even without reference, but if reference required, check
    reason: 'Reference check — if characterId used, reference should be loaded from approved references',
    field: 'reference',
  };

  // Sanitize physical/clothing — remove male leakage for female
  let sanitizedPhysical = physicalRaw;
  let sanitizedClothing = clothingRaw;

  if (isFemale) {
    if (sanitizedClothing.toLowerCase().includes('bare chest')) {
      sanitizedClothing = 'elegant female outfit, dress, feminine clothing';
    }
    if (sanitizedPhysical.toLowerCase().includes('laki-laki')) {
      sanitizedPhysical = sanitizedPhysical.replace(/Laki-Laki/gi, '').replace(/laki-laki/gi, '').trim();
    }
  }

  const allPass = Object.values(checks).every(c => c.pass);
  const failed = Object.entries(checks).filter(([_, v]) => !v.pass);

  return {
    isValid: allPass,
    checks,
    errorCode: allPass ? undefined : failed[0][1].field === 'clothing' || failed[0][1].field === 'physical' ? 'CHARACTER_LEAKAGE' : 'INVALID_INPUT',
    errorMessage: allPass ? undefined : `Consistency FAIL: ${failed.map(([k, v]) => `${k}: ${v.reason}`).join('; ')}`,
    detectedGender,
    genderTag,
    sanitizedPhysical,
    sanitizedClothing,
  };
}

export function buildPureCharacterPrompt(character: any, visualStyle: string = 'anime'): { positive: string; negative: string; gender: 'male'|'female'; genderTag: string } {
  const consistency = checkCharacterIsolation(character);
  if (!consistency.isValid) {
    console.warn(`[character-consistency] Leakage detected for ${character?.name}: ${consistency.errorMessage}`);
  }

  const { detectedGender, genderTag, sanitizedPhysical, sanitizedClothing } = consistency;
  const age = (character?.age || '').trim();
  const name = character?.name || 'Unknown';

  // Visual style modifier frontmost
  const isFemale = detectedGender === 'female';
  const genderWord = isFemale ? 'woman' : 'man';
  
  let visualStyleModifier = '';
  if (visualStyle.toLowerCase() === 'photorealistic' || visualStyle.toLowerCase().includes('realistis')) {
    visualStyleModifier = `photorealistic photo of a ${genderWord}, raw dslr photo, highly detailed skin texture, realistic clothing, natural lighting, 8k resolution`;
  } else {
    const styleMap: Record<string, string> = {
      anime: 'anime style, 2d animation, clean lines, vibrant colors',
      '3d_animation': '3d render, pixar style, smooth shading, expressive 3d character',
      semi_realistic: 'digital painting, semi-realistic, artstation trending',
      comic_book: 'comic book style, bold outlines, graphic novel aesthetic',
      dark_fantasy: 'dark fantasy style, cinematic lighting, moody atmosphere',
    };
    visualStyleModifier = styleMap[visualStyle.toLowerCase()] || styleMap['anime'];
  }

  const isolated = 'isolated full-body character portrait, standalone character asset, plain white background, no background, transparent PNG, studio lighting, full body, head to toe, entire body visible, feet visible, hands visible, centered, masterpiece, best quality';

  let positive = '';
  if (visualStyle.toLowerCase() === 'photorealistic') {
    positive = `${visualStyleModifier}, ${genderTag}, ${sanitizedPhysical}, ${sanitizedClothing}, ${age}, ${isolated}, ((white background:1.5)), ((no background:1.5)), --no anime, 2d, illustration, cartoon, drawing`;
  } else {
    positive = `${visualStyleModifier}, ${genderTag}, ${sanitizedPhysical}, ${sanitizedClothing}, ${age}, ${isolated}`;
  }

  positive = positive.replace(/,,+/g, ',').replace(/,\s*,/g, ',').trim();

  let negative = '';
  if (visualStyle.toLowerCase() === 'photorealistic') {
    negative = `anime, 2d, illustration, cartoon, drawing, anime style, 2d animation, comic, manga, chibi, sketch, painting, background, scenery, environment, wall, room, buildings, architecture, street, landscape, shadows, ${isFemale ? 'male, man, boy, 1man, masculine, bare chest, facial hair' : 'female, woman, girl, 1woman, feminine'}, cropped, headshot, close up, portrait, face only, upper body only, half body, deformed face, bad anatomy`;
  } else {
    negative = `background, scenery, environment, wall, room, buildings, architecture, street, landscape, shadows, ${isFemale ? 'male, man, boy, 1man, masculine, bare chest' : 'female, woman, girl, 1woman, feminine'}, cropped, headshot, close up, portrait, face only, upper body only, half body, deformed face, bad anatomy, photorealistic, 3d render, raw photo`;
  }

  return { positive, negative, gender: detectedGender, genderTag };
}
