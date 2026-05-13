import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { AppError } from '@forma/shared';
export function selectHtmlEntry(files) {
    const htmlFiles = files.filter((file) => file.path.toLowerCase().endsWith('.html'));
    const indexFile = htmlFiles.find((file) => /(^|\/)index\.html$/i.test(file.path));
    const selected = indexFile ?? htmlFiles[0];
    if (!selected) {
        throw new AppError(422, 'missing_html_entry', 'ZIP bundle must include at least one HTML file');
    }
    return selected;
}
export function selectHtmlEntries(files) {
    const htmlFiles = files.filter((file) => file.path.toLowerCase().endsWith('.html'));
    if (!htmlFiles.length) {
        throw new AppError(422, 'missing_html_entry', 'Bundle must include at least one HTML file');
    }
    return htmlFiles;
}
export function normalizeConverterOutput(raw, sourceHtml, blockIdentity) {
    if (typeof raw === 'string') {
        const markup = ensureGutenbergMarkup(raw);
        return {
            markup,
            blocks: extractBlocksFromMarkup(markup)
        };
    }
    if (raw && typeof raw === 'object') {
        const generatedFiles = toGeneratedFiles(raw);
        if (generatedFiles) {
            const completedGeneratedFiles = ensureUsableGeneratedFiles(generatedFiles, sourceHtml, blockIdentity);
            const markup = buildGeneratedBlockMarkup(completedGeneratedFiles, sourceHtml, blockIdentity);
            return {
                markup,
                blocks: extractBlocksFromGeneratedFiles(completedGeneratedFiles, sourceHtml),
                generatedFiles: completedGeneratedFiles,
                warnings: isUsableBlockJs(generatedFiles['block.js']) ? [] : ['html_to_gutenberg_missing_block_js_fallback_used']
            };
        }
        const value = raw;
        const markup = ensureGutenbergMarkup(firstString(value.markup, value.html, value.content) ?? sourceHtml);
        const blocks = Array.isArray(value.blocks) && value.blocks.length > 0
            ? value.blocks.map((block, index) => normalizeBlock(block, index))
            : extractBlocksFromMarkup(markup);
        return { markup, blocks };
    }
    const markup = ensureGutenbergMarkup(sourceHtml);
    return {
        markup,
        blocks: extractBlocksFromMarkup(markup)
    };
}
export async function generateGutenberg(input) {
    const entries = selectHtmlEntries(input.files);
    if (entries.length > 1) {
        return generateMultiPageGutenberg(input, entries);
    }
    const entry = selectHtmlEntry(input.files);
    const sourceHtml = entry.content.toString('utf8');
    const converter = input.converter ?? (await loadHtmlToGutenberg()); /* v8 ignore next -- default converter path requires external package integration */
    const blockIdentity = inferBlockIdentity(entry.path);
    // Create a temporary directory for the converter to write plugin files
    const tempDir = await mkdtemp(join(tmpdir(), 'forma-gutenberg-'));
    try {
        let raw;
        const warnings = [];
        try {
            raw = looksLikeGeneratedGutenbergJsx(sourceHtml)
                ? {}
                : await converter(sourceHtml, {
                    projectId: input.projectId,
                    uploadId: input.uploadId,
                    title: blockIdentity.title,
                    slug: blockIdentity.slug,
                    namespace: 'wp',
                    outputPath: tempDir,
                    writeFiles: true,
                    outputMode: 'legacy',
                    assets: input.files.map((file) => ({ path: file.path, mime: file.mime, size: file.size }))
                });
            if (looksLikeGeneratedGutenbergJsx(sourceHtml)) {
                warnings.push('html_to_gutenberg_generated_jsx_input_fallback_used');
            }
        }
        catch (error) {
            warnings.push('html_to_gutenberg_conversion_failed_fallback_used');
            raw = {};
        }
        let normalized = normalizeConverterOutput(raw, sourceHtml, { ...blockIdentity, namespace: 'wp' });
        if (!normalized.generatedFiles && warnings.some((warning) => warning.endsWith('_fallback_used'))) {
            const generatedFiles = ensureUsableGeneratedFiles({}, sourceHtml, { ...blockIdentity, namespace: 'wp' });
            normalized = {
                markup: buildGeneratedBlockMarkup(generatedFiles, sourceHtml, { ...blockIdentity, namespace: 'wp' }),
                blocks: extractBlocksFromGeneratedFiles(generatedFiles, sourceHtml),
                generatedFiles,
                warnings: ['html_to_gutenberg_missing_block_js_fallback_used']
            };
        }
        warnings.push(...(normalized.warnings ?? []));
        if (normalized.generatedFiles) {
            await writeGeneratedFilesToDirectory(tempDir, normalized.generatedFiles);
        }
        const sectionBlocks = splitHtmlIntoBlockSections(sourceHtml, { ...blockIdentity, namespace: 'wp' });
        const shouldExportMultipleBlocks = sectionBlocks.length > 1;
        if (shouldExportMultipleBlocks) {
            normalized = {
                ...normalized,
                markup: sectionBlocks.map((block) => `<!-- wp:${block.name} -->\n${block.html}\n<!-- /wp:${block.name} -->`).join('\n\n'),
                blocks: sectionBlocks.map((block) => ({
                    id: block.id,
                    name: block.name,
                    title: block.title,
                    tagName: block.tagName,
                    attributes: block.attributes,
                    originalHtml: block.html,
                    markup: `<!-- wp:${block.name} -->\n${block.html}\n<!-- /wp:${block.name} -->`,
                    sourcePath: entry.path
                }))
            };
        }
        const zipArtifact = shouldExportMultipleBlocks
            ? await createMultiBlockPluginZipArtifact(normalized.blocks, input.projectId, input.sessionId, input.artifactWriter, input.files)
            : await createPluginZipArtifact(tempDir, input.projectId, input.sessionId, input.artifactWriter, input.files, entry.path);
        const baseKey = `projects/${input.projectId}/sessions/${input.sessionId}/gutenberg`;
        const markupArtifact = await input.artifactWriter.putObject(`${baseKey}/output.html`, normalized.markup, 'text/html');
        const generatedFileArtifacts = await writeGeneratedFileArtifacts(baseKey, normalized.generatedFiles, input.artifactWriter);
        const styleTokens = extractStyleTokens(input.files, sourceHtml);
        const assets = extractAssets(input.files, sourceHtml);
        const metadata = {
            blocks: normalized.blocks,
            htmlEntry: entry.path,
            generatedFiles: generatedFileArtifacts,
            warnings,
            styleTokens,
            assets
        };
        const metadataArtifact = await input.artifactWriter.putObject(`${baseKey}/metadata.json`, JSON.stringify(metadata, null, 2), 'application/json');
        const artifactKeys = [markupArtifact.key, ...generatedFileArtifacts.map((artifact) => artifact.key), metadataArtifact.key];
        if (zipArtifact) {
            artifactKeys.push(zipArtifact.key);
        }
        return {
            id: randomUUID(),
            projectId: input.projectId,
            sessionId: input.sessionId,
            htmlEntry: entry.path,
            blocks: normalized.blocks,
            markup: normalized.markup,
            metadata: {
                sourceFileCount: input.files.length,
                converter: 'html-to-gutenberg',
                generatedFiles: generatedFileArtifacts,
                warnings,
                styleTokens,
                assets,
                ...(zipArtifact && { pluginZipUrl: zipArtifact.url, pluginZipKey: zipArtifact.key })
            },
            artifactKeys,
            createdAt: new Date().toISOString()
        };
    }
    finally {
        // Clean up temp directory
        await rm(tempDir, { recursive: true, force: true });
    }
}
async function generateMultiPageGutenberg(input, entries) {
    const converter = input.converter ?? (await loadHtmlToGutenberg());
    const warnings = [];
    const pages = [];
    for (const [pageIndex, entry] of entries.entries()) {
        const sourceHtml = entry.content.toString('utf8');
        const blockIdentity = inferBlockIdentity(entry.path);
        const tempDir = await mkdtemp(join(tmpdir(), 'forma-gutenberg-page-'));
        try {
            let raw;
            let pageUsedFallback = false;
            try {
                raw = looksLikeGeneratedGutenbergJsx(sourceHtml)
                    ? {}
                    : await converter(sourceHtml, {
                        projectId: input.projectId,
                        uploadId: input.uploadId,
                        title: blockIdentity.title,
                        slug: blockIdentity.slug,
                        namespace: 'wp',
                        outputPath: tempDir,
                        writeFiles: true,
                        outputMode: 'legacy',
                        assets: input.files.map((file) => ({ path: file.path, mime: file.mime, size: file.size }))
                    });
                if (looksLikeGeneratedGutenbergJsx(sourceHtml)) {
                    pageUsedFallback = true;
                    warnings.push(`html_to_gutenberg_generated_jsx_input_fallback_used:${entry.path}`);
                }
            }
            catch {
                pageUsedFallback = true;
                warnings.push(`html_to_gutenberg_conversion_failed_fallback_used:${entry.path}`);
                raw = {};
            }
            let normalized = normalizeConverterOutput(raw, sourceHtml, { ...blockIdentity, namespace: 'wp' });
            if (!normalized.generatedFiles && pageUsedFallback) {
                const generatedFiles = ensureUsableGeneratedFiles({}, sourceHtml, { ...blockIdentity, namespace: 'wp' });
                normalized = {
                    markup: buildGeneratedBlockMarkup(generatedFiles, sourceHtml, { ...blockIdentity, namespace: 'wp' }),
                    blocks: extractBlocksFromGeneratedFiles(generatedFiles, sourceHtml),
                    generatedFiles,
                    warnings: ['html_to_gutenberg_missing_block_js_fallback_used']
                };
            }
            warnings.push(...(normalized.warnings ?? []).map((warning) => `${warning}:${entry.path}`));
            pages.push({
                entry,
                identity: blockIdentity,
                block: normalizePageBlock(normalized, entry, blockIdentity, pageIndex),
                markup: normalized.markup
            });
        }
        finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    }
    const blocks = pages.map((page) => page.block);
    const markup = pages.map((page) => page.markup).join('\n\n');
    const combinedSourceHtml = entries.map((entry) => entry.content.toString('utf8')).join('\n\n');
    const baseKey = `projects/${input.projectId}/sessions/${input.sessionId}/gutenberg`;
    const zipArtifact = await createMultiBlockPluginZipArtifact(blocks, input.projectId, input.sessionId, input.artifactWriter, input.files);
    const markupArtifact = await input.artifactWriter.putObject(`${baseKey}/output.html`, markup, 'text/html');
    const styleTokens = extractStyleTokens(input.files, combinedSourceHtml);
    const assets = extractAssets(input.files, combinedSourceHtml);
    const sourcePages = pages.map((page, index) => ({
        path: page.entry.path,
        title: page.identity.title,
        slug: page.identity.slug,
        order: index,
        blockId: page.block.id
    }));
    const blockOrder = blocks.map((block) => block.id);
    const metadata = {
        blocks,
        htmlEntry: entries[0]?.path ?? '',
        sourcePages,
        blockOrder,
        generatedFiles: [],
        warnings,
        styleTokens,
        assets,
        isMultiPage: true,
        pageCount: pages.length
    };
    const metadataArtifact = await input.artifactWriter.putObject(`${baseKey}/metadata.json`, JSON.stringify(metadata, null, 2), 'application/json');
    return {
        id: randomUUID(),
        projectId: input.projectId,
        sessionId: input.sessionId,
        htmlEntry: entries[0]?.path ?? '',
        blocks,
        markup,
        metadata: {
            sourceFileCount: input.files.length,
            converter: 'html-to-gutenberg',
            generatedFiles: [],
            warnings,
            styleTokens,
            assets,
            sourcePages,
            blockOrder,
            isMultiPage: true,
            pageCount: pages.length,
            pluginZipUrl: zipArtifact.url,
            pluginZipKey: zipArtifact.key
        },
        artifactKeys: [markupArtifact.key, metadataArtifact.key, zipArtifact.key],
        createdAt: new Date().toISOString()
    };
}
export async function generatePluginZipBuffer(input) {
    const converter = input.converter ?? (await loadHtmlToGutenberg());
    const tempDir = await mkdtemp(join(tmpdir(), 'forma-gutenberg-'));
    const blockIdentity = { title: 'Forma Generated Block', slug: 'forma-generated-block', namespace: 'wp' };
    try {
        let raw;
        if (containsGutenbergBlock(input.html) || looksLikeGeneratedGutenbergJsx(input.html)) {
            raw = {};
        }
        else {
            try {
                raw = await converter(input.html, {
                    projectId: input.projectId,
                    uploadId: input.uploadId,
                    title: blockIdentity.title,
                    slug: blockIdentity.slug,
                    namespace: blockIdentity.namespace,
                    outputPath: tempDir,
                    writeFiles: true,
                    outputMode: 'legacy',
                    assets: input.assets ?? []
                });
            }
            catch {
                raw = {};
            }
        }
        let normalized = normalizeConverterOutput(raw, input.html, blockIdentity);
        if (!normalized.generatedFiles) {
            const generatedFiles = ensureUsableGeneratedFiles({}, input.html, blockIdentity);
            normalized = {
                markup: buildGeneratedBlockMarkup(generatedFiles, input.html, blockIdentity),
                blocks: extractBlocksFromGeneratedFiles(generatedFiles, input.html),
                generatedFiles
            };
        }
        await writeGeneratedFilesToDirectory(tempDir, normalized.generatedFiles ?? {});
        const zip = new JSZip();
        await addFilesToZip(tempDir, zip);
        return await zip.generateAsync({ type: 'nodebuffer' });
    }
    finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}
