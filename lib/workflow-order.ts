// NEXUS — SISTEM NAVIGASI WORKFLOW UTAMA — SINGLE SOURCE CONFIG — MASTER ORDER
// MASTER ORDER: 1.CERITA 2.NASKAH 3.KARAKTER 4.DUNIA 5.PAPAN CERITA 6.GAMBAR 7.GERAKAN 8.SUARA 9.AUDIO
export const WORKFLOW_STAGES = ["cerita","naskah","karakter","dunia","papan-cerita","gambar","gerakan","suara","audio"] as const
export type WorkflowStageIndo = typeof WORKFLOW_STAGES[number]

export const MASTER_WORKFLOW_ORDER = [
  { id: 'story', indo: 'cerita', label: 'Cerita', indoLabel: 'Cerita', icon: '📖', step: 1 },
  { id: 'script', indo: 'naskah', label: 'Naskah', indoLabel: 'Naskah', icon: '📄', step: 2 },
  { id: 'character', indo: 'karakter', label: 'Karakter', indoLabel: 'Karakter', icon: '👤', step: 3 },
  { id: 'world', indo: 'dunia', label: 'Dunia', indoLabel: 'Dunia', icon: '🌐', step: 4 },
  { id: 'storyboard', indo: 'papan-cerita', label: 'Papan Cerita', indoLabel: 'Papan Cerita', icon: '🖼️', step: 5 },
  { id: 'drawing', indo: 'gambar', label: 'Gambar', indoLabel: 'Gambar', icon: '✏️', step: 6 },
  { id: 'motion', indo: 'gerakan', label: 'Gerakan', indoLabel: 'Gerakan', icon: '▶️', step: 7 },
  { id: 'voice', indo: 'suara', label: 'Suara', indoLabel: 'Suara', icon: '🎙️', step: 8 },
  { id: 'audio', indo: 'audio', label: 'Audio', indoLabel: 'Audio', icon: '🔊', step: 9 },
] as const

export const getWorkflowIndex = (viewId: string): number => {
  return MASTER_WORKFLOW_ORDER.findIndex(s => s.id === viewId || s.indo === viewId)
}
export const getNextStage = (currentId: string): string | null => {
  const idx = getWorkflowIndex(currentId)
  if (idx === -1) return null
  if (idx >= MASTER_WORKFLOW_ORDER.length - 1) return null // AUDIO is last — Lanjutkan disabled
  return MASTER_WORKFLOW_ORDER[idx + 1].id
}
export const getPrevStage = (currentId: string): string | null => {
  const idx = getWorkflowIndex(currentId)
  if (idx === -1) return null
  if (idx <= 0) return null // CERITA is first — Kembali disabled
  return MASTER_WORKFLOW_ORDER[idx - 1].id
}
export const getNextStageIndo = (currentId: string): string | null => {
  const idx = getWorkflowIndex(currentId)
  if (idx === -1) return null
  if (idx >= MASTER_WORKFLOW_ORDER.length - 1) return null
  return MASTER_WORKFLOW_ORDER[idx + 1].indo
}
export const getPrevStageIndo = (currentId: string): string | null => {
  const idx = getWorkflowIndex(currentId)
  if (idx === -1) return null
  if (idx <= 0) return null
  return MASTER_WORKFLOW_ORDER[idx - 1].indo
}
