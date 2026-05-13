import { randomUUID } from 'node:crypto';
export class ProjectEventBroker {
    db;
    listeners = new Map();
    constructor(db) {
        this.db = db;
    }
    subscribe(projectId, listener) {
        const listeners = this.listeners.get(projectId) ?? new Set();
        listeners.add(listener);
        this.listeners.set(projectId, listeners);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0)
                this.listeners.delete(projectId);
        };
    }
    async publish(projectId, event, data) {
        const payload = {
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
export function serializeSse(event) {
    return `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;
}
//# sourceMappingURL=broker.js.map