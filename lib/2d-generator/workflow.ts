// NEXUS — 2D Magic Generator — Strict Workflow Orchestrator
// USER → INPUT → VALIDATION → PROMPT UNDERSTANDING → GENERATION PLAN → ENGINE SELECTION → IMAGE GENERATION → RESULT VALIDATION → POST PROCESSING → QUALITY CHECK → ASSET VERSIONING → SAVE → DISPLAY → EDIT/REGENERATE/CONTINUE

import { GenerationState, createInitialJobState, transitionState, getStateProgress } from './state-machine';
import { NormalizedGenerationRequest, CharacterContext, ProjectContext, FinalGenerationOutput, VisualStyleId } from './types';
import { validateNormalizedRequest } from './validation';
import { getVisualStyleDef, getVisualStyleModifier, getVisualStyleNegative, buildPromptWithVisualStyle } from './visual-style';
import { checkCharacterIsolation } from './character-consistency';
import { imageGenerationService } from './provider-abstraction';
import { validateProviderImage, processRemoveBg } from './image-processor';
import { assetStorage } from './storage';
import { jobManager } from './job-manager';

export interface WorkflowInput {
  projectId: string;
  userId?: string;
  characterData?: any;
  worldSetting?: string;
  prompt?: string;
  visualStyle?: string;
  theme?: string;
  storyContext?: string;
  mode?: string;
  timeOfDay?: string;
  weather?: string;
}

export interface WorkflowResult {
  ok: boolean;
  output?: FinalGenerationOutput;
  errorCode?: string;
  errorMessage?: string;
  state: GenerationState;
  jobId: string;
  requestId: string;
}

export class GeneratorWorkflow {
  async execute(input: WorkflowInput, abortSignal?: AbortSignal): Promise<WorkflowResult> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const projectId = input.projectId || `proj_${Date.now()}`;
    const userId = input.userId || 'anonymous';

    let jobState = createInitialJobState({
      jobId,
      projectId,
      characterId: input.characterData?.character_id || input.characterData?.id || input.characterData?.name,
      visualStyle: input.visualStyle || 'anime',
      idempotencyKey: jobManager.generateIdempotencyKey({
        projectId,
        characterId: input.characterData?.name,
        prompt: input.prompt || input.characterData?.physical || '',
        visualStyle: input.visualStyle || 'anime',
      }),
    });

    console.log(`[Workflow] START job=${jobId} request=${requestId} project=${projectId} — ${input.visualStyle || 'anime'} — ${input.characterData?.name || 'world'}`);

    // Create job with concurrency & idempotency checks
    const jobCreation = jobManager.createJob({
      jobId,
      projectId,
      userId,
      idempotencyKey: jobState.idempotencyKey!,
    });

    if (!jobCreation.ok) {
      console.error(`[Workflow] Job creation failed: ${jobCreation.errorMessage}`);
      return {
        ok: false,
        errorCode: jobCreation.errorCode,
        errorMessage: jobCreation.errorMessage,
        state: 'FAILED',
        jobId,
        requestId,
      };
    }

    const signal = abortSignal || jobCreation.entry!.abortController.signal;

