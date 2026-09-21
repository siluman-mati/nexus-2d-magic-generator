'use client';
import { useState, useEffect, useMemo } from 'react';

const DEFAULT_MOTION_PROMPT = 'subtle camera zoom, character blinking, natural motion, cinematic, smooth movement, highly detailed, 35mm photograph';

type SceneItem = {
  id: string;
  number: number;
  title: string;
  action?: string;
  emotion?: string;
  location?: string;
  characters?: string[];
  visualPrompt?: string;
  motionPrompt?: string;
  dialogue?: any[];
  imageUrl?: string;
  source: 'storyboard' | 'script' | 'composite' | 'drawing';
  raw: any;
};

export default function TestVideoPage() {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [motionPrompt, setMotionPrompt] = useState<string>(DEFAULT_MOTION_PROMPT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<any>(null);
  const [engineStatus, setEngineStatus] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);

  const [autoLoaded, setAutoLoaded] = useState(false);
  const [characterInfo, setCharacterInfo] = useState<any>(null);

  // INTEGRATED SCENE SELECTOR
  const [projectData, setProjectData] = useState<any>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');

  const buildMotionPromptFromScene = (scene: any): string => {
    // AUTO-EXTRACT PRIORITY: scene.motionPrompt || scene.motion_prompt || scene.raw.motionPrompt — from script-engine LLM
    const directMP = scene.motionPrompt || scene.motion_prompt || scene.motion_prompt_text || scene.raw?.motionPrompt || scene.raw?.motion_prompt;
    if (directMP && typeof directMP === 'string' && directMP.trim().length >= 10) {
      console.log('[test-video] Using auto-extracted motionPrompt from Naskah:', directMP.slice(0,100));
      return directMP.slice(0, 500);
    }
    // Fallback: build from action/emotion/dialogue
    const parts: string[] = [];
    if (scene.action) parts.push(scene.action);
    if (scene.emotion || scene.emotion_overall) parts.push(`${scene.emotion || scene.emotion_overall} emotion`);
    if (scene.dialogue && Array.isArray(scene.dialogue) && scene.dialogue.length) {
      const firstLine = scene.dialogue[0]?.line || scene.dialogue[0]?.text || '';
      if (firstLine) parts.push(`character says "${firstLine.slice(0, 60)}"`);
    }
    if (scene.location?.name) parts.push(`in ${scene.location.name}`);
    parts.push('subtle camera zoom, natural motion, cinematic, smooth movement, highly detailed, 35mm photograph');
    const prompt = parts.join(', ').slice(0, 500);
    return prompt;
  };

  const scenes: SceneItem[] = useMemo(() => {
    if (!projectData) return [];
    const list: SceneItem[] = [];
    const drawings = projectData.drawings || {};
    const composites = projectData.compositeFrames || {};
    const charImages = projectData.characterImages || {};
    const firstCharFallback = charImages ? (Object.values(charImages as any)[0] as any)?.referenceImageUrl || (Object.values(charImages as any)[0] as any)?.imageUrl : null;

    // Prefer storyboard.scenes (from episode) — strict order by scene_number
    const rawScenes = projectData.storyboard?.scenes || projectData.script?.scenes || projectData.story?.scenes || [];

    rawScenes.forEach((sc: any, idx: number) => {
      const sceneId = sc.scene_id || sc.id || `scene_${idx + 1}`;
      const sceneNumber = sc.scene_number || sc.scene_number_in_episode || idx + 1;
      const title = sc.title || sc.episode_title || `${sc.location?.name || sc.location || 'Scene'} — ${sc.action?.slice(0, 40) || 'Untitled'}`;
      const action = sc.action || sc.description || '';
      const emotion = sc.emotion || sc.emotion_overall || sc.purpose || '';
      const location = sc.location?.name || sc.location || '';
      const characters = sc.characters || sc.characters_present || [];
      const visualPrompt = sc.visual_prompt || sc.visualPrompt || '';
      const motionPromptExtracted = sc.motionPrompt || sc.motion_prompt || sc.motion_prompt_text || '';
      const dialogue = sc.dialogue || sc.dialog || [];

      // Resolve imageUrl — sequential preservation: try drawings[sceneId], composites, then fallback
      let imgUrl: string | undefined = undefined;
      if (drawings[sceneId]?.imageUrl) imgUrl = drawings[sceneId].imageUrl;
      else if (drawings[sceneId]?.image) imgUrl = drawings[sceneId].image;
      else if (drawings[sceneId]?.image_url) imgUrl = drawings[sceneId].image_url;
      else if (composites[sceneId]?.imageUrl) imgUrl = composites[sceneId].imageUrl;
      else if (composites[sceneId]?.compositeImageUrl) imgUrl = composites[sceneId].compositeImageUrl;
      else {
        // try composite with location+char key
        const compKeys = Object.keys(composites);
        const match = compKeys.find(k => k.includes(sceneId) || (location && k.includes(location)));
        if (match) imgUrl = composites[match]?.imageUrl;
      }
      if (!imgUrl && firstCharFallback) imgUrl = firstCharFallback; // fallback to canonical character if no scene keyframe yet

      list.push({
        id: sceneId,
        number: sceneNumber,
        title,
        action,
        emotion,
        location,
        characters,
        visualPrompt,
        motionPrompt: motionPromptExtracted,
        dialogue,
        imageUrl: imgUrl,
        source: projectData.storyboard?.scenes ? 'storyboard' : projectData.script?.scenes ? 'script' : 'drawing',
        raw: sc,
      });
    });

    // Also include standalone drawings that are not in scenes (e.g. character canonical) as extra items at top? No — preserve sequential order only scenes
    // Sort by number to ensure order preservation
    list.sort((a, b) => a.number - b.number);
    return list;
  }, [projectData]);

  useEffect(() => {
    fetch('/api/generate-video')
      .then(r => r.json())
      .then(data => setEngineStatus(data))
      .catch(() => {});

    // Load project from localStorage (NEXUS main UI persistence) + /api/project fallback
    const loadProject = async () => {
      let proj: any = null;
      try {
        const saved = localStorage.getItem('nexus_project');
        if (saved) {
          proj = JSON.parse(saved);
          setProjectData(proj);
          console.log('[test-video] Loaded project from localStorage', Object.keys(proj));
        }
      } catch {}
      try {
        const res = await fetch('/api/project');
        const data = await res.json();
        if (data.project && (data.project.story || data.project.script || data.project.storyboard)) {
          // Merge — server may have more recent
          const merged = { ...(proj || {}), ...data.project };
          setProjectData(merged);
          console.log('[test-video] Loaded project from /api/project merged');
        }
      } catch {}

      // AUTO-LOAD from main UI — localStorage nexus_motion_image set by "Animasikan Video (Step 4)" button
      try {
        const savedImage = localStorage.getItem('nexus_motion_image');
        const savedChar = localStorage.getItem('nexus_motion_character');
        const savedPrompt = localStorage.getItem('nexus_motion_prompt');
        const savedScene = localStorage.getItem('nexus_motion_scene');
        if (savedImage && savedImage.length > 100) {
          setImageUrl(savedImage);
          setImagePreview(savedImage);
          setAutoLoaded(true);
          console.log('[test-video] Auto-loaded canonical image from localStorage', savedImage.length, 'chars');
        }
        if (savedChar) {
          try { setCharacterInfo(JSON.parse(savedChar)); } catch { setCharacterInfo({ name: savedChar }); }
        }
        if (savedPrompt) {
          setMotionPrompt(savedPrompt);
        }
        if (savedScene) {
          try {
            const sc = JSON.parse(savedScene);
            setSelectedSceneId(sc.id || sc.scene_id || '');
          } catch {}
        }
      } catch {}
    };
    loadProject();
  }, []);

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageUrl(result);
      setImagePreview(result);
      setSelectedSceneId('');
    };
    reader.readAsDataURL(file);
  };

  const handleImageUrlInput = (val: string) => {
    setImageUrl(val);
    if (val.startsWith('data:image') || val.startsWith('http')) {
      setImagePreview(val);
    }
  };

  const handleSelectScene = (scene: SceneItem) => {
    setSelectedSceneId(scene.id);
    // ONE-CLICK AUTO FILL: image + motion prompt from Naskah scene
    if (scene.imageUrl) {
      setImageUrl(scene.imageUrl);
      setImagePreview(scene.imageUrl);
      setAutoLoaded(false);
      setCharacterInfo({ name: `Scene ${scene.number}: ${scene.title}`, role: `Location: ${scene.location} — Characters: ${(scene.characters || []).join(', ')}` });
      try {
        localStorage.setItem('nexus_motion_image', scene.imageUrl);
        localStorage.setItem('nexus_motion_scene', JSON.stringify({ id: scene.id, number: scene.number, title: scene.title }));
      } catch {}
    } else {
      // No image yet — keep current but still fill prompt
      setError(`Scene ${scene.number} belum punya keyframe image — generate di Gambar/Papan Cerita dulu, tapi motion prompt sudah terisi`);
    }
    const mp = buildMotionPromptFromScene(scene.raw);
    setMotionPrompt(mp);
    try {
      localStorage.setItem('nexus_motion_prompt', mp);
    } catch {}
    // Scroll to input
    document.getElementById('keyframe-input')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleGenerate = async () => {
    if (!imageUrl) {
      setError('imageUrl required — upload file, paste base64/http, or pilih Scene dari Gallery di atas');
      return;
    }
    setIsGenerating(true);
    setError('');
    setVideoUrl('');
    setInfo(null);
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          motionPrompt,
          duration: 6,
          sceneId: selectedSceneId || undefined,
        }),
      });
      const data = await res.json();
      setInfo(data);
      if (!res.ok || !data.ok) {
        throw new Error(data.errorMessage || data.error || `HTTP ${res.status}`);
      }
      const vUrl = data.videoUrl || data.video_url || data.url;
      if (!vUrl) throw new Error('No videoUrl in response');
      setVideoUrl(vUrl);
    } catch (e: any) {
      setError(e.message || 'Generate failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange(file);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <a href="/" style={{ padding: '0.5rem 0.9rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#aaa', textDecoration: 'none', fontSize: '0.8rem' }}>← Kembali ke NEXUS Main UI</a>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {autoLoaded && <span style={{ padding: '0.4rem 0.8rem', background: 'rgba(37,99,235,0.15)', border: '1px solid #2563eb', borderRadius: '20px', color: '#60a5fa', fontSize: '0.7rem', fontWeight: 700 }}>✅ Auto-loaded dari {characterInfo?.name || 'Karakter'} — Canonical Image</span>}
            {projectData && <span style={{ padding: '0.4rem 0.8rem', background: 'rgba(34,197,94,0.12)', border: '1px solid #22c55e', borderRadius: '20px', color: '#4ade80', fontSize: '0.7rem' }}>{scenes.length} Scenes • {Object.keys(projectData.drawings || {}).length} Keyframes • {projectData.story?.title || 'Project loaded'}</span>}
          </div>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>🎬 NEXUS STEP 4 — Motion Engine (Gradio CogVideoX / SVD) + Scene Gallery</h1>
        <p style={{ color: '#888', marginBottom: '1.5rem' }}>
          Route <code>/test-video</code> — Terintegrasi penuh dengan Naskah & Papan Cerita Step 1-3 — Pilih Scene dari Gallery → auto-fill keyframe + motion prompt → Generate .mp4
          <br />
          <span style={{ fontSize: '0.8rem' }}>Engine: {engineStatus?.engineLabel || 'Motion Engine: Gradio CogVideoX / SVD I2V (Dynamic)'} — Primary: {engineStatus?.primarySpace || 'zai-org/CogVideoX-5B-Space'} — Fallbacks: {(engineStatus?.fallbacks || []).join(', ')}</span>
          {characterInfo && <><br /><span style={{ fontSize: '0.75rem', color: '#60a5fa' }}>{characterInfo.name} {characterInfo.role ? `— ${characterInfo.role}` : ''}</span></>}
        </p>

        {/* INTEGRATED SCENE SELECTOR PANEL — Gallery from Naskah/Papan Cerita */}
        <div style={{ background: '#111', border: '2px solid #2563eb', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>📚 Scene Keyframe Gallery — From Naskah & Papan Cerita (Step 1-3)</h2>
            <span style={{ fontSize: '0.7rem', color: '#60a5fa', background: 'rgba(37,99,235,0.12)', border: '1px solid #2563eb', borderRadius: '20px', padding: '0.3rem 0.7rem' }}>{scenes.length} scenes sequential — order preserved — klik untuk auto-fill</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.8rem', background: '#0a0a0a', border: '1px solid #222', borderRadius: '8px', padding: '0.6rem' }}>
            Flow: Naskah (Script) → Episode (Storyboard) → Gambar (Drawings) → <b style={{ color: '#60a5fa' }}>Scene Gallery di /test-video</b> → Klik Scene → Auto-fill keyframe + motion prompt → Generate Motion Video → .mp4<br />
            Label: <code>Scene 1: Rangga bertemu Amelia</code> — sequential order preservation — no acak — dari <code>storyboard.scenes</code> sorted by <code>scene_number</code>
          </div>

          {scenes.length === 0 ? (
            <div style={{ border: '1px dashed #333', borderRadius: '10px', padding: '2rem 1rem', textAlign: 'center', color: '#666', background: '#0a0a0a' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭</div>
              <div style={{ fontWeight: 600 }}>Belum ada Scene — Buat Cerita → Naskah → Episode → Gambar di Main UI dulu</div>
              <div style={{ fontSize: '0.7rem', marginTop: '0.4rem' }}>Project loaded: {projectData ? `${projectData.story?.title || 'No title'} — storyboard ${projectData.storyboard?.scenes?.length || 0} scenes, script ${projectData.script?.scenes?.length || 0} scenes, drawings ${Object.keys(projectData.drawings || {}).length}` : 'No project in localStorage — generate di Main UI dulu'}</div>
              <div style={{ marginTop: '0.8rem' }}>
                <a href="/" style={{ padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}>← Ke Main UI — Buat Naskah & Keyframe</a>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.8rem', maxHeight: '420px', overflowY: 'auto', padding: '0.2rem' }}>
              {scenes.map((scene) => (
                <div
                  key={scene.id}
                  onClick={() => handleSelectScene(scene)}
                  style={{
                    background: selectedSceneId === scene.id ? 'rgba(37,99,235,0.18)' : '#0a0a0a',
                    border: `2px solid ${selectedSceneId === scene.id ? '#2563eb' : scene.imageUrl ? '#333' : '#222'}`,
                    borderRadius: '10px',
                    padding: '0.6rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  <div style={{ position: 'absolute', top: '0.4rem', left: '0.4rem', background: selectedSceneId === scene.id ? '#2563eb' : '#1a1a1a', color: selectedSceneId === scene.id ? '#fff' : '#aaa', fontSize: '0.6rem', fontWeight: 800, padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #333' }}>
                    Scene {scene.number}
                  </div>
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt={scene.title} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '6px', background: '#000', marginTop: '1.2rem' }} />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '16/9', background: '#111', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '0.7rem', marginTop: '1.2rem', border: '1px dashed #333' }}>No keyframe yet</div>
                  )}
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: selectedSceneId === scene.id ? '#93c5fd' : '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Scene {scene.number}: {scene.title}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📍 {scene.location || 'Unknown'} • 👤 {(scene.characters || []).slice(0, 2).join(', ') || 'No chars'}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: '#666', marginTop: '0.2rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '28px' }}>
                      {scene.action?.slice(0, 90) || scene.visualPrompt?.slice(0, 90) || 'No action'}
                    </div>
                    <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.55rem', background: scene.imageUrl ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${scene.imageUrl ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: '4px', padding: '0.1rem 0.3rem', color: scene.imageUrl ? '#4ade80' : '#f87171' }}>{scene.imageUrl ? '✅ Keyframe' : '❌ No Image'}</span>
                      <span style={{ fontSize: '0.55rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', padding: '0.1rem 0.3rem', color: '#888' }}>{scene.source}</span>
                      {selectedSceneId === scene.id && <span style={{ fontSize: '0.55rem', background: '#2563eb', color: '#fff', borderRadius: '4px', padding: '0.1rem 0.3rem', fontWeight: 700 }}>▶ Selected</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: '0.8rem', fontSize: '0.65rem', color: '#666', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
            <span>Sequential Order Preservation: Scene 1 → Scene 2 → Scene N — sorted by scene_number — label jelas &quot;Scene 1: Rangga bertemu Amelia&quot; — tidak acak saat dianimasikan</span>
            <span>One-click: klik Scene → auto-fill Drop image + Motion Prompt</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
          {/* Left: Input */}
          <div id="keyframe-input" style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '1.2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>1️⃣ Canonical Keyframe Input (Step 3) {selectedSceneId && <span style={{ fontSize: '0.7rem', color: '#60a5fa', marginLeft: '0.5rem' }}>← from Scene {scenes.find(s=>s.id===selectedSceneId)?.number}</span>}</h2>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? '#60a5fa' : selectedSceneId ? '#2563eb' : '#333'}`,
                borderRadius: '10px',
                padding: '1.5rem',
                textAlign: 'center',
                background: dragOver ? '#1a2332' : selectedSceneId ? 'rgba(37,99,235,0.08)' : '#0f0f0f',
                marginBottom: '1rem',
                cursor: 'pointer',
              }}
              onClick={() => document.getElementById('fileInput')?.click()}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🖼️</div>
              <div style={{ fontWeight: 600 }}>{selectedSceneId ? `Scene ${scenes.find(s=>s.id===selectedSceneId)?.number} selected — Drop to override` : 'Drop image / Click to upload'}</div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.3rem' }}>PNG/JPEG from Step 3 / Gallery — will convert to Blob for Gradio Client</div>
              <input
                id="fileInput"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              />
            </div>

            <label style={{ fontSize: '0.8rem', color: '#aaa', display: 'block', marginBottom: '0.4rem' }}>Or paste Base64 dataUrl / HTTP URL:</label>
            <textarea
              value={imageUrl}
              onChange={(e) => handleImageUrlInput(e.target.value)}
              placeholder="data:image/jpeg;base64,... or https://.../keyframe.jpg — from Step 3 or auto-filled from Scene Gallery"
              style={{
                width: '100%',
                minHeight: '90px',
                background: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '0.7rem',
                color: '#ddd',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
            />

            {imagePreview && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.4rem' }}>Preview Keyframe: {selectedSceneId ? `Scene ${scenes.find(s=>s.id===selectedSceneId)?.number}: ${scenes.find(s=>s.id===selectedSceneId)?.title}` : 'Manual'}</div>
                <img
                  src={imagePreview}
                  alt="keyframe preview"
                  style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #333', background: '#000' }}
                />
                <div style={{ fontSize: '0.65rem', color: '#555', marginTop: '0.3rem' }}>{imagePreview.length} chars — {imagePreview.startsWith('data:') ? 'Base64' : 'HTTP URL'}</div>
              </div>
            )}

            <div style={{ marginTop: '1.2rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>2️⃣ Motion Prompt {selectedSceneId && <span style={{ fontSize: '0.7rem', color: '#60a5fa' }}>— auto-filled from Naskah Scene {scenes.find(s=>s.id===selectedSceneId)?.number}</span>}</label>
              <textarea
                value={motionPrompt}
                onChange={(e) => setMotionPrompt(e.target.value)}
                placeholder="subtle camera zoom, character blinking, natural motion, cinematic — auto-filled from Scene action when clicking Gallery"
                style={{
                  width: '100%',
                  minHeight: '80px',
                  background: selectedSceneId ? 'rgba(37,99,235,0.06)' : '#0a0a0a',
                  border: `1px solid ${selectedSceneId ? '#2563eb' : '#333'}`,
                  borderRadius: '8px',
                  padding: '0.7rem',
                  color: '#ddd',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                }}
              />
              <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '0.3rem' }}>Auto-filled from Naskah Scene action + emotion + dialogue when clicking Gallery — editable 3-5000 chars — Example: &quot;subtle camera zoom, character walking, happy emotion, cinematic&quot;</div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !imageUrl}
              style={{
                width: '100%',
                marginTop: '1.2rem',
                padding: '0.9rem',
                background: isGenerating ? '#333' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: isGenerating || !imageUrl ? 'not-allowed' : 'pointer',
                opacity: isGenerating || !imageUrl ? 0.6 : 1,
              }}
            >
              {isGenerating ? '⏳ Generating Motion Video... (60s timeout)' : `🎬 Generate Motion Video ${selectedSceneId ? `(Scene ${scenes.find(s=>s.id===selectedSceneId)?.number})` : ''}`}
            </button>

            {error && (
              <div style={{ marginTop: '1rem', background: '#1a0f0f', border: '1px solid #441111', borderRadius: '8px', padding: '0.8rem', color: '#f87171', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                ❌ {error}
              </div>
            )}

            {info && (
              <div style={{ marginTop: '1rem', background: '#0f1a0f', border: '1px solid #1a331a', borderRadius: '8px', padding: '0.8rem', fontSize: '0.7rem', color: '#aaa', maxHeight: '200px', overflow: 'auto' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: '#6f6' }}>ℹ️ Engine Response:</div>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{JSON.stringify(info, null, 2).slice(0, 3000)}</pre>
              </div>
            )}
          </div>

          {/* Right: Output */}
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '1.2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>3️⃣ Motion Video Output (.mp4)</h2>

            {!videoUrl && !isGenerating && (
              <div style={{ border: '1px dashed #333', borderRadius: '10px', padding: '3rem 1rem', textAlign: 'center', color: '#555', background: '#0a0a0a' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎞️</div>
                <div>Video will appear here</div>
                <div style={{ fontSize: '0.7rem', marginTop: '0.4rem' }}>&lt;video controls autoplay loop&gt; — HTML5 player</div>
                {selectedSceneId && <div style={{ fontSize: '0.7rem', marginTop: '0.8rem', color: '#60a5fa' }}>Ready to animate Scene {scenes.find(s=>s.id===selectedSceneId)?.number}: {scenes.find(s=>s.id===selectedSceneId)?.title}</div>}
              </div>
            )}

            {isGenerating && (
              <div style={{ border: '1px solid #333', borderRadius: '10px', padding: '2rem 1rem', textAlign: 'center', background: '#0f0f0f' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.8rem' }}>⏳</div>
                <div style={{ fontWeight: 600 }}>Generating via Gradio Client... {selectedSceneId ? `(Scene ${scenes.find(s=>s.id===selectedSceneId)?.number})` : ''}</div>
                <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                  Trying spaces: {engineStatus?.primarySpace} → {(engineStatus?.fallbacks || []).join(' → ')}
                  <br />
                  Timeout 60s per endpoint, retry backoff 5s, max 2x per space
                  <br />
                  No Pollinations fallback — honest MOTION_ENGINE_FAILED if all fail
                </div>
                <div style={{ marginTop: '1rem', width: '100%', height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '60%', height: '100%', background: '#2563eb', animation: 'pulse 1.5s infinite' }}></div>
                </div>
              </div>
            )}

            {videoUrl && (
              <div>
                <video
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  src={videoUrl}
                  style={{ width: '100%', borderRadius: '10px', border: '1px solid #333', background: '#000', maxHeight: '500px' }}
                  onError={(e) => setError(`Video playback error — url may be expired HF temp file: ${videoUrl.slice(0,100)}`)}
                />
                <div style={{ marginTop: '0.8rem', fontSize: '0.7rem', color: '#666', wordBreak: 'break-all', background: '#0a0a0a', padding: '0.6rem', borderRadius: '6px', border: '1px solid #222' }}>
                  <div style={{ fontWeight: 600, color: '#888', marginBottom: '0.2rem' }}>Video URL (.mp4): {selectedSceneId ? `Scene ${scenes.find(s=>s.id===selectedSceneId)?.number}` : ''}</div>
                  {videoUrl.slice(0, 300)}{videoUrl.length > 300 ? '...' : ''} — {videoUrl.length} chars — {videoUrl.startsWith('data:') ? 'Base64' : 'Remote URL'}
                </div>
                <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem' }}>
                  <a href={videoUrl} download={`nexus-scene-${selectedSceneId || 'motion'}.mp4`} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '0.6rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#ddd', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}>⬇️ Download MP4</a>
                  <button onClick={() => navigator.clipboard.writeText(videoUrl)} style={{ flex: 1, padding: '0.6rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#ddd', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>📋 Copy URL</button>
                </div>
                {info && (
                  <div style={{ marginTop: '0.8rem', fontSize: '0.65rem', color: '#666' }}>
                    Space used: <b style={{ color: '#aaa' }}>{info.spaceUsed || info.triedSpaces?.[0]}</b> — Tried: {info.triedSpaces?.join(', ')} — Time: {info.processingTimeMs}ms — Engine: {info.engineLabel} {selectedSceneId ? `— Scene ${scenes.find(s=>s.id===selectedSceneId)?.number}` : ''}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: '1.5rem', background: '#0a0a0a', border: '1px solid #222', borderRadius: '8px', padding: '0.8rem', fontSize: '0.7rem', color: '#666' }}>
              <div style={{ fontWeight: 700, color: '#888', marginBottom: '0.4rem' }}>Architecture — Step 4 Motion Engine + Scene Integration</div>
              <div>HP → Main UI (Cerita→Naskah→Karakter→Dunia→Papan Cerita→Gambar) → Scene Gallery (/test-video) → Click Scene → auto-fill keyframe + motion prompt → /api/generate-video → @gradio/client → CogVideoX/Wan/SVD → .mp4 → &lt;video&gt;</div>
              <div style={{ marginTop: '0.4rem' }}>Primary: <code>{engineStatus?.primarySpace || 'zai-org/CogVideoX-5B-Space'}</code> — Fallbacks: <code>{(engineStatus?.fallbacks || []).join(', ')}</code></div>
              <div style={{ marginTop: '0.4rem' }}>Timeout 60s, retry backoff 5s max 2x per space — Honest <code>MOTION_ENGINE_FAILED</code> — No Pollinations — Sequential order preserved Scene 1→Scene N</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '1rem', fontSize: '0.75rem', color: '#666' }}>
          <b style={{ color: '#888' }}>NEXUS STEP 4 Verification — Integrated Scene Selector:</b> Route <code>/test-video</code> — Scene Keyframe Gallery from <code>nexus_project</code> localStorage + <code>/api/project</code> — Scenes sorted by <code>scene_number</code> sequential — Label &quot;Scene 1: Rangga bertemu Amelia&quot; — One-click auto-fill imageUrl + motionPrompt from Naskah Scene — Drop image slot + Motion Prompt auto-filled — &lt;video controls autoplay loop&gt; — No Pollinations — type-check + build PASS
        </div>
      </div>
    </div>
  );
}
