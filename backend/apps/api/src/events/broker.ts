import type { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { ProjectEvent, SseEventName } from '@forma/shared';
import type { Database } from '../db/schema.js';

type Listener = (event: ProjectEvent) => void;

export class ProjectEventBroker {
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly db?: Kysely<Database>) {}

  subscribe(projectId: string, listener: Listener): () => void {
    const listeners = this.listeners.get(projectId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(projectId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(projectId);
    };
  }

  async publish(projectId: string, event: SseEventName, data: Record<string, unknown>): Promise<ProjectEvent> {
    const payload: ProjectEvent = {
      id: randomUUID(),
      projectId,
      event,
      data,
      createdAt: new Date().toISOString()
    };

    await this.db
      ?.insertInto('project_events')
      .values({
        id: payload.id,
        project_id: payload.projectId,
        event: payload.event,
        data: JSON.stringify(payload.data),
        created_at: payload.createdAt
      })
      .execute();

    for (const listener of this.listeners.get(projectId) ?? []) {
      listener(payload);
    }

    return payload;
  }
}

export function serializeSse(event: ProjectEvent): string {
  return `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;
}
