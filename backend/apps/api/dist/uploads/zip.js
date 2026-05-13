import { AppError } from '@forma/shared';
import JSZip from 'jszip';
const ignored = ['__MACOSX/', '.DS_Store'];
export async function extractZipBundle(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const files = [];
    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || ignored.some((part) => path.includes(part)))
            continue;
        const content = await entry.async('nodebuffer');
        files.push({
            path,
            mime: mimeForPath(path),
            size: content.byteLength,
            content
        });
    }
    if (!files.some((file) => file.path.toLowerCase().endsWith('.html'))) {
        throw new AppError(422, 'zip_missing_html', 'ZIP bundle must include HTML, CSS, JS, and assets needed for conversion');
    }
    return files;
}
export function assertZipUpload(filename, mime) {
    const extensionOk = filename?.toLowerCase().endsWith('.zip') ?? false;
    const mimeOk = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(mime ?? '');
    if (!extensionOk || !mimeOk) {
        throw new AppError(415, 'unsupported_upload', 'Only structured ZIP project bundles are supported');
    }
}
function mimeForPath(path) {
    const lower = path.toLowerCase();
    if (lower.endsWith('.html'))
        return 'text/html';
    if (lower.endsWith('.css'))
        return 'text/css';
    if (lower.endsWith('.js') || lower.endsWith('.mjs'))
        return 'text/javascript';
    if (lower.endsWith('.svg'))
        return 'image/svg+xml';
    if (lower.endsWith('.png'))
        return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
        return 'image/jpeg';
    if (lower.endsWith('.gif'))
        return 'image/gif';
    if (lower.endsWith('.webp'))
        return 'image/webp';
    if (lower.endsWith('.avif'))
        return 'image/avif';
    if (lower.endsWith('.ico'))
        return 'image/x-icon';
    if (lower.endsWith('.woff'))
        return 'font/woff';
    if (lower.endsWith('.woff2'))
        return 'font/woff2';
    if (lower.endsWith('.ttf'))
        return 'font/ttf';
    if (lower.endsWith('.otf'))
        return 'font/otf';
    if (lower.endsWith('.eot'))
        return 'application/vnd.ms-fontobject';
    if (lower.endsWith('.mp4'))
        return 'video/mp4';
    if (lower.endsWith('.webm'))
        return 'video/webm';
    if (lower.endsWith('.mov'))
        return 'video/quicktime';
    if (lower.endsWith('.m4v'))
        return 'video/x-m4v';
    if (lower.endsWith('.mp3'))
        return 'audio/mpeg';
    if (lower.endsWith('.wav'))
        return 'audio/wav';
    if (lower.endsWith('.ogg'))
        return 'audio/ogg';
    if (lower.endsWith('.m4a'))
        return 'audio/mp4';
    if (lower.endsWith('.pdf'))
        return 'application/pdf';
    if (lower.endsWith('tailwind.config.js') || lower.endsWith('tailwind.config.ts'))
        return 'application/javascript';
    return 'application/octet-stream';
}
//# sourceMappingURL=zip.js.map