    try {
      // === STATE: VALIDATING ===
      let transition = transitionState(jobState, 'VALIDATING', { progress: getStateProgress('VALIDATING') });
      if (!transition.ok) throw new Error(transition.error);
      jobState = transition.newState!;

      if (signal.aborted) throw new Error('Cancelled during VALIDATING');

      // Build character context — PURE from character object only
      let characterContext: CharacterContext | undefined;
      if (input.characterData) {
        const charData = input.characterData;
        // FALLBACK GENDER VALUE — ensure gender never empty per fix INVALID_INPUT
        const inferFallback = (c:any) => {
          const name = (c?.name||'').toLowerCase();
          const gRaw = (c?.gender||c?.jenis_kelamin||'').toLowerCase();
          const combined = `${name} ${gRaw} ${c?.physical||''} ${c?.description||''} ${c?.clothing||''}`.toLowerCase();
          if (/perempuan|wanita|gadis|cewek|female|woman|girl|amelia|siti|putri|ratu|dewi|ayu|sari|maya|luna|sinta|andini|amara|lestari|wulan|rina|diana|clara|emma|olivia|amelie|tribuana|tunggadewi|gitarja|ken dedes/i.test(combined)) return 'Perempuan';
          if (/laki-laki|laki|pria|pemuda|male|man|boy|rangga|arga|budi|joko|gajah mada|hayam wuruk|ken arok|suharto|soeharto|soekarno|sukarno/i.test(combined)) return 'Laki-Laki';
          if (/perempuan|female|wanita|woman|girl/i.test(gRaw)) return 'Perempuan';
          if (/laki-laki|laki|pria|male|man|boy/i.test(gRaw)) return 'Laki-Laki';
          return 'Laki-Laki';
        };
        const genderSanitized = charData.gender && String(charData.gender).trim().length>0 ? charData.gender : inferFallback(charData);
        characterContext = {
          characterId: charData.character_id || charData.id || charData.name?.toLowerCase().replace(/\s+/g, '-') || `char_${Date.now()}`,
          name: charData.name || 'Unknown',
          gender: genderSanitized,
          physical: charData.physical || charData.description || '',
          clothing: charData.clothing || charData.pakaian || '',
          age: charData.age || '',
          role: charData.role || charData.story_role || '',
          description: charData.description || '',
          visualTraits: charData.visualTraits || '',
        };

        // Character isolation check
        const isolation = checkCharacterIsolation(charData);
        if (!isolation.isValid) {
          console.warn(`[Workflow] Character isolation FAIL for ${charData.name}: ${isolation.errorMessage}`);
          // Don't fail, but log and sanitize
          characterContext.physical = isolation.sanitizedPhysical;
          characterContext.clothing = isolation.sanitizedClothing;
        }
      }

      // Visual style strict — prefix frontmost
      const visualStyleRaw = (input.visualStyle || 'anime').toLowerCase() as VisualStyleId;
      const visualStyleDef = getVisualStyleDef(visualStyleRaw);
      const genderHint = characterContext?.gender || '';
      const visualStyleModifier = getVisualStyleModifier(visualStyleRaw, genderHint);
      const visualStyleNegative = getVisualStyleNegative(visualStyleRaw);

      // Build normalized request — USER PROMPT + PROJECT CONTEXT + CHARACTER CONTEXT + STYLE CONTEXT + SCENE CONTEXT + CONSTRAINTS
      const userPromptRaw = input.prompt || characterContext?.physical || input.worldSetting || '';
      
      const normalizedRequest: NormalizedGenerationRequest = {
        requestId,
        jobId,
        projectId,
        userPrompt: userPromptRaw,
        negativePrompt: visualStyleNegative,
        projectContext: {
          projectId,
          theme: input.theme,
          genre: undefined,
          storyContext: input.storyContext,
          worldSetting: input.worldSetting,
        },
        characterContext,
        sceneContext: {
          timeOfDay: input.timeOfDay,
          weather: input.weather,
        },
        styleContext: {
          visualStyle: visualStyleRaw as any,
          visualStyleModifier,
          visualStyleNegative,
        },
        constraints: {
          width: 1024,
          height: 1024,
          steps: 4,
          seed: Math.floor(Math.random() * 1000000),
          aspectRatio: '1:1',
        },
        generationType: input.mode === 'character' || (characterContext && !input.worldSetting) ? 'character_asset' : input.mode === 'world' ? 'world_background' : 'full_composite',
        idempotencyKey: jobState.idempotencyKey!,
        createdAt: new Date().toISOString(),
      };

      // Validate normalized request
      const validation = validateNormalizedRequest(normalizedRequest);
      if (!validation.ok) {
        console.error(`[Workflow] Validation FAIL: ${validation.errorMessage}`);
        jobState = transitionState(jobState, 'FAILED', { errorCode: validation.errorCode as any, errorMessage: validation.errorMessage })?.newState || jobState;
        jobManager.completeJob(jobId, userId);
        return {
          ok: false,
          errorCode: validation.errorCode,
          errorMessage: validation.errorMessage,
          state: 'FAILED',
          jobId,
          requestId,
        };
      }

      // === STATE: PLANNING ===
      transition = transitionState(jobState, 'PLANNING', { progress: getStateProgress('PLANNING') });
      if (!transition.ok) throw new Error(transition.error);
      jobState = transition.newState!;

      if (signal.aborted) throw new Error('Cancelled during PLANNING');

      // Prompt understanding & generation plan — build final prompt with visualStyle prefix
      const promptBuilt = buildPromptWithVisualStyle({
        userPrompt: userPromptRaw,
        visualStyle: visualStyleRaw,
        gender: genderHint,
        characterContext: characterContext ? {
          gender: characterContext.gender,
          physical: characterContext.physical,
          clothing: characterContext.clothing,
          age: characterContext.age,
          name: characterContext.name,
        } : undefined,
      });

      normalizedRequest.userPrompt = promptBuilt.positive;
      normalizedRequest.negativePrompt = promptBuilt.negative;

      console.log(`[Workflow] PLANNING — VisualStyle FRONTMOST: ${visualStyleModifier} — Prompt: ${promptBuilt.positive.slice(0,120)}...`);

      // === STATE: GENERATING ===
      transition = transitionState(jobState, 'GENERATING', { progress: getStateProgress('GENERATING'), attempt: 1 });
      if (!transition.ok) throw new Error(transition.error);
      jobState = transition.newState!;

      if (signal.aborted) throw new Error('Cancelled during GENERATING');

      // Engine selection & image generation with fallback & retry
      const genResult = await imageGenerationService.generateWithRetry(normalizedRequest, signal, 3, 1000);

      if (!genResult.ok) {
        console.error(`[Workflow] GENERATING FAIL after ${genResult.attempts} attempts: ${genResult.errorMessage} — tried ${genResult.triedProviders.join(', ')}`);
        jobState = transitionState(jobState, 'FAILED', { errorCode: genResult.errorCode as any, errorMessage: genResult.errorMessage })?.newState || jobState;
        jobManager.completeJob(jobId, userId);
        return {
          ok: false,
          errorCode: genResult.errorCode,
          errorMessage: genResult.errorMessage,
          state: 'FAILED',
          jobId,
          requestId,
        };
      }

      // === STATE: PROCESSING === — Post-processing BEFORE verification per strict workflow
      transition = transitionState(jobState, 'PROCESSING', { progress: getStateProgress('PROCESSING') });
      if (!transition.ok) throw new Error(transition.error);
      jobState = transition.newState!;

      if (signal.aborted) throw new Error('Cancelled during PROCESSING');

      // Post-processing — Remove.bg with explicit status (before verifying final image)
      const isCharacterAsset = normalizedRequest.generationType === 'character_asset';
      const removeBgResult = await processRemoveBg(genResult.imageUrl, isCharacterAsset);

      console.log(`[Workflow] PROCESSING — Remove.bg status: ${removeBgResult.status} — applied=${removeBgResult.applied}`);

      // === STATE: VERIFYING === — Validate final image after processing
      transition = transitionState(jobState, 'VERIFYING', { progress: getStateProgress('VERIFYING') });
      if (!transition.ok) throw new Error(transition.error);
      jobState = transition.newState!;

      if (signal.aborted) throw new Error('Cancelled during VERIFYING');

      // Result validation — MIME, dimensions, non-empty buffer — validate final processed image
      const imageToValidate = removeBgResult.imageUrl || genResult.imageUrl;
      const imageValidation = await validateProviderImage(imageToValidate);
      if (!imageValidation.ok) {
        console.error(`[Workflow] VERIFYING FAIL: ${imageValidation.error}`);
        jobState = transitionState(jobState, 'FAILED', { errorCode: 'INVALID_OUTPUT' as any, errorMessage: imageValidation.error })?.newState || jobState;
        jobManager.completeJob(jobId, userId);
        return {
          ok: false,
          errorCode: 'INVALID_OUTPUT',
          errorMessage: imageValidation.error,
          state: 'FAILED',
          jobId,
          requestId,
        };
      }

      // === STATE: SAVING ===
      transition = transitionState(jobState, 'SAVING', { progress: getStateProgress('SAVING') });
      if (!transition.ok) throw new Error(transition.error);
      jobState = transition.newState!;

      if (signal.aborted) throw new Error('Cancelled during SAVING');

      // Asset versioning & save
      const finalImageUrl = removeBgResult.imageUrl;
      const rawImageUrl = removeBgResult.originalImageUrl;

      let assetMeta: any;
      try {
        assetMeta = assetStorage.createVersion({
          projectId,
          characterId: characterContext?.characterId,
          jobId,
          requestId,
          imageUrl: finalImageUrl,
          rawImageUrl,
          mimeType: imageValidation.mimeType,
          width: genResult.width,
          height: genResult.height,
          size: imageValidation.size,
          prompt: genResult.promptUsed,
          negativePrompt: genResult.negativePromptUsed,
          visualStyle: visualStyleRaw,
          visualStyleModifier,
          gender: characterContext ? (checkCharacterIsolation(input.characterData).detectedGender) : 'male',
          genderTag: characterContext ? (checkCharacterIsolation(input.characterData).genderTag) : '1man',
          model: genResult.model,
          provider: genResult.provider,
          spaceUsed: genResult.spaceUsed || genResult.model,
          removeBgApplied: removeBgResult.applied,
          removeBgStatus: removeBgResult.status,
        });
      } catch (err: any) {
        console.error(`[Workflow] SAVING FAIL — storage error: ${err.message}`);
        jobState = transitionState(jobState, 'FAILED', { errorCode: 'STORAGE_FAILED' as any, errorMessage: err.message })?.newState || jobState;
        jobManager.completeJob(jobId, userId);
        return {
          ok: false,
          errorCode: 'STORAGE_FAILED',
          errorMessage: err.message,
          state: 'FAILED',
          jobId,
          requestId,
        };
      }

      // === STATE: COMPLETED ===
      transition = transitionState(jobState, 'COMPLETED', { progress: 100 });
      if (!transition.ok) throw new Error(transition.error);
      jobState = transition.newState!;

      const output: FinalGenerationOutput = {
        jobId,
        requestId,
        projectId,
        characterId: characterContext?.characterId,
        assetId: assetMeta.assetId,
        version: assetMeta.version,
        imageUrl: finalImageUrl,
        rawImageUrl,
        mimeType: imageValidation.mimeType,
        width: genResult.width,
        height: genResult.height,
        prompt: genResult.promptUsed,
        negativePrompt: genResult.negativePromptUsed,
        visualStyle: visualStyleRaw as any,
        visualStyleModifier,
        visualStyleNegative,
        gender: assetMeta.gender,
        genderTag: assetMeta.genderTag,
        model: genResult.model,
        provider: genResult.provider,
        spaceUsed: genResult.spaceUsed || genResult.model,
        triedSpaces: (genResult as any).triedProviders || [genResult.spaceUsed || genResult.model],
        hasHuggingFaceKey: !!(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN),
        removeBg: removeBgResult,
        removeBgApplied: removeBgResult.applied,
        removeBgStatus: removeBgResult.status,
        generationTimeMs: genResult.processingTimeMs + (removeBgResult.processingTimeMs || 0),
        state: 'COMPLETED',
        createdAt: new Date().toISOString(),
        isCompleted: true,
        isFailed: false,
        sourceOfTruth: {
          generationState: jobState.state,
          assetIdentity: assetMeta.assetId,
          projectIdentity: projectId,
          characterIdentity: characterContext?.characterId || 'none',
          providerConfiguration: `${genResult.provider}:${genResult.spaceUsed || genResult.model}`,
        },
      };

      console.log(`[Workflow] COMPLETED job=${jobId} — asset=${assetMeta.assetId} version=${assetMeta.version} — removeBg=${removeBgResult.status} — visualStyle=${visualStyleRaw} FRONTMOST`);

      jobManager.completeJob(jobId, userId);

      return {
        ok: true,
        output,
        state: 'COMPLETED',
        jobId,
        requestId,
      };
    } catch (err: any) {
      const isCancelled = err.message.includes('Cancelled') || err.name === 'AbortError' || signal.aborted;
      
      if (isCancelled) {
        console.log(`[Workflow] CANCELLED job=${jobId}`);
        const cancelledState = transitionState(jobState, 'CANCELLED', { errorCode: 'CANCELLED' as any, errorMessage: 'Cancelled by user' })?.newState || jobState;
        jobManager.completeJob(jobId, userId);
        return {
          ok: false,
          errorCode: 'CANCELLED',
          errorMessage: 'Cancelled by user',
          state: 'CANCELLED',
          jobId,
          requestId,
        };
      }

      console.error(`[Workflow] FAILED job=${jobId}: ${err.message}`, err.stack);
      const failedState = transitionState(jobState, 'FAILED', { errorCode: 'UNKNOWN_ERROR' as any, errorMessage: err.message })?.newState || jobState;
      jobManager.completeJob(jobId, userId);

      return {
        ok: false,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: err.message,
        state: 'FAILED',
        jobId,
        requestId,
      };
    }
  }
}

export const generatorWorkflow = new GeneratorWorkflow();
