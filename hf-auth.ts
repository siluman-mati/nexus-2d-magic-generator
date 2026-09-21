// Server-side only: resolve at call time, never expose or log the token.
export function getHuggingFaceToken(): string {
  const candidates = [
    process.env.HUGGINGFACE_API_KEY,
    process.env.HF_TOKEN,
    process.env.HUGGINGFACE_API_TOKEN,
    process.env.HUGGING_FACE_API_KEY,
    process.env.HUNGGING_FACE_API_KEY,
  ];
  return candidates.map(value => value?.trim()).find(value => !!value) || '';
}

export const HF_TOKEN_MISSING_MESSAGE =
  'Token Hugging Face belum dikonfigurasi. Isi HUGGINGFACE_API_KEY atau HF_TOKEN di .env.local atau Vercel Environment Variables untuk environment yang digunakan, lalu restart/redeploy.';
