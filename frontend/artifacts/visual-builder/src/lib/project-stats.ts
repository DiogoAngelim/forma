import type { GeneratedProjectOutput } from "@/lib/project-api";

export function importStats(output: GeneratedProjectOutput | null | undefined) {
  const normalized = normalizeOutput(output);
  return {
    components: countComponents(normalized),
    colorTokens: countStyleTokens(normalized?.metadata?.styleTokens, "colors") || inferColors(normalized).length,
    fontStyles: countTypographyTokens(normalized?.metadata?.styleTokens) || inferTypography(normalized).length,
    assets: countAssets(normalized?.metadata) || inferAssets(normalized).length,
  };
}

export function countStyleTokens(styleTokens: unknown, key: "colors") {
  if (!styleTokens || typeof styleTokens !== "object") return 0;
  const value = (styleTokens as Record<string, unknown>)[key];
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

export function countTypographyTokens(styleTokens: unknown) {
  if (!styleTokens || typeof styleTokens !== "object") return 0;
  const tokens = styleTokens as Record<string, unknown>;
  const candidates = [tokens.typography, tokens.fonts, tokens.fontFamilies, tokens.fontSizes, tokens.fontWeights, tokens.lineHeights];
  return candidates.reduce<number>((total, value) => {
    if (Array.isArray(value)) return total + value.length;
    if (value && typeof value === "object") return total + Object.keys(value).length;
    return total + (typeof value === "string" && value.trim() ? 1 : 0);
  }, 0);
}

export function countAssets(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return 0;
  const assets = metadata.assets;
  if (Array.isArray(assets)) return assets.length;
  if (assets && typeof assets === "object") return Object.keys(assets).length;
  const generatedFiles = metadata.generatedFiles;
  if (Array.isArray(generatedFiles)) {
    return generatedFiles.filter((file) => {
      const value = typeof file === "string" ? file : typeof file === "object" && file ? String((file as Record<string, unknown>).key ?? (file as Record<string, unknown>).path ?? "") : "";
      return /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)(?:[?#].*)?$/i.test(value);
    }).length;
  }
  return 0;
}

export function countComponents(output: GeneratedProjectOutput | null | undefined) {
  const normalized = normalizeOutput(output);
  if (Array.isArray(normalized?.blocks) && normalized.blocks.length > 0) return normalized.blocks.length;
  const metadataBlocks = normalized?.metadata?.blocks;
  return Array.isArray(metadataBlocks) ? metadataBlocks.length : 0;
}

export function previewImageFromOutput(output: GeneratedProjectOutput) {
  const normalized = normalizeOutput(output);
  const metadata = normalized?.metadata ?? {};
  const direct = metadata.previewImageUrl ?? metadata.previewImage ?? metadata.thumbnailUrl ?? metadata.thumbnail;
  if (typeof direct === "string" && direct) return direct;
  const assets = Array.isArray(metadata.assets) ? metadata.assets : [];
  const image = assets.find((asset) => {
    if (!asset || typeof asset !== "object") return false;
    const record = asset as Record<string, unknown>;
    const value = String(record.url ?? record.path ?? "");
    return record.kind === "image" || /\.(png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/i.test(value);
  }) as Record<string, unknown> | undefined;
  return typeof image?.url === "string" ? image.url : null;
}

function normalizeOutput(output: GeneratedProjectOutput | null | undefined): GeneratedProjectOutput | null | undefined {
  if (Array.isArray(output)) {
    return {
      blocks: output.filter((block): block is Record<string, unknown> => Boolean(block && typeof block === "object")),
      markup: output.map((block) => typeof block?.markup === "string" ? block.markup : typeof block?.originalHtml === "string" ? block.originalHtml : "").join("\n"),
      metadata: {},
    };
  }
  return output;
}

function inferColors(output: GeneratedProjectOutput | null | undefined) {
  const text = outputText(output);
  const colors = new Set<string>();
  for (const match of text.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|\b(?:transparent|currentColor|black|white)\b/gi)) {
    colors.add(match[0]);
  }
  return [...colors];
}

function inferTypography(output: GeneratedProjectOutput | null | undefined) {
  const text = outputText(output);
  const values = new Set<string>();
  for (const match of text.matchAll(/font-(?:family|size|weight)\s*:\s*([^;"'}]+)/gi)) values.add(match[1].trim());
  for (const match of text.matchAll(/\b(?:text|font)-(?:xs|sm|base|lg|xl|[2-9]xl|thin|light|normal|medium|semibold|bold|extrabold|black)\b/g)) values.add(match[0]);
  return [...values];
}

function inferAssets(output: GeneratedProjectOutput | null | undefined) {
  const text = outputText(output);
  const assets = new Set<string>();
  for (const match of text.matchAll(/\b(?:src|href)=["']([^"']+\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mov|mp3|wav|ogg|pdf)(?:[?#][^"']*)?)["']/gi)) {
    assets.add(match[1]);
  }
  return [...assets];
}

function outputText(output: GeneratedProjectOutput | null | undefined) {
  const normalized = normalizeOutput(output);
  const parts = [normalized?.markup ?? ""];
  for (const block of normalized?.blocks ?? []) {
    for (const key of ["originalHtml", "markup", "html", "content"]) {
      const value = block[key];
      if (typeof value === "string") parts.push(value);
    }
  }
  return parts.join("\n");
}
