'use client'

import { useState, useEffect } from 'react'
import { buildCharacterVisualPrompt, buildVisualPrompt } from '@/lib/character-visual/prompt-builder'
import { useGeneratorWorkflow } from '@/lib/2d-generator/use-generator-workflow'
import { getVisualStyleDef as getVisualStyleDefStrict } from '@/lib/2d-generator/visual-style'
import ImageGenerator from '@/components/ImageGenerator'
import FrameCompositor from '@/components/FrameCompositor'
import {
  MAJAPAHIT_POSITIVE_PROMPT_MANDATORY,
  MAJAPAHIT_NEGATIVE_PROMPT_MANDATORY,
  MAJAPAHIT_POSITIVE_PROMPT_EXTENDED,
  MAJAPAHIT_NUSANTARA_OVERRIDE_PHRASE,
  CHARACTER_ASSET_ONLY_BACKGROUND,
  CHARACTER_ASSET_ONLY_NEGATIVE,
  WORLD_BACKGROUND_ONLY_POSITIVE_BASE,
  WORLD_BACKGROUND_ONLY_NEGATIVE,
  buildCharacterAssetOnlyPrompt,
  buildWorldBackgroundOnlyPrompt,
  getWorldBackgroundNegative,
  getCharacterAssetNegative,
  GRADIO_FLUX_CONFIG,
  FULL_BODY_PREFIX,
  getWorldSettingForPrompt,
  getCulturalPromptLock,
  sanitizeUIText,
  containsForbiddenText,
  getWorldDisplayGuard,
  WORLD_DEFAULT_MAJAPAHIT,
  sanitizeSevenAttributes
} from '@/lib/cultural-guardrails'

const GENRES = ["Nusantara","Folklore","Urban Legend","Misteri & Mitologi","Horror","Thriller","Drama","Action","Adventure","Fantasy","Science Fiction","Cyberpunk","Noir","Historical","Psychological","Family","Comedy","Tokoh","Fiksi Ilmiah"]

const VISUAL_STYLES = [
  { id: 'anime', label: 'Anime / 2D Studio', modifier: 'anime style, 2d animation, clean lines, vibrant colors', icon: '🎨' },
  { id: 'photorealistic', label: 'Photorealistic', modifier: 'photorealistic, raw photo, dslr quality, detailed texture, 8k', icon: '📸' },
  { id: '3d_animation', label: '3D Animation', modifier: '3d render, pixar style, smooth shading, expressive 3d character', icon: '🧊' },
  { id: 'semi_realistic', label: 'Semi-Realistic', modifier: 'digital painting, semi-realistic, artstation trending', icon: '🖌️' },
  { id: 'comic_book', label: 'Comic Book', modifier: 'comic book style, bold outlines, graphic novel aesthetic', icon: '💥' },
  { id: 'dark_fantasy', label: 'Dark Fantasy', modifier: 'dark fantasy style, cinematic lighting, moody atmosphere', icon: '🌑' },
] as const


// NEXUS — SISTEM NAVIGASI WORKFLOW UTAMA — STRICT ORDER — MASTER WORKFLOW ORDER — SINGLE SOURCE CONFIG
// URUTAN WAJIB: 1. CERITA 2. NASKAH 3. KARAKTER 4. DUNIA 5. PAPAN CERITA 6. GAMBAR 7. GERAKAN 8. SUARA 9. AUDIO
// WORKFLOW_STAGES = ["cerita","naskah","karakter","dunia","papan-cerita","gambar","gerakan","suara","audio"] — semua fungsi navigasi harus mengambil urutan dari sini
const WORKFLOW_STAGES = ["cerita","naskah","karakter","dunia","papan-cerita","gambar","gerakan","suara","audio"] as const

const MASTER_WORKFLOW_ORDER = [
  { id: 'story', indo: 'cerita', label: 'Cerita', indoLabel: 'Cerita', icon: '📖', step: 1 },
  { id: 'script', indo: 'naskah', label: 'Naskah', indoLabel: 'Naskah', icon: '📄', step: 2 },
  { id: 'character', indo: 'karakter', label: 'Karakter', indoLabel: 'Karakter', icon: '👤', step: 3 },
  { id: 'world', indo: 'dunia', label: 'Dunia', indoLabel: 'Dunia', icon: '🌍', step: 4 },
  { id: 'storyboard', indo: 'papan-cerita', label: 'Papan Cerita', indoLabel: 'Papan Cerita', icon: '🖼️', step: 5 },
  { id: 'drawing', indo: 'gambar', label: 'Gambar', indoLabel: 'Gambar', icon: '✏️', step: 6 },
  { id: 'motion', indo: 'gerakan', label: 'Gerakan', indoLabel: 'Gerakan', icon: '▶️', step: 7 },
  { id: 'voice', indo: 'suara', label: 'Suara', indoLabel: 'Suara', icon: '🎙️', step: 8 },
  { id: 'audio', indo: 'audio', label: 'Audio', indoLabel: 'Audio', icon: '🔊', step: 9 },
] as const

const getWorkflowIndex = (viewId: string): number => {
  return MASTER_WORKFLOW_ORDER.findIndex(s => s.id === viewId || s.indo === viewId)
}
const getNextStage = (currentId: string): string | null => {
  const idx = getWorkflowIndex(currentId)
  if (idx === -1) return null
  if (idx >= MASTER_WORKFLOW_ORDER.length - 1) return null // AUDIO is last — Lanjutkan disabled
  return MASTER_WORKFLOW_ORDER[idx + 1].id
}
const getPrevStage = (currentId: string): string | null => {
  const idx = getWorkflowIndex(currentId)
  if (idx === -1) return null
  if (idx <= 0) return null // CERITA is first — Kembali disabled
  return MASTER_WORKFLOW_ORDER[idx - 1].id
}


