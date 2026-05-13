import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
export function createR2Storage(env) {
    // For development, use local file storage
    const storageDir = join(process.cwd(), 'storage');
    return {
        async putObject(key, body, contentType) {
            const filePath = join(storageDir, key);
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, body);
            return {
                key,
                url: `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
            };
        }
    };
}
//# sourceMappingURL=r2.js.map