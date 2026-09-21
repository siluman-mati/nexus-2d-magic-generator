import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHuggingFaceToken } from '../2d-generator/hf-auth';
import { generateMotionVideo } from '../2d-generator/motion-engine';
import { POST } from '../../app/api/generate-hf/route';
import { POST as videoPOST } from '../../app/api/generate-video/route';
import { GET as healthGET } from '../../app/api/health/route';
import { GET as nexusGET, dynamic } from '../../app/api/nexus/health/route';
import { Client } from '@gradio/client';

vi.mock('@gradio/client', () => ({
  Client: { connect: vi.fn() },
  handle_file: vi.fn(),
}));

const keys = [
  'HUGGINGFACE_API_KEY', 'HF_TOKEN', 'HUGGINGFACE_API_TOKEN',
  'HUGGING_FACE_API_KEY', 'HUNGGING_FACE_API_KEY',
];

describe('HF token handling and NEXUS health alias', () => {
  beforeEach(() => {
    for (const key of keys) vi.stubEnv(key, '');
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('treats missing or whitespace-only tokens as unconfigured', () => {
    expect(getHuggingFaceToken()).toBe('');
    for (const key of keys) vi.stubEnv(key, ' \t\n');
    expect(getHuggingFaceToken()).toBe('');
  });

  it('prefers the canonical key, trims it, and reads changes at call time', () => {
    vi.stubEnv('HUGGINGFACE_API_KEY', ' hf_test_primary ');
    vi.stubEnv('HF_TOKEN', 'hf_test_alias');
    expect(getHuggingFaceToken()).toBe('hf_test_primary');
    vi.stubEnv('HUGGINGFACE_API_KEY', '   ');
    expect(getHuggingFaceToken()).toBe('hf_test_alias');
  });

  it.each(keys)('supports the existing %s alias', key => {
    vi.stubEnv(key, ' hf_test_placeholder ');
    expect(getHuggingFaceToken()).toBe('hf_test_placeholder');
  });

  it.each(['', ' \t'])('returns HTTP 503 / HF_TOKEN_MISSING before parsing or network work (%j)', async value => {
    for (const key of keys) vi.stubEnv(key, value);
    const response = await POST(new Request('http://localhost/api/generate-hf', {
      method: 'POST', body: 'not-json',
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false, errorCode: 'HF_TOKEN_MISSING', hasHuggingFaceKey: false, retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts HF_TOKEN and proceeds to normal input validation', async () => {
    vi.stubEnv('HF_TOKEN', 'hf_test_alias');
    const response = await POST(new Request('http://localhost/api/generate-hf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ errorCode: 'INVALID_INPUT' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['', ' \t'])('stops motion before image download or Gradio connection (%j)', async value => {
    for (const key of keys) vi.stubEnv(key, value);
    const result = await generateMotionVideo({
      imageUrl: 'https://example.invalid/input.png', motionPrompt: 'Slow camera pan',
    });
    expect(result).toMatchObject({
      ok: false, errorCode: 'HF_TOKEN_MISSING', retryable: false, triedSpaces: [],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(Client.connect).not.toHaveBeenCalled();
  });

  it('accepts HF_TOKEN in motion and proceeds to normal input validation', async () => {
    vi.stubEnv('HF_TOKEN', 'hf_test_alias');
    const result = await generateMotionVideo({ imageUrl: '', motionPrompt: '' });
    expect(result.errorCode).toBe('INVALID_INPUT');
    expect(fetch).not.toHaveBeenCalled();
    expect(Client.connect).not.toHaveBeenCalled();
  });

  it('propagates the missing-token error through the video API as HTTP 503', async () => {
    const response = await videoPOST(new Request('http://localhost/api/generate-video', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: 'https://example.invalid/input.png', motionPrompt: 'Pan slowly' }),
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, errorCode: 'HF_TOKEN_MISSING' });
    expect(fetch).not.toHaveBeenCalled();
    expect(Client.connect).not.toHaveBeenCalled();
  });

  it('aliases the exact canonical GET handler and disables static health caching', async () => {
    expect(nexusGET).toBe(healthGET);
    expect(dynamic).toBe('force-dynamic');
    const response = await nexusGET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.image_engine.hasHuggingFaceKey).toBe(false);
    vi.stubEnv('HF_TOKEN', 'hf_test_alias');
    const configured = await nexusGET();
    expect((await configured.json()).image_engine.hasHuggingFaceKey).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
