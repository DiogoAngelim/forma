import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { loadEnv } from '../config/env.js';
import { createDb } from './client.js';
const env = loadEnv();
const db = createDb(env);
const migration = await readFile(resolve(process.cwd(), '../../migrations/001_initial_sqlite.sql'), 'utf8');
const statements = migration.split(';').map(s => s.trim()).filter(s => s.length > 0);
for (const statement of statements) {
    await sql.raw(statement).execute(db);
}
await db.destroy();
//# sourceMappingURL=migrate.js.map