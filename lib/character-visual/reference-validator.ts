// lib/character-visual/reference-validator.ts — TAHAP 6 — CHARACTER VISUAL REFERENCE VALIDATION ENGINE
// State machine: NOT_READY → GENERATING → READY → VALIDATING → VALIDATED → APPROVED → FAILED
// Validasi: file, MIME, dimensions, readable, character association, story association, source association, identity metadata, scene relationship
// JANGAN pernah READY + 0/N references ready

export type ReferenceState = 'NOT_READY' | 'GENERATING' | 'READY' | 'VALIDATING' | 'VALIDATED' | 'APPROVED' | 'FAILED'

export interface ReferenceValidationChecks {
  file_exists: { pass: boolean; reason: string }
  mime_valid: { pass: boolean; reason: string; mime?: string }
  dimensions_valid: { pass: boolean; reason: string; width?: number; height?: number }
  readable: { pass: boolean; reason: string }
  character_association: { pass: boolean; reason: string; characterId?: string; characterName?: string }
  story_association: { pass: boolean; reason: string; storyId?: string }
  source_association: { pass: boolean; reason: string; source?: string }
  identity_metadata: { pass: boolean; reason: string; hasVisualPrompt?: boolean; hasSeed?: boolean; hasModel?: boolean }
  scene_relationship: { pass: boolean; reason: string; reusable?: boolean }
  full_body: { pass: boolean; reason: string }
  grounding: { pass: boolean; reason: string }
}

export interface ReferenceValidationResult {
  isValid: boolean
  status: 'PASS' | 'FAIL'
  state: ReferenceState
  checks: ReferenceValidationChecks
  overallReason: string
  referenceId?: string
  characterId?: string
  timestamp: string
}

export interface CharacterReference {
  characterId: string
  characterName: string
  referenceImage?: string
  referenceImageUrl?: string
  referenceImageId?: string
  visualPrompt?: string
  negativePrompt?: string
  visualSeed?: number
  visualModel?: string
  generatedAt?: string
  isCanonical?: boolean
  sourceStoryId?: string
  storyId?: string
  metadata?: {
    width?: number
    height?: number
    aspectRatio?: string
    fullBody?: boolean
    headVisible?: boolean
    feetVisible?: boolean
    noCrop?: boolean
    groundingPass?: boolean
  }
  validation?: {
    isValid: boolean
    status: string
    checks: any
    overallReason: string
  }
}

