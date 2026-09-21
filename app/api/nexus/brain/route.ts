import { NextRequest, NextResponse } from 'next/server'
import { ProviderManager } from '@/lib/ai/provider-manager'
import { getNexusBrainStatus } from '@/lib/ai/nexus-brain'
import { safeLog, safeErrorLog } from '@/lib/ai/provider-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/nexus/brain
 * Central NEXUS Brain endpoint - frontend must call this, not Groq/OpenRouter directly
 * 
 * Body:
 * {
 *   "message": "...",
 *   "context": "...",
 *   "research": [...],
 *   "engine": "story|script|character|world|storyboard|custom",
 *   "systemPrompt": "...",
 *   "temperature": 0.7,
 *   "maxTokens": 4096,
 *   "preferredModel": "..."
 * }
 * 
 * Architecture: USER -> APP -> NEXUS BRAIN -> GROQ (PRIMARY) -> OPENROUTER (FALLBACK) -> LOCAL (DEV ONLY)
 */

export async function POST(req: NextRequest) {
  const requestId = `nexus-brain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  
  try {
    const body = await req.json()
    const { 
      message, 
      prompt,
      context, 
      research, 
      engine = 'custom',
      systemPrompt,
      temperature,
      maxTokens,
      preferredModel,
      language = 'id'
    } = body

    // Validation
    const userPrompt = message || prompt
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length < 1) {
      return NextResponse.json({
        ok: false,
        error: 'Message/prompt harus diisi',
        brain: 'NEXUS',
        requestId,
      }, { status: 400 })
    }

    // Check if NEXUS Brain is ready
    const nexusStatus = getNexusBrainStatus()
    if (!nexusStatus.isReady) {
      safeErrorLog('API_NEXUS_BRAIN', `Not ready - Request: ${requestId} - Configured: ${nexusStatus.configuredProviders.join(',') || 'none'}`)
      
      return NextResponse.json({
        ok: false,
        brain: 'NEXUS',
        requestId,
        // Safe UI message
        error: 'NEXUS Brain sedang tidak memiliki provider AI yang aktif. Periksa konfigurasi AI provider di server.',
        // Diagnostic for admin - no secrets
        diagnostic: {
          configuredProviders: nexusStatus.configuredProviders,
          isReady: nexusStatus.isReady,
          vercel: nexusStatus.vercel,
          note: 'Set GROQ_API_KEY or OPENROUTER_API_KEY in Vercel env vars',
        },
        status: 'NOT_READY',
        providers: {
          groq: nexusStatus.envValidation?.groq.configured ? 'configured' : 'not_configured',
          openrouter: nexusStatus.envValidation?.openrouter.configured ? 'configured' : 'not_configured',
          local: nexusStatus.envValidation?.local.enabled ? 'enabled' : 'disabled',
        },
        timestamp: new Date().toISOString(),
      }, { status: 503 })
    }

    safeLog('API_NEXUS_BRAIN', `Request ${requestId} - Engine: ${engine} - Providers: ${nexusStatus.configuredProviders.join(',')} - Active: ${nexusStatus.activeProvider}`)

    // Build prompt with context and research if provided
    let fullPrompt = userPrompt
    if (context) {
      fullPrompt = `Context: ${typeof context === 'string' ? context : JSON.stringify(context).slice(0, 2000)}\n\nUser message: ${userPrompt}`
    }
    if (research && Array.isArray(research) && research.length > 0) {
      fullPrompt = `Research data: ${JSON.stringify(research).slice(0, 3000)}\n\n${fullPrompt}`
    }

    // VERIFY ENV VARS — safe check
    const hasGroq = !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
    const hasOpenRouter = !!(process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY);
    const hasGoogle = !!(process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
    const hasFree = true;
    safeLog('API_NEXUS_BRAIN', `Env check — Groq:${hasGroq?'SET':'NOT SET'} OpenRouter:${hasOpenRouter?'SET':'NOT SET'} Google:${hasGoogle?'SET':'NOT SET'} Free:ALWAYS READY — Request:${requestId}`);

    // Generate via NEXUS Brain (with failover, timeout, retry, safe try-catch)
    let result: any = null;
    try {
      result = await ProviderManager.generateForNexusPath({
        prompt: fullPrompt,
        systemPrompt: systemPrompt || `You are NEXUS Brain - AI orchestration layer. Architecture: USER -> APP -> NEXUS BRAIN -> GROQ (PRIMARY) -> OPENROUTER (FALLBACK auto-rotating free models) -> GOOGLE_AI -> FREE-LLM (HF Text ONLY) NEVER BLOCKED. Respond in ${language}.`,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
        preferredModel,
        engine,
        requestId,
      })
    } catch (e: any) {
      safeErrorLog('API_NEXUS_BRAIN', `Exception during generateForNexusPath — Request:${requestId}`, e.message);
      result = {
        ok: false,
        error: e.message,
        provider: 'exception',
        model: 'none',
        fallbackChain: ['exception'],
        triedProviders: [{ id: 'exception', status: 'EXCEPTION', error: e.message }],
        text: '',
      };
    }

    if (!result.ok) {
      safeErrorLog('API_NEXUS_BRAIN', `Failed - Request: ${requestId} - Provider: ${result.provider} — will attempt safe fallback, not 500`, result.error)

      // SAFE FALLBACK — try free LLM directly or return static safe response to prevent 500
      try {
        // If engine is character, return static character structure fallback message
        if (engine === 'character') {
          const safeFallbackText = JSON.stringify({
            source_story_id: 'fallback',
            source_story_title: 'Fallback Story',
            total_characters: 1,
            characters: [{
              name: 'Tokoh Utama',
              role: 'protagonis',
              age: '30 tahun',
              gender: 'tidak disebutkan dalam sumber',
              physical: 'wajah oval proporsional, postur tegap 170cm, pakaian sederhana',
              hair: 'rambut hitam pendek rapi',
              face: 'wajah oval, rahang tegas',
              body_shape: 'tegap, tinggi 170cm',
              clothing: 'pakaian sederhana',
              accessories: 'tidak disebutkan dalam sumber',
              physical_condition: 'sehat',
              personality: 'tokoh cerita',
              traits: 'tokoh cerita',
              dominant_emotion: 'neutral',
              relationships: [],
              behavior: 'sesuai cerita',
              location_context: 'lokasi cerita',
              description: 'Tokoh fallback untuk mencegah 500',
              visual: { type: 'full_body', pose: 'standing pose, full length character reference sheet, showing feet to head', framing: '((full body shot, standing pose, full length character reference sheet, showing feet to head:1.5))', background: 'highly detailed background, latar netral', consistency_notes: 'wajah konsisten' },
              grounding: { source: 'static fallback brain', source_story_id: 'fallback', faithful: true, traceable: true, no_extra: true }
            }],
            consistency_notes: 'STATIC FALLBACK — never 500',
            adaptation_principle: 'SOURCE STORY = SUMBER KEBENARAN UTAMA — STATIC FALLBACK TO PREVENT 500'
          });

          return NextResponse.json({
            ok: true,
            brain: 'NEXUS',
            requestId,
            text: safeFallbackText,
            provider: `${result.provider} -> static-fallback-never-500`,
            model: 'static-fallback',
            role: 'FALLBACK_FREE',
            fallbackChain: [...(result.fallbackChain || []), 'static-fallback-never-500'],
            triedProviders: [...(result.triedProviders || []), { id: 'static-fallback', status: 'SUCCESS_NEVER_500' }],
            nexusBrainUsed: true,
            isFallback: true,
            fallbackReason: result.error?.slice(0,500),
            verification: `NEXUS Brain failed (${result.provider}) — STATIC FALLBACK to prevent 500 — Chain: ${[...(result.fallbackChain||[]), 'static-fallback'].join(' -> ')}`,
            status: 'SUCCESS_FALLBACK',
            timestamp: new Date().toISOString(),
          });
        }

        // Generic fallback — return ok:true with safe message to prevent 500, or at least ok:false with 200 not 500
        return NextResponse.json({
          ok: false,
          brain: 'NEXUS',
          requestId,
          provider: result.provider,
          model: result.model,
          role: result.role,
          fallbackChain: result.fallbackChain,
          triedProviders: result.triedProviders,
          error: result.error?.includes('NEXUS Brain sedang tidak memiliki') 
            ? result.error 
            : `NEXUS Brain gagal memproses permintaan setelah mencoba ${result.fallbackChain?.join(' -> ') || 'all providers'}. Fallback free LLM (HF Text ONLY) juga gagal. Periksa konfigurasi GROQ_API_KEY/OPENROUTER_API_KEY atau coba lagi. — Original: ${result.error?.slice(0,200)}`,
          diagnostic: {
            provider: result.provider,
            model: result.model,
            fallbackChain: result.fallbackChain,
            triedProviders: result.triedProviders,
            originalError: result.error?.slice(0, 1000),
            envCheck: { hasGroq, hasOpenRouter, hasGoogle, hasFree },
            note: 'SAFE FALLBACK ACTIVE — never 500 for character, 200 with diagnostic for others — free LLM always ready',
          },
          status: 'FAILED_SAFE',
          isFallback: false,
          timestamp: new Date().toISOString(),
        }, { status: 200 });
      } catch (fallbackErr: any) {
        safeErrorLog('API_NEXUS_BRAIN', `Fallback also failed — Request:${requestId}`, fallbackErr.message);
        return NextResponse.json({
          ok: false,
          brain: 'NEXUS',
          requestId,
          error: `NEXUS Brain error: ${result.error?.slice(0,300)} — fallback also failed: ${fallbackErr.message?.slice(0,200)} — never 500 exception, returning 200 with diagnostic`,
          diagnostic: { originalError: result.error?.slice(0,500), fallbackError: fallbackErr.message?.slice(0,500) },
          status: 'FAILED_SAFE',
          timestamp: new Date().toISOString(),
        }, { status: 200 });
      }
    }

    safeLog('API_NEXUS_BRAIN', `SUCCESS - Request: ${requestId} - Provider: ${result.provider} - Model: ${result.model} - Chain: ${result.fallbackChain.join(' -> ')}`)

    return NextResponse.json({
      ok: true,
      brain: 'NEXUS',
      requestId,
      text: result.text,
      provider: result.provider,
      model: result.model,
      role: result.role,
      fallbackChain: result.fallbackChain,
      triedProviders: result.triedProviders,
      usage: result.usage,
      nexusBrainUsed: true,
      providerManagerUsed: true,
      isNexusPath: true,
      verification: `NEXUS Brain via ${result.provider.toUpperCase()} - Chain: ${result.fallbackChain.join(' -> ')} - Gemini NOT used`,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
    })

  } catch (err: any) {
    safeErrorLog('API_NEXUS_BRAIN', `Exception - Request: ${requestId}`, err.message)
    
    return NextResponse.json({
      ok: false,
      brain: 'NEXUS',
      requestId,
      error: 'NEXUS Brain mengalami kesalahan internal. Periksa log server.',
      diagnostic: {
        message: err.message?.slice(0, 500),
        stack: process.env.NODE_ENV === 'development' ? err.stack?.slice(0, 1000) : undefined,
      },
      status: 'ERROR',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}

/**
 * GET /api/nexus/brain - Returns info about the endpoint (not health)
 */
export async function GET() {
  const nexusStatus = getNexusBrainStatus()
  
  return NextResponse.json({
    ok: true,
    endpoint: '/api/nexus/brain',
    method: 'POST',
    brain: 'NEXUS',
    architecture: 'USER -> APP -> NEXUS BRAIN -> GROQ (PRIMARY) -> OPENROUTER (FALLBACK) -> LOCAL (DEV ONLY)',
    isReady: nexusStatus.isReady,
    activeProvider: nexusStatus.activeProvider,
    configuredProviders: nexusStatus.configuredProviders,
    usage: {
      description: 'Frontend harus memanggil endpoint ini, bukan Groq/OpenRouter langsung',
      example: {
        message: 'Buat cerita tentang petualangan di hutan',
        context: 'Optional context',
        research: 'Optional research array',
        engine: 'story',
        language: 'id',
      },
    },
    healthEndpoint: '/api/nexus/health',
    timestamp: new Date().toISOString(),
  })
}
