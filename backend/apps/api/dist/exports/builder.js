import { generatePluginZipBuffer, generateReactZipBuffer } from '@forma/gutenberg-generator';
export async function buildExportArtifact(output, request) {
    if (request.type === 'style_tokens') {
        return jsonArtifact('style-tokens.json', output.metadata.styleTokens ?? {});
    }
    if (request.type === 'tailwind_config') {
        return {
            filename: 'tailwind.config.js',
            contentType: 'application/javascript',
            body: `export default ${JSON.stringify(output.metadata.tailwindConfig ?? { content: [], theme: { extend: {} } }, null, 2)};\n`
        };
    }
    if (request.type === 'blocks_only') {
        return jsonArtifact('blocks.json', [mergedPageBlock(output)]);
    }
    if (request.type === 'block_library') {
        return jsonArtifact('block-library.json', {
            projectId: output.projectId,
            blocks: [mergedPageBlock(output)],
            metadata: output.metadata
        });
    }
    if (request.type === 'plugin_zip') {
        return {
            filename: 'gutenberg-plugin.zip',
            contentType: 'application/zip',
            body: await generatePluginZipBuffer({
                html: mergedPageMarkup(output),
                projectId: output.projectId,
                sessionId: output.sessionId,
                uploadId: output.htmlEntry,
                assets: Array.isArray(output.metadata.assets)
                    ? output.metadata.assets.filter((asset) => Boolean(asset && typeof asset === 'object' && typeof asset.path === 'string' && typeof asset.mime === 'string' && typeof asset.size === 'number'))
                    : []
            })
        };
    }
    if (request.type === 'react') {
        const body = await generateReactZipBuffer({
            html: mergedPageMarkup(output),
            projectId: output.projectId,
            sessionId: output.sessionId,
            uploadId: output.htmlEntry,
            assets: Array.isArray(output.metadata.assets)
                ? output.metadata.assets.filter((asset) => Boolean(asset && typeof asset === 'object' && typeof asset.path === 'string' && typeof asset.mime === 'string' && typeof asset.size === 'number'))
                : []
        });
        return {
            filename: 'react-export.zip',
            contentType: 'application/zip',
            body
        };
    }
    throw new Error(`Unsupported export type: ${request.type}`);
}
function jsonArtifact(filename, value) {
    return {
        filename,
        contentType: 'application/json',
        body: JSON.stringify(value, null, 2)
    };
}
function mergedPageBlock(output) {
    const html = mergedPageMarkup(output);
    return {
        id: 'page',
        name: 'wp/forma-page',
        slug: 'forma-page',
        title: 'Forma Page',
        tagName: firstElementTagName(stripGutenbergBlockWrapper(html)) ?? 'main',
        originalHtml: stripGutenbergBlockWrapper(html),
        markup: html,
        sourcePath: output.htmlEntry,
        mergedFrom: output.blocks.map((block, index) => String(block.id ?? block.name ?? `block-${index + 1}`))
    };
}
function mergedPageMarkup(output) {
    const blockHtml = output.blocks
        .map((block) => firstString(block.markup, block.originalHtml, block.html, block.content))
        .filter((value) => Boolean(value && value.trim()))
        .map((value) => stripGutenbergBlockWrapper(value).trim())
        .join('\n\n');
    const html = blockHtml || stripGutenbergBlockWrapper(output.markup).trim() || output.markup;
    return `<!-- wp:wp/forma-page -->\n${html}\n<!-- /wp:wp/forma-page -->`;
}
function stripGutenbergBlockWrapper(markup) {
    const trimmed = markup.trim();
    const paired = trimmed.match(/^<!--\s*wp:[^>]+-->\s*([\s\S]*?)\s*<!--\s*\/wp:[^>]+-->\s*$/);
    return paired?.[1]?.trim() ?? trimmed;
}
function firstString(...values) {
    return values.find((value) => typeof value === 'string' && value.length > 0);
}
function firstElementTagName(html) {
    return html.match(/<([a-z][a-z0-9-]*)\b/i)?.[1]?.toLowerCase();
}
//# sourceMappingURL=builder.js.map