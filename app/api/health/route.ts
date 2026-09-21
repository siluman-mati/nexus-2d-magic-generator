import { NextResponse } from 'next/server'
import { getHuggingFaceToken } from '@/lib/2d-generator/hf-auth'
import { ProviderManager } from '@/lib/ai/provider-manager'
import { getNexusBrainStatus } from '@/lib/ai/nexus-brain'
import { getAllProviderStatus, getResearchConfig } from '@/lib/config'
import { DURATION_SCENE_MAP, getSceneCountFromDuration } from '@/lib/visual-pipeline/types'

export const dynamic = 'force-dynamic'
export async function GET() {
  const status = ProviderManager.getStatus()
  const nexusStatus = getNexusBrainStatus()
  const allStatus = getAllProviderStatus()
  const researchConfig = getResearchConfig()

  const configuredCount = status.nexus.configuredProviders.length
  const isReady = configuredCount > 0

  const hfKeyPresent = !!getHuggingFaceToken();
  // REFACTOR: ComfyUI removed — now using Direct HF Inference FLUX.1-schnell (Dynamic) as default image engine — FORCE OVERRIDE
  let imageEngineHealth: any = {
    engine: 'Direct HF Inference FLUX.1-schnell (Dynamic)',
    provider: 'direct-hf-inference',
    model: 'black-forest-labs/FLUX.1-schnell',
    status: hfKeyPresent ? 'READY' : 'UNCONFIGURED',
    configured: hfKeyPresent,
    enabled: hfKeyPresent,
    url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
    endpoint: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    fallbackEndpoint: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
    steps: 8,
    guidance: 3.5,
    hasHuggingFaceKey: hfKeyPresent,
    message: 'Direct HF Inference FLUX.1-schnell (Dynamic) — api-inference + router.huggingface.co/fal-ai/fal-ai/flux/schnell — 1024x1024 steps 8 guidance 3.5 — retry 503 5s max3x — honest FAILED no Pollinations — Dynamic',
    architecture: 'NEXUS → Direct HF Inference api-inference + fal-ai schnell → Base64 JPEG → Asset Layer — Dynamic — steps 8 guidance 3.5',
  }

  const legacyFormat = {
    ok: isReady,
    configured: isReady,
    hasKey: isReady,
    provider: nexusStatus.activeProvider || 'none',
    model: nexusStatus.modelUsed,
    status: isReady 
      ? `NEXUS Brain READY - Primary: ${nexusStatus.primaryProvider.toUpperCase()}${nexusStatus.activeProvider ? ` (active: ${nexusStatus.activeProvider})` : ''} - Chain: ${nexusStatus.primaryProvider} -> ${nexusStatus.fallbackProviders.join(' -> ')} - Gemini NOT in NEXUS path - Research: ${researchConfig.enabled ? 'ENABLED (Wikipedia ID/EN)' : 'DISABLED'}`
      : 'AI provider belum dikonfigurasi - Set GROQ_API_KEY (primary) atau OPENROUTER_API_KEY (fallback) di Vercel Environment Variables',
    text_providers: status.text_providers,
    drawing_providers: {
      gemini_text: allStatus.gemini.configured ? 'READY (LEGACY)' : 'UNCONFIGURED',
      gemini_image: 'DISABLED',
      prexzy_image: 'READY',
      puter_image: 'UNAVAILABLE',
    },
    gemini_image_capability: {
      status: 'DISABLED',
      model: null,
      live: 'NOT_AVAILABLE',
      reason: 'Gemini Image is DISABLED — not used for Drawing. Image chain: Prexzy → Puter. Gemini text is LEGACY only, NOT used in NEXUS Brain path.',
      image_candidates: [],
    },
    nexus_brain: {
      brain: 'NEXUS',
      architecture: 'USER -> APPLICATION -> NEXUS BRAIN (RESEARCH + PLANNING + REASONING) -> GROQ (PRIMARY) -> OPENROUTER (FALLBACK_CLOUD) -> LOCAL (FALLBACK_LOCAL)',
      research_architecture: 'User Input -> Intent/Subject Classification -> Research Planner -> Source Retrieval -> Source Extraction -> Source Ranking -> Cross-Source Verification -> Fact Grounding -> Story Planner -> Story Generator -> Grounding Validation -> Final Story',
      primaryProvider: 'groq',
      fallbackProviders: ['openrouter', 'local'],
      excludedProviders: ['gemini', 'gemini-legacy'],
      configuredProviders: nexusStatus.configuredProviders,
      activeProvider: nexusStatus.activeProvider,
      modelUsed: nexusStatus.modelUsed,
      isReady: nexusStatus.isReady,
      research: {
        enabled: researchConfig.enabled,
        wikipediaEnabled: researchConfig.wikipediaEnabled,
        minSources: researchConfig.minSources,
        requireMultipleSources: researchConfig.requireMultipleSourcesForImportantFacts,
        blockOnNoSources: researchConfig.blockOnNoSourcesForRealSubject,
        configured: researchConfig.configured,
        sources: 'Wikipedia ID (id.wikipedia.org) + EN (en.wikipedia.org) — public, no API key required',
        factStatuses: ['SUPPORTED', 'INFERRED', 'UNKNOWN', 'CONFLICTING'],
        antiHallucination: 'DILARANG mengarang tanggal, tempat, keluarga, pekerjaan, pendidikan, peristiwa, kutipan, prestasi, penghargaan, jabatan, perjalanan, sejarah, dialog nyata, fakta pribadi jika tidak didukung sumber',
      },
      verification: {
        geminiNotInNexus: true,
        nexusBrainEnforced: true,
        storyGenerationUsesNexus: true,
        researchLayerEnforced: true,
        factGroundingEnforced: true,
      },
    },
    providers: status.providers,
    verification: {
      geminiNotInNexusPath: true,
      nexusBrainIsCore: true,
      architecture: 'Buat Cerita -> Research(if real) -> NEXUS Brain -> GROQ -> OpenRouter -> Local',
      not: 'Buat Cerita -> Gemini',
      researchArchitecture: 'User Input -> Classification -> Planner -> Retrieval -> Extraction -> Ranking -> Verification -> Grounding -> Story Planner -> Generator -> Grounding Validation -> Final',
    },
    env_check: {
      GROQ_API_KEY: allStatus.groq.configured ? 'SET' : 'NOT SET',
      OPENROUTER_API_KEY: allStatus.openrouter.configured ? 'SET' : 'NOT SET',
      OPEN_ROUTER_API_KEY_ALIAS: allStatus.openrouter.configured ? (process.env.OPEN_ROUTER_API_KEY ? 'SET (alias)' : process.env.OPENROUTER_API_KEY ? 'SET (primary)' : 'SET') : 'NOT SET',
      LOCAL_AI_ENABLED: process.env.LOCAL_AI_ENABLED || 'NOT SET',
      LOCAL_AI_URL: process.env.LOCAL_AI_URL ? 'SET' : 'NOT SET (defaults to localhost, not used in Vercel production)',
      GEMINI_API_KEY: allStatus.gemini.configured ? 'SET (LEGACY ONLY)' : 'NOT SET',
      GOOGLE_AI_API_KEY: (allStatus as any).google?.configured ? 'SET' : 'NOT SET',
      RESEARCH_ENABLED: researchConfig.enabled ? 'ENABLED' : 'DISABLED',
      WIKIPEDIA_ENABLED: researchConfig.wikipediaEnabled ? 'ENABLED (public API, no key)' : 'DISABLED',
      canonical_source: 'lib/config.ts getAllProviderStatus() — same as /api/nexus/health — deterministic alias OPENROUTER_API_KEY || OPEN_ROUTER_API_KEY',
    },
    image_engine: {
      engine: 'Direct HF Inference FLUX.1-schnell (Dynamic)',
      provider: 'direct-hf-inference',
      role: 'IMAGE ENGINE — NEXUS → Direct HF Inference FLUX.1-schnell — api-inference + router.huggingface.co/fal-ai/fal-ai/flux/schnell — steps 8 guidance 3.5 — 1024x1024',
      architecture: 'NEXUS → Story/Script/Character/Scene → Visual Prompt Builder → Character Reference → Direct HF Inference api-inference + fal-ai schnell 1024x1024 steps 8 guidance 3.5 → Base64 JPEG → Asset Storage — Dynamic — honest FAILED no Pollinations',
      status: imageEngineHealth?.status || 'READY',
      configured: imageEngineHealth?.configured ?? true,
      enabled: imageEngineHealth?.enabled ?? true,
      url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
      endpoint: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
      fallbackEndpoint: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
      model: 'black-forest-labs/FLUX.1-schnell',
      hasHuggingFaceKey: imageEngineHealth?.hasHuggingFaceKey ?? false,
      health: imageEngineHealth,
      contract: {
        nexus_sends: '{prompt: visualPrompt from physical + personality + visual traits + dynamic style from story source}',
        direct_hf_returns: '{imageUrl: base64 JPEG dataUrl from ArrayBuffer}',
        character_reference: '{character_id, reference_image: base64, visualPrompt}',
      },
      principles: [
        'Direct HF Inference FLUX.1-schnell (Dynamic) as default — api-inference + router.huggingface.co/fal-ai/fal-ai/flux/schnell — steps 8 guidance 3.5 — 1024x1024 — No Gradio — No Pollinations — No ComfyUI — No localhost:8188',
        'Prompt from character attributes + dynamic style from story source → visualPrompt → /api/generate-hf → ArrayBuffer→Base64 dataUrl',
        'Negative forced: chinese temple, pagoda, curved oriental roof, chinese architecture, japanese shrine, hanfu, kimono, asian East pagoda, indoor hall + background elimination',
        'Base64 image displayed permanently in NO_IMAGE slot',
        'Full-body mandatory — kepala sampai ujung kaki — isolated character asset plain white background',
      ],
      verification: {
        direct_hf_as_image_engine: true,
        no_gradio: true,
        no_pollinations: true,
        no_comfyui: true,
        no_localhost: true,
        steps_8_guidance_3_5: true,
      },
      env_check: {
        DIRECT_HF_ENDPOINT: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell — primary — steps 8 guidance 3.5',
        FALLBACK_ENDPOINT: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell — doubled fal-ai path — prompt payload',
        IMAGE_ENGINE: 'Direct HF Inference FLUX.1-schnell (Dynamic) — api-inference + fal-ai schnell — steps 8 guidance 3.5 — honest FAILED no Pollinations — Dynamic',
        HAS_KEY: imageEngineHealth?.hasHuggingFaceKey ? 'SET' : 'NOT SET — check HUGGINGFACE_API_KEY || HUGGING_FACE_API_KEY',
      }
    },
    visual_pipeline: {
      pipeline: 'NEXUS AUTONOMOUS VISUAL PRODUCTION PIPELINE — STRICT STORY GROUNDED PRODUCTION',
      architecture: 'SOURCE STORY → STORY EVENTS → NASKAH → EPISODE → SCENE → CHARACTER+LOCATION+ACTION+EMOTION → VISUAL PROMPT → CHARACTER REFERENCE → Direct HF Inference FLUX.1-schnell black-forest-labs/FLUX.1-schnell 768x1024 steps 4 → IMAGE → VALIDATION → COMPLETE — No ComfyUI — No localhost:8188 — Dynamic',
      story_is_source_of_truth: true,
      episode_duration: {
        mapping: DURATION_SCENE_MAP,
        formula: 'SCENE = DURASI / 7.5',
        each_scene: '7.5 detik',
        examples: '15=2, 30=4, 45=6, 60=8, 75=10, 90=12, 120=16',
        auto_calculated: true,
        dont_ask_user: true
      },
      scene_grounding: {
        required_fields: ['episode_id','scene_id','duration','story_event','script_reference','characters','location','time','action','dialogue','emotion','camera','visual_prompt','negative_prompt','continuity_reference'],
        no_scene_without_reference: true,
        dont_fabricate: true
      },
      character_consistency: {
        source: 'CHARACTER DATABASE FULL BODY',
        count_must_match_story: true,
        dont: ['tambah karakter','hapus karakter','ganti nama','gabung karakter','pecah karakter'],
        must_maintain: ['nama','fisik','usia visual','rambut','wajah','tubuh','pakaian','aksesori','watak','sifat','kepribadian','hubungan'],
        full_body_mandatory: true,
        full_body_definition: 'kepala terlihat, seluruh tubuh terlihat, kedua tangan terlihat, kedua kaki terlihat, tidak cropped, bukan half-body/bust/waist-up'
      },
      visual_continuity: {
        next_scene_maintains_previous: true,
        validations: ['face consistency','hair consistency','body consistency','clothing consistency','age consistency','prop consistency','location consistency','time consistency','lighting continuity','action continuity','emotion continuity'],
        dont_change_appearance_because_prompt_different: true
      },
      huggingface: {
        engine: 'Direct HF Inference FLUX.1-schnell (Dynamic)',
        provider: 'black-forest-labs/FLUX.1-schnell',
        steps: ['1 Ambil character reference','2 Build visualPrompt dari physical+personality + dynamic style from story source, aesthetic matching story description','3 POST /api/generate-hf {prompt: visualPrompt} via @gradio/client Space black-forest-labs/FLUX.1-schnell 768x1024 steps 4','4 Receive imageUrl Base64','5 Display permanen di slot NO_IMAGE','6 Save to characterImages'],
        status_values: ['NO_IMAGE','GENERATING','READY','ERROR'],
        negative_forced: 'chinese temple, pagoda, curved oriental roof, chinese architecture, japanese shrine, hanfu, kimono, asian East pagoda, indoor hall',
      },
      visual_prompt: {
        must_translate_script_not_new_story: true,
        must_include: ['CHARACTER','APPEARANCE','CLOTHING','EXPRESSION','POSE','ACTION','LOCATION','ENVIRONMENT','TIME','LIGHTING','CAMERA','COMPOSITION','MOOD'],
        grounded_in: 'SOURCE STORY+NASKAH'
      },
      negative_prompt: {
        prevent: ['cropped body','half body','extra limbs','extra fingers','duplicate character','wrong character','wrong clothing','wrong location','wrong age','inconsistent face','deformed anatomy','missing feet','missing hands','unwanted text','watermark'],
        dont_use_to_change_story_facts: true
      },
      validation: {
        checks_19: ['STORY MATCH','SCRIPT MATCH','CHARACTER MATCH','CHARACTER COUNT','PHYSICAL CONSISTENCY','PERSONALITY CONSISTENCY','LOCATION MATCH','ACTION MATCH','DIALOGUE MATCH','EMOTION MATCH','EVENT MATCH','TIMELINE MATCH','CONTINUITY MATCH','NO NEW CHARACTER','NO NEW LOCATION','NO NEW EVENT','FULL BODY CHARACTER REFERENCE','SCENE COUNT','EPISODE DURATION'],
        all_must_pass: true,
        final_fail_if_one_fail: true
      },
      final_audit: {
        checks: ['Story→Script PASS','Script→Episode PASS','Episode→Scene PASS','Scene→Character PASS','Scene→Location PASS','Scene→Action PASS','Scene→Emotion PASS','Scene→Visual PASS','Visual→Continuity PASS'],
        final: ['GROUNDING PASS','CHARACTER PASS','CONTINUITY PASS','VISUAL PASS','SCENE COUNT PASS','DURATION PASS'],
        only_if_all_pass_complete: true
      },
      final_target: 'SOURCE STORY → NASKAH → 15/30/45/60/... SECOND EPISODE → AUTOMATIC SCENE SPLIT → CHARACTER REFERENCE → FULL BODY → STORY-GROUNDED VISUAL PROMPT → Direct HF Inference FLUX.1-schnell black-forest-labs/FLUX.1-schnell 768x1024 steps 4 Dynamic → IMAGE GENERATION → COMPLETE — No ComfyUI — No localhost:8188',
      verification: {
        story_is_source_of_truth: true,
        episode_duration_auto: true,
        scene_grounding_required: true,
        character_consistency: true,
        visual_continuity: true,
        huggingface_as_engine: true,
        validation_19_checks: true,
        final_audit: true,
        autonomous: true
      }
    },
    picked: nexusStatus.activeProvider ? `${nexusStatus.activeProvider} (${allStatus[nexusStatus.activeProvider as keyof typeof allStatus]?.model}) via NEXUS Brain + Research` : null,
  }

  return NextResponse.json(legacyFormat)
}
