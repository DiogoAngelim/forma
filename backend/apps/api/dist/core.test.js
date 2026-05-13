import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { createAiProvider } from './ai/providers.js';
import { hashPassword, verifyPassword } from './auth/password.js';
import { loadEnv } from './config/env.js';
import { ProjectEventBroker, serializeSse } from './events/broker.js';
import { buildExportArtifact } from './exports/builder.js';
import { buildIframePreview } from './previews/preview.js';
import { assertZipUpload, extractZipBundle } from './uploads/zip.js';
const output = {
    id: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000002',
    sessionId: '00000000-0000-4000-8000-000000000003',
    htmlEntry: 'index.html',
    blocks: [{ id: 'block-1', name: 'core/group' }],
    markup: '<main><script>alert(1)</script><p>Hello</p></main>',
    metadata: { styleTokens: { color: 'red' }, tailwindConfig: { theme: { extend: { colors: {} } } } },
    artifactKeys: [],
    createdAt: new Date().toISOString()
};
describe('api core modules', () => {
    it('validates env and passwords', () => {
        const env = loadEnv({
            DATABASE_URL: 'https://db.example',
            R2_ACCOUNT_ID: 'account',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'secret',
            R2_BUCKET: 'bucket',
            R2_PUBLIC_URL: 'https://cdn.example',
            JWT_SECRET: 'x'.repeat(32),
            APP_URL: 'https://app.example',
            FRONTEND_URL: 'https://frontend.example',
            API_URL: 'https://api.example',
            GOOGLE_CLIENT_ID: 'google-client-id',
            GOOGLE_CLIENT_SECRET: 'google-client-secret'
        });
        const hash = hashPassword('password123');
        expect(env.PORT).toBe(3000);
        expect(verifyPassword('password123', hash)).toBe(true);
        expect(verifyPassword('nope', hash)).toBe(false);
        expect(verifyPassword('password123', 'bad')).toBe(false);
    });
    it('serializes and broadcasts project events', async () => {
        const broker = new ProjectEventBroker();
        const seen = [];
        const unsubscribe = broker.subscribe(output.projectId, (event) => seen.push(event.event));
        const event = await broker.publish(output.projectId, 'preview.updated', { url: 'https://cdn.example/preview' });
        unsubscribe();
        await broker.publish(output.projectId, 'export.ready', { url: 'ignored' });
        expect(seen).toEqual(['preview.updated']);
        expect(serializeSse(event)).toContain('event: preview.updated');
        const inserted = [];
        const dbBroker = new ProjectEventBroker({
            insertInto: () => ({
                values: (value) => ({
                    execute: async () => inserted.push(value)
                })
            })
        });
        await dbBroker.publish(output.projectId, 'export.ready', {});
        expect(inserted).toHaveLength(1);
    });
    it('builds previews and export artifacts', async () => {
        expect(buildIframePreview(output)).not.toContain('<script>');
        expect((await buildExportArtifact(output, { type: 'style_tokens' })).filename).toBe('style-tokens.json');
        expect((await buildExportArtifact({ ...output, metadata: {} }, { type: 'style_tokens' })).body).toBe('{}');
        expect((await buildExportArtifact(output, { type: 'tailwind_config' })).filename).toBe('tailwind.config.js');
        expect((await buildExportArtifact({ ...output, metadata: {} }, { type: 'tailwind_config' })).body).toContain('content');
        expect((await buildExportArtifact(output, { type: 'blocks_only' })).filename).toBe('blocks.json');
        expect((await buildExportArtifact(output, { type: 'block_library' })).filename).toBe('block-library.json');
        const zipBuffer = await new JSZip().file('block.js', 'console.log("block");').generateAsync({ type: 'nodebuffer' });
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(zipBuffer), { status: 200, headers: { 'content-type': 'application/zip' } })));
        const pluginZip = await buildExportArtifact({ ...output, metadata: { ...output.metadata, pluginZipUrl: 'https://cdn.example/plugin.zip' } }, { type: 'plugin_zip' });
        expect(pluginZip.contentType).toBe('application/zip');
        const zip = await JSZip.loadAsync(pluginZip.body);
        expect(zip.file('block.js')).toBeDefined();
        expect(zip.file('plugin.json')).toBeNull();
        vi.restoreAllMocks();
    });
    it('extracts only structured zip bundles', async () => {
        const zip = new JSZip();
        zip.file('index.html', '<main>Hi</main>');
        zip.file('styles.css', 'main{display:block}');
        zip.file('__MACOSX/ignored', '');
        const buffer = await zip.generateAsync({ type: 'nodebuffer' });
        assertZipUpload('bundle.zip', 'application/zip');
        assertZipUpload('bundle.zip', 'application/x-zip-compressed');
        assertZipUpload('bundle.zip', 'application/octet-stream');
        expect(() => assertZipUpload('index.html', 'text/html')).toThrow();
        expect(() => assertZipUpload(undefined, undefined)).toThrow();
        await expect(extractZipBundle(buffer)).resolves.toHaveLength(2);
        const files = await extractZipBundle(buffer);
        expect(files.map((file) => file.mime)).toEqual(['text/html', 'text/css']);
        const bad = new JSZip();
        bad.file('style.css', '');
        await expect(extractZipBundle(await bad.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow();
        const mimes = ['script.js', 'icon.svg', 'image.png', 'photo.jpg', 'photo.jpeg', 'asset.webp', 'tailwind.config.ts', 'file.bin'];
        const rich = new JSZip();
        rich.file('index.html', '');
        for (const path of mimes)
            rich.file(path, '');
        expect((await extractZipBundle(await rich.generateAsync({ type: 'nodebuffer' }))).map((file) => file.mime)).toContain('image/webp');
    });
    it('only returns AI suggestions when OpenAI is configured', async () => {
        const disabledProvider = createAiProvider({});
        const anthropicOnlyProvider = createAiProvider({ anthropicKey: 'anthropic-key' });
        const disabledSuggestions = await disabledProvider.suggest({
            projectId: output.projectId,
            output,
            analysis: {
                reusableBlocks: [{ id: 'a' }],
                layoutBlocks: [],
                sectionBlocks: [],
                textBlocks: [],
                mediaBlocks: [],
                navigationBlocks: [],
                footerBlocks: [],
                heroBlocks: [],
                cardBlocks: [],
                pricingBlocks: [],
                ctaBlocks: [],
                typography: {},
                colors: {},
                structure: {}
            }
        });
        expect(disabledSuggestions).toEqual([]);
        await expect(anthropicOnlyProvider.suggest({
            projectId: output.projectId,
            output,
            analysis: {
                reusableBlocks: [{ id: 'a' }],
                layoutBlocks: [],
                sectionBlocks: [],
                textBlocks: [],
                mediaBlocks: [],
                navigationBlocks: [],
                footerBlocks: [],
                heroBlocks: [],
                cardBlocks: [],
                pricingBlocks: [],
                ctaBlocks: [],
                typography: {},
                colors: {},
                structure: {}
            }
        })).resolves.toEqual([]);
        const openAiSuggestions = await createAiProvider({ openAiKey: 'openai-key' }).suggest({
            projectId: output.projectId,
            output,
            analysis: {
                reusableBlocks: [{ id: 'a' }],
                layoutBlocks: [],
                sectionBlocks: [],
                textBlocks: [],
                mediaBlocks: [],
                navigationBlocks: [],
                footerBlocks: [],
                heroBlocks: [],
                cardBlocks: [],
                pricingBlocks: [],
                ctaBlocks: [],
                typography: {},
                colors: {},
                structure: {}
            }
        });
        expect(openAiSuggestions[0]?.rationale).toContain('automatically');
    });
});
//# sourceMappingURL=core.test.js.map