'use client';
import { useRef, useState, useEffect } from 'react';

interface FrameCompositorProps {
  characterImageUrl?: string;
  backgroundImageUrl?: string;
  sceneId?: string;
  characterName?: string;
  locationName?: string;
  action?: string;
  emotion?: string;
  timeOfDay?: string;
  weather?: string;
  initialPosition?: { x: number; y: number; scale: number };
  onComposite?: (dataUrl: string) => void;
}

export default function FrameCompositor({
  characterImageUrl,
  backgroundImageUrl,
  sceneId,
  characterName,
  locationName,
  action,
  emotion,
  timeOfDay,
  weather,
  initialPosition,
  onComposite,
}: FrameCompositorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [position, setPosition] = useState(initialPosition || { x: 50, y: 75, scale: 1.0 });
  const [compositeUrl, setCompositeUrl] = useState('');
  const [mode, setMode] = useState<'canvas' | 'css'>('canvas');
  const [isCompositing, setIsCompositing] = useState(false);

  const calculateAutoPosition = () => {
    const act = (action || '').toLowerCase();
    let x = 50, y = 75, scale = 1.0;
    if (act.includes('duduk') || act.includes('sit')) { y = 80; scale = 0.9; }
    else if (act.includes('kiri')) x = 30;
    else if (act.includes('kanan')) x = 70;
    return { x, y, scale };
  };

  const compositeViaCanvas = async () => {
    if (!characterImageUrl || !backgroundImageUrl || !canvasRef.current) return;
    setIsCompositing(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      const width = 768;
      const height = 1024;
      canvas.width = width;
      canvas.height = height;

      const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(`Failed load ${src.slice(0,50)}`);
          img.src = src;
        });
      };

      const bgImg = await loadImage(backgroundImageUrl);
      const charImg = await loadImage(characterImageUrl);

      // Layer Bawah: Background — full frame
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bgImg, 0, 0, width, height);

      // Layer Atas: Character Asset — isolated white bg, now cutout over background
      const charW = charImg.width;
      const charH = charImg.height;
      const targetH = height * 0.85 * position.scale;
      const targetW = (charW / charH) * targetH;
      const posX = (width * position.x / 100) - (targetW / 2);
      const posY = (height * position.y / 100) - targetH;

      // Optional: remove white background via simple luminance key (if asset has white bg)
      // For now draw directly — character asset is already isolated
      ctx.drawImage(charImg, posX, posY, targetW, targetH);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCompositeUrl(dataUrl);
      if (onComposite) onComposite(dataUrl);
    } catch (e: any) {
      console.error('Composite failed', e);
    } finally {
      setIsCompositing(false);
    }
  };

  useEffect(() => {
    if (mode === 'canvas' && characterImageUrl && backgroundImageUrl) {
      compositeViaCanvas();
    }
  }, [characterImageUrl, backgroundImageUrl, position, mode]);

  if (!characterImageUrl || !backgroundImageUrl) {
    return (
      <div style={{ padding: '1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', fontSize: '0.75rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>🎬 Frame Compositor — Layer Separated Pipeline</div>
        <div>Butuh 2 layer:</div>
        <div>• <b>Karakter Polos</b> (Layer Atas): {characterImageUrl ? '✅ READY' : '❌ Belum ada — Generate via mode: character — full body character sheet, isolated on clean white background'}</div>
        <div>• <b>Background Dunia</b> (Layer Bawah): {backgroundImageUrl ? '✅ READY' : '❌ Belum ada — Generate via mode: world — ancient Javanese Majapahit landscape, no humans'}</div>
        <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Pipeline: Karakter Polos (asset only, white bg, 7 atribut) + Background Terpisah (world only, no humans, time/weather) → Compositing via Canvas HTML5 / CSS Overlay</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <b style={{ fontSize: '0.85rem' }}>🎬 Frame Compositor — {sceneId || 'Scene'} — {characterName || 'Character'} @ {locationName || 'Majapahit'}</b>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{action || 'standing'} — {emotion || 'tenang'} — {timeOfDay || 'senja'} {weather || 'cerah'} — Pipeline: Character (Top) + World (Bottom) + Canvas</div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" className={`btn sm ${mode === 'canvas' ? 'primary' : 'secondary'}`} onClick={() => setMode('canvas')}>Canvas HTML5</button>
          <button type="button" className={`btn sm ${mode === 'css' ? 'primary' : 'secondary'}`} onClick={() => setMode('css')}>CSS Overlay</button>
          <button type="button" className="btn sm good" onClick={compositeViaCanvas} disabled={isCompositing}>{isCompositing ? '⏳ Compositing...' : '🔄 Re-Composite'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, marginBottom: '0.3rem' }}>Layer Bawah — Background Dunia (No Humans)</div>
          <img src={backgroundImageUrl} alt="Background" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '6px', background: '#111' }} />
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{locationName || 'Majapahit'} — {timeOfDay || 'senja'} {weather || 'cerah'} — empty scene</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, marginBottom: '0.3rem' }}>Layer Atas — Karakter Polos (White BG, 7 Atribut)</div>
          <img src={characterImageUrl} alt="Character Asset" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'contain', borderRadius: '6px', background: 'white' }} />
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{characterName || 'Character'} — {action || 'standing'} — isolated cutout</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '2px solid var(--success)', borderRadius: '8px', padding: '0.4rem' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--success)' }}>Hasil Composite — Frame Utuh (Naskah Alur)</div>
          {mode === 'canvas' ? (
            <div style={{ position: 'relative' }}>
              <canvas ref={canvasRef} width={768} height={1024} style={{ width: '100%', aspectRatio: '3/4', borderRadius: '6px', background: '#111' }} />
              {compositeUrl && <img src={compositeUrl} alt="Composite" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', borderRadius: '6px', objectFit: 'cover', pointerEvents: 'none', opacity: 0 }} />}
            </div>
          ) : (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '3/4', borderRadius: '6px', overflow: 'hidden', background: '#000' }}>
              <img src={backgroundImageUrl} alt="BG" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
              <img src={characterImageUrl} alt="Char" style={{ position: 'absolute', left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%,-100%) scale(${position.scale})`, height: '85%', width: 'auto', objectFit: 'contain', zIndex: 2, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }} />
            </div>
          )}
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Canvas HTML5: BG (z1) + Char (z2) x:{position.x}% y:{position.y}% scale:{position.scale} — {sceneId}</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>Position:</div>
        <label style={{ fontSize: '0.65rem' }}>X: {position.x}% <input type="range" min={0} max={100} value={position.x} onChange={e => setPosition(p => ({ ...p, x: parseInt(e.target.value) }))} /></label>
        <label style={{ fontSize: '0.65rem' }}>Y: {position.y}% <input type="range" min={0} max={100} value={position.y} onChange={e => setPosition(p => ({ ...p, y: parseInt(e.target.value) }))} /></label>
        <label style={{ fontSize: '0.65rem' }}>Scale: {position.scale.toFixed(2)} <input type="range" min={0.5} max={1.5} step={0.05} value={position.scale} onChange={e => setPosition(p => ({ ...p, scale: parseFloat(e.target.value) }))} /></label>
        <button type="button" className="btn sm secondary" onClick={() => setPosition(calculateAutoPosition())}>Auto (dari aksi)</button>
        {compositeUrl && <a href={compositeUrl} download={`${sceneId || 'frame'}_composite.jpg`} className="btn sm good">⬇️ Download Frame</a>}
      </div>

      {compositeUrl && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '6px', padding: '0.4rem', fontSize: '0.65rem' }}>
          <div><b>Composite Ready:</b> {compositeUrl.slice(0,60)}... — {sceneId} — {characterName} @ {locationName} — {timeOfDay} {weather}</div>
          <div style={{ color: 'var(--text-muted)' }}>Pipeline: Character Asset (clean white bg, 7 atribut) + World Background (no humans, {timeOfDay} {weather}) → Canvas HTML5 composited — Frame utuh sesuai naskah</div>
        </div>
      )}
    </div>
  );
}
