'use client';
import { useState, useEffect } from 'react';

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleGenerate = async () => {
    if (!prompt || isLoading || cooldown > 0) return;
    setIsLoading(true); setErrorMsg(''); setImageUrl('');
    try {
      const res = await fetch('/api/generate-hf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, visualStyle: 'anime', projectId: 'proj_default', mode: 'full' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const code = data.errorCode || 'UNKNOWN_ERROR'
        const msg = data.errorMessage || data.error || 'Terjadi kesalahan'
        throw new Error(`${code}: ${msg} — State:${data.state} — Tried ${data.triedProviders?.length || data.triedSpaces?.length || 0} providers — No fake success`);
      }
      if (data.imageUrl) { setImageUrl(data.imageUrl); setCooldown(60); }
      else throw new Error('INVALID_OUTPUT: No imageUrl — No fake success');
    } catch (error: any) { setErrorMsg(error.message); } 
    finally { setIsLoading(false); }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-gray-900 text-white rounded-xl shadow-lg border border-gray-700 mt-8">
      <h2 className="text-2xl font-bold mb-4">🎨 Image Engine: Gradio Client FLUX.1-schnell (Dynamic)</h2>
      <p className="text-xs text-gray-400 mb-2">Sole engine: /api/generate-hf — Gradio Client @gradio/client Space black-forest-labs/FLUX.1-schnell 768x1024 steps 4 — dynamic environment from story source, background matching story description, aesthetic from active story — Negative: chinese temple, pagoda, curved oriental roof, chinese architecture, japanese shrine, hanfu, kimono — No ImageFX — No Pollinations — State Machine: IDLE | VALIDATING | PLANNING | GENERATING | PROCESSING | VERIFYING | SAVING | COMPLETED | FAILED | CANCELLED</p>
      <div className="flex flex-col gap-4">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Masukkan deskripsi adegan... dynamic background from story source, visual style prefix frontmost, no fake success" className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white resize-none h-24" disabled={isLoading || cooldown > 0} />
        <button onClick={handleGenerate} disabled={isLoading || cooldown > 0 || !prompt} className={`px-4 py-3 rounded-lg font-semibold ${(isLoading || cooldown > 0 || !prompt) ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {isLoading ? 'Memproses via Gradio FLUX (Dynamic)...' : cooldown > 0 ? `Tunggu ${cooldown} detik` : 'Generate Gambar via Gradio FLUX (Dynamic)'}
        </button>
        {errorMsg && <div className="p-3 bg-red-900 text-red-200 rounded-lg text-sm">{errorMsg}</div>}
        {imageUrl && <img src={imageUrl} alt="Hasil" className="w-full max-w-sm mx-auto rounded-lg shadow-2xl mt-4" />}
      </div>
    </div>
  );
}
