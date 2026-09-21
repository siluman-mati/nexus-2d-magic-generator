// lib/visual-pipeline/types.ts — NEXUS AUTONOMOUS VISUAL PRODUCTION PIPELINE — STRICT STORY GROUNDED PRODUCTION
// Pipeline: SOURCE STORY → STORY EVENTS → NASKAH → EPISODE → SCENE → CHARACTER+LOCATION+ACTION+EMOTION → VISUAL PROMPT → CHARACTER REFERENCE → COMFYUI → IMAGE → VALIDATION

export type GenerationStatus = 'QUEUED' | 'GENERATING' | 'GENERATED' | 'VALIDATING' | 'PASS' | 'FAIL' | 'RETRY' | 'COMPLETE' | 'NOT_COMPLETE'

export interface SceneGrounding {
  episode_id: string
  scene_id: string
  scene_number: number
  scene_number_in_episode: number
  duration_seconds: number
  duration_formatted: string
  story_event: string // source story event — must be traceable
  script_reference: string // script scene reference — must be traceable
  story_part: string // awal/tengah/akhir/conflict/ending
  characters: string[] // character names — must match story/script
  location: {
    name: string
    location_id: string
    description: string
  }
  time: string // malam/pagi/siang/sore — from story/script
  action: string // action from script — grounded
  dialogue: Array<{ character: string; line: string; emotion: string }>
  emotion: string // overall emotion
  camera: string // camera framing — must be full body for character ref
  lighting: string
  visual_prompt: string // story-grounded visual prompt — must include CHARACTER, APPEARANCE, CLOTHING, EXPRESSION, POSE, ACTION, LOCATION, ENVIRONMENT, TIME, LIGHTING, CAMERA, COMPOSITION, MOOD
  negative_prompt: string // prevent cropped, half body, extra limbs, etc
  continuity_reference: string // previous scene id — for continuity
  grounding: {
    source_story: boolean
    script: boolean
    characters_from_story: boolean
    location_from_story: boolean
    no_new_event: boolean
    no_new_character: boolean
    no_new_location: boolean
    faithful: boolean
    traceable: boolean
  }
  continuity: {
    previous_scene: string | null
    character_continuity: string
    location_continuity: string
    time_continuity: string
    action_continuity: string
    emotion_continuity: string
    story_continuity: string
  }
  visual: {
    type: 'full_body' // mandatory for character reference
    framing: string // full body head to toe
    background: string
    mood: string
  }
}

export interface CharacterReferenceVisual {
  character_id: string
  canonical_name: string
  reference_image: string // url or base64 — reusable
  physical_description: string
  clothing: string
  personality: string
  visual_traits: string // hair, face, body, accessories
  source_story_id: string
  grounding: {
    faithful: boolean
    traceable: boolean
    no_extra: boolean
  }
  visual: {
    type: 'full_body' // mandatory
    framing: string // full body head to toe both legs hands visible
    pose: string // neutral reference pose
    background: string // neutral light gray
  }
  consistency: {
    name: string
    physical: string
    age_visual: string
    hair: string
    face: string
    body: string
    clothing: string
    accessories: string
    personality: string
    traits: string
    relationships: string
  }
}

export interface VisualPromptComponents {
  CHARACTER: string
  APPEARANCE: string
  CLOTHING: string
  EXPRESSION: string
  POSE: string
  ACTION: string
  LOCATION: string
  ENVIRONMENT: string
  TIME: string
  LIGHTING: string
  CAMERA: string
  COMPOSITION: string
  MOOD: string
  full_prompt: string
  grounded_in: 'SOURCE_STORY+NASKAH'
}

export interface ComfyUIGenerationRequest {
  project_id: string
  episode_id: string
  scene_id: string
  character_ids: string[]
  character_reference_images: Array<{ character_id: string; reference_image: string; canonical_name: string }>
  location: string
  action: string
  emotion: string
  camera: string
  lighting: string
  visual_prompt: string
  negative_prompt: string
  aspect_ratio: string
  seed: number
  model: string
  width: number
  height: number
  steps: number
  cfg: number
  workflow_id?: string // reusable workflow
}

export interface ComfyUIGenerationResponse {
  status: 'SUCCESS' | 'ENGINE_OFFLINE' | 'GENERATING' | 'ERROR' | 'FAILED' | 'QUEUED'
  image?: string
  images?: string[]
  seed: number
  workflow_id: string
  generation_metadata: {
    model: string
    model_used: string
    prompt: string
    negative_prompt: string
    width: number
    height: number
    steps: number
    cfg: number
    seed: number
    duration_ms: number
    timestamp: string
    character_references_used: string[]
    aspect_ratio: string
  }
  error?: string
}

