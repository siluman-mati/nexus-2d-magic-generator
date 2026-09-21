import { NextResponse } from 'next/server';
import { buildCompositeMetadata, calculateCharacterPosition, buildCSSOverlayHTML } from '@/lib/visual-pipeline/frame-compositor';

const FORCE_ENGINE_LABEL = `Image Engine: Direct HF Inference FLUX.1-schnell (Dynamic) — Frame Compositor`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      characterImageUrl,
      backgroundImageUrl,
      sceneId,
      characterName,
      locationName,
      action,
      emotion,
      timeOfDay,
      weather,
      position,
    } = body;

    if (!characterImageUrl) {
      return NextResponse.json({ error: 'characterImageUrl required — asset only, clean white background' }, { status: 400 });
    }
    if (!backgroundImageUrl) {
      return NextResponse.json({ error: 'backgroundImageUrl required — world background only, no humans' }, { status: 400 });
    }

    // Calculate auto position if not provided
    const autoPos = calculateCharacterPosition(action, emotion, sceneId);
    const finalPos = {
      x: position?.x ?? autoPos.x,
      y: position?.y ?? autoPos.y,
      scale: position?.scale ?? autoPos.scale,
      anchor: position?.anchor || autoPos.anchor,
    };

    const metadata = buildCompositeMetadata({
      characterImageUrl,
      backgroundImageUrl,
      sceneId,
      characterName,
      locationName,
      action,
      emotion,
      timeOfDay,
      weather,
      position: finalPos,
    });

    // CSS Overlay HTML for quick preview
    const overlayHTML = buildCSSOverlayHTML(characterImageUrl, backgroundImageUrl, finalPos);

    // For API compositor — we return metadata + both layers + HTML
    // Actual pixel compositing is done client-side via Canvas HTML5 for performance and Vercel serverless limits
    // Client can use canvas code from lib/visual-pipeline/frame-compositor.ts getCompositorClientCode()
    
    // Try simple server-side composite if sharp is available (optional) — fallback to returning layers
    let compositeImageUrl = '';
    try {
      // If both are base64 data URLs, we cannot composite server-side without canvas/sharp
      // So we return a composite description that client will render via Canvas
      // For now, compositeImageUrl = background as placeholder, client will overlay character
      compositeImageUrl = backgroundImageUrl; // placeholder — real composite done client-side
    } catch {}

    return NextResponse.json({
      ok: true,
      engineLabel: FORCE_ENGINE_LABEL,
      layerType: 'composite_frame',
      pipeline: 'LAYER SEPARATED — Character Asset (Top) + World Background (Bottom) + Frame Compositor (Canvas/CSS)',
      characterLayer: characterImageUrl,
      backgroundLayer: backgroundImageUrl,
      compositeImageUrl,
      overlayHTML,
      position: finalPos,
      metadata,
      instructions: {
        clientCanvas: `Use compositeCharacterOverBackground(characterUrl, backgroundUrl, {x:${finalPos.x}, y:${finalPos.y}, scale:${finalPos.scale}}) from FrameCompositor component — Canvas HTML5 draws background then character`,
        cssOverlay: `Use CSS absolute positioning: background z-index 1 full, character z-index 2 positioned at ${finalPos.x}% ${finalPos.y}% scale ${finalPos.scale}`,
        api: `POST /api/composite {characterImageUrl, backgroundImageUrl, sceneId, action, emotion} → returns overlayHTML + position`,
      },
      scene: {
        sceneId: sceneId || `scene_${Date.now()}`,
        characterName,
        locationName,
        action,
        emotion,
        timeOfDay: timeOfDay || 'senja',
        weather: weather || 'cerah',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, engineLabel: FORCE_ENGINE_LABEL }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'READY',
    engine: 'Direct HF Inference FLUX.1-schnell (Dynamic) — Frame Compositor',
    engineLabel: FORCE_ENGINE_LABEL,
    pipeline: 'LAYER SEPARATED — Character Asset Only (clean white bg) + World Background Only (no humans) + Frame Compositor (Canvas HTML5 / CSS Overlay / API)',
    layers: [
      '1. GENERATOR PANEL KARAKTER (ASSET ONLY): isolated full-body character portrait, standalone character, transparent PNG style, cutout style, plain clean flat background, full body character sheet, standing pose, isolated on clean solid white/neutral background, studio lighting, vector style cutout, NO environment, NO buildings, NO background elements — gender enforced 1man/1woman + dynamic style from naskah',
      '2. GENERATOR PANEL DUNIA (BACKGROUND ONLY): dynamic background from story source, environment matching story description, [waktu: pagi/siang/senja/malam], [cuaca: cerah/hujan/badai], cinematic atmosphere, highly detailed environment background, NO humans, NO characters, empty scene',
      '3. FRAME COMPOSITOR: Canvas HTML5 draws background (Layer Bawah) then character (Layer Atas) at x,y,scale — CSS Overlay alternative — API returns overlayHTML',
    ],
    usage: {
      character: `POST /api/generate-hf {mode:'character', prompt, characterData} → asset only white bg`,
      world: `POST /api/generate-hf {mode:'world', worldSetting, timeOfDay:'senja', weather:'cerah'} → background only no humans`,
      composite: `POST /api/composite {characterImageUrl, backgroundImageUrl, sceneId, action, emotion} → composite metadata + overlayHTML`,
    },
  });
}
