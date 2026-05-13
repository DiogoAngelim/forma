import { describe, expect, it } from 'vitest';
import { AppError, processingSessionSchema, sseEventSchema } from './index.js';

describe('shared contracts', () => {
  it('validates processing sessions', () => {
    const parsed = processingSessionSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      status: 'running',
      currentStage: 'uploaded',
      progress: 10,
      startedAt: new Date().toISOString()
    });

    expect(parsed.logs).toEqual([]);
    expect(parsed.metadata).toEqual({});
  });

  it('rejects unknown SSE events', () => {
    expect(() =>
      sseEventSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000002',
        event: 'socket.message',
        data: {},
        createdAt: new Date().toISOString()
      })
    ).toThrow();
  });

  it('carries structured error metadata', () => {
    const error = new AppError(422, 'invalid_upload', 'Only ZIP bundles are supported', {
      mime: 'text/html'
    });

    expect(error.statusCode).toBe(422);
    expect(error.details).toEqual({ mime: 'text/html' });
  });
});
