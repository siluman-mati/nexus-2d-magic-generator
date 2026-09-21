import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getNexusBrainStatus, generateViaNexusBrain, verifyGeminiNotInNexusPath } from '../ai/nexus-brain'
import { ProviderManager } from '../ai/provider-manager'
import { validateEnv, isVercelProduction, shouldUseLocalProvider } from '../ai/provider-utils'

// Mock fetch globally
global.fetch = vi.fn()

describe('NEXUS Brain - Mandatory Architecture', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.GROQ_API_KEY
    delete process.env.OPENROUTER_API_KEY
    delete process.env.OPEN_ROUTER_API_KEY
    delete process.env.LOCAL_AI_ENABLED
    delete process.env.LOCAL_AI_URL
    delete process.env.GEMINI_API_KEY
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
  })

  afterEach(() => {
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
  })

  it('should have correct architecture: GROQ -> OpenRouter -> Google -> Local, per perbaikan terbatas', () => {
    const status = getNexusBrainStatus()
    expect(status.brain).toBe('NEXUS')
    expect(status.primaryProvider).toBe('groq')
    // Perbaikan terbatas: urutan GROQ_API_KEY -> OPENROUTER_API_KEY -> GOOGLE_AI_API_KEY
    expect(status.fallbackProviders).toEqual(['openrouter', 'google', 'local'])
    expect(status.excludedProviders).toContain('gemini-legacy')
    // google now allowed as fallback per perbaikan terbatas
  })

  it('should report no provider configured with safe UI message + diagnostic separate', async () => {
    const status = getNexusBrainStatus()
    expect(status.isReady).toBe(false)
    // Safe message should not contain raw env details
    expect(status.reason).toContain('NEXUS Brain tidak memiliki provider aktif')
    expect(status.reason).not.toContain('GROQ_API_KEY: NOT SET')

    const result = await generateViaNexusBrain({
      prompt: 'Test story',
      engine: 'story',
    })

    expect(result.ok).toBe(false)
    // TAHAP 1 HARDENING: Honest message - NOT_CONFIGURED when truly no provider
    // Should contain either old generic or new honest NOT_CONFIGURED message
    expect(result.error).toMatch(/NEXUS Brain.*(tidak memiliki provider AI yang aktif|Tidak ada provider AI yang terkonfigurasi)/)
    expect(result.error).toContain('GROQ_API_KEY')
    // Diagnostic should contain details but no secrets
    expect((result as any).diagnostic).toBeDefined()
    expect((result as any).diagnostic).toContain('GROQ')
    expect((result as any).diagnostic).toContain('OPENROUTER')
    expect(result.nexusBrainUsed).toBe(true)
    expect(result.provider).not.toBe('gemini')
    // Should have triedProviders with UNCONFIGURED status
    expect(result.triedProviders.some((p: any) => p.status === 'UNCONFIGURED')).toBe(true)
  })

  // TEST A: Groq aktif → gunakan Groq
  it('TEST A: Groq aktif → gunakan Groq (PRIMARY)', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"Test Story","logline":"Test"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      })
    })

    const result = await generateViaNexusBrain({
      prompt: 'Generate story',
      engine: 'story',
    })

    expect(result.ok).toBe(true)
    expect(result.provider).toBe('groq')
    expect(result.role).toBe('PRIMARY')
    expect(result.nexusBrainUsed).toBe(true)
    expect(result.fallbackChain).toEqual(['groq'])

    const verification = verifyGeminiNotInNexusPath(result)
    expect(verification.valid).toBe(true)
    expect(verification.reason).toContain('did NOT use Gemini')
  })

  // TEST B: Groq mati + OpenRouter aktif → otomatis OpenRouter
  it('TEST B: Groq mati + OpenRouter aktif → otomatis OpenRouter (FALLBACK)', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key'
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'

    // Mock Groq failure (401)
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    })
    // Mock OpenRouter success
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"Fallback Story"}' } }],
        usage: {}
      })
    })

    const result = await generateViaNexusBrain({
      prompt: 'Generate story',
      engine: 'story',
    })

    expect(result.ok).toBe(true)
    expect(result.provider).toBe('openrouter')
    expect(result.role).toBe('FALLBACK_CLOUD')
    expect(result.fallbackChain).toEqual(['groq', 'openrouter'])
    expect(result.triedProviders.length).toBe(2)
    expect(result.nexusBrainUsed).toBe(true)

    const verification = verifyGeminiNotInNexusPath(result)
    expect(verification.valid).toBe(true)
  })

  // TEST C: Groq dan OpenRouter mati → Local hanya development
  it('TEST C: Groq dan OpenRouter mati → Local hanya development (not in Vercel production)', async () => {
    process.env.GROQ_API_KEY = 'test-groq'
    process.env.OPENROUTER_API_KEY = 'test-openrouter'
    process.env.LOCAL_AI_ENABLED = 'true'
    process.env.LOCAL_AI_URL = 'http://localhost:11434'

    // Mock Groq failure
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    })
    // Mock Groq retry failure
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    })
    // Mock OpenRouter failure
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    })
    // Mock Local failure (will be tried but fail)
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Local not available',
    })

    const result = await generateViaNexusBrain({
      prompt: 'Test',
      engine: 'story',
    })

    // In non-Vercel env, local should be tried
    expect(result.fallbackChain).toContain('local')
    expect(result.triedProviders.some(p => p.id === 'local')).toBe(true)
  })

  it('TEST C2: Local should be DISABLED in Vercel production', async () => {
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    process.env.LOCAL_AI_ENABLED = 'true'
    process.env.LOCAL_AI_URL = 'http://localhost:11434'

    const status = getNexusBrainStatus()
    expect(status.vercel.isProduction).toBe(true)
    expect(status.configuredProviders).not.toContain('local')
    
    const envValidation = validateEnv()
    expect(envValidation.local.enabled).toBe(false)
    expect(envValidation.local.status).toBe('DISABLED_IN_PRODUCTION')
    expect(shouldUseLocalProvider()).toBe(false)
  })

  // TEST D: Semua provider mati → error terkontrol - TAHAP 1 HARDENING
  it('TEST D: Semua provider mati → error terkontrol dengan safe UI message', async () => {
    process.env.GROQ_API_KEY = 'test-groq'
    process.env.OPENROUTER_API_KEY = 'test-openrouter'

    // Mock all failures - 500 errors
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'All failed',
    })

    const result = await generateViaNexusBrain({
      prompt: 'Test',
      engine: 'story',
    })

    expect(result.ok).toBe(false)
    // TAHAP 1: Honest classification - should be PROVIDER_ERROR or TEMPORARY_FAILURE, not NOT_CONFIGURED
    // And should NOT say API KEY NOT SET when keys exist
    expect(result.error).toMatch(/NEXUS Brain.*(Provider AI terkonfigurasi|sedang tidak memiliki provider AI yang aktif)/)
    expect(result.error).toContain('Tried:')
    expect(result.error).not.toContain('sk-')
    expect(result.error).not.toContain('gsk_')
    expect((result as any).diagnostic).toBeDefined()
    expect(result.triedProviders.length).toBeGreaterThan(0)
    expect(result.nexusBrainUsed).toBe(true)
    // Config should still be SET - API KEY EXISTS ≠ LAST REQUEST SUCCEEDED
    expect(result.triedProviders.some((p: any) => p.status === 'PROVIDER_ERROR' || p.status === 'TEMPORARY_FAILURE' || p.status === 'ERROR')).toBe(true)
    // Should NOT be UNCONFIGURED when keys exist
    expect(result.triedProviders.some((p: any) => p.id === 'groq' && p.status === 'UNCONFIGURED')).toBe(false)
  })

  // TEST E: Production tidak pernah mencoba localhost
  it('TEST E: Production tidak pernah mencoba localhost', async () => {
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    process.env.GROQ_API_KEY = 'test-groq'
    process.env.LOCAL_AI_ENABLED = 'true'
    process.env.LOCAL_AI_URL = 'http://localhost:11434'

    // Mock Groq failure
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Groq failed',
    })

    const result = await generateViaNexusBrain({
      prompt: 'Test',
      engine: 'story',
    })

    expect(result.ok).toBe(false)
    // Should NOT try local in production
    expect(result.fallbackChain).not.toContain('local')
    expect(result.triedProviders.some(p => p.id === 'local' && p.status === 'SKIPPED')).toBe(false)
    // Should have SKIPPED or DISABLED_IN_PRODUCTION
    const localTried = result.triedProviders.find(p => p.id === 'local')
    if (localTried) {
      expect(['DISABLED_IN_PRODUCTION', 'SKIPPED', 'UNCONFIGURED'].includes(localTried.status)).toBe(true)
    }
  })

  // TEST F: API key tidak pernah bocor ke frontend
  it('TEST F: API key tidak pernah bocor ke frontend', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_secret_key_12345'
    process.env.OPENROUTER_API_KEY = 'sk-or-test_secret_67890'
    process.env.GROQ_MODEL = 'openai/gpt-oss-20b'
    process.env.OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'

    const status = getNexusBrainStatus()
    
    // Status should not contain actual keys
    const statusString = JSON.stringify(status)
    expect(statusString).not.toContain('gsk_test_secret_key_12345')
    expect(statusString).not.toContain('sk-or-test_secret_67890')
    expect(statusString).toContain('CONFIGURED') // Should show SET, not value

    // Provider status should not leak keys
    const { getAllProviderStatus } = await import('../config')
    const allStatus = getAllProviderStatus()
    const allStatusString = JSON.stringify(allStatus)
    expect(allStatusString).not.toContain('gsk_test_secret_key_12345')
    expect(allStatusString).not.toContain('sk-or-test_secret_67890')

    // Env validation should not leak keys
    const envValidation = validateEnv()
    const envString = JSON.stringify(envValidation)
    expect(envString).not.toContain('gsk_test_secret_key_12345')
    expect(envString).not.toContain('sk-or-test_secret_67890')
  })

  it('should NEVER use Gemini in NEXUS path even if Gemini is configured', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.GROQ_API_KEY = 'test-groq-key'

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"Test"}' } }],
        usage: {}
      })
    })

    const result = await generateViaNexusBrain({
      prompt: 'Test',
      engine: 'story',
    })

    expect(result.provider).not.toBe('gemini')
    expect(result.fallbackChain).not.toContain('gemini')
    expect(result.fallbackChain).not.toContain('gemini-legacy' as any)
    expect(result.nexusBrainUsed).toBe(true)

    const verification = verifyGeminiNotInNexusPath(result)
    expect(verification.valid).toBe(true)
  })

  it('should verify Gemini detection works', () => {
    const geminiResult: any = {
      provider: 'gemini',
      fallbackChain: ['gemini'],
      nexusBrainUsed: false,
    }
    const check = verifyGeminiNotInNexusPath(geminiResult)
    expect(check.valid).toBe(false)
    expect(check.reason).toContain('VIOLATION')
  })

  it('ProviderManager should enforce NEXUS path for story generation', async () => {
    process.env.GROQ_API_KEY = 'test-key'
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"Story via ProviderManager"}' } }],
        usage: {}
      })
    })

    const result = await ProviderManager.generateForNexusPath({
      prompt: 'Generate story',
      engine: 'story',
    })

    expect(result.isNexusPath).toBe(true)
    expect(result.providerManagerUsed).toBe(true)
    expect(result.nexusBrainUsed).toBe(true)
    expect(result.provider).toBe('groq')
    expect(result.provider).not.toBe('gemini')
  })

  it('should have model-agnostic and provider-agnostic design', async () => {
    process.env.GROQ_API_KEY = 'test'
    process.env.GROQ_MODEL = 'custom-model-from-env'
    
    ;(global.fetch as any).mockImplementation(async (url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      expect(body.model).toBe('custom-model-from-env')
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
          usage: {}
        })
      }
    })

    const result = await generateViaNexusBrain({
      prompt: 'test',
      engine: 'story',
    })

    expect(result.ok).toBe(true)
    expect(result.model).toBe('custom-model-from-env')
  })

  it('should implement timeout and retry', async () => {
    process.env.GROQ_API_KEY = 'test-key'
    
    // Mock timeout on first attempt, success on retry
    let callCount = 0
    ;(global.fetch as any).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('timeout')
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Retry success' } }],
          usage: {}
        })
      }
    })

    const result = await generateViaNexusBrain({
      prompt: 'Test timeout retry',
      engine: 'story',
    })

    // Should have retried
    expect(callCount).toBeGreaterThan(1)
    expect(result.ok).toBe(true)
  })

  it('should have safe logging without secrets', async () => {
    process.env.GROQ_API_KEY = 'gsk_secret_should_not_log'
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'test' } }],
        usage: {}
      })
    })

    await generateViaNexusBrain({
      prompt: 'test',
      engine: 'story',
    })

    // Check that logs don't contain secret
    const logs = consoleSpy.mock.calls.map(call => JSON.stringify(call)).join(' ')
    expect(logs).not.toContain('gsk_secret_should_not_log')
    
    consoleSpy.mockRestore()
  })
})

