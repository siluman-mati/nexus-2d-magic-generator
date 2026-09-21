// NEXUS — Concurrency, Rate Limit, Idempotency, Cancellation

import { ErrorCode } from './state-machine';

export interface JobEntry {
  jobId: string;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  createdAt: number;
  abortController: AbortController;
}

class JobManager {
  private jobs: Map<string, JobEntry> = new Map();
  private userConcurrency: Map<string, number> = new Map();
  private userRateLimit: Map<string, { count: number; windowStart: number }> = new Map();
  private readonly MAX_CONCURRENT_PER_USER = 3;
  private readonly MAX_REQUESTS_PER_MINUTE = 20;
  private readonly RATE_WINDOW_MS = 60 * 1000;
  private readonly IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

  generateIdempotencyKey(params: { projectId: string; characterId?: string; prompt: string; visualStyle: string }): string {
    const str = `${params.projectId}:${params.characterId || 'none'}:${params.prompt.slice(0,100)}:${params.visualStyle}`;
    // Simple hash
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `idem_${Math.abs(hash)}_${Date.now()}`;
  }

  checkDuplicate(idempotencyKey: string): { isDuplicate: boolean; existingJobId?: string } {
    for (const [jobId, entry] of this.jobs) {
      if (entry.idempotencyKey === idempotencyKey) {
        const age = Date.now() - entry.createdAt;
        if (age < this.IDEMPOTENCY_TTL_MS) {
          return { isDuplicate: true, existingJobId: jobId };
        }
      }
    }
    return { isDuplicate: false };
  }

  checkRateLimit(userId: string): { allowed: boolean; errorCode?: ErrorCode; errorMessage?: string } {
    const now = Date.now();
    const entry = this.userRateLimit.get(userId);

    if (!entry) {
      this.userRateLimit.set(userId, { count: 1, windowStart: now });
      return { allowed: true };
    }

    const windowAge = now - entry.windowStart;
    if (windowAge > this.RATE_WINDOW_MS) {
      // Reset window
      this.userRateLimit.set(userId, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (entry.count >= this.MAX_REQUESTS_PER_MINUTE) {
      return {
        allowed: false,
        errorCode: 'RATE_LIMITED',
        errorMessage: `Rate limit exceeded: ${this.MAX_REQUESTS_PER_MINUTE} requests per minute`,
      };
    }

    entry.count++;
    return { allowed: true };
  }

  checkConcurrency(userId: string): { allowed: boolean; errorCode?: ErrorCode; errorMessage?: string } {
    const current = this.userConcurrency.get(userId) || 0;
    if (current >= this.MAX_CONCURRENT_PER_USER) {
      return {
        allowed: false,
        errorCode: 'RATE_LIMITED',
        errorMessage: `Concurrency limit exceeded: max ${this.MAX_CONCURRENT_PER_USER} concurrent generations per user`,
      };
    }
    return { allowed: true };
  }

  createJob(params: { jobId: string; projectId: string; userId: string; idempotencyKey: string }): { ok: boolean; errorCode?: ErrorCode; errorMessage?: string; entry?: JobEntry } {
    const rateCheck = this.checkRateLimit(params.userId);
    if (!rateCheck.allowed) {
      return { ok: false, errorCode: rateCheck.errorCode, errorMessage: rateCheck.errorMessage };
    }

    const concurrencyCheck = this.checkConcurrency(params.userId);
    if (!concurrencyCheck.allowed) {
      return { ok: false, errorCode: concurrencyCheck.errorCode, errorMessage: concurrencyCheck.errorMessage };
    }

    const duplicateCheck = this.checkDuplicate(params.idempotencyKey);
    if (duplicateCheck.isDuplicate) {
      return {
        ok: false,
        errorCode: 'DUPLICATE_REQUEST',
        errorMessage: `Duplicate request detected — existing job ${duplicateCheck.existingJobId} — idempotency key ${params.idempotencyKey}`,
      };
    }

    const entry: JobEntry = {
      jobId: params.jobId,
      projectId: params.projectId,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      createdAt: Date.now(),
      abortController: new AbortController(),
    };

    this.jobs.set(params.jobId, entry);
    this.userConcurrency.set(params.userId, (this.userConcurrency.get(params.userId) || 0) + 1);

    console.log(`[JobManager] Created job ${params.jobId} for user ${params.userId} — concurrency ${(this.userConcurrency.get(params.userId) || 0)}`);

    return { ok: true, entry };
  }

  getAbortSignal(jobId: string): AbortSignal | null {
    const entry = this.jobs.get(jobId);
    return entry?.abortController.signal || null;
  }

  cancelJob(jobId: string, userId: string): { ok: boolean; error?: string } {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return { ok: false, error: `Job ${jobId} not found` };
    }
    if (entry.userId !== userId) {
      return { ok: false, error: `User ${userId} not authorized to cancel job ${jobId}` };
    }

    entry.abortController.abort();
    this.jobs.delete(jobId);
    const current = this.userConcurrency.get(userId) || 1;
    this.userConcurrency.set(userId, Math.max(0, current - 1));

    console.log(`[JobManager] Cancelled job ${jobId} for user ${userId}`);

    return { ok: true };
  }

  completeJob(jobId: string, userId: string): void {
    const entry = this.jobs.get(jobId);
    if (entry) {
      this.jobs.delete(jobId);
      const current = this.userConcurrency.get(userId) || 1;
      this.userConcurrency.set(userId, Math.max(0, current - 1));
      console.log(`[JobManager] Completed job ${jobId} — concurrency now ${this.userConcurrency.get(userId)}`);
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [jobId, entry] of this.jobs) {
      const age = now - entry.createdAt;
      if (age > this.IDEMPOTENCY_TTL_MS * 2) {
        this.jobs.delete(jobId);
        const current = this.userConcurrency.get(entry.userId) || 1;
        this.userConcurrency.set(entry.userId, Math.max(0, current - 1));
      }
    }
    
    // Cleanup rate limit windows older than 2x window
    for (const [userId, entry] of this.userRateLimit) {
      if (now - entry.windowStart > this.RATE_WINDOW_MS * 2) {
        this.userRateLimit.delete(userId);
      }
    }
  }
}

export const jobManager = new JobManager();

// Periodic cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => jobManager.cleanup(), 5 * 60 * 1000);
}