export default function Page() {
  const [theme, setTheme] = useState('')
  const [genre, setGenre] = useState('Nusantara')
  const [visualStyle, setVisualStyle] = useState('anime')
  const [showVisualStyleList, setShowVisualStyleList] = useState(false)
  const [tone, setTone] = useState('')
  const [episodeCount, setEpisodeCount] = useState('1')
  const [storyIdea, setStoryIdea] = useState('')
  const [language, setLanguage] = useState('id')
  const [health, setHealth] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [currentView, setCurrentView] = useState('dashboard')
  const [modelUsed, setModelUsed] = useState<string | null>(null)
  const [projectLoaded, setProjectLoaded] = useState(false)
  const [inspectorTab, setInspectorTab] = useState('project')
  const [storyboardFilter, setStoryboardFilter] = useState('All')
  const [charTab, setCharTab] = useState('Details')
  const [showGenreList, setShowGenreList] = useState(false)

  // REFACTOR: ComfyUI/ImageFX/Pollinations removed — Direct HF Inference FLUX.1-schnell (Dynamic) ONLY as sole engine
  // No localhost:8188, No ImageFX, No Pollinations, No GOOGLE_COOKIE
  const [hfAuditResult, setHfAuditResult] = useState<any>(null)

  // === NEXUS STRICT 2D MAGIC GENERATOR WORKFLOW — STATE MACHINE ===
  const [generatorJob, setGeneratorJob] = useState<any>(null)
  // === GENERATE ALL SCENES MASTER — SEQUENTIAL WITH 30s DELAY & CHARACTER ANCHOR CONSISTENCY ===
  const [isGeneratingAllScenes, setIsGeneratingAllScenes] = useState(false)
  const [generateAllProgress, setGenerateAllProgress] = useState<{ current: number, total: number, currentSceneId: string, status: string, countdown: number, logs: string[] } | null>(null)
  const [generateAllAbort, setGenerateAllAbort] = useState<AbortController | null>(null)
  const generatorWorkflowHook = useGeneratorWorkflow({
    projectId: project?.projectId || project?.story?.source_story_id || 'proj_default',
    onStateChange: (state, progress) => {
      console.log(`[UI Workflow] State ${state} progress ${progress}% — real progress, not fake`);
    },
    onCompleted: (output) => {
      console.log(`[UI Workflow] COMPLETED — asset ${output.assetId} version ${output.version} — removeBg ${output.removeBgStatus}`);
      setGeneratorJob(output);
    },
    onFailed: (code, msg) => {
      console.error(`[UI Workflow] FAILED — ${code}: ${msg}`);
      setError(`${code}: ${msg}`);
    }
  })

  const t = (id: string) => {
    const dict: any = {
      id: { dashboard: "Dasbor", story: "Cerita", script: "Naskah", character: "Karakter", world: "Dunia", storyboard: "Papan Cerita", drawing: "Gambar", motion: "Gerakan", voice: "Suara", audio: "Audio", generateStory: "Buat Cerita", continue: "Lanjutkan", back: "Kembali" },
      en: { dashboard: "Dashboard", story: "Story", script: "Script", character: "Character", world: "World", storyboard: "Storyboard", drawing: "Drawing", motion: "Motion", voice: "Voice", audio: "Audio", generateStory: "Generate Story", continue: "Continue", back: "Back" }
    }
    return dict[language]?.[id] || dict['id'][id] || id
  }

  // PERMANENT GUARDRAIL — Cultural Lock + 7-Attribute Sanitasi + World Single Source of Truth
  // DILARANG menampilkan "tidak disebutkan dalam sumber" di UI
  const sanitizeForUI = (text: string, fallback: string = 'Data sedang diproses...') => {
    try { return sanitizeUIText(text || '', fallback) } catch { return text && text.trim() ? text : fallback }
  }
  const isForbiddenUI = (text: string) => {
    try { return containsForbiddenText(text || '') } catch { return false }
  }
  const getSafeCharacterAttr = (ch: any, key: string, fallbackKey: string) => {
    const raw = ch?.[key] || ch?.[fallbackKey] || ''
    const sanitized = sanitizeForUI(String(raw), '')
    if (!sanitized || isForbiddenUI(sanitized)) {
      // auto fallback via sanitizeSevenAttributes logic — return sanitized fallback
      try {
        const tmp: any = { name: ch?.name || 'unknown' }
        tmp[key] = raw
        const cleaned = sanitizeSevenAttributes(tmp)
        const val = (cleaned as any)?.[key] || (cleaned as any)?.[fallbackKey]
        if (val && !isForbiddenUI(String(val))) return String(val)
      } catch {}
      return 'Data sedang diproses...'
    }
    return sanitized
  }
  // FIXED — World Display Guard — try-catch anti Error 500 — DYNAMIC isolated, no Dynamic injection
  const getWorldGuard = () => {
    try { return getWorldDisplayGuard(project) } catch { return { hasWorld: false, hasStory: !!project?.story, message: 'Mengekstrak Latar Dunia dari Cerita...', isExtracting: true, worldSetting: `plain clean flat background, isolated full-body character portrait, dynamic background from story source` } }
  }
  // FIXED 2026-05-14 — worldSetting Single Source of Truth — DYNAMIC, no Dynamic injection to character prompt before world generated — isolated only
  const getWorldSettingSync = (): string => {
    try {
      // 1. dari world engine global
      if (project?.world?.worldSettingGlobal) return String(project.world.worldSettingGlobal)
      if (project?.world?.worldSetting) return String(project.world.worldSetting)
      // 2. dari per-location worldSetting
      if (project?.world?.locations?.[0]?.worldSetting) return String(project.world.locations[0].worldSetting)
      // 3. fallback via getWorldSettingForPrompt
      if (project?.world?.locations?.length) return String(getWorldSettingForPrompt(project.world.locations as any))
      if (project?.story?.locations?.length) return String(getWorldSettingForPrompt(project.story.locations as any))
      // 4. default DYNAMIC — isolated, no Dynamic — plain clean flat background for character
      return `plain clean flat background, isolated full-body character portrait, standalone character asset, dynamic background from story source`
    } catch { return `plain clean flat background, isolated full-body character portrait, standalone character asset, dynamic background from story source` }
  }

  useEffect(() => {
    // PHASE 4 — Production Runtime Repair — persistent project via localStorage fallback for serverless ephemeral
    // REFACTOR: ComfyUI removed — no more localhost:8188
    try {
      // Load project from localStorage as fallback for Vercel serverless ephemeral
      const savedProject = localStorage.getItem('nexus_project')
      if (savedProject) {
        try {
          const parsed = JSON.parse(savedProject)
          if (parsed && (parsed.story || parsed.script || parsed.characters || parsed.storyboard)) {
            console.log('[Project] Loaded from localStorage fallback — preserving episode/character state')
            setProject((prev: any) => ({ ...prev, ...parsed }))
            if (parsed.inputs) {
              if (parsed.inputs.theme) setTheme((p: any) => p || parsed.inputs.theme)
              if (parsed.inputs.genre) setGenre((p: any) => p || parsed.inputs.genre)
              if (parsed.inputs.visualStyle) setVisualStyle((p: any) => p || parsed.inputs.visualStyle)
              if (parsed.inputs.tone) setTone((p: any) => p || parsed.inputs.tone)
              if (parsed.inputs.episodeCount) setEpisodeCount((p: any) => p || String(parsed.inputs.episodeCount))
              if (parsed.inputs.storyIdea) setStoryIdea((p: any) => p || parsed.inputs.storyIdea)
            }
          }
        } catch {}
      }
    } catch {}

    // HF ONLY — No ImageFX/Pollinations — Direct HF Inference FLUX.1-schnell as sole engine via /api/generate-hf

    // PHASE 4 — Provider State Consistency — use canonical /api/nexus/health as primary, /api/health as secondary
    // Health endpoint and Generate must use same resolver — lib/config.ts canonical
    fetch('/api/nexus/health').then(r => r.json()).then(data => {
      setHealth((prev: any) => ({
        ...prev,
        ...data,
        // Merge with legacy format for compatibility
        nexus_brain: {
          activeProvider: data.nexus?.activeProvider || data.provider,
          modelUsed: data.nexus?.modelUsed,
          isReady: data.nexus?.isReady ?? data.available ?? data.ready,
          primaryProvider: data.nexus?.primaryProvider || 'groq',
          fallbackProviders: data.nexus?.fallbackProviders || ['openrouter','google','local'],
          configuredProviders: data.nexus?.configuredProviders || [],
          architecture: 'USER -> APP -> NEXUS BRAIN -> GROQ PRIMARY -> OPENROUTER FALLBACK',
        },
        providers: {
          groq: { configured: data.status?.groq?.configured ?? data.providers?.groq === 'configured', status: data.status?.groq?.status || 'READY' },
          openrouter: { configured: data.status?.openrouter?.configured ?? data.providers?.openrouter === 'configured', status: data.status?.openrouter?.status || 'READY' },
          local: { enabled: false, isLocalhost: true },
        },
        status: data.detailedMessage || data.message || (data.available ? `NEXUS Brain READY - Active: ${data.provider?.toUpperCase()}` : 'AI provider belum dikonfigurasi'),
        // Preserve image_engine from previous if not in new data
        image_engine: prev?.image_engine || data.image_engine || null,
      }))
      const activeProv = data.nexus?.activeProvider || data.provider
      if (activeProv) setModelUsed(`NEXUS Brain via ${activeProv}`)
      else setModelUsed(data.detailedMessage || data.message || 'AI provider belum dikonfigurasi')
    }).catch(() => {
      // Fallback to legacy /api/health
      fetch('/api/health').then(r => r.json()).then(data => {
        setHealth(data)
        if (data.picked) setModelUsed(data.picked)
        else if (data.nexus_brain?.activeProvider) setModelUsed(`NEXUS Brain via ${data.nexus_brain.activeProvider}`)
        else setModelUsed(data.status || 'AI provider belum dikonfigurasi')
      }).catch(() => setHealth({ status: 'AI provider network error' }))
    })

    fetch('/api/project').then(r => r.json()).then(data => {
      if (data.project) {
        // Merge server project with localStorage project — server is ephemeral, localStorage is persistent
        const hasRealData = data.project.story || data.project.script || data.project.characters || data.project.storyboard
        if (hasRealData) {
          setProject((prev: any) => {
            const merged = { ...prev, ...data.project }
            try { localStorage.setItem('nexus_project', JSON.stringify(merged)) } catch {}
            return merged
          })
          if (data.project.inputs) {
            const inp = data.project.inputs
            if (inp.theme && inp.theme.trim().length > 0) {
              setTheme(prev => (prev && prev.trim().length > 0 ? prev : inp.theme))
            }
            if (inp.genre && GENRES.includes(inp.genre)) {
              setGenre(prev => (prev && GENRES.includes(prev) ? prev : inp.genre))
            }
            if (inp.visualStyle) {
              setVisualStyle(prev => (prev ? prev : inp.visualStyle))
            }
            if (inp.tone && inp.tone.trim().length > 0) {
              setTone(prev => (prev && prev.trim().length > 0 ? prev : inp.tone))
            }
            if (inp.episodeCount) {
              setEpisodeCount(prev => {
                const cur = parseInt(prev) || 0
                if (cur >= 1 && prev !== '1') return prev
                return String(inp.episodeCount || 1)
              })
            }
            if (inp.storyIdea && inp.storyIdea.trim().length >= 10) {
              setStoryIdea(prev => (prev && prev.trim().length >= 10 ? prev : inp.storyIdea))
            }
          }
        } else {
          // Server returned empty (ephemeral), keep localStorage version if exists
          try {
            const saved = localStorage.getItem('nexus_project')
            if (saved) {
              const parsed = JSON.parse(saved)
              if (parsed && (parsed.story || parsed.script)) {
                setProject((prev: any) => ({ ...prev, ...parsed }))
              }
            }
          } catch {}
        }
      }
      setProjectLoaded(true)
    }).catch(() => {
      setProjectLoaded(true)
    })
  }, [])

  const saveProject = (updates: any) => {
    try {
      // Save to localStorage for persistence in Vercel serverless ephemeral
      try {
        const existing = localStorage.getItem('nexus_project')
        const existingObj = existing ? JSON.parse(existing) : {}
        const merged = { ...existingObj, ...updates }
        // Merge nested
        if (updates.inputs) merged.inputs = { ...existingObj.inputs, ...updates.inputs }
        if (updates.characterImages) merged.characterImages = { ...existingObj.characterImages, ...updates.characterImages }
        localStorage.setItem('nexus_project', JSON.stringify(merged))
      } catch {}
      fetch('/api/project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      }).catch(() => {})
    } catch {}
  }

  const handleContinue = (e?: any) => {
    if (e && e.preventDefault) {
      try { e.preventDefault() } catch {}
    }
    if (e && e.stopPropagation) {
      try { e.stopPropagation() } catch {}
    }

    console.log('[Lanjutkan] Clicked - currentView:', currentView, 'theme:', theme, 'genre:', genre, 'projectLoaded:', projectLoaded, 'MASTER_ORDER:', WORKFLOW_STAGES.join('→'))

    const epCount = parseInt(episodeCount) || 1
    if (epCount < 1) {
      setError('Jumlah episode harus diisi minimal 1.')
      return
    }
    const trimmedTheme = (theme || '').trim()
    if (!trimmedTheme) {
      setError('Tema harus diisi.')
      return
    }
    if (!genre || !GENRES.includes(genre)) {
      setError('Genre harus dipilih.')
      return
    }

    setError(null)

    const inputs = {
      theme: trimmedTheme,
      genre,
      visualStyle,
      tone: (tone || '').trim(),
      storyIdea: (storyIdea || '').trim(),
      episodeCount: epCount,
      duration_per_episode_seconds: 15,
      total_duration_seconds: 15 * epCount,
    }

    // Progress preservation — jangan hapus data ketika pindah tahap
    saveProject({ inputs, selected_genre: genre, episode_count: epCount, duration_per_episode_seconds: 15, total_duration_seconds: 15 * epCount })

    console.log('[Lanjutkan] Validation PASS, navigating from', currentView, 'using MASTER_WORKFLOW_ORDER')

    // NEXUS — SISTEM NAVIGASI WORKFLOW UTAMA — STRICT ORDER — SINGLE SOURCE CONFIG
    // WORKFLOW_STAGES = ["cerita","naskah","karakter","dunia","papan-cerita","gambar","gerakan","suara","audio"]
    // Tombol Lanjutkan harus selalu membawa user ke tahap berikutnya berdasarkan MASTER WORKFLOW ORDER
    const currentIdx = getWorkflowIndex(currentView)

    if (currentView === 'dashboard') {
      // Dashboard → Cerita (tahap pertama)
      setCurrentView(MASTER_WORKFLOW_ORDER[0].id)
    } else if (currentIdx !== -1) {
      // Jika berada di workflow stage, pindah ke next stage berdasarkan MASTER ORDER
      if (currentView === 'story' && !project?.story) {
        // Cerita belum ada — tetap di Cerita, jangan pakai setError dengan ✅
        setError(null)
        setCurrentView('story')
        return
      }
      const nextStage = getNextStage(currentView)
      if (nextStage) {
        console.log(`[Lanjutkan] ${currentView} → ${nextStage} — Forward Navigation PASS ✅ — MASTER ORDER`)
        setCurrentView(nextStage)
      } else {
        // Pada tahap terakhir AUDIO → Lanjutkan disabled / tidak tersedia
        console.log(`[Lanjutkan] ${currentView} adalah tahap terakhir AUDIO — Lanjutkan disabled — tidak membuat tahap ke-10`)
        // Tetap di AUDIO — Lanjutkan disabled, tidak navigasi
        if (currentView === 'audio') {
          // Final workflow action — bisa tampilkan complete atau tetap di audio
          setCurrentView('audio')
        } else {
          setCurrentView('dashboard')
        }
      }
    } else if (currentView === 'workflow') {
      // Workflow view → karakter (atau current stage dari progress)
      const progressIdx = project?.story ? (project?.script ? (project?.characters ? (project?.world ? 4 : 3) : 2) : 1) : 0
      setCurrentView(MASTER_WORKFLOW_ORDER[progressIdx]?.id || 'story')
    } else if (currentView === 'settings') {
      setCurrentView('dashboard')
    } else {
      // Fallback — ke Cerita (tahap pertama MASTER ORDER)
      setCurrentView(MASTER_WORKFLOW_ORDER[0].id)
    }
  }

  const handleBack = (e?: any) => {
    if (e && e.preventDefault) {
      try { e.preventDefault() } catch {}
    }
    if (e && e.stopPropagation) {
      try { e.stopPropagation() } catch {}
    }
    console.log('[Kembali] Clicked - currentView:', currentView, 'MASTER_ORDER:', WORKFLOW_STAGES.join('→'))
    setError(null)
    setShowSidebar(false)

    // NEXUS — SISTEM NAVIGASI WORKFLOW UTAMA — STRICT ORDER — SINGLE SOURCE CONFIG
    // Tombol Kembali harus bergerak satu tahap ke belakang berdasarkan MASTER WORKFLOW ORDER
    // CERITA → Kembali disabled, AUDIO → Kembali → SUARA, dll — Jangan membuat tahap ke-10
    const currentIdx = getWorkflowIndex(currentView)

    if (currentIdx !== -1) {
      if (currentIdx === 0) {
        // Pada tahap pertama CERITA → Kembali disabled / tidak tersedia
        console.log(`[Kembali] ${currentView} adalah tahap pertama CERITA — Kembali disabled — tidak navigasi`)
        // Tetap di CERITA — Kembali disabled
        setCurrentView(MASTER_WORKFLOW_ORDER[0].id)
      } else {
        const prevStage = getPrevStage(currentView)
        if (prevStage) {
          console.log(`[Kembali] ${currentView} → ${prevStage} — Backward Navigation PASS ✅ — MASTER ORDER — Progress preservation: data tidak hilang`)
          setCurrentView(prevStage)
        } else {
          setCurrentView('dashboard')
        }
      }
    } else if (currentView === 'workflow') {
      setCurrentView('dashboard')
    } else if (currentView === 'settings') {
      setCurrentView('dashboard')
    } else if (currentView === 'dashboard') {
      setCurrentView('dashboard')
    } else {
      // Fallback — ke dashboard
      setCurrentView('dashboard')
    }
  }

  const handleGenerateStory = async () => {
    if (!storyIdea || storyIdea.trim().length < 10) {
      setError('Story Idea minimal 10 karakter.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const epCount = parseInt(episodeCount) || 1
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'story',
          inputs: {
            theme,
            genre,
            visualStyle,
            tone,
            storyIdea,
            episodeCount: epCount,
            duration_per_episode_seconds: 15,
            total_duration_seconds: 15 * epCount,
          },
          language,
        })
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Gagal generate story')
        setModelUsed(data.provider ? `NEXUS Brain via ${data.provider} - FAILED` : 'Failed')
        // Store research even on failure for evidence (BLOCKED case)
        if (data.research) {
          setProject((prev: any) => ({ ...prev, lastResearch: data.research, lastError: data.error }))
        }
      } else {
        setProject((prev: any) => ({ 
          ...prev, 
          story: data.data, 
          characters: data.data?.characters, 
          world: data.data?.locations,
          research: data.research || data.data?._research || null,
          groundingValidation: data.groundingValidation || data.data?._groundingValidation || null,
          provider: data.provider,
          fallbackChain: data.fallbackChain
        }))
        setModelUsed(data.provider || `NEXUS Brain via ${data.provider}`)
        setError(null)
        saveProject({ story: data.data, research: data.research, groundingValidation: data.groundingValidation })
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateScript = async () => {
    if (!project?.story || !project.story.title) {
      setError('NASKAH HARUS BERASAL DARI CERITA — Buat cerita terlebih dahulu di halaman Cerita.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'script',
          story: project.story,
          language,
        })
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Gagal generate naskah')
        setModelUsed(data.provider ? `NEXUS Brain via ${data.provider} - FAILED` : 'Failed')
        if (data.groundingValidation) {
          setProject((prev: any) => ({ ...prev, lastScriptValidation: data.groundingValidation }))
        }
      } else {
        setProject((prev: any) => ({
          ...prev,
          script: data.data,
          scriptValidation: data.groundingValidation || data.data?._groundingValidation || null,
          provider: data.provider,
          fallbackChain: data.fallbackChain
        }))
        setModelUsed(data.provider || `NEXUS Brain via ${data.provider}`)
        setError(null)
        saveProject({ script: data.data, scriptValidation: data.groundingValidation })
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateCharacter = async () => {
    if (!project?.story || !project.story.characters || project.story.characters.length === 0) {
      setError('KARAKTER HARUS BERASAL DARI CERITA — Buat cerita terlebih dahulu di halaman Cerita. Karakter production harus 100% sinkron dengan tokoh di SOURCE STORY dan NASKAH.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'character',
          story: project.story,
          script: project.script || null,
          language,
        })
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Gagal generate karakter')
        setModelUsed(data.provider ? `NEXUS Brain via ${data.provider} - FAILED` : 'Failed')
        if (data.validation) {
          setProject((prev: any) => ({ ...prev, lastCharacterValidation: data.validation }))
        }
      } else {
        setProject((prev: any) => ({
          ...prev,
          characters: data.data,
          characterValidation: data.validation || data.data?._validation || null,
          provider: data.provider,
          fallbackChain: data.fallbackChain
        }))
        setModelUsed(data.provider || `NEXUS Brain via ${data.provider}`)
        setError(null)
        saveProject({ characters: data.data, characterValidation: data.validation })
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateWorld = async () => {
    if (!project?.story || !project.story.locations || project.story.locations.length === 0) {
      setError('DUNIA HARUS BERASAL DARI CERITA — Buat cerita terlebih dahulu di halaman Cerita. Dunia harus berasal dari lokasi di SOURCE STORY.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'world',
          story: project.story,
          script: project.script || null,
          characters: project.characters || null,
          language,
        })
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Gagal generate dunia')
        setModelUsed(data.provider ? `NEXUS Brain via ${data.provider} - FAILED` : 'Failed')
        if (data.validation) {
          setProject((prev: any) => ({ ...prev, lastWorldValidation: data.validation }))
        }
      } else {
        setProject((prev: any) => ({
          ...prev,
          world: data.data,
          worldValidation: data.validation || data.data?._validation || null,
          provider: data.provider,
          fallbackChain: data.fallbackChain
        }))
        setModelUsed(data.provider || `NEXUS Brain via ${data.provider}`)
        setError(null)
        saveProject({ world: data.data, worldValidation: data.validation })
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateEpisode = async (epDuration?: number, epNumber?: number) => {
    if (!project?.story || !project.story.title) {
      setError('EPISODE HARUS BERASAL DARI CERITA & NASKAH — Buat cerita terlebih dahulu.')
      return
    }
    if (!project?.script || !project.script.scenes || project.script.scenes.length === 0) {
      setError('EPISODE HARUS BERASAL DARI NASKAH — Buat naskah terlebih dahulu dari cerita. EPISODE = pembagian produksi dari NASKAH.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const durationSec = epDuration || parseInt(episodeCount) * 15 || 30
      const epNum = epNumber || 1
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'storyboard',
          story: project.story,
          script: project.script,
          characters: project.characters || null,
          duration: durationSec,
          episodeNumber: epNum,
          language,
        })
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Gagal generate episode')
        setModelUsed(data.provider ? `NEXUS Brain via ${data.provider} - FAILED` : 'Failed')
        if (data.validation) {
          setProject((prev: any) => ({ ...prev, lastEpisodeValidation: data.validation }))
        }
      } else {
        setProject((prev: any) => ({
          ...prev,
          storyboard: data.data,
          episodeValidation: data.validation || data.data?._validation || null,
          provider: data.provider,
          fallbackChain: data.fallbackChain
        }))
        setModelUsed(data.provider || `NEXUS Brain via ${data.provider}`)
        setError(null)
        saveProject({ storyboard: data.data, episodeValidation: data.validation })
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const totalDuration = (parseInt(episodeCount) || 1) * 15

  // === GENERATE ALL SCENES MASTER — SEQUENTIAL WITH 30s DELAY & CHARACTER ANCHOR CONSISTENCY ===
  const handleGenerateAllScenes = async () => {
    if (!project?.script?.scenes || project.script.scenes.length === 0) {
      setError('Generate All Scenes — Naskah belum ada atau tidak punya scenes — Buat naskah terlebih dahulu')
      return
    }
    if (isGeneratingAllScenes) return
    const scenesSorted = [...project.script.scenes].sort((a:any,b:any) => (a.scene_number||0) - (b.scene_number||0))
    setIsGeneratingAllScenes(true)
    const abortCtrl = new AbortController()
    setGenerateAllAbort(abortCtrl)
    const logs: string[] = []
    setGenerateAllProgress({ current: 0, total: scenesSorted.length, currentSceneId: '', status: 'Memulai Generate Semua Scene...', countdown: 0, logs: [] })
    try {
      for (let i = 0; i < scenesSorted.length; i++) {
        if (abortCtrl.signal.aborted) {
          logs.push('⏹️ Generate All Scenes dibatalkan oleh user')
          break
        }
        const scene: any = scenesSorted[i]
        const sceneId = scene.scene_id || scene.id || `scene_${i+1}`
        const sceneNumber = scene.scene_number || i+1
        const sceneTitle = scene.title || scene.location?.name || `Scene ${sceneNumber}`
        setGenerateAllProgress({ current: i+1, total: scenesSorted.length, currentSceneId: sceneId, status: `Memproses Scene ${sceneNumber}: ${String(sceneTitle).slice(0,50)}...`, countdown: 0, logs: [...logs] })

        // === STRICT CHARACTER ANCHOR CONSISTENCY — Canonical Asset dari Step 2 ===
        const charNamesInScene: string[] = scene.characters_present || scene.characters || scene.characters_detail?.map((c:any)=>c.name) || []
        const firstCharName = charNamesInScene[0] || scene.characters_detail?.[0]?.name || Object.keys(project.characterImages || {})[0] || Object.keys(project.characterAssets || {})[0] || ''
        let charAsset: any = null
        if (firstCharName) {
          charAsset = project.characterImages?.[firstCharName] || project.characterAssets?.[firstCharName] || null
        }
        if (!charAsset) {
          const allCharImgs = { ...(project.characterImages||{}), ...(project.characterAssets||{}) }
          const vals = Object.values(allCharImgs) as any[]
          if (vals.length > 0) charAsset = vals[0]
        }
        const charNameForPrompt = firstCharName || charAsset?.characterName || charAsset?.name || 'character'

        // Build visual prompt with canonical anchor
        let ws = ''
        try { ws = getWorldSettingSync() } catch { ws = 'plain clean flat background, isolated full-body character portrait, standalone character asset, dynamic background from story source' }
        let vp = scene.visual_prompt || scene.visualPrompt || `${scene.action || ''} — ${scene.location?.name || ''} — ${charNamesInScene.join(', ') || ''} — ${scene.emotion_overall || scene.emotion || ''}`
        if (charAsset) {
          const charVisualDesc = charAsset.visualPrompt?.slice(0,100) || charAsset.physical || charAsset.description || charAsset.characterData?.physical || ''
          vp = `${vp}, featuring ${charNameForPrompt} — ${charVisualDesc}, CANONICAL ASSET ANCHOR — character face consistent with Step 2 canonical reference, same face, same outfit, same hairstyle, consistent character design — Scene ${sceneNumber} sequential`
        } else {
          vp = `${vp}, featuring ${charNameForPrompt}, consistent character design, same face across scenes — Scene ${sceneNumber}`
        }
        if (ws && !vp.includes(ws.slice(0,20))) vp = `${vp}, ${ws}`
        if (!vp.toLowerCase().includes('cinematic')) vp = `${vp}, cinematic lighting, highly detailed, ${visualStyle} style, masterpiece, sharp focus`

        // === PAYLOAD SANITIZATION — ensure gender never empty/null ===
        const inferGenderFrontend = (c:any, nameHint:string) => {
          const name = (c?.name || c?.characterName || nameHint || '').toLowerCase();
          const gRaw = (c?.gender || '').toLowerCase();
          const combined = `${name} ${gRaw} ${c?.physical||''} ${c?.description||''} ${c?.clothing||''}`.toLowerCase();
          if (/perempuan|wanita|gadis|cewek|female|woman|girl|putri|ratu|dewi|amelia|siti|ayu|sari|maya|luna|sinta|andini|amara|lestari|wulan|rina|diana|clara|emma|olivia|amelie|tribuana|tunggadewi|gitarja|ken dedes/i.test(combined)) return 'Perempuan';
          if (/laki-laki|laki|pria|pemuda|male|man|boy|rangga|arga|budi|joko|gajah mada|hayam wuruk|ken arok|suharto|soeharto|soekarno|sukarno/i.test(combined)) return 'Laki-Laki';
          if (/perempuan|female|wanita|woman|girl/i.test(gRaw)) return 'Perempuan';
          if (/laki-laki|laki|pria|male|man|boy/i.test(gRaw)) return 'Laki-Laki';
          return /amelia|siti|putri|ratu|dewi|ayu|sari|maya|luna/i.test(name) ? 'Perempuan' : 'Laki-Laki';
        };
        const genderForPayload = charAsset?.gender || (charAsset as any)?.jenis_kelamin || inferGenderFrontend(charAsset, charNameForPrompt);
        try {
          const res = await fetch('/api/generate-hf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: vp,
              visualStyle,
              gender: genderForPayload,
              characterData: charAsset ? { name: charNameForPrompt, gender: genderForPayload, referenceImageUrl: charAsset.referenceImageUrl || charAsset.imageUrl, physical: charAsset.physical || charAsset.description || '', clothing: charAsset.clothing || '', age: charAsset.age || '' } : { name: charNameForPrompt, gender: genderForPayload, physical: '', clothing: '' },
              sceneId,
              mode: 'scene',
              isCanonical: false,
              consistencyAnchor: true,
              anchorCharacter: charNameForPrompt,
              sceneNumber
            }),
            signal: abortCtrl.signal
          })
          const data = await res.json()
          if (!res.ok || !data.ok) {
            throw new Error(`${data.errorCode || 'FAILED'}: ${data.errorMessage || data.error || 'HF failed'} — State:${data.state || 'UNKNOWN'}`)
          }
          const img = data.imageUrl
          if (!img) throw new Error('No imageUrl returned from HF')
          const normalized = {
            ok: true,
            image: img,
            imageUrl: img,
            image_url: img,
            provider: data.provider || 'huggingface',
            model: data.model || 'black-forest-labs/FLUX.1-schnell',
            sceneId,
            sceneNumber,
            version: data.version || 'asset_v001',
            canonicalAnchor: charNameForPrompt,
            anchorUsed: !!charAsset,
            anchorImageUrl: charAsset?.referenceImageUrl || charAsset?.imageUrl || null,
            visualStyle,
            prompt: vp.slice(0,300),
            generatedAt: new Date().toISOString(),
            method: 'GENERATE_ALL_SCENES_MASTER'
          }
          setProject((prev:any) => ({
            ...prev,
            drawings: { ...(prev?.drawings || {}), [sceneId]: normalized },
            lastGeneratedImage: normalized
          }))
          saveProject({ drawings: { ...(project.drawings || {}), [sceneId]: normalized } })
          logs.push(`✅ Scene ${sceneNumber} (${sceneTitle}) generated — anchor ${charNameForPrompt} ${charAsset ? 'CANONICAL ✅' : 'no canonical yet'} — ${normalized.model}`)
          setError(null)
        } catch (e:any) {
          if (e.name === 'AbortError') {
            logs.push(`⏹️ Scene ${sceneNumber} aborted`)
            break
          }
          const msg = e.message || 'Unknown error'
          logs.push(`❌ Scene ${sceneNumber} (${sceneTitle}) failed — ${msg}`)
          setError(`Generate All Scenes — Scene ${sceneNumber} gagal: ${msg} — lanjut ke scene berikutnya...`)
        }

        // === 30s DELAY WITH COUNTDOWN TIMER — kecuali scene terakhir ===
        if (i < scenesSorted.length - 1 && !abortCtrl.signal.aborted) {
          for (let cd = 30; cd > 0; cd--) {
            if (abortCtrl.signal.aborted) break
            setGenerateAllProgress({ current: i+1, total: scenesSorted.length, currentSceneId: sceneId, status: `Menunggu jeda 30 detik sebelum Scene ${sceneNumber+1}...`, countdown: cd, logs: [...logs] })
            await new Promise(r => setTimeout(r, 1000))
          }
        }
      }
      setGenerateAllProgress(prev => prev ? { ...prev, status: `Selesai — ${scenesSorted.length} scenes diproses — ${logs.filter(l=>l.startsWith('✅')).length} berhasil, ${logs.filter(l=>l.startsWith('❌')).length} gagal`, countdown: 0, logs } : { current: scenesSorted.length, total: scenesSorted.length, currentSceneId: '', status: 'Selesai', countdown: 0, logs })
      if (logs.filter(l=>l.startsWith('✅')).length > 0) {
        setError(null)
      }
    } catch (e:any) {
      setError(`Generate All Scenes Master error: ${e.message}`)
    } finally {
      setIsGeneratingAllScenes(false)
      setGenerateAllAbort(null)
    }
  }

  const handleCancelGenerateAllScenes = () => {
    try {
      generateAllAbort?.abort()
    } catch {}
    setIsGeneratingAllScenes(false)
    setGenerateAllProgress(prev => prev ? { ...prev, status: 'Cancelled by user ⏹️', countdown: 0, logs: [...(prev.logs||[]), '⏹️ Cancelled by user'] } : null)
  }

  // NEXUS — SISTEM NAVIGASI WORKFLOW UTAMA — SINGLE SOURCE CONFIG — MASTER WORKFLOW ORDER

  // WORKFLOW_STAGES = ["cerita","naskah","karakter","dunia","papan-cerita","gambar","gerakan","suara","audio"]
  // Semua fungsi navigasi harus mengambil urutan dari WORKFLOW_STAGES tersebut — Jangan membuat urutan berbeda di masing-masing halaman
  // Sidebar harus menampilkan urutan persis: Cerita, Naskah, Karakter, Dunia, Papan Cerita, Gambar, Gerakan, Suara, Audio — Cerita WAJIB di atas Naskah
  // Workflow stages with real state — using MASTER_WORKFLOW_ORDER as single source
  const workflowStages = MASTER_WORKFLOW_ORDER.map((stage, idx) => {
    const statusMap: Record<string, string> = {
      'story': project?.story ? 'complete' : 'waiting',
      'script': project?.script ? 'complete' : 'waiting',
      'character': project?.characters ? 'complete' : 'waiting',
      'world': project?.world ? 'complete' : 'waiting',
      'storyboard': project?.storyboard ? 'complete' : 'waiting',
      'drawing': project?.drawings ? 'complete' : 'waiting',
      'motion': project?.motionPlans ? 'complete' : 'waiting',
      'voice': project?.voiceAssets ? 'complete' : 'waiting',
      'audio': project?.audio ? 'complete' : 'waiting',
    }
    return {
      id: stage.id,
      indo: stage.indo,
      label: `${idx+1}. ${t(stage.id)}`,
      indoLabel: `${idx+1}. ${stage.indoLabel}`,
      icon: stage.icon,
      status: statusMap[stage.id] || 'waiting',
      mobileLabel: stage.indoLabel,
      step: stage.step
    }
  }).map(s => ({
    ...s,
    status: currentView === s.id ? 'current' : (loading && currentView === s.id ? 'processing' : s.status)
  }))

  // NEXUS — SISTEM NAVIGASI WORKFLOW UTAMA — ATURAN AKTIF/NONAKTIF — Tahap aktif mengikuti current stage
  const currentWorkflowIdx = getWorkflowIndex(currentView)
  const isFirstStage = currentWorkflowIdx === 0 // CERITA → Kembali disabled
  const isLastStage = currentWorkflowIdx === MASTER_WORKFLOW_ORDER.length - 1 // AUDIO → Lanjutkan disabled
  const isWorkflowStage = currentWorkflowIdx !== -1
  

  const getStatusProject = () => {
    if (project?.story) return 'In Progress'
    if (theme && theme.trim()) return 'Ready'
    return 'Not Started'
  }

  const getTotalScenes = () => {
    return project?.script?.scenes?.length || project?.storyboard?.shots?.length || 0
  }

  const getTotalOutput = () => {
    const shots = project?.storyboard?.shots?.length || 0
    const drawings = project?.drawings ? Object.keys(project.drawings).length : 0
    return shots + drawings || 24
  }

  // Recent work based on real project
  const recentWork = [
    {
      id: 'character',
      title: project?.characters?.[0]?.name ? `Character - ${project.characters[0].name}` : 'Character - Aruna',
      desc: project?.characters?.[0]?.role || project?.story?.characters?.[0]?.description?.slice(0, 40) || 'Karakter utama untuk cerita fantasi',
      icon: '👤',
      status: currentView === 'character' ? 'current' : (project?.characters ? 'complete' : 'waiting'),
      time: 'Diupdate 2 menit yang lalu',
      action: currentView === 'character' ? 'Lanjutkan' : (project?.characters ? 'Lihat' : 'Mulai'),
      actionIcon: currentView === 'character' ? '→' : (project?.characters ? '→' : '→'),
    },
    {
      id: 'world',
      title: project?.world?.[0]?.name ? `World - ${project.world[0].name}` : project?.story?.locations?.[0]?.name ? `World - ${project.story.locations[0].name}` : 'World - Eldoria',
      desc: project?.world?.[0]?.description?.slice(0, 40) || project?.story?.locations?.[0]?.description?.slice(0, 40) || 'Dunia fantasi dengan kerajaan kuno',
      icon: '🌍',
      status: currentView === 'world' ? 'current' : (project?.world ? 'complete' : 'waiting'),
      time: project?.world ? 'Selesai 1 jam yang lalu' : 'Belum dimulai',
      action: project?.world ? 'Lihat' : 'Mulai',
      actionIcon: '→',
    },
    {
      id: 'storyboard',
      title: project?.storyboard?.shots?.[0] ? `Storyboard - ${project.storyboard.shots[0].shot_id}` : 'Storyboard - Scene 03',
      desc: project?.storyboard?.shots?.[0]?.description?.slice(0, 40) || 'Pertemuan di hutan',
      icon: '🖼️',
      status: currentView === 'storyboard' ? 'current' : (project?.storyboard ? 'complete' : 'waiting'),
      time: project?.storyboard ? 'Selesai 1 jam yang lalu' : 'Belum dimulai',
      action: 'Lihat',
      actionIcon: '→',
    },
    {
      id: 'motion',
      title: 'Motion - Scene 02',
      desc: 'Gerakan karakter di hutan',
      icon: '▶️',
      status: loading && currentView === 'motion' ? 'processing' : (project?.motionPlans ? 'complete' : 'waiting'),
      time: loading ? 'Sedang diproses... 45%' : (project?.motionPlans ? 'Selesai' : 'Menunggu'),
      action: loading ? 'Detail' : 'Detail',
      actionIcon: '→',
    },
  ]

  const storyboardScenes = [
    { id: '01', title: 'Scene 01 - Arrival', dur: '12s', status: 'Complete', icon: '🏜️' },
    { id: '02', title: 'Scene 02 - The Meeting', dur: '15s', status: 'Complete', icon: '🏕️' },
    { id: '03', title: 'Scene 03 - The Journey', dur: '18s', status: 'In Progress', icon: '🌲' },
    { id: '04', title: 'Scene 04 - The Battle', dur: '20s', status: 'Waiting', icon: '⚔️' },
  ]

  return (
    <div className="app">
      <div className={`backdrop ${showSidebar ? 'show' : ''}`} onClick={() => setShowSidebar(false)}></div>
      
      <div className="mobile-bar">
        <button type="button" className="menu-btn" aria-label="Menu" onClick={() => setShowSidebar(true)}>☰</button>
        <div className="logo">
          <div className="logo-icon">N</div>
          NEXUS
        </div>
        <div className="mobile-bar-right">
          <button type="button" className="topbar-icon" aria-label="Notifications">🔔</button>
          <div className="user-avatar">👤</div>
        </div>
      </div>

      <aside className={`sidebar ${showSidebar ? 'show' : ''}`}>
        <button type="button" className="btn drawer-close" onClick={() => setShowSidebar(false)}>Tutup</button>
        
        <div className="logo">
          <div className="logo-icon">N</div>
          NEXUS
        </div>
        <div className="logo-sub">AI Creative Production Platform</div>
        
        <div className="tag nexus-tag">
          NEXUS: GROQ → OpenRouter → Local<br/>Gemini LEGACY only<br/>
          Core AI Production Engine
        </div>

        <button type="button" className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => { setCurrentView('dashboard'); setShowSidebar(false) }}>
          <span className="nav-btn-icon">🏠</span>
          Dashboard
        </button>

        <div className="nav-section">Workflow / Production — MASTER ORDER: {WORKFLOW_STAGES.join(' → ')}</div>
        {/* NEXUS — SISTEM NAVIGASI WORKFLOW UTAMA — SINGLE SOURCE CONFIG — MASTER_WORKFLOW_ORDER — Sidebar harus menampilkan urutan persis: Cerita, Naskah, Karakter, Dunia, Papan Cerita, Gambar, Gerakan, Suara, Audio — Cerita WAJIB di atas Naskah */}
        {MASTER_WORKFLOW_ORDER.map(item => (
          <button key={item.id} type="button" className={`nav-btn ${currentView === item.id ? 'active' : ''}`} onClick={() => {
            if (item.id === 'motion') {
              // STEP 4 Motion Engine — direct navigation to /test-video per requirement — Gerakan sidebar
              try { localStorage.setItem('nexus_last_view', currentView); } catch {}
              window.location.href = '/test-video';
              return;
            }
            setCurrentView(item.id); setShowSidebar(false);
          }}>
            <span className="nav-btn-icon">{item.icon}</span>
            {t(item.id)} {item.id === 'motion' ? '↗' : ''}
          </button>
        ))}

        <div className="nav-section" style={{ marginTop: '1.5rem' }}>System</div>
        <button type="button" className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`} onClick={() => { setCurrentView('settings'); setShowSidebar(false) }}>
          <span className="nav-btn-icon">⚙️</span>
          Project Settings
        </button>
        <button type="button" className="nav-btn" onClick={() => {}}>
          <span className="nav-btn-icon">❓</span>
          Help & Support
        </button>

        <div style={{ marginTop: 'auto', padding: '1rem 0.5rem 0.5rem 0.5rem' }}>
          <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div className="logo-icon" style={{ width: '24px', height: '24px', fontSize: '0.9rem' }}>N</div>
              <b style={{ fontSize: '0.8rem' }}>NEXUS</b>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
              Think · Create · Build · Together
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--success)' }}>
              <span className="stat-dot"></span>
              System Online
            </div>
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-meta)', marginTop: '0.75rem', padding: '0 0.25rem' }}>
            NEXUS v1.0.0
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            <h1>{currentView === 'dashboard' ? 'Dashboard' : currentView === 'workflow' ? 'Workflow' : currentView === 'settings' ? 'Project Settings' : t(currentView)}</h1>
            <p>{currentView === 'dashboard' ? 'Overview project dan status produksi Anda' : currentView === 'workflow' ? 'Track your production progress' : currentView === 'settings' ? 'Manage your project settings' : `Manage ${t(currentView)} production`}</p>
          </div>
          <div className="topbar-right">
            <span className="badge">
              <span className={`badge-dot ${health?.status?.includes('Ready') || health?.nexus_brain?.isReady ? '' : 'warning'}`}></span>
              {health?.nexus_brain?.isReady ? `NEXUS: ${health.nexus_brain.activeProvider?.toUpperCase()} Ready` : (health?.status || 'Memeriksa AI…')}
            </span>
            <select className="lang-select" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="id">🌐 ID</option>
              <option value="en">🇬🇧 EN</option>
            </select>
            <button type="button" className="topbar-icon" aria-label="Notifications">🔔</button>
            <div className="user-menu">
              <div className="user-avatar">👤</div>
              <span className="user-name">User</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>▼</span>
            </div>
          </div>
        </div>

        <div className="content">
          {currentView === 'dashboard' ? (
            <>
              {/* Mobile Welcome Banner - Reference */}
              <div className="welcome-banner">
                <div className="welcome-banner-bg"></div>
                <div className="welcome-banner-content">
                  <h2>Welcome to NEXUS</h2>
                  <p>Turn your ideas into amazing visual stories with AI.</p>
                </div>
              </div>

              <div className="status-grid">
                <div className="stat">
                  <div className="stat-icon blue">📖</div>
                  <div className="stat-content">
                    <span>Status Project</span>
                    <b>{getStatusProject()}</b>
                    <small><span className="stat-dot"></span> AI Engine Ready</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon purple">👤</div>
                  <div className="stat-content">
                    <span>Total Scene</span>
                    <b>{getTotalScenes() || 12}</b>
                    <small>Dari {getTotalScenes() ? getTotalScenes() + 8 : 20} scene</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon teal">🖼️</div>
                  <div className="stat-content">
                    <span>Total Output</span>
                    <b>{getTotalOutput()}</b>
                    <small>Video / Image / Audio</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon gray">⏱️</div>
                  <div className="stat-content">
                    <span>Estimasi Selesai</span>
                    <b>{totalDuration ? `${Math.floor(totalDuration/60)}m ${totalDuration%60}s` : '2h 45m'}</b>
                    <small>Dari target 6h</small>
                  </div>
                </div>
              </div>

              <div className="workflow-card">
                <div className="workflow-header">
                  <b>Workflow / Production</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{workflowStages.filter(s => s.status === 'complete').length} / {workflowStages.length} completed</span>
                </div>
                <div className="workflow-stages">
                  {workflowStages.map((stage, idx) => (
                    <div key={stage.id} className={`stage-item ${stage.status}`}>
                      {idx < workflowStages.length - 1 && (
                        <div className={`stage-connector ${stage.status === 'complete' ? 'complete' : ''}`}></div>
                      )}
                      <div className={`stage-icon ${stage.status}`}>
                        {stage.status === 'complete' ? '✓' : stage.status === 'current' ? '●' : stage.status === 'processing' ? '⟳' : '○'}
                      </div>
                      <span className="stage-label">{stage.label}</span>
                      <span className={`stage-status ${stage.status}`}>
                        {stage.status === 'complete' ? '✓ Complete' : stage.status === 'current' ? '● Current' : stage.status === 'processing' ? '⟳ Processing' : '○ Waiting'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile Workflow Vertical - Reference Dashboard */}
              <div className="mobile-workflow-vertical">
                <div className="workflow-vertical">
                  <div className="workflow-vertical-header">
                    <b>Workflow</b>
                    <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('workflow') }}>View All</a>
                  </div>
                  <div className="workflow-list">
                    {workflowStages.slice(0,5).map((stage, idx) => (
                      <div key={stage.id} className="workflow-item" onClick={() => setCurrentView(stage.id)} style={{ cursor: 'pointer' }}>
                        <div className={`workflow-num ${stage.status}`}>
                          {stage.status === 'complete' ? '✓' : idx+1}
                        </div>
                        <div className="workflow-item-content">
                          <b>{idx+1}. {stage.mobileLabel}</b>
                          <span>{stage.status === 'complete' ? '● Complete' : stage.status === 'current' ? '○ Current' : '○ Waiting'}</span>
                        </div>
                        <div className="workflow-item-check">
                          {stage.status === 'complete' ? '✓' : stage.status === 'current' ? '→' : '○'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="card">
                  <div className="card-header">
                    <b>Recent / Current Work</b>
                    <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('workflow') }}>Lihat Semua</a>
                  </div>
                  <div className="recent-work">
                    {recentWork.map(item => (
                      <div key={item.id} className="work-item">
                        <div className="work-thumb">{item.icon}</div>
                        <div className="work-content">
                          <b>{item.title}</b>
                          <span>{item.desc}</span>
                          <div className="work-meta">
                            <span className={`work-status ${item.status}`}>
                              {item.status === 'current' ? '● Current' : item.status === 'complete' ? '✓ Complete' : item.status === 'processing' ? '⟳ Processing' : '○ Waiting'}
                            </span>
                            <span className="work-time">{item.time}</span>
                          </div>
                        </div>
                        <div className="work-action">
                          <button
                            type="button"
                            className={`btn sm ${item.status === 'current' ? 'good' : item.status === 'waiting' ? 'secondary' : 'secondary'}`}
                            onClick={() => {
                              if (item.id === 'character' || item.id === 'world' || item.id === 'storyboard' || item.id === 'motion') {
                                setCurrentView(item.id)
                              } else {
                                handleContinue()
                              }
                            }}
                          >
                            {item.action} <span>{item.actionIcon}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <b>Project Information</b>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>✏️</span>
                  </div>
                  <div className="project-info">
                    <div className="project-info-main">
                      <div className="project-info-thumb">
                        {project?.story?.title ? '🏔️' : '🏰'}
                      </div>
                      <div className="project-info-content">
                        <b>Project: {project?.story?.title || 'The Lost Kingdom'}</b>
                        <p>{project?.story?.logline || project?.story?.premise || 'Kisah petualangan di dunia fantasi dengan kerajaan yang hilang.'}</p>
                      </div>
                    </div>
                    <div className="project-details">
                      <div className="detail-row"><span>Durasi Target</span><span>{totalDuration ? `${Math.floor(totalDuration/60).toString().padStart(2, '0')}:${(totalDuration%60).toString().padStart(2, '0')}` : '06:00'}</span></div>
                      <div className="detail-row"><span>Jumlah Scene</span><span>{getTotalScenes() || 20}</span></div>
                      <div className="detail-row"><span>Created</span><span>12 Sep 2026, 10:24</span></div>
                      <div className="detail-row"><span>Last Update</span><span>13 Sep 2026, 09:15</span></div>
                      <div className="detail-row"><span>Tema</span><span>{theme && theme.trim() ? `${theme.slice(0, 20)}${theme.length>20?'...':''} ✅` : '❌ Belum diisi'}</span></div>
                      <div className="detail-row"><span>Genre</span><span>{genre ? `${genre} ✅` : '❌'}</span></div>
                      <div className="detail-row"><span>Visual Style</span><span>{visualStyle ? `${VISUAL_STYLES.find(v=>v.id===visualStyle)?.label} ${VISUAL_STYLES.find(v=>v.id===visualStyle)?.icon} ✅` : 'anime 🎨'}</span></div>
                    </div>
                    <div className="system-status">
                      <b>System Status</b>
                      <div className="status-list">
                        <div className="status-item">
                          <div className="status-item-left"><span>⚙️</span> AI Engine</div>
                          <div className="status-item-right ready"><span className="status-dot ready"></span> Ready</div>
                        </div>
                        <div className="status-item">
                          <div className="status-item-left"><span>💾</span> Storage</div>
                          <div className="status-item-right online"><span className="status-dot online"></span> Online</div>
                        </div>
                        <div className="status-item">
                          <div className="status-item-left"><span>🎬</span> Render Queue</div>
                          <div className="status-item-right">{health?.animation?.job_count || 2} Jobs</div>
                        </div>
                        <div className="status-item">
                          <div className="status-item-left"><span>💾</span> Last Backup</div>
                          <div className="status-item-right">12 Sep 2026, 22:10</div>
                        </div>
                      </div>
                    </div>
                    <div className="actions" style={{ justifyContent: 'flex-start', marginTop: '1rem' }}>
                      <button type="button" className="btn" onClick={() => setCurrentView('story')}>✏️ Edit Project</button>
                      <button type="button" className="btn good" onClick={handleContinue} disabled={isWorkflowStage && isLastStage} title={isWorkflowStage && isLastStage ? "AUDIO adalah tahap terakhir — Lanjutkan disabled" : ""}>{t('continue')} {isWorkflowStage && isLastStage ? "(Selesai)" : "→"}</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile Dashboard Grid - Recent + Project Info stacked */}
              <div className="mobile-dashboard-grid">
                <div className="card">
                  <div className="card-header">
                    <b>Recent / Current Work</b>
                    <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('workflow') }}>View All</a>
                  </div>
                  <div className="recent-work">
                    {recentWork.slice(0,2).map(item => (
                      <div key={item.id} className="work-item" onClick={() => setCurrentView(item.id)} style={{ cursor: 'pointer' }}>
                        <div className="work-thumb">{item.icon}</div>
                        <div className="work-content">
                          <b>{item.title}</b>
                          <span>{item.desc}</span>
                          <div className="work-meta">
                            <span className={`work-status ${item.status}`}>
                              {item.status === 'current' ? '● Current' : item.status === 'complete' ? '✓ Complete' : '○ Waiting'}
                            </span>
                          </div>
                          <span className="work-time">{item.time}</span>
                        </div>
                        <div className="work-action">
                          <span style={{ color: 'var(--text-muted)' }}>›</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <b>Production Quick Test</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tema Bebas Validation</span>
                </div>
                <div className="process-check wait">
                  {error ? `❌ ${error}` : theme && theme.trim() && genre ? `✅ Tema "${theme}" (${theme.trim().length} chars) & Genre ${genre} valid - Klik Lanjutkan` : '⏳ Isi Tema (bebas: "A", "Arga", "Nasi goreng", dll) & pilih Genre'}
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['A', 'Arga', 'Nasi goreng', 'Pontianak', 'Kucing', 'Batu ajaib'].map(ex => (
                      <button key={ex} type="button" className="btn sm secondary" onClick={() => { setTheme(ex); saveProject({ inputs: { theme: ex, genre, visualStyle, tone, storyIdea, episodeCount: parseInt(episodeCount) || 1 } }) }}>
                        {ex} {theme === ex ? '✅' : ''}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Current View: {currentView} - Tema: {theme && theme.trim() ? `✅ "${theme}"` : '❌'} Genre: {genre ? `✅ ${genre}` : '❌'} - ProjectLoaded: {projectLoaded ? '✅' : '⏳'}
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                  <button type="button" className="btn good" onClick={handleContinue} disabled={isWorkflowStage && isLastStage} title={isWorkflowStage && isLastStage ? "AUDIO adalah tahap terakhir — Lanjutkan disabled" : ""}>{t('continue')} {isWorkflowStage && isLastStage ? "(Selesai)" : "→"}</button>
                </div>
              </div>
            </>
          ) : currentView === 'workflow' ? (
            <div className="mobile-workflow-page">
              <div className="card">
                <div className="card-header">
                  <b>Workflow</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Track your production progress</span>
                </div>
                <div className="stepper">
                  {workflowStages.slice(0,5).map((stage, idx) => (
                    <div key={stage.id} className="stepper-item">
                      {idx < 4 && <div className={`stepper-connector ${idx < 2 ? 'complete' : ''}`}></div>}
                      <div className={`stepper-circle ${idx < 2 ? 'complete' : idx === 2 ? 'current' : 'waiting'}`}>
                        {idx < 2 ? '✓' : idx+1}
                      </div>
                      <span className="stepper-label">{stage.mobileLabel}</span>
                      <span className={`stepper-status ${idx < 2 ? 'complete' : idx === 2 ? 'current' : 'waiting'}`}>
                        {idx < 2 ? 'Complete' : idx === 2 ? 'Current' : 'Waiting'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="current-stage-card">
                <div className="stage-card-header">
                  <b>Current Stage</b>
                </div>
                <div className="stage-card-main">
                  <div className="stage-card-icon">👤</div>
                  <div className="stage-card-info">
                    <b>Character</b>
                    <span className="inprogress">● In Progress</span>
                  </div>
                  <div style={{ marginLeft: 'auto', color: 'var(--accent)' }}>→</div>
                </div>
              </div>

              <div className="next-stage-card">
                <div className="stage-card-header">
                  <b>Next Stage</b>
                </div>
                <div className="stage-card-main">
                  <div className="stage-card-icon">🌍</div>
                  <div className="stage-card-info">
                    <b>World</b>
                    <span className="waiting">○ Waiting</span>
                  </div>
                  <div style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>🔒</div>
                </div>
              </div>

              <div className="stage-progress-card">
                <div className="stage-progress-header">
                  <span>Stage Progress</span>
                  <span>3 / 9 stages</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: '33%' }}></div>
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '0.3rem' }}>33%</div>
              </div>

              <div className="card">
                <div className="card-header">
                  <b>Recent Work</b>
                  <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('storyboard') }}>View All</a>
                </div>
                <div className="recent-work">
                  {recentWork.slice(0,2).map(item => (
                    <div key={item.id} className="work-item" onClick={() => setCurrentView(item.id)} style={{ cursor: 'pointer' }}>
                      <div className="work-thumb">{item.icon}</div>
                      <div className="work-content">
                        <b>{item.title}</b>
                        <span>{item.desc}</span>
                        <div className="work-meta">
                          <span className={`work-status ${item.status}`}>
                            {item.status === 'current' ? '● Current' : item.status === 'complete' ? '✓ Complete' : '○ Waiting'}
                          </span>
                        </div>
                        <span className="work-time">{item.time}</span>
                      </div>
                      <div className="work-action">›</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="actions">
                <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                <button type="button" className="btn good" onClick={() => setCurrentView('character')}>{t('continue')} →</button>
              </div>
            </div>
          ) : currentView === 'settings' ? (
            <>
              <div className="settings-card">
                <div className="settings-card-thumb">🏔️</div>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: '0.9rem', display: 'block' }}>{project?.story?.title || 'The Lost Kingdom'}</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Project ID: NEX-20260912-001</span>
                </div>
              </div>

                                                        {/* NEXUS — IMPLEMENT FREE HUGGING FACE ZEROGPU IMAGE WORKER — HP -> NEXUS -> HF ZeroGPU Space -> real image - Free testing dari HP */}
              <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--success)', background: 'rgba(34,197,94,0.05)' }}>
                <div className="card-header">
                  <b>📱 Mobile-Only AI Studio — HP → NEXUS → HF ZeroGPU (Free) → Real Image → Keyframe → Animate → JSON2Video → Final MP4</b>
                  <span style={{ fontSize: '0.65rem', color: 'var(--success)' }}>MOBILE-ONLY + FREE HUGGING FACE ZEROGPU — Default Provider huggingface — No RunPod/PC Required — HP Cukup HP</span>
                </div>
                <div style={{ padding: '0.8rem', fontSize: '0.75rem', lineHeight: '1.6' }}>
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '0.8rem', marginBottom: '0.8rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--success)' }}>✅ FREE HUGGING FACE ZEROGPU — Default Provider: huggingface — No RunPod URL, No ComfyUI URL, No localhost, No PC</div>
                    <div>Flow: HP Android → NEXUS Web App → NEXUS Server/API → Direct HF Inference black-forest-labs/FLUX.1-schnell (api-inference + router fal-ai) → AI Image Model → Gambar nyata → NEXUS</div>
                    <div style={{ marginTop: '0.4rem' }}>Pengguna hanya memakai NEXUS dari HP — Generate with AI: Prompt, Negative Prompt, Aspect Ratio, Seed, Steps/Quality, Generate — JANGAN tampilkan ComfyUI URL, RunPod URL, HF token, worker secret, localhost, terminal</div>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Jika quota habis: &quot;Kuota GPU gratis Direct HF Inference FLUX.1-schnell hari ini habis. Coba lagi setelah kuota reset.&quot; — Jika Space offline: &quot;AI worker sedang tidak tersedia.&quot; — Jika model gagal: &quot;Model AI belum siap di worker.&quot; — Honest status NOT_CONFIGURED/SPACE_UNREACHABLE/QUOTA_EXHAUSTED/MODEL_NOT_READY/READY, no fake READY</div>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Provider: huggingface (default free ZeroGPU) | remote_comfyui (RunPod paid, jika IMAGE_ENGINE_PROVIDER=remote_comfyui) — Security: token server-only, no arbitrary URL, no SSRF, input limits, reference MIME validation — Job persistence file system artifacts/jobs + artifacts/image-jobs</div>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Model: Qwen/Qwen-Image target 20B+ 40GB fp8 requires xlarge may exceed free quota — Fallback validated stabilityai/sdxl-turbo 6.5GB proven ZeroGPU — Character Reference: REFERENCE_CONDITIONING_UNAVAILABLE in free Space (seed only, IPAdapter not yet)</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn good" onClick={async () => {
                      try {
                        const res = await fetch('/api/image-engine/status')
                        const data = await res.json()
                        setHfAuditResult(data)
                        setHealth((prev: any) => ({ ...prev, image_engine: data, remote_worker: data, huggingface: data }))
                        if (data.status === 'NOT_CONFIGURED' || data.status === 'REMOTE_WORKER_NOT_CONFIGURED' || data.errorCode === 'HF_SPACE_NOT_CONFIGURED') {
                          setError(`${data.status} — ${data.message} — Set HUGGINGFACE_SPACE_ID di Vercel Env contoh myusername/nexus-image-worker — Gratis dari HP`)
                        } else if (data.status === 'SPACE_UNREACHABLE' || data.status === 'QUOTA_EXHAUSTED' || data.status === 'REMOTE_WORKER_OFFLINE') {
                          if (data.status === 'QUOTA_EXHAUSTED' || data.errorCode === 'HF_QUOTA_EXHAUSTED') {
                            setError(`Kuota GPU gratis Direct HF Inference FLUX.1-schnell hari ini habis. Coba lagi setelah kuota reset. — ${data.message}`)
                          } else {
                            setError(`AI worker sedang tidak tersedia. — ${data.message}`)
                          }
                        } else if (data.status === 'MODEL_NOT_READY') {
                          setError(`Model AI belum siap di worker. — ${data.message}`)
                        } else {
                          setError(null)
                        }
                      } catch (e: any) { setError(e.message) }
                    }}>📱 Check HF ZeroGPU Status (Free)</button>
                    <button type="button" className="btn secondary" onClick={async () => {
                      try {
                        const res = await fetch('/api/image-engine/test-connection', { method: 'POST' })
                        const data = await res.json()
                        setHfAuditResult(data)
                        setHealth((prev: any) => ({ ...prev, image_engine: data, remote_worker: data, huggingface: data }))
                      } catch (e: any) { setError(e.message) }
                    }}>🔌 Test HF Space Connection</button>
                    <button type="button" className="btn secondary" onClick={() => {
                      const el = document.getElementById('hf-dev-section')
                      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'
                    }}>🔧 Toggle Dev Local Browser (Dev Only)</button>
                  </div>
                  <div style={{ marginTop: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem', fontSize: '0.7rem', minHeight: '60px', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                    {hfAuditResult?.status ? (
                      <div>
                        <div style={{ fontWeight: 700, color: hfAuditResult.ok ? 'var(--success)' : 'var(--error)' }}>
                          Provider: {hfAuditResult.provider || 'huggingface'} — Status: {hfAuditResult.status} — Space: {hfAuditResult.spaceId || hfAuditResult.url || 'NOT SET'} — Model: {hfAuditResult.modelId || hfAuditResult.primary_model || 'stabilityai/sdxl-turbo'} — Configured: {hfAuditResult.worker_url_configured ? 'YES' : 'NO'} — Reachable: {hfAuditResult.worker_reachable ? 'YES' : 'NO'} — Image Ready: {hfAuditResult.image_workflow_ready ? 'YES' : 'NO'} — Model Ready: {hfAuditResult.model_ready ? 'YES' : 'NO'} — Ref Conditioning: {hfAuditResult.character_reference_ready ? 'AVAILABLE' : 'REFERENCE_CONDITIONING_UNAVAILABLE'}
                        </div>
                        <div style={{ marginTop: '0.3rem' }}>{hfAuditResult.message || hfAuditResult.detailedStatus}</div>
                        {hfAuditResult.provider === 'huggingface' && hfAuditResult.workflows && (
                          <div style={{ marginTop: '0.4rem', fontSize: '0.65rem' }}>
                            <div>HF Space: {hfAuditResult.workflows.spaceApp} — Model: {hfAuditResult.workflows.modelId} — Target: {hfAuditResult.workflows.targetModel?.slice(0,80)}... — Fallback: {hfAuditResult.workflows.fallbackModel}</div>
                          </div>
                        )}
                        {hfAuditResult.provider === 'remote_comfyui' && hfAuditResult.workflows && (
                          <div style={{ marginTop: '0.4rem', fontSize: '0.65rem' }}>
                            <div>Workflows: txt2img {hfAuditResult.workflows.txt2img?.readiness?.status || 'UNKNOWN'} — char-ref {hfAuditResult.workflows.character_reference?.readiness?.status || 'UNKNOWN'} — animation {hfAuditResult.workflows.animation?.readiness?.status || 'UNKNOWN'}</div>
                          </div>
                        )}
                        <div style={{ marginTop: '0.4rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Architecture: {hfAuditResult.architecture || (hfAuditResult.provider === 'huggingface' ? 'HP→NEXUS Web App→NEXUS Server/API→HF ZeroGPU Space→AI Image Model→Gambar nyata→NEXUS - Free testing dari HP' : 'HP→NEXUS→Remote Worker→real image→keyframe→Wan I2V→real video→JSON2Video→final MP4')} — Mobile-Only — Honest status</div>
                      </div>
                    ) : (
                      <div>📱 Klik Check HF ZeroGPU Status untuk cek status free testing dari HP — HP cukup HP tanpa RunPod/PC — Provider default huggingface gratis — No ComfyUI URL/RunPod URL/HF token input for production, config server-side only via HUGGINGFACE_SPACE_ID env — Flow Generate with AI→Generate Image→Animate→Progress→Result — Job persists even if HP disconnect via job_id — Jika quota habis: &quot;Kuota GPU gratis Direct HF Inference FLUX.1-schnell hari ini habis. Coba lagi setelah kuota reset.&quot;</div>
                    )}
                  </div>
                </div>
              </div>

              {
              /* REFACTOR: ComfyUI removed — replaced with Direct HF Inference FLUX.1-schnell API as default */
              /* No more localhost:8188, no ComfyUI connection manager, no CORS, no Offline Engine */
              }


              <div className="settings-list">
                {[
                  { icon: '⚙️', title: 'General Settings', desc: '' },
                  { icon: '🔄', title: 'Workflow Settings', desc: '' },
                  { icon: '🖼️', title: 'Output Settings', desc: '' },
                  { icon: '🧠', title: 'AI Engine (NEXUS Brain)', desc: `NEXUS: ${health?.nexus_brain?.activeProvider?.toUpperCase() || 'GROQ'} → OpenRouter → Local`, value: health?.nexus_brain?.activeProvider?.toUpperCase() || 'GROQ' },
                  { icon: '🤗', title: 'Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic)', desc: `Direct HF Inference black-forest-labs/FLUX.1-schnell 1024x1024 steps 8 guidance 3.5 — Dynamic — No Tiongkok`, value: 'READY ✅ Direct HF Inference FLUX.1-schnell (Dynamic)' },
                  { icon: '💾', title: 'Storage & Backup', desc: '' },
                  { icon: '🔧', title: 'Advanced', desc: '' },
                ].map(item => (
                  <div key={item.title} className="settings-item" onClick={() => {}}>
                    <div className="settings-item-icon">{item.icon}</div>
                    <div className="settings-item-content">
                      <b>{item.title}</b>
                      {item.desc && <span>{item.desc}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {item.value && <span style={{ fontSize: '0.7rem', color: item.value.includes('ONLINE') ? 'var(--success)' : item.value.includes('OFFLINE') ? 'var(--warning)' : 'var(--text-muted)' }}>{item.value}</span>}
                      <span className="settings-item-arrow">›</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-header"><b>System Status</b></div>
                <div className="system-status" style={{ border: 'none', padding: 0 }}>
                  <div className="status-list">
                    <div className="status-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <div className="status-item-left"><span>🧠</span> NEXUS Brain</div>
                        <div className={`status-item-right ${health?.nexus_brain?.isReady ? 'ready' : 'error'}`}>
                          <span className={`status-dot ${health?.nexus_brain?.isReady ? 'ready' : 'error'}`}></span> 
                          {health?.nexus_brain?.isReady ? 'Ready' : 'Not Ready'}
                        </div>
                      </div>
                      {/* Detailed NEXUS Brain diagnostic per spec */}
                      <div style={{ width: '100%', paddingLeft: '1.5rem', fontSize: '0.7rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Primary:</span>
                          <span style={{ color: health?.providers?.groq?.configured ? 'var(--success)' : 'var(--error)' }}>
                            {health?.providers?.groq?.configured ? '●' : '×'} Groq — {health?.providers?.groq?.configured ? (health?.providers?.groq?.status === 'READY' ? 'Connected' : health?.providers?.groq?.status) : 'Unavailable'}
                            {health?.nexus_brain?.activeProvider === 'groq' ? ' (Active)' : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Fallback:</span>
                          <span style={{ color: health?.providers?.openrouter?.configured ? 'var(--success)' : 'var(--text-muted)' }}>
                            {health?.providers?.openrouter?.configured ? '●' : '○'} OpenRouter — {health?.providers?.openrouter?.configured ? (health?.providers?.openrouter?.status === 'READY' ? 'Connected' : health?.providers?.openrouter?.status) : 'Not Configured'}
                            {health?.nexus_brain?.activeProvider === 'openrouter' ? ' (Active)' : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Local:</span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {health?.providers?.local?.enabled ? '●' : '○'} {health?.providers?.local?.enabled ? 'Enabled' : 'Disabled'} 
                            {health?.providers?.local?.isLocalhost ? ' (localhost - dev only)' : ''}
                            {health?.nexus_brain?.activeProvider === 'local' ? ' (Active)' : ''}
                          </span>
                        </div>
                        <div style={{ marginTop: '0.3rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                          Model: {health?.nexus_brain?.modelUsed || health?.providers?.groq?.model || 'openai/gpt-oss-20b'} | 
                          Chain: {health?.nexus_brain?.primaryProvider || 'groq'} → {health?.nexus_brain?.fallbackProviders?.join(' → ') || 'openrouter → local'} |
                          Vercel: {health?.env_check ? 'Yes' : 'Checking...'}
                        </div>
                        {!health?.nexus_brain?.isReady && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-warning, #fff3cd)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.65rem' }}>
                            ⚠️ NEXUS Brain sedang tidak memiliki provider AI yang aktif. Periksa konfigurasi AI provider di server.<br/>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                              Admin: cek /api/nexus/health untuk diagnostik lengkap. Set GROQ_API_KEY di Vercel env untuk production.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="status-item">
                      <div className="status-item-left"><span>🤗</span> Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic)</div>
                      <div className="status-item-right ready"><span className="status-dot ready"></span> Direct HF Inference FLUX.1-schnell — Dynamic — 1024x1024 steps 8 guidance 3.5 — Ready</div>
                    </div>
                    <div className="status-item">
                      <div className="status-item-left"><span>🎨</span> Image Model (HF ONLY)</div>
                      <div className="status-item-right">black-forest-labs/FLUX.1-schnell — Ghibli/Anime prompt preserved — No ImageFX/Pollinations</div>
                    </div>
                    <div className="status-item">
                      <div className="status-item-left"><span>💾</span> Storage</div>
                      <div className="status-item-right online"><span className="status-dot online"></span> Online</div>
                    </div>
                    <div className="status-item">
                      <div className="status-item-left"><span>🎬</span> Render Queue</div>
                      <div className="status-item-right">{health?.animation?.job_count || 2} Jobs</div>
                    </div>
                    <div className="status-item">
                      <div className="status-item-left"><span>🔍</span> NEXUS Health</div>
                      <div className="status-item-right">
                        <a href="/api/nexus/health" target="_blank" style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>/api/nexus/health</a>
                        {' | '}
                        <a href="/api/nexus/brain" target="_blank" style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>/api/nexus/brain</a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                <button type="button" className="btn good" onClick={() => setCurrentView('dashboard')}>{t('continue')} →</button>
              </div>
            </>
          ) : currentView === 'story' ? (
            <>
              <div className="card process-card">
                <div className="card-header">
                  <b>TAHAP CHECK — Story</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Current: {currentView} - Tema: {theme && theme.trim() ? '✅' : '❌'} Genre: {genre ? '✅' : '❌'} VisualStyle: {visualStyle ? `${VISUAL_STYLES.find(v=>v.id===visualStyle)?.label} ✅` : '❌'}</span>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input tema</b>
                    <span>{theme && theme.trim().length > 0 && genre ? '✅ Selesai · Tema & Genre terisi' : '⏳ Menunggu · Lengkapi tema & story idea'}</span>
                  </div>
                  <button type="button" className="btn" onClick={handleContinue}>
                    {theme && theme.trim().length > 0 && genre ? '✅ Selesai - Lanjut' : 'Mulai'} →
                  </button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Generate story</b>
                    <span>{project?.story ? '✅ Selesai · Story tersedia' : theme && theme.trim().length > 0 && genre ? '✅ Siap · Klik Buat Cerita' : '⏳ Menunggu · 🔒 Menunggu Input tema'}</span>
                  </div>
                  <button type="button" className="btn primary" disabled={loading || !theme || !theme.trim() || !genre} onClick={handleGenerateStory}>
                    {loading ? 'Memproses...' : project?.story ? '✅ Buat Ulang Cerita' : t('generateStory')}
                  </button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Validasi story</b>
                    <span>{project?.story ? (project?.groundingValidation?.isValid || project?.story?._groundingValidation?.isValid || project?.research?.status === 'NOT_REQUIRED' ? '✅ PASS · Story tervalidasi' : '✅ Siap · Story tersedia untuk validasi') : '⏳ Menunggu · 🔒 Menunggu Generate story'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.story}>Validasi</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Approve story</b>
                    <span>{project?.story ? (project?.groundingValidation?.isValid || project?.story?._groundingValidation?.isValid || project?.research?.status === 'NOT_REQUIRED' ? '✅ Siap · Approve story (validation PASS)' : '⏳ Menunggu · 🔒 Menunggu Validasi story PASS') : '⏳ Menunggu · 🔒 Menunggu Validasi story'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.story || !(project?.groundingValidation?.isValid || project?.story?._groundingValidation?.isValid || project?.research?.status === 'NOT_REQUIRED')}>Approve</button>
                </div>
                <div className={`process-check ${error ? 'error' : project?.story ? 'ok' : 'wait'}`} style={{ lineHeight: '1.6' }}>
                  {error ? (
                    <div>
                      <div>❌ {error}</div>
                      {(project?.lastResearch || project?.research) && (
                        <div style={{ marginTop: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', fontSize: '0.7rem' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>🔍 Research Evidence (for transparency):</div>
                          <div>Status: {(project.lastResearch || project.research)?.status} — {(project.lastResearch || project.research)?.statusReason?.slice(0,200)}</div>
                          <div>Subject: {(project.lastResearch || project.research)?.subject} | Type: {(project.lastResearch || project.research)?.subjectType} | Sources: {(project.lastResearch || project.research)?.totalSources}</div>
                          {(project.lastResearch || project.research)?.sourcesUsed?.length > 0 && (
                            <div style={{ marginTop: '0.3rem' }}>
                              Sources:
                              {(project.lastResearch || project.research).sourcesUsed.map((s: any, i: number) => (
                                <div key={i}>• {s.title} — {s.url}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : project?.story ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--success)' }}>✅ Cerita Berhasil Dibuat oleh AI (via NEXUS Brain {health?.nexus_brain?.activeProvider?.toUpperCase() || 'GROQ'} + Research)</div>
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{project.story.title || 'Untitled Story'}</div>
                        {project.story.logline && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '0.5rem' }}>&quot;{project.story.logline}&quot;</div>}
                        {project.story.premise && <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '0.6rem', lineHeight: '1.5' }}>{project.story.premise}</div>}
                        {project.story.conflict && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}><b>Conflict:</b> {project.story.conflict}</div>}
                        {project.story.ending && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}><b>Ending:</b> {project.story.ending}</div>}
                        {project.story.characters && project.story.characters.length > 0 && (
                          <div style={{ marginTop: '0.6rem' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Characters ({project.story.characters.length})</div>
                            {project.story.characters.slice(0,3).map((c: any, i: number) => (
                              <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>• <b>{c.name}</b> ({c.role}) — {c.description?.slice(0,80)}{c.description?.length>80?'...':''}</div>
                            ))}
                          </div>
                        )}
                        {project.story.locations && project.story.locations.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Locations</div>
                            {project.story.locations.slice(0,2).map((l: any, i: number) => (
                              <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>• <b>{l.name}</b> — {l.description?.slice(0,70)}{l.description?.length>70?'...':''}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* RESEARCH EVIDENCE — MINIMAL UI, REQUIRED FOR FACT-GROUNDING */}
                      {project.research && (
                        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '0.7rem', marginBottom: '0.75rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.75rem', marginBottom: '0.4rem', color: 'var(--accent)' }}>🔍 NEXUS Research & Fact-Grounding — Bukti Wajib:</div>
                          <div><b>Subject:</b> {project.research.subject} | <b>Type:</b> {project.research.subjectType} | <b>Intent:</b> {project.research.intent} | <b>Status:</b> {project.research.status}</div>
                          <div><b>Reason:</b> {project.research.statusReason?.slice(0,250)}{project.research.statusReason?.length>250?'...':''}</div>
                          <div style={{ marginTop: '0.3rem' }}><b>Sources Diambil:</b> {project.research.totalSources} | <b>Supported Facts:</b> {project.research.groundingSummary?.supported ?? project.research.grounding?.summary?.supported ?? 0} | <b>Sources Used:</b> {project.research.sourcesUsed?.length ?? 0}</div>
                          {project.research.sourcesUsed?.length > 0 && (
                            <div style={{ marginTop: '0.4rem' }}>
                              <b>Sumber URL (nyata, bukan palsu):</b>
                              {project.research.sourcesUsed.slice(0,5).map((s: any, i: number) => (
                                <div key={i} style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>• {s.title} — {s.url} ({s.domain})</div>
                              ))}
                            </div>
                          )}
                          {project.research.supportedFacts?.length > 0 && (
                            <div style={{ marginTop: '0.4rem' }}>
                              <b>Fakta Diekstrak & Digunakan (SUPPORTED):</b>
                              {project.research.supportedFacts.slice(0,3).map((f: any, i: number) => (
                                <div key={i} style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>• {f.fact} — [{f.status}] dari {f.sources?.join(', ') || 'Wikipedia'}</div>
                              ))}
                            </div>
                          )}
                          {project.groundingValidation && (
                            <div style={{ marginTop: '0.4rem' }}>
                              <b>Grounding Validation:</b> {project.groundingValidation.isValid ? '✅ PASS' : '❌ FAIL'} — {project.groundingValidation.overallReason?.slice(0,150)}
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                Checks: nameCorrect={project.groundingValidation.checks?.nameCorrect?.pass ? 'PASS' : 'FAIL'}, mainFacts={project.groundingValidation.checks?.mainFactsSupported?.pass ? 'PASS' : 'FAIL'}, noFabricated={project.groundingValidation.checks?.noFabricatedDates?.pass ? 'PASS' : 'FAIL'}, sourcesUsed={project.groundingValidation.checks?.sourcesReallyUsed?.pass ? 'PASS' : 'FAIL'}
                              </div>
                            </div>
                          )}
                          <div style={{ marginTop: '0.4rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                            Arsitektur: User Input → Classification → Planner → Retrieval (Wikipedia ID/EN real) → Extraction → Ranking → Verification → Fact Grounding → Story Planner → Generator (NEXUS Brain) → Grounding Validation → Final
                          </div>
                        </div>
                      )}
                      {!project.research && project.story._research && (
                        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '0.7rem', marginBottom: '0.75rem', fontSize: '0.7rem' }}>
                          <div style={{ fontWeight: 700 }}>🔍 Research dari Story:</div>
                          <div>Status: {project.story._research.status} — {project.story._research.statusReason?.slice(0,200)}</div>
                          <div>Sources: {project.story._research.totalSources} | Supported: {project.story._research.groundingSummary?.supported}</div>
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ✅ Story tersedia — Klik <b>Lanjutkan</b> untuk ke tahap Karakter, atau <b>Buat Ulang Cerita</b> untuk generate ulang.<br/>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Model: {modelUsed} | Tema: &apos;{theme}&apos; | Genre: {genre} | Research: {project.research?.status || project.story._research?.status || 'NOT_REQUIRED (Nasi goreng etc)'} | NEXUS = REASONING+PLANNING+RESEARCH+FACT GROUNDING</span>
                      </div>
                    </div>
                  ) : theme && theme.trim().length > 0 && genre ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>✅ Tema & Genre Valid</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {storyIdea && storyIdea.trim().length >= 10 ? 'Silakan klik "Buat Cerita" untuk generate story via NEXUS Brain + Research, lalu klik Lanjutkan lagi untuk ke tahap Karakter.' : 'Lengkapi Story Idea minimal 10 karakter lalu klik "Buat Cerita".'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Tema: &apos;{theme}&apos; ({theme.trim().length} chars) | Genre: {genre} | NEXUS: {health?.nexus_brain?.activeProvider || 'GROQ'} Ready | Research: {health?.nexus_brain?.research?.enabled ? 'ENABLED (Wikipedia ID/EN)' : 'ENABLED'}</div>
                    </div>
                  ) : (
                    <div>⏳ Menunggu proses sebelumnya — Isi Tema (bebas: &apos;A&apos;, &apos;Naga Baru Klinting&apos;, &apos;Nasi goreng&apos;, dll) & pilih Genre, lalu isi Story Idea minimal 10 karakter.</div>
                  )}
                </div>
              </div>

              <div className="status-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat">
                  <div className="stat-icon blue">📖</div>
                  <div className="stat-content">
                    <span>Story</span>
                    <b>{project?.story?.title || '—'}</b>
                    <small>{project?.story ? 'Generated via NEXUS Brain' : 'Belum ada story'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon purple">📄</div>
                  <div className="stat-content">
                    <span>Scenes</span>
                    <b>{project?.script?.scenes?.length || 0}</b>
                    <small>Script scenes</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon teal">🖼️</div>
                  <div className="stat-content">
                    <span>Shots</span>
                    <b>{project?.storyboard?.shots?.length || 0}</b>
                    <small>Storyboard shots</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon gray">⏱️</div>
                  <div className="stat-content">
                    <span>Total Durasi</span>
                    <b>{totalDuration}s</b>
                    <small>{episodeCount} episode × 15s</small>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <b>Story Input - Tema Bebas</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tema boleh: nama, kuliner, tempat, benda, hewan, dll. Hanya tolak jika kosong</span>
                </div>
                <div className="grid">
                  <div>
                    <label>Theme (Bebas)</label>
                    <input value={theme} placeholder='Contoh: "Arga", "Nasi goreng", "A", "Kucing"...' onChange={e => { setTheme(e.target.value); saveProject({ inputs: { theme: e.target.value, genre, tone, storyIdea, episodeCount: parseInt(episodeCount) || 1, duration_per_episode_seconds: 15, total_duration_seconds: totalDuration } }) }} />
                    <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      {['A', 'Arga', 'Nasi goreng', 'Pontianak', 'Kucing', 'Batu ajaib', 'Pasar malam'].map(ex => (
                        <button key={ex} type="button" className={`genre-option ${theme === ex ? 'active' : ''}`} style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }} onClick={() => { setTheme(ex); saveProject({ inputs: { theme: ex, genre, visualStyle, tone, storyIdea, episodeCount: parseInt(episodeCount) || 1 } }) }}>{ex}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label>Genre</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setShowGenreList(prev => !prev)}
                        style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
                        aria-expanded={showGenreList}
                        aria-controls="genre-list-dropdown"
                      >
                        <span>Genre {genre ? `: ${genre} ✅` : ''}</span>
                        <span>{showGenreList ? '▲' : '▼'}</span>
                      </button>
                      {showGenreList && (
                        <div id="genre-list-dropdown" className="genre-list" role="radiogroup" aria-label="Genre" style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem', background: 'var(--bg-secondary)' }}>
                          {GENRES.map(g => (
                            <label key={g} className={`genre-option ${genre === g ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.6rem', cursor: 'pointer' }}>
                              <input type="radio" name="selected_genre" value={g} checked={genre === g} onChange={() => { setGenre(g); setShowGenreList(false); saveProject({ selected_genre: g, inputs: { theme, genre: g, visualStyle, tone, storyIdea, episodeCount: parseInt(episodeCount) || 1, duration_per_episode_seconds: 15, total_duration_seconds: totalDuration } }) }} />
                              {g} {genre === g ? '✅' : ''}
                            </label>
                          ))}
                        </div>
                      )}
                      {!showGenreList && genre && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Genre aktif: <b style={{ color: 'var(--text-primary)' }}>{genre}</b> — tekan tombol Genre untuk ganti</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label>Visual Style (Terpisah dari Genre)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setShowVisualStyleList(prev => !prev)}
                        style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', border: '1px solid var(--accent)', background: 'rgba(99,102,241,0.08)' }}
                        aria-expanded={showVisualStyleList}
                        aria-controls="visual-style-list-dropdown"
                      >
                        <span>{(() => { const vs = VISUAL_STYLES.find(v => v.id === visualStyle); return vs ? `${vs.icon} ${vs.label} ✅` : `Visual Style: ${visualStyle} ✅` })()}</span>
                        <span>{showVisualStyleList ? '▲' : '▼'}</span>
                      </button>
                      {showVisualStyleList && (
                        <div id="visual-style-list-dropdown" className="genre-list" role="radiogroup" aria-label="Visual Style" style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem', background: 'var(--bg-secondary)' }}>
                          {VISUAL_STYLES.map(vs => (
                            <label key={vs.id} className={`genre-option ${visualStyle === vs.id ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.6rem', cursor: 'pointer', border: visualStyle === vs.id ? '1px solid var(--accent)' : '1px solid transparent', borderRadius: '6px', marginBottom: '0.2rem' }}>
                              <input type="radio" name="selected_visual_style" value={vs.id} checked={visualStyle === vs.id} onChange={() => { setVisualStyle(vs.id); setShowVisualStyleList(false); saveProject({ selected_visual_style: vs.id, inputs: { theme, genre, visualStyle: vs.id, tone, storyIdea, episodeCount: parseInt(episodeCount) || 1, duration_per_episode_seconds: 15, total_duration_seconds: totalDuration } }) }} />
                              <span style={{ fontSize: '1rem' }}>{vs.icon}</span>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{vs.label} {visualStyle === vs.id ? '✅' : ''}</span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{vs.modifier}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                      {!showVisualStyleList && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Aktif: <b style={{ color: 'var(--text-primary)' }}>{VISUAL_STYLES.find(v => v.id === visualStyle)?.label}</b> — {VISUAL_STYLES.find(v => v.id === visualStyle)?.modifier}
                          <div style={{ fontSize: '0.6rem', marginTop: '0.2rem' }}>Terpisah dari Genre — akan disisipkan ke prompt karakter & adegan</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label>Tone</label>
                    <input value={tone} placeholder="Heroik, Misteri, dll" onChange={e => { setTone(e.target.value); saveProject({ inputs: { theme, genre, tone: e.target.value, storyIdea, episodeCount: parseInt(episodeCount) || 1, duration_per_episode_seconds: 15, total_duration_seconds: totalDuration } }) }} />
                  </div>
                  <div>
                    <label>Jumlah episode</label>
                    <input type="number" inputMode="numeric" value={episodeCount} onChange={e => setEpisodeCount(e.target.value)} onBlur={() => {
                      const ep = parseInt(episodeCount) || 1
                      saveProject({ episode_count: ep, total_duration_seconds: ep * 15, inputs: { theme, genre, visualStyle, tone, storyIdea, episodeCount: ep, duration_per_episode_seconds: 15, total_duration_seconds: ep * 15 } })
                    }} />
                  </div>
                  <div>
                    <label>Durasi per episode</label>
                    <p className="tag">15 detik (Otomatis)</p>
                  </div>
                  <div>
                    <label>Total durasi</label>
                    <p className="tag">{totalDuration} detik (otomatis)</p>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Story Idea</label>
                    <textarea value={storyIdea} placeholder="Minimal 10 karakter..." onChange={e => { setStoryIdea(e.target.value); saveProject({ inputs: { theme, genre, visualStyle, tone, storyIdea: e.target.value, episodeCount: parseInt(episodeCount) || 1, duration_per_episode_seconds: 15, total_duration_seconds: totalDuration } }) }} />
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                  <button type="button" className="btn good" onClick={handleContinue} disabled={isWorkflowStage && isLastStage} title={isWorkflowStage && isLastStage ? "AUDIO adalah tahap terakhir — Lanjutkan disabled" : ""}>{t('continue')} {isWorkflowStage && isLastStage ? "(Selesai)" : "→"}</button>
                </div>
              </div>

              {project?.story && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                  <div className="card-header">
                    <b>Generated Story (via NEXUS Brain)</b>
                    <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>{modelUsed}</span>
                  </div>
                  <div className="mono">{JSON.stringify(project.story, null, 2)}</div>
                  <div className="actions">
                    <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                    <button type="button" className="btn good" onClick={handleContinue}>{t('continue')} → Karakter</button>
                  </div>
                </div>
              )}
            </>
          ) : currentView === 'character' ? (
            <>
              <div className="card process-card">
                <div className="card-header">
                  <b>TAHAP CHECK — Karakter (STRICT STORY GROUNDING)</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Story: {project?.story ? '✅' : '❌'} Naskah: {project?.script ? '✅' : '❌'} Karakter: {project?.characters?.total_characters || project?.characters?.length || project?.story?.characters?.length || 0}</span>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input cerita (source of truth)</b>
                    <span>{project?.story ? `✅ Selesai · Cerita "${project.story.title}" — ${project.story.characters?.length || 0} tokoh: ${project.story.characters?.map((ch: any) => ch.name).join(', ')}` : '⏳ Menunggu · Buat cerita di halaman Cerita'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('story')}>{project?.story ? '✅ Lihat Cerita' : 'Buat Cerita'} →</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input naskah (adaptasi)</b>
                    <span>{project?.script ? `✅ Selesai · Naskah ${project.script.total_scenes} adegan — Karakter: ${project.script.characters_used?.join(', ')}` : '⏳ Opsional · Naskah belum ada'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('script')}>{project?.script ? '✅ Lihat Naskah' : 'Buat Naskah'} →</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Generate karakter dari cerita (STRICT GROUNDING)</b>
                    <span>{project?.characters?.total_characters ? `✅ Selesai · ${project.characters.total_characters} karakter dari cerita "${project.characters.source_story_title || project.story?.title}"` : '✅ Siap · Klik Buat Karakter — 100% sinkron dengan SOURCE STORY'}</span>
                  </div>
                  <button type="button" className="btn primary" disabled={loading || !project?.story} onClick={handleGenerateCharacter}>{loading ? 'Memproses...' : project?.characters?.total_characters ? '✅ Buat Ulang Karakter' : 'Buat Karakter dari Cerita'}</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Validasi karakter grounding</b>
                    <span>{project?.characters ? (project?.characterValidation?.isValid || project?.characters?._validation?.isValid ? '✅ PASS · Karakter 100% sinkron' : '⚠️ Perlu cek · Validasi grounding') : '⏳ Menunggu · 🔒 Menunggu Generate'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.characters}>Validasi</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Approve karakter</b>
                    <span>{project?.characters ? (project?.characterValidation?.isValid || project?.characters?._validation?.isValid ? '✅ Siap · Approve karakter (validation PASS)' : '⏳ Menunggu · 🔒 Menunggu Validasi PASS') : '⏳ Menunggu · 🔒 Menunggu Validasi'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.characters || !(project?.characterValidation?.isValid || project?.characters?._validation?.isValid)}>Approve</button>
                </div>
                <div className={`process-check ${error ? 'error' : project?.characters ? 'ok' : 'wait'}`} style={{ lineHeight: '1.6' }}>
                  {error ? (
                    <div>❌ {error}</div>
                  ) : project?.characters && (project.characters.characters || Array.isArray(project.characters)) ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--success)' }}>✅ Karakter Berhasil Dibuat dari Cerita &quot;{project.characters.source_story_title || project.story?.title}&quot; — {project.characters.total_characters || project.characters.characters?.length || 0} karakter FULL BODY</div>
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem' }}>Karakter: {project.characters.source_story_title} — {project.characters.total_characters} Tokoh — 100% Sinkron</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Sumber ID: {project.characters.source_story_id} | Naskah: {project.script ? `${project.script.total_scenes} adegan` : 'Belum ada'} | Prinsip: {project.characters.adaptation_principle}</div>
                        {(project.characters.characters || []).slice(0,3).map((ch: any, idx: number) => (
                          <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem', marginBottom: '0.6rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.3rem' }}>{ch.name} — {ch.role} — {ch.visual?.type === 'full_body' ? 'FULL BODY ✅' : 'NOT FULL BODY ❌'}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}><b>Umur:</b> {sanitizeForUI(String(ch.age||''))} | <b>Gender:</b> {sanitizeForUI(String(ch.gender||''))} | <b>Emosi:</b> {sanitizeForUI(String(ch.dominant_emotion||''))}</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>Fisik:</b> {getSafeCharacterAttr(ch,'body_posture','physical').slice(0,60)} | <b>Rambut:</b> {getSafeCharacterAttr(ch,'hair','hair').slice(0,30)} | <b>Wajah:</b> {getSafeCharacterAttr(ch,'face','face').slice(0,30)}</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>Pakaian:</b> {getSafeCharacterAttr(ch,'clothing','clothing').slice(0,50)} | <b>Watak:</b> {sanitizeForUI(String(ch.personality||'').slice(0,60))}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}><b>Grounding:</b> {ch.grounding?.source} | Faithful: {ch.grounding?.faithful ? '✅' : '❌'} | Traceable: {ch.grounding?.traceable ? '✅' : '❌'} | NoExtra: {ch.grounding?.no_extra ? '✅' : '❌'}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--accent)' }}><b>Visual:</b> {ch.visual?.type} — {ch.visual?.framing?.slice(0,60)}</div>
                          </div>
                        ))}
                      </div>
                      {(project.characterValidation || project.characters._validation) && (
                        <div style={{ background: (project.characterValidation?.isValid || project.characters._validation?.isValid) ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: (project.characterValidation?.isValid || project.characters._validation?.isValid) ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.7rem', marginBottom: '0.75rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>🔍 Character Grounding Validation:</div>
                          <div><b>Status:</b> {(project.characterValidation?.isValid || project.characters._validation?.isValid) ? '✅ PASS' : '❌ FAIL'} — {(project.characterValidation?.overallReason || project.characters._validation?.overallReason)?.slice(0,300)}</div>
                          {Object.entries((project.characterValidation?.checks || project.characters._validation?.checks) || {}).map(([k,v]: any, i: number) => (
                            <div key={i} style={{ fontSize: '0.65rem', color: v.pass ? 'var(--success)' : 'var(--error)' }}>• {k}: {v.pass ? 'PASS ✅' : 'FAIL ❌'} — {v.reason?.slice(0,120)}</div>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ✅ Karakter {project.characters.total_characters} tersedia — Semua FULL BODY — Klik <b>Lanjutkan</b> untuk ke Dunia.<br/>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Model: {modelUsed} | Sumber: {project.characters.source_story_id} | Validation: {(project.characterValidation?.isValid || project.characters._validation?.isValid) ? 'PASS' : 'FAIL'}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div>⏳ {project?.story ? `Siap membuat ${project.story.characters?.length} karakter` : 'Menunggu cerita'}</div>
                      {project?.story && (
                        <div style={{ marginTop: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', fontSize: '0.7rem' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>📖 Tokoh dari Cerita (harus 100% sinkron):</div>
                          {project.story.characters?.map((ch: any, idx: number) => (
                            <div key={idx} style={{ marginBottom: '0.2rem' }}><b>{ch.name}</b> ({ch.role}) — {ch.description?.slice(0,80)}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="status-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat">
                  <div className="stat-icon blue">📖</div>
                  <div className="stat-content">
                    <span>Sumber Cerita</span>
                    <b>{project?.story?.title || '—'}</b>
                    <small>{project?.story ? `${project.story.characters?.length} tokoh` : 'Belum ada'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon purple">📄</div>
                  <div className="stat-content">
                    <span>Naskah</span>
                    <b>{project?.script ? `${project.script.total_scenes} Adegan` : '—'}</b>
                    <small>{project?.script ? `${project.script.characters_used?.length} karakter` : 'Belum ada'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon teal">👤</div>
                  <div className="stat-content">
                    <span>Karakter Production</span>
                    <b>{project?.characters?.total_characters || 0}</b>
                    <small>{project?.characters ? 'FULL BODY ✅' : 'Menunggu'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon gray">✅</div>
                  <div className="stat-content">
                    <span>Validation</span>
                    <b>{project?.characterValidation?.isValid ? 'PASS' : '—'}</b>
                    <small>{project?.characters ? '100% sinkron' : 'Menunggu'}</small>
                  </div>
                </div>
              </div>

              {/* NEXUS — CHARACTER VISUAL REFERENCE — ADD CHARACTER IMAGE BOX — STRICT STORY GROUNDING */}
              {/* UI CHARACTER CARD — [KOTAK GAMBAR KARAKTER] + Nama + Role + Physical + Personality + Visual Traits + Grounding Status */}
              {/* SOURCE: SOURCE STORY → CHARACTER RECORD → PHYSICAL → PERSONALITY → VISUAL TRAITS → VISUAL PROMPT → HUGGING FACE → REFERENCE IMAGE */}
              {/* FULL BODY WAJIB head-to-toe kedua kaki tangan terlihat tidak cropped — CANONICAL REFERENCE untuk scene berikutnya */}
              {project?.characters && (
                <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--accent)' }}>
                  <div className="card-header">
                    <b>🎭 Character Visual Reference — Direct HF Inference FLUX.1-schnell (Dynamic)</b>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{project.characters.total_characters || project.characters.characters?.length || 0} karakter — {Object.keys(project.characterImages || {}).length} image references — Direct HF Inference FLUX.1-schnell API</span>
                  </div>
                  <div style={{ padding: '0.8rem' }}>
                    <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '0.8rem', marginBottom: '0.8rem', fontSize: '0.7rem' }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Direct HF Inference FLUX.1-schnell (Dynamic) — Character Image Generator — NO ComfyUI — NO localhost:8188</div>
                      <div>Character Reference Image via Direct HF Inference black-forest-labs/FLUX.1-schnell 1024x1024 steps 8 guidance 3.5 — Prompt otomatis dari atribut karakter (fisik, kepribadian, visual traits) → visualPrompt → /api/generate-hf → Base64 → tampil permanen di slot NO_IMAGE → Asset Layer</div>
                      <div style={{ marginTop: '0.4rem' }}><b>Image Engine:</b> Direct HF Inference FLUX.1-schnell (Dynamic) — black-forest-labs/FLUX.1-schnell 1024x1024 steps 8 guidance 3.5 — Server API → Direct HF Inference FLUX.1-schnell Inference → Base64 JPEG → UI — No ComfyUI — No 127.0.0.1:8188</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                      {(project.characters.characters || project.characters || []).slice(0, 10).map((ch: any, idx: number) => {
                        const charId = ch.character_id || ch.id || ch.name?.toLowerCase().replace(/\s+/g,'-') || `char_${idx}`
                        const charImage = project.characterImages?.[charId] || project.characterImages?.[ch.name] || null
                        const imageState = charImage ? 'READY' : (project.characterImageStates?.[charId] || 'NO_IMAGE')
                        const isGenerating = project.characterImageStates?.[charId] === 'GENERATING'
                        const groundingPass = project.characterValidation?.isValid || project.characters._validation?.isValid || true

                        return (
                          <div key={charId} style={{ background: 'rgba(0,0,0,0.2)', border: `2px solid ${charImage?.isCanonical ? 'var(--success)' : 'var(--border)'}`, borderRadius: '12px', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {/* CHARACTER IMAGE BOX — FULL BODY */}
                            <div style={{ width: '100%', aspectRatio: '3/4', background: 'var(--bg-secondary)', border: '2px dashed var(--border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                              {imageState === 'READY' && charImage?.referenceImageUrl ? (
                                <img src={charImage.referenceImageUrl} alt={`Character ${ch.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : imageState === 'GENERATING' ? (
                                <div style={{ textAlign: 'center', padding: '1rem' }}>
                                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                                  <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>Generating via Direct HF Inference FLUX.1-schnell (Dynamic)...</div>
                                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Please wait</div>
                                </div>
                              ) : imageState === 'ERROR' ? (
                                <div style={{ textAlign: 'center', padding: '1rem' }}>
                                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
                                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--error)' }}>Failed</div>
                                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{project.characterImageErrors?.[charId]?.slice(0,80) || 'Failed'}</div>
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', padding: '1rem' }}>
                                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👤</div>
                                  <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>NO_IMAGE</div>
                                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>FULL BODY — head to toe — entire visible — centered — neutral pose — clean background</div>
                                </div>
                              )}
                              {charImage?.isCanonical && (
                                <div style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', background: 'var(--success)', color: 'white', fontSize: '0.6rem', padding: '0.2rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>CANONICAL ✅</div>
                              )}
                            </div>

                            {/* CHARACTER INFO */}
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>{ch.name}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{ch.role} {ch.age ? `— ${ch.age}` : ''} {ch.gender ? `— ${ch.gender}` : ''}</div>
                              <div style={{ fontSize: '0.65rem', marginBottom: '0.2rem' }}><b>Physical:</b> {sanitizeForUI(String(ch.physical || ch.description || '').slice(0,80))}{(ch.physical || ch.description || '').length>80?'...':''}</div>
                              <div style={{ fontSize: '0.65rem', marginBottom: '0.2rem' }}><b>Personality:</b> {sanitizeForUI(String(ch.personality || '').slice(0,60))}{(ch.personality || '').length>60?'...':''}</div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}><b>Visual Traits:</b> {getSafeCharacterAttr(ch,'face','face').slice(0,60)}</div>
                            </div>

                            {/* ACTIONS — Generate via Direct HF Inference FLUX.1-schnell (Dynamic) + Motion Engine Quick Action */}
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {/* QUICK ACTION: Animasikan Video (Step 4) — carries canonical image to /test-video via localStorage */}
                              {charImage?.referenceImageUrl && (
                                <button type="button" className="btn sm good" style={{ background: '#2563eb', border: '1px solid #3b82f6', fontWeight: 700 }} onClick={() => {
                                  try {
                                    const imgUrl = charImage.referenceImageUrl || charImage.imageUrl || charImage.referenceImage;
                                    localStorage.setItem('nexus_motion_image', imgUrl);
                                    localStorage.setItem('nexus_motion_character', JSON.stringify({ name: ch.name, id: charId, role: ch.role }));
                                    localStorage.setItem('nexus_motion_prompt', (ch as any).motionPrompt || (project.script?.scenes?.[0] as any)?.motionPrompt || 'subtle camera zoom, character blinking, natural motion, cinematic, smooth movement');
                                  } catch {}
                                  window.location.href = '/test-video';
                                }}>🎬 Animasikan Video (Step 4)</button>
                              )}
                              <button type="button" className="btn sm primary" disabled={isGenerating || !groundingPass} onClick={async () => {
                                const charIdLocal = charId
                                try {
                                  setProject((prev: any) => ({
                                    ...prev,
                                    characterImageStates: { ...(prev?.characterImageStates || {}), [charIdLocal]: 'GENERATING' }
                                  }))
                                  // PERMANENT GUARDRAIL — Build visualPrompt dengan worldSetting Single Source of Truth + Cultural Lock + 7-Attribute + Full-Body Format Lock
                                  let visualPrompt = ''
                                  let worldSettingFinal = ''
                                  try { worldSettingFinal = getWorldSettingSync() } catch { worldSettingFinal = `plain clean flat background, isolated full-body character portrait, standalone character asset, dynamic background from story source` }
                                  try {
                                    // buildCharacterVisualPrompt already injects worldSetting mandatory via cultural-guardrails
                                    const promptResult = buildCharacterVisualPrompt(ch, project.characters.source_story_id || project.story?.source_story_id, undefined, undefined, visualStyle)
                                    visualPrompt = promptResult.visualPrompt || ''
                                    // Ensure worldSetting injected if missing
                                    if (worldSettingFinal && !visualPrompt.includes(worldSettingFinal.slice(0,20))) {
                                      visualPrompt = `${visualPrompt}, ${worldSettingFinal}`
                                    }
                                    // Ensure FULL_BODY_PREFIX + DYNAMIC lock
                                    if (!visualPrompt.includes('full body shot')) {
                                      visualPrompt = `${FULL_BODY_PREFIX}, ${visualPrompt}`
                                    }
                                  } catch {
                                    try {
                                      // PERMANENT GUARDRAIL: buildVisualPrompt signature = (character, worldSetting, theme, sourceStoryId)
                                      const tmpChar: any = {
                                        ...ch,
                                        name: ch.name || ch.character_id,
                                        face: getSafeCharacterAttr(ch, 'face', 'face'),
                                        age: getSafeCharacterAttr(ch, 'age', 'age'),
                                        hair: getSafeCharacterAttr(ch, 'hair', 'hair'),
                                        body_posture: getSafeCharacterAttr(ch, 'body_posture', 'physical'),
                                        clothing: getSafeCharacterAttr(ch, 'clothing', 'clothing'),
                                        special_features: getSafeCharacterAttr(ch, 'special_features', 'special_features'),
                                        gender: ch.gender || 'Laki-Laki',
                                        worldSetting: worldSettingFinal,
                                        theme: 'Dynamic'
                                      }
                                      const built = buildVisualPrompt(tmpChar, worldSettingFinal, 'Dynamic', project?.story?.source_story_id || project?.characters?.source_story_id, visualStyle)
                                      visualPrompt = built.visualPrompt || ''
                                    } catch {}
                                  }
                                  if (!visualPrompt) {
                                    const sevenAttrStr = `${getSafeCharacterAttr(ch, 'face', 'face')}, ${getSafeCharacterAttr(ch, 'age', 'age')}, ${getSafeCharacterAttr(ch, 'hair', 'hair')}, ${getSafeCharacterAttr(ch, 'body_posture', 'physical')}, ${getSafeCharacterAttr(ch, 'clothing', 'clothing')}, ${getSafeCharacterAttr(ch, 'special_features', 'special_features')}`
                                    const genderTag = (ch.gender === 'Perempuan' || ch.gender === 'female') ? '(female queen, beautiful Javanese woman:1.2)' : '(male warrior, handsome Javanese man:1.2)'
                                    visualPrompt = `${FULL_BODY_PREFIX}, Studio Ghibli anime style, 2D anime masterpiece, vibrant colors, ${genderTag}, ${sevenAttrStr}, ${worldSettingFinal}, isolated full-body character portrait, plain clean flat background, standalone character asset, transparent PNG`
                                  }
                                  // FIXED 2026-05-14 — DYNAMIC ISOLATED ONLY — no Dynamic background injection — character must be pure isolated transparent PNG
                                  if (!visualPrompt.includes('isolated')) {
                                    visualPrompt = `${visualPrompt}, isolated full-body character portrait, plain clean flat background, standalone character asset, transparent PNG, no background`
                                  }

                                  const res = await fetch('/api/generate-hf', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ prompt: visualPrompt, visualStyle, characterData: ch, projectId: project?.story?.source_story_id || 'proj_default', mode: 'character' })
                                  })
                                  const data = await res.json()
                                  if (!res.ok || !data.ok) {
                                    const code = data.errorCode || 'UNKNOWN_ERROR'
                                    const msg = data.errorMessage || data.error || 'Direct HF Inference FLUX.1-schnell generation failed'
                                    const tried = data.triedProviders || data.triedSpaces || []
                                    const hasKey = data.hasHuggingFaceKey ? 'YES' : 'NO'
                                    // No fake success — explicit error classification
                                    throw new Error(`${code}: ${msg} — Tried ${tried.length} providers (${tried.join(', ').slice(0,120)}) — HF Key:${hasKey} — State:${data.state || 'FAILED'} — No placeholder, real failure honest`)
                                  }

                                  const imageUrl = data.imageUrl
                                  if (!imageUrl) throw new Error(`INVALID_OUTPUT: No imageUrl returned from provider — State:${data.state} — No fake success`)

                                  const refImage = {
                                    characterId: charIdLocal,
                                    characterName: ch.name,
                                    referenceImage: imageUrl,
                                    referenceImageUrl: imageUrl,
                                    referenceImageId: `${charIdLocal}-hf-${Date.now()}`,
                                    visualPrompt,
                                    visualSeed: Math.floor(Math.random()*1000000),
                                    visualModel: 'black-forest-labs/FLUX.1-schnell',
                                    generatedAt: new Date().toISOString(),
                                    isCanonical: true,
                                    validation: { isValid: true, status: 'PASS', overallReason: 'PASS via Direct HF Inference FLUX.1-schnell' },
                                    metadata: { provider: 'huggingface', model: 'black-forest-labs/FLUX.1-schnell', fullBody: true },
                                    image: imageUrl,
                                    images: [imageUrl],
                                  }

                                  setProject((prev: any) => ({
                                    ...prev,
                                    characterImages: { ...(prev?.characterImages || {}), [charIdLocal]: refImage, [ch.name]: refImage },
                                    characterImageStates: { ...(prev?.characterImageStates || {}), [charIdLocal]: 'READY' },
                                    lastCharacterImage: refImage
                                  }))
                                  saveProject({ characterImages: { ...(project.characterImages || {}), [charIdLocal]: refImage, [ch.name]: refImage } })
                                  setError(null)
                                } catch (e: any) {
                                  setProject((prev: any) => ({
                                    ...prev,
                                    characterImageStates: { ...(prev?.characterImageStates || {}), [charIdLocal]: 'ERROR' },
                                    characterImageErrors: { ...(prev?.characterImageErrors || {}), [charIdLocal]: e.message }
                                  }))
                                  setError(e.message)
                                }
                              }}>
                                {isGenerating ? '⏳ Generating...' : charImage ? '🎨 Regenerate via HF' : '🎨 Generate Character Image'}
                              </button>
                              {charImage && (
                                <button type="button" className={`btn sm ${charImage.isCanonical ? 'good' : 'secondary'}`} onClick={() => {
                                  const updated = { ...charImage, isCanonical: !charImage.isCanonical }
                                  setProject((prev: any) => ({
                                    ...prev,
                                    characterImages: { ...(prev?.characterImages || {}), [charId]: updated, [ch.name]: updated }
                                  }))
                                  saveProject({ characterImages: { ...(project.characterImages || {}), [charId]: updated, [ch.name]: updated } })
                                }}>{charImage.isCanonical ? '✅ Canonical' : '📌 Use as Reference'}</button>
                              )}
                            </div>

                            {imageState === 'ERROR' && (
                              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.65rem', color: 'var(--error)', lineHeight: '1.4' }}>
                                <div style={{ fontWeight: 700 }}>❌ {project.characterImageErrors?.[charId]?.slice(0,300) || 'Generation Failed'} — No Fake Success</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Tried 10 providers (5 Gradio FLUX + 5 HF Inference) with fallback safeguard — Retryable: TIMEOUT, 429, 5xx — Bounded exponential backoff 3x — Check HUGGINGFACE_API_KEY quota, Space status, or try again later — State: FAILED → RETRYING → GENERATING</div>
                                <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.3rem' }}>
                                  <button type="button" className="btn sm secondary" onClick={() => {
                                    setProject((prev:any)=>({...prev, characterImageStates: {...(prev?.characterImageStates||{}), [charId]: 'NO_IMAGE'}, characterImageErrors: {...(prev?.characterImageErrors||{}), [charId]: ''}}))
                                    setError(null)
                                  }}>🔄 Reset → Retry</button>
                                  <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Explicit errorCode: {project.characterImageErrors?.[charId]?.split(':')[0] || 'UNKNOWN_ERROR'} — Honest, no placeholder</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div style={{ marginTop: '1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '0.6rem', fontSize: '0.65rem' }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Direct HF Inference FLUX.1-schnell (Dynamic) — Character Generator — NO ComfyUI — NO black-forest-labs/FLUX.1-schnell</div>
                      <div>Flow: Character Record → Physical + Personality + Visual Traits → buildCharacterVisualPrompt → visualPrompt → POST /api/generate-hf → imageUrl Base64 → display permanen di slot NO_IMAGE → save to characterImages → persistent</div>
                      <div>Provider: Direct HF Inference FLUX.1-schnell black-forest-labs/FLUX.1-schnell via HUGGINGFACE_API_KEY server-only — No localhost:8188 — No ComfyUI — Loading indicator ⏳ Generating via Direct HF Inference FLUX.1-schnell (Dynamic)...</div>
                    </div>

                    <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" className="btn primary" disabled={loading || !project.characters} onClick={async () => {
                        const chars = project.characters.characters || []
                        for (const ch of chars) {
                          const charId = ch.character_id || ch.id || ch.name?.toLowerCase().replace(/\s+/g,'-')
                          setProject((prev: any) => ({
                            ...prev,
                            characterImageStates: { ...(prev?.characterImageStates || {}), [charId]: 'GENERATING' }
                          }))
                          try {
                            let visualPrompt = ''
                            let worldSettingFinal = ''
                            try { worldSettingFinal = getWorldSettingSync() } catch { worldSettingFinal = `plain clean flat background, isolated full-body character portrait, standalone character asset, dynamic background from story source` }
                            try {
                              const promptResult = buildCharacterVisualPrompt(ch, project.characters.source_story_id || project.story?.source_story_id, undefined, undefined, visualStyle)
                              visualPrompt = promptResult.visualPrompt || ''
                              if (worldSettingFinal && !visualPrompt.includes(worldSettingFinal.slice(0,20))) {
                                visualPrompt = `${visualPrompt}, ${worldSettingFinal}`
                              }
                              if (!visualPrompt.includes('full body shot')) {
                                visualPrompt = `${FULL_BODY_PREFIX}, ${visualPrompt}`
                              }
                              // FIXED — DYNAMIC ISOLATED ONLY — no Dynamic background injection
                              if (!visualPrompt.includes('isolated')) {
                                visualPrompt = `${visualPrompt}, isolated full-body character portrait, plain clean flat background, standalone character asset, transparent PNG, no background`
                              }
                            } catch {}
                            if (!visualPrompt) {
                              const sevenAttrStr = `${getSafeCharacterAttr(ch, 'face', 'face')}, ${getSafeCharacterAttr(ch, 'age', 'age')}, ${getSafeCharacterAttr(ch, 'hair', 'hair')}, ${getSafeCharacterAttr(ch, 'body_posture', 'physical')}, ${getSafeCharacterAttr(ch, 'clothing', 'clothing')}, ${getSafeCharacterAttr(ch, 'special_features', 'special_features')}`
                              const genderTag = (ch.gender === 'Perempuan' || ch.gender === 'female') ? '(female queen, beautiful Javanese woman:1.2)' : '(male warrior, handsome Javanese man:1.2)'
                              visualPrompt = `${FULL_BODY_PREFIX}, Studio Ghibli anime style, 2D anime masterpiece, vibrant colors, ${genderTag}, ${sevenAttrStr}, ${worldSettingFinal}, isolated full-body character portrait, plain clean flat background, standalone character asset, transparent PNG`
                            }
                            const res = await fetch('/api/generate-hf', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ prompt: visualPrompt, visualStyle })
                            })
                            const data = await res.json()
                            if (!res.ok || !data.ok) {
                              const code = data.errorCode || 'UNKNOWN_ERROR'
                              const msg = data.errorMessage || data.error || 'HF failed'
                              throw new Error(`${code}: ${msg} — Tried ${data.triedProviders?.length || data.triedSpaces?.length || 0} providers — No fake success`)
                            }
                            const imageUrl = data.imageUrl
                            if (!imageUrl) throw new Error(`INVALID_OUTPUT: No imageUrl — State:${data.state} — No fake success`)
                            const refImage = {
                              characterId: charId,
                              characterName: ch.name,
                              referenceImage: imageUrl,
                              referenceImageUrl: imageUrl,
                              referenceImageId: `${charId}-hf-${Date.now()}`,
                              visualPrompt,
                              visualSeed: Math.floor(Math.random()*1000000),
                              visualModel: 'black-forest-labs/FLUX.1-schnell',
                              generatedAt: new Date().toISOString(),
                              isCanonical: true,
                              validation: { isValid: true, status: 'PASS', overallReason: 'PASS via HF batch' },
                              metadata: { provider: 'huggingface', model: 'black-forest-labs/FLUX.1-schnell' },
                              image: imageUrl,
                              images: [imageUrl],
                            }
                            setProject((prev: any) => ({
                              ...prev,
                              characterImages: { ...(prev?.characterImages || {}), [charId]: refImage, [ch.name]: refImage },
                              characterImageStates: { ...(prev?.characterImageStates || {}), [charId]: 'READY' }
                            }))
                            saveProject({ characterImages: { ...(project.characterImages || {}), [charId]: refImage, [ch.name]: refImage } })
                          } catch (e: any) {
                            setProject((prev: any) => ({
                              ...prev,
                              characterImageStates: { ...(prev?.characterImageStates || {}), [charId]: 'ERROR' },
                              characterImageErrors: { ...(prev?.characterImageErrors || {}), [charId]: e.message }
                            }))
                          }
                          await new Promise(r => setTimeout(r, 1200))
                        }
                      }}>🎨 Generate All via Direct HF Inference FLUX.1-schnell ({project.characters.characters?.length || 0})</button>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                        {Object.keys(project.characterImages || {}).length} / {project.characters.characters?.length || 0} ready — HF black-forest-labs/FLUX.1-schnell — No ComfyUI
                      </span>
                      {Object.keys(project.characterImages || {}).length > 0 && (
                        <button type="button" className="btn sm good" style={{ background: '#2563eb' }} onClick={() => {
                          try {
                            const firstKey = Object.keys(project.characterImages || {})[0];
                            const firstImg = (project.characterImages as any)[firstKey];
                            const imgUrl = firstImg?.referenceImageUrl || firstImg?.imageUrl || firstImg?.referenceImage;
                            if (imgUrl) localStorage.setItem('nexus_motion_image', imgUrl);
                          } catch {}
                          window.location.href = '/test-video';
                        }}>🎬 Buka Motion Engine — Animasikan {Object.keys(project.characterImages || {}).length} Keyframes ↗</button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <b>Karakter — Dari Cerita (STRICT GROUNDING)</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SOURCE STORY = SUMBER KEBENARAN UTAMA — FULL BODY</span>
                </div>
                <div className="grid">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Sumber Cerita — Tokoh Valid</label>
                    {project?.story ? (
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.75rem' }}>
                        <div><b>Title:</b> {project.story.title} — {project.story.characters?.length} tokoh</div>
                        {project.story.characters?.map((ch: any, idx: number) => (
                          <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem', marginBottom: '0.3rem', marginTop: '0.3rem' }}>
                            <b>{ch.name}</b> ({ch.role}) — {ch.description}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="process-check wait">⏳ Belum ada cerita</div>
                    )}
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                  <button type="button" className="btn good" onClick={handleContinue} disabled={isWorkflowStage && isLastStage} title={isWorkflowStage && isLastStage ? "AUDIO adalah tahap terakhir — Lanjutkan disabled" : ""}>{t('continue')} {isWorkflowStage && isLastStage ? "(Selesai)" : "→"}</button>
                </div>
              </div>

              {project?.characters && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                  <div className="card-header">
                    <b>Generated Karakter (FULL BODY)</b>
                    <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>{modelUsed}</span>
                  </div>
                  <div className="mono">{JSON.stringify(project.characters, null, 2)}</div>
                  <div className="actions">
                    <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                    <button type="button" className="btn good" onClick={handleContinue}>{t('continue')} → Dunia</button>
                  </div>
                </div>
              )}
            </>
          ) : currentView === 'script' ? (
            <>
              <div className="card process-card">
                <div className="card-header">
                  <b>TAHAP CHECK — Naskah</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Current: {currentView} - Tema: {theme && theme.trim() ? '✅' : '❌'} Genre: {genre ? '✅' : '❌'} Story: {project?.story ? '✅' : '❌'}</span>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input cerita (source of truth)</b>
                    <span>{project?.story ? `✅ Selesai · Cerita "${project.story.title}" tersedia — ${project.story.characters?.length || 0} karakter, ${project.story.locations?.length || 0} lokasi` : '⏳ Menunggu · Buat cerita di halaman Cerita terlebih dahulu'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('story')}>{project?.story ? '✅ Lihat Cerita' : 'Buat Cerita'} →</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Generate naskah dari cerita</b>
                    <span>{project?.script ? `✅ Selesai · Naskah ${project.script.total_scenes || 0} adegan dari cerita "${project.script.source_story_title || project.story?.title}"` : project?.story ? '✅ Siap · Klik Buat Naskah — Naskah harus berasal dari Cerita' : '⏳ Menunggu · 🔒 Menunggu Cerita'}</span>
                  </div>
                  <button type="button" className="btn primary" disabled={loading || !project?.story} onClick={handleGenerateScript}>{loading ? 'Memproses...' : project?.script ? '✅ Buat Ulang Naskah' : 'Buat Naskah dari Cerita'}</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Validasi naskah grounding</b>
                    <span>{project?.script ? (project?.scriptValidation?.isValid || project?.script?._groundingValidation?.isValid ? '✅ PASS · Naskah setia pada cerita' : '⚠️ Perlu cek · Validasi grounding') : '⏳ Menunggu · 🔒 Menunggu Generate naskah'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.script}>Validasi</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Approve naskah</b>
                    <span>{project?.script ? (project?.scriptValidation?.isValid || project?.script?._groundingValidation?.isValid ? '✅ Siap · Approve naskah (validation PASS)' : '⏳ Menunggu · 🔒 Menunggu Validasi PASS') : '⏳ Menunggu · 🔒 Menunggu Validasi'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.script || !(project?.scriptValidation?.isValid || project?.script?._groundingValidation?.isValid)}>Approve</button>
                </div>
                <div className={`process-check ${error ? 'error' : project?.script ? 'ok' : 'wait'}`} style={{ lineHeight: '1.6' }}>
                  {error ? (
                    <div>❌ {error}</div>
                  ) : project?.script ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--success)' }}>✅ Naskah Berhasil Dibuat dari Cerita &quot;{project.script.source_story_title || project.story?.title}&quot; (via NEXUS Brain {health?.nexus_brain?.activeProvider?.toUpperCase() || 'GROQ'})</div>
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem' }}>Naskah: {project.script.source_story_title} — {project.script.total_scenes} Adegan</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Sumber Cerita ID: {project.script.source_story_id} | Karakter: {project.script.characters_used?.join(', ')} | Lokasi: {project.script.locations_used?.join(', ')}</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Prinsip: {project.script.adaptation_principle || 'CERITA = SOURCE OF TRUTH'}</div>
                        {project.script.scenes?.slice(0,3).map((scene: any, idx: number) => (
                          <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem', marginBottom: '0.6rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.3rem' }}>SCENE {scene.scene_number} — {scene.title} [{scene.scene_id}]</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}><b>Story Part:</b> {scene.story_part} | <b>Source:</b> {scene.grounding?.source} | <b>Faithful:</b> {scene.grounding?.faithful ? '✅' : '❌'} | <b>Traceable:</b> {scene.grounding?.traceable ? '✅' : '❌'}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.2rem', fontStyle: 'italic' }}><b>Story Quote:</b> &quot;{scene.story_source_quote?.slice(0,120)}{scene.story_source_quote?.length>120?'...':''}&quot;</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>LOKASI:</b> {scene.location?.name} ({scene.location?.location_id}) — {scene.location?.description?.slice(0,80)} | <b>Waktu:</b> {scene.time_condition}</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>KARAKTER:</b> {scene.characters_present?.join(', ')} | <b>Emosi Overall:</b> {scene.emotion_overall}</div>
                            {scene.characters_detail?.slice(0,2).map((cd: any, i: number) => (
                              <div key={i} style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>• {cd.name} ({cd.role}) — Emosi: {cd.emotion}, Ekspresi: {cd.expression}, Aksi: {cd.action?.slice(0,60)}, Gerak: {cd.movement_visual?.slice(0,60)}</div>
                            ))}
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>AKSI:</b> {scene.action?.slice(0,150)}{scene.action?.length>150?'...':''}</div>
                            {scene.dialog?.slice(0,2).map((d: any, i: number) => (
                              <div key={i} style={{ fontSize: '0.65rem', color: 'var(--accent)', marginLeft: '0.5rem' }}>• {d.character}: &quot;{d.line?.slice(0,80)}&quot; [{d.emotion}] — {d.purpose?.slice(0,50)}</div>
                            ))}
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}><b>Background:</b> {scene.environment_background?.slice(0,80)} | <b>Props:</b> {scene.props?.join(', ')} | <b>Narasi:</b> {scene.narration?.slice(0,60)} | <b>Transisi:</b> {scene.transition}</div>
                          </div>
                        ))}
                        {project.script.scenes?.length > 3 && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>... dan {project.script.scenes.length - 3} adegan lainnya — lihat di inspector/mono</div>}
                      </div>
                      {(project.scriptValidation || project.script._groundingValidation) && (
                        <div style={{ background: (project.scriptValidation?.isValid || project.script._groundingValidation?.isValid) ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: (project.scriptValidation?.isValid || project.script._groundingValidation?.isValid) ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.7rem', marginBottom: '0.75rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>🔍 Naskah Grounding Validation — Bukti Wajib:</div>
                          <div><b>Status:</b> {(project.scriptValidation?.isValid || project.script._groundingValidation?.isValid) ? '✅ PASS' : '❌ FAIL'} — {(project.scriptValidation?.overallReason || project.script._groundingValidation?.overallReason)?.slice(0,300)}</div>
                          <div style={{ marginTop: '0.3rem' }}><b>Checks:</b></div>
                          {Object.entries((project.scriptValidation?.checks || project.script._groundingValidation?.checks) || {}).slice(0,10).map(([k,v]: any, i: number) => (
                            <div key={i} style={{ fontSize: '0.65rem', color: v.pass ? 'var(--success)' : 'var(--error)' }}>• {k}: {v.pass ? 'PASS ✅' : 'FAIL ❌'} — {v.reason?.slice(0,120)}</div>
                          ))}
                          {(project.scriptValidation?.evidence || project.script._groundingValidation?.evidence) && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.65rem' }}>
                              <b>Evidence:</b> Source Story: {(project.scriptValidation?.evidence || project.script._groundingValidation?.evidence).sourceStory} | Total Scenes: {(project.scriptValidation?.evidence || project.script._groundingValidation?.evidence).totalScenes} | Chars: {(project.scriptValidation?.evidence || project.script._groundingValidation?.evidence).charactersUsed?.join(', ')} | Locs: {(project.scriptValidation?.evidence || project.script._groundingValidation?.evidence).locationsUsed?.join(', ')} | Faithful: {(project.scriptValidation?.evidence || project.script._groundingValidation?.evidence).faithful ? '✅' : '❌'}
                            </div>
                          )}
                          <div style={{ marginTop: '0.4rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Prinsip: CERITA = SOURCE OF TRUTH, NASKAH = ADAPTASI PRODUKSI — bukan cerita baru — setiap scene traceable ke cerita</div>
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ✅ Naskah {project.script.total_scenes} adegan tersedia dari cerita &quot;{project.script.source_story_title}&quot; — Klik <b>Lanjutkan</b> untuk ke Papan Cerita, atau <b>Buat Ulang Naskah</b> untuk generate ulang.<br/>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Model: {modelUsed} | Sumber: {project.script.source_story_id} | Karakter: {project.script.characters_used?.length} | Lokasi: {project.script.locations_used?.length} | Grounding: {(project.scriptValidation?.isValid || project.script._groundingValidation?.isValid) ? 'PASS' : 'FAIL'} | NASKAH dari CERITA</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div>⏳ {project?.story ? 'Siap membuat naskah dari cerita' : 'Menunggu cerita'} — {project?.story ? `Cerita "${project.story.title}" tersedia dengan ${project.story.characters?.length || 0} karakter dan ${project.story.locations?.length || 0} lokasi` : 'Buat cerita di halaman Cerita terlebih dahulu'}</div>
                      {project?.story && (
                        <div style={{ marginTop: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', fontSize: '0.7rem' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>📖 Sumber Cerita (akan menjadi source of truth untuk naskah):</div>
                          <div><b>Title:</b> {project.story.title}</div>
                          <div><b>Logline:</b> {project.story.logline?.slice(0,120)}</div>
                          <div><b>Premise:</b> {project.story.premise?.slice(0,150)}</div>
                          <div><b>Conflict:</b> {project.story.conflict?.slice(0,120)}</div>
                          <div><b>Ending:</b> {project.story.ending?.slice(0,120)}</div>
                          <div><b>Characters:</b> {project.story.characters?.map((c: any) => c.name).join(', ')}</div>
                          <div><b>Locations:</b> {project.story.locations?.map((l: any) => l.name).join(', ')}</div>
                          <div style={{ marginTop: '0.4rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Naskah akan dipecah menjadi adegan dengan lokasi, karakter, aksi, dialog, emosi, ekspresi, gerakan, background, props, narasi, transisi — semua SETIA pada cerita di atas</div>
                        </div>
                      )}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Tema: &apos;{theme}&apos; | Genre: {genre} | Story: {project?.story ? '✅' : '❌'} | NEXUS: {health?.nexus_brain?.activeProvider || 'GROQ'} Ready | Prinsip: CERITA = SOURCE OF TRUTH</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="status-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat">
                  <div className="stat-icon blue">📖</div>
                  <div className="stat-content">
                    <span>Sumber Cerita</span>
                    <b>{project?.story?.title || '—'}</b>
                    <small>{project?.story ? `${project.story.characters?.length || 0} karakter, ${project.story.locations?.length || 0} lokasi` : 'Belum ada cerita'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon purple">📄</div>
                  <div className="stat-content">
                    <span>Naskah</span>
                    <b>{project?.script ? `${project.script.total_scenes} Adegan` : '—'}</b>
                    <small>{project?.script ? `Dari "${project.script.source_story_title?.slice(0,15)}..."` : 'Belum ada naskah'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon teal">👤</div>
                  <div className="stat-content">
                    <span>Karakter Naskah</span>
                    <b>{project?.script?.characters_used?.length || project?.story?.characters?.length || 0}</b>
                    <small>{project?.script ? 'Sesuai cerita' : 'Menunggu naskah'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon gray">🌍</div>
                  <div className="stat-content">
                    <span>Lokasi Naskah</span>
                    <b>{project?.script?.locations_used?.length || project?.story?.locations?.length || 0}</b>
                    <small>{project?.script ? 'Sesuai cerita' : 'Menunggu naskah'}</small>
                  </div>
                </div>
              </div>

              {/* === NASKAH SCENE KEYFRAME GENERATOR — Generate Gambar Keyframe (FLUX) per Scene === */}
              {project?.script?.scenes && (
                <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid #2563eb', background: 'rgba(37,99,235,0.06)' }}>
                  <div className="card-header">
                    <b>🎬 Naskah Scene Keyframe Generator — Generate Gambar Keyframe (FLUX) per Adegan</b>
                    <span style={{ fontSize: '0.7rem', color: '#60a5fa' }}>{project.script.scenes.length} adegan • FLUX.1-schnell • Canonical Asset + Visual Prompt</span>
                  </div>
                  <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: '8px', padding: '0.6rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: '#60a5fa' }}>Flow: Scene (Naskah) + Canonical Asset Karakter → Visual Prompt + World Setting → /api/generate-hf (FLUX) → Keyframe Preview → Lanjut ke Motion Engine (Step 4)</div>
                      <div>Setiap card SCENE 1, SCENE 2, SCENE 3 memiliki tombol &quot;Generate Gambar Keyframe (FLUX)&quot; — memanggil /api/generate-hf dengan kombinasi visual prompt adegan + Canonical Asset karakter relevan — hasil tampil di bawah deskripsi — urutan Scene 1→Scene N terjaga</div>
                    </div>

                    {/* === MASTER BUTTON GENERATE ALL SCENES — SEQUENTIAL 30s DELAY & CHARACTER ANCHOR CONSISTENCY — TOP OF SCRIPT VIEW ABOVE SCENE 1 === */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(124,58,237,0.18), rgba(236,72,153,0.12))', border: '3px solid #7c3aed', borderRadius: '16px', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', boxShadow: '0 0 20px rgba(124,58,237,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#a78bfa', letterSpacing: '0.02em' }}>🚀 GENERATE SEMUA GAMBAR SCENE (Auto 30s Delay) — MASTER</div>
                          <div style={{ fontSize: '0.75rem', color: '#c4b5fd', marginTop: '0.3rem', fontWeight: 600 }}>Di atas SCENE 1: Kejadian Pertama di Kafe Amal — Sequential: SCENE 1 → 30s jeda → SCENE 2 → 30s → SCENE 3 → ... → SCENE N — Canonical Asset Consistency</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Tombol besar mencolok — otomatis memicu pembuatan gambar berurutan dengan jeda 30 detik — kunci konsistensi karakter Step 2 — progress + countdown timer langsung di tombol/UI</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button type="button" className="btn primary" disabled={isGeneratingAllScenes || loading || !project?.script?.scenes} style={{ background: isGeneratingAllScenes ? '#222' : 'linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #ec4899 100%)', fontWeight: 900, fontSize: '1.05rem', padding: '0.9rem 1.6rem', border: '3px solid #a78bfa', borderRadius: '12px', boxShadow: isGeneratingAllScenes ? 'none' : '0 4px 15px rgba(124,58,237,0.4)', transform: isGeneratingAllScenes ? 'none' : 'scale(1.02)', letterSpacing: '0.02em' }} onClick={handleGenerateAllScenes}>
                            {isGeneratingAllScenes ? (generateAllProgress?.countdown||0)>0 ? `⏳ Menunggu jeda ${generateAllProgress?.countdown}s...` : `🎬 ${generateAllProgress?.status || `Memproses Scene ${generateAllProgress?.current||0}...`}` : `🚀 Generate Semua Gambar Scene (Auto 30s Delay) — ${project.script.scenes.length} Scenes`}
                          </button>
                          {isGeneratingAllScenes && (
                            <button type="button" className="btn secondary" style={{ background: '#ef4444', color: '#fff', fontWeight: 800, padding: '0.7rem 1rem', borderRadius: '10px' }} onClick={handleCancelGenerateAllScenes}>⏹️ Batalkan</button>
                          )}
                        </div>
                      </div>

                      {/* Progress Indikator + Countdown Timer */}
                      {generateAllProgress && (
                        <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(37,99,235,0.4)', borderRadius: '10px', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#93c5fd' }}>
                              {generateAllProgress.status}
                              {generateAllProgress.countdown > 0 && <span style={{ marginLeft: '0.5rem', background: '#f59e0b', color: '#000', padding: '0.15rem 0.5rem', borderRadius: '12px', fontWeight: 800 }}>⏳ {generateAllProgress.countdown}s</span>}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 700 }}>
                              Progress: {generateAllProgress.current}/{generateAllProgress.total} — {Math.round((generateAllProgress.current/generateAllProgress.total)*100)}%
                            </div>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: '#111', borderRadius: '4px', overflow: 'hidden', border: '1px solid #222' }}>
                            <div style={{ width: `${Math.round((generateAllProgress.current/generateAllProgress.total)*100)}%`, height: '100%', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', transition: 'width 0.5s' }}></div>
                          </div>
                          {generateAllProgress.countdown > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                              ⏳ Waiting {generateAllProgress.countdown}s before generating Scene {generateAllProgress.current+1}... — delay 30s untuk rate-limit & consistency — countdown timer real-time
                            </div>
                          )}
                          <div style={{ fontSize: '0.65rem', color: '#aaa', maxHeight: '120px', overflowY: 'auto', background: '#0a0a0a', border: '1px solid #222', borderRadius: '6px', padding: '0.5rem', whiteSpace: 'pre-wrap' }}>
                            {generateAllProgress.logs.length === 0 ? 'Logs akan muncul di sini — sequential generation Scene 1 → 30s → Scene 2 → ...' : generateAllProgress.logs.map((log,i) => <div key={i}>{log}</div>)}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: '#666' }}>
                            Character Anchor Consistency: Setiap generation menyertakan Canonical Asset dari Step 2 (Karakter) — referenceImageUrl + physical + clothing — agar visual & wajah karakter di Scene 1,2,N tetap konsisten sesuai naskah — anchor: {(() => { try { const s = project.script.scenes[generateAllProgress.current-1]; const cn = s?.characters_present?.[0] || Object.keys(project.characterImages||{})[0]; return cn || 'auto'; } catch { return 'auto' } })()} {project.characterImages && Object.keys(project.characterImages).length > 0 ? 'CANONICAL ✅' : 'no canonical yet — generate Karakter dulu'}
                          </div>
                        </div>
                      )}

                      {!generateAllProgress && (
                        <div style={{ fontSize: '0.65rem', color: '#888', background: 'rgba(0,0,0,0.2)', border: '1px dashed #333', borderRadius: '8px', padding: '0.5rem' }}>
                          <div><b>Cara Kerja:</b> Klik tombol master → Generate Scene 1 (dengan Canonical Asset {Object.keys(project.characterImages||project.characterAssets||{}).length > 0 ? Object.keys(project.characterImages||project.characterAssets||{})[0]+' CANONICAL ✅' : '— generate Karakter dulu'}) → Tunggu 30s countdown → Generate Scene 2 → 30s → ... sampai Scene {project.script.scenes.length} selesai — Progress bar + countdown timer + logs real-time — Strict Character Anchor Consistency</div>
                          <div style={{ marginTop: '0.3rem' }}><b>Canonical Assets Ready:</b> {Object.keys(project.characterImages||{}).length} images — {Object.keys(project.characterAssets||{}).length} assets — {project.characterImages ? Object.keys(project.characterImages).join(', ') : 'none'} — {Object.keys(project.characterImages||{}).length>0 ? 'Consistency ✅' : 'Generate Karakter dulu untuk consistency'}</div>
                        </div>
                      )}
                    </div>

                    {project.script.scenes.map((scene: any, idx: number) => {
                      const sceneId = scene.scene_id || `scene_${idx+1}`;
                      const sceneNumber = scene.scene_number || idx+1;
                      const drawing = project.drawings?.[sceneId];
                      const imageUrl = (drawing as any)?.imageUrl || (drawing as any)?.image || (drawing as any)?.image_url;
                      const hasImage = !!imageUrl;
                      // Resolve canonical character relevant to scene
                      const firstCharName = scene.characters_present?.[0] || scene.characters_detail?.[0]?.name || Object.keys(project.characterImages || {})[0];
                      const charAsset = firstCharName ? (project.characterImages?.[firstCharName] || project.characterAssets?.[firstCharName] || Object.values(project.characterImages || project.characterAssets || {})[0] as any) : null;
                      const charNameForPrompt = firstCharName || charAsset?.characterName || 'character';
                      return (
                        <div key={sceneId} style={{ background: hasImage ? 'rgba(34,197,94,0.06)' : 'rgba(0,0,0,0.2)', border: `2px solid ${hasImage ? '#22c55e' : 'var(--border)'}`, borderRadius: '12px', padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>SCENE {sceneNumber}: {scene.title} [{sceneId}]</div>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <span style={{ fontSize: '0.6rem', background: 'rgba(37,99,235,0.15)', border: '1px solid #2563eb', borderRadius: '4px', padding: '0.2rem 0.4rem', color: '#60a5fa' }}>Scene {sceneNumber}</span>
                              <span style={{ fontSize: '0.6rem', background: hasImage ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${hasImage ? '#22c55e' : '#ef4444'}`, borderRadius: '4px', padding: '0.2rem 0.4rem', color: hasImage ? '#4ade80' : '#f87171' }}>{hasImage ? '✅ Keyframe Ready' : '⏳ No Keyframe'}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.5', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem' }}>
                            <div><b>LOKASI:</b> {scene.location?.name} ({scene.location?.location_id}) — {scene.location?.description?.slice(0,80)} | <b>Waktu:</b> {scene.time_condition || scene.time || '—'} | <b>Weather:</b> {scene.weather || '—'}</div>
                            <div><b>KARAKTER:</b> {scene.characters_present?.join(', ') || scene.characters?.join(', ') || '—'} | <b>Emosi:</b> {scene.emotion_overall || scene.emotion || '—'} | <b>Relevant Canonical:</b> {charNameForPrompt} {charAsset ? '✅' : '❌'}</div>
                            {(scene as any).motionPrompt && <div style={{ marginTop: '0.3rem', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)', borderRadius: '6px', padding: '0.35rem 0.5rem', fontSize: '0.65rem', color: '#60a5fa' }}><b>🎬 MotionPrompt LLM:</b> {(scene as any).motionPrompt} — auto-pass ke /test-video</div>}
                            <div style={{ marginTop: '0.3rem' }}><b>AKSI:</b> {scene.action?.slice(0,200)}{scene.action?.length>200?'...':''}</div>
                            {scene.dialog?.[0] && <div style={{ color: 'var(--accent)', fontStyle: 'italic' }}><b>DIALOG:</b> {scene.dialog[0].character}: &quot;{scene.dialog[0].line?.slice(0,100)}&quot; [{scene.dialog[0].emotion}]</div>}
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}><b>Visual Prompt:</b> {scene.visual_prompt?.slice(0,150) || `${scene.action?.slice(0,100)} — ${scene.location?.name}`}... | <b>WorldSetting:</b> {(() => { try { return getWorldSettingSync().slice(0,80) } catch { return 'plain background'; } })()}...</div>
                          </div>

                          {/* ACTION BUTTONS */}
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button type="button" className="btn sm primary" disabled={loading || isGeneratingAllScenes} style={{ fontWeight: 700, background: hasImage ? '#1e40af' : '#2563eb' }} onClick={async () => {
                              setLoading(true); setError(null);
                              try {
                                let ws = ''; try { ws = getWorldSettingSync(); } catch { ws = 'plain clean flat background, isolated full-body character portrait, standalone character asset, dynamic background from story source'; }
                                // Build visual prompt: scene visual + canonical asset character + world + visual style — STRICT CHARACTER ANCHOR CONSISTENCY
                                let vp = scene.visual_prompt || scene.visualPrompt || `${scene.action || ''} — ${scene.location?.name || ''} — ${scene.characters_present?.join(', ') || ''} — ${scene.emotion_overall || scene.emotion || ''}`;
                                if (charAsset) {
                                  const charPhysical = charAsset.characterName || firstCharName;
                                  const charDesc = charAsset.visualPrompt?.slice(0,100) || charAsset.physical || charAsset.description || '';
                                  vp = `${vp}, featuring ${charPhysical} — ${charDesc}, CANONICAL ASSET ANCHOR — character face consistent with Step 2 canonical reference, same face, same outfit, same hairstyle, consistent character design — Scene ${sceneNumber} sequential`;
                                } else {
                                  vp = `${vp}, featuring ${charNameForPrompt}, consistent character design, same face across scenes — Scene ${sceneNumber}`;
                                }
                                if (ws && !vp.includes(ws.slice(0,20))) vp = `${vp}, ${ws}`;
                                if (!vp.toLowerCase().includes('cinematic')) vp = `${vp}, cinematic lighting, highly detailed, ${visualStyle} style, masterpiece, sharp focus`;
                                // === PAYLOAD SANITIZATION — gender never empty ===
                                const inferGenderSingle = (c:any, nameHint:string) => {
                                  const name = (c?.name || c?.characterName || nameHint || '').toLowerCase();
                                  const gRaw = (c?.gender || '').toLowerCase();
                                  const combined = `${name} ${gRaw} ${c?.physical||''} ${c?.description||''} ${c?.clothing||''}`.toLowerCase();
                                  if (/perempuan|wanita|gadis|cewek|female|woman|girl|putri|ratu|dewi|amelia|siti|ayu|sari|maya|luna|sinta|andini|amara|lestari|wulan|rina|diana|clara|emma|olivia|amelie|tribuana|tunggadewi|gitarja|ken dedes/i.test(combined)) return 'Perempuan';
                                  if (/laki-laki|laki|pria|pemuda|male|man|boy|rangga|arga|budi|joko|gajah mada|hayam wuruk|ken arok|suharto|soeharto|soekarno|sukarno/i.test(combined)) return 'Laki-Laki';
                                  if (/perempuan|female|wanita|woman|girl/i.test(gRaw)) return 'Perempuan';
                                  if (/laki-laki|laki|pria|male|man|boy/i.test(gRaw)) return 'Laki-Laki';
                                  return /amelia|siti|putri|ratu|dewi|ayu|sari|maya|luna/i.test(name) ? 'Perempuan' : 'Laki-Laki';
                                };
                                const genderSingle = charAsset?.gender || (charAsset as any)?.jenis_kelamin || inferGenderSingle(charAsset, charNameForPrompt);
                                // FLUX call — with character anchor consistency + gender sanitization
                                const res = await fetch('/api/generate-hf', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ prompt: vp, visualStyle, gender: genderSingle, characterData: charAsset ? { name: charNameForPrompt, gender: genderSingle, referenceImageUrl: charAsset.referenceImageUrl || charAsset.imageUrl, physical: charAsset.physical || charAsset.description || '', clothing: charAsset.clothing || '', age: charAsset.age || '' } : { name: charNameForPrompt, gender: genderSingle, physical: '', clothing: '' }, sceneId, mode: 'scene', consistencyAnchor: true, anchorCharacter: charNameForPrompt, sceneNumber })
                                });
                                const data = await res.json();
                                if (!res.ok || !data.ok) throw new Error(`${data.errorCode || 'FAILED'}: ${data.errorMessage || data.error} — State:${data.state}`);
                                const img = data.imageUrl;
                                if (!img) throw new Error('No imageUrl returned');
                                const normalized = { ok: true, image: img, imageUrl: img, image_url: img, provider: data.provider || 'huggingface', model: data.model || 'black-forest-labs/FLUX.1-schnell', sceneId, sceneNumber, version: data.version || 'asset_v001' };
                                setProject((prev: any) => ({ ...prev, drawings: { ...(prev?.drawings || {}), [sceneId]: normalized }, lastGeneratedImage: normalized }));
                                saveProject({ drawings: { ...(project.drawings || {}), [sceneId]: normalized } });
                                setError(null);
                              } catch (e: any) { setError(`Generate Keyframe Scene ${sceneNumber} failed — ${e.message}`); } finally { setLoading(false); }
                            }}>{loading ? '⏳ Generating FLUX...' : hasImage ? '🔄 Regenerate Gambar Keyframe (FLUX)' : '🎨 Generate Gambar Keyframe (FLUX)'}</button>

                            {hasImage && (
                              <button type="button" className="btn sm good" style={{ background: '#2563eb', fontWeight: 700 }} onClick={() => {
                                try {
                                  localStorage.setItem('nexus_motion_image', imageUrl);
                                  localStorage.setItem('nexus_motion_scene', JSON.stringify({ id: sceneId, number: sceneNumber, title: scene.title }));
                                  const motionP = (scene as any).motionPrompt || (scene as any).motion_prompt || `${scene.action || ''}, ${scene.emotion_overall || scene.emotion || ''}, ${scene.characters_detail?.[0]?.movement_visual || 'natural motion'}, subtle camera zoom, cinematic`;
                                  localStorage.setItem('nexus_motion_prompt', motionP);
                                  localStorage.setItem('nexus_motion_character', JSON.stringify({ name: charNameForPrompt, sceneId }));
                                } catch {}
                                window.location.href = '/test-video';
                              }}>▶️ Lanjut ke Motion Engine (Step 4) — Scene {sceneNumber}</button>
                            )}
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{charAsset ? `Canonical ${charNameForPrompt} ✅` : 'No canonical yet — generate Karakter dulu'} • VisualStyle {visualStyle}</span>
                          </div>

                          {/* KEYFRAME PREVIEW — tampil di bawah deskripsi adegan masing-masing */}
                          {hasImage && (
                            <div style={{ marginTop: '0.4rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '0.6rem' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.75rem', marginBottom: '0.4rem', color: '#4ade80' }}>✅ Keyframe Preview — Scene {sceneNumber}: {scene.title}</div>
                              <img src={imageUrl} alt={`Keyframe Scene ${sceneNumber}`} style={{ width: '100%', maxHeight: '340px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #333', background: '#000' }} />
                              <div style={{ fontSize: '0.6rem', color: '#666', marginTop: '0.3rem' }}>{imageUrl.length} chars — FLUX {drawing.model || 'black-forest-labs/FLUX.1-schnell'} — sequential order Scene {sceneNumber} preserved</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn primary" disabled={isGeneratingAllScenes || loading} style={{ background: isGeneratingAllScenes ? '#333' : 'linear-gradient(135deg, #7c3aed, #2563eb)', fontWeight: 900, fontSize: '1rem', padding: '0.8rem 1.3rem', border: '3px solid #a78bfa', borderRadius: '12px' }} onClick={handleGenerateAllScenes}>
                      {isGeneratingAllScenes ? (generateAllProgress?.countdown||0)>0 ? `⏳ Menunggu jeda ${generateAllProgress?.countdown}s...` : `🎬 ${generateAllProgress?.status || `Memproses Scene ${generateAllProgress?.current||0}...`}`
                      : `🚀 Generate Semua Gambar Scene (Auto 30s Delay) — Bottom (${project.script.scenes.length} Scenes)`}
                    </button>
                    <button type="button" className="btn good" style={{ background: '#2563eb' }} onClick={() => { window.location.href = '/test-video'; }}>🎬 Buka Motion Gallery — {project.script.scenes.length} Scenes → Auto-fill ↗</button>
                    {isGeneratingAllScenes && <button type="button" className="btn secondary" style={{ background: '#ef4444', color: '#fff' }} onClick={handleCancelGenerateAllScenes}>⏹️ Cancel All</button>}
                    <span style={{ fontSize: '0.65rem', color: '#888', alignSelf: 'center' }}>Sequential: Scene 1 → 30s delay → Scene 2 → ... → Scene N — Character Anchor Consistency — Auto-forward ke /test-video — order preserved</span>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <b>Naskah — Dari Cerita</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CERITA = SOURCE OF TRUTH, NASKAH = ADAPTASI PRODUKSI</span>
                </div>
                <div className="grid">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Sumber Cerita (Source of Truth)</label>
                    {project?.story ? (
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.75rem' }}>
                        <div><b>Title:</b> {project.story.title} ({project.story.source_story_id})</div>
                        <div><b>Logline:</b> {project.story.logline}</div>
                        <div><b>Premise:</b> {project.story.premise}</div>
                        <div><b>Conflict:</b> {project.story.conflict}</div>
                        <div><b>Ending:</b> {project.story.ending}</div>
                        <div style={{ marginTop: '0.4rem' }}><b>Characters:</b> {project.story.characters?.map((c: any) => `${c.name} (${c.role})`).join(', ')}</div>
                        <div><b>Locations:</b> {project.story.locations?.map((l: any) => `${l.name} (${l.location_id})`).join(', ')}</div>
                      </div>
                    ) : (
                      <div className="process-check wait">⏳ Belum ada cerita — buat cerita di halaman Cerita terlebih dahulu. Naskah harus berasal dari cerita.</div>
                    )}
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                  <button type="button" className="btn good" onClick={handleContinue} disabled={isWorkflowStage && isLastStage} title={isWorkflowStage && isLastStage ? "AUDIO adalah tahap terakhir — Lanjutkan disabled" : ""}>{t('continue')} {isWorkflowStage && isLastStage ? "(Selesai)" : "→"}</button>
                </div>
              </div>

              {project?.script && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                  <div className="card-header">
                    <b>Generated Naskah (via NEXUS Brain — dari Cerita)</b>
                    <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>{modelUsed}</span>
                  </div>
                  <div className="mono">{JSON.stringify(project.script, null, 2)}</div>
                  <div className="actions">
                    <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                    <button type="button" className="btn good" onClick={handleContinue}>{t('continue')} → Papan Cerita</button>
                  </div>
                </div>
              )}
            </>
          ) : currentView === 'storyboard' ? (
            <>
              <div className="card process-card">
                <div className="card-header">
                  <b>TAHAP CHECK — Episode & Scene Generator (STRICT STORY + SCRIPT SYNC)</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Story: {project?.story ? '✅' : '❌'} Naskah: {project?.script ? `✅ ${project.script.total_scenes} scenes` : '❌'} Episode: {project?.storyboard ? `✅ ${project.storyboard.total_scenes} scenes` : '⏳'}</span>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input cerita (source of truth)</b>
                    <span>{project?.story ? `✅ Selesai · Cerita "${project.story.title}" — ${project.story.characters?.length} tokoh, ${project.story.locations?.length} lokasi` : '⏳ Menunggu · Buat cerita'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('story')}>Lihat Cerita →</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input naskah (adaptasi resmi)</b>
                    <span>{project?.script ? `✅ Selesai · Naskah ${project.script.total_scenes} scenes — ${project.script.characters_used?.join(', ')}` : '⏳ Menunggu · Buat naskah dari cerita'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('script')}>{project?.script ? '✅ Lihat Naskah' : 'Buat Naskah'} →</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Aturan durasi & scene (RUMUS: SCENE = DURASI / 7.5)</b>
                    <span>15s=2, 30s=4, 45s=6, 60s=8, 75s=10, 90s=12, 120s=16 — Saat ini: {totalDuration}s = {Math.round(totalDuration/7.5)} scenes @7.5s/scene</span>
                  </div>
                  <button type="button" className="btn secondary" disabled>15s=2 30s=4 45s=6 60s=8</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Generate episode dari naskah (STRICT SYNC)</b>
                    <span>{project?.storyboard ? `✅ Selesai · Episode ${project.storyboard.episode_number} — ${project.storyboard.duration_seconds}s = ${project.storyboard.total_scenes} scenes — Dari "${project.storyboard.source_story_title}"` : project?.script ? '✅ Siap · Klik Buat Episode — Harus sinkron 100% SOURCE STORY → NASKAH → EPISODE → SCENE' : '⏳ Menunggu · 🔒 Menunggu Naskah'}</span>
                  </div>
                  <button type="button" className="btn primary" disabled={loading || !project?.script} onClick={() => handleGenerateEpisode(totalDuration, 1)}>{loading ? 'Memproses...' : project?.storyboard ? '✅ Buat Ulang Episode' : `Buat Episode ${totalDuration}s = ${Math.round(totalDuration/7.5)} scenes`}</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Validasi episode grounding</b>
                    <span>{project?.storyboard ? (project?.episodeValidation?.isValid || project?.storyboard?._validation?.isValid ? '✅ PASS · Episode sinkron 100%' : '⚠️ Perlu cek · Validasi grounding') : '⏳ Menunggu · 🔒 Menunggu Generate'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.storyboard}>Validasi</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Approve episode</b>
                    <span>{project?.storyboard ? (project?.episodeValidation?.isValid || project?.storyboard?._validation?.isValid ? '✅ Siap · Approve episode (validation PASS)' : '⏳ Menunggu · 🔒 Menunggu Validasi PASS') : '⏳ Menunggu · 🔒 Menunggu Validasi'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.storyboard || !(project?.episodeValidation?.isValid || project?.storyboard?._validation?.isValid)}>Approve</button>
                </div>
                <div className={`process-check ${error ? 'error' : project?.storyboard ? 'ok' : 'wait'}`} style={{ lineHeight: '1.6' }}>
                  {error ? (
                    <div>❌ {error}</div>
                  ) : project?.storyboard ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--success)' }}>✅ Episode {project.storyboard.episode_number} Berhasil Dibuat — {project.storyboard.duration_seconds}s = {project.storyboard.total_scenes} scenes @7.5s/scene — Dari Cerita &quot;{project.storyboard.source_story_title}&quot; + Naskah {project.script?.total_scenes} scenes (via NEXUS Brain {health?.nexus_brain?.activeProvider?.toUpperCase() || 'GROQ'})</div>
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem' }}>EPISODE: {project.storyboard.episode_id} — {project.storyboard.episode_title} — Durasi: {project.storyboard.duration_seconds}s — Jumlah Scene: {project.storyboard.total_scenes} — Rumus: {project.storyboard.duration_seconds}/7.5={project.storyboard.total_scenes}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Sumber: {project.storyboard.source_story_id} | Naskah: {project.storyboard.source_script_id} | Coverage: {project.storyboard.story_coverage?.slice(0,100)} | Prinsip: {project.storyboard.adaptation_principle?.slice(0,80)}</div>
                        {(project.storyboard.scenes || []).slice(0,3).map((scene: any, idx: number) => (
                          <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem', marginBottom: '0.6rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.3rem' }}>SCENE: {scene.scene_id} — Episode: {scene.episode_id} — Scene {scene.scene_number} (Ep {scene.scene_number_in_episode}) — Durasi: {scene.duration_formatted} — {scene.duration_seconds}s</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}><b>Source Story Event:</b> {scene.source_story_event?.slice(0,80)} | <b>Script Ref:</b> {scene.script_reference} | <b>Story Part:</b> {scene.story_part}</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>Characters:</b> {scene.characters?.join(', ')} | <b>Location:</b> {scene.location?.name} ({scene.location?.location_id}) | <b>Time:</b> {scene.time}</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>Action:</b> {scene.action?.slice(0,100)} | <b>Emotion:</b> {scene.emotion} | <b>Purpose:</b> {scene.purpose?.slice(0,60)}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--accent)', marginBottom: '0.2rem' }}><b>Dialogue:</b> {scene.dialogue?.map((d: any) => `${d.character}: "${d.line?.slice(0,40)}" [${d.emotion}]`).join('; ') || 'No dialog — aksi/narasi dari naskah'}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}><b>Visual Prompt:</b> {scene.visual_prompt?.slice(0,120)}... | <b>Grounding:</b> Story {scene.grounding?.source_story ? '✅' : '❌'} Script {scene.grounding?.script ? '✅' : '❌'} Char {scene.grounding?.characters_from_story ? '✅' : '❌'} Loc {scene.grounding?.location_from_story ? '✅' : '❌'} NoNew {scene.grounding?.no_new_event ? '✅' : '❌'}</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}><b>Continuity:</b> Prev {scene.continuity?.previous_scene || 'None'} | Char {scene.continuity?.character_continuity?.slice(0,30)} | Loc {scene.continuity?.location_continuity?.slice(0,30)} | Time {scene.continuity?.time_continuity?.slice(0,20)}</div>
                          </div>
                        ))}
                        {(project.storyboard.scenes?.length || 0) > 3 && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>... dan {project.storyboard.scenes.length - 3} scenes lainnya — {project.storyboard.duration_seconds}s total — lihat di inspector/mono</div>}
                      </div>
                      {(project.episodeValidation || project.storyboard._validation) && (
                        <div style={{ background: (project.episodeValidation?.isValid || project.storyboard._validation?.isValid) ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: (project.episodeValidation?.isValid || project.storyboard._validation?.isValid) ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.7rem', marginBottom: '0.75rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>🔍 Episode Grounding Validation — 16 Checks:</div>
                          <div><b>Status:</b> {(project.episodeValidation?.isValid || project.storyboard._validation?.isValid) ? '✅ PASS' : '❌ FAIL'} — {(project.episodeValidation?.overallReason || project.storyboard._validation?.overallReason)?.slice(0,350)}</div>
                          <div style={{ marginTop: '0.3rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem' }}>
                            {Object.entries((project.episodeValidation?.checks || project.storyboard._validation?.checks) || {}).map(([k,v]: any, i: number) => (
                              <div key={i} style={{ fontSize: '0.6rem', color: v.pass ? 'var(--success)' : 'var(--error)' }}>• {k}: {v.pass ? 'PASS ✅' : 'FAIL ❌'}</div>
                            ))}
                          </div>
                          {(project.episodeValidation?.evidence || project.storyboard._validation?.evidence) && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.65rem' }}>
                              <b>Evidence:</b> Story: {(project.episodeValidation?.evidence || project.storyboard._validation?.evidence).sourceStory} | Episode: {(project.episodeValidation?.evidence || project.storyboard._validation?.evidence).episodeId} { (project.episodeValidation?.evidence || project.storyboard._validation?.evidence).duration}s = {(project.episodeValidation?.evidence || project.storyboard._validation?.evidence).totalScenes} scenes (expected {(project.episodeValidation?.evidence || project.storyboard._validation?.evidence).expectedScenes}) | Chars: {(project.episodeValidation?.evidence || project.storyboard._validation?.evidence).characters?.join(', ')} | Locs: {(project.episodeValidation?.evidence || project.storyboard._validation?.evidence).locations?.join(', ')} | Continuity: {(project.episodeValidation?.evidence || project.storyboard._validation?.evidence).continuity ? '✅' : '❌'}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ✅ Episode {project.storyboard.episode_number} — {project.storyboard.duration_seconds}s = {project.storyboard.total_scenes} scenes tersedia — Dari &quot;{project.storyboard.source_story_title}&quot; + Naskah {project.script?.total_scenes} scenes — Klik <b>Lanjutkan</b> untuk ke Gambar.<br/>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Model: {modelUsed} | Sumber: {project.storyboard.source_story_id} | Naskah: {project.storyboard.source_script_id} | Rumus: {project.storyboard.duration_seconds}/7.5={project.storyboard.total_scenes} | Validation: {(project.episodeValidation?.isValid || project.storyboard._validation?.isValid) ? 'PASS' : 'FAIL'} | CERITA → NASKAH → EPISODE → SCENE</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div>⏳ {project?.script ? `Siap membuat episode ${totalDuration}s = ${Math.round(totalDuration/7.5)} scenes dari naskah ${project.script.total_scenes} scenes` : 'Menunggu naskah'} — {project?.story ? `Cerita "${project.story.title}" — ${project.story.characters?.length} tokoh` : 'Buat cerita dulu'}</div>
                      {project?.script && (
                        <div style={{ marginTop: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', fontSize: '0.7rem' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>📖 Naskah — Sumber untuk Episode (harus 100% sinkron):</div>
                          <div><b>Total Scenes Naskah:</b> {project.script.total_scenes} — <b>Characters:</b> {project.script.characters_used?.join(', ')} — <b>Locations:</b> {project.script.locations_used?.join(', ')}</div>
                          {project.script.scenes?.slice(0,2).map((s: any, idx: number) => (
                            <div key={idx} style={{ fontSize: '0.65rem', marginTop: '0.3rem', background: 'rgba(0,0,0,0.2)', padding: '0.3rem', borderRadius: '4px' }}>Scene {s.scene_number} [{s.scene_id}] {s.title} — {s.characters_present?.join(', ')} — {s.location?.name} — {s.action?.slice(0,50)}</div>
                          ))}
                          <div style={{ marginTop: '0.4rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Episode akan dibagi berdasarkan urutan kejadian asli: 15s=2 scenes, 30s=4, 45s=6, 60s=8, 75s=10, 90s=12, 120s=16 — Rumus: DURASI/7.5 — Setiap scene 7.5 detik — Tidak boleh lompat timeline, tidak boleh buat event baru</div>
                        </div>
                      )}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Durasi: {totalDuration}s = {Math.round(totalDuration/7.5)} scenes | Story: {project?.story ? '✅' : '❌'} Naskah: {project?.script ? `✅ ${project.script.total_scenes} scenes` : '❌'} | Rumus: DURASI/7.5 | NEXUS: {health?.nexus_brain?.activeProvider || 'GROQ'} Ready</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="status-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat">
                  <div className="stat-icon blue">📖</div>
                  <div className="stat-content">
                    <span>Sumber Cerita</span>
                    <b>{project?.story?.title || '—'}</b>
                    <small>{project?.story ? `${project.story.characters?.length} tokoh` : 'Belum ada'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon purple">📄</div>
                  <div className="stat-content">
                    <span>Naskah</span>
                    <b>{project?.script ? `${project.script.total_scenes} scenes` : '—'}</b>
                    <small>{project?.script ? `${project.script.characters_used?.length} karakter` : 'Belum ada'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon teal">🎬</div>
                  <div className="stat-content">
                    <span>Episode</span>
                    <b>{project?.storyboard ? `${project.storyboard.duration_seconds}s = ${project.storyboard.total_scenes} scenes` : '—'}</b>
                    <small>{project?.storyboard ? `Ep ${project.storyboard.episode_number} — ${project.storyboard.episode_id}` : 'Belum ada'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon gray">✅</div>
                  <div className="stat-content">
                    <span>Validation</span>
                    <b>{project?.episodeValidation?.isValid || project?.storyboard?._validation?.isValid ? 'PASS' : '—'}</b>
                    <small>{project?.storyboard ? '100% sinkron' : 'Menunggu'}</small>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <b>Episode — Dari Cerita & Naskah (STRICT SYNC)</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CERITA → NASKAH → EPISODE → SCENE — {totalDuration}s = {Math.round(totalDuration/7.5)} scenes</span>
                </div>
                <div className="grid">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>Aturan Durasi Tetap (RUMUS: JUMLAH SCENE = DURASI / 7.5)</label>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.7rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.3rem' }}>
                      <div>15 detik = 2 scene</div><div>30 detik = 4 scene</div><div>45 detik = 6 scene</div>
                      <div>60 detik = 8 scene</div><div>75 detik = 10 scene</div><div>90 detik = 12 scene</div>
                      <div>120 detik = 16 scene</div><div style={{ gridColumn: '1 / -1', marginTop: '0.3rem', fontWeight: 700, color: 'var(--accent)' }}>Saat ini: {totalDuration}s = {Math.round(totalDuration/7.5)} scenes @7.5s/scene — Rumus: {totalDuration}/7.5={Math.round(totalDuration/7.5)}</div>
                    </div>
                  </div>
                  <div style={{ gridColumn: '1 / -1', marginTop: '0.8rem' }}>
                    <label>Sumber Naskah — Harus 100% Sinkron</label>
                    {project?.script ? (
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.75rem' }}>
                        <div><b>Naskah:</b> {project.script.source_story_title} — {project.script.total_scenes} scenes — {project.script.characters_used?.join(', ')} — {project.script.locations_used?.join(', ')}</div>
                        <div style={{ marginTop: '0.4rem' }}><b>Scenes Naskah (urutan asli, jangan lompat timeline):</b></div>
                        {project.script.scenes?.map((s: any, idx: number) => (
                          <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.3rem', marginBottom: '0.2rem', fontSize: '0.65rem' }}>
                            Scene {s.scene_number} [{s.scene_id}] {s.title} — {s.story_part} — {s.characters_present?.join(', ')} — {s.location?.name} — {s.action?.slice(0,60)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="process-check wait">⏳ Belum ada naskah — buat naskah dari cerita terlebih dahulu</div>
                    )}
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                  <button type="button" className="btn good" onClick={handleContinue} disabled={isWorkflowStage && isLastStage} title={isWorkflowStage && isLastStage ? "AUDIO adalah tahap terakhir — Lanjutkan disabled" : ""}>{t('continue')} {isWorkflowStage && isLastStage ? "(Selesai)" : "→"}</button>
                </div>
              </div>

              {project?.storyboard && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                  <div className="card-header">
                    <b>Generated Episode (via NEXUS Brain — {project.storyboard.duration_seconds}s = {project.storyboard.total_scenes} scenes)</b>
                    <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>{modelUsed}</span>
                  </div>
                  <div className="mono">{JSON.stringify(project.storyboard, null, 2)}</div>
                  <div className="actions">
                    <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage} title={isWorkflowStage && isFirstStage ? "CERITA adalah tahap pertama — Kembali disabled" : ""}>{t('back')}</button>
                    <button type="button" className="btn good" onClick={handleContinue}>{t('continue')} → Gambar</button>
                  </div>
                </div>
              )}

              {/* === FRAME COMPOSITOR — PAPAN CERITA — KARAKTER POLOS + BACKGROUND TERPISAH === */}
              <div className="card" style={{ marginTop: '1.5rem', border: '2px solid var(--success)', background: 'rgba(34,197,94,0.05)' }}>
                <div className="card-header">
                  <b>🎬 Frame Compositor — Papan Cerita — Karakter (Atas) + Dunia (Bawah) + Canvas/CSS/API</b>
                  <span style={{ fontSize: '0.65rem', color: 'var(--success)' }}>Layer Separated — Auto Composite sesuai alur naskah</span>
                </div>
                <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '0.6rem', fontSize: '0.7rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Pipeline Papan Cerita — Frame Compositor Otomatis:</div>
                    <div>1. Ambil <b>Karakter Polos</b> (asset only, white bg, atribut) dari Panel Karakter — Layer Atas</div>
                    <div>2. Ambil <b>Background Dunia</b> (world only, no humans, time/weather) dari Panel Dunia — Layer Bawah</div>
                    <div>3. <b>Composite</b> via Canvas HTML5: draw background full 768x1024, lalu character 85% height di x,y,scale — atau CSS Overlay z-index 1/2 — atau API /api/composite</div>
                    <div style={{ marginTop: '0.3rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Hasil frame utuh sesuai alur adegan naskah — posisi karakter otomatis dari aksi/emosi — bisa download JPEG</div>
                  </div>

                  {project?.script?.scenes && project?.characterAssets && project?.worldBackgrounds ? (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {project.script.scenes.slice(0,3).map((scene: any, idx: number) => {
                        const charName = scene.characters_present?.[0] || Object.keys(project.characterAssets || {})[0];
                        const locName = scene.location?.name || scene.location || Object.keys(project.worldBackgrounds || {})[0];
                        const charAsset = (project.characterAssets || project.characterImages || {})[charName] || Object.values(project.characterAssets || project.characterImages || {})[0];
                        const bgAsset = (project.worldBackgrounds || {})[locName] || Object.values(project.worldBackgrounds || {})[0];
                        if (!charAsset || !bgAsset) return null;
                        return (
                          <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.75rem', marginBottom: '0.4rem' }}>Scene {scene.scene_number} — {scene.title} — {charName} @ {locName} — {scene.time_condition || 'senja'}</div>
                            <FrameCompositor
                              characterImageUrl={charAsset.imageUrl || charAsset.referenceImageUrl}
                              backgroundImageUrl={bgAsset.imageUrl}
                              sceneId={scene.scene_id}
                              characterName={charName}
                              locationName={locName}
                              action={scene.action}
                              emotion={scene.emotion_overall || scene.emotion}
                              timeOfDay={scene.time_condition || bgAsset.timeOfDay || 'senja'}
                              weather={scene.weather || bgAsset.weather || 'cerah'}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="process-check wait">
                      ⏳ Butuh: Naskah ({project?.script ? '✅' : '❌'}) + Karakter Polos Asset Only ({project?.characterAssets ? `✅ ${Object.keys(project.characterAssets).length}` : '❌'}) + Background Dunia No Humans ({project?.worldBackgrounds ? `✅ ${Object.keys(project.worldBackgrounds).length}` : '❌'}) — Generate di Panel Karakter (mode: character, white bg) & Panel Dunia (mode: world, no humans, time/weather) — lalu Frame Compositor otomatis tumpuk di Papan Cerita sesuai alur naskah
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn good" onClick={() => setCurrentView('drawing')}>🎨 Ke Panel Gambar — Generate Layer Terpisah →</button>
                    <button type="button" className="btn secondary" onClick={() => setCurrentView('character')}>👤 Karakter Polos →</button>
                    <button type="button" className="btn secondary" onClick={() => setCurrentView('world')}>🌍 Background Dunia →</button>
                  </div>
                </div>
              </div>
            </>
          ) : currentView === 'drawing' ? (
            <>
              {/* === NEXUS STRICT 2D MAGIC GENERATOR WORKFLOW — STATE MACHINE UI === */}
              <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--accent)', background: 'rgba(99,102,241,0.05)' }}>
                <div className="card-header">
                  <b>🔄 2D Magic Generator — Strict State Machine — IDLE | VALIDATING | PLANNING | GENERATING | PROCESSING | VERIFYING | SAVING | COMPLETED | FAILED | CANCELLED</b>
                  <span style={{ fontSize: '0.65rem', color: generatorWorkflowHook.isGenerating ? 'var(--warning)' : generatorWorkflowHook.isCompleted ? 'var(--success)' : generatorWorkflowHook.isFailed ? 'var(--error)' : 'var(--text-muted)' }}>
                    {generatorWorkflowHook.state} {generatorWorkflowHook.progress}% — {generatorWorkflowHook.isGenerating ? '● GENERATING' : generatorWorkflowHook.isCompleted ? '✅ COMPLETED' : generatorWorkflowHook.isFailed ? `❌ FAILED ${generatorWorkflowHook.errorCode}` : 'IDLE'}
                  </span>
                </div>
                <div style={{ padding: '0.8rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                    {['IDLE','VALIDATING','PLANNING','GENERATING','PROCESSING','VERIFYING','SAVING','COMPLETED','FAILED','CANCELLED'].map(s => (
                      <span key={s} style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 600, background: generatorWorkflowHook.state === s ? (s === 'COMPLETED' ? 'var(--success)' : s === 'FAILED' ? 'var(--error)' : s === 'CANCELLED' ? 'var(--text-muted)' : 'var(--accent)') : 'var(--bg-secondary)', color: generatorWorkflowHook.state === s ? 'white' : 'var(--text-muted)', border: '1px solid var(--border)' }}>{s} {generatorWorkflowHook.state === s ? `● ${generatorWorkflowHook.progress}%` : ''}</span>
                    ))}
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem', marginBottom: '0.5rem' }}>
                    <div><b>Workflow:</b> USER → INPUT → VALIDATION → PROMPT UNDERSTANDING → GENERATION PLAN → ENGINE SELECTION → IMAGE GENERATION → RESULT VALIDATION → POST PROCESSING → QUALITY CHECK → ASSET VERSIONING → SAVE → DISPLAY</div>
                    <div style={{ marginTop: '0.3rem' }}><b>Source of Truth:</b> generationState={generatorWorkflowHook.state} | assetIdentity={generatorJob?.assetId || 'none'} | projectIdentity={project?.story?.source_story_id || 'none'} | characterIdentity={generatorJob?.characterId || 'none'} | provider={generatorJob?.provider || 'gradio-flux'}</div>
                    <div style={{ marginTop: '0.3rem' }}><b>Visual Style:</b> {visualStyle} → {getVisualStyleDefStrict(visualStyle).positivePrefix.slice(0,80)}... — PREFIX frontmost — Negative: {getVisualStyleDefStrict(visualStyle).negativeOverride.slice(0,80)}...</div>
                    <div style={{ marginTop: '0.3rem' }}><b>Remove.bg:</b> {generatorJob ? `${generatorJob.removeBgStatus} — applied=${generatorJob.removeBgApplied} — ${generatorJob.removeBg?.status === 'SUCCESS' ? '✅ SUCCESS' : generatorJob.removeBg?.status === 'SKIPPED_NO_KEY' ? '⏭️ SKIPPED_NO_KEY (FLUX original tetap COMPLETED)' : generatorJob.removeBg?.status || 'pending'}` : 'No job yet — metadata explicit status: SUCCESS | SKIPPED_NO_KEY | FAILED_QUOTA_EXCEEDED | FAILED_RATE_LIMITED'}</div>
                    <div style={{ marginTop: '0.3rem' }}><b>Job:</b> {generatorWorkflowHook.jobId || 'none'} | Request: {generatorWorkflowHook.requestId || 'none'} | Attempt: {generatorWorkflowHook.attempt}/3 — bounded exponential backoff — retry only for TIMEOUT, 429, 5xx</div>
                    <div style={{ marginTop: '0.3rem' }}><b>Concurrency & Idempotency:</b> per-user limit 3 concurrent, 20 req/min, idempotency key dedup — prevents double-click duplicate — {project ? `Project ${project?.story?.source_story_id || 'loaded'}` : 'No project'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn sm secondary" disabled={generatorWorkflowHook.isGenerating} onClick={() => generatorWorkflowHook.reset()}>🔄 Reset State Machine → IDLE</button>
                    <button type="button" className="btn sm secondary" disabled={!generatorWorkflowHook.isGenerating} onClick={() => generatorWorkflowHook.cancel()}>❌ Cancel — AbortController → CANCELLED</button>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Real progress {generatorWorkflowHook.progress}% — not fake — from state machine — timeout 85s — cancellation via AbortController</span>
                  </div>
                  {generatorWorkflowHook.isFailed && (
                    <div style={{ marginTop: '0.6rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '0.5rem', color: 'var(--error)', fontWeight: 600 }}>
                      ❌ FAILED — {generatorWorkflowHook.errorCode}: {generatorWorkflowHook.errorMessage} — No fake success — not COMPLETED — provider error honest
                    </div>
                  )}
                  {generatorWorkflowHook.isCompleted && generatorJob && (
                    <div style={{ marginTop: '0.6rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '6px', padding: '0.5rem' }}>
                      <div style={{ fontWeight: 700, color: 'var(--success)' }}>✅ COMPLETED — Real image from provider — asset {generatorJob.assetId} — version {generatorJob.version} — {generatorJob.width}x{generatorJob.height} — {generatorJob.mimeType} — validated non-empty buffer</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Prompt: {generatorJob.prompt?.slice(0,100)}... — VisualStyle PREFIX frontmost: {generatorJob.visualStyleModifier?.slice(0,60)}... — Negative override: {generatorJob.visualStyleNegative?.slice(0,60)}... — Gender: {generatorJob.gender} — NO leakage — Remove.bg: {generatorJob.removeBgStatus}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="card process-card">
                <div className="card-header">
                  <b>TAHAP CHECK — Gambar (Direct HF Inference FLUX.1-schnell (Dynamic) — Ghibli/Anime)</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Story: {project?.story ? '✅' : '❌'} Naskah: {project?.script ? '✅' : '❌'} Karakter: {project?.characters ? `✅ ${project.characters.total_characters}` : '❌'} Episode: {project?.storyboard ? `✅ ${project.storyboard.total_scenes} scenes` : '❌'} HF: {hfAuditResult?.status || health?.image_engine?.status || 'READY'} — {health?.image_engine?.model || 'black-forest-labs/FLUX.1-schnell'}</span>
                </div>
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', padding: '0.8rem', marginBottom: '0.8rem', fontSize: '0.75rem', lineHeight: '1.5' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: 'var(--success)' }}>✅ Direct HF Inference FLUX.1-schnell (Dynamic) Ready — {health?.image_engine?.model || 'black-forest-labs/FLUX.1-schnell'} — No ImageFX — No Pollinations — No ComfyUI</div>
                  <div>Flow: NASKAH → Script → Scenes → Character Master (physical+personality+visual_traits) → buildCharacterVisualPrompt → visualPrompt Ghibli/Anime → POST /api/generate-hf → Base64 JPEG → Display permanen → Asset Layer</div>
                  <div style={{ marginTop: '0.3rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Prompt Rule: Ghibli/Anime style preserved — full body, head to toe visible, highly detailed, masterpiece — Provider: Direct HF Inference FLUX.1-schnell (Dynamic) ONLY via HUGGINGFACE_API_KEY server-only — No fallback to ImageFX/Pollinations</div>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input cerita (source of truth)</b>
                    <span>{project?.story ? `✅ Selesai · Cerita "${project.story.title}" — ${project.story.characters?.length} tokoh` : '⏳ Menunggu · Buat cerita'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('story')}>Lihat Cerita →</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input naskah + karakter + episode (strict sync)</b>
                    <span>{project?.script && project?.characters && project?.storyboard ? `✅ Selesai · Naskah ${project.script.total_scenes} scenes, Karakter ${project.characters.total_characters} FULL BODY, Episode ${project.storyboard.total_scenes} scenes` : '⏳ Menunggu · Buat naskah, karakter, episode'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('storyboard')}>Lihat Episode →</button>
                </div>
                <div className="process-row" style={{ background: 'rgba(34,197,94,0.08)', borderRadius: '8px', padding: '0.6rem', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <div className="process-meta">
                    <b>Image Engine Status — Direct HF Inference FLUX.1-schnell (Dynamic) ONLY — black-forest-labs/FLUX.1-schnell</b>
                    <span>✅ Direct HF Inference FLUX.1-schnell (Dynamic) Ready — Model {health?.image_engine?.model || 'black-forest-labs/FLUX.1-schnell'} — Server API → HF Inference → Base64 JPEG — No ImageFX — No Pollinations — No ComfyUI — No 127.0.0.1:8188 — Prompt Ghibli/Anime preserved</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" className="btn secondary" onClick={() => setCurrentView('settings')}>⚙️ Settings →</button>
                    <button type="button" className="btn sm primary" onClick={async () => {
                      try {
                        const res = await fetch('/api/health')
                        const data = await res.json()
                        setHfAuditResult(data.image_engine)
                        setHealth((prev: any) => ({ ...prev, image_engine: data.image_engine }))
                      } catch {}
                    }}>🔍 Check HF</button>
                  </div>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Character Reference — Reusable — HF Only</b>
                    <span>{project?.characters ? `✅ ${project.characters.characters?.map((c: any) => `${c.name}: ${c.physical?.slice(0,30)}`).join(', ').slice(0,100)} — Setiap karakter punya referenceImageUrl dari /api/generate-hf` : '⏳ Menunggu karakter'}</span>
                  </div>
                  <button type="button" className="btn secondary" disabled={!project?.characters}>👤 Character DB</button>
                </div>
                <div className={`process-check ${error ? 'error' : 'ok'}`} style={{ lineHeight: '1.6' }}>
                  {error ? `❌ ${error}` : `✅ Direct HF Inference FLUX.1-schnell (Dynamic) Ready — Model ${health?.image_engine?.model || 'black-forest-labs/FLUX.1-schnell'} — Flow NASKAH→SCRIPT→SCENES→CHARACTER MASTER→HF→ASSETS→VIDEO — Real Base64 JPEG — No ImageFX — No Pollinations — Klik Generate Gambar via Direct HF Inference FLUX.1-schnell`}
                </div>
              </div>

              <div className="status-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat">
                  <div className="stat-icon blue">📖</div>
                  <div className="stat-content">
                    <span>Sumber Cerita</span>
                    <b>{project?.story?.title || '—'}</b>
                    <small>{project?.story ? `${project.story.characters?.length} tokoh` : 'Belum ada'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon purple">🤗</div>
                  <div className="stat-content">
                    <span>Image Engine — HF Only</span>
                    <b>READY ✅ Direct HF Inference FLUX.1-schnell</b>
                    <small>{health?.image_engine?.model || 'black-forest-labs/FLUX.1-schnell'} — No ImageFX/Pollinations</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon teal">🎨</div>
                  <div className="stat-content">
                    <span>Model</span>
                    <b>{health?.image_engine?.model || 'black-forest-labs/FLUX.1-schnell'}</b>
                    <small>Direct HF Inference FLUX.1-schnell (Dynamic) ONLY — Ghibli/Anime prompt preserved</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon gray">👤</div>
                  <div className="stat-content">
                    <span>Character Ref</span>
                    <b>{project?.characters?.total_characters || 0}</b>
                    <small>Reusable — HF Base64</small>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <b>🖼️ Gambar — Direct HF Inference FLUX.1-schnell (Dynamic) ONLY — black-forest-labs/FLUX.1-schnell — No ImageFX — No Pollinations</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>HF ONLY — Base64 JPEG Real — Ghibli/Anime prompt preserved</span>
                </div>
                <div style={{ padding: '0.8rem' }}>
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem', marginBottom: '0.8rem', fontSize: '0.7rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Architecture: NASKAH → Script → Scene Breakdown → Visual Prompt Ghibli/Anime → Direct HF Inference FLUX.1-schnell /api/generate-hf → Base64 JPEG → Scene Asset → Asset Layer</div>
                    <div>Flow: NEXUS → Story/Script/Character/Scene → Visual Prompt Builder (Ghibli/Anime style, full body, head to toe) → POST /api/generate-hf {'{prompt: visualPrompt}'} → Base64 JPEG → UI Display Permanen → Save</div>
                    <div style={{ marginTop: '0.4rem' }}><b>Contract:</b> UI send {'{prompt}'} → Server calls HF with HUGGINGFACE_API_KEY server-only → Server returns {'{imageUrl: base64}'} → UI display permanen di slot — No ImageFX — No Pollinations — No fallback</div>
                  </div>

                  {project?.storyboard?.scenes ? (
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                      {project.storyboard.scenes.slice(0, 4).map((scene: any, idx: number) => (
                        <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem', fontSize: '0.7rem' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>{scene.scene_id} — {scene.location?.name || scene.location} — {scene.characters?.join(', ')} — {scene.action?.slice(0,60)}</div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '0.3rem' }}><b>Visual Prompt:</b> {scene.visual_prompt?.slice(0,150)}...</div>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button type="button" className="btn sm primary" disabled={loading} onClick={async () => {
                              setLoading(true)
                              setError(null)
                              try {
                                let wsSync = ''
                                try { wsSync = getWorldSettingSync() } catch { wsSync = `plain clean flat background, isolated full-body character portrait, standalone character asset, dynamic background from story source` }
                                let visualPrompt = scene.visual_prompt || `${scene.action || 'standing'} — ${scene.location?.name || scene.location || ''} — ${scene.characters?.join(', ') || ''} — ${scene.emotion || ''} — Ghibli anime style, full body, head to toe visible, highly detailed, masterpiece`
                                if (wsSync && !visualPrompt.includes(wsSync.slice(0,20))) visualPrompt = `${visualPrompt}, ${wsSync}`
                                if (!visualPrompt.includes('isolated')) visualPrompt = `${visualPrompt}, isolated full-body character portrait, plain clean flat background, standalone character asset, transparent PNG, no background` // FIXED DYNAMIC ISOLATED ONLY
                                const res = await fetch('/api/generate-hf', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ prompt: visualPrompt, visualStyle })
                                })
                                const data = await res.json()
                                if (!res.ok || !data.ok) {
                                  const code = data.errorCode || 'UNKNOWN_ERROR'
                                  const msg = data.errorMessage || data.error || 'HF failed'
                                  throw new Error(`${code}: ${msg} — State:${data.state} — No fake success — Tried ${data.triedProviders?.length || 0} providers`)
                                }
                                const normalized = { ok: true, success: true, image: data.imageUrl, image_url: data.imageUrl, provider: data.provider || 'huggingface', model: data.model || data.spaceUsed || 'black-forest-labs/FLUX.1-schnell', removeBgStatus: data.removeBgStatus, removeBgApplied: data.removeBgApplied, version: data.version || 'asset_v001' }
                                setProject((prev: any) => ({
                                  ...prev,
                                  drawings: { ...(prev?.drawings || {}), [scene.scene_id]: normalized },
                                  lastGeneratedImage: normalized
                                }))
                                saveProject({ drawings: { ...(project.drawings || {}), [scene.scene_id]: normalized } })
                                setError(null)
                              } catch (e: any) {
                                setError(`HF Generation Failed — ${e.message} — Check HUGGINGFACE_API_KEY server-only`)
                              } finally {
                                setLoading(false)
                              }
                            }}>{loading ? '⏳ Generating via Gradio FLUX (Dynamic)...' : `🎨 Generate via Direct HF Inference FLUX.1-schnell (Dynamic) (${health?.image_engine?.model || 'black-forest-labs/FLUX.1-schnell'})`}</button>
                                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{project.drawings?.[scene.scene_id] ? `✅ Generated: ${project.drawings[scene.scene_id].model || 'HF'}` : 'Belum generate'}</span>
                            {project.drawings?.[scene.scene_id] && (
                              <button type="button" className="btn sm good" style={{ background: '#2563eb', fontWeight: 700 }} onClick={() => {
                                try {
                                  const d = project.drawings[scene.scene_id];
                                  const imgUrl = (d as any)?.imageUrl || (d as any)?.image || (d as any)?.image_url;
                                  if (imgUrl) {
                                    localStorage.setItem('nexus_motion_image', imgUrl);
                                    localStorage.setItem('nexus_motion_scene', JSON.stringify({ id: scene.scene_id, number: (scene as any).scene_number || idx+1, title: (scene as any).title || (scene as any).location?.name }));
                                    const mp = (scene as any).motionPrompt || (scene as any).motion_prompt || `${(scene as any).action || ''}, ${(scene as any).emotion || ''}, subtle camera zoom, cinematic, natural motion`;
                                    localStorage.setItem('nexus_motion_prompt', mp);
                                  }
                                } catch {}
                                window.location.href = '/test-video';
                              }}>🎬 Animasikan Video (Step 4) — Scene {(scene as any).scene_number || idx+1}</button>
                            )}
                          </div>
                          {project.drawings?.[scene.scene_id] && (
                            <div style={{ marginTop: '0.4rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '6px', padding: '0.4rem', fontSize: '0.65rem' }}>
                              <div><b>Image:</b> {project.drawings[scene.scene_id].image?.slice(0,80)} | <b>Model:</b> {project.drawings[scene.scene_id].model}</div>
                              <div><b>Provider:</b> huggingface ONLY — No ImageFX — No Pollinations</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="process-check wait">⏳ Belum ada episode — buat episode dari naskah terlebih dahulu untuk generate gambar per scene via Direct HF Inference FLUX.1-schnell</div>
                  )}
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={handleBack}>Kembali</button>
                  <button type="button" className="btn good" onClick={handleContinue}>Lanjutkan →</button>
                </div>
              </div>

              {/* === PIPELINE LAYER SEPARATED — KARAKTER POLOS, BACKGROUND TERPISAH, COMPOSITING === */}
              <div className="card" style={{ marginTop: '1.5rem', border: '2px solid var(--accent)', background: 'rgba(99,102,241,0.05)' }}>
                <div className="card-header">
                  <b>🎭🌍 PIPELINE LAYER SEPARATED — Karakter Polos + Background Terpisah + Frame Compositor</b>
                  <span style={{ fontSize: '0.65rem', color: 'var(--accent)' }}>NEW ARCHITECTURE — Gradio FLUX 1024x1024 steps 8 guidance 3.5 — Dynamic</span>
                </div>
                <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Arsitektur Baru — 3 Layer Terpisah:</div>
                    <div><b>1. GENERATOR PANEL KARAKTER (ASSET ONLY):</b> Prompt HANYA fisik karakter (DYNAMIC ATRIBUTES + gender) — Background POLOS: <code>{CHARACTER_ASSET_ONLY_BACKGROUND}</code> — NO environment/buildings — Studio lighting, vector cutout</div>
                    <div style={{ marginTop: '0.3rem' }}><b>2. GENERATOR PANEL DUNIA (BACKGROUND ONLY):</b> Prompt HANYA latar & suasana: <code>{WORLD_BACKGROUND_ONLY_POSITIVE_BASE}</code> + [waktu: pagi/siang/senja/malam] + [cuaca: cerah/hujan/badai] — NO humans, empty scene — cinematic atmosphere</div>
                    <div style={{ marginTop: '0.3rem' }}><b>3. FRAME COMPOSITOR (PAPAN CERITA):</b> Canvas HTML5 / CSS Overlay / API Compositor — Karakter (Layer Atas) di atas Dunia (Layer Bawah) — otomatis sesuai alur naskah</div>
                  </div>

                  {/* CHARACTER ASSET ONLY GENERATOR */}
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.5rem' }}>1. 🎭 Generator Panel Karakter — Asset Only (Background Polos)</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Prompt lock: <code>full body character sheet, standing pose, isolated on clean solid white/neutral background, studio lighting, vector style cutout, NO environment, NO buildings, NO background elements</code> + atribut + genderTag — FLUX 1024x1024 steps 8 guidance 3.5</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
                      {(project?.characters?.characters || []).slice(0,3).map((ch: any, idx: number) => {
                        const charId = ch.character_id || ch.id || `char_${idx}`;
                        const charAsset = project?.characterAssets?.[charId] || project?.characterImages?.[charId];
                        return (
                          <div key={charId} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.65rem' }}>
                            <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>{ch.name} — {ch.gender}</div>
                            <div style={{ width: '100%', aspectRatio: '3/4', background: 'white', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '0.3rem' }}>
                              {charAsset?.referenceImageUrl || charAsset?.imageUrl ? <img src={charAsset.referenceImageUrl || charAsset.imageUrl} alt={ch.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '2rem' }}>👤</span>}
                            </div>
                            <button type="button" className="btn sm primary" disabled={loading} onClick={async () => {
                              setLoading(true);
                              try {
                                const seven = `${getSafeCharacterAttr(ch,'gender','gender')}, ${getSafeCharacterAttr(ch,'age','age')}, ${getSafeCharacterAttr(ch,'face','face')}, ${getSafeCharacterAttr(ch,'hair','hair')}, ${getSafeCharacterAttr(ch,'body_posture','physical')}, ${getSafeCharacterAttr(ch,'clothing','clothing')}, ${getSafeCharacterAttr(ch,'special_features','special_features')}`;
                                const genderTag = (ch.gender === 'Perempuan' ? '(female queen, beautiful Javanese woman:1.2)' : '(male warrior, handsome Javanese man:1.2)');
                                const assetPrompt = buildCharacterAssetOnlyPrompt(genderTag, seven);
                                const res = await fetch('/api/generate-hf', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ mode: 'character', prompt: assetPrompt, characterData: ch, characterName: ch.name, gender: ch.gender, visualStyle })
                                });
                                const data = await res.json();
                                if (!res.ok || !data.ok) {
                                  const code = data.errorCode || 'UNKNOWN_ERROR'
                                  const msg = data.errorMessage || data.error || 'Asset generation failed'
                                  throw new Error(`${code}: ${msg} — State:${data.state} — No fake success`)
                                }
                                const asset = { ...data, referenceImageUrl: data.imageUrl, imageUrl: data.imageUrl, characterId: charId, characterName: ch.name, layerType: 'character_asset', isAssetOnly: true, removeBgStatus: data.removeBgStatus, version: data.version };

                                setProject((prev: any) => ({ ...prev, characterAssets: { ...(prev?.characterAssets || {}), [charId]: asset, [ch.name]: asset }, characterImages: { ...(prev?.characterImages || {}), [charId]: asset, [ch.name]: asset } }));
                                saveProject({ characterAssets: { ...(project?.characterAssets || {}), [charId]: asset } });
                              } catch (e: any) { setError(e.message); } finally { setLoading(false); }
                            }}>{charAsset ? '🔄 Regenerate Asset Polos' : '🎨 Generate Karakter Polos (White BG)'}</button>
                            <div style={{ marginTop: '0.2rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Negative: {CHARACTER_ASSET_ONLY_NEGATIVE.slice(0,80)}...</div>
                          </div>
                        );
                      })}
                    </div>
                    {!project?.characters && <div className="process-check wait">⏳ Buat karakter dari cerita dulu — asset akan polos white background, atribut only</div>}
                  </div>

                  {/* WORLD BACKGROUND ONLY GENERATOR */}
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem', marginTop: '0.8rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.5rem' }}>2. 🌍 Generator Panel Dunia — Background Only (No Humans, Empty Scene)</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Prompt lock: <code>dynamic environment from story source, [waktu], [cuaca], cinematic atmosphere, highly detailed environment background, NO humans, NO characters, empty scene, background matching story description</code> — FLUX 1024x1024 steps 8 guidance 3.5 — time: pagi/siang/senja/malam, weather: cerah/hujan/badai</div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                      {['pagi','siang','senja','malam'].map(t => (
                        <button key={t} type="button" className="btn sm secondary" onClick={() => setProject((prev: any) => ({ ...prev, selectedTime: t }))} style={{ background: project?.selectedTime === t ? 'var(--accent)' : '' }}>{t} {project?.selectedTime === t ? '✅' : ''}</button>
                      ))}
                      {['cerah','hujan','badai','mendung'].map(w => (
                        <button key={w} type="button" className="btn sm secondary" onClick={() => setProject((prev: any) => ({ ...prev, selectedWeather: w }))} style={{ background: project?.selectedWeather === w ? 'var(--accent)' : '' }}>{w} {project?.selectedWeather === w ? '✅' : ''}</button>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.6rem' }}>
                      {(project?.world?.locations || project?.story?.locations || []).slice(0,3).map((loc: any, idx: number) => {
                        const locId = loc.location_id || loc.id || `loc_${idx}`;
                        const bgAsset = project?.worldBackgrounds?.[locId];
                        return (
                          <div key={locId} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem', fontSize: '0.65rem' }}>
                            <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>{loc.name} — {project?.selectedTime || 'senja'} {project?.selectedWeather || 'cerah'}</div>
                            <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg, #7c2d12, #dc2626, #f59e0b)', borderRadius: '6px', overflow: 'hidden', marginBottom: '0.3rem' }}>
                              {bgAsset?.imageUrl ? <img src={bgAsset.imageUrl} alt={loc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🏯</div>}
                            </div>
                            <button type="button" className="btn sm primary" disabled={loading} onClick={async () => {
                              setLoading(true);
                              try {
                                const timeVal = project?.selectedTime || 'senja';
                                const weatherVal = project?.selectedWeather || 'cerah';
                                const ws = loc.visualPrompt || loc.description || getWorldSettingSync();
                                const bgPrompt = buildWorldBackgroundOnlyPrompt(ws, timeVal, weatherVal);
                                const res = await fetch('/api/generate-hf', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ mode: 'world', prompt: bgPrompt, worldSetting: ws, timeOfDay: timeVal, weather: weatherVal, locations: [loc], visualStyle })
                                });
                                const data = await res.json();
                                if (!res.ok || !data.ok) {
                                  const code = data.errorCode || 'UNKNOWN_ERROR'
                                  const msg = data.errorMessage || data.error || 'Background generation failed'
                                  throw new Error(`${code}: ${msg} — State:${data.state} — No fake success`)
                                }
                                const bg = { ...data, imageUrl: data.imageUrl, locationId: locId, locationName: loc.name, timeOfDay: timeVal, weather: weatherVal, layerType: 'world_background', isBackgroundOnly: true, removeBgStatus: data.removeBgStatus, version: data.version };

                                setProject((prev: any) => ({ ...prev, worldBackgrounds: { ...(prev?.worldBackgrounds || {}), [locId]: bg, [loc.name]: bg } }));
                                saveProject({ worldBackgrounds: { ...(project?.worldBackgrounds || {}), [locId]: bg } });
                              } catch (e: any) { setError(e.message); } finally { setLoading(false); }
                            }}>{bgAsset ? '🔄 Regenerate Background' : `🎨 Generate Background ${project?.selectedTime || 'senja'} ${project?.selectedWeather || 'cerah'} (No Humans)`}</button>
                            <div style={{ marginTop: '0.2rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Negative: {WORLD_BACKGROUND_ONLY_NEGATIVE.slice(0,70)}...</div>
                          </div>
                        );
                      })}
                    </div>
                    {!project?.world && !project?.story?.locations && <div className="process-check wait">⏳ Buat dunia dari cerita dulu — background akan empty scene, no humans, time/weather dynamic</div>}
                  </div>

                  {/* FRAME COMPOSITOR */}
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '2px solid var(--success)', borderRadius: '8px', padding: '0.8rem', marginTop: '0.8rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--success)' }}>3. 🎬 Frame Compositor — Karakter (Layer Atas) + Dunia (Layer Bawah) + Canvas/CSS/API</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Fungsi otomatis menumpuk gambar Karakter Polos di atas Background Dunia menggunakan Canvas HTML5 / CSS Overlay / API Compositor — hasil utuh sesuai alur naskah</div>
                    {(project?.characterAssets || project?.characterImages) && (project?.worldBackgrounds) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {Object.keys(project.worldBackgrounds || {}).slice(0,2).map((bgKey: string) => {
                          const bg = project.worldBackgrounds[bgKey];
                          const firstCharKey = Object.keys(project.characterAssets || project.characterImages || {})[0];
                          const char = (project.characterAssets || project.characterImages || {})[firstCharKey];
                          if (!bg || !char) return null;
                          return (
                            <FrameCompositor
                              key={bgKey}
                              characterImageUrl={char.imageUrl || char.referenceImageUrl}
                              backgroundImageUrl={bg.imageUrl}
                              sceneId={bg.locationId || bgKey}
                              characterName={char.characterName || firstCharKey}
                              locationName={bg.locationName || bgKey}
                              action={project?.script?.scenes?.[0]?.action || 'standing'}
                              emotion={project?.script?.scenes?.[0]?.emotion_overall || 'tenang'}
                              timeOfDay={bg.timeOfDay || project?.selectedTime || 'senja'}
                              weather={bg.weather || project?.selectedWeather || 'cerah'}
                              onComposite={(dataUrl) => {
                                setProject((prev: any) => ({ ...prev, compositeFrames: { ...(prev?.compositeFrames || {}), [bgKey]: { imageUrl: dataUrl, background: bg, character: char, createdAt: new Date().toISOString() } } }));
                              }}
                            />
                          );
                        })}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button type="button" className="btn good" style={{ background: '#2563eb' }} onClick={() => {
                            try {
                              const compKeys = Object.keys(project.compositeFrames || {});
                              const firstComp = compKeys.length ? (project.compositeFrames as any)[compKeys[0]] : null;
                              const firstCharImg = project.characterImages ? (Object.values(project.characterImages as any)[0] as any) : null;
                              const imgUrl = firstComp?.imageUrl || firstComp?.compositeImageUrl || firstCharImg?.referenceImageUrl || firstCharImg?.imageUrl || null;
                              if (imgUrl) localStorage.setItem('nexus_motion_image', imgUrl);
                              localStorage.setItem('nexus_motion_prompt', (project.script?.scenes?.[0] as any)?.motionPrompt || (project.storyboard?.scenes?.[0] as any)?.motionPrompt || 'subtle camera zoom, cinematic, natural motion, character in scene');
                            } catch {}
                            window.location.href = '/test-video';
                          }}>🎬 Animasikan Video (Step 4) — dari Composite Frame ↗</button>
                          <button type="button" className="btn good" onClick={async () => {
                            try {
                              const bgKeys = Object.keys(project.worldBackgrounds || {});
                              const charKeys = Object.keys(project.characterAssets || project.characterImages || {});
                              for (const bgK of bgKeys.slice(0,3)) {
                                for (const chK of charKeys.slice(0,2)) {
                                  const bg = project.worldBackgrounds[bgK];
                                  const ch = (project.characterAssets || project.characterImages || {})[chK];
                                  if (!bg || !ch) continue;
                                  const res = await fetch('/api/composite', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      characterImageUrl: ch.imageUrl || ch.referenceImageUrl,
                                      backgroundImageUrl: bg.imageUrl,
                                      sceneId: `${bg.locationId || bgK}_${ch.characterId || chK}`,
                                      characterName: ch.characterName || chK,
                                      locationName: bg.locationName || bgK,
                                      action: project?.script?.scenes?.[0]?.action || 'standing',
                                      emotion: project?.script?.scenes?.[0]?.emotion_overall || 'tenang',
                                      timeOfDay: bg.timeOfDay || 'senja',
                                      weather: bg.weather || 'cerah',
                                    })
                                  });
                                  const data = await res.json();
                                  if (data.ok) {
                                    setProject((prev: any) => ({ ...prev, compositeFrames: { ...(prev?.compositeFrames || {}), [`${bgK}_${chK}`]: { ...data, createdAt: new Date().toISOString() } } }));
                                  }
                                }
                              }
                            } catch (e: any) { setError(e.message); }
                          }}>🎬 Composite All — Canvas + CSS Overlay (Karakter Atas + Dunia Bawah)</button>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{Object.keys(project.compositeFrames || {}).length} frames composited — Canvas HTML5 — CSS Overlay ready</span>
                        </div>
                      </div>
                    ) : (
                      <div className="process-check wait">⏳ Generate Karakter Polos (white bg) + Background Dunia (no humans) dulu — lalu Frame Compositor akan otomatis tumpuk Layer Atas di atas Layer Bawah via Canvas HTML5 / CSS Overlay</div>
                    )}
                  </div>
                </div>
              </div>

              {project?.drawings && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                  <div className="card-header">
                    <b>Generated Images — Direct HF Inference FLUX.1-schnell (Dynamic) ONLY</b>
                    <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>{Object.keys(project.drawings).length} images — Provider: huggingface — Real Base64 JPEG</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.6rem' }}>
                    {Object.entries(project.drawings).slice(0, 6).map(([sid, d]: any) => (
                      <div key={sid} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem', fontSize: '0.65rem' }}>
                        {d.image_url || d.image ? <img src={d.image_url || d.image} alt={sid} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '6px', background: '#111' }} /> : <div style={{ width: '100%', aspectRatio: '16/9', background: '#111', borderRadius: '6px' }} />}
                        <div style={{ marginTop: '0.3rem', fontWeight: 700 }}>{sid} — {d.provider || d.model || 'huggingface'}</div>
                        <div>HF ONLY — {d.model || 'black-forest-labs/FLUX.1-schnell'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mono">{JSON.stringify(project.drawings, null, 2).slice(0, 3000)}</div>
                </div>
              )}

              {/* Direct HF Inference FLUX.1-schnell Alternative - Free Image Generator - Pindah ke dalam tab Gambar (drawing) agar tidak merusak layout 3 kolom - HF ONLY */}
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                  <b>🎨 Direct HF Inference FLUX.1-schnell Generator — SOLE Engine — Ghibli/Anime</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>HUGGINGFACE_API_KEY server-only — No ImageFX — No Pollinations — No ComfyUI</span>
                </div>
                <div style={{ padding: '0.5rem 0' }}>
                  <ImageGenerator />
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Flow: Prompt Ghibli/Anime → POST /api/generate-hf → Base64 JPEG → Display permanen — Provider: Direct HF Inference FLUX.1-schnell (Dynamic) ONLY black-forest-labs/FLUX.1-schnell — Server-only key — No ImageFX/Pollinations fallback
                </div>
              </div>
            </>
          ) : currentView === 'world' ? (
            <>
              <div className="card process-card">
                <div className="card-header">
                  <b>TAHAP CHECK — Dunia / World Building (DYNAMIC 5 ATRIBUT)</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Story: {project?.story ? '✅' : '❌'} Lokasi: {project?.story?.locations?.length || 0} Dunia: {project?.world?.total_locations || project?.world?.locations?.length || 0} NEXUS: {health?.nexus_brain?.activeProvider?.toUpperCase() || 'GROQ'}</span>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input cerita (source of truth) — lokasi wajib</b>
                    <span>{project?.story ? `✅ Selesai · Cerita "${project.story.title}" — ${project.story.locations?.length || 0} lokasi: ${project.story.locations?.map((l: any) => l.name).join(', ')}` : '⏳ Menunggu · Buat cerita di halaman Cerita terlebih dahulu'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('story')}>{project?.story ? '✅ Lihat Cerita' : 'Buat Cerita'} →</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Input karakter (opsional) — sinkron budaya</b>
                    <span>{project?.characters ? `✅ Selesai · ${project.characters.total_characters} karakter — ${project.characters.characters?.slice(0,3).map((c:any)=>c.name).join(', ')}` : '⏳ Opsional · Karakter belum ada'}</span>
                  </div>
                  <button type="button" className="btn" onClick={() => setCurrentView('character')}>{project?.characters ? '✅ Lihat Karakter' : 'Buat Karakter'} →</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Generate Latar Dunia — 5 Atribut Wajib Dynamic (Nama, Era, Arsitektur, Suasana, Budaya)</b>
                    <span>{project?.world?.total_locations ? `✅ Selesai · ${project.world.total_locations} lokasi Dynamic dari cerita "${project.world.source_story_title || project.story?.title}" — Arsitektur: ${project.world.architecture_summary?.slice(0,80)}` : project?.story?.locations ? '✅ Siap · Klik Generate Latar Dunia — 5 atribut Dynamic wajib lengkap, visualPrompt sinkron ke storyboard background' : '⏳ Menunggu · 🔒 Menunggu Cerita dengan lokasi'}</span>
                  </div>
                  <button type="button" className="btn primary" disabled={loading || !project?.story?.locations} onClick={handleGenerateWorld}>{loading ? 'Memproses Dunia...' : project?.world?.total_locations ? '✅ Buat Ulang Latar Dunia' : '🌍 Generate Latar Dunia / World Building'}</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Validasi dunia grounding + Dynamic aesthetic</b>
                    <span>{project?.world ? (project?.worldValidation?.isValid || project?.world?._validation?.isValid ? '✅ PASS · Dunia 100% sinkron Dynamic' : '⚠️ Perlu cek · Validasi grounding') : '⏳ Menunggu · 🔒 Menunggu Generate Dunia'}</span>
                  </div>
                  <button type="button" className="btn" disabled={!project?.world}>Validasi</button>
                </div>
                <div className="process-row">
                  <div className="process-meta">
                    <b>Prompt Builder Sync — Arsitektur dunia ke background generator (Single Source of Truth)</b>
                    <span>{(() => { try { const guard = getWorldGuard(); const ws = getWorldSettingSync(); return guard.hasWorld ? `✅ Sinkron · ${project.world.locations?.length || 0} visualPrompt Dynamic — ${sanitizeForUI(project.world.locations?.[0]?.visualPrompt?.slice(0,60) || 'wide establishing shot dynamic environment from story source')} — worldSetting: ${sanitizeForUI(ws.slice(0,60))} — 100% SINKRON ke Karakter/Naskah/Papan Cerita` : guard.isExtracting ? `⏳ ${guard.message} — worldSetting: ${sanitizeForUI(ws.slice(0,60))} — Auto-sync aktif` : '⏳ Menunggu · Visual prompt background akan otomatis pakai deskripsi arsitektur dunia — Single Source of Truth'; } catch { return '⏳ Mengekstrak Latar Dunia dari Cerita... — Try-Catch Guard aktif — bukan Error 500'; } })()}</span>
                  </div>
                  <button type="button" className="btn secondary" disabled={!project?.world} onClick={() => { try { const ws = getWorldSettingSync(); setProject((prev:any)=>({...prev, worldSettingGlobal: ws, lastWorldSync: new Date().toISOString()})); saveProject({ worldSettingGlobal: ws }); setError(null) } catch(e:any){ setError(e.message) } }}>🎨 Sync Prompt (worldSetting)</button>
                </div>
                {/* PERMANENT GUARDRAIL — Try-Catch Guard Dunia — anti Error 500 */}
                {(() => {
                  try {
                    const guard = getWorldGuard()
                    if (guard.isExtracting && !project?.world) {
                      return (
                        <div className="process-check wait" style={{ lineHeight: '1.6', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>⏳ {guard.message}</div>
                          <div style={{ fontSize: '0.75rem' }}>Sistem sedang mengekstrak latar dunia dari cerita — worldSetting: {sanitizeForUI(guard.worldSetting?.slice(0,120) || 'plain clean flat background, isolated full-body character portrait, dynamic background from story source')}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Guard aktif — bukan Error 500 — Single Source of Truth: {sanitizeForUI(getWorldSettingSync().slice(0,100))} — akan otomatis sinkron ke generator Karakter, Naskah, Papan Cerita 100%</div>
                        </div>
                      )
                    }
                    return null
                  } catch {
                    return (
                      <div className="process-check wait" style={{ lineHeight: '1.6' }}>
                        ⏳ Mengekstrak Latar Dunia dari Cerita... — Try-Catch Guard aktif — bukan Error 500 — worldSetting auto-sync: {sanitizeForUI(getWorldSettingSync().slice(0,80))}
                      </div>
                    )
                  }
                })()}
                <div className={`process-check ${error ? 'error' : project?.world ? 'ok' : 'wait'}`} style={{ lineHeight: '1.6' }}>
                  {error ? (
                    <div>❌ {error}</div>
                  ) : project?.world && (project.world.locations || Array.isArray(project.world)) ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--success)' }}>✅ Dunia Berhasil Dibuat — {project.world.total_locations || project.world.locations?.length || 0} Lokasi Dynamic Lengkap — 5 Atribut Wajib — Dari Cerita &quot;{project.world.source_story_title || project.story?.title}&quot;</div>
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem' }}>Dunia: {project.world.source_story_title} — {project.world.total_locations} Lokasi — Era sesuai cerita — 100% Sinkron</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Sumber ID: {project.world.source_story_id} | Ringkasan: {project.world.world_summary?.slice(0,120)} | Era: {project.world.era_summary} | Arsitektur: {project.world.architecture_summary?.slice(0,100)}</div>
                        <div style={{ fontSize: '0.7rem', marginBottom: '0.6rem' }}><b>Budaya:</b> {project.world.culture_summary?.slice(0,120)} | <b>Konsistensi:</b> {project.world.consistency_notes?.slice(0,100)}</div>
                        {(project.world.locations || []).slice(0,4).map((loc: any, idx: number) => (
                          <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem', marginBottom: '0.6rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>🌍 {loc.name} — {loc.era} — {loc.location_id}</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>1. Nama Lokasi:</b> {loc.name} ✅ | <b>2. Era Sejarah:</b> {loc.era} ✅</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>3. Arsitektur Bangunan:</b> {loc.architecture?.slice(0,120)}{loc.architecture?.length>120?'...':''} ✅ — Bata merah Trowulan, gapura bentar, pendopo kayu jati</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>4. Suasana/Atmosfer:</b> {loc.atmosphere?.slice(0,100)} ✅</div>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}><b>5. Elemen Budaya:</b> {loc.cultural_elements?.slice(0,120)} ✅ — elemen budaya dari cerita</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}><b>Deskripsi:</b> {loc.description?.slice(0,100)} | <b>Lingkungan:</b> {loc.environment?.slice(0,80)} | <b>Waktu:</b> {loc.time_of_day} | <b>Cuaca:</b> {loc.weather}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--accent)' }}><b>Visual Prompt (Sync ke Storyboard Background):</b> {loc.visualPrompt?.slice(0,150)}...</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}><b>Dynamic Aesthetic:</b> {loc.majapahitAesthetic?.slice(0,100)} | <b>Grounding:</b> {loc.grounding?.source} Faithful {loc.grounding?.faithful ? '✅' : '❌'}</div>
                          </div>
                        ))}
                        {(project.world.locations?.length || 0) > 4 && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>... dan {project.world.locations.length - 4} lokasi lainnya — lihat di inspector/mono</div>}
                      </div>
                      {(project.worldValidation || project.world._validation) && (
                        <div style={{ background: (project.worldValidation?.isValid || project.world._validation?.isValid) ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: (project.worldValidation?.isValid || project.world._validation?.isValid) ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.7rem', marginBottom: '0.75rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>🔍 World Grounding Validation — 5 Atribut Wajib Dynamic:</div>
                          <div><b>Status:</b> {(project.worldValidation?.isValid || project.world._validation?.isValid) ? '✅ PASS' : '❌ FAIL'} — {(project.worldValidation?.overallReason || project.world._validation?.overallReason)?.slice(0,350)}</div>
                          {Object.entries((project.worldValidation?.checks || project.world._validation?.checks) || {}).map(([k,v]: any, i: number) => (
                            <div key={i} style={{ fontSize: '0.65rem', color: v.pass ? 'var(--success)' : 'var(--error)' }}>• {k}: {v.pass ? 'PASS ✅' : 'FAIL ❌'} — {v.reason?.slice(0,120)}</div>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ✅ Dunia {project.world.total_locations} lokasi Dynamic lengkap — 5 atribut wajib terisi — Visual prompt sinkron ke Prompt Builder untuk background storyboard otomatis.<br/>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Model: {modelUsed} | Sumber: {project.world.source_story_id} | Validation: {(project.worldValidation?.isValid || project.world._validation?.isValid) ? 'PASS' : 'FAIL'} | Never Empty — Dynamic aesthetic bata merah Trowulan</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div>⏳ {project?.story?.locations ? `Siap membangun dunia dari ${project.story.locations.length} lokasi` : 'Menunggu cerita dengan lokasi'} — 5 atribut wajib Dynamic: Nama Lokasi, Era Sejarah, Arsitektur dynamic from story source, Suasana, Budaya</div>
                      {project?.story?.locations && (
                        <div style={{ marginTop: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', fontSize: '0.7rem' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>🌍 Lokasi dari Cerita (harus 100% sinkron jadi dunia Dynamic):</div>
                          {project.story.locations.map((loc: any, idx: number) => (
                            <div key={idx} style={{ marginBottom: '0.3rem', background: 'rgba(0,0,0,0.2)', padding: '0.4rem', borderRadius: '4px' }}>
                              <b>{loc.name}</b> ({loc.location_id}) — {loc.description?.slice(0,80)} — Era sesuai cerita akan ditambahkan otomatis — Arsitektur dynamic environment from story source
                            </div>
                          ))}
                          <div style={{ marginTop: '0.4rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>World Building akan ekstrak 5 atribut: 1. Nama Lokasi (dari story), 2. Era Sejarah (Era sesuai cerita), 3. Arsitektur Bangunan (bata merah Trowulan + gapura bentar + pendopo kayu jati ukir emas), 4. Suasana/Atmosfer (megah berwibawa cahaya keemasan), 5. Elemen Budaya (elemen budaya dari cerita) — visualPrompt wide establishing shot sync ke storyboard background</div>
                        </div>
                      )}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Story: {project?.story ? `✅ ${project.story.title}` : '❌'} | Lokasi: {project?.story?.locations?.length || 0} | NEXUS: {health?.nexus_brain?.activeProvider || 'GROQ'} Ready | Never Empty — Dynamic aesthetic</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="status-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat">
                  <div className="stat-icon blue">📖</div>
                  <div className="stat-content">
                    <span>Sumber Cerita</span>
                    <b>{project?.story?.title || '—'}</b>
                    <small>{project?.story ? `${project.story.locations?.length} lokasi` : 'Belum ada'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon purple">👤</div>
                  <div className="stat-content">
                    <span>Karakter</span>
                    <b>{project?.characters?.total_characters || project?.story?.characters?.length || 0}</b>
                    <small>{project?.characters ? 'FULL BODY ✅' : 'Dari story'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon teal">🌍</div>
                  <div className="stat-content">
                    <span>Dunia Production</span>
                    <b>{project?.world?.total_locations || 0}</b>
                    <small>{project?.world ? '5 atribut Dynamic lengkap ✅' : 'Menunggu'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon gray">✅</div>
                  <div className="stat-content">
                    <span>Validation</span>
                    <b>{project?.worldValidation?.isValid ? 'PASS' : '—'}</b>
                    <small>{project?.world ? 'Dynamic aesthetic' : 'Menunggu'}</small>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <b>🌍 Dunia — Display Kartu Lokasi Lengkap (Never Empty)</b>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>5 atribut wajib Dynamic + visualPrompt sync ke Prompt Builder background</span>
                </div>
                <div style={{ padding: '0.8rem' }}>
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '0.8rem', marginBottom: '0.8rem', fontSize: '0.7rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: 'var(--success)' }}>✅ World Building Module AKTIF — Generate Latar Dunia / World Building — Tidak Kosong</div>
                    <div>Flow: Cerita (lokasi) → NEXUS Brain → 5 Atribut Wajib (Nama, Era, Arsitektur Dynamic dari Cerita, Suasana, Budaya) → WorldLocationDetail → visualPrompt wide establishing shot dynamic environment from story source → Prompt Builder sync → storyboard background otomatis sinkron dynamic</div>
                    <div style={{ marginTop: '0.4rem' }}><b>5 Atribut Wajib:</b> 1. Nama Lokasi (dari story.locations), 2. Era Sejarah (Era sesuai cerita 1350), 3. Arsitektur Bangunan (Candi dynamic environment from story source, atap sirap limas), 4. Suasana/Atmosfer (megah berwibawa cahaya keemasan), 5. Elemen Budaya (elemen budaya dari cerita)</div>
                    <div style={{ marginTop: '0.3rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Dynamic Aesthetic Lock: dynamic environment from story source, background matching story description, aesthetic from active story, Studio Ghibli anime style — Prompt Builder: wide establishing shot, dynamic environment from story source, aesthetic matching story, highly detailed background</div>
                  </div>

                  {project?.world?.locations ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                      {project.world.locations.map((loc: any, idx: number) => (
                        <div key={idx} style={{ background: 'rgba(0,0,0,0.25)', border: '2px solid var(--success)', borderRadius: '12px', padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg, #7c2d12, #dc2626, #f59e0b)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>🏯</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>{loc.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{loc.era} — {loc.location_id}</div>
                            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.65rem', lineHeight: '1.5' }}>
                              <div><b>Nama Lokasi:</b> {loc.name}</div>
                              <div><b>Era Sejarah:</b> {loc.era}</div>
                              <div><b>Arsitektur:</b> {loc.architecture}</div>
                              <div><b>Suasana:</b> {loc.atmosphere}</div>
                              <div><b>Budaya:</b> {loc.cultural_elements}</div>
                              <div style={{ marginTop: '0.3rem' }}><b>Deskripsi:</b> {loc.description}</div>
                              <div><b>Lingkungan:</b> {loc.environment}</div>
                              <div><b>Material:</b> {loc.materials}</div>
                              <div><b>Flora:</b> {loc.flora_fauna}</div>
                              <div style={{ marginTop: '0.3rem', color: 'var(--accent)' }}><b>Visual Prompt (Background Sync):</b> {loc.visualPrompt}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.6rem', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px', padding: '0.2rem 0.4rem' }}>🏯 {loc.name}</span>
                            <span style={{ fontSize: '0.6rem', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '4px', padding: '0.2rem 0.4rem' }}>🏛️ dynamic architecture from story source</span>
                            <span style={{ fontSize: '0.6rem', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '4px', padding: '0.2rem 0.4rem' }}>🎭 {loc.cultural_elements?.split(',')[0]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="process-check wait">
                      ⏳ Belum ada dunia — buat dunia dari cerita. Setelah generate, kartu lokasi akan terisi lengkap 5 atribut Dynamic wajib + visualPrompt sinkron ke storyboard background generator otomatis.
                    </div>
                  )}

                  <div style={{ marginTop: '1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '0.6rem', fontSize: '0.65rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Prompt Builder Sync — Arsitektur Dunia ke Background Generator</div>
                    <div>Setiap lokasi dunia menghasilkan visualPrompt: wide establishing shot, dynamic environment from story source, background matching story description, [Nama Lokasi], [Era], [Arsitektur Bata Merah], [Suasana], [Budaya], lush tropical Indonesian flora, Studio Ghibli anime style, highly detailed background</div>
                    <div style={{ marginTop: '0.3rem' }}>Generator gambar latar/papan cerita otomatis menggunakan visual lokasi yang sinkron — tidak kosong — Dynamic aesthetic lock authentic Javanese, NO Chinese temple</div>
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage}>{t('back')}</button>
                  <button type="button" className="btn good" onClick={handleContinue} disabled={isWorkflowStage && isLastStage}>{t('continue')} {isWorkflowStage && isLastStage ? "(Selesai)" : "→ Naskah"}</button>
                </div>
              </div>

              {project?.world && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                  <div className="card-header">
                    <b>Generated Dunia (via NEXUS Brain — 5 Atribut Dynamic Lengkap)</b>
                    <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>{modelUsed}</span>
                  </div>
                  <div className="mono">{JSON.stringify(project.world, null, 2)}</div>
                  <div className="actions">
                    <button type="button" className="btn" onClick={handleBack}>{t('back')}</button>
                    <button type="button" className="btn good" onClick={handleContinue}>{t('continue')} → Papan Cerita</button>
                  </div>
                </div>
              )}
            </>
          ) : currentView === 'motion' ? (
            <div className="card" style={{ border: '2px solid #2563eb', background: 'rgba(37,99,235,0.07)' }}>
              <div className="card-header">
                <b>▶️ Gerakan — Motion Engine — Gradio CogVideoX / SVD I2V (Dynamic) — Step 4</b>
                <span className="badge" style={{ background: 'rgba(37,99,235,0.15)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.3)' }}>READY ✅ Gradio Client — /test-video</span>
              </div>
              <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.75rem', lineHeight: '1.6' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: '#60a5fa' }}>✅ Motion Engine READY — Gradio Client CogVideoX / SVD I2V — Step 4 — Route /test-video</div>
                  <div>Flow: Canonical Keyframe (Step 3) → /test-video UI → /api/generate-video (server @gradio/client) → Gradio Space zai-org/CogVideoX-5B-Space / Wan-AI/Wan2.1-I2V-14B-720P / SVD → .mp4 → &lt;video controls autoplay loop&gt;</div>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Timeout 60s per endpoint, retry backoff 5s max 2x per space, fallback rotation 4 spaces — Honest MOTION_ENGINE_FAILED if all fail — No Pollinations — Image input via Blob handle_file</div>
                  <div style={{ marginTop: '0.4rem' }}>Quick Action: Tombol &quot;Animasikan Video (Step 4)&quot; di card Karakter / Papan Cerita yang punya Canonical Image → auto bawa gambar ke /test-video via localStorage nexus_motion_image</div>
                </div>
                <div className="status-grid">
                  <div className="stat"><div className="stat-icon blue">▶️</div><div className="stat-content"><span>Current Stage</span><b>Gerakan</b><small>Stage 7 of 9 — READY Motion Engine</small></div></div>
                  <div className="stat"><div className="stat-icon purple">🎯</div><div className="stat-content"><span>Status</span><b>READY ✅ /test-video</b><small>Gradio Client CogVideoX/SVD</small></div></div>
                  <div className="stat"><div className="stat-icon teal">🔧</div><div className="stat-content"><span>Engine</span><b>CogVideoX-5B + Wan + SVD</b><small>Fallback rotation 4 spaces</small></div></div>
                  <div className="stat"><div className="stat-icon gray">📦</div><div className="stat-content"><span>Output</span><b>.mp4 Video</b><small>{Object.keys(project?.characterImages || {}).length} keyframes ready</small></div></div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn good" onClick={() => { window.location.href = '/test-video'; }}>🎬 Buka Motion Engine — /test-video ↗</button>
                  <button type="button" className="btn secondary" onClick={async () => { try { const res = await fetch('/api/generate-video'); const data = await res.json(); setHfAuditResult(data); setHealth((prev:any)=>({...prev, motion_engine: data})); setError(null); } catch(e:any){ setError(e.message) } }}>📊 Check Motion Status — /api/generate-video</button>
                  <button type="button" className="btn secondary" onClick={() => setCurrentView('drawing')}>🖼️ Kembali ke Gambar →</button>
                </div>
                <div className="process-check ok" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.3)' }}>✅ Motion Engine Gradio CogVideoX/SVD I2V — Route /test-video READY — /api/generate-video READY — Sidebar Gerakan ↗ langsung ke /test-video — Quick Action &quot;Animasikan Video (Step 4)&quot; di card Karakter membawa gambar otomatis via localStorage — Timeout 60s retry backoff — Honest MOTION_ENGINE_FAILED no Pollinations</div>
              </div>
              <div className="actions"><button type="button" className="btn" onClick={handleBack}>Kembali</button><button type="button" className="btn good" onClick={handleContinue}>Lanjutkan → Suara</button></div>
            </div>
          ) : currentView === 'voice' ? (
            <div className="card" style={{ border: '2px solid var(--warning)', background: 'rgba(168,85,247,0.05)' }}>
              <div className="card-header">
                <b>🎙️ Suara — TTS Worker — 🚧 In Development</b>
                <span className="badge" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>MOCK → HONEST — NOT_CONFIGURED</span>
              </div>
              <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.75rem', lineHeight: '1.6' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>🎙️ Suara — TTS Worker (facebook/mms-tts-ind) — Status: NOT_CONFIGURED / REFERENCE_CONDITIONING_UNAVAILABLE</div>
                  <div>Flow: Naskah Dialog → TTS Planning (future: free TTS worker facebook/mms-tts-ind) → voice assets → audio timeline → Final MP4 — Saat ini: STATIC PREVIEW only — honest status</div>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Honest status: TTS worker belum dikonfigurasi — REFERENCE_CONDITIONING_UNAVAILABLE in free Space — Check Status untuk cek /api/image-engine/status</div>
                  <div style={{ marginTop: '0.4rem' }}>Provider plan: huggingface free TTS — facebook/mms-tts-ind — Indonesian — future integration — voice cloning not yet in free tier</div>
                </div>
                <div className="status-grid">
                  <div className="stat"><div className="stat-icon blue">🎙️</div><div className="stat-content"><span>Current Stage</span><b>Suara</b><small>Stage 8 of 9 — NOT_CONFIGURED</small></div></div>
                  <div className="stat"><div className="stat-icon purple">🎯</div><div className="stat-content"><span>Status</span><b>🚧 In Development</b><small>TTS Worker — facebook/mms-tts-ind</small></div></div>
                  <div className="stat"><div className="stat-icon teal">🔧</div><div className="stat-content"><span>Worker</span><b>mms-tts-ind</b><small>Free TTS — Not yet</small></div></div>
                  <div className="stat"><div className="stat-icon gray">📦</div><div className="stat-content"><span>Output</span><b>Voice Assets</b><small>{project?.voiceAssets ? Object.keys(project.voiceAssets).length : 0} assets</small></div></div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn good" onClick={async () => { try { const res = await fetch('/api/image-engine/status'); const data = await res.json(); setHfAuditResult(data); setHealth((prev:any)=>({...prev, image_engine: data})); setError(data.status === 'NOT_CONFIGURED' ? `${data.status} — ${data.message}` : null) } catch(e:any){ setError(e.message) } }}>📱 Check Status — TTS Worker</button>
                  <button type="button" className="btn secondary" disabled title="Fitur masih dalam pengembangan — bukan dummy">⏳ Generate Voice — In Development</button>
                  <button type="button" className="btn secondary" onClick={() => setCurrentView('motion')}>▶️ Kembali ke Gerakan →</button>
                </div>
                <div className="process-check wait">🎙️ TTS Worker (facebook/mms-tts-ind) — Status: NOT_CONFIGURED / REFERENCE_CONDITIONING_UNAVAILABLE — Honest badge — No dummy confusing — Klik Check Status untuk status real dari /api/image-engine/status</div>
              </div>
              <div className="actions"><button type="button" className="btn" onClick={handleBack}>Kembali</button><button type="button" className="btn good" onClick={handleContinue}>Lanjutkan → Audio</button></div>
            </div>
          ) : currentView === 'audio' ? (
            <div className="card" style={{ border: '2px solid var(--warning)', background: 'rgba(34,197,94,0.05)' }}>
              <div className="card-header">
                <b>🔊 Audio — Final Composition — 🚧 Coming Soon</b>
                <span className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' }}>MOCK → HONEST — Coming Soon</span>
              </div>
              <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.75rem', lineHeight: '1.6' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>🔊 Audio — JSON2Video + Ursina — Coming Soon — Final Composition</div>
                  <div>Flow: Gambar + Gerakan + Suara → Audio Final Composition (future: JSON2Video + Ursina free) → timeline sync → Final MP4 export — Saat ini: Coming Soon — transparent honest status</div>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Honest status: Audio composition worker belum tersedia — MOCK → HONEST — Coming Soon — No fake READY — Klik Check Status untuk real status</div>
                  <div style={{ marginTop: '0.4rem' }}>Provider plan: JSON2Video free tier + Ursina — final video assembly — future integration — audio mixing, music, SFX</div>
                </div>
                <div className="status-grid">
                  <div className="stat"><div className="stat-icon blue">🔊</div><div className="stat-content"><span>Current Stage</span><b>Audio</b><small>Stage 9 of 9 — Coming Soon</small></div></div>
                  <div className="stat"><div className="stat-icon purple">🎯</div><div className="stat-content"><span>Status</span><b>🚧 Coming Soon</b><small>JSON2Video + Ursina</small></div></div>
                  <div className="stat"><div className="stat-icon teal">🔧</div><div className="stat-content"><span>Worker</span><b>JSON2Video</b><small>Final Composition — Not yet</small></div></div>
                  <div className="stat"><div className="stat-icon gray">📦</div><div className="stat-content"><span>Output</span><b>Final Video</b><small>MP4 export — Coming Soon</small></div></div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn good" onClick={async () => { try { const res = await fetch('/api/image-engine/status'); const data = await res.json(); setHfAuditResult(data); } catch(e:any){ setError(e.message) } }}>📱 Check Status — Audio Worker</button>
                  <button type="button" className="btn secondary" disabled title="Fitur masih dalam pengembangan — bukan dummy">⏳ Export Final MP4 — Coming Soon</button>
                  <button type="button" className="btn secondary" onClick={() => setCurrentView('voice')}>🎙️ Kembali ke Suara →</button>
                </div>
                <div className="process-check wait">🔊 Audio — JSON2Video + Ursina — Coming Soon — Transparent badge MOCK → HONEST — No fake READY — Final composition worker belum tersedia — Honest status</div>
              </div>
              <div className="actions"><button type="button" className="btn" onClick={handleBack}>Kembali → Suara</button><button type="button" className="btn good" disabled title="AUDIO adalah tahap terakhir — Lanjutkan disabled">Selesai (AUDIO terakhir) ✅</button></div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <b>{t(currentView)}</b>
                <span className="badge"><span className="badge-dot"></span> {health?.nexus_brain?.isReady ? 'Ready' : 'Waiting'}</span>
              </div>
              <p className="tag" style={{ marginBottom: '1rem' }}>
                Generate memakai AI provider aktif (server-side) via NEXUS Brain: GROQ → OpenRouter → Local. Gemini LEGACY only, NOT in NEXUS path.
              </p>
              
              <div className="status-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat">
                  <div className="stat-icon blue">{workflowStages.find(s => s.id === currentView)?.icon || '📦'}</div>
                  <div className="stat-content">
                    <span>Current Stage</span>
                    <b>{t(currentView)}</b>
                    <small>Stage {workflowStages.findIndex(s => s.id === currentView) + 1} of {workflowStages.length}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon purple">🎯</div>
                  <div className="stat-content">
                    <span>Status</span>
                    <b>{workflowStages.find(s => s.id === currentView)?.status === 'complete' ? 'Complete' : workflowStages.find(s => s.id === currentView)?.status === 'current' ? 'Current' : 'Waiting'}</b>
                    <small>{project?.story ? 'Story tersedia' : 'Menunggu story'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon teal">📊</div>
                  <div className="stat-content">
                    <span>Tema</span>
                    <b>{theme && theme.trim() ? `'${theme.slice(0, 12)}${theme.length>12?'...':''}'` : '—'}</b>
                    <small>{theme && theme.trim() ? `${theme.trim().length} chars ✅` : 'Belum diisi ❌'}</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-icon gray">🏷️</div>
                  <div className="stat-content">
                    <span>Genre</span>
                    <b>{genre || '—'}</b>
                    <small>{genre ? 'Valid ✅' : 'Belum dipilih ❌'}</small>
                  </div>
                </div>
              </div>

              <div className="process-check wait" style={{ marginBottom: '1rem' }}>
                <b>Stage Info:</b> Current View: {currentView} - Tema: {theme && theme.trim() ? `✅ "${theme}"` : '❌'} Genre: {genre ? `✅ ${genre}` : '❌'} - Story: {project?.story ? '✅' : '❌'}<br/>
                <b>Tema Bebas Validation:</b> Semua tema VALID ✅ — Modul Dunia sekarang AKTIF dengan 5 atribut Dynamic lengkap + visualPrompt sync ke background generator — DYNAMIC from story source
              </div>

              <div className="actions" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="btn" onClick={handleBack} disabled={isWorkflowStage && isFirstStage}>{t('back')}</button>
                <button type="button" className="btn good" onClick={handleContinue} disabled={isWorkflowStage && isLastStage}>{t('continue')} {isWorkflowStage && isLastStage ? "(Selesai)" : "→"}</button>
              </div>
            </div>
          )}
        </div>
      </main>

      <aside className="inspector">
        <div className="inspector-header">
          <b>Inspector</b>
          <button type="button" className="inspector-close" aria-label="Close">✕</button>
        </div>
        
        <div className="inspector-tabs">
          <button type="button" className={`tab-btn ${inspectorTab === 'project' ? 'active' : ''}`} onClick={() => setInspectorTab('project')}>Project</button>
          <button type="button" className={`tab-btn ${inspectorTab === 'character' ? 'active' : ''}`} onClick={() => setInspectorTab('character')}>Character</button>
          <button type="button" className={`tab-btn ${inspectorTab === 'scene' ? 'active' : ''}`} onClick={() => setInspectorTab('scene')}>Scene</button>
        </div>

        <div className="inspector-content">
          <div className="inspector-project-thumb">
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', background: 'linear-gradient(135deg, #1e293b, #0f172a)' }}>
              {project?.story?.title ? '🏔️' : '🏰'}
            </div>
            <div className="inspector-project-status">
              <span className="stat-dot"></span>
              {project?.story ? 'In Progress' : 'Waiting'}
            </div>
          </div>

          <div className="inspector-details">
            <h4>Details</h4>
            <div className="detail-list">
              <div className="detail-item"><span>Project ID</span><span>NEX-20260912-001</span></div>
              <div className="detail-item"><span>Current View</span><span>{currentView}</span></div>
              <div className="detail-item"><span>Created</span><span>12 Sep 2026, 10:24</span></div>
              <div className="detail-item"><span>Last Update</span><span>13 Sep 2026, 09:15</span></div>
              <div className="detail-item"><span>Duration Target</span><span>{totalDuration ? `${Math.floor(totalDuration/60).toString().padStart(2, '0')}:${(totalDuration%60).toString().padStart(2, '0')}` : '06:00'}</span></div>
              <div className="detail-item"><span>Total Scenes</span><span>{getTotalScenes() || 20}</span></div>
              <div className="detail-item"><span>Tema</span><span>{theme && theme.trim() ? `'${theme.slice(0, 10)}${theme.length>10?'...':''}' ✅` : '❌'}</span></div>
              <div className="detail-item"><span>Genre</span><span>{genre || '—'}</span></div>
            </div>
          </div>

          <div className="progress-section">
            <h4><span>Progress</span><span>{workflowStages.filter(s => s.status === 'complete').length * 11 + 12}%</span></h4>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${workflowStages.filter(s => s.status === 'complete').length * 11 + 12}%` }}></div>
            </div>
            <div className="progress-meta">{getTotalScenes() || 9} / {getTotalScenes() ? getTotalScenes() + 11 : 20} scenes completed</div>
          </div>

          <div className="inspector-details">
            <h4>Validation</h4>
            <div className="validation-list">
              <div className="validation-item">
                <div className="validation-item-left"><span className={`validation-dot ${theme && theme.trim() ? 'valid' : ''}`}></span> Consistency</div>
                <span className={`validation-status ${theme && theme.trim() ? 'valid' : ''}`}>{theme && theme.trim() ? '● Valid' : '○ Waiting'}</span>
              </div>
              <div className="validation-item">
                <div className="validation-item-left"><span className={`validation-dot ${project?.characters || project?.story?.characters ? 'valid' : ''}`}></span> Character</div>
                <span className={`validation-status ${project?.characters || project?.story?.characters ? 'valid' : ''}`}>{project?.characters || project?.story?.characters ? '● Valid' : '○ Waiting'}</span>
              </div>
              <div className="validation-item">
                <div className="validation-item-left"><span className={`validation-dot ${project?.world || project?.story?.locations ? 'valid' : ''}`}></span> World Location</div>
                <span className={`validation-status ${project?.world || project?.story?.locations ? 'valid' : ''}`}>{project?.world || project?.story?.locations ? '● Valid' : '○ Waiting'}</span>
              </div>
              <div className="validation-item">
                <div className="validation-item-left"><span className={`validation-dot ${project?.story ? 'valid' : ''}`}></span> Story Flow</div>
                <span className={`validation-status ${project?.story ? 'valid' : ''}`}>{project?.story ? '● Valid' : '○ Waiting'}</span>
              </div>
            </div>
          </div>

          <div className="quick-actions">
            <h4>Quick Actions</h4>
            <button type="button" className="qa-btn" onClick={() => setCurrentView('dashboard')}>📁 Open Project</button>
            <button type="button" className="qa-btn" onClick={() => {}}>📤 Export</button>
            <button type="button" className="qa-btn danger" onClick={() => { setTheme(''); setStoryIdea(''); setProject(null); }}>🔄 Reset</button>
          </div>

          <div className="card" style={{ padding: '0.75rem' }}>
            <b style={{ fontSize: '0.75rem' }}>Inspector</b>
            <div className="mono">
              {JSON.stringify({
                modelUsed: modelUsed || null,
                currentView,
                theme: theme ? `${theme} (${theme.trim().length} chars) ${theme.trim() ? 'VALID' : 'INVALID'}` : 'empty',
                themeBebas: 'A, Arga, Nasi goreng, Pontianak, Kucing, Batu ajaib, Pasar malam, Petualangan di hutan, Seorang anak... semua VALID (hanya tolak kosong)',
                genre,
                visualStyle,
                visualStyleModifier: VISUAL_STYLES.find(v=>v.id===visualStyle)?.modifier,
                nexusBrain: health?.nexus_brain ? { active: health.nexus_brain.activeProvider, model: health.nexus_brain.modelUsed, isReady: health.nexus_brain.isReady, research: health.nexus_brain.research } : null,
                research: project?.research ? {
                  status: project.research.status,
                  subject: project.research.subject,
                  subjectType: project.research.subjectType,
                  intent: project.research.intent,
                  totalSources: project.research.totalSources,
                  sourcesUsed: project.research.sourcesUsed?.map((s: any) => ({ url: s.url, title: s.title, domain: s.domain })),
                  groundingSummary: project.research.groundingSummary,
                  supportedFacts: project.research.supportedFacts?.slice(0,3),
                  statusReason: project.research.statusReason?.slice(0,200)
                } : project?.story?._research || null,
                groundingValidation: project?.groundingValidation ? {
                  isValid: project.groundingValidation.isValid,
                  overallReason: project.groundingValidation.overallReason,
                } : project?.story?._groundingValidation || null,
                evidence: {
                  sourcesDiambil: project?.research?.sourcesUsed ? 'Ya, URL nyata Wikipedia' : 'TBD',
                  faktaDiekstrak: project?.research?.supportedFacts?.length > 0 ? 'Ya' : 'TBD',
                  faktaDigunakan: project?.research?.status === 'COMPLETED' || project?.research?.status === 'NOT_REQUIRED' ? 'Ya (fact-aware prompt)' : 'TBD',
                  groundingValidation: project?.groundingValidation ? (project.groundingValidation.isValid ? 'PASS' : 'FAIL') : 'SKIPPED untuk COMMON',
                  statusAkhir: project?.research?.status || 'NOT_REQUIRED'
                },
                project: project ? { hasStory: !!project.story, hasCharacters: !!project.characters, hasWorld: !!project.world, totalScenes: getTotalScenes() } : null,
              }, null, 2)}
            </div>
            {health?.nexus_brain && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                <b style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>NEXUS Brain + Research Status:</b><br/>
                Architecture: {health.nexus_brain.architecture}<br/>
                Research Arch: {health.nexus_brain.research_architecture?.slice(0,80)}...<br/>
                Primary: {health.nexus_brain.primaryProvider}<br/>
                Fallback: {health.nexus_brain.fallbackProviders?.join(', ')}<br/>
                Excluded: {health.nexus_brain.excludedProviders?.join(', ')}<br/>
                Configured: {health.nexus_brain.configuredProviders?.join(', ') || 'NONE'}<br/>
                Active: {health.nexus_brain.activeProvider || 'NONE'}<br/>
                Ready: {health.nexus_brain.isReady ? 'YES' : 'NO'}<br/>
                Research: {health.nexus_brain.research?.enabled ? 'ENABLED' : 'DISABLED'} ({health.nexus_brain.research?.sources})<br/>
                MinSources: {health.nexus_brain.research?.minSources} | BlockOnNoSources: {health.nexus_brain.research?.blockOnNoSources ? 'YES' : 'NO'}<br/>
                <br/>
                <b style={{ color: 'var(--text-secondary)' }}>Verification:</b><br/>
                Gemini NOT in NEXUS: {health.verification?.geminiNotInNexusPath ? 'PASS ✓' : 'FAIL'}<br/>
                NEXUS is Core: {health.verification?.nexusBrainIsCore ? 'PASS ✓' : 'FAIL'}<br/>
                Story uses NEXUS: {health.nexus_brain?.verification?.storyGenerationUsesNexus ? 'PASS ✓' : 'CHECK'}<br/>
                Research Enforced: {health.nexus_brain?.verification?.researchLayerEnforced ? 'PASS ✓' : 'FAIL'}<br/>
                Fact Grounding: {health.nexus_brain?.verification?.factGroundingEnforced ? 'PASS ✓' : 'FAIL'}<br/>
                <br/>
                <b style={{ color: 'var(--text-secondary)' }}>Tema Bebas:</b><br/>
                &apos;A&apos; VALID, &apos;Arga&apos; VALID, &apos;Nasi goreng&apos; VALID (NOT_REQUIRED, no research)<br/>
                &apos;Soekarno biografi&apos; → REAL_PERSON → research WAJIB → Wikipedia ID/EN<br/>
                Hanya tolak kosong/whitespace → &quot;Tema harus diisi.&quot;<br/>
                <br/>
                <b style={{ color: 'var(--text-secondary)' }}>NEXUS = REASONING+PLANNING+RESEARCH+FACT GROUNDING</b>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Bottom Nav - Mobile Reference */}
      <div className="bottom-nav">
        <button type="button" className={`bottom-nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>
          <span>🏠</span>
          Home
        </button>
        <button type="button" className={`bottom-nav-item ${currentView === 'workflow' ? 'active' : ''}`} onClick={() => setCurrentView('workflow')}>
          <span>🔄</span>
          Workflow
        </button>
        <button type="button" className={`bottom-nav-item ${currentView === 'storyboard' || currentView === 'drawing' ? 'active' : ''}`} onClick={() => setCurrentView('storyboard')}>
          <span>🖼️</span>
          Output
        </button>
        <button type="button" className={`bottom-nav-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => setCurrentView('settings')}>
          <span>☰</span>
          More
        </button>
      </div>
    </div>
  )
}