describe('Story Engine - Buat Cerita via NEXUS Brain', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.GROQ_API_KEY
    delete process.env.OPENROUTER_API_KEY
  })

  it('should route Buat Cerita through NEXUS Brain', async () => {
    const { generateStoryViaNexusBrain } = await import('../story-engine')
    
    process.env.GROQ_API_KEY = 'test-key'
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          title: "Test Story",
          logline: "Test logline",
          premise: "Test premise",
          conflict: "Test conflict",
          ending: "Test ending",
          characters: [{ name: "Hero", role: "protagonist", description: "Brave" }],
          locations: [{ name: "Village", location_id: "loc_village", description: "Small village", environment: "Peaceful" }],
          episode_structure: [{ episode: 1, title: "Beginning", summary: "Start" }],
          source_story_id: "test-story"
        }) } }],
        usage: {}
      })
    })

    const result = await generateStoryViaNexusBrain({
      theme: 'Petualangan',
      genre: 'Nusantara',
      tone: 'Heroik',
      storyIdea: 'Seorang anak desa menemukan kekuatan magis',
      episodeCount: 1,
      duration_per_episode_seconds: 15,
      total_duration_seconds: 15,
    })

    expect(result.ok).toBe(true)
    expect(result.nexusBrainUsed).toBe(true)
    expect(result.provider).toBe('groq')
    expect(result.verification).toContain('Gemini NOT used')
    expect(result.data?.title).toBe('Test Story')
  })
})

