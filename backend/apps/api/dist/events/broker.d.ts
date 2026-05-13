import type { Kysely } from 'kysely';
import type { ProjectEvent, SseEventName } from '@forma/shared';
import type { Database } from '../db/schema.js';
type Listener = (event: ProjectEvent) => void;
export declare class ProjectEventBroker {
    private readonly db?;
    private readonly listeners;
    constructor(db?: Kysely<Database> | undefined);
    subscribe(projectId: string, listener: Listener): () => void;
    publish(projectId: string, event: SseEventName, data: Record<string, unknown>): Promise<ProjectEvent>;
}
export declare function serializeSse(event: ProjectEvent): string;
export {};
//# sourceMappingURL=broker.d.ts.map