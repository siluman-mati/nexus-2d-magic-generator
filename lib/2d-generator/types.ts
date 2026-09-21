// NEXUS — 2D Magic Generator — Types — Source of Truth

import { GenerationState, ErrorCode } from './state-machine';

export type VisualStyleId = 'anime' | 'photorealistic' | '3d_animation' | 'semi_realistic' | 'comic_book' | 'dark_fantasy';

export interface VisualStyleDefinition {
  id: VisualStyleId;
  label: string;
  positivePrefix: string;
  negativeOverride: string;
  icon: string;
}

export interface CharacterContext {
  characterId: string;
  name: string;
  gender: string;
  physical: string;
  clothing: string;
  age: string;
  role?: string;
  description?: string;
  visualTraits?: string;
}

export interface ProjectContext {
  projectId: string;
  theme?: string;
  genre?: string;
  storyContext?: string;
  worldSetting?: string;
}

export interface SceneContext {
  sceneId?: string;
  location?: string;
  action?: string;
  emotion?: string;
  timeOfDay?: string;
  weather?: string;
}

export interface GenerationConstraints {
  width: number;
  height: number;
  steps: number;
  seed?: number;
  guidance?: number;
  aspectRatio?: string;
}

export interface NormalizedGenerationRequest {
  requestId: string;
  jobId: string;
  projectId: string;
  userPrompt: string;
  negativePrompt?: string;
  projectContext: ProjectContext;
  characterContext?: CharacterContext;
  sceneContext?: SceneContext;
  styleContext: {
    visualStyle: VisualStyleId;
    visualStyleModifier: string;
    visualStyleNegative: string;
  };
  constraints: GenerationConstraints;
  generationType: 'character_asset' | 'world_background' | 'full_composite' | 'reference';
  idempotencyKey: string;
  createdAt: string;
}

export interface ImageGenerationResult {
  ok: true;
  imageUrl: string;
  imageBuffer?: Buffer;
  mimeType: string;
  width: number;
  height: number;
  seed: number;
  model: string;
  provider: string;
  spaceUsed?: string;
  promptUsed: string;
  negativePromptUsed: string;
  generationId: string;
  requestId: string;
  visualStyle: string;
  visualStyleModifier: string;
  processingTimeMs: number;
}

export interface ImageGenerationError {
  ok: false;
  errorCode: ErrorCode;
  errorMessage: string;
  retryable: boolean;
  provider?: string;
  httpStatus?: number;
  details?: any;
  requestId: string;
  generationId?: string;
}

export type ProviderResult = ImageGenerationResult | ImageGenerationError;

export interface ImageGenerationProvider {
  readonly providerId: string;
  readonly displayName: string;
  isAvailable(): Promise<boolean>;
  generate(
    request: NormalizedGenerationRequest,
    signal?: AbortSignal
  ): Promise<ProviderResult>;
}

export interface RemoveBgResult {
  applied: boolean;
  status: 'SUCCESS' | 'SKIPPED_NO_KEY' | 'SKIPPED_NOT_CHARACTER' | 'FAILED_QUOTA_EXCEEDED' | 'FAILED_RATE_LIMITED' | 'FAILED_INVALID_IMAGE' | 'FAILED_NETWORK' | 'FAILED_UNKNOWN';
  imageUrl: string;
  originalImageUrl: string;
  error?: string;
  processingTimeMs?: number;
}

export interface FinalGenerationOutput {
  jobId: string;
  requestId: string;
  projectId: string;
  characterId?: string;
  assetId: string;
  version: string; // asset_v001
  imageUrl: string;
  rawImageUrl: string;
  mimeType: string;
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
  visualStyle: VisualStyleId;
  visualStyleModifier: string;
  visualStyleNegative: string;
  gender: 'male' | 'female';
  genderTag: string;
  model: string;
  provider: string;
  spaceUsed: string;
  triedSpaces: string[];
  hasHuggingFaceKey: boolean;
  removeBg: RemoveBgResult;
  removeBgApplied: boolean;
  removeBgStatus: RemoveBgResult['status'];
  generationTimeMs: number;
  state: GenerationState;
  errorCode?: ErrorCode;
  errorMessage?: string;
  createdAt: string;
  isCompleted: boolean;
  isFailed: boolean;
  sourceOfTruth: {
    generationState: string;
    assetIdentity: string;
    projectIdentity: string;
    characterIdentity: string;
    providerConfiguration: string;
  };
}
