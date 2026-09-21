// lib/character-visual/approve-state-machine.ts — TAHAP 6 — APPROVE CHARACTER STATE MACHINE
// Audit mengapa Approve dapat disabled/stuck
// Approve hanya enabled jika: grounding PASS, required image tersedia, visual reference tersedia, reference validation PASS, state valid, tidak generating, tidak FAILED

import { ReferenceValidator, CharacterReference, ReferenceState } from './reference-validator'

export type ApproveState = 'DISABLED' | 'ENABLED' | 'APPROVED' | 'BLOCKED'

export interface ApproveCheck {
  check: string
  pass: boolean
  reason: string
  required: boolean
}

export interface ApproveStateResult {
  state: ApproveState
  canApprove: boolean
  reason: string
  checks: ApproveCheck[]
  referenceState: ReferenceState
  groundingPass: boolean
  imagesAvailable: number
  totalCharacters: number
  isGenerating: boolean
  isFailed: boolean
  buttonDisabled: boolean
  buttonReason: string
  timestamp: string
}

export class ApproveStateMachine {
  static evaluate(params: {
    references: CharacterReference[]
    totalCharacters: number
    groundingPass: boolean
    isGenerating: boolean
    hasFailed?: boolean
    storyId?: string
  }): ApproveStateResult {
    const { references, totalCharacters, groundingPass, isGenerating, hasFailed = false, storyId } = params

    const checks: ApproveCheck[] = []

    // Check 1: grounding PASS
    checks.push({
      check: 'character_grounding',
      pass: groundingPass,
      reason: groundingPass ? 'Character grounding PASS — Source story → Character record → Physical → Personality → Visual traits grounded' : 'Character grounding FAIL — Must PASS before approve — Check story grounding',
      required: true,
    })

    // Check 2: required character image tersedia
    const imagesAvailable = references.filter(r => !!(r.referenceImage || r.referenceImageUrl)).length
    const imagesPass = imagesAvailable >= totalCharacters && totalCharacters > 0
    checks.push({
      check: 'required_character_image',
      pass: imagesPass,
      reason: imagesPass ? `Required character image tersedia — ${imagesAvailable}/${totalCharacters} — All character images exist` : `Required character image BELUM tersedia — ${imagesAvailable}/${totalCharacters} — Generate character images first — Button disabled + alasan jelas`,
      required: true,
    })

    // Check 3: visual reference tersedia
    const refState = ReferenceValidator.getStateForCollection(references, totalCharacters)
    const visualRefPass = refState.ready >= totalCharacters && totalCharacters > 0
    checks.push({
      check: 'visual_reference',
      pass: visualRefPass,
      reason: visualRefPass ? `Visual reference tersedia — ${refState.ready}/${totalCharacters} — ${refState.message}` : `Visual reference BELUM tersedia — ${refState.ready}/${totalCharacters} — ${refState.message} — Button disabled`,
      required: true,
    })

    // Check 4: reference validation PASS
    const validationResults = references.map(r => ReferenceValidator.validateReference(r, undefined, storyId))
    const allValid = validationResults.length > 0 && validationResults.every(v => v.isValid) && validationResults.length >= totalCharacters
    const validationPass = allValid
    checks.push({
      check: 'reference_validation',
      pass: validationPass,
      reason: validationPass ? `Reference validation PASS — All ${validationResults.length} references validated — file, MIME, dimensions, readable, character association, story association, source association, identity metadata, scene relationship PASS` : `Reference validation BELUM PASS — ${validationResults.filter(v => v.isValid).length}/${validationResults.length} valid — ${validationResults.filter(v => !v.isValid).map(v => v.overallReason.slice(0, 100)).join('; ').slice(0, 300)} — Button disabled`,
      required: true,
    })

    // Check 5: state valid — VALIDATED or READY with enough ready, not FAILED/NOT_READY
    const isFailedOrNotReady = (refState.state as string) === 'FAILED' || (refState.state as string) === 'NOT_READY'
    const stateValid = !isFailedOrNotReady && (refState.state === 'VALIDATED' ? refState.ready >= totalCharacters : refState.ready > 0)
    checks.push({
      check: 'state_valid',
      pass: stateValid && !hasFailed,
      reason: stateValid && !hasFailed ? `State valid — Reference state ${refState.state} — ${refState.message}` : `State NOT valid — Reference state ${refState.state} — ${refState.message} — hasFailed ${hasFailed} — Button disabled`,
      required: true,
    })

    // Check 6: tidak sedang generating
    checks.push({
      check: 'not_generating',
      pass: !isGenerating,
      reason: !isGenerating ? 'Not generating — Ready for approve' : 'Sedang GENERATING — Wait for generation to complete — Button disabled',
      required: true,
    })

    // Check 7: tidak FAILED
    const notFailed = !hasFailed && refState.state !== 'FAILED'
    checks.push({
      check: 'not_failed',
      pass: notFailed,
      reason: notFailed ? 'Not FAILED — No failure state' : `FAILED state — Reference ${refState.state} — hasFailed ${hasFailed} — Fix failed references — Button disabled`,
      required: true,
    })

    const requiredChecks = checks.filter(c => c.required)
    const allRequiredPass = requiredChecks.every(c => c.pass)

    let state: ApproveState
    let canApprove: boolean
    let reason: string
    let buttonDisabled: boolean
    let buttonReason: string

    if (isGenerating) {
      state = 'DISABLED'
      canApprove = false
      reason = 'Approve DISABLED — Still GENERATING — Wait for character image generation to complete'
      buttonDisabled = true
      buttonReason = '⏳ Sedang generating character reference — Tunggu selesai'
    } else if (hasFailed || refState.state === 'FAILED') {
      state = 'BLOCKED'
      canApprove = false
      reason = `Approve BLOCKED — Reference FAILED — ${refState.message} — Fix failed references first`
      buttonDisabled = true
      buttonReason = `❌ Reference FAILED — ${refState.ready}/${totalCharacters} ready — Perbaiki yang gagal`
    } else if (!groundingPass) {
      state = 'DISABLED'
      canApprove = false
      reason = 'Approve DISABLED — Character grounding must PASS before approve — Check story grounding'
      buttonDisabled = true
      buttonReason = '❌ Grounding harus PASS dulu — Cek story grounding'
    } else if (imagesAvailable === 0) {
      state = 'DISABLED'
      canApprove = false
      reason = `Approve DISABLED — Required character image BELUM tersedia — 0/${totalCharacters} — Generate character images first — Button disabled + alasan jelas`
      buttonDisabled = true
      buttonReason = `📸 Belum ada character image — Generate ${totalCharacters} karakter dulu — 0/${totalCharacters}`
    } else if (imagesAvailable < totalCharacters) {
      state = 'DISABLED'
      canApprove = false
      reason = `Approve DISABLED — Required character image PARTIAL — ${imagesAvailable}/${totalCharacters} — ${totalCharacters - imagesAvailable} masih missing — Generate remaining`
      buttonDisabled = true
      buttonReason = `📸 Baru ${imagesAvailable}/${totalCharacters} image ready — Generate ${totalCharacters - imagesAvailable} lagi`
    } else if (!validationPass) {
      state = 'DISABLED'
      canApprove = false
      reason = `Approve DISABLED — Reference validation BELUM PASS — ${validationResults.filter(v => v.isValid).length}/${validationResults.length} valid — Check file, MIME, dimensions, readable, character association, story association, source association, identity metadata, scene relationship`
      buttonDisabled = true
      buttonReason = `🔍 Validasi belum PASS — ${validationResults.filter(v => v.isValid).length}/${validationResults.length} valid — Cek file, MIME, dimensi`
    } else if (allRequiredPass) {
      state = 'ENABLED'
      canApprove = true
      reason = `Approve ENABLED — All checks PASS — Grounding PASS, ${imagesAvailable}/${totalCharacters} images tersedia, visual reference ${refState.ready}/${totalCharacters} tersedia, validation PASS, state valid ${refState.state}, not generating, not FAILED — Ready for APPROVE → Final video generation`
      buttonDisabled = false
      buttonReason = `✅ Siap Approve — ${imagesAvailable}/${totalCharacters} references VALIDATED — Lanjut generate final video`
    } else {
      state = 'DISABLED'
      canApprove = false
      reason = `Approve DISABLED — Some required checks FAIL — ${checks.filter(c => !c.pass && c.required).map(c => `${c.check}: ${c.reason.slice(0, 80)}`).join('; ')}`
      buttonDisabled = true
      buttonReason = `❌ Belum siap — ${checks.filter(c => !c.pass && c.required).length} checks gagal — ${checks.filter(c => !c.pass && c.required)[0]?.reason.slice(0, 80)}`
    }

    return {
      state,
      canApprove,
      reason,
      checks,
      referenceState: refState.state,
      groundingPass,
      imagesAvailable,
      totalCharacters,
      isGenerating,
      isFailed: hasFailed || refState.state === 'FAILED',
      buttonDisabled,
      buttonReason,
      timestamp: new Date().toISOString(),
    }
  }

  static getButtonProps(result: ApproveStateResult): { disabled: boolean; title: string; reason: string; variant: 'primary' | 'secondary' | 'disabled' } {
    if (result.canApprove) {
      return {
        disabled: false,
        title: result.buttonReason,
        reason: result.reason,
        variant: 'primary',
      }
    } else {
      return {
        disabled: true,
        title: result.buttonReason,
        reason: result.reason,
        variant: 'disabled',
      }
    }
  }
}