export interface SceneValidation {
  scene_id: string
  episode_id: string
  status: GenerationStatus
  checks: {
    STORY_MATCH: { pass: boolean; reason: string }
    SCRIPT_MATCH: { pass: boolean; reason: string }
    CHARACTER_MATCH: { pass: boolean; reason: string }
    CHARACTER_COUNT: { pass: boolean; reason: string }
    PHYSICAL_CONSISTENCY: { pass: boolean; reason: string }
    PERSONALITY_CONSISTENCY: { pass: boolean; reason: string }
    LOCATION_MATCH: { pass: boolean; reason: string }
    ACTION_MATCH: { pass: boolean; reason: string }
    DIALOGUE_MATCH: { pass: boolean; reason: string }
    EMOTION_MATCH: { pass: boolean; reason: string }
    EVENT_MATCH: { pass: boolean; reason: string }
    TIMELINE_MATCH: { pass: boolean; reason: string }
    CONTINUITY_MATCH: { pass: boolean; reason: string }
    NO_NEW_CHARACTER: { pass: boolean; reason: string }
    NO_NEW_LOCATION: { pass: boolean; reason: string }
    NO_NEW_EVENT: { pass: boolean; reason: string }
    FULL_BODY_CHARACTER_REFERENCE: { pass: boolean; reason: string }
    SCENE_COUNT: { pass: boolean; reason: string }
    EPISODE_DURATION: { pass: boolean; reason: string }
  }
  isValid: boolean
  overallReason: string
  retry_count: number
  previous_fail_reasons?: string[]
}

export interface EpisodeAudit {
  episode_id: string
  source_story_id: string
  source_story_title: string
  duration_seconds: number
  total_scenes: number
  expected_scenes: number
  checks: {
    STORY_TO_SCRIPT: { pass: boolean; reason: string }
    SCRIPT_TO_EPISODE: { pass: boolean; reason: string }
    EPISODE_TO_SCENE: { pass: boolean; reason: string }
    SCENE_TO_CHARACTER: { pass: boolean; reason: string }
    SCENE_TO_LOCATION: { pass: boolean; reason: string }
    SCENE_TO_ACTION: { pass: boolean; reason: string }
    SCENE_TO_EMOTION: { pass: boolean; reason: string }
    SCENE_TO_VISUAL: { pass: boolean; reason: string }
    VISUAL_TO_CONTINUITY: { pass: boolean; reason: string }
    GROUNDING: { pass: boolean; reason: string }
    CHARACTER: { pass: boolean; reason: string }
    CONTINUITY: { pass: boolean; reason: string }
    VISUAL: { pass: boolean; reason: string }
    SCENE_COUNT: { pass: boolean; reason: string }
    DURATION: { pass: boolean; reason: string }
  }
  scene_validations: SceneValidation[]
  isComplete: boolean
  final_status: 'COMPLETE' | 'NOT_COMPLETE'
  overallReason: string
  evidence: {
    sourceStory: string
    totalScenes: number
    expectedScenes: number
    duration: number
    characters: string[]
    locations: string[]
    continuity: boolean
    allScenesPass: boolean
  }
}

export interface VisualProductionPipelineRequest {
  project_id: string
  story: any // StoryOutput
  script: any // ScriptOutput
  characters: any // CharacterOutput
  episode?: any // EpisodeOutput — if not provided, will generate automatically
  duration_seconds: number // 15,30,45,60,75,90,120 — auto scene count = duration/7.5
  episode_number?: number
  aspect_ratio?: string
  model?: string // qwen-image primary, flux-klein-4b fallback
  comfyui_url?: string
  seed?: number
}

export interface VisualProductionPipelineResponse {
  ok: boolean
  project_id: string
  episode_id: string
  duration_seconds: number
  total_scenes: number
  expected_scenes: number
  scenes: Array<{
    scene: SceneGrounding
    character_references: CharacterReferenceVisual[]
    visual_prompt_components: VisualPromptComponents
    generation_request: ComfyUIGenerationRequest
    generation_response: ComfyUIGenerationResponse
    validation: SceneValidation
    image_asset?: any
    status: GenerationStatus
  }>
  episode_audit: EpisodeAudit
  final_status: 'COMPLETE' | 'NOT_COMPLETE'
  message: string
  architecture: string
}

export const DURATION_SCENE_MAP: Record<number, number> = {
  15: 2,
  30: 4,
  45: 6,
  60: 8,
  75: 10,
  90: 12,
  120: 16
}

export function getSceneCountFromDuration(duration: number): number {
  if (DURATION_SCENE_MAP[duration]) return DURATION_SCENE_MAP[duration]
  return Math.round(duration / 7.5)
}

export function getDurationFromSceneCount(sceneCount: number): number {
  return sceneCount * 7.5
}

export const NEGATIVE_PROMPT_BASE = `cropped body, half body, extra limbs, extra fingers, duplicate character, wrong character, wrong clothing, wrong location, wrong age, inconsistent face, deformed anatomy, missing feet, missing hands, unwanted text, watermark, random characters, blurry, low quality, distorted, deformed, bad anatomy, bad proportions, cropped, bust shot, portrait close-up, headshot, waist-up, cut off at knees, cut off at feet, lowres, bad hands, extra fingers, missing fingers, extra limbs, disfigured, ugly, duplicate, extra characters, new characters not in story, new locations, low quality`
