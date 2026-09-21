// NEXUS — CHARACTER VISUAL REFERENCE — TYPES — STRICT STORY GROUNDING
// JANGAN mengubah sistem grounding yang sudah PASS
// JANGAN membuat karakter baru, ubah nama, sifat/kepribadian/fisik yang sudah tervalidasi

export type CharacterImageState = 'NO_IMAGE' | 'GENERATING' | 'VALIDATING' | 'READY' | 'ERROR'

export interface CharacterVisualPromptData {
  characterId: string
  name: string
  role: string
  gender?: string
  age?: string
  physical?: string
  hair?: string
  face?: string
  body?: string
  clothing?: string
  personality?: string
  visualTraits?: string
  specialCharacteristics?: string
  dominantEmotion?: string
  storyRole?: string
  groundingSource?: string
  sourceStoryId?: string
}

export interface CharacterReferenceImage {
  characterId: string
  characterName: string
  referenceImage: string // URL or base64 or filename
  referenceImageUrl: string
  referenceImageId: string
  visualPrompt: string
  negativePrompt: string
  visualSeed: number
  visualModel: string
  generatedAt: string
  isCanonical: boolean
  validation: CharacterReferenceValidation
  metadata: {
    width: number
    height: number
    aspectRatio: string
    fullBody: boolean
    headVisible: boolean
    feetVisible: boolean
    noCrop: boolean
    groundingPass: boolean
  }
}

export interface CharacterReferenceValidation {
  isValid: boolean
  status: 'PASS' | 'FAIL'
  checks: {
    characterExists: { pass: boolean; reason: string }
    groundingPass: { pass: boolean; reason: string }
    imageExists: { pass: boolean; reason: string }
    validFormat: { pass: boolean; reason: string }
    fullBody: { pass: boolean; reason: string }
    headVisible: { pass: boolean; reason: string }
    feetVisible: { pass: boolean; reason: string }
    noCrop: { pass: boolean; reason: string }
    visualPromptExists: { pass: boolean; reason: string }
    referenceAvailable: { pass: boolean; reason: string }
  }
  overallReason: string
}

export interface BuildCharacterVisualPromptResult {
  visualPrompt: string
  negativePrompt: string
  promptData: CharacterVisualPromptData
  isGrounded: boolean
  groundingNotes: string[]
}
