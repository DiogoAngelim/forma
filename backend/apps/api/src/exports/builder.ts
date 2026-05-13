import type { ExportRequest, GeneratedOutput } from '@forma/shared';
import { generatePluginZipBuffer, generateReactZipBuffer } from '@forma/gutenberg-generator';

export async function buildExportArtifact(
  output: GeneratedOutput,
  request: ExportRequest
): Promise<{ filename: string; contentType: string; body: string | Buffer }> {
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
          ? output.metadata.assets.filter((asset): asset is { path: string; mime: string; size: number } => Boolean(asset && typeof asset === 'object' && typeof (asset as { path?: unknown }).path === 'string' && typeof (asset as { mime?: unknown }).mime === 'string' && typeof (asset as { size?: unknown }).size === 'number'))
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
        ? output.metadata.assets.filter((asset): asset is { path: string; mime: string; size: number } => Boolean(asset && typeof asset === 'object' && typeof (asset as { path?: unknown }).path === 'string' && typeof (asset as { mime?: unknown }).mime === 'string' && typeof (asset as { size?: unknown }).size === 'number'))
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

function jsonArtifact(filename: string, value: unknown): { filename: string; contentType: string; body: string } {
  return {
    filename,
    contentType: 'application/json',
    body: JSON.stringify(value, null, 2)
  };
}

function mergedPageBlock(output: GeneratedOutput): Record<string, unknown> {
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

function mergedPageMarkup(output: GeneratedOutput): string {
  const blockHtml = output.blocks
    .map((block) => firstString(block.markup, block.originalHtml, block.html, block.content))
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => stripGutenbergBlockWrapper(value).trim())
    .join('\n\n');
  const customHead = customStyleAndScriptMarkup(output);
  const html = blockHtml || stripGutenbergBlockWrapper(output.markup).trim() || output.markup;
  return `<!-- wp:wp/forma-page -->\n${customHead}${html}\n<!-- /wp:wp/forma-page -->`;
}

function customStyleAndScriptMarkup(output: GeneratedOutput): string {
  const remoteStyles = normalizeUrlList(output.metadata.remoteStyles)
    .map((href) => `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`);
  const remoteScripts = normalizeUrlList(output.metadata.remoteScripts)
    .map((src) => `<script defer src="${escapeHtmlAttribute(src)}"></script>`);
  const supplementalStyles = normalizeSupplementalSources(output.metadata.supplementalStyles)
    .map((source) => `<style data-forma-source="${escapeHtmlAttribute(source.path)}">${escapeStyleContent(source.content)}</style>`);
  const supplementalScripts = normalizeSupplementalSources(output.metadata.supplementalScripts)
    .map((source) => `<script data-forma-source="${escapeHtmlAttribute(source.path)}">${escapeScriptContent(source.content)}</script>`);
  const parts = [...remoteStyles, ...supplementalStyles, ...remoteScripts, ...supplementalScripts];
  return parts.length ? `${parts.join('\n')}\n` : '';
}

function stripGutenbergBlockWrapper(markup: string): string {
  const trimmed = markup.trim();
  const paired = trimmed.match(/^<!--\s*wp:[^>]+-->\s*([\s\S]*?)\s*<!--\s*\/wp:[^>]+-->\s*$/);
  return paired?.[1]?.trim() ?? trimmed;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function firstElementTagName(html: string): string | undefined {
  return html.match(/<([a-z][a-z0-9-]*)\b/i)?.[1]?.toLowerCase();
}

function normalizeUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'http:' || url.protocol === 'https:') urls.push(url.toString());
    } catch {
      // Ignore invalid URLs already rejected by project metadata validation.
    }
  }
  return [...new Set(urls)];
}

function normalizeSupplementalSources(value: unknown): Array<{ path: string; content: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((source): source is Record<string, unknown> => Boolean(source && typeof source === 'object'))
    .map((source) => ({ path: String(source.path ?? ''), content: String(source.content ?? '') }))
    .filter((source) => source.path && source.content.trim().length > 0);
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeStyleContent(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style');
}

function escapeScriptContent(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}
