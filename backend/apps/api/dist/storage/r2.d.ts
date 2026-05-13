import type { Env } from '../config/env.js';
export type ObjectStorage = {
    putObject: (key: string, body: Buffer | string, contentType: string) => Promise<{
        key: string;
        url: string;
    }>;
};
export declare function createR2Storage(env: Env): ObjectStorage;
//# sourceMappingURL=r2.d.ts.map