// NEXUS — 2D Magic Generator — STRICT STATE MACHINE — 2026-09-20
// Single source of truth for generation state, no contradictory booleans

export type GenerationState =
  | 'IDLE'
  | 'VALIDATING'
  | 'PLANNING'
  | 'GENERATING'
  | 'PROCESSING'
  | 'VERIFYING'
  | 'SAVING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRYING';

export type ErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'INVALID_OUTPUT'
  | 'NETWORK_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN_ERROR'
  | 'REFERENCE_MISSING'
  | 'CHARACTER_LEAKAGE'
  | 'STORAGE_FAILED'
  | 'DUPLICATE_REQUEST';

export interface GenerationJobState {
  jobId: string;
  projectId: string;
  characterId?: string;
  assetId?: string;
  state: GenerationState;
  previousState?: GenerationState;
  errorCode?: ErrorCode;
  errorMessage?: string;
  progress: number; // 0-100 real progress, not fake
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  visualStyle: string;
  idempotencyKey?: string;
}

const VALID_TRANSITIONS: Record<GenerationState, GenerationState[]> = {
  IDLE: ['VALIDATING'],
  VALIDATING: ['PLANNING', 'FAILED', 'CANCELLED'],
  PLANNING: ['GENERATING', 'FAILED', 'CANCELLED'],
  GENERATING: ['PROCESSING', 'FAILED', 'CANCELLED', 'RETRYING'], // FIXED: only PROCESSING after GENERATING, not VERIFYING directly — strict order
  PROCESSING: ['VERIFYING', 'FAILED', 'CANCELLED', 'RETRYING'], // FIXED: only VERIFYING after PROCESSING
  VERIFYING: ['SAVING', 'FAILED', 'CANCELLED'], // FIXED per requirement: only SAVING, FAILED, CANCELLED — removed RETRYING and PROCESSING
  SAVING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['IDLE', 'VALIDATING'], // allow regenerate
  FAILED: ['RETRYING', 'IDLE', 'VALIDATING', 'CANCELLED'],
  CANCELLED: ['IDLE', 'VALIDATING'],
  RETRYING: ['GENERATING', 'FAILED', 'CANCELLED'],
};

export function isValidTransition(from: GenerationState, to: GenerationState): boolean {
  const allowed = VALID_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function transitionState(
  current: GenerationJobState,
  nextState: GenerationState,
  extra?: Partial<GenerationJobState>
): { ok: boolean; newState?: GenerationJobState; error?: string } {
  if (!isValidTransition(current.state, nextState)) {
    return {
      ok: false,
      error: `Invalid transition ${current.state} → ${nextState}. Allowed: ${VALID_TRANSITIONS[current.state].join(', ')}`,
    };
  }
  const now = new Date().toISOString();
  return {
    ok: true,
    newState: {
      ...current,
      previousState: current.state,
      state: nextState,
      updatedAt: now,
      ...extra,
    },
  };
}

export function createInitialJobState(params: {
  jobId: string;
  projectId: string;
  characterId?: string;
  visualStyle?: string;
  idempotencyKey?: string;
}): GenerationJobState {
  const now = new Date().toISOString();
  return {
    jobId: params.jobId,
    projectId: params.projectId,
    characterId: params.characterId,
    state: 'IDLE',
    progress: 0,
    attempt: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    visualStyle: params.visualStyle || 'anime',
    idempotencyKey: params.idempotencyKey,
  };
}

export function getStateProgress(state: GenerationState): number {
  switch (state) {
    case 'IDLE': return 0;
    case 'VALIDATING': return 10;
    case 'PLANNING': return 20;
    case 'GENERATING': return 50;
    case 'PROCESSING': return 70;
    case 'VERIFYING': return 85;
    case 'SAVING': return 95;
    case 'COMPLETED': return 100;
    case 'FAILED': return 0;
    case 'CANCELLED': return 0;
    case 'RETRYING': return 30;
    default: return 0;
  }
}
