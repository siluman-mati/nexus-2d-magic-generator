// NEXUS — Image Processing & Validation — No Fake Success, Explicit Remove.bg Status

import { validateImageBuffer } from './validation';
import { RemoveBgResult } from './types';

export interface ImageValidationResult {
  ok: boolean;
  mimeType: string;
  size: number;
  error?: string;
}

export async function validateProviderImage(imageUrl: string): Promise<ImageValidationResult> {
  if (!imageUrl) {
    return { ok: false, mimeType: '', size: 0, error: 'ImageUrl kosong — provider returned empty' };
  }

  // Check data URL
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!match) {
      return { ok: false, mimeType: '', size: 0, error: 'Invalid data URL format' };
    }
    const mime = match[1];
    const base64 = match[2];
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      return { ok: false, mimeType: mime, size: 0, error: 'Invalid base64' };
    }
    
    const bufValidation = validateImageBuffer(buffer, mime);
    if (!bufValidation.ok) {
      return { ok: false, mimeType: mime, size: buffer.length, error: bufValidation.errorMessage };
    }

    return { ok: true, mimeType: mime, size: buffer.length };
  }

  // Check http URL — fetch and validate
  if (imageUrl.startsWith('http')) {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        return { ok: false, mimeType: '', size: 0, error: `Failed to fetch image: ${res.status}` };
      }
      const mime = res.headers.get('content-type') || 'image/jpeg';
      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);
      
      const bufValidation = validateImageBuffer(buffer, mime);
      if (!bufValidation.ok) {
        return { ok: false, mimeType: mime, size: buffer.length, error: bufValidation.errorMessage };
      }
      
      return { ok: true, mimeType: mime, size: buffer.length };
    } catch (err: any) {
      return { ok: false, mimeType: '', size: 0, error: `Fetch error: ${err.message}` };
    }
  }

  return { ok: false, mimeType: '', size: 0, error: `Unknown imageUrl format: ${imageUrl.slice(0,50)}` };
}

export async function processRemoveBg(
  imageDataUrl: string,
  isCharacterAsset: boolean
): Promise<RemoveBgResult> {
  const start = Date.now();
  const apiKey = process.env.Removebg_API_KEY || process.env.REMOVE_BG_API_KEY || process.env.REMOVEBG_API_KEY;

  // Explicit status per spec
  if (!isCharacterAsset) {
    return {
      applied: false,
      status: 'SKIPPED_NOT_CHARACTER',
      imageUrl: imageDataUrl,
      originalImageUrl: imageDataUrl,
      processingTimeMs: Date.now() - start,
    };
  }

  if (!apiKey) {
    console.log('[remove.bg] SKIPPED_NO_KEY — Removebg_API_KEY not set');
    return {
      applied: false,
      status: 'SKIPPED_NO_KEY',
      imageUrl: imageDataUrl,
      originalImageUrl: imageDataUrl,
      processingTimeMs: Date.now() - start,
    };
  }

  try {
    let buffer: Buffer;
    let mimeType = 'image/png';

    if (imageDataUrl.startsWith('data:')) {
      const matches = imageDataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (!matches) {
        return {
          applied: false,
          status: 'FAILED_INVALID_IMAGE',
          imageUrl: imageDataUrl,
          originalImageUrl: imageDataUrl,
          error: 'Invalid data URL',
          processingTimeMs: Date.now() - start,
        };
      }
      mimeType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else if (imageDataUrl.startsWith('http')) {
      const resp = await fetch(imageDataUrl);
      if (!resp.ok) {
        return {
          applied: false,
          status: 'FAILED_NETWORK',
          imageUrl: imageDataUrl,
          originalImageUrl: imageDataUrl,
          error: `Fetch failed ${resp.status}`,
          processingTimeMs: Date.now() - start,
        };
      }
      const ab = await resp.arrayBuffer();
      buffer = Buffer.from(ab);
    } else {
      return {
        applied: false,
        status: 'FAILED_INVALID_IMAGE',
        imageUrl: imageDataUrl,
        originalImageUrl: imageDataUrl,
        error: 'Unknown image format',
        processingTimeMs: Date.now() - start,
      };
    }

    // Validate buffer before sending
    const bufCheck = validateImageBuffer(buffer, mimeType);
    if (!bufCheck.ok) {
      return {
        applied: false,
        status: 'FAILED_INVALID_IMAGE',
        imageUrl: imageDataUrl,
        originalImageUrl: imageDataUrl,
        error: bufCheck.errorMessage,
        processingTimeMs: Date.now() - start,
      };
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType } as any);
    formData.append('image_file', blob as any, 'character.png');
    formData.append('size', 'auto');

    console.log(`[remove.bg] Sending ${buffer.length} bytes`);

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData as any,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown');
      
      if (response.status === 402) {
        console.error(`[remove.bg] FAILED_QUOTA_EXCEEDED ${response.status}: ${errorText.slice(0,200)}`);
        return {
          applied: false,
          status: 'FAILED_QUOTA_EXCEEDED',
          imageUrl: imageDataUrl,
          originalImageUrl: imageDataUrl,
          error: `Quota exceeded ${response.status}: ${errorText.slice(0,200)}`,
          processingTimeMs: Date.now() - start,
        };
      }
      
      if (response.status === 429) {
        console.error(`[remove.bg] FAILED_RATE_LIMITED ${response.status}`);
        return {
          applied: false,
          status: 'FAILED_RATE_LIMITED',
          imageUrl: imageDataUrl,
          originalImageUrl: imageDataUrl,
          error: `Rate limited ${response.status}: ${errorText.slice(0,200)}`,
          processingTimeMs: Date.now() - start,
        };
      }

      return {
        applied: false,
        status: 'FAILED_UNKNOWN',
        imageUrl: imageDataUrl,
        originalImageUrl: imageDataUrl,
        error: `API ${response.status}: ${errorText.slice(0,200)}`,
        processingTimeMs: Date.now() - start,
      };
    }

    const resultBuffer = await response.arrayBuffer();
    const resultBase64 = Buffer.from(resultBuffer).toString('base64');
    const resultDataUrl = `data:image/png;base64,${resultBase64}`;

    console.log(`[remove.bg] SUCCESS — ${resultBuffer.byteLength} bytes PNG transparent`);

    return {
      applied: true,
      status: 'SUCCESS',
      imageUrl: resultDataUrl,
      originalImageUrl: imageDataUrl,
      processingTimeMs: Date.now() - start,
    };
  } catch (err: any) {
    console.error(`[remove.bg] FAILED_UNKNOWN: ${err.message}`);
    const isNetwork = err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network');
    return {
      applied: false,
      status: isNetwork ? 'FAILED_NETWORK' : 'FAILED_UNKNOWN',
      imageUrl: imageDataUrl,
      originalImageUrl: imageDataUrl,
      error: err.message,
      processingTimeMs: Date.now() - start,
    };
  }
}