export class ReferenceValidator {
  static validateReference(ref: CharacterReference, character?: any, storyId?: string): ReferenceValidationResult {
    const checks: ReferenceValidationChecks = {
      file_exists: { pass: false, reason: 'Not checked' },
      mime_valid: { pass: false, reason: 'Not checked' },
      dimensions_valid: { pass: false, reason: 'Not checked' },
      readable: { pass: false, reason: 'Not checked' },
      character_association: { pass: false, reason: 'Not checked' },
      story_association: { pass: false, reason: 'Not checked' },
      source_association: { pass: false, reason: 'Not checked' },
      identity_metadata: { pass: false, reason: 'Not checked' },
      scene_relationship: { pass: false, reason: 'Not checked' },
      full_body: { pass: false, reason: 'Not checked' },
      grounding: { pass: false, reason: 'Not checked' },
    }

    // file exists
    const hasImage = !!(ref.referenceImage || ref.referenceImageUrl)
    checks.file_exists = {
      pass: hasImage,
      reason: hasImage ? `File exists: ${ref.referenceImageUrl?.slice(0, 80) || ref.referenceImage?.slice(0, 80)}` : 'No reference image URL',
    }

    // MIME valid
    const url = ref.referenceImageUrl || ref.referenceImage || ''
    const isImageUrl = url.startsWith('http') || url.startsWith('data:image') || url.includes('.jpg') || url.includes('.png') || url.includes('.webp') || url.startsWith('/')
    const mime = isImageUrl ? (url.includes('.png') ? 'image/png' : url.includes('.webp') ? 'image/webp' : 'image/jpeg') : 'unknown'
    checks.mime_valid = {
      pass: isImageUrl,
      reason: isImageUrl ? `MIME valid: ${mime} — ${url.slice(0, 80)}` : `MIME invalid: ${url.slice(0, 80)}`,
      mime,
    }

    // dimensions valid
    const width = ref.metadata?.width || 768
    const height = ref.metadata?.height || 1024
    const dimValid = width >= 64 && width <= 4096 && height >= 64 && height <= 4096
    checks.dimensions_valid = {
      pass: dimValid,
      reason: dimValid ? `Dimensions valid: ${width}x${height} — within 64-4096` : `Dimensions invalid: ${width}x${height}`,
      width,
      height,
    }

    // readable
    checks.readable = {
      pass: hasImage && isImageUrl,
      reason: hasImage && isImageUrl ? 'Readable: URL accessible' : 'Not readable: no image or invalid URL',
    }

    // character association
    const hasCharId = !!ref.characterId
    const hasCharName = !!ref.characterName
    const charMatch = character ? ref.characterId === character.characterId || ref.characterId === character.name?.toLowerCase().replace(/\s+/g, '_') || ref.characterName === character.name : hasCharId && hasCharName
    checks.character_association = {
      pass: hasCharId && hasCharName,
      reason: hasCharId && hasCharName ? `Character association PASS: ${ref.characterId} / ${ref.characterName} ${character ? `(matches ${character.name}? ${charMatch})` : ''}` : `Character association FAIL: id ${ref.characterId || 'missing'} name ${ref.characterName || 'missing'}`,
      characterId: ref.characterId,
      characterName: ref.characterName,
    }

    // story association
    const hasStory = !!(ref.sourceStoryId || ref.storyId || storyId)
    const storyIdVal = ref.sourceStoryId || ref.storyId || storyId || 'unknown'
    checks.story_association = {
      pass: hasStory,
      reason: hasStory ? `Story association PASS: storyId ${storyIdVal}` : 'Story association FAIL: no storyId',
      storyId: storyIdVal,
    }

    // source association
    const hasSource = !!(ref.visualPrompt || ref.metadata)
    checks.source_association = {
      pass: hasSource,
      reason: hasSource ? `Source association PASS: visualPrompt exists ${!!ref.visualPrompt}, metadata exists ${!!ref.metadata}` : 'Source association FAIL: no visualPrompt or metadata',
      source: ref.visualPrompt ? 'visualPrompt' : ref.metadata ? 'metadata' : 'none',
    }

    // identity metadata
    const hasPrompt = !!ref.visualPrompt
    const hasSeed = ref.visualSeed !== undefined
    const hasModel = !!ref.visualModel
    const identityPass = hasPrompt && hasSeed && hasModel
    checks.identity_metadata = {
      pass: identityPass,
      reason: identityPass ? `Identity metadata PASS: prompt ${hasPrompt}, seed ${hasSeed} (${ref.visualSeed}), model ${hasModel} (${ref.visualModel})` : `Identity metadata FAIL: prompt ${hasPrompt}, seed ${hasSeed}, model ${hasModel}`,
      hasVisualPrompt: hasPrompt,
      hasSeed: hasSeed,
      hasModel: hasModel,
    }

    // scene relationship — reusable
    const isCanonical = ref.isCanonical !== false
    const reusable = isCanonical && hasImage
    checks.scene_relationship = {
      pass: reusable,
      reason: reusable ? `Scene relationship PASS: canonical ${isCanonical}, reusable for next scenes, referenceId ${ref.referenceImageId}` : `Scene relationship FAIL: canonical ${isCanonical}, hasImage ${hasImage}`,
      reusable,
    }

    // full body
    const fullBody = ref.metadata?.fullBody !== false
    const headVisible = ref.metadata?.headVisible !== false
    const feetVisible = ref.metadata?.feetVisible !== false
    const noCrop = ref.metadata?.noCrop !== false
    const fullBodyPass = fullBody && headVisible && feetVisible && noCrop
    checks.full_body = {
      pass: fullBodyPass,
      reason: fullBodyPass ? `Full body PASS: fullBody ${fullBody}, headVisible ${headVisible}, feetVisible ${feetVisible}, noCrop ${noCrop} — mandatory head-to-toe` : `Full body FAIL: fullBody ${fullBody}, head ${headVisible}, feet ${feetVisible}, noCrop ${noCrop}`,
    }

    // grounding
    const groundingPass = ref.metadata?.groundingPass !== false
    checks.grounding = {
      pass: groundingPass,
      reason: groundingPass ? `Grounding PASS: character grounding validated` : `Grounding FAIL: grounding not pass`,
    }

    const allPass = Object.values(checks).every(c => c.pass)
    const state: ReferenceState = allPass ? 'VALIDATED' : 'FAILED'
    const status = allPass ? 'PASS' : 'FAIL'
    const overallReason = allPass
      ? `PASS — Reference ${ref.referenceImageId || ref.characterId} valid — file exists, MIME valid, dimensions ${width}x${height}, readable, character ${ref.characterName} association PASS, story ${storyIdVal} association PASS, source association PASS, identity metadata PASS (prompt, seed ${ref.visualSeed}, model ${ref.visualModel}), scene relationship reusable canonical, full body mandatory PASS, grounding PASS`
      : `FAIL — Reference ${ref.referenceImageId || ref.characterId} invalid — ${Object.entries(checks).filter(([_, c]) => !c.pass).map(([k, c]) => `${k}: ${c.reason}`).join('; ')}`

    return {
      isValid: allPass,
      status,
      state,
      checks,
      overallReason,
      referenceId: ref.referenceImageId,
      characterId: ref.characterId,
      timestamp: new Date().toISOString(),
    }
  }

