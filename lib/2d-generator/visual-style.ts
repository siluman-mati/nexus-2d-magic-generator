// NEXUS — Visual Style Strict Injection — PREFIX positive + automatic negative override

import { VisualStyleDefinition, VisualStyleId } from './types';

export const VISUAL_STYLES: VisualStyleDefinition[] = [
  {
    id: 'anime',
    label: 'Anime / 2D Studio',
    icon: '🎨',
    positivePrefix: 'anime style, 2d animation, clean lines, vibrant colors, studio ghibli style',
    negativeOverride: 'photorealistic, 3d render, raw photo, dslr, realistic, photo, --no photorealistic, 3d render, photo',
  },
  {
    id: 'photorealistic',
    label: 'Photorealistic',
    icon: '📸',
    positivePrefix: 'photorealistic photo of a {gender}, raw dslr photo, highly detailed skin texture, realistic clothing, natural lighting, 8k resolution',
    negativeOverride: 'anime, 2d, illustration, cartoon, drawing, anime style, 2d animation, comic, manga, chibi, sketch, painting, --no anime, 2d, illustration, cartoon, drawing, painting',
  },
  {
    id: '3d_animation',
    label: '3D Animation',
    icon: '🧊',
    positivePrefix: '3d render, pixar style, smooth shading, expressive 3d character, octane render, unreal engine',
    negativeOverride: '2d, flat, anime, drawing, photo, photorealistic, --no 2d, flat, anime, drawing',
  },
  {
    id: 'semi_realistic',
    label: 'Semi-Realistic',
    icon: '🖌️',
    positivePrefix: 'digital painting, semi-realistic, artstation trending, detailed, realistic proportions, soft shading',
    negativeOverride: 'chibi, cartoon, low detail, --no chibi, cartoon',
  },
  {
    id: 'comic_book',
    label: 'Comic Book',
    icon: '💥',
    positivePrefix: 'comic book style, bold outlines, graphic novel aesthetic, vibrant comic colors, halftone',
    negativeOverride: 'photorealistic, 3d render, photo, realistic, --no photorealistic, 3d render, photo',
  },
  {
    id: 'dark_fantasy',
    label: 'Dark Fantasy',
    icon: '🌑',
    positivePrefix: 'dark fantasy style, cinematic lighting, moody atmosphere, dramatic shadows, epic fantasy',
    negativeOverride: 'bright, cheerful, cartoon, chibi, --no bright, cheerful, cartoon, chibi',
  },
];

export function getVisualStyleDef(style: string = 'anime'): VisualStyleDefinition {
  const normalized = (style || 'anime').toLowerCase().trim() as VisualStyleId;
  const found = VISUAL_STYLES.find(v => v.id === normalized);
  if (found) return found;
  // check by label contains
  const byLabel = VISUAL_STYLES.find(v => normalized.includes(v.id) || v.label.toLowerCase().includes(normalized));
  if (byLabel) return byLabel;
  return VISUAL_STYLES[0]; // anime default
}

export function getVisualStyleModifier(style: string = 'anime', gender: string = ''): string {
  const def = getVisualStyleDef(style);
  const genderLower = (gender || '').toLowerCase();
  const isFemale = /perempuan|female|wanita|woman|girl|putri|ratu|dewi/i.test(genderLower);
  const genderWord = isFemale ? 'woman' : 'man';
  
  if (def.id === 'photorealistic') {
    return def.positivePrefix.replace('{gender}', genderWord);
  }
  return def.positivePrefix;
}

export function getVisualStyleNegative(style: string = 'anime'): string {
  const def = getVisualStyleDef(style);
  return def.negativeOverride;
}

