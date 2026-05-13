import { createDb } from './db/client.js';
import { loadEnv } from './config/env.js';
import { createR2Storage } from './storage/r2.js';
import { buildApp } from './http/app.js';
const env = loadEnv();
const db = createDb(env);
const storage = createR2Storage(env);
const app = await buildApp({ env, db, storage });
if (process.env.VERCEL !== '1') {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
}
export default app;
//# sourceMappingURL=server.js.map