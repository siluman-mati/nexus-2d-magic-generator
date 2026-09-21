// NEXUS — Input Validation — Server-side re-validation

import { ErrorCode } from './state-machine';
import { NormalizedGenerationRequest, CharacterContext } from './types';

export interface ValidationResult {
  ok: boolean;
  errorCode?: ErrorCode;
  errorMessage?: string;
  field?: string;
}

export function validatePrompt(prompt: string): ValidationResult {
  if (!prompt || typeof prompt !== 'string') {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Prompt tidak boleh kosong', field: 'prompt' };
  }
  const trimmed = prompt.trim();
  if (trimmed.length < 3) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Prompt minimal 3 karakter', field: 'prompt' };
  }
  if (trimmed.length > 5000) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Prompt maksimal 5000 karakter', field: 'prompt' };
  }
  return { ok: true };
}

export function validateNegativePrompt(negative: string): ValidationResult {
  if (!negative) return { ok: true };
  if (negative.length > 2000) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Negative prompt maksimal 2000 karakter', field: 'negativePrompt' };
  }
  return { ok: true };
}

export function validateResolution(width: number, height: number): ValidationResult {
  if (!width || !height) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Resolution width/height wajib', field: 'resolution' };
  }
  if (width < 64 || width > 2048 || height < 64 || height > 2048) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Resolution harus 64-2048', field: 'resolution' };
  }
  if (width % 8 !== 0 || height % 8 !== 0) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Resolution harus kelipatan 8', field: 'resolution' };
  }
  return { ok: true };
}

export function validateAspectRatio(ratio: string): ValidationResult {
  if (!ratio) return { ok: true };
  const valid = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
  if (!valid.includes(ratio) && !/^\d+:\d+$/.test(ratio)) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: `Aspect ratio tidak valid: ${ratio}`, field: 'aspectRatio' };
  }
  return { ok: true };
}

export function validateSeed(seed?: number): ValidationResult {
  if (seed === undefined || seed === null) return { ok: true };
  if (typeof seed !== 'number' || isNaN(seed)) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Seed harus angka', field: 'seed' };
  }
  if (seed < 0 || seed > 2147483647) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Seed harus 0-2147483647', field: 'seed' };
  }
  return { ok: true };
}

export function validateSteps(steps?: number): ValidationResult {
  if (steps === undefined || steps === null) return { ok: true };
  if (typeof steps !== 'number' || isNaN(steps)) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Steps harus angka', field: 'steps' };
  }
  if (steps < 1 || steps > 50) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Steps harus 1-50', field: 'steps' };
  }
  return { ok: true };
}

// Fallback gender inference per fix INVALID_INPUT — never allow empty gender
function inferGenderFallbackForValidation(char: any): string {
  const name = (char?.name || '').toLowerCase();
  const genderRaw = (char?.gender || '').toLowerCase();
  const physical = (char?.physical || char?.description || '').toLowerCase();
  const clothing = (char?.clothing || '').toLowerCase();
  const combined = `${name} ${genderRaw} ${physical} ${clothing}`;
  if (/perempuan|wanita|gadis|cewek|female|woman|girl|amelia|siti|putri|ratu|dewi|ayu|sari|maya|luna|sinta|andini|amara|lestari|wulan|rina|diana|clara|emma|olivia|amelie|tribuana|tunggadewi|gitarja|ken dedes/i.test(combined)) return 'Perempuan';
  if (/laki-laki|laki|pria|pemuda|male|man|boy|rangga|arga|budi|joko|gajah mada|hayam wuruk|ken arok|suharto|soeharto|soekarno|sukarno/i.test(combined)) return 'Laki-Laki';
  if (/perempuan|female|wanita|woman|girl/i.test(genderRaw)) return 'Perempuan';
  if (/laki-laki|laki|pria|male|man|boy/i.test(genderRaw)) return 'Laki-Laki';
  if (/amelia|andini|amara|luna|sinta|maya|ayu|wulan|sari|lestari|putri|ratu|dewi|ken dedes|queen|princess|perempuan|wanita|female|woman|girl|cewek|tunggadewi|tribuana|gitarja|siti|rina|diana|clara|emma|olivia|amelie/i.test(name)) return 'Perempuan';
  return 'Laki-Laki';
}

