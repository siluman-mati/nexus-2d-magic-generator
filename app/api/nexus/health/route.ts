// Keep health status live; Next.js route config must be statically analyzable.
export const dynamic = 'force-dynamic';

// Reuse the canonical handler directly, without an internal HTTP request.
export { GET } from '../../health/route';
