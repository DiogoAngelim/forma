import { config } from 'dotenv';
import { z } from 'zod';
config();
const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    R2_PUBLIC_URL: z.string().url(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    JWT_SECRET: z.string().min(32),
    APP_URL: z.string().url(),
    FRONTEND_URL: z.string().url(),
    API_URL: z.string().url(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.string().default('info'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(52_428_800),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional()
});
export function loadEnv(source = process.env) {
    return envSchema.parse(source);
}
//# sourceMappingURL=env.js.map