import { type FastifyInstance } from 'fastify';
import { type Kysely } from 'kysely';
import type { Env } from '../config/env.js';
import type { Database } from '../db/schema.js';
import { ProjectEventBroker } from '../events/broker.js';
import type { ObjectStorage } from '../storage/r2.js';
type BuildAppDeps = {
    env: Env;
    db: Kysely<Database>;
    storage: ObjectStorage;
    events?: ProjectEventBroker;
};
export declare function buildApp(deps: BuildAppDeps): Promise<FastifyInstance>;
declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: unknown) => Promise<void>;
    }
}
export {};
//# sourceMappingURL=app.d.ts.map