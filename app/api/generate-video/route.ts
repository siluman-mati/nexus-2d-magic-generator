import { NextResponse } from 'next/server';
import { generateMotionVideo, MOTION_ENGINE_LABEL, DEFAULT_MOTION_SPACES } from '@/lib/2d-generator/motion-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const FORCE_ENGINE_LABEL = MOTION_ENGINE_LABEL;

export async function POST(req: Request) {
  const requestId = `req_motion_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const startTime = Date.now();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`[generate-video] [${requestId}] TIMEOUT after 85000ms`);
    abortController.abort();
  }, 85000);

  req.signal.addEventListener('abort', () => {
    console.log(`[generate-video] [${requestId}] Client aborted`);
    abortController.abort();
  });

  try {
    const body = await req.json();
    const { imageUrl, image, image_url, canonicalKeyframe, motionPrompt, prompt, duration, seed } = body;

    const finalImageUrl = imageUrl || image || image_url || canonicalKeyframe;
    const finalMotionPrompt = motionPrompt || prompt || 'subtle camera zoom, character blinking, natural motion, cinematic, smooth movement, highly detailed';

    console.log(`[generate-video] [${requestId}] START — image ${finalImageUrl ? finalImageUrl.slice(0,80) : 'MISSING'}... — motionPrompt "${finalMotionPrompt.slice(0,100)}" — ENGINE: ${FORCE_ENGINE_LABEL}`);

    if (!finalImageUrl) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        ok: false,
        errorCode: 'INVALID_INPUT',
        errorMessage: 'imageUrl required — base64 dataUrl or http url from Step 3 Canonical Keyframe — provide imageUrl / image / canonicalKeyframe',
        requestId,
        state: 'FAILED',
        engineLabel: FORCE_ENGINE_LABEL,
        verification: 'FAILED — missing imageUrl',
      }, { status: 400 });
    }

    if (finalMotionPrompt && (finalMotionPrompt.length < 3 || finalMotionPrompt.length > 5000)) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        ok: false,
        errorCode: 'INVALID_INPUT',
        errorMessage: 'motionPrompt must be 3-5000 chars',
        requestId,
        state: 'FAILED',
        engineLabel: FORCE_ENGINE_LABEL,
      }, { status: 400 });
    }

    const result = await generateMotionVideo({
      imageUrl: finalImageUrl,
      motionPrompt: finalMotionPrompt,
      duration: duration || 6,
      seed,
      requestId,
    }, abortController.signal);

    clearTimeout(timeoutId);
    const totalTime = Date.now() - startTime;

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        INVALID_INPUT: 400,
        MOTION_ENGINE_FAILED: 503,
        TIMEOUT: 408,
        CANCELLED: 499,
        AUTHENTICATION_FAILED: 401,
        QUOTA_EXCEEDED: 402,
        PROVIDER_UNAVAILABLE: 503,
      };
      const httpStatus = statusMap[result.errorCode || 'MOTION_ENGINE_FAILED'] || 500;
      console.error(`[generate-video] [${requestId}] FAILED — ${result.errorCode}: ${result.errorMessage?.slice(0,400)} — tried ${result.triedSpaces.join(', ')} — time ${totalTime}ms`);

      return NextResponse.json({
        ok: false,
        errorCode: result.errorCode || 'MOTION_ENGINE_FAILED',
        errorMessage: result.errorMessage,
        state: 'FAILED',
        requestId,
        generationId: requestId,
        engineLabel: FORCE_ENGINE_LABEL,
        engine: FORCE_ENGINE_LABEL,
        model: 'CogVideoX-5B-I2V / SVD',
        primarySpace: DEFAULT_MOTION_SPACES.primary,
        fallbacks: DEFAULT_MOTION_SPACES.fallbacks,
        triedSpaces: result.triedSpaces,
        spaceUsed: result.spaceUsed,
        processingTimeMs: totalTime,
        motionPrompt: finalMotionPrompt,
        verification: result.verification || 'FAILED — MOTION_ENGINE_FAILED — no Pollinations — honest error',
      }, { status: httpStatus });
    }

    console.log(`[generate-video] [${requestId}] COMPLETED — videoUrl ${result.videoUrl?.slice(0,120)}... — space ${result.spaceUsed} — time ${totalTime}ms`);

    return NextResponse.json({
      ok: true,
      success: true,
      videoUrl: result.videoUrl,
      video_url: result.videoUrl,
      url: result.videoUrl,
      mimeType: result.mimeType || 'video/mp4',
      duration: result.duration || 6,
      width: result.width,
      height: result.height,
      engineLabel: FORCE_ENGINE_LABEL,
      engine: `${FORCE_ENGINE_LABEL} — Space ${result.spaceUsed}`,
      model: 'CogVideoX-5B-I2V / SVD',
      spaceUsed: result.spaceUsed,
      primarySpace: DEFAULT_MOTION_SPACES.primary,
      fallbacks: DEFAULT_MOTION_SPACES.fallbacks,
      triedSpaces: result.triedSpaces,
      processingTimeMs: totalTime,
      generationTimeMs: result.processingTimeMs,
      motionPrompt: finalMotionPrompt,
      requestId,
      generationId: requestId,
      state: 'COMPLETED',
      verification: result.verification || `COMPLETED via Gradio Client ${result.spaceUsed} — no Pollinations`,
    });

  } catch (err: any) {
    clearTimeout(timeoutId);
    const isCancelled = err.name === 'AbortError' || err.message.includes('Cancelled') || err.message.includes('aborted');
    if (isCancelled) {
      console.log(`[generate-video] [${requestId}] CANCELLED — time ${Date.now() - startTime}ms`);
      return NextResponse.json({
        ok: false,
        errorCode: 'CANCELLED',
        errorMessage: 'Generation cancelled by user or timeout',
        state: 'CANCELLED',
        requestId,
        engineLabel: FORCE_ENGINE_LABEL,
        processingTimeMs: Date.now() - startTime,
      }, { status: 499 });
    }
    console.error(`[generate-video] [${requestId}] Exception: ${err.message}`, err.stack);
    const safeMessage = err.message.replace(/hf_[a-zA-Z0-9]+/g, '[REDACTED]').replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');
    return NextResponse.json({
      ok: false,
      errorCode: 'UNKNOWN_ERROR',
      errorMessage: safeMessage,
      state: 'FAILED',
      requestId,
      engineLabel: FORCE_ENGINE_LABEL,
      processingTimeMs: Date.now() - startTime,
      verification: 'FAILED — exception — no Pollinations',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'READY',
    engine: MOTION_ENGINE_LABEL,
    engineLabel: MOTION_ENGINE_LABEL,
    model: 'CogVideoX-5B-I2V / SVD I2V',
    primarySpace: DEFAULT_MOTION_SPACES.primary,
    fallbacks: DEFAULT_MOTION_SPACES.fallbacks,
    timeoutMs: 60000,
    retry: { maxRetriesPerSpace: 2, backoffMs: 5000 },
    usage: {
      POST: '/api/generate-video',
      body: {
        imageUrl: 'base64 dataUrl or http url from Step 3 Canonical Keyframe (required)',
        motionPrompt: 'subtle camera zoom, character blinking, natural motion, cinematic (optional)',
        duration: '6 (optional seconds)',
      },
      response: {
        ok: true,
        videoUrl: 'http url or data:video/mp4;base64,...',
        engineLabel: MOTION_ENGINE_LABEL,
        spaceUsed: 'THUDM/CogVideoX-5B',
      },
      error: {
        ok: false,
        errorCode: 'MOTION_ENGINE_FAILED',
        errorMessage: 'All Gradio I2V spaces failed — honest FAILED — no Pollinations',
      },
    },
    verification: 'Motion Engine Gradio Client CogVideoX/SVD — no Pollinations — honest MOTION_ENGINE_FAILED',
    env: {
      HUGGINGFACE_I2V_SPACE_ID: process.env.HUGGINGFACE_I2V_SPACE_ID ? 'SET' : 'NOT SET (defaults to THUDM/CogVideoX-5B)',
      HUGGINGFACE_API_KEY: !!(process.env.HUGGINGFACE_API_KEY || process.env.HUGGING_FACE_API_KEY || process.env.HF_TOKEN) ? 'SET' : 'NOT SET — optional for private spaces',
    },
  });
}