describe('NEXUS Brain Health Check', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.GROQ_API_KEY
    delete process.env.OPENROUTER_API_KEY
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
  })

  it('should return health without leaking secrets', () => {
    process.env.GROQ_API_KEY = 'secret-key'
    process.env.GROQ_MODEL = 'openai/gpt-oss-20b'
    
    const health = ProviderManager.getHealth()
    
    expect(health.brain).toBe('ready')
    expect(health.providers.groq).toBe('configured')
    expect(JSON.stringify(health)).not.toContain('secret-key')
    expect(health.detailed.groq.model).toBe('openai/gpt-oss-20b')
  })

  it('should return not_ready when no providers', () => {
    const health = ProviderManager.getHealth()
    
    expect(health.brain).toBe('not_ready')
    expect(health.ready).toBe(false)
    expect(health.providers.groq).toBe('not_configured')
    expect(health.providers.openrouter).toBe('not_configured')
  })

  it('should show local as disabled in production', () => {
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    process.env.LOCAL_AI_ENABLED = 'true'
    
    const health = ProviderManager.getHealth()
    
    expect(health.providers.local).toContain('disabled')
    expect(health.vercel.isProduction).toBe(true)
  })
})

describe('lib/gemini.ts compatibility seam', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.GROQ_API_KEY
    delete process.env.GEMINI_API_KEY
  })

  it('should forward NEXUS paths to NEXUS Brain, not use Gemini', async () => {
    const { generateWithGemini } = await import('../gemini')
    
    process.env.GROQ_API_KEY = 'test-groq'
    process.env.GEMINI_API_KEY = 'test-gemini'

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Story from NEXUS' } }],
        usage: {}
      })
    })

    const result = await generateWithGemini({
      prompt: 'Test story',
      engine: 'story',
      isNexusPath: true,
    })

    expect(result.ok).toBe(true)
    expect(result.provider).toBe('groq')
    expect(result.nexusBrainUsed).toBe(true)
    expect(result.verification).toContain('Gemini NOT used')
  })

  it('should allow legacy path to use Gemini for backward compat', async () => {
    const { generateWithGemini } = await import('../gemini')
    
    process.env.GEMINI_API_KEY = 'test-gemini'

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Legacy response' }] } }]
      })
    })

    const result = await generateWithGemini({
      prompt: 'Legacy feature',
      isNexusPath: false,
    })

    expect(result.ok).toBe(true)
    expect(result.provider).toBe('gemini')
    expect(result.isLegacy).toBe(true)
  })
})
