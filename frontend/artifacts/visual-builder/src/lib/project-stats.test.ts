import { describe, expect, it } from "vitest";
import { countAssets, countComponents, countStyleTokens, countTypographyTokens, importStats, previewImageFromOutput } from "./project-stats";

describe("project stats", () => {
  it("maps generated blocks, token objects, typography arrays, and assets", () => {
    const output = {
      blocks: [{ id: "hero" }, { id: "footer" }],
      metadata: {
        styleTokens: {
          colors: { primary: "#111", accent: "#fff" },
          fontSizes: ["16px", "32px"],
          fontWeights: ["400"],
        },
        assets: [{ path: "hero.png" }, { path: "font.woff2" }],
      },
    } as any;

    expect(importStats(output)).toEqual({
      components: 2,
      colorTokens: 2,
      fontStyles: 3,
      assets: 2,
    });
  });

  it("falls back to metadata blocks, generated asset files, and direct preview images", () => {
    const output = {
      blocks: [],
      metadata: {
        blocks: [{ id: "meta" }],
        styleTokens: {
          colors: ["#000"],
          typography: { body: "Inter", heading: "Geist" },
        },
        generatedFiles: [
          { path: "style.css" },
          { key: "assets/photo.webp" },
          "assets/icon.svg",
        ],
        previewImageUrl: "https://example.com/preview.png",
      },
    } as any;

    expect(countComponents(output)).toBe(1);
    expect(countStyleTokens(output.metadata.styleTokens, "colors")).toBe(1);
    expect(countTypographyTokens(output.metadata.styleTokens)).toBe(2);
    expect(countAssets(output.metadata)).toBe(2);
    expect(previewImageFromOutput(output)).toBe("https://example.com/preview.png");
  });

  it("maps raw imported block arrays and infers missing generated values", () => {
    const output = [
      {
        id: "block-1",
        markup: `<section style="color:#111;font-size:16px"><img src="img/photo.webp" /></section>`,
      },
      {
        id: "block-2",
        originalHtml: `<div class="text-xl font-bold" style="background:rgb(255, 255, 255)"></div>`,
      },
    ] as any;

    expect(importStats(output)).toEqual({
      components: 2,
      colorTokens: 2,
      fontStyles: 3,
      assets: 1,
    });
  });

  it("finds image assets without a direct preview and handles empty inputs", () => {
    const output = {
      blocks: undefined,
      metadata: {
        styleTokens: {},
        assets: [{ kind: "script", path: "app.js" }, { kind: "image", url: "https://example.com/card.jpg" }],
      },
    } as any;

    expect(importStats(null)).toEqual({ components: 0, colorTokens: 0, fontStyles: 0, assets: 0 });
    expect(countAssets(undefined)).toBe(0);
    expect(countAssets({ assets: { logo: "logo.svg" } })).toBe(1);
    expect(countAssets({ generatedFiles: [null, {}, { key: "asset.ico" }, { path: "font.ttf" }] })).toBe(2);
    expect(countAssets({ generatedFiles: undefined })).toBe(0);
    expect(countStyleTokens(null, "colors")).toBe(0);
    expect(countStyleTokens({ colors: "" }, "colors")).toBe(0);
    expect(countTypographyTokens(null)).toBe(0);
    expect(countTypographyTokens({ typography: "Inter", fonts: "", fontFamilies: [] })).toBe(1);
    expect(previewImageFromOutput(output)).toBe("https://example.com/card.jpg");
    expect(previewImageFromOutput({ metadata: { assets: [{ url: "https://example.com/only-url.png" }] } } as any)).toBe("https://example.com/only-url.png");
    expect(previewImageFromOutput({ metadata: { assets: [null, "logo.svg", {}, { path: "photo.png", url: "local-photo.png" }] } } as any)).toBe("local-photo.png");
    expect(previewImageFromOutput({ metadata: { assets: [{ path: "photo.png" }] } } as any)).toBeNull();
    expect(previewImageFromOutput({ metadata: undefined } as any)).toBeNull();
    expect(previewImageFromOutput({ metadata: { thumbnail: "thumb.jpg", assets: "not-array" } } as any)).toBe("thumb.jpg");
    expect(previewImageFromOutput({ metadata: { previewImage: "preview.jpg" } } as any)).toBe("preview.jpg");
    expect(previewImageFromOutput({ metadata: { thumbnailUrl: "thumb-url.jpg" } } as any)).toBe("thumb-url.jpg");
  });
});
