import { NextResponse } from 'next/server';
const HF_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN || process.env.HUGGING_FACE_API_KEY || process.env.HUNGGING_FACE_API_KEY || '';
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: HF_KEY ? 'READY' : 'UNCONFIGURED',
    provider: 'direct-hf-inference',
    engine: 'Direct HF Inference FLUX.1-schnell (Dynamic)',
    engineLabel: 'Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic)',
    model: 'black-forest-labs/FLUX.1-schnell',
    endpoint: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    fallbackEndpoint: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
    url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
    width: 1024,
    height: 1024,
    steps: 8,
    guidance: 3.5,
    sole_engine: '/api/generate-hf',
    hasHuggingFaceKey: !!HF_KEY,
    message: 'Direct HF Inference FLUX.1-schnell (Dynamic) — api-inference + router.huggingface.co/fal-ai/fal-ai/flux/schnell — steps 8 guidance 3.5 — retry 503 5s max3x — honest FAILED no Pollinations',
    configured: !!HF_KEY,
    verification: 'Direct HF Inference (Dynamic) — no Gradio — no Pollinations',
  });
}