export async function generateMultiBlockPluginZipBuffer(input) {
    const zip = new JSZip();
    addMultiBlockPluginFiles(zip, input.blocks);
    return await zip.generateAsync({ type: 'nodebuffer' });
}
/* v8 ignore start -- external package loading is exercised by deployment smoke tests */
async function loadHtmlToGutenberg() {
    const mod = await import('html-to-gutenberg');
    const converter = mod.default ?? mod.convert;
    if (!converter) {
        throw new AppError(500, 'converter_unavailable', 'html-to-gutenberg converter export was not found');
    }
    return converter;
}
/* v8 ignore stop */
async function createPluginZipArtifact(tempDir, projectId, sessionId, artifactWriter, sourceFiles = [], htmlEntryPath) {
    const zip = new JSZip();
    await addFilesToZip(tempDir, zip);
    addSourceAssetsToZip(zip, sourceFiles, htmlEntryPath);
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const key = `projects/${projectId}/sessions/${sessionId}/plugin/gutenberg-plugin.zip`;
    return await artifactWriter.putObject(key, zipBuffer, 'application/zip');
}
async function createMultiBlockPluginZipArtifact(blocks, projectId, sessionId, artifactWriter, sourceFiles = []) {
    const zip = new JSZip();
    addMultiBlockPluginFiles(zip, blocks);
    addSourceAssetsToZip(zip, sourceFiles);
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const key = `projects/${projectId}/sessions/${sessionId}/plugin/gutenberg-plugin.zip`;
    return await artifactWriter.putObject(key, zipBuffer, 'application/zip');
}
export async function generateReactZipBuffer(input) {
    const html = input.html ?? '';
    const zip = new JSZip();
    const pkg = {
        name: `${input.projectId}-react-export`,
        version: '0.1.0',
        private: true,
        main: 'src/Component.jsx'
    };
    zip.file('package.json', JSON.stringify(pkg, null, 2));
    const jsxBody = await convertHtmlToJsx(html);
    const compSource = jsxBody && jsxBody.trim().startsWith('<')
        ? `import React from 'react';\n\nexport default function FormaExportComponent(props) {\n  return (\n    ${jsxBody}\n  );\n}\n`
        : `import React from 'react';\n\nexport default function FormaExportComponent(props) {\n  return React.createElement('div', { dangerouslySetInnerHTML: { __html: ${JSON.stringify(html)} } });\n}\n`;
    zip.file('src/Component.jsx', compSource);
    if (input.assets && input.assets.length > 0) {
        zip.folder('assets');
    }
    zip.file('README.md', '# React export\n\nA simple React component wrapper generated by Forma.');
    return await zip.generateAsync({ type: 'nodebuffer' });
}
export async function generateMultiReactZipBuffer(input) {
    const zip = new JSZip();
    const pkg = {
        name: `${input.projectId}-react-export`,
        version: '0.1.0',
        private: true,
        main: 'src/index.js'
    };
    zip.file('package.json', JSON.stringify(pkg, null, 2));
    zip.file('README.md', '# React components export\n\nMultiple components generated by Forma.');
    const componentsFolder = zip.folder('src');
    const exportsIndex = [];
    for (const [index, block] of input.blocks.entries()) {
        const id = String(block.id ?? `block-${index + 1}`);
        const slug = String(block.slug ?? id).replace(/[^a-z0-9_-]/gi, '-');
        const html = String(block.markup ?? block.originalHtml ?? '');
        const filename = `${slug}.jsx`;
        const componentName = toComponentName(slug);
        const jsxBody = await convertHtmlToJsx(html);
        const comp = jsxBody && jsxBody.trim().startsWith('<')
            ? `import React from 'react';\n\nexport default function ${componentName}(props) {\n  return (\n    ${jsxBody}\n  );\n}\n`
            : `import React from 'react';\n\nexport default function ${componentName}(props) {\n  return React.createElement('div', { dangerouslySetInnerHTML: { __html: ${JSON.stringify(html)} } });\n}\n`;
        componentsFolder?.file(filename, comp);
        exportsIndex.push(`export { default as ${componentName} } from './${filename.replace(/\.jsx$/, '')}';`);
    }
    componentsFolder?.file('index.js', exportsIndex.join('\n'));
    return await zip.generateAsync({ type: 'nodebuffer' });
}
async function convertHtmlToJsx(html) {
    try {
        const packageName = 'node-html-to-jsx';
        const mod = await import(packageName);
        const converter = (mod.default ?? mod.HTMLtoJSX ?? mod);
        if (typeof converter !== 'function')
            return null;
        try {
            const instance = new converter({ createClass: false });
            if (typeof instance.convert === 'function') {
                return instance.convert(html);
            }
            return null;
        }
        catch {
            return await Promise.resolve(converter(html));
        }
    }
    catch {
        return null;
    }
}
function addMultiBlockPluginFiles(zip, blocks) {
    const usedFolders = new Set();
    const usedBlockSlugs = new Set();
    const descriptors = blocks.map((block, index) => {
        const sourcePath = firstString(block.sourcePath, block.path, block.id) ?? `block-${index + 1}`;
        const inferred = inferBlockIdentity(sourcePath);
        const title = firstString(block.title, block.label) ?? inferred.title ?? `Block ${index + 1}`;
        const baseSlug = firstString(block.slug) ?? inferred.slug ?? `block-${index + 1}`;
        const folder = uniqueSlug(`${String(index + 1).padStart(2, '0')}-${baseSlug}`, usedFolders);
        const blockSlug = uniqueSlug(baseSlug, usedBlockSlugs);
        const identity = { title, slug: blockSlug, namespace: 'wp' };
        const html = blockHtmlForPlugin(block);
        return { folder, identity, html };
    });
    zip.file('index.php', buildMultiBlockPluginIndexPhp(descriptors));
    for (const descriptor of descriptors) {
        const folder = zip.folder(descriptor.folder);
        if (!folder)
            continue;
        const styles = extractStyleContents(descriptor.html);
        folder.file('index.php', buildFallbackIndexPhp(descriptor.identity));
        folder.file('block.js', buildFallbackBlockJs(descriptor.html, descriptor.identity));
        folder.file('style.css', styles);
        folder.file('editor.css', styles);
        folder.file('remote-loader.js', '');
    }
}
function normalizePageBlock(normalized, entry, blockIdentity, pageIndex) {
    const sourceBlock = normalized.blocks[0] ?? {
        id: `block-${pageIndex + 1}`,
        name: fallbackBlockName({ ...blockIdentity, namespace: 'wp' }),
        originalHtml: stripGutenbergBlockWrapper(normalized.markup)
    };
    return {
        ...sourceBlock,
        id: `block-${pageIndex + 1}`,
        name: fallbackBlockName({ ...blockIdentity, namespace: 'wp' }),
        title: blockIdentity.title,
        sourcePath: entry.path,
        order: pageIndex,
        markup: normalized.markup,
        originalHtml: firstString(sourceBlock.originalHtml, stripGutenbergBlockWrapper(normalized.markup)) ?? ''
    };
}
function blockHtmlForPlugin(block) {
    const value = firstString(block.markup, block.originalHtml, block.html, block.content) ?? '';
    return normalizeHtmlAttributes(stripGutenbergBlockWrapper(value).trim());
}
function buildMultiBlockPluginIndexPhp(descriptors) {
    const requires = descriptors
        .map((descriptor) => `require_once __DIR__ . '/${phpSingleQuote(descriptor.folder)}/index.php';`)
        .join('\n');
    return `<?php
/**
 * Plugin Name: Forma Gutenberg Blocks
 * Description: Forma generated Gutenberg block collection.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
  exit;
}

${requires}
`;
}
function uniqueSlug(value, used) {
    const base = slugify(value) || 'block';
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    used.add(candidate);
    return candidate;
}
function stripGutenbergBlockWrapper(markup) {
    const trimmed = markup.trim();
    const paired = trimmed.match(/^<!--\s*wp:[^>]+-->\s*([\s\S]*?)\s*<!--\s*\/wp:[^>]+-->\s*$/);
    return paired?.[1]?.trim() ?? trimmed;
}
async function addFilesToZip(dirPath, zipFolder) {
    const files = await readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
        const fullPath = join(dirPath, file.name);
        if (file.isDirectory()) {
            const subFolder = zipFolder.folder(file.name);
            if (subFolder) {
                await addFilesToZip(fullPath, subFolder);
            }
        }
        else {
            const fileContent = await readFile(fullPath);
            zipFolder.file(file.name, fileContent);
        }
    }
}
function firstString(...values) {
    return values.find((value) => typeof value === 'string' && value.length > 0);
}
function toGeneratedFiles(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const entries = Object.entries(value).filter(([name, contents]) => typeof contents === 'string' && isGeneratedFileName(name));
    if (entries.length === 0) {
        return undefined;
    }
    return Object.fromEntries(entries.map(([name, contents]) => [normalizeGeneratedFileName(name), contents]));
}
function isGeneratedFileName(name) {
    return /^(block\.js|index\.php|style\.css|editor\.css|scripts?\.js|remote-loader\.js)$/i.test(name);
}
function normalizeGeneratedFileName(name) {
    return name.toLowerCase() === 'script.js' ? 'scripts.js' : name;
}
function extractBlocksFromGeneratedFiles(files, sourceHtml) {
    const blockName = extractBlockName(files['block.js']) ?? 'core/html';
    const html = normalizeHtmlAttributes(extractBodyHtml(sourceHtml).trim() || sourceHtml.trim());
    const tagName = firstElementTagName(html) ?? 'html';
    return [{
            id: 'block-1',
            name: blockName,
            title: titleCase(blockName.split('/').pop() ?? 'Generated Block'),
            tagName,
            attributes: extractOpeningTagAttributes(html),
            originalHtml: html
        }];
}
function inferBlockIdentity(entryPath) {
    const withoutExtension = basename(entryPath, extname(entryPath));
    const parent = entryPath.split('/').slice(-2, -1)[0];
    const raw = withoutExtension.toLowerCase() === 'index' && parent ? parent : withoutExtension;
    const slug = slugify(raw) || 'converted-block';
    const title = slug
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    return { title, slug };
}
function slugify(value) {
    return value
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}
async function writeGeneratedFileArtifacts(baseKey, generatedFiles, artifactWriter) {
    if (!generatedFiles) {
        return [];
    }
    const artifacts = [];
    for (const [name, contents] of Object.entries(generatedFiles)) {
        const contentType = contentTypeForGeneratedFile(name);
        const stored = await artifactWriter.putObject(`${baseKey}/files/${name}`, contents, contentType);
        artifacts.push({
            name,
            key: stored.key,
            url: stored.url,
            contentType,
            size: Buffer.byteLength(contents)
        });
    }
    return artifacts;
}
function contentTypeForGeneratedFile(name) {
    if (name.endsWith('.js'))
        return 'application/javascript';
    if (name.endsWith('.css'))
        return 'text/css';
    if (name.endsWith('.php'))
        return 'application/x-httpd-php';
    /* v8 ignore next -- current generated file allow-list only admits js/css/php names */
    return 'text/plain';
}
function ensureGutenbergMarkup(markup) {
    const normalized = normalizeHtmlAttributes(markup.trim());
    if (containsGutenbergBlock(normalized)) {
        return normalized;
    }
    return `<!-- wp:html -->\n${normalized}\n<!-- /wp:html -->`;
}
function containsGutenbergBlock(markup) {
    return /<!--\s*wp:[\s\S]*?-->/g.test(markup);
}
function looksLikeGeneratedGutenbergJsx(markup) {
    return /<RichText\b|<MediaUpload\b|value=\{attributes\.|onChange=\s*\(/.test(markup);
}
function normalizeHtmlAttributes(markup) {
    return markup
        .replace(/\bclassName=/g, 'class=')
        .replace(/\bhtmlFor=/g, 'for=');
}
function normalizeBlock(block, index) {
    if (block && typeof block === 'object') {
        return {
            id: String(block.id ?? `block-${index + 1}`),
            name: String(block.name ?? block.type ?? 'core/group'),
            ...block
        };
    }
    return {
        id: `block-${index + 1}`,
        name: 'core/html',
        originalHtml: String(block ?? '')
    };
}
function extractBlocksFromMarkup(markup) {
    const pairedMatches = [...markup.matchAll(/<!--\s*wp:([^\s/]+(?:\/[^\s/]+)?)(?:\s+[\s\S]*?)?-->([\s\S]*?)<!--\s*\/wp:\1\s*-->/g)];
    const selfClosingMatches = [...markup.matchAll(/<!--\s*wp:([^\s/]+(?:\/[^\s/]+)?)(?:\s+[\s\S]*?)?\s+\/-->/g)];
    if (pairedMatches.length === 0 && selfClosingMatches.length === 0) {
        return [{ id: 'block-1', name: 'core/html', originalHtml: markup }];
    }
    const pairedBlocks = pairedMatches.map((match, index) => ({
        id: `block-${index + 1}`,
        name: normalizeBlockName(match[1] ?? 'html'),
        originalHtml: match[2]?.trim() ?? ''
    }));
    const selfClosingBlocks = selfClosingMatches.map((match, index) => ({
        id: `block-${pairedBlocks.length + index + 1}`,
        name: normalizeBlockName(match[1] ?? 'html'),
        originalHtml: ''
    }));
    return [...pairedBlocks, ...selfClosingBlocks];
}
function normalizeBlockName(name) {
    return name.includes('/') ? name : `core/${name}`;
}
function ensureUsableGeneratedFiles(generatedFiles, sourceHtml, blockIdentity) {
    const sanitized = sanitizeGeneratedFiles(generatedFiles);
    if (!blockIdentity || isUsableBlockJs(sanitized['block.js'])) {
        return sanitized;
    }
    return {
        ...sanitized,
        'style.css': sanitized['style.css'] ?? extractStyleContents(sourceHtml),
        'editor.css': sanitized['editor.css'] ?? sanitized['style.css'] ?? extractStyleContents(sourceHtml),
        'scripts.js': sanitized['scripts.js'] ?? extractExecutableScriptContents(sourceHtml),
        'index.php': buildFallbackIndexPhp(blockIdentity),
        'block.js': buildFallbackBlockJs(sourceHtml, blockIdentity),
        'remote-loader.js': sanitized['remote-loader.js'] ?? ''
    };
}
function sanitizeGeneratedFiles(generatedFiles) {
    const next = { ...generatedFiles };
    if (isSchemaOnlyScript(next['scripts.js'])) {
        delete next['scripts.js'];
    }
    return next;
}
function isSchemaOnlyScript(value) {
    if (typeof value !== 'string')
        return false;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}'))
        return false;
    try {
        const parsed = JSON.parse(trimmed);
        return parsed['@context'] === 'https://schema.org' || parsed['@type'] === 'SoftwareApplication';
    }
    catch {
        return false;
    }
}
function isUsableBlockJs(value) {
    return typeof value === 'string' && value.includes('registerBlockType') && value.trim().length > 0;
}
function buildGeneratedBlockMarkup(generatedFiles, sourceHtml, blockIdentity) {
    const blockName = extractBlockName(generatedFiles['block.js']) ?? fallbackBlockName(blockIdentity);
    const markup = normalizeHtmlAttributes(extractBodyHtml(sourceHtml).trim() || sourceHtml.trim());
    return `<!-- wp:${blockName} -->\n${markup}\n<!-- /wp:${blockName} -->`;
}
function extractBlockName(blockJs) {
    return extractBlockNames(blockJs)[0];
}
function extractBlockNames(blockJs) {
    if (!blockJs)
        return [];
    return [...blockJs.matchAll(/registerBlockType\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]).filter(Boolean);
}
function fallbackBlockName(blockIdentity) {
    if (!blockIdentity)
        return 'core/html';
    return `${slugifyBlockSegment(blockIdentity.namespace ?? 'wp')}/${slugifyBlockSegment(blockIdentity.slug)}`;
}
function slugifyBlockSegment(value) {
    const slug = slugify(value).replace(/-/g, '');
    return /^[a-z]/.test(slug) ? slug : `block${slug}`;
}
function buildFallbackBlockJs(sourceHtml, blockIdentity) {
    const blockName = fallbackBlockName(blockIdentity);
    const html = normalizeHtmlAttributes(stripDangerousDocumentScripts(extractBodyHtml(sourceHtml).trim() || sourceHtml.trim()));
    return `(function (blocks, element) {
  var el = element.createElement;
  var RawHTML = element.RawHTML;
  var markup = ${JSON.stringify(html)};

  blocks.registerBlockType(${JSON.stringify(blockName)}, {
    title: ${JSON.stringify(blockIdentity.title)},
    icon: 'layout',
    category: 'design',
    edit: function () {
      return el(RawHTML, null, markup);
    },
    save: function () {
      return el(RawHTML, null, markup);
    }
  });
})(window.wp.blocks, window.wp.element);
`;
}
function buildFallbackIndexPhp(blockIdentity) {
    const blockName = fallbackBlockName(blockIdentity);
    const handle = fallbackBlockName(blockIdentity).replace(/\//g, '-');
    const registrationCall = `  register_block_type('${phpSingleQuote(blockName)}', array(
    'editor_script' => '${phpSingleQuote(handle)}',
    'style' => '${phpSingleQuote(handle)}-style',
    'editor_style' => '${phpSingleQuote(handle)}-style'
  ));`;
    return `<?php
/**
 * Plugin Name: ${blockIdentity.title}
 * Description: Forma generated Gutenberg block.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
  exit;
}

add_action('init', function () {
  wp_register_script(
    '${handle}',
    plugins_url('block.js', __FILE__),
    array('wp-blocks', 'wp-element'),
    filemtime(plugin_dir_path(__FILE__) . 'block.js')
  );

  wp_register_style(
    '${handle}-style',
    plugins_url('style.css', __FILE__),
    array(),
    file_exists(plugin_dir_path(__FILE__) . 'style.css') ? filemtime(plugin_dir_path(__FILE__) . 'style.css') : null
  );

${registrationCall}
});
`;
}
function phpSingleQuote(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function splitHtmlIntoBlockSections(sourceHtml, blockIdentity) {
    const bodyHtml = extractBodyHtml(sourceHtml).trim();
    const immediateSections = collectImmediateChildSections(bodyHtml);
    const structuralSections = immediateSections.length > 1
        ? immediateSections
        : collectElementSections(bodyHtml, ['header', 'main', 'section', 'article', 'aside', 'nav', 'footer']);
    const primarySections = structuralSections.length > 1
        ? structuralSections
        : collectElementSections(bodyHtml, ['header', 'section', 'article', 'aside', 'nav', 'footer']);
    const rawSections = primarySections.length > 1
        ? primarySections
        : [{ tagName: firstElementTagName(bodyHtml) ?? 'html', html: bodyHtml || sourceHtml }];
    const baseName = fallbackBlockName(blockIdentity);
    return rawSections.map((section, index) => {
        const title = inferSectionTitle(section.html, section.tagName, blockIdentity, index, rawSections.length);
        return {
            id: `block-${index + 1}`,
            name: rawSections.length === 1 ? baseName : sectionBlockName(baseName, title, index),
            title,
            tagName: section.tagName,
            html: normalizeHtmlAttributes(section.html.trim()),
            attributes: extractOpeningTagAttributes(section.html)
        };
    });
}
function extractBodyHtml(html) {
    const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
    if (body !== undefined)
        return body;
    return html
        .replace(/<!doctype[\s\S]*?>/i, '')
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, '')
        .replace(/<\/?html\b[^>]*>/gi, '')
        .trim();
}
function collectElementSections(html, tagNames) {
    const tagPattern = tagNames.join('|');
    const openingTagRegex = new RegExp(`<(${tagPattern})\\b[^>]*>`, 'gi');
    const sections = [];
    for (const match of html.matchAll(openingTagRegex)) {
        const start = match.index ?? 0;
        if (sections.some((section) => start >= section.start && start < section.end))
            continue;
        const tagName = (match[1] ?? '').toLowerCase();
        const end = findMatchingElementEnd(html, tagName, start + match[0].length);
        if (!end)
            continue;
        sections.push({
            start,
            end,
            tagName,
            html: html.slice(start, end)
        });
    }
    return sections.map(({ tagName, html }) => ({ tagName, html }));
}
function collectImmediateChildSections(html) {
    const sections = [];
    let cursor = 0;
    const openingTagRegex = /<([a-z][\w:-]*)\b[^>]*>/gi;
    while (cursor < html.length) {
        openingTagRegex.lastIndex = cursor;
        const match = openingTagRegex.exec(html);
        if (!match)
            break;
        const start = match.index;
        const tagName = (match[1] ?? '').toLowerCase();
        if (isVoidElement(tagName) || /\/>$/.test(match[0])) {
            sections.push({ tagName, html: match[0] });
            cursor = start + match[0].length;
            continue;
        }
        const end = findMatchingElementEnd(html, tagName, start + match[0].length);
        if (!end)
            break;
        sections.push({ tagName, html: html.slice(start, end) });
        cursor = end;
    }
    return sections.length > 1 ? sections : [];
}
function findMatchingElementEnd(html, tagName, fromIndex) {
    const tagRegex = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi');
    tagRegex.lastIndex = fromIndex;
    let depth = 1;
    for (const match of html.matchAll(tagRegex)) {
        const token = match[0];
        if (/^<\//.test(token)) {
            depth -= 1;
            if (depth === 0) {
                return (match.index ?? 0) + token.length;
            }
        }
        else if (!/\/>$/.test(token)) {
            depth += 1;
        }
    }
    return null;
}
function inferSectionTitle(html, tagName, blockIdentity, index, total) {
    const heading = html.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
    const label = stripHtml(heading ?? '')
        || extractOpeningTagAttributes(html)['aria-label']
        || extractOpeningTagAttributes(html).id
        || tagName;
    const title = titleCase(label).slice(0, 60);
    if (total === 1)
        return blockIdentity?.title ?? title;
    return `${blockIdentity?.title ?? 'Generated'} ${index + 1}: ${title}`;
}
function sectionBlockName(baseName, title, index) {
    const [namespace, name = 'block'] = baseName.split('/');
    const sectionSlug = slugifyBlockSegment(title).slice(0, 36) || `section${index + 1}`;
    return `${namespace}/${name}-${sectionSlug}`;
}
function firstElementTagName(html) {
    return html.match(/<([a-z][\w:-]*)\b/i)?.[1]?.toLowerCase() ?? null;
}
function extractOpeningTagAttributes(html) {
    const openingTag = html.match(/^<([a-z][\w:-]*)([^>]*)>/i);
    const rawAttributes = openingTag?.[2] ?? '';
    const attributes = {};
    const attributeRegex = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const match of rawAttributes.matchAll(attributeRegex)) {
        const name = match[1];
        if (!name)
            continue;
        attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    return attributes;
}
function stripHtml(value) {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function titleCase(value) {
    return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
function isVoidElement(tagName) {
    return ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tagName);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function extractStyleContents(html) {
    return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
        .map((match) => match[1]?.trim())
        .filter(Boolean)
        .join('\n\n');
}
function extractExecutableScriptContents(html) {
    return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter((match) => !/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1] ?? ''))
        .map((match) => match[2]?.trim())
        .filter(Boolean)
        .join('\n\n');
}
function stripDangerousDocumentScripts(html) {
    return html.replace(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
}
async function writeGeneratedFilesToDirectory(tempDir, generatedFiles) {
    await mkdir(tempDir, { recursive: true });
    for (const [name, contents] of Object.entries(generatedFiles)) {
        await writeFile(join(tempDir, name), contents);
    }
}
function addSourceAssetsToZip(zip, files, htmlEntryPath) {
    const htmlDir = htmlEntryPath ? dirname(htmlEntryPath) : '.';
    const placeUnderAssets = !htmlEntryPath;
    const usedNames = new Set();
    for (const file of files) {
        if (file.path.toLowerCase().endsWith('.html') || isGeneratedFileName(basename(file.path)))
            continue;
        if (!isBundleAsset(file))
            continue;
        let zipPath;
        if (placeUnderAssets) {
            // For multi-block/plugin exports we avoid recreating full nested source paths.
            // Put assets into a top-level `assets/` folder and ensure unique filenames.
            const name = basename(file.path);
            const ext = extname(name);
            const base = name.slice(0, name.length - ext.length) || 'asset';
            let candidate = `assets/${name}`;
            let suffix = 1;
            while (usedNames.has(candidate)) {
                candidate = `assets/${base}-${suffix}${ext}`;
                suffix += 1;
            }
            usedNames.add(candidate);
            zipPath = candidate;
        }
        else {
            const relativePath = htmlDir && htmlDir !== '.'
                ? relative(htmlDir, file.path)
                : file.path;
            zipPath = relativePath.startsWith('..') ? file.path : relativePath;
        }
        zip.file(zipPath, file.content);
    }
}
function extractStyleTokens(files, sourceHtml) {
    const styleSources = [
        extractStyleContents(sourceHtml),
        ...files
            .filter((file) => isStyleSourceFile(file))
            .map((file) => safeText(file.content))
    ].filter(Boolean);
    const combined = styleSources.join('\n\n');
    const tailwindConfigs = files
        .filter((file) => /(^|\/)tailwind\.config\.[cm]?[jt]s$/i.test(file.path))
        .map((file) => ({ path: file.path, source: safeText(file.content).slice(0, 20000) }));
    const tailwindTokens = extractTailwindTokens(tailwindConfigs.map((config) => config.source).join('\n\n'));
    const colors = [
        ...uniqueMatches(combined, /#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)|\b(?:black|white|transparent|currentColor)\b/g),
        ...tailwindTokens.colors
    ];
    const typography = {
        fontFamilies: mergeUnique(uniqueDeclarationValues(combined, 'font-family'), tailwindTokens.fontFamilies),
        fontSizes: mergeUnique(uniqueDeclarationValues(combined, 'font-size'), tailwindTokens.fontSizes),
        lineHeights: uniqueDeclarationValues(combined, 'line-height'),
        fontWeights: uniqueDeclarationValues(combined, 'font-weight')
    };
    return {
        colors: mergeUnique(colors),
        typography,
        fontSizes: typography.fontSizes,
        fontFamilies: typography.fontFamilies,
        lineHeights: typography.lineHeights,
        fontWeights: typography.fontWeights,
        tailwindConfig: tailwindConfigs
    };
}
function extractAssets(files, sourceHtml) {
    const localAssets = files
        .filter(isBundleAsset)
        .map((file) => ({
        id: `local:${file.path}`,
        kind: assetKind(file.path, file.mime),
        source: 'local',
        path: file.path,
        mime: file.mime,
        size: file.size
    }));
    const remoteAssets = extractRemoteAssetUrls(sourceHtml).map((url) => ({
        id: `remote:${url}`,
        kind: assetKind(url),
        source: 'remote',
        url
    }));
    const seen = new Set();
    return [...localAssets, ...remoteAssets].filter((asset) => {
        const key = asset.path ?? asset.url ?? asset.id;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function extractRemoteAssetUrls(html) {
    const urls = new Set();
    const attrRegex = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;
    const srcsetRegex = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
    const cssUrlRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
    for (const match of html.matchAll(attrRegex)) {
        addAssetUrl(urls, match[1]);
    }
    for (const match of html.matchAll(srcsetRegex)) {
        String(match[1] ?? '').split(',').forEach((candidate) => addAssetUrl(urls, candidate.trim().split(/\s+/)[0]));
    }
    for (const match of html.matchAll(cssUrlRegex)) {
        addAssetUrl(urls, match[1]);
    }
    return [...urls];
}
function addAssetUrl(urls, value) {
    if (!value || value.startsWith('data:') || value.startsWith('#'))
        return;
    const normalized = value.trim();
    if (/^(?:https?:)?\/\//i.test(normalized) || isAssetPath(normalized)) {
        urls.add(normalized);
    }
}
function isStyleSourceFile(file) {
    return file.mime.includes('css') || /\.(css|scss|sass|less|pcss)$/i.test(file.path) || /(^|\/)tailwind\.config\.[cm]?[jt]s$/i.test(file.path);
}
function uniqueMatches(value, pattern) {
    return [...new Set([...value.matchAll(pattern)].map((match) => match[0]).filter(Boolean))].slice(0, 80);
}
function uniqueDeclarationValues(value, property) {
    const pattern = new RegExp(`${escapeRegExp(property)}\\s*:\\s*([^;}{]+)`, 'gi');
    return [...new Set([...value.matchAll(pattern)].map((match) => (match[1] ?? '').trim()).filter(Boolean))].slice(0, 40);
}
function extractTailwindTokens(source) {
    if (!source.trim()) {
        return { colors: [], fontFamilies: [], fontSizes: [] };
    }
    return {
        colors: mergeUnique([
            ...uniqueMatches(source, /#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)/g),
            ...extractObjectLikeValues(source, ['colors', 'backgroundColor', 'textColor'])
        ]).filter((value) => looksLikeColorToken(value)),
        fontFamilies: extractObjectLikeValues(source, ['fontFamily']),
        fontSizes: extractObjectLikeValues(source, ['fontSize'])
    };
}
function extractObjectLikeValues(source, keys) {
    const values = [];
    for (const key of keys) {
        const section = extractObjectLikeSection(source, key);
        if (!section)
            continue;
        for (const match of section.matchAll(/:\s*(?:\[\s*)?(['"`])([^'"`]+)\1/g)) {
            const value = match[2]?.trim();
            if (value)
                values.push(value);
        }
    }
    return mergeUnique(values);
}
function extractObjectLikeSection(source, key) {
    const match = new RegExp(`${escapeRegExp(key)}\\s*:\\s*\\{`, 'i').exec(source);
    if (!match || match.index === undefined)
        return null;
    const start = match.index + match[0].length;
    let depth = 1;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{')
            depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0)
                return source.slice(start, index);
        }
    }
    return null;
}
function looksLikeColorToken(value) {
    return /^(#|rgb|hsl|oklch|var\(|theme\(|[a-z][\w-]*$)/i.test(value.trim());
}
function mergeUnique(values, extra = []) {
    return [...new Set([...values, ...extra].map((value) => value.trim()).filter(Boolean))].slice(0, 80);
}
function safeText(content) {
    return content.toString('utf8');
}
function assetKind(path, mime = '') {
    if (mime === 'image/svg+xml' || /\.svg(?:[?#].*)?$/i.test(path))
        return 'svg';
    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|ico)(?:[?#].*)?$/i.test(path))
        return 'image';
    if (mime.startsWith('font/') || /\.(woff2?|ttf|otf|eot)(?:[?#].*)?$/i.test(path))
        return 'font';
    if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(path))
        return 'video';
    if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)(?:[?#].*)?$/i.test(path))
        return 'audio';
    if (/\.pdf(?:[?#].*)?$/i.test(path))
        return 'document';
    return 'asset';
}
function isAssetPath(path) {
    return /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|pdf)(?:[?#].*)?$/i.test(path);
}
function isBundleAsset(file) {
    return /^(image|font|video|audio)\//i.test(file.mime) || isAssetPath(file.path);
}
function toComponentName(slug) {
    return slug
        .split(/[-_]+/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
        .replace(/[^A-Za-z0-9]/g, '') || 'Component';
}
//# sourceMappingURL=index.js.map