export function buildPromptWithVisualStyle(params: {
  userPrompt: string;
  visualStyle: string;
  gender?: string;
  characterContext?: { gender: string; physical: string; clothing: string; age: string; name: string };
}): { positive: string; negative: string; modifier: string; negativeOverride: string } {
  const modifier = getVisualStyleModifier(params.visualStyle, params.gender || params.characterContext?.gender || '');
  const negativeOverride = getVisualStyleNegative(params.visualStyle);
  
  // STRICT: visualStyle as PREFIX at frontmost position — with FALLBACK GENDER VALUE per fix INVALID_INPUT
  let positive = '';
  if (params.characterContext) {
    const { gender, physical, clothing, age, name } = params.characterContext;
    // Fallback gender inference: pemuda/pria/laki-laki/Rangga -> Laki-Laki, gadis/wanita/perempuan/Amelia/Siti -> Perempuan
    const combinedForGender = `${name || ''} ${gender || ''} ${physical || ''} ${clothing || ''}`.toLowerCase();
    const isFemaleByFallback = /perempuan|wanita|gadis|cewek|female|woman|girl|putri|ratu|dewi|amelia|siti|ayu|sari|maya|luna|sinta|andini|amara|lestari|wulan|rina|diana|clara|emma|olivia|amelie|tribuana|tunggadewi|gitarja|ken dedes/i.test(combinedForGender);
    const isMaleByFallback = /laki-laki|laki|pria|pemuda|male|man|boy|rangga|arga|budi|joko|gajah mada|hayam wuruk|ken arok|suharto|soeharto|soekarno|sukarno/i.test(combinedForGender);
    let genderTag = '';
    if (/perempuan|female|wanita/i.test((gender || '').toLowerCase()) || isFemaleByFallback) {
      genderTag = '1woman, beautiful female, feminine features, female outfit, adult female';
    } else if (/laki-laki|laki|pria|male|man|boy/i.test((gender || '').toLowerCase()) || isMaleByFallback || !isFemaleByFallback) {
      // Default to male if not clearly female, but prefer female if fallback says female
      if (isFemaleByFallback && !isMaleByFallback) genderTag = '1woman, beautiful female, feminine features, female outfit, adult female';
      else genderTag = '1man, handsome male, masculine features, male outfit, adult male';
    } else {
      genderTag = isFemaleByFallback ? '1woman, beautiful female, feminine features, female outfit, adult female' : '1man, handsome male, masculine features, male outfit, adult male';
    }
    
    // Pure binding — only from character object
    const physicalClean = (physical || '').trim();
    const clothingClean = (clothing || '').trim();
    const ageClean = (age || '').trim();
    
    // Photorealistic strict override per spec
    if (params.visualStyle.toLowerCase() === 'photorealistic' || params.visualStyle.toLowerCase().includes('realistis')) {
      const genderWord = /perempuan|female|wanita|woman|girl/i.test((gender || '').toLowerCase()) ? 'woman' : 'man';
      positive = `photorealistic photo of a ${genderWord}, raw dslr photo, highly detailed skin texture, realistic clothing, natural lighting, 8k resolution, ${genderTag}, ${physicalClean}, ${clothingClean}, ${ageClean}, ${params.userPrompt}, isolated full-body character portrait, standalone character asset, plain white background, no background, transparent PNG, studio lighting, full body, head to toe, entire body visible`;
    } else {
      positive = `${modifier}, ${genderTag}, ${physicalClean}, ${clothingClean}, ${ageClean}, ${params.userPrompt}, isolated full-body character portrait, standalone character asset, plain white background, no background, transparent PNG, studio lighting, full body, head to toe`;
    }
  } else {
    positive = `${modifier}, ${params.userPrompt}`;
  }
  
  // Clean double commas
  positive = positive.replace(/,,+/g, ',').replace(/,\s*,/g, ',').trim();
  
  let negative = negativeOverride;
  if (params.visualStyle.toLowerCase() === 'photorealistic') {
    negative = `anime, 2d, illustration, cartoon, drawing, anime style, 2d animation, comic, manga, chibi, sketch, painting, ${negative}`;
  } else if (params.visualStyle.toLowerCase() === 'anime') {
    negative = `photorealistic, 3d render, raw photo, dslr, realistic, photo, ${negative}`;
  }
  
  return { positive, negative, modifier, negativeOverride };
}
