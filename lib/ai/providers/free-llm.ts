// lib/ai/providers/free-llm.ts — FREE LLM FALLBACK — HF TEXT ONLY — POLLINATIONS REMOVED per integrity audit
import { NexusGenerateOptions, NexusGenerateResult } from '../types'
import { getFreeLLMConfig } from '../../config'
import { fetchWithTimeout, safeLog, safeErrorLog } from '../provider-utils'

async function generateViaHuggingFaceText(prompt: string, systemPrompt: string | undefined, temperature: number, maxTokens: number, requestId: string): Promise<string> {
  const config = getFreeLLMConfig();
  if (!config.hfApiKey) throw new Error('HF API key not configured for HF Text fallback');
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:` : prompt;
  const modelsToTry = [config.hfModel, 'meta-llama/Llama-3.2-1B-Instruct', 'google/gemma-2-2b-it', 'Qwen/Qwen2.5-0.5B-Instruct', 'HuggingFaceH4/zephyr-7b-beta'];
  for (const model of modelsToTry) {
    try {
      safeLog('FREE-LLM', `Trying HF Text ${model} — Request: ${requestId}`);
      const url = `https://router.huggingface.co/hf-inference/models/${model}`;
      const body = { inputs: fullPrompt, parameters: { max_new_tokens: Math.min(maxTokens, 1024), temperature, return_full_text: false } };
      const response = await fetchWithTimeout(url, { method: 'POST', headers: { 'Authorization': `Bearer ${config.hfApiKey}`, 'Content-Type': 'application/json', 'x-wait-for-model': 'true' }, body: JSON.stringify(body) }, 40000);
      if (!response.ok) { const errText = await response.text().catch(() => response.statusText); safeErrorLog('FREE-LLM', `HF Text ${model} failed ${response.status}: ${errText.slice(0,200)} — Request: ${requestId}`); continue; }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json: any = await response.json();
        if (Array.isArray(json) && json[0]?.generated_text) { const text = json[0].generated_text; if (text && text.trim().length > 10) { safeLog('FREE-LLM', `HF Text ${model} SUCCESS array — ${text.length} chars — Request: ${requestId}`); return text; } }
        else if (json.generated_text) { if (json.generated_text.trim().length > 10) { safeLog('FREE-LLM', `HF Text ${model} SUCCESS object — ${json.generated_text.length} chars — Request: ${requestId}`); return json.generated_text; } }
        else if (json.error) { safeErrorLog('FREE-LLM', `HF Text ${model} JSON error: ${JSON.stringify(json).slice(0,200)} — Request: ${requestId}`); continue; }
      } else { const text = await response.text(); if (text && text.trim().length > 10) { safeLog('FREE-LLM', `HF Text ${model} SUCCESS text — ${text.length} chars — Request: ${requestId}`); return text; } }
    } catch (e: any) { safeErrorLog('FREE-LLM', `HF Text ${model} error: ${e.message} — Request: ${requestId}`); continue; }
  }
  throw new Error('HF Text all models failed — HF_PRIMARY_FAILED honest, no Pollinations');
}

export async function generateWithFreeLLM(options: NexusGenerateOptions): Promise<NexusGenerateResult> {
  const config = getFreeLLMConfig();
  const requestId = options.requestId || `free-llm-${Date.now()}`;
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 4096;
  safeLog('FREE-LLM', `Starting FREE LLM fallback — HF Text ONLY — NO POLLINATIONS — Request: ${requestId} — Engine: ${options.engine || 'unknown'}`);
  const triedProviders: { id: any; status: string; error?: string }[] = [];
  if (config.hfEnabled && config.hfApiKey) {
    try {
      const text = await generateViaHuggingFaceText(options.prompt, options.systemPrompt, temperature, maxTokens, requestId);
      if (text && text.trim().length > 10) {
        safeLog('FREE-LLM', `SUCCESS via HF Text — ${text.length} chars — Request: ${requestId}`);
        return { ok: true, text, provider: 'free-llm', model: config.hfModel, role: 'FALLBACK_FREE', fallbackChain: ['free-llm'], triedProviders: [{ id: 'free-llm', status: 'SUCCESS' }], nexusBrainUsed: true };
      }
    } catch (e: any) { safeErrorLog('FREE-LLM', `HF Text failed: ${e.message} — Request: ${requestId}`); triedProviders.push({ id: 'hf-text', status: 'FAILED', error: e.message?.slice(0,200) }); }
  }
  safeErrorLog('FREE-LLM', `ALL FREE LLM FAILED — honest FAILED — Request: ${requestId} — Tried: ${triedProviders.map(p=>`${p.id}:${p.status}`).join(' -> ')} — No Pollinations`);
  return { ok: false, text: '', error: `HF_PRIMARY_FAILED — All free LLM failed — ${triedProviders.map(p=>`${p.id}:${p.status}`).join(' -> ')} — No Pollinations fallback — honest FAILED`, provider: 'free-llm', model: 'hf-text', role: 'FALLBACK_FREE', fallbackChain: ['free-llm'], triedProviders, nexusBrainUsed: true } as any;
}

export function isFreeLLMConfigured(): boolean {
  const config = getFreeLLMConfig();
  return !!(config.hfApiKey && config.hfEnabled);
}
