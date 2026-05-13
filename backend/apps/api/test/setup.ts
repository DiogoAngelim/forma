import { readFile } from 'node:fs/promises';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { createDb } from '../src/db/client.js';

export default async function setup() {
  // Remove existing test DB
  try {
    await unlink('test.db');
  } catch { }

  const db = createDb({ DATABASE_URL: 'sqlite:test.db' });
  const migration = await readFile(resolve(process.cwd(), '../../migrations/001_initial_sqlite.sql'), 'utf8');

  const statements = migration.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const statement of statements) {
    if (statement) {
      await sql.raw(statement).execute(db);
    }
  }

  await db.destroy();
}