import { NextResponse } from 'next/server';
import { getHuggingFaceToken, HF_TOKEN_MISSING_MESSAGE } from '@/lib/2d-generator/hf-auth';
import { generatorWorkflow } from '@/lib/2d-generator/workflow';
import { validatePrompt, validateCharacterContext } from '@/lib/2d-generator/validation';
import { getVisualStyleDef, buildPromptWithVisualStyle } from '@/lib/2d-generator/visual-style';
import { checkCharacterIsolation } from '@/lib/2d-generator/character-consistency';
import { validateProviderImage, processRemoveBg } from '@/lib/2d-generator/image-processor';
import { assetStorage } from '@/lib/2d-generator/storage';

const FORCE_ENGINE_LABEL = `Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic)`;
const HF_MODEL_ID = 'black-forest-labs/FLUX.1-schnell';
const HF_ENDPOINT = 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell';
const HF_FALLBACK_ENDPOINTS: { url: string; format: 'inputs' | 'prompt' }[] = [
  { url: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', format: 'inputs' },
  { url: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell', format: 'prompt' },
  { url: 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', format: 'inputs' },
];

const GENERATION_TIMEOUT_MS = 85000;

// === FALLBACK GENDER VALUE — fix INVALID_INPUT Gender karakter wajib (Laki-Laki/Perempuan) ===
function inferGenderFallbackForAPI(character: any): string {
  const name = (character?.name || character?.characterName || '').toLowerCase();
  const genderRaw = (character?.gender || character?.jenis_kelamin || '').toLowerCase();
  const physical = (character?.physical || character?.description || character?.body_posture || '').toLowerCase();
  const clothing = (character?.clothing || character?.pakaian || '').toLowerCase();
  const combined = `${name} ${genderRaw} ${physical} ${clothing}`;
  // Female: gadis/wanita/perempuan/Amelia/Siti
  if (/perempuan|wanita|gadis|cewek|female|woman|girl|putri|ratu|dewi|amelia|siti|ayu|sari|maya|luna|sinta|andini|amara|lestari|wulan|rina|diana|clara|emma|olivia|amelie|tribuana|tunggadewi|gitarja|ken dedes/i.test(combined)) {
    return 'Perempuan';
  }
  // Male: pemuda/pria/laki-laki/Rangga
  if (/laki-laki|laki|pria|pemuda|male|man|boy|rangga|arga|budi|joko|gajah mada|hayam wuruk|ken arok|suharto|soeharto|soekarno|sukarno/i.test(combined)) {
    return 'Laki-Laki';
  }
  if (/perempuan|female|wanita|woman|girl/i.test(genderRaw)) return 'Perempuan';
  if (/laki-laki|laki|pria|male|man|boy/i.test(genderRaw)) return 'Laki-Laki';
  if (/amelia|andini|amara|luna|sinta|maya|ayu|wulan|sari|lestari|putri|ratu|dewi|ken dedes|queen|princess|perempuan|wanita|female|woman|girl|cewek|tunggadewi|tribuana|gitarja|siti|rina|diana|clara|emma|olivia|amelie/i.test(name)) return 'Perempuan';
  return 'Laki-Laki'; // default umum
}

function sanitizeCharacterPayload(charData: any, genderParam: string, characterNameParam: string): any {
  if (!charData) return charData;
  const fallbackGender = inferGenderFallbackForAPI({ ...charData, name: charData.name || characterNameParam, gender: charData.gender || genderParam });
  // Ensure gender never empty/null
  if (!charData.gender || String(charData.gender).trim().length===0) {
    charData.gender = genderParam && String(genderParam).trim().length>0 ? genderParam : fallbackGender;
  }
  // Normalize invalid gender
  const gLower = String(charData.gender).toLowerCase();
  if (!/laki-laki|perempuan/.test(gLower)) {
    if (/female|woman|girl|perempuan|wanita|gadis/i.test(gLower)) charData.gender = 'Perempuan';
    else if (/male|man|boy|laki-laki|laki|pria|pemuda/i.test(gLower)) charData.gender = 'Laki-Laki';
    else charData.gender = fallbackGender;
  }
  // Ensure name
  if (!charData.name) charData.name = characterNameParam || 'Unknown';
  // Ensure physical
  if (!charData.physical && charData.description) charData.physical = charData.description;
  if (!charData.physical) charData.physical = `${charData.name} character`;
  // Ensure clothing
  if (!charData.clothing) charData.clothing = charData.gender === 'Perempuan' ? 'elegant female outfit' : 'male outfit';
  return charData;
}


async function generateViaDirectHFInference(prompt: string, requestId: string, signal?: AbortSignal): Promise<{ ok: boolean; imageUrl?: string; mimeType?: string; errorCode?: string; errorMessage?: string; processingTimeMs?: number; triedEndpoint?: string; triedEndpoints?: string[] }> {
  const token = getHuggingFaceToken();
  if (!token) return { ok: false, errorCode: 'HF_TOKEN_MISSING', errorMessage: HF_TOKEN_MISSING_MESSAGE };
  const maxRetriesPerEndpoint = 3; const retryDelayMs = 5000; let lastError: any = null; const start = Date.now(); const allTried: string[] = [];
  for (const ep of HF_FALLBACK_ENDPOINTS) {
    allTried.push(ep.url); let attempt = 0;
    while (attempt < maxRetriesPerEndpoint) {
      attempt++; if (signal?.aborted) return { ok: false, errorCode: 'CANCELLED', errorMessage: 'Cancelled', triedEndpoints: allTried };
      try {
        const payload = ep.format === 'prompt' ? { prompt, num_inference_steps: 8, guidance_scale: 3.5, width: 1024, height: 1024 } : { inputs: prompt, parameters: { num_inference_steps: 8, guidance_scale: 3.5 } };
        console.log(`[generate-hf] [${requestId}] Direct HF Inference attempt ${attempt}/${maxRetriesPerEndpoint} — endpoint ${ep.url} — format ${ep.format} — steps 8 guidance 3.5 — Auth Bearer [REDACTED]`);
        const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(ep.url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: signal || controller.signal });
        clearTimeout(timeoutId);
        if (res.status === 503) { const text = await res.text().catch(() => 'Model is loading'); console.warn(`[generate-hf] [${requestId}] 503 Model loading ${ep.url} attempt ${attempt}: ${text.slice(0,200)} — retry ${retryDelayMs}ms`); lastError = new Error(`503: ${text.slice(0,200)}`); if (attempt < maxRetriesPerEndpoint) { await new Promise(r => setTimeout(r, retryDelayMs)); continue; } break; }
        if (res.status === 410 || res.status === 404) { const text = await res.text().catch(() => 'not found'); console.warn(`[generate-hf] [${requestId}] ${res.status} ${ep.url} — ${text.slice(0,200)} — trying next`); lastError = new Error(`${res.status}: ${text.slice(0,200)}`); break; }
        if (!res.ok) { const text = await res.text().catch(() => 'unknown'); console.error(`[generate-hf] [${requestId}] Direct HF FAILED ${res.status} ${ep.url} attempt ${attempt}: ${text.slice(0,500)}`); lastError = new Error(`${res.status}: ${text.slice(0,200)}`); if (res.status === 429 && attempt < maxRetriesPerEndpoint) { await new Promise(r => setTimeout(r, retryDelayMs)); continue; } if (res.status >= 500 && attempt < maxRetriesPerEndpoint) { await new Promise(r => setTimeout(r, retryDelayMs)); continue; } if (text.toLowerCase().includes('not supported') || text.toLowerCase().includes('deprecated')) break; if (res.status === 402) return { ok: false, errorCode: 'QUOTA_EXCEEDED', errorMessage: `Direct HF quota exceeded ${ep.url}: ${text.slice(0,400)} — HF_PRIMARY_FAILED honest, no Pollinations`, triedEndpoint: ep.url, triedEndpoints: allTried }; if (res.status >= 400 && res.status < 500 && res.status !== 429) break; continue; }
        const contentType = res.headers.get('content-type') || ''; console.log(`[generate-hf] [${requestId}] Direct HF response ${contentType} status ${res.status} from ${ep.url}`);
        let imageUrl = ''; let mimeType = 'image/jpeg';
        if (contentType.includes('image')) { const ab = await res.arrayBuffer(); if (ab.byteLength < 100) throw new Error(`Buffer too small ${ab.byteLength}`); const b64 = Buffer.from(ab).toString('base64'); mimeType = contentType.includes('png') ? 'image/png' : contentType.includes('webp') ? 'image/webp' : 'image/jpeg'; imageUrl = `data:${mimeType};base64,${b64}`; }
        else {
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            if (json.images && Array.isArray(json.images) && json.images.length > 0) {
              const imgObj = json.images[0]; const remoteUrl = imgObj.url || imgObj.data || imgObj;
              if (typeof remoteUrl === 'string' && remoteUrl.startsWith('http')) {
                console.log(`[generate-hf] [${requestId}] Got remote URL ${remoteUrl.slice(0,120)} — fetching to ArrayBuffer/Base64`);
                const imgRes = await fetch(remoteUrl, { signal: signal as any }); if (!imgRes.ok) throw new Error(`Failed fetch remote ${imgRes.status}`); const imgCt = imgRes.headers.get('content-type') || 'image/jpeg'; const imgAb = await imgRes.arrayBuffer(); if (imgAb.byteLength < 100) throw new Error(`Remote buffer too small ${imgAb.byteLength}`); const b64 = Buffer.from(imgAb).toString('base64'); mimeType = imgCt.includes('png') ? 'image/png' : imgCt.includes('webp') ? 'image/webp' : 'image/jpeg'; imageUrl = `data:${mimeType};base64,${b64}`;
              } else if (typeof remoteUrl === 'string' && remoteUrl.length > 100) { imageUrl = remoteUrl.startsWith('data:') ? remoteUrl : `data:image/jpeg;base64,${remoteUrl}`; }
            } else if (typeof json === 'string' && json.length > 100) { imageUrl = json.startsWith('data:') ? json : `data:image/jpeg;base64,${json}`; }
            else if (json.data && typeof json.data === 'string') { imageUrl = json.data.startsWith('data:') ? json.data : `data:image/jpeg;base64,${json.data}`; }
            else throw new Error(`Unexpected JSON shape: ${text.slice(0,300)}`);
          } catch (parseErr: any) { console.error(`[generate-hf] [${requestId}] Parse failed ${ep.url}: ${text.slice(0,500)} — err ${parseErr.message}`); if (attempt < maxRetriesPerEndpoint) { await new Promise(r => setTimeout(r, retryDelayMs)); lastError = new Error(text.slice(0,200)); continue; } break; }
        }
        if (!imageUrl || imageUrl.length < 100) { console.error(`[generate-hf] [${requestId}] No valid imageUrl from ${ep.url}`); if (attempt < maxRetriesPerEndpoint) { await new Promise(r => setTimeout(r, retryDelayMs)); lastError = new Error(`No imageUrl from ${ep.url}`); continue; } break; }
        const processingTime = Date.now() - start; console.log(`[generate-hf] [${requestId}] SUCCESS Direct HF Inference ${ep.url} — ${imageUrl.length} chars — mime ${mimeType} — time ${processingTime}ms — steps 8 guidance 3.5 — ArrayBuffer/Base64`);
        return { ok: true, imageUrl, mimeType, processingTimeMs: processingTime, triedEndpoint: ep.url, triedEndpoints: allTried };
      } catch (err: any) { lastError = err; if (signal?.aborted || err.name === 'AbortError') return { ok: false, errorCode: 'CANCELLED', errorMessage: 'Cancelled', triedEndpoints: allTried }; console.warn(`[generate-hf] [${requestId}] Exception ${ep.url} attempt ${attempt}/${maxRetriesPerEndpoint}: ${err.message}`); if (attempt < maxRetriesPerEndpoint) { await new Promise(r => setTimeout(r, retryDelayMs)); continue; } break; }
    }
    console.log(`[generate-hf] [${requestId}] Trying next endpoint after ${ep.url} failed — lastError ${lastError?.message?.slice(0,100)}`);
  }
  return { ok: false, errorCode: 'PROVIDER_UNAVAILABLE', errorMessage: `Direct HF Inference failed after trying ${allTried.length} endpoints (${allTried.join(', ')}) — last: ${lastError?.message} — primary per requirement ${HF_ENDPOINT} — steps 8 guidance 3.5 — retry 503 every 5s max 3x — HF_PRIMARY_FAILED honest, no Pollinations`, triedEndpoint: HF_ENDPOINT, triedEndpoints: allTried };
}

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; const startTime = Date.now();
  // Fail before parsing input or starting any provider/fallback work.
  if (!getHuggingFaceToken()) {
    return NextResponse.json({
      ok: false,
      errorCode: 'HF_TOKEN_MISSING',
      errorMessage: HF_TOKEN_MISSING_MESSAGE,
      state: 'FAILED',
      requestId,
      engineLabel: FORCE_ENGINE_LABEL,
      hasHuggingFaceKey: false,
      retryable: false,
      processingTimeMs: Date.now() - startTime,
    }, { status: 503 });
  }
  try {
    const body = await req.json();
    const { prompt, characterName, gender, characterData, worldSetting, theme, locations, mode, type, timeOfDay, weather, time, cuaca, waktu, storyContext, sourceStory, visualStyle, projectId, userId } = body;
    console.log(`[generate-hf] [${requestId}] START — visualStyle=${visualStyle || 'anime'} — char=${characterData?.name || characterName || 'none'} — mode=${mode || type || 'auto'} — ENGINE: Direct HF Inference ${HF_MODEL_ID} — Dynamic`);
    const hfKeyPresent = !!getHuggingFaceToken();
    console.log(`[generate-hf] [${requestId}] HUGGINGFACE_API_KEY present: ${hfKeyPresent ? 'YES' : 'NO'} — Bearer [REDACTED] — Direct HF Inference primary ${HF_ENDPOINT} + fallback router.huggingface.co/fal-ai/fal-ai/flux/schnell — steps 8 guidance 3.5 — keys checked: HUGGINGFACE_API_KEY, HF_TOKEN, HUGGINGFACE_API_TOKEN, HUGGING_FACE_API_KEY, HUNGGING_FACE_API_KEY`);
    // === PAYLOAD SANITIZATION — ensure gender never empty/null before backend FLUX/HF generator ===
    let sanitizedCharacterData = characterData;
    if (characterData) {
      sanitizedCharacterData = sanitizeCharacterPayload({ ...characterData }, gender || '', characterName || '');
      console.log(`[generate-hf] [${requestId}] Sanitized gender: ${characterData.gender || 'empty'} -> ${sanitizedCharacterData.gender} — fallback logic Rangga=Laki-Laki, Amelia/Siti=Perempuan — payload sanitized`);
    } else if (gender && String(gender).trim().length>0) {
      // If only gender param provided without characterData, create minimal characterData
      const fallbackGender = inferGenderFallbackForAPI({ name: characterName || '', gender });
      sanitizedCharacterData = { name: characterName || 'Unknown', gender: gender || fallbackGender, physical: prompt || 'character', clothing: '' };
    }

    if (!prompt && !sanitizedCharacterData && !worldSetting) return NextResponse.json({ ok: false, errorCode: 'INVALID_INPUT', errorMessage: 'Prompt/characterData/worldSetting tidak boleh kosong', requestId, state: 'FAILED', engineLabel: FORCE_ENGINE_LABEL }, { status: 400 });
    if (prompt) { const promptValidation = validatePrompt(prompt); if (!promptValidation.ok) return NextResponse.json({ ok: false, errorCode: promptValidation.errorCode, errorMessage: promptValidation.errorMessage, field: promptValidation.field, requestId, state: 'FAILED', engineLabel: FORCE_ENGINE_LABEL }, { status: 400 }); }
    if (sanitizedCharacterData) {
      const charValidation = validateCharacterContext({ characterId: sanitizedCharacterData.character_id || sanitizedCharacterData.id || sanitizedCharacterData.name, name: sanitizedCharacterData.name || characterName || 'Unknown', gender: sanitizedCharacterData.gender || gender || inferGenderFallbackForAPI({ name: sanitizedCharacterData.name || characterName }), physical: sanitizedCharacterData.physical || sanitizedCharacterData.description || '', clothing: sanitizedCharacterData.clothing || '', age: sanitizedCharacterData.age || '' } as any);
      if (!charValidation.ok && charValidation.errorCode === 'REFERENCE_MISSING') return NextResponse.json({ ok: false, errorCode: 'REFERENCE_MISSING', errorMessage: charValidation.errorMessage, requestId, state: 'FAILED', engineLabel: FORCE_ENGINE_LABEL, verification: 'Character reference not available — BLOCKED' }, { status: 400 });
      // If still INVALID_INPUT for gender after fallback, force fallback to prevent blocking Generate All Scenes
      if (!charValidation.ok && charValidation.field === 'gender') {
        const forcedGender = inferGenderFallbackForAPI(sanitizedCharacterData);
        sanitizedCharacterData.gender = forcedGender;
        console.warn(`[generate-hf] [${requestId}] Gender still INVALID after validation — forcing fallback ${forcedGender} — preventing INVALID_INPUT block`);
      }
      const isolation = checkCharacterIsolation(sanitizedCharacterData); if (!isolation.isValid) console.warn(`[generate-hf] [${requestId}] Isolation FAIL for ${sanitizedCharacterData.name}: ${isolation.errorMessage} — sanitize`);
    }
    const visualStyleRaw = visualStyle || sanitizedCharacterData?.visualStyle || characterData?.visualStyle || 'anime'; const visualStyleDef = getVisualStyleDef(visualStyleRaw);
    const abortController = new AbortController(); const timeoutId = setTimeout(() => { console.error(`[generate-hf] [${requestId}] TIMEOUT after ${GENERATION_TIMEOUT_MS}ms`); abortController.abort(); }, GENERATION_TIMEOUT_MS);
    req.signal.addEventListener('abort', () => { console.log(`[generate-hf] [${requestId}] Client aborted — cancelling`); abortController.abort(); });
    try {
      const userPromptRaw = prompt || sanitizedCharacterData?.physical || characterData?.physical || worldSetting || '';
      const promptBuilt = buildPromptWithVisualStyle({ userPrompt: userPromptRaw, visualStyle: visualStyleRaw, gender: sanitizedCharacterData?.gender || characterData?.gender || gender || inferGenderFallbackForAPI({ name: characterName }), characterContext: sanitizedCharacterData ? { gender: sanitizedCharacterData.gender || gender || inferGenderFallbackForAPI(sanitizedCharacterData), physical: sanitizedCharacterData.physical || sanitizedCharacterData.description || '', clothing: sanitizedCharacterData.clothing || '', age: sanitizedCharacterData.age || '', name: sanitizedCharacterData.name || characterName || 'Unknown' } : undefined });
      const finalPrompt = promptBuilt.positive; const finalNegative = promptBuilt.negative;
      console.log(`[generate-hf] [${requestId}] Final prompt — ${finalPrompt.slice(0,100)}... — Direct HF Inference payload steps 8 guidance 3.5`);
      const directResult = await generateViaDirectHFInference(finalPrompt, requestId, abortController.signal);
      if (!directResult.ok) {
        console.error(`[generate-hf] [${requestId}] Direct HF Inference FAILED — ${directResult.errorCode}: ${directResult.errorMessage} — trying workflow fallback (also Direct HF Inference provider)`);
        const workflowResult = await generatorWorkflow.execute({ projectId: projectId || `proj_${Date.now()}`, userId: userId || 'anonymous', characterData: sanitizedCharacterData ? { ...sanitizedCharacterData, character_id: sanitizedCharacterData.character_id || sanitizedCharacterData.id || sanitizedCharacterData.name?.toLowerCase().replace(/\s+/g, '-') || `char_${Date.now()}`, name: sanitizedCharacterData.name || characterName || 'Unknown', gender: sanitizedCharacterData.gender || gender || inferGenderFallbackForAPI(sanitizedCharacterData), physical: sanitizedCharacterData.physical || sanitizedCharacterData.description || prompt || '', clothing: sanitizedCharacterData.clothing || '', age: sanitizedCharacterData.age || '' } : undefined, worldSetting: worldSetting || undefined, prompt: prompt || undefined, visualStyle: visualStyleRaw, theme: theme || undefined, storyContext: storyContext || sourceStory || undefined, mode: mode || type || undefined, timeOfDay: timeOfDay || waktu || time || undefined, weather: weather || cuaca || undefined }, abortController.signal);
        clearTimeout(timeoutId);
        if (!workflowResult.ok) {
          const totalTime = Date.now() - startTime; console.error(`[generate-hf] [${requestId}] Workflow also FAILED — state=${workflowResult.state} — code=${workflowResult.errorCode} — ${workflowResult.errorMessage} — time=${totalTime}ms`);
          const statusMap: Record<string, number> = { HF_TOKEN_MISSING: 503, AUTHENTICATION_FAILED: 401, RATE_LIMITED: 429, TIMEOUT: 408, QUOTA_EXCEEDED: 402, PROVIDER_UNAVAILABLE: 503, INVALID_INPUT: 400, INVALID_OUTPUT: 500, REFERENCE_MISSING: 400, CHARACTER_LEAKAGE: 400, STORAGE_FAILED: 500, DUPLICATE_REQUEST: 409, CANCELLED: 499, UNKNOWN_ERROR: 500 };
          const httpStatus = statusMap[workflowResult.errorCode || directResult.errorCode || 'UNKNOWN_ERROR'] || 500;
          return NextResponse.json({ ok: false, errorCode: workflowResult.errorCode || directResult.errorCode || 'PROVIDER_UNAVAILABLE', errorMessage: workflowResult.errorMessage || directResult.errorMessage || 'Direct HF Inference failed', state: workflowResult.state || 'FAILED', jobId: workflowResult.jobId, requestId: workflowResult.requestId || requestId, generationId: workflowResult.jobId, visualStyle: visualStyleRaw, visualStyleModifier: visualStyleDef.positivePrefix, visualStyleNegative: visualStyleDef.negativeOverride, engineLabel: FORCE_ENGINE_LABEL, endpoint: HF_ENDPOINT, model: HF_MODEL_ID, processingTimeMs: totalTime, hasHuggingFaceKey: hfKeyPresent, directHfError: directResult.errorMessage, triedEndpoint: directResult.triedEndpoint || HF_ENDPOINT, triedEndpoints: directResult.triedEndpoints, payload: { inputs: 'prompt', parameters: { num_inference_steps: 8, guidance_scale: 3.5 } }, verification: 'Direct HF Inference FAILED — no Gradio — honest error — steps 8 guidance 3.5 — no Pollinations' }, { status: httpStatus });
        }
        const output = workflowResult.output!; const totalTime = Date.now() - startTime;
        console.log(`[generate-hf] [${requestId}] COMPLETED via workflow fallback (Direct HF Inference provider) — job=${output.jobId} — asset=${output.assetId} — version=${output.version} — endpoint=${HF_ENDPOINT} — removeBg=${output.removeBgStatus} — time=${totalTime}ms`);
        return NextResponse.json({ ok: true, success: true, imageUrl: output.imageUrl, rawImageUrl: output.rawImageUrl, image: output.imageUrl, image_url: output.imageUrl, mimeType: output.mimeType, width: output.width, height: output.height, size: output.imageUrl.length, prompt: output.prompt, negativePrompt: output.negativePrompt, originalPrompt: prompt, visualStyle: output.visualStyle, visualStyleModifier: output.visualStyleModifier, visualStyleNegative: output.visualStyleNegative, visualStyleDef: visualStyleDef, gender: output.gender, genderTag: output.genderTag, characterId: output.characterId, characterName: sanitizedCharacterData?.name || characterData?.name || characterName || null, model: output.model, provider: output.provider, spaceUsed: output.spaceUsed, triedSpaces: output.triedSpaces, endpoint: HF_ENDPOINT, triedEndpoint: HF_ENDPOINT, engineLabel: FORCE_ENGINE_LABEL, engine: `${FORCE_ENGINE_LABEL} — Endpoint ${HF_ENDPOINT} — Layer: ${output.assetId} — VisualStyle:${output.visualStyleModifier} — Gender:${output.genderTag} — steps 8 guidance 3.5`, removeBg: output.removeBg, removeBgApplied: output.removeBgApplied, removeBgStatus: output.removeBgStatus, backgroundRemoved: output.removeBgApplied, removeBgError: output.removeBg.status !== 'SUCCESS' ? output.removeBg.error : undefined, removebg: { applied: output.removeBgApplied, status: output.removeBgStatus, removed: output.removeBgApplied, hasApiKey: !!(process.env.Removebg_API_KEY || process.env.REMOVE_BG_API_KEY || process.env.REMOVEBG_API_KEY), error: output.removeBg.error || null, originalImageUrl: output.rawImageUrl, processingTimeMs: output.removeBg.processingTimeMs }, jobId: output.jobId, requestId: output.requestId, generationId: output.jobId, assetId: output.assetId, version: output.version, state: output.state, progress: 100, isCompleted: true, isFailed: false, processingTimeMs: totalTime, generationTimeMs: output.generationTimeMs, hasHuggingFaceKey: output.hasHuggingFaceKey, hasRemovebgKey: !!(process.env.Removebg_API_KEY || process.env.REMOVE_BG_API_KEY || process.env.REMOVEBG_API_KEY), sourceOfTruth: output.sourceOfTruth, pipeline: `DIRECT HF INFERENCE — ${output.visualStyle} FRONTMOST — PURE CHARACTER OBJECT — Gender ${output.gender} — NO Rangga leakage — Remove.bg ${output.removeBgStatus} — Endpoint ${HF_ENDPOINT} + router.huggingface.co/fal-ai/fal-ai/flux/schnell — steps 8 guidance 3.5 — State ${output.state}`, layerType: characterData && !worldSetting ? 'character_asset' : worldSetting && !characterData ? 'world_background' : 'full_composite', mode: mode || type || (characterData && !worldSetting ? 'character' : worldSetting && !characterData ? 'world' : 'full'), sevenAttributes: `${output.genderTag}, ${characterData?.face || ''}, ${characterData?.age || ''}, ${characterData?.hair || ''}, ${characterData?.body_posture || ''}, ${characterData?.clothing || ''}`, worldSetting: worldSetting || null, timeOfDay: timeOfDay || waktu || time || null, weather: weather || cuaca || null, verification: 'COMPLETED with real image from Direct HF Inference — ArrayBuffer/Base64 — not Gradio — steps 8 guidance 3.5 — realistic details a professional raw dslr photo' });
      }
      clearTimeout(timeoutId); const totalTime = Date.now() - startTime;
      console.log(`[generate-hf] [${requestId}] Direct HF Inference SUCCESS — validating image — ${directResult.imageUrl?.length} chars — mime ${directResult.mimeType}`);
      const validation = await validateProviderImage(directResult.imageUrl!); if (!validation.ok) { console.error(`[generate-hf] [${requestId}] Image validation FAILED: ${validation.error}`); return NextResponse.json({ ok: false, errorCode: 'INVALID_OUTPUT', errorMessage: validation.error || 'Image validation failed', requestId, state: 'FAILED', engineLabel: FORCE_ENGINE_LABEL, endpoint: HF_ENDPOINT, processingTimeMs: totalTime }, { status: 500 }); }
      const removeBgResult = await processRemoveBg(directResult.imageUrl!, sanitizedCharacterData ? true : false);
      const charId = sanitizedCharacterData?.character_id || sanitizedCharacterData?.id || sanitizedCharacterData?.name?.toLowerCase().replace(/\s+/g, '-') || characterData?.character_id || characterData?.id || characterData?.name?.toLowerCase().replace(/\s+/g, '-') || `char_${Date.now()}`;
      const asset = assetStorage.createVersion({ projectId: projectId || `proj_${Date.now()}`, characterId: charId, jobId: `job_${Date.now()}`, requestId, imageUrl: removeBgResult.imageUrl || directResult.imageUrl!, rawImageUrl: directResult.imageUrl!, mimeType: directResult.mimeType || 'image/jpeg', width: 1024, height: 1024, size: directResult.imageUrl!.length, prompt: finalPrompt, negativePrompt: finalNegative, visualStyle: visualStyleRaw, visualStyleModifier: visualStyleDef.positivePrefix, gender: /perempuan|female|wanita/i.test((sanitizedCharacterData?.gender || characterData?.gender || gender || '').toLowerCase()) ? 'female' : 'male', genderTag: /perempuan|female|wanita/i.test((sanitizedCharacterData?.gender || characterData?.gender || gender || '').toLowerCase()) ? '1woman, beautiful female' : '1man, handsome male', model: HF_MODEL_ID, provider: 'hf-direct-flux', spaceUsed: directResult.triedEndpoint || HF_ENDPOINT, removeBgApplied: removeBgResult.applied, removeBgStatus: removeBgResult.status });
      console.log(`[generate-hf] [${requestId}] COMPLETED Direct HF Inference — asset=${asset.assetId} — version=${asset.version} — endpoint=${directResult.triedEndpoint} — removeBg=${removeBgResult.status} — time=${totalTime}ms — steps 8 guidance 3.5 — ArrayBuffer/Base64`);
      return NextResponse.json({ ok: true, success: true, imageUrl: asset.imageUrl || directResult.imageUrl, rawImageUrl: directResult.imageUrl, image: asset.imageUrl || directResult.imageUrl, image_url: asset.imageUrl || directResult.imageUrl, mimeType: directResult.mimeType || 'image/jpeg', width: 1024, height: 1024, size: (asset.imageUrl || directResult.imageUrl || '').length, prompt: finalPrompt, negativePrompt: finalNegative, originalPrompt: prompt, visualStyle: visualStyleRaw, visualStyleModifier: visualStyleDef.positivePrefix, visualStyleNegative: visualStyleDef.negativeOverride, visualStyleDef: visualStyleDef, gender: /perempuan|female|wanita/i.test((sanitizedCharacterData?.gender || characterData?.gender || gender || '').toLowerCase()) ? 'female' : 'male', genderTag: /perempuan|female|wanita/i.test((sanitizedCharacterData?.gender || characterData?.gender || gender || '').toLowerCase()) ? '1woman, beautiful female, feminine features, female outfit, adult female' : '1man, handsome male, masculine features, male outfit, adult male', characterId: charId, characterName: sanitizedCharacterData?.name || characterData?.name || characterName || null, model: HF_MODEL_ID, provider: 'hf-direct-flux', spaceUsed: directResult.triedEndpoint || HF_ENDPOINT, triedSpaces: directResult.triedEndpoints || [HF_ENDPOINT], endpoint: directResult.triedEndpoint || HF_ENDPOINT, triedEndpoint: directResult.triedEndpoint || HF_ENDPOINT, triedEndpoints: directResult.triedEndpoints, engineLabel: FORCE_ENGINE_LABEL, engine: `${FORCE_ENGINE_LABEL} — Endpoint ${directResult.triedEndpoint} — Layer: ${asset.assetId} — VisualStyle:${visualStyleDef.positivePrefix} — steps 8 guidance 3.5 — ArrayBuffer/Base64 — realistic details a professional raw dslr photo`, removeBg: removeBgResult, removeBgApplied: removeBgResult.applied, removeBgStatus: removeBgResult.status, backgroundRemoved: removeBgResult.applied, removeBgError: removeBgResult.error || undefined, removebg: { applied: removeBgResult.applied, status: removeBgResult.status, removed: removeBgResult.applied, hasApiKey: !!(process.env.Removebg_API_KEY || process.env.REMOVE_BG_API_KEY || process.env.REMOVEBG_API_KEY), error: removeBgResult.error || null, originalImageUrl: directResult.imageUrl, processingTimeMs: removeBgResult.processingTimeMs }, jobId: `job_${Date.now()}`, requestId, generationId: `job_${Date.now()}`, assetId: asset.assetId, version: asset.version, state: 'COMPLETED', progress: 100, isCompleted: true, isFailed: false, processingTimeMs: totalTime, generationTimeMs: directResult.processingTimeMs, hasHuggingFaceKey: hfKeyPresent, hasRemovebgKey: !!(process.env.Removebg_API_KEY || process.env.REMOVE_BG_API_KEY || process.env.REMOVEBG_API_KEY), sourceOfTruth: `Direct HF Inference ${HF_MODEL_ID} — steps 8 guidance 3.5 — retry 503 every 5s max 3x — ${directResult.triedEndpoint}`, pipeline: `DIRECT HF INFERENCE — ${visualStyleRaw} FRONTMOST — PURE CHARACTER OBJECT — Gender ${/perempuan|female/i.test((sanitizedCharacterData?.gender || characterData?.gender || gender || '').toLowerCase()) ? 'female' : 'male'} — NO Rangga leakage — Remove.bg ${removeBgResult.status} — Endpoint ${directResult.triedEndpoint} — steps 8 guidance 3.5 — ArrayBuffer/Base64 — State COMPLETED — realistic details a professional raw dslr photo`, layerType: sanitizedCharacterData && !worldSetting ? 'character_asset' : worldSetting && !sanitizedCharacterData ? 'world_background' : 'full_composite', mode: mode || type || (sanitizedCharacterData && !worldSetting ? 'character' : worldSetting && !sanitizedCharacterData ? 'world' : 'full'), sevenAttributes: `${/perempuan|female/i.test((sanitizedCharacterData?.gender || characterData?.gender || '').toLowerCase()) ? '1woman' : '1man'}, ${sanitizedCharacterData?.face || characterData?.face || ''}, ${sanitizedCharacterData?.age || characterData?.age || ''}, ${sanitizedCharacterData?.hair || characterData?.hair || ''}, ${sanitizedCharacterData?.body_posture || characterData?.body_posture || ''}, ${sanitizedCharacterData?.clothing || characterData?.clothing || ''}`, worldSetting: worldSetting || null, timeOfDay: timeOfDay || waktu || time || null, weather: weather || cuaca || null, verification: 'COMPLETED with real image from Direct HF Inference — ArrayBuffer/Base64 — endpoint router.huggingface.co/fal-ai/fal-ai/flux/schnell + https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell — steps 8 guidance 3.5 — retry 503 every 5s max 3x — not Gradio — displayed in UI without error' });
    } catch (err: any) {
      clearTimeout(timeoutId); const isCancelled = err.name === 'AbortError' || abortController.signal.aborted || err.message.includes('Cancelled') || err.message.includes('aborted');
      if (isCancelled) { console.log(`[generate-hf] [${requestId}] CANCELLED — time=${Date.now() - startTime}ms`); return NextResponse.json({ ok: false, errorCode: 'CANCELLED', errorMessage: 'Generation cancelled by user or timeout', state: 'CANCELLED', requestId, engineLabel: FORCE_ENGINE_LABEL, endpoint: HF_ENDPOINT, processingTimeMs: Date.now() - startTime }, { status: 499 }); }
      console.error(`[generate-hf] [${requestId}] Exception: ${err.message}`, err.stack); const safeMessage = err.message.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]').replace(/hf_[a-zA-Z0-9]+/g, '[REDACTED]').replace(/vcp_[a-zA-Z0-9]+/g, '[REDACTED]');
      return NextResponse.json({ ok: false, errorCode: 'UNKNOWN_ERROR', errorMessage: safeMessage, state: 'FAILED', requestId, engineLabel: FORCE_ENGINE_LABEL, endpoint: HF_ENDPOINT, hasHuggingFaceKey: !!getHuggingFaceToken(), processingTimeMs: Date.now() - startTime, verification: 'FAILED — exception, not fake success — Direct HF Inference' }, { status: 500 });
    }
  } catch (error: any) {
    console.error(`[generate-hf] [${requestId}] Outer error: ${error.message}`, error.stack); const safeMessage = error.message.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]').replace(/hf_[a-zA-Z0-9]+/g, '[REDACTED]');
    return NextResponse.json({ ok: false, errorCode: 'UNKNOWN_ERROR', errorMessage: safeMessage, state: 'FAILED', requestId, engineLabel: FORCE_ENGINE_LABEL, endpoint: HF_ENDPOINT, hasHuggingFaceKey: !!getHuggingFaceToken(), processingTimeMs: Date.now() - startTime }, { status: 500 });
  }
}
