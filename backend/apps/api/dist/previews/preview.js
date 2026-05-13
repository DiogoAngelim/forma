export function buildIframePreview(output, options = {}) {
    const escaped = output.markup.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    const inlineStyles = (options.styles ?? [])
        .filter((style) => style.trim().length > 0)
        .map((style) => `  <style>${escapeStyleContent(style)}</style>`)
        .join('\n');
    const styleLinks = generatedStylesheets(output).map((href) => `  <link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`).join('\n');
    const remoteStyleLinks = (options.remoteStyles ?? []).map((href) => `  <link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`).join('\n');
    const remoteScriptLinks = (options.remoteScripts ?? []).map((src) => `  <script defer src="${escapeHtmlAttribute(src)}"></script>`).join('\n');
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
</head>
<body>${escaped}</body>
</html>`;
}
function generatedStylesheets(output) {
    const files = output.metadata.generatedFiles;
    if (!Array.isArray(files))
        return [];
    return files
        .filter((file) => Boolean(file && typeof file === 'object'))
        .filter((file) => typeof file.url === 'string' && (String(file.contentType).includes('css') || /\.css$/i.test(String(file.name ?? file.url))))
        .map((file) => String(file.url));
}
function escapeHtmlAttribute(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escapeStyleContent(value) {
    return value.replace(/<\/style/gi, '<\\/style');
}
//# sourceMappingURL=preview.js.map