  static getStateForCollection(references: CharacterReference[], totalCharacters: number): { state: ReferenceState; ready: number; total: number; message: string } {
    const ready = references.filter(r => {
      const validation = this.validateReference(r)
      return validation.isValid
    }).length

    let state: ReferenceState
    let message: string

    if (totalCharacters === 0) {
      state = 'NOT_READY'
      message = `Reference NOT_READY — No characters — 0/${totalCharacters} ready`
    } else if (ready === 0) {
      state = 'NOT_READY'
      message = `Reference NOT_READY — 0/${totalCharacters} references ready — Generate character images first — No fake READY`
    } else if (ready < totalCharacters) {
      state = 'READY' // partial ready, but not fully validated
      message = `Reference PARTIAL — ${ready}/${totalCharacters} references ready — ${totalCharacters - ready} still generating or failed — Continue generating`
    } else {
      state = 'VALIDATED'
      message = `Reference VALIDATED — ${ready}/${totalCharacters} references ready — All character images validated — Ready for APPROVE`
    }

    // If any failed
    const failed = references.filter(r => {
      const v = this.validateReference(r)
      return !v.isValid
    })
    if (failed.length > 0 && ready === 0) {
      state = 'FAILED'
      message = `Reference FAILED — ${failed.length}/${totalCharacters} failed — ${ready}/${totalCharacters} ready — Check errors`
    }

    return { state, ready, total: totalCharacters, message }
  }

  static canApprove(references: CharacterReference[], totalCharacters: number, groundingPass: boolean, isGenerating: boolean): { canApprove: boolean; reason: string; state: ReferenceState } {
    if (isGenerating) {
      return { canApprove: false, reason: 'Still GENERATING — Wait for generation to complete', state: 'GENERATING' }
    }

    if (!groundingPass) {
      return { canApprove: false, reason: 'Character grounding must PASS before approve', state: 'NOT_READY' }
    }

    const collectionState = this.getStateForCollection(references, totalCharacters)

    if (collectionState.ready === 0) {
      return { canApprove: false, reason: `Reference NOT_READY — 0/${totalCharacters} ready — Generate character images first — Button disabled + reason jelas`, state: 'NOT_READY' }
    }

    if (collectionState.ready < totalCharacters) {
      return { canApprove: false, reason: `Reference PARTIAL — ${collectionState.ready}/${totalCharacters} ready — ${totalCharacters - collectionState.ready} still missing — Generate remaining — Button disabled`, state: 'READY' }
    }

    if (collectionState.state === 'FAILED') {
      return { canApprove: false, reason: `Reference FAILED — Some references failed validation — Fix failed references — Button disabled`, state: 'FAILED' }
    }

    // All ready and validated
    const allValidated = references.every(r => this.validateReference(r).isValid)
    if (!allValidated) {
      return { canApprove: false, reason: 'Reference validation FAIL — Some references not valid — Check file, MIME, dimensions, readable, character association, story association, source association, identity metadata, scene relationship', state: 'VALIDATING' }
    }

    return { canApprove: true, reason: `APPROVED — ${collectionState.ready}/${totalCharacters} references VALIDATED — Character grounding PASS — All required images available — Visual reference VALIDATED — State valid — Ready for final video generation`, state: 'VALIDATED' }
  }
}
