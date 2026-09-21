import { NextResponse } from 'next/server';
import { jobManager } from '@/lib/2d-generator/job-manager';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { jobId, userId } = body;

    if (!jobId) {
      return NextResponse.json({
        ok: false,
        errorCode: 'INVALID_INPUT',
        errorMessage: 'jobId wajib',
      }, { status: 400 });
    }

    const result = jobManager.cancelJob(jobId, userId || 'anonymous');

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: result.error,
      }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      jobId,
      state: 'CANCELLED',
      message: `Job ${jobId} cancelled`,
    });

  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      errorCode: 'UNKNOWN_ERROR',
      errorMessage: err.message,
    }, { status: 500 });
  }
}