export function validateCharacterContext(char: CharacterContext): ValidationResult {
  if (!char) {
    return { ok: false, errorCode: 'REFERENCE_MISSING', errorMessage: 'Character context tidak tersedia', field: 'characterId' };
  }
  if (!char.characterId || !char.name) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'CharacterId dan name wajib', field: 'characterId' };
  }
  // FALLBACK GENDER VALUE — ensure gender never empty, per fix INVALID_INPUT
  if (!char.gender || String(char.gender).trim().length===0) {
    const fallback = inferGenderFallbackForValidation(char);
    (char as any).gender = fallback;
    console.warn(`[validation] Gender empty for ${char.name} — fallback to ${fallback} — inferred from name/description`);
  }
  // Normalize gender to valid values
  const gLower = String(char.gender).toLowerCase();
  if (!/laki-laki|perempuan|male|female|pria|wanita/.test(gLower)) {
    const fallback = inferGenderFallbackForValidation(char);
    console.warn(`[validation] Gender invalid '${char.gender}' for ${char.name} — fallback to ${fallback}`);
    (char as any).gender = fallback;
  }
  // Pure binding check — ensure no leakage from other characters
  const forbiddenLeakage = ['Rangga', 'bare chest'];
  const charStr = `${char.physical} ${char.clothing}`.toLowerCase();
  const isFemale = /perempuan|female|wanita/i.test(char.gender.toLowerCase());
  if (isFemale && charStr.includes('bare chest')) {
    return { ok: false, errorCode: 'CHARACTER_LEAKAGE', errorMessage: `Leakage: female ${char.name} has bare chest male clothing`, field: 'clothing' };
  }
  if (isFemale && /laki-laki/.test(char.physical.toLowerCase()) && !/perempuan/.test(char.physical.toLowerCase())) {
    return { ok: false, errorCode: 'CHARACTER_LEAKAGE', errorMessage: `Leakage: female ${char.name} physical contains Laki-Laki`, field: 'physical' };
  }
  return { ok: true };
}

export function validateNormalizedRequest(req: NormalizedGenerationRequest): ValidationResult {
  const promptCheck = validatePrompt(req.userPrompt);
  if (!promptCheck.ok) return promptCheck;
  
  if (req.negativePrompt) {
    const negCheck = validateNegativePrompt(req.negativePrompt);
    if (!negCheck.ok) return negCheck;
  }
  
  const resCheck = validateResolution(req.constraints.width, req.constraints.height);
  if (!resCheck.ok) return resCheck;
  
  if (req.constraints.aspectRatio) {
    const arCheck = validateAspectRatio(req.constraints.aspectRatio);
    if (!arCheck.ok) return arCheck;
  }
  
  if (req.constraints.seed !== undefined) {
    const seedCheck = validateSeed(req.constraints.seed);
    if (!seedCheck.ok) return seedCheck;
  }
  
  if (req.constraints.steps !== undefined) {
    const stepsCheck = validateSteps(req.constraints.steps);
    if (!stepsCheck.ok) return stepsCheck;
  }
  
  if (req.characterContext) {
    const charCheck = validateCharacterContext(req.characterContext);
    if (!charCheck.ok) return charCheck;
  }
  
  if (!req.projectId) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'ProjectId wajib', field: 'projectId' };
  }
  
  if (!req.styleContext?.visualStyle) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'VisualStyle wajib', field: 'visualStyle' };
  }
  
  return { ok: true };
}

export function validateImageBuffer(buffer: Buffer, mime: string): ValidationResult {
  if (!buffer || buffer.length === 0) {
    return { ok: false, errorCode: 'INVALID_OUTPUT', errorMessage: 'Image buffer kosong', field: 'imageBuffer' };
  }
  if (buffer.length < 100) {
    return { ok: false, errorCode: 'INVALID_OUTPUT', errorMessage: 'Image buffer terlalu kecil, kemungkinan corrupt', field: 'imageBuffer' };
  }
  if (buffer.length > 20 * 1024 * 1024) {
    return { ok: false, errorCode: 'INVALID_OUTPUT', errorMessage: 'Image buffer terlalu besar >20MB', field: 'imageBuffer' };
  }
  const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (mime && !validMimes.includes(mime)) {
    return { ok: false, errorCode: 'INVALID_OUTPUT', errorMessage: `MIME tidak valid: ${mime}`, field: 'mimeType' };
  }
  return { ok: true };
}

export function validateReferenceImage(file: { size: number; type: string; name: string }): ValidationResult {
  if (!file) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Reference image tidak ada', field: 'referenceImage' };
  }
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: `Reference image terlalu besar: ${file.size} > ${maxSize}`, field: 'referenceImage' };
  }
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return { ok: false, errorCode: 'INVALID_INPUT', errorMessage: `Reference image type tidak valid: ${file.type}`, field: 'referenceImage' };
  }
  return { ok: true };
}
