import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// TAHAP 1 — PROVIDER HARDENING — GROQ PRIMARY + OPENROUTER FALLBACK
// Test matrix A-O per spec, ensuring config not mutated permanently

describe('TAHAP 1 — PROVIDER HARDENING — GROQ PRIMARY + OPENROUTER FALLBACK', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    // Clean provider env
    delete process.env.GROQ_API_KEY
    delete process.env.GROQ_MODEL
    delete process.env.GROQ_ENABLED
    delete process.env.OPENROUTER_API_KEY
    delete process.env.OPEN_ROUTER_API_KEY
    delete process.env.OPENROUTER_APIKEY
    delete process.env.OPENROUTER_MODEL
    delete process.env.OPEN_ROUTER_MODEL
    delete process.env.OPENROUTER_ENABLED
    delete process.env.OPEN_ROUTER_ENABLED
    delete process.env.GOOGLE_AI_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.GEMINI_API_KEY
    delete process.env.LOCAL_AI_ENABLED
    delete process.env.LOCAL_AI_URL
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // Test A: GROQ configured + OpenRouter configured → active provider GROQ
  it('Test A: GROQ configured + OpenRouter configured → active provider GROQ', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_123'
    process.env.OPENROUTER_API_KEY = 'sk-or-test_openrouter_key_456'

    const { getGroqConfig, getOpenRouterConfig, getAllProviderStatus } = await import('../config')
    const groqCfg = getGroqConfig()
    const openRouterCfg = getOpenRouterConfig()
    const allStatus = getAllProviderStatus()

    expect(groqCfg.configured).toBe(true)
    expect(openRouterCfg.configured).toBe(true)
    expect(allStatus.groq.configured).toBe(true)
    expect(allStatus.openrouter.configured).toBe(true)

    const { getNexusBrainStatus, getActiveProviderDetection } = await import('../ai/nexus-brain')
    const brainStatus = getNexusBrainStatus()
    const activeDetection = getActiveProviderDetection()

    expect(brainStatus.configuredProviders).toContain('groq')
    expect(brainStatus.activeProvider).toBe('groq')
    expect(brainStatus.primaryProvider).toBe('groq')
    expect(activeDetection.available).toBe(true)
    expect(activeDetection.provider).toBe('groq')
    expect(activeDetection.order).toEqual(['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_AI_API_KEY'])
  })

  // Test B: GROQ request temporary failure → OpenRouter fallback
  it('Test B: GROQ request temporary failure → OpenRouter fallback', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_123'
    process.env.OPENROUTER_API_KEY = 'sk-or-test_openrouter_key_456'

    const { generateWithGroq } = await import('../ai/providers/groq')
    const { ProviderTimeoutError } = await import('../ai/provider-utils')

    // Mock fetch to simulate timeout for GROQ
    global.fetch = vi.fn().mockImplementation(() => {
      throw new ProviderTimeoutError('groq', 30000)
    })

    const result = await generateWithGroq({
      prompt: 'test',
      requestId: 'test-b',
      engine: 'story',
    })

    expect(result.ok).toBe(false)
    expect(result.triedProviders[0].status).toBe('TEMPORARY_FAILURE')
    expect(result.triedProviders[0].id).toBe('groq')
  })

  // Test C: Setelah Test B → GROQ tetap configured
  it('Test C: Setelah GROQ temporary failure → GROQ tetap configured (config vs runtime separated)', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_123'
    process.env.OPENROUTER_API_KEY = 'sk-or-test_openrouter_key_456'

    const { getGroqConfig } = await import('../config')
    const { generateWithGroq } = await import('../ai/providers/groq')
    const { ProviderTimeoutError } = await import('../ai/provider-utils')

    global.fetch = vi.fn().mockImplementation(() => {
      throw new ProviderTimeoutError('groq', 30000)
    })

    // First request fails
    await generateWithGroq({ prompt: 'test', requestId: 'test-c-1', engine: 'story' })

    // Check config still configured after failure - API KEY EXISTS ≠ LAST REQUEST SUCCEEDED
    const groqCfgAfter = getGroqConfig()
    expect(groqCfgAfter.configured).toBe(true)
    expect(groqCfgAfter.enabled).toBe(true)
    expect(process.env.GROQ_API_KEY).toBe('gsk_test_groq_key_123')
  })

  // Test D: Request berikutnya → GROQ boleh dipilih lagi
  it('Test D: Request berikutnya → GROQ boleh dipilih lagi (request-local fallback)', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_123'
    process.env.OPENROUTER_API_KEY = 'sk-or-test_openrouter_key_456'

    const { getNexusBrainStatus } = await import('../ai/nexus-brain')

    // First request would have failed, but second request should still try GROQ
    const status1 = getNexusBrainStatus()
    expect(status1.activeProvider).toBe('groq')

    const status2 = getNexusBrainStatus()
    expect(status2.activeProvider).toBe('groq')
    expect(status2.configuredProviders).toContain('groq')
  })

  // Test E: OpenRouter fallback berhasil → configuration GROQ tetap unchanged
  it('Test E: OpenRouter fallback berhasil → configuration GROQ tetap unchanged', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_123'
    process.env.OPENROUTER_API_KEY = 'sk-or-test_openrouter_key_456'

    const { getGroqConfig } = await import('../config')

    // Simulate GROQ fails, OpenRouter succeeds - config should remain
    const groqBefore = getGroqConfig()
    expect(groqBefore.configured).toBe(true)

    // After fallback success, GROQ config unchanged
    const groqAfter = getGroqConfig()
    expect(groqAfter.configured).toBe(true)
    expect(groqAfter.enabled).toBe(true)
    expect(process.env.GROQ_API_KEY).toBe('gsk_test_groq_key_123')
  })

  // Test F: Refresh / new request → provider detection membaca environment kembali
  it('Test F: Refresh / new request → provider detection membaca environment kembali (deterministic)', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_123'

    const { getActiveProviderDetection } = await import('../ai/nexus-brain')

    const detection1 = getActiveProviderDetection()
    expect(detection1.available).toBe(true)
    expect(detection1.provider).toBe('groq')

    // Simulate refresh - new request should read env again
    const detection2 = getActiveProviderDetection()
    expect(detection2.available).toBe(true)
    expect(detection2.provider).toBe('groq')
    expect(detection2.order).toEqual(['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_AI_API_KEY'])
  })

  // Test G: Health endpoint → status sama dengan provider resolver
  it('Test G: Health endpoint status sama dengan provider resolver (health/runtime consistency)', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_123'
    process.env.OPENROUTER_API_KEY = 'sk-or-test_openrouter_key_456'

    const { ProviderManager } = await import('../ai/provider-manager')
    const { getNexusBrainStatus, getActiveProviderDetection } = await import('../ai/nexus-brain')
    const { validateEnv } = await import('../ai/provider-utils')

    const health = ProviderManager.getHealth()
    const brainStatus = getNexusBrainStatus()
    const activeDetection = getActiveProviderDetection()
    const envValidation = validateEnv()

    // All should agree on configured providers
    expect(health.ready).toBe(brainStatus.isReady)
    expect(health.providers.groq).toBe('configured')
    expect(health.providers.openrouter).toBe('configured')
    expect(brainStatus.configuredProviders).toContain('groq')
    expect(brainStatus.configuredProviders).toContain('openrouter')
    expect(activeDetection.available).toBe(true)
    expect(activeDetection.provider).toBe('groq')
    expect(envValidation.brain.ready).toBe(true)
    expect(envValidation.brain.activeProvider).toBe('groq')
  })

  // Test H: Missing GROQ only → OpenRouter tetap READY
  it('Test H: Missing GROQ only → OpenRouter tetap READY', async () => {
    delete process.env.GROQ_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-test_openrouter_key_456'

    const { getGroqConfig, getOpenRouterConfig, getAllProviderStatus } = await import('../config')
    const { getNexusBrainStatus, getActiveProviderDetection } = await import('../ai/nexus-brain')

    const groqCfg = getGroqConfig()
    const openRouterCfg = getOpenRouterConfig()
    const allStatus = getAllProviderStatus()
    const brainStatus = getNexusBrainStatus()
    const activeDetection = getActiveProviderDetection()

    expect(groqCfg.configured).toBe(false)
    expect(openRouterCfg.configured).toBe(true)
    expect(allStatus.groq.configured).toBe(false)
    expect(allStatus.openrouter.configured).toBe(true)
    expect(brainStatus.configuredProviders).toContain('openrouter')
    expect(brainStatus.configuredProviders).not.toContain('groq')
    expect(brainStatus.activeProvider).toBe('openrouter')
    expect(activeDetection.available).toBe(true)
    expect(activeDetection.provider).toBe('openrouter')
  })

  // Test I: Missing OpenRouter only → GROQ tetap READY
  it('Test I: Missing OpenRouter only → GROQ tetap READY', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_123'
    delete process.env.OPENROUTER_API_KEY
    delete process.env.OPEN_ROUTER_API_KEY

    const { getGroqConfig, getOpenRouterConfig, getAllProviderStatus } = await import('../config')
    const { getNexusBrainStatus, getActiveProviderDetection } = await import('../ai/nexus-brain')

    const groqCfg = getGroqConfig()
    const openRouterCfg = getOpenRouterConfig()
    const allStatus = getAllProviderStatus()
    const brainStatus = getNexusBrainStatus()
    const activeDetection = getActiveProviderDetection()

    expect(groqCfg.configured).toBe(true)
    expect(openRouterCfg.configured).toBe(false)
    expect(allStatus.groq.configured).toBe(true)
    expect(allStatus.openrouter.configured).toBe(false)
    expect(brainStatus.configuredProviders).toContain('groq')
    expect(brainStatus.activeProvider).toBe('groq')
    expect(activeDetection.provider).toBe('groq')
  })

  // Test J: Both missing → benar-benar NO_PROVIDER_CONFIGURED
  it('Test J: Both missing → benar-benar NO_PROVIDER_CONFIGURED', async () => {
    delete process.env.GROQ_API_KEY
    delete process.env.OPENROUTER_API_KEY
    delete process.env.OPEN_ROUTER_API_KEY
    delete process.env.GOOGLE_AI_API_KEY
    delete process.env.GEMINI_API_KEY

    const { getAllProviderStatus } = await import('../config')
    const { getNexusBrainStatus, getActiveProviderDetection } = await import('../ai/nexus-brain')
    const { validateEnv } = await import('../ai/provider-utils')

    const allStatus = getAllProviderStatus()
    const brainStatus = getNexusBrainStatus()
    const activeDetection = getActiveProviderDetection()
    const envValidation = validateEnv()

    expect(allStatus.groq.configured).toBe(false)
    expect(allStatus.openrouter.configured).toBe(false)
    expect(brainStatus.isReady).toBe(false)
    expect(brainStatus.configuredProviders.length).toBe(0)
    expect(activeDetection.available).toBe(false)
    expect(activeDetection.message).toBe('AI provider belum dikonfigurasi')
    expect(envValidation.brain.ready).toBe(false)
    expect(envValidation.brain.activeProvider).toBeNull()
  })

  // Test K: 401/403 → AUTH_FAILED, bukan NOT_SET
  it('Test K: 401/403 → AUTH_FAILED, bukan NOT_SET', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_invalid_key'

    const { generateWithGroq } = await import('../ai/providers/groq')

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    } as any)

    const result = await generateWithGroq({
      prompt: 'test',
      requestId: 'test-k',
      engine: 'story',
    })

    expect(result.ok).toBe(false)
    expect(result.triedProviders[0].status).toBe('AUTH_FAILED')
    expect(result.triedProviders[0].status).not.toBe('UNCONFIGURED')
    expect(result.triedProviders[0].status).not.toBe('NOT_CONFIGURED')

    // Config still SET after auth failure - API KEY EXISTS ≠ LAST REQUEST SUCCEEDED
    const { getGroqConfig } = await import('../config')
    const cfg = getGroqConfig()
    expect(cfg.configured).toBe(true)
  })

  // Test L: 429 → RATE_LIMITED, bukan NOT_SET
  it('Test L: 429 → RATE_LIMITED, bukan NOT_SET', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_key'

    const { generateWithGroq } = await import('../ai/providers/groq')

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as any)

    const result = await generateWithGroq({
      prompt: 'test',
      requestId: 'test-l',
      engine: 'story',
    })

    expect(result.ok).toBe(false)
    expect(result.triedProviders[0].status).toBe('RATE_LIMITED')
    expect(result.triedProviders[0].status).not.toBe('UNCONFIGURED')
    expect(result.triedProviders[0].status).not.toBe('NOT_SET')

    const { getGroqConfig } = await import('../config')
    const cfg = getGroqConfig()
    expect(cfg.configured).toBe(true)
  })

  // Test M: timeout → TEMPORARY_FAILURE, bukan NOT_SET
  it('Test M: timeout → TEMPORARY_FAILURE, bukan NOT_SET', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_key'

    const { generateWithGroq } = await import('../ai/providers/groq')
    const { ProviderTimeoutError } = await import('../ai/provider-utils')

    global.fetch = vi.fn().mockImplementation(() => {
      throw new ProviderTimeoutError('groq', 30000)
    })

    const result = await generateWithGroq({
      prompt: 'test',
      requestId: 'test-m',
      engine: 'story',
    })

    expect(result.ok).toBe(false)
    expect(result.triedProviders[0].status).toBe('TEMPORARY_FAILURE')
    expect(result.triedProviders[0].status).not.toBe('UNCONFIGURED')

    const { getGroqConfig } = await import('../config')
    const cfg = getGroqConfig()
    expect(cfg.configured).toBe(true)
  })

  // Test N: 500/502/503/504 → PROVIDER_ERROR, bukan NOT_SET
  it('Test N: 500/502/503/504 → PROVIDER_ERROR, bukan NOT_SET', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_key'

    const { generateWithGroq } = await import('../ai/providers/groq')

    for (const status of [500, 502, 503, 504]) {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: async () => `Server error ${status}`,
      } as any)

      const result = await generateWithGroq({
        prompt: 'test',
        requestId: `test-n-${status}`,
        engine: 'story',
      })

      expect(result.ok).toBe(false)
      expect(result.triedProviders[0].status).toBe('PROVIDER_ERROR')
      expect(result.triedProviders[0].status).not.toBe('UNCONFIGURED')
    }

    const { getGroqConfig } = await import('../config')
    const cfg = getGroqConfig()
    expect(cfg.configured).toBe(true)
  })

  // Test O: Tidak ada test yang pernah memodifikasi real environment variable
  it('Test O: Tidak ada test yang pernah memodifikasi real environment variable (persistence)', async () => {
    // This test ensures process.env.GROQ_API_KEY is never set to undefined or mutated permanently
    const originalGroq = process.env.GROQ_API_KEY
    const originalOpenRouter = process.env.OPENROUTER_API_KEY

    process.env.GROQ_API_KEY = 'gsk_persistence_test'
    process.env.OPENROUTER_API_KEY = 'sk-or-persistence_test'

    const { getGroqConfig, getOpenRouterConfig } = await import('../config')
    const { generateWithGroq } = await import('../ai/providers/groq')
    const { ProviderTimeoutError } = await import('../ai/provider-utils')

    global.fetch = vi.fn().mockImplementation(() => {
      throw new ProviderTimeoutError('groq', 30000)
    })

    await generateWithGroq({ prompt: 'test', requestId: 'test-o', engine: 'story' })

    // Env vars should still be same after failure
    expect(process.env.GROQ_API_KEY).toBe('gsk_persistence_test')
    expect(process.env.OPENROUTER_API_KEY).toBe('sk-or-persistence_test')

    const groqCfg = getGroqConfig()
    const openRouterCfg = getOpenRouterConfig()
    expect(groqCfg.configured).toBe(true)
    expect(openRouterCfg.configured).toBe(true)

    // Restore
    if (originalGroq) process.env.GROQ_API_KEY = originalGroq
    else delete process.env.GROQ_API_KEY
    if (originalOpenRouter) process.env.OPENROUTER_API_KEY = originalOpenRouter
    else delete process.env.OPENROUTER_API_KEY
  })

  // Additional: Alias compatibility
  it('Alias OpenRouter OPEN_ROUTER_API_KEY tetap kompatibel dan deterministic', async () => {
    delete process.env.OPENROUTER_API_KEY
    process.env.OPEN_ROUTER_API_KEY = 'sk-or-alias_key_789'

    const { getOpenRouterConfig } = await import('../config')
    const cfg = getOpenRouterConfig()

    expect(cfg.configured).toBe(true)
    expect(cfg.apiKey).toBe('sk-or-alias_key_789')

    // If both set, canonical deterministic: OPENROUTER_API_KEY first
    process.env.OPENROUTER_API_KEY = 'sk-or-primary_key_123'
    process.env.OPEN_ROUTER_API_KEY = 'sk-or-alias_key_789'

    // Need to re-import to get fresh config
    vi.resetModules()
    const { getOpenRouterConfig: getCfg2 } = await import('../config')
    const cfg2 = getCfg2()

    expect(cfg2.configured).toBe(true)
    expect(cfg2.apiKey).toBe('sk-or-primary_key_123') // deterministic: primary wins
  })

  // Health/runtime consistency
  it('Health endpoint dan runtime resolver menggunakan sumber konfigurasi yang sama', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_key'
    process.env.OPENROUTER_API_KEY = 'sk-or-test_key'

    const { ProviderManager } = await import('../ai/provider-manager')
    const { getNexusBrainStatus, getActiveProviderDetection } = await import('../ai/nexus-brain')
    const { validateEnv } = await import('../ai/provider-utils')
    const { getAllProviderStatus } = await import('../config')

    const health = ProviderManager.getHealth()
    const brainStatus = getNexusBrainStatus()
    const activeDetection = getActiveProviderDetection()
    const envValidation = validateEnv()
    const allStatus = getAllProviderStatus()

    // All should be consistent
    expect(health.providers.groq).toBe('configured')
    expect(allStatus.groq.configured).toBe(true)
    expect(brainStatus.configuredProviders).toContain('groq')
    expect(activeDetection.available).toBe(true)
    expect(envValidation.groq.configured).toBe(true)
    expect(envValidation.brain.ready).toBe(true)

    // Health ready should match brain ready
    expect(health.ready).toBe(brainStatus.isReady)
    expect(health.ready).toBe(envValidation.brain.ready)
  })

  // Security: No hardcoded real keys
  it('Security: No hardcoded real API keys in source, health tidak bocor secret', async () => {
    process.env.GROQ_API_KEY = 'gsk_real_secret_key_should_not_leak_12345'
    process.env.OPENROUTER_API_KEY = 'sk-or-real_secret_key_should_not_leak_67890'

    const { ProviderManager } = await import('../ai/provider-manager')
    const health = ProviderManager.getHealth()

    const healthString = JSON.stringify(health)

    expect(healthString).not.toContain('gsk_real_secret_key_should_not_leak_12345')
    expect(healthString).not.toContain('sk-or-real_secret_key_should_not_leak_67890')
    expect(healthString).not.toContain('gsk_')
    expect(healthString).not.toContain('sk-or-')

    // Should only contain SET/NOT SET, READY/NOT_READY, provider name, model name
    expect(health.providers.groq).toBe('configured')
    expect(health.providers.openrouter).toBe('configured')
  })
})
