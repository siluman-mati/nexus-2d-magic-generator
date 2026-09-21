// lib/visual-pipeline/frame-compositor.ts — PIPELINE LAYER SEPARATED — Frame Compositor
// Arsitektur: Karakter Polos (Layer Atas) + Background Terpisah (Layer Bawah) + Compositing via Canvas HTML5 / CSS Overlay / API

export interface CompositeFrameRequest {
  characterImageUrl: string; // base64 or URL — asset only, clean white bg
  backgroundImageUrl: string; // base64 or URL — world only, no humans
  sceneId?: string;
  characterName?: string;
  locationName?: string;
  action?: string;
  emotion?: string;
  timeOfDay?: string; // pagi/siang/senja/malam
  weather?: string; // cerah/hujan/badai
  position?: {
    x: number; // 0-100 % from left
    y: number; // 0-100 % from top
    scale: number; // 0.5-2.0
    anchor?: 'center' | 'bottom' | 'left' | 'right';
  };
}

export interface CompositeFrameResult {
  compositeImageUrl: string; // base64 final frame
  characterLayer: string;
  backgroundLayer: string;
  metadata: {
    sceneId: string;
    composition: string;
    layers: string[];
    engine: string;
    timestamp: string;
  };
}

// Calculate character position based on scene action/emotion
export function calculateCharacterPosition(action?: string, emotion?: string, sceneType?: string): { x: number; y: number; scale: number; anchor: 'center' | 'bottom' } {
  const act = (action || '').toLowerCase();
  const emo = (emotion || '').toLowerCase();
  
  // Default center bottom (standing pose)
  let x = 50;
  let y = 75; // bottom anchored
  let scale = 1.0;
  
  if (act.includes('duduk') || act.includes('sit')) {
    y = 80;
    scale = 0.9;
  } else if (act.includes('berjalan') || act.includes('walk') || act.includes('berlari') || act.includes('run')) {
    x = act.includes('kiri') ? 30 : act.includes('kanan') ? 70 : 50;
    scale = 1.0;
  } else if (act.includes('bertarung') || act.includes('fight') || act.includes('battle')) {
    x = 50;
    y = 70;
    scale = 1.1;
  } else if (act.includes('berbicara') || act.includes('dialog')) {
    x = 45;
    scale = 1.0;
  }
  
  if (emo.includes('sedih') || emo.includes('sad')) {
    y = 78;
    scale = 0.95;
  } else if (emo.includes('marah') || emo.includes('angry')) {
    scale = 1.05;
  }
  
  return { x, y, scale, anchor: 'bottom' as const };
}

// Build composite prompt description for logging
export function buildCompositeDescription(req: CompositeFrameRequest): string {
  return `Composite Frame: ${req.characterName || 'Character'} (${req.action || 'standing'}) at ${req.locationName || 'Majapahit courtyard'} — Time: ${req.timeOfDay || 'senja'} Weather: ${req.weather || 'cerah'} — Layer: Background (${req.backgroundImageUrl ? 'READY' : 'NO_BG'}) + Character Asset (${req.characterImageUrl ? 'READY' : 'NO_CHAR'}) overlaid via Canvas`;
}

// Client-side Canvas compositing function — to be used in browser
export function getCompositorClientCode(): string {
  return `
// Frame Compositor — Client-side Canvas HTML5 — Karakter Polos + Background Terpisah
async function compositeCharacterOverBackground(characterUrl, backgroundUrl, options = {}) {
  const { x = 50, y = 75, scale = 1.0, width = 768, height = 1024 } = options;
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject('Canvas not supported');

    const bgImg = new Image();
    const charImg = new Image();
    bgImg.crossOrigin = 'anonymous';
    charImg.crossOrigin = 'anonymous';
    let loaded = 0;
    function tryComposite() {
      loaded++;
      if (loaded < 2) return;
      // Draw background (Layer Bawah) — full frame
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bgImg, 0, 0, width, height);
      // Calculate character position
      const charW = charImg.width;
      const charH = charImg.height;
      const targetH = height * 0.85 * scale; // character occupies 85% height
      const targetW = (charW / charH) * targetH;
      const posX = (width * x / 100) - (targetW / 2);
      const posY = (height * y / 100) - targetH;
      // Draw character (Layer Atas) — over background
      ctx.drawImage(charImg, posX, posY, targetW, targetH);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    }
    bgImg.onload = tryComposite;
    charImg.onload = tryComposite;
    bgImg.onerror = () => reject('Failed load background');
    charImg.onerror = () => reject('Failed load character');
    bgImg.src = backgroundUrl;
    charImg.src = characterUrl;
  });
}
`;
}

// CSS Overlay compositor — simple HTML/CSS stacking
export function buildCSSOverlayHTML(characterUrl: string, backgroundUrl: string, position?: { x: number; y: number; scale: number }): string {
  const x = position?.x ?? 50;
  const y = position?.y ?? 75;
  const scale = position?.scale ?? 1.0;
  return `
<div style="position:relative; width:768px; height:1024px; overflow:hidden; background:#000;">
  <img src="${backgroundUrl}" style="position:absolute; left:0; top:0; width:100%; height:100%; object-fit:cover; z-index:1;" alt="Background" />
  <img src="${characterUrl}" style="position:absolute; left:${x}%; top:${y}%; transform:translate(-50%,-100%) scale(${scale}); height:85%; width:auto; object-fit:contain; z-index:2; filter:drop-shadow(0 4px 12px rgba(0,0,0,0.5));" alt="Character" />
</div>
`;
}

// API Compositor — server-side metadata for composition
export function buildCompositeMetadata(req: CompositeFrameRequest): CompositeFrameResult['metadata'] {
  return {
    sceneId: req.sceneId || `scene_${Date.now()}`,
    composition: buildCompositeDescription(req),
    layers: [
      `Background: ${req.locationName || 'Majapahit'} — ${req.timeOfDay || 'senja'} ${req.weather || 'cerah'} — dynamic background from story source, environment matching story description, outdoor landscape from story — NO humans`,
      `Character Asset: ${req.characterName || 'Character'} — 7 atribut + gender — isolated on clean white background — NO environment`,
      `Composite: Canvas HTML5 — Character (Layer Atas) over Background (Layer Bawah) — x:${req.position?.x || 50}% y:${req.position?.y || 75}% scale:${req.position?.scale || 1.0}`
    ],
    engine: 'Direct HF Inference FLUX.1-schnell (Majapahit Locked) — Layer Separated Pipeline — Character Polos + Background Terpisah + Frame Compositor',
    timestamp: new Date().toISOString(),
  };
}
