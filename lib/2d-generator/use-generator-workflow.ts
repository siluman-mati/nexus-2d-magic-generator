'use client';

import { useState, useRef, useCallback } from 'react';
import { GenerationState, ErrorCode, createInitialJobState, transitionState, getStateProgress } from './state-machine';
import { FinalGenerationOutput } from './types';

export interface GeneratorWorkflowState {
  jobId: string | null;
  requestId: string | null;
  state: GenerationState;
  progress: number;
  errorCode?: ErrorCode;
  errorMessage?: string;
  output?: FinalGenerationOutput;
  isGenerating: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isCancelled: boolean;
  attempt: number;
}

export interface UseGeneratorWorkflowOptions {
  projectId: string;
  onStateChange?: (state: GenerationState, progress: number) => void;
  onCompleted?: (output: FinalGenerationOutput) => void;
  onFailed?: (errorCode: ErrorCode, errorMessage: string) => void;
}

export function useGeneratorWorkflow(options: UseGeneratorWorkflowOptions) {
  const [workflowState, setWorkflowState] = useState<GeneratorWorkflowState>({
    jobId: null,
    requestId: null,
    state: 'IDLE',
    progress: 0,
    isGenerating: false,
    isCompleted: false,
    isFailed: false,
    isCancelled: false,
    attempt: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const updateState = useCallback((newState: GenerationState, extra?: Partial<GeneratorWorkflowState>) => {
    setWorkflowState(prev => {
      const transition = transitionState(
        {
          jobId: prev.jobId || `job_${Date.now()}`,
          projectId: options.projectId,
          state: prev.state,
          progress: prev.progress,
          attempt: prev.attempt,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          visualStyle: 'anime',
        } as any,
        newState,
        {
          progress: getStateProgress(newState),
          ...extra,
        } as any
      );

      if (!transition.ok) {
        console.error(`[useGeneratorWorkflow] Invalid transition ${prev.state} → ${newState}: ${transition.error}`);
        return prev;
      }

      const updated: GeneratorWorkflowState = {
        ...prev,
        state: newState,
        progress: getStateProgress(newState),
        isGenerating: ['VALIDATING', 'PLANNING', 'GENERATING', 'PROCESSING', 'VERIFYING', 'SAVING', 'RETRYING'].includes(newState),
        isCompleted: newState === 'COMPLETED',
        isFailed: newState === 'FAILED',
        isCancelled: newState === 'CANCELLED',
        ...extra,
      };

      options.onStateChange?.(newState, updated.progress);

      if (newState === 'COMPLETED' && updated.output) {
        options.onCompleted?.(updated.output);
      }
      if (newState === 'FAILED' && updated.errorCode) {
        options.onFailed?.(updated.errorCode as ErrorCode, updated.errorMessage || 'Unknown error');
      }

      return updated;
    });
  }, [options]);

  const generate = useCallback(async (params: {
    characterData?: any;
    worldSetting?: string;
    prompt?: string;
    visualStyle?: string;
    theme?: string;
    storyContext?: string;
    mode?: string;
    timeOfDay?: string;
    weather?: string;
  }) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Cancel previous if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setWorkflowState({
      jobId,
      requestId,
      state: 'IDLE',
      progress: 0,
      isGenerating: false,
      isCompleted: false,
      isFailed: false,
      isCancelled: false,
      attempt: 0,
    });

    try {
      updateState('VALIDATING');

      // Simulate validation phase
      await new Promise(r => setTimeout(r, 100));
      if (abortController.signal.aborted) {
        updateState('CANCELLED');
        return { ok: false, errorCode: 'CANCELLED', state: 'CANCELLED' as GenerationState };
      }

      updateState('PLANNING');
      await new Promise(r => setTimeout(r, 100));
      if (abortController.signal.aborted) {
        updateState('CANCELLED');
        return { ok: false, errorCode: 'CANCELLED', state: 'CANCELLED' as GenerationState };
      }

      updateState('GENERATING', { jobId, requestId, attempt: 1 });

      // Actual generation via API
      const response = await fetch('/api/generate-hf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: options.projectId,
          characterData: params.characterData,
          worldSetting: params.worldSetting,
          prompt: params.prompt,
          visualStyle: params.visualStyle || 'anime',
          theme: params.theme,
          storyContext: params.storyContext,
          mode: params.mode,
          timeOfDay: params.timeOfDay,
          weather: params.weather,
          requestId,
          jobId,
        }),
        signal: abortController.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        // No fake success — real failure
        const errorCode = data.errorCode || 'UNKNOWN_ERROR';
        const errorMessage = data.errorMessage || data.error || 'Generation failed';

        updateState('FAILED', {
          jobId: data.jobId || jobId,
          requestId: data.requestId || requestId,
          errorCode: errorCode as any,
          errorMessage,
        });

        return { ok: false, errorCode, errorMessage, state: 'FAILED' as GenerationState, jobId, requestId };
      }

      updateState('PROCESSING');
      await new Promise(r => setTimeout(r, 200));

      updateState('VERIFYING');
      await new Promise(r => setTimeout(r, 100));

      updateState('SAVING');
      await new Promise(r => setTimeout(r, 100));

      // Completed with real image
      updateState('COMPLETED', {
        jobId: data.jobId || jobId,
        requestId: data.requestId || requestId,
        output: data as any,
        progress: 100,
      });

      return { ok: true, output: data, state: 'COMPLETED' as GenerationState, jobId, requestId };

    } catch (err: any) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        updateState('CANCELLED', { errorCode: 'CANCELLED' as any, errorMessage: 'Cancelled by user' });
        return { ok: false, errorCode: 'CANCELLED', errorMessage: 'Cancelled', state: 'CANCELLED' as GenerationState, jobId, requestId };
      }

      const errorMessage = err.message || 'Unknown error';
      updateState('FAILED', {
        jobId,
        requestId,
        errorCode: 'UNKNOWN_ERROR' as any,
        errorMessage,
      });

      return { ok: false, errorCode: 'UNKNOWN_ERROR', errorMessage, state: 'FAILED' as GenerationState, jobId, requestId };
    }
  }, [options, updateState]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      updateState('CANCELLED', { errorCode: 'CANCELLED' as any, errorMessage: 'Cancelled by user' });
    }
  }, [updateState]);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setWorkflowState({
      jobId: null,
      requestId: null,
      state: 'IDLE',
      progress: 0,
      isGenerating: false,
      isCompleted: false,
      isFailed: false,
      isCancelled: false,
      attempt: 0,
    });
  }, []);

  return {
    ...workflowState,
    generate,
    cancel,
    reset,
  };
}
