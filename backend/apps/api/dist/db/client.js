import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
export function createDb(env) {
    return new Kysely({
        dialect: new SqliteDialect({
            database: new Database(env.DATABASE_URL.replace('sqlite:', ''))
        })
    });
}
//# sourceMappingURL=client.js.map