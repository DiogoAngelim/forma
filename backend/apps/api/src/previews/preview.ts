import type { GeneratedOutput } from '@forma/shared';

export function buildIframePreview(output: GeneratedOutput, options: { baseHref?: string | null; styles?: string[]; remoteStyles?: string[]; remoteScripts?: string[] } = {}): string {
  const escaped = output.markup.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  const inlineStyles = (options.styles ?? [])
    .filter((style) => style.trim().length > 0)
    .map((style) => `  <style>${escapeStyleContent(style)}</style>`)
    .join('\n');
  const styleLinks = generatedStylesheets(output).map((href) => `  <link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`).join('\n');
  const remoteStyleLinks = mergeUrlLists(output.metadata.remoteStyles, options.remoteStyles).map((href) => `  <link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`).join('\n');
  const remoteScriptLinks = mergeUrlLists(output.metadata.remoteScripts, options.remoteScripts).map((src) => `  <script defer src="${escapeHtmlAttribute(src)}"></script>`).join('\n');
  const supplementalScripts = normalizeSupplementalSources(output.metadata.supplementalScripts).map((source) => `  <script data-forma-source="${escapeHtmlAttribute(source.path)}">${escapeScriptContent(source.content)}</script>`).join('\n');
  const baseTag = options.baseHref ? `  <base href="${escapeHtmlAttribute(options.baseHref)}" target="_blank">` : '  <base target="_blank">';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${baseTag}
${inlineStyles}
${styleLinks}
${remoteStyleLinks}
${remoteScriptLinks}
${supplementalScripts}
</head>
<body>${escaped}</body>
</html>`;
}

function generatedStylesheets(output: GeneratedOutput): string[] {
  const files = output.metadata.generatedFiles;
  if (!Array.isArray(files)) return [];

  return files
    .filter((file): file is { name?: unknown; url?: unknown; contentType?: unknown } => Boolean(file && typeof file === 'object'))
    .filter((file) => typeof file.url === 'string' && (String(file.contentType).includes('css') || /\.css$/i.test(String(file.name ?? file.url))))
    .map((file) => String(file.url));
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

function normalizeSupplementalSources(value: unknown): Array<{ path: string; content: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((source): source is Record<string, unknown> => Boolean(source && typeof source === 'object'))
    .map((source) => ({ path: String(source.path ?? ''), content: String(source.content ?? '') }))
    .filter((source) => source.path && source.content.trim().length > 0);
}

function mergeUrlLists(...values: unknown[]): string[] {
  const urls: string[] = [];
  for (const value of values) {
    if (!Array.isArray(value)) continue;
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
  }
  return [...new Set(urls)];
}
