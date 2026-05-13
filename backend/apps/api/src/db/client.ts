import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { Env } from '../config/env.js';
import type { Database as DatabaseSchema } from './schema.js';

export function createDb(env: Pick<Env, 'DATABASE_URL'>): Kysely<DatabaseSchema> {
  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: new Database(env.DATABASE_URL.replace('sqlite:', ''))
    })
  });
}
