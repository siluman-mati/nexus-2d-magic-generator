// lib/ai/types.ts - Core types for NEXUS Brain - POLLINATIONS REMOVED per integrity audit
export type ProviderId = 'groq' | 'openrouter' | 'google' | 'local' | 'ollama' | 'gemini' | 'gemini-legacy' | 'free-llm' | 'hf-text'
export type ProviderRole = 'PRIMARY' | 'FALLBACK_CLOUD' | 'FALLBACK_LOCAL' | 'FALLBACK_FREE' | 'LEGACY'
export interface ProviderConfig { id: ProviderId; name: string; role: ProviderRole; enabled: boolean; configured: boolean; model: string | null; status: 'READY' | 'UNCONFIGURED' | 'ERROR' | 'DISABLED'; reason?: string; }
export interface NexusGenerateOptions { prompt: string; systemPrompt?: string; temperature?: number; maxTokens?: number; preferredModel?: string; requestId?: string; engine?: string; }
export interface NexusGenerateResult { ok: boolean; text?: string; json?: any; provider: ProviderId; model: string; role: ProviderRole; fallbackChain: ProviderId[]; triedProviders: { id: ProviderId; status: string; error?: string }[]; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }; error?: string; nexusBrainUsed: boolean; }
export interface LegacyGenerateOptions { prompt: string; model?: string; }
export const NEXUS_PROVIDER_ORDER: ProviderId[] = ['groq', 'openrouter', 'google', 'local', 'free-llm']
export const FREE_FALLBACK_ORDER: ProviderId[] = ['free-llm', 'hf-text']
export const OPENROUTER_FREE_MODELS: string[] = ['meta-llama/llama-3.2-1b-instruct:free','meta-llama/llama-3.2-3b-instruct:free','google/gemma-2-9b-it:free','google/gemma-2-2b-it:free','qwen/qwen-2-7b-instruct:free','mistralai/mistral-7b-instruct:free','huggingfaceh4/zephyr-7b-beta:free','openchat/openchat-7b:free']
export const LEGACY_PROVIDERS: ProviderId[] = ['gemini', 'gemini-legacy']
export function isNexusProvider(id: ProviderId): boolean { return NEXUS_PROVIDER_ORDER.includes(id) }
export function isLegacyProvider(id: ProviderId): boolean { return LEGACY_PROVIDERS.includes(id) }
