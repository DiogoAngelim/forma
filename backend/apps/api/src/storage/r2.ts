import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Env } from '../config/env.js';

export type ObjectStorage = {
  putObject: (key: string, body: Buffer | string, contentType: string) => Promise<{ key: string; url: string }>;
};

export function createR2Storage(env: Env): ObjectStorage {
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
