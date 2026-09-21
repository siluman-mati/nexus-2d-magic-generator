// lib/config.ts - Server-side only env config - POLLINATIONS REMOVED per integrity audit
export function getEnv(name: string): string | undefined { return process.env[name] }
export function hasEnv(name: string): boolean { const v = process.env[name]; return !!v && v.trim().length > 0 }
export function isVercel(): boolean { return process.env.VERCEL === '1' }
export function isVercelProduction(): boolean { return process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production' }
export function isDevelopment(): boolean { return process.env.NODE_ENV === 'development' }
export function getNexusBrainConfig() {
  const timeoutMs = parseInt(process.env.NEXUS_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || '30000', 10)
  const retryAttempts = parseInt(process.env.NEXUS_RETRY_ATTEMPTS || '2', 10)
  const maxRetry = Math.min(Math.max(retryAttempts, 0), 3)
  const failoverEnabled = process.env.NEXUS_FAILOVER_ENABLED !== 'false'
  return { timeoutMs, retryAttempts: maxRetry, maxAttempts: maxRetry + 1, failoverEnabled, isVercel: isVercel(), isVercelProduction: isVercelProduction(), isDevelopment: isDevelopment(), freeFallbackEnabled: true, openRouterFreeModels: ['meta-llama/llama-3.2-1b-instruct:free','meta-llama/llama-3.2-3b-instruct:free','google/gemma-2-9b-it:free','google/gemma-2-2b-it:free','qwen/qwen-2-7b-instruct:free','mistralai/mistral-7b-instruct:free'] }
}
export function getGroqConfig() {
  const apiKey = process.env.GROQ_API_KEY
  let model = process.env.GROQ_MODEL || process.env.NEXUS_GROQ_MODEL || 'openai/gpt-oss-20b'
  if (model === 'llama-3.3-70b-versatile' || model === 'llama-3.1-8b-instant') model = 'openai/gpt-oss-20b'
  const enabled = process.env.GROQ_ENABLED !== 'false'
  return { apiKey, model, enabled: enabled && !!apiKey, configured: !!apiKey }
}
export function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_APIKEY
  const model = process.env.OPENROUTER_MODEL || process.env.OPEN_ROUTER_MODEL || process.env.NEXUS_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
  const enabled = process.env.OPENROUTER_ENABLED !== 'false' && process.env.OPEN_ROUTER_ENABLED !== 'false'
  return { apiKey, model, enabled: enabled && !!apiKey, configured: !!apiKey }
}
export function getLocalConfig() {
  const url = process.env.LOCAL_AI_URL || process.env.OLLAMA_URL || process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434'
  const model = process.env.LOCAL_AI_MODEL || process.env.OLLAMA_MODEL || process.env.NEXUS_LOCAL_MODEL || 'llama3.1'
  const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')
  const explicitlyEnabled = process.env.LOCAL_AI_ENABLED === 'true' || process.env.OLLAMA_ENABLED === 'true'
  let enabled = false; let disabledReason: string | undefined
  if (isVercelProduction()) { if (isLocalhost) { enabled = false; disabledReason = 'Localhost not available in Vercel production'; } else { enabled = explicitlyEnabled; if (!explicitlyEnabled) disabledReason = 'Custom URL requires LOCAL_AI_ENABLED=true'; } }
  else if (isVercel()) { if (isLocalhost) { enabled = false; disabledReason = 'Localhost not available in Vercel'; } else { enabled = explicitlyEnabled; } }
  else { enabled = explicitlyEnabled || !isLocalhost }
  const configured = explicitlyEnabled || !!process.env.LOCAL_AI_URL || !!process.env.OLLAMA_URL
  return { url, model, enabled, configured, isLocalhost, disabledReason, allowedInProduction: false }
}
export function getGeminiConfig() {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL || process.env.GOOGLE_AI_MODEL || process.env.NEXUS_GEMINI_MODEL || 'gemini-1.5-flash'
  const explicitlyDisabled = process.env.GEMINI_ENABLED === 'false' || process.env.GOOGLE_AI_ENABLED === 'false'
  return { apiKey, model, enabled: !!apiKey && !explicitlyDisabled, configured: !!apiKey }
}
export function getGoogleAIConfig() { return getGeminiConfig() }
export function getFreeLLMConfig() {
  const hfApiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN || process.env.HUGGING_FACE_API_KEY || process.env.HUNGGING_FACE_API_KEY || process.env.hunggingface
  const hfModel = process.env.HF_TEXT_MODEL || process.env.HUGGINGFACE_TEXT_MODEL || 'meta-llama/Llama-3.2-1B-Instruct'
  const hfEnabled = !!hfApiKey
  const configured = !!hfApiKey
  const enabled = !!hfApiKey
  return { hfApiKey, hfModel, hfEnabled, enabled, configured, status: hfApiKey ? 'READY' as const : 'UNCONFIGURED' as const, models: { primary: hfModel, fallbacks: [hfModel,'meta-llama/Llama-3.2-1B-Instruct','google/gemma-2-2b-it','Qwen/Qwen2.5-0.5B-Instruct'] } }
}
export function getHuggingFaceTextConfig() {
  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN || process.env.HUGGING_FACE_API_KEY || process.env.HUNGGING_FACE_API_KEY || process.env.hunggingface
  const model = process.env.HF_TEXT_MODEL || 'meta-llama/Llama-3.2-1B-Instruct'
  return { apiKey, model, enabled: !!apiKey, configured: !!apiKey, status: apiKey ? 'READY' as const : 'UNCONFIGURED' as const }
}
export function getImageFxConfig() { return { cookie: undefined, model: 'REMOVED', timeoutMs: 60000, retries: 0, enabled: false, configured: false, baseUrls: { session: 'REMOVED', generation: 'REMOVED' }, status: 'REMOVED' as const, baseUrl: 'REMOVED', message: 'ImageFX removed — Use /api/generate-hf — HF ONLY', sole_engine: '/api/generate-hf' } }
export function getFreeTheAiConfig() { return { apiKey: undefined, baseUrl: 'REMOVED', enabled: false, configured: false, status: 'REMOVED' as const, message: 'FreeTheAi removed — HF ONLY' } }
export function getHuggingFaceConfig() {
  const model = 'black-forest-labs/FLUX.1-schnell'; const baseUrl = `https://api-inference.huggingface.co/models/${model}`;
  return { apiKey: 'hf-direct', model, baseUrl, enabled: true, configured: true, status: 'READY' as const, engineLabel: 'Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic)', spaceId: model, width: 1024, height: 1024, steps: 8, guidance_scale: 3.5, endpoint: baseUrl, negative: 'background, scenery, environment, wall, room, buildings, architecture, landscape, shadows', positive: 'a professional raw dslr photo, cinematic lighting, sharp focus, detailed facial features, 35mm photograph, isolated full-body character portrait' };
}
export function getDirectHfFluxConfig() {
  return { spaceId: 'black-forest-labs/FLUX.1-schnell', width: 1024, height: 1024, steps: 8, guidance_scale: 3.5, model: 'black-forest-labs/FLUX.1-schnell', endpoint: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', fallbackEndpoint: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell', engineLabel: 'Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic)', negative: 'background, scenery, environment, wall, room, buildings, architecture, landscape, shadows', positive: 'a professional raw dslr photo, cinematic lighting, sharp focus, detailed facial features, 35mm photograph, isolated full-body character portrait', configured: true, enabled: true, status: 'READY' as const };
}
export function getGradioFluxConfig() { return getDirectHfFluxConfig(); }
export function getDirectHFInferenceFluxConfig() { return getDirectHfFluxConfig(); }
export function getAllProviderStatus() {
  const groq = getGroqConfig(); const openrouter = getOpenRouterConfig(); const local = getLocalConfig(); const gemini = getGeminiConfig(); const google = getGoogleAIConfig(); const tts = getFreeTTSConfig(); const i2v = getFreeI2VConfig(); const huggingface = getHuggingFaceConfig(); const freeLLM = getFreeLLMConfig(); const hfText = getHuggingFaceTextConfig();
  return {
    groq: { id: 'groq' as const, name: 'Groq', role: 'PRIMARY' as const, enabled: groq.enabled, configured: groq.configured, model: groq.model, status: groq.configured ? (groq.enabled ? 'READY' : 'DISABLED') : 'UNCONFIGURED' },
    openrouter: { id: 'openrouter' as const, name: 'OpenRouter', role: 'FALLBACK_CLOUD' as const, enabled: openrouter.enabled, configured: openrouter.configured, model: openrouter.model, status: openrouter.configured ? (openrouter.enabled ? 'READY' : 'DISABLED') : 'UNCONFIGURED' },
    google: { id: 'google' as const, name: 'Google AI', role: 'FALLBACK_CLOUD' as const, enabled: google.enabled, configured: google.configured, model: google.model, status: google.configured ? (google.enabled ? 'READY' : 'DISABLED') : 'UNCONFIGURED' },
    local: { id: 'local' as const, name: 'Local AI / Ollama', role: 'FALLBACK_LOCAL' as const, enabled: local.enabled, configured: local.configured, model: local.model, status: local.configured ? (local.enabled ? 'READY' : 'DISABLED') : 'UNCONFIGURED', url: local.url, isLocalhost: local.isLocalhost },
    gemini: { id: 'gemini' as const, name: 'Gemini (Legacy)', role: 'LEGACY' as const, enabled: gemini.enabled, configured: gemini.configured, model: gemini.model, status: gemini.configured ? 'READY' : 'UNCONFIGURED' },
    freeLLM: { id: 'free-llm' as const, name: 'Free LLM (HF Text Only)', role: 'FALLBACK_FREE' as const, enabled: freeLLM.enabled, configured: freeLLM.configured, model: freeLLM.hfModel, status: freeLLM.status, hfEnabled: freeLLM.hfEnabled },
    hfText: { id: 'hf-text' as const, name: 'HuggingFace Text Inference', role: 'FALLBACK_FREE' as const, enabled: hfText.enabled, configured: hfText.configured, model: hfText.model, status: hfText.status },
    tts: { id: 'tts' as const, name: 'HuggingFace TTS Worker', role: 'AUDIO' as const, enabled: tts.enabled, configured: tts.configured, model: tts.modelId, baseUrl: tts.baseUrl, spaceId: tts.spaceId, status: tts.configured ? (tts.enabled ? 'READY' : 'DISABLED') : 'NOT_CONFIGURED' },
    i2v: { id: 'i2v' as const, name: 'HuggingFace I2V Worker', role: 'ANIMATION' as const, enabled: i2v.enabled, configured: i2v.configured, model: i2v.modelId, baseUrl: i2v.baseUrl, spaceId: i2v.spaceId, status: i2v.configured ? (i2v.enabled ? 'READY' : 'DISABLED') : 'NOT_CONFIGURED' },
    huggingface: { id: 'huggingface' as const, name: 'Direct HF Inference FLUX.1-schnell (Dynamic)', role: 'IMAGE' as const, enabled: true, configured: true, model: 'black-forest-labs/FLUX.1-schnell', baseUrl: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell', endpoint: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell', status: 'READY' as const },
  }
}
export function getFreeI2VConfig() {
  const spaceId = process.env.HUGGINGFACE_I2V_SPACE_ID || process.env.HF_I2V_SPACE_ID
  const spaceUrl = process.env.HUGGINGFACE_I2V_SPACE_URL || process.env.HF_I2V_SPACE_URL || process.env.I2V_SPACE_URL
  const apiToken = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN
  const modelId = process.env.HF_I2V_MODEL_ID || process.env.HUGGINGFACE_I2V_MODEL_ID || 'stabilityai/stable-video-diffusion-img2vid-xt'
  const enabled = process.env.I2V_ENABLED !== 'false'
  let resolvedBaseUrl: string | undefined
  if (spaceUrl) resolvedBaseUrl = spaceUrl.replace(/\/$/, '')
  else if (spaceId) { const normalized = spaceId.includes('/') ? spaceId.replace('/', '-') : spaceId; resolvedBaseUrl = `https://${normalized}.hf.space` }
  const configured = !!spaceId || !!spaceUrl
  return { spaceId, spaceUrl: resolvedBaseUrl, baseUrl: resolvedBaseUrl, apiToken, modelId, enabled: enabled && configured, configured }
}
export function getFreeTTSConfig() {
  const spaceId = process.env.HUGGINGFACE_TTS_SPACE_ID || process.env.HF_TTS_SPACE_ID
  const spaceUrl = process.env.HUGGINGFACE_TTS_SPACE_URL || process.env.HF_TTS_SPACE_URL || process.env.TTS_SPACE_URL
  const apiToken = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_API_TOKEN
  const modelId = process.env.HF_TTS_MODEL_ID || process.env.HUGGINGFACE_TTS_MODEL_ID || 'facebook/mms-tts-ind'
  const enabled = process.env.TTS_ENABLED !== 'false'
  let resolvedBaseUrl: string | undefined
  if (spaceUrl) resolvedBaseUrl = spaceUrl.replace(/\/$/, '')
  else if (spaceId) { const normalized = spaceId.includes('/') ? spaceId.replace('/', '-') : spaceId; resolvedBaseUrl = `https://${normalized}.hf.space` }
  const configured = !!spaceId || !!spaceUrl
  return { spaceId, spaceUrl: resolvedBaseUrl, baseUrl: resolvedBaseUrl, apiToken, modelId, enabled: enabled && configured, configured }
}
export function getJson2VideoConfig() { return { apiKey: undefined, baseUrl: 'REMOVED', timeoutMs: 120000, pollingIntervalMs: 3000, maxPollingAttempts: 40, enabled: false, configured: false, status: 'REMOVED' as const, message: 'JSON2Video removed' } }
export function getUrsinaConfig() { return { baseUrl: 'REMOVED', enabled: false, configured: false, isLocalhost: false, timeoutMs: 120000, pollingIntervalMs: 2000, maxPollingAttempts: 60, status: 'REMOVED' as const, message: 'Ursina Engine removed' } }
export function getResearchConfig() {
  const enabled = process.env.RESEARCH_ENABLED !== 'false'
  const wikipediaEnabled = process.env.WIKIPEDIA_ENABLED !== 'false'
  const minSources = parseInt(process.env.RESEARCH_MIN_SOURCES || '2') || 2
  const requireMultiple = process.env.RESEARCH_REQUIRE_MULTIPLE !== 'false'
  const blockOnNoSources = process.env.RESEARCH_BLOCK_ON_NO_SOURCES !== 'false'
  return { enabled, wikipediaEnabled, minSources, requireMultipleSourcesForImportantFacts: requireMultiple, blockOnNoSourcesForRealSubject: blockOnNoSources, configured: true }
}
