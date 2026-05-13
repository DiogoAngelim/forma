import { Kysely } from 'kysely';
import type { Env } from '../config/env.js';
import type { Database as DatabaseSchema } from './schema.js';
export declare function createDb(env: Pick<Env, 'DATABASE_URL'>): Kysely<DatabaseSchema>;
//# sourceMappingURL=client.d.ts.map