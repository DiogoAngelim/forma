import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { generateGutenberg, generateMultiBlockPluginZipBuffer, generatePluginZipBuffer, normalizeConverterOutput, selectHtmlEntries, selectHtmlEntry, type ArtifactWriter } from './index.js';

const writer: ArtifactWriter = {
  async putObject(key) {
    return { key, url: `https://r2.example/${key}` };
  }
};

describe('gutenberg generator', () => {
  it('selects index html first', () => {
    const selected = selectHtmlEntry([
      { path: 'about.html', mime: 'text/html', size: 1, content: Buffer.from('about') },
      { path: 'public/index.html', mime: 'text/html', size: 1, content: Buffer.from('index') }
    ]);

    expect(selected.path).toBe('public/index.html');
  });

  it('normalizes string converter output', () => {
    const normalized = normalizeConverterOutput('<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->', '<p>Hello</p>');

    expect(normalized.markup).toBe('<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->');
    expect(normalized.blocks[0]?.name).toBe('core/paragraph');
  });

  it('normalizes object and fallback converter outputs', () => {
    expect(normalizeConverterOutput({ html: '<p className="lead">Fallback</p>' }, '<p>Source</p>').markup).toBe(
      '<!-- wp:html -->\n<p class="lead">Fallback</p>\n<!-- /wp:html -->'
    );
    expect(normalizeConverterOutput({ html: '<p>Fallback</p>' }, '<p>Source</p>').blocks[0]?.name).toBe('core/html');
    expect(normalizeConverterOutput({ blocks: [] }, '<p>Source</p>').markup).toBe(
      '<!-- wp:html -->\n<p>Source</p>\n<!-- /wp:html -->'
    );
    expect(normalizeConverterOutput({ blocks: [{ type: 'core/heading' }, 'raw'], content: '<h1>Hi</h1>' }, '').blocks).toEqual([
      { id: 'block-1', name: 'core/heading', type: 'core/heading' },
      { id: 'block-2', name: 'core/html', originalHtml: 'raw' }
    ]);
    expect(normalizeConverterOutput(null, '<main>Source</main>').markup).toBe(
      '<!-- wp:html -->\n<main>Source</main>\n<!-- /wp:html -->'
    );
  });

  it('normalizes generated converter file maps into block metadata', () => {
    const normalized = normalizeConverterOutput(
      {
        'block.js': "registerBlockType('wp/gridwithlargeroundimages', { title: 'Grid' });",
        'style.css': '.wp-block-wp-gridwithlargeroundimages{}'
      },
      '<section class="team">Team</section>',
      { title: 'Grid', slug: 'grid-with-large-round-images', namespace: 'wp' }
    );

    expect(normalized.markup).toBe('<!-- wp:wp/gridwithlargeroundimages -->\n<section class="team">Team</section>\n<!-- /wp:wp/gridwithlargeroundimages -->');
    expect(normalized.blocks).toEqual([
      expect.objectContaining({ id: 'block-1', name: 'wp/gridwithlargeroundimages', originalHtml: '<section class="team">Team</section>' })
    ]);
    expect(normalized.generatedFiles?.['block.js']).toContain('registerBlockType');
  });

  it('keeps semantic html sections in a single generated block', () => {
    const normalized = normalizeConverterOutput(
      {
        'block.js': "registerBlockType('wp/landingpage', { title: 'Landing' });",
        'style.css': '.hero{color:#123456}'
      },
      '<header class="hero"><h1>Hero</h1></header><section><h2>Features</h2></section><footer>Bye</footer>',
      { title: 'Landing Page', slug: 'landing-page', namespace: 'wp' }
    );

    expect(normalized.blocks).toHaveLength(1);
    expect(normalized.blocks[0]?.name).toBe('wp/landingpage');
    expect(normalized.blocks[0]?.originalHtml).toContain('<header class="hero"><h1>Hero</h1></header>');
    expect(normalized.blocks[0]?.originalHtml).toContain('<section><h2>Features</h2></section>');
    expect(normalized.markup).toContain('<!-- wp:wp/landingpage -->');
    expect((normalized.generatedFiles?.['block.js'] ?? '').match(/registerBlockType/g)).toHaveLength(1);
  });

  it('exports a single plugin file set for multi-section html', async () => {
    const buffer = await generatePluginZipBuffer({
      html: '<header><h1>Hero</h1></header><section><h2>Features</h2></section>',
      projectId: 'project-1',
      sessionId: 'session-1',
      uploadId: 'upload-1',
      converter: () => ({})
    });
    const zip = await JSZip.loadAsync(buffer);

    expect(zip.file('block.js')).toBeDefined();
    expect(zip.file('index.php')).toBeDefined();
    expect(zip.file('forma-generated-block-1-hero/block.js')).toBeNull();
    expect((await zip.file('block.js')?.async('string'))?.match(/registerBlockType/g)).toHaveLength(1);
  });

  it('synthesizes a usable block when the converter returns an incomplete file map', () => {
    const normalized = normalizeConverterOutput(
      {
        'scripts.js': '{"@context":"https://schema.org","@type":"SoftwareApplication"}',
        'style.css': '.team{}'
      },
      '<section className="team"><h2>Team</h2></section>',
      { title: 'Team Grid', slug: 'team-grid', namespace: 'wp' }
    );

    expect(normalized.generatedFiles?.['block.js']).toContain('registerBlockType("wp/teamgrid"');
    expect(normalized.generatedFiles?.['block.js']).toContain('RawHTML');
    expect(normalized.markup).toContain('<!-- wp:wp/teamgrid -->');
    expect(normalized.markup).toContain('class="team"');
    expect(normalized.warnings).toContain('html_to_gutenberg_missing_block_js_fallback_used');
  });

  it('handles partial generated file maps defensively', () => {
    const normalized = normalizeConverterOutput(
      {
        'style.css': '.wp-block-wp-partial{}',
        'index.php': '<?php echo "partial";'
      },
      '<main>Partial</main>'
    );

    expect(normalized.blocks[0]?.name).toBe('core/html');
    expect(normalized.generatedFiles?.['index.php']).toContain('partial');
    expect(normalizeConverterOutput([], '<main>Array fallback</main>').blocks[0]?.name).toBe('core/html');
  });

  it('extracts custom self-closing block comments', () => {
    const normalized = normalizeConverterOutput('<!-- wp:wp/gridwithlargeroundimages {"content":"Hi"} /-->', '');

    expect(normalized.blocks).toEqual([
      { id: 'block-1', name: 'wp/gridwithlargeroundimages', originalHtml: '' }
    ]);
  });

  it('rejects bundles without html', () => {
    expect(() => selectHtmlEntry([{ path: 'style.css', mime: 'text/css', size: 1, content: Buffer.from('') }])).toThrow();
    expect(() => selectHtmlEntries([{ path: 'style.css', mime: 'text/css', size: 1, content: Buffer.from('') }])).toThrow();
  });

  it('preserves uploaded html order as one block per page', async () => {
    const stored: Array<{ key: string; body: Buffer | string; contentType: string }> = [];
    const result = await generateGutenberg({
      projectId: 'project-1',
      sessionId: 'session-1',
      uploadId: 'upload-1',
      files: [
        { path: 'about.html', mime: 'text/html', size: 20, content: Buffer.from('<main>About</main>') },
        { path: 'home.html', mime: 'text/html', size: 20, content: Buffer.from('<main>Home</main>') },
        { path: 'shared.css', mime: 'text/css', size: 12, content: Buffer.from('main{color:#123456}') }
      ],
      artifactWriter: {
        async putObject(key, body, contentType) {
          stored.push({ key, body, contentType });
          return { key, url: `https://r2.example/${key}` };
        }
      },
      converter: () => ({})
    });
    const zipBody = stored.find((item) => item.key.endsWith('/plugin/gutenberg-plugin.zip'))?.body as Buffer;
    const zip = await JSZip.loadAsync(zipBody);

    expect(result.blocks.map((block) => block.sourcePath)).toEqual(['about.html', 'home.html']);
    expect(result.metadata.sourcePages).toEqual([
      expect.objectContaining({ path: 'about.html', order: 0, blockId: 'block-1' }),
      expect.objectContaining({ path: 'home.html', order: 1, blockId: 'block-2' })
    ]);
    expect(result.markup.indexOf('About')).toBeLessThan(result.markup.indexOf('Home'));
    expect(zip.file('01-about/block.js')).toBeDefined();
    expect(zip.file('02-home/block.js')).toBeDefined();
    expect(await zip.file('index.php')?.async('string')).toContain("require_once __DIR__ . '/01-about/index.php';");
  });

  it('exports multiple block folders at zip root', async () => {
    const buffer = await generateMultiBlockPluginZipBuffer({
      projectId: 'project-1',
      sessionId: 'session-1',
      uploadId: 'upload-1',
      blocks: [
        { id: 'block-1', title: 'Hero', sourcePath: 'hero.html', markup: '<!-- wp:wp/hero --><main>Hero</main><!-- /wp:wp/hero -->' },
        { id: 'block-2', title: 'Pricing', sourcePath: 'pricing.html', markup: '<!-- wp:wp/pricing --><main>Pricing</main><!-- /wp:wp/pricing -->' }
      ]
    });
    const zip = await JSZip.loadAsync(buffer);

    expect(zip.file('01-hero/block.js')).toBeDefined();
    expect(zip.file('02-pricing/block.js')).toBeDefined();
    expect(await zip.file('01-hero/block.js')?.async('string')).toContain('Hero');
    expect(await zip.file('02-pricing/block.js')?.async('string')).toContain('Pricing');
  });

  it('generates artifacts around external converter output', async () => {
    const result = await generateGutenberg({
      projectId: 'project-1',
      sessionId: 'session-1',
      uploadId: 'upload-1',
      files: [{ path: 'marketing-hero/index.html', mime: 'text/html', size: 12, content: Buffer.from('<main>Hi</main>') }],
      artifactWriter: writer,
      converter: async (html, options) => {
        expect(options).toMatchObject({ title: 'Marketing Hero', slug: 'marketing-hero', namespace: 'wp' });
        if (options && typeof options === 'object' && 'outputPath' in options) {
          const outputDir = (options as { outputPath: string }).outputPath;
          await writeFile(`${outputDir}/plugin.json`, JSON.stringify({ plugin: 'test', markup: html }));
          await mkdir(`${outputDir}/assets`);
          await writeFile(`${outputDir}/assets/icon.svg`, '<svg></svg>');
        }
        return { markup: '<!-- wp:group --><main>Hi</main><!-- /wp:group -->' };
      }
    });

    expect(result.htmlEntry).toBe('marketing-hero/index.html');
    expect(result.artifactKeys).toHaveLength(3);
    expect(result.metadata.converter).toBe('html-to-gutenberg');
    expect(result.metadata.pluginZipUrl).toBeDefined();
  });

  it('falls back to html block metadata for malformed gutenberg comments', () => {
    expect(normalizeConverterOutput('<!-- wp:broken -->', '').blocks).toEqual([
      { id: 'block-1', name: 'core/html', originalHtml: '<!-- wp:broken -->' }
    ]);
  });

  it('stores generated converter files as first-class artifacts', async () => {
    const stored: Array<{ key: string; body: Buffer | string; contentType: string }> = [];
    const result = await generateGutenberg({
      projectId: 'project-1',
      sessionId: 'session-1',
      uploadId: 'upload-1',
      files: [{ path: 'grid-with-large-round-images/index.html', mime: 'text/html', size: 12, content: Buffer.from('<main>Hi</main>') }],
      artifactWriter: {
        async putObject(key, body, contentType) {
          stored.push({ key, body, contentType });
          return { key, url: `https://r2.example/${key}` };
        }
      },
      converter: () => ({
        'block.js': "registerBlockType('wp/gridwithlargeroundimages', { title: 'Grid' });",
        'style.css': '.wp-block-wp-gridwithlargeroundimages{}',
        'index.php': '<?php echo "grid";'
      })
    });

    expect(result.blocks[0]?.name).toBe('wp/gridwithlargeroundimages');
    expect(result.artifactKeys).toContain('projects/project-1/sessions/session-1/gutenberg/files/block.js');
    expect(result.metadata.generatedFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'block.js', contentType: 'application/javascript' })])
    );
    expect(result.metadata.generatedFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'index.php', contentType: 'application/x-httpd-php' })])
    );
    expect(stored.find((item) => item.key.endsWith('/files/block.js'))?.body).toContain('registerBlockType');
  });

  it('extracts style tokens and local and remote assets into metadata', async () => {
    const result = await generateGutenberg({
      projectId: 'project-1',
      sessionId: 'session-1',
      uploadId: 'upload-1',
      files: [
        {
          path: 'site/index.html',
          mime: 'text/html',
          size: 120,
          content: Buffer.from('<main><img src="https://cdn.example/hero.webp"><video poster="./poster.jpg"></video><style>.hero{color:#ff00aa;font-size:42px;font-family:Inter}</style></main>')
        },
        { path: 'site/poster.jpg', mime: 'image/jpeg', size: 10, content: Buffer.from('jpeg') },
        { path: 'site/tailwind.config.js', mime: 'application/javascript', size: 20, content: Buffer.from('module.exports = {}') }
      ],
      artifactWriter: writer,
      converter: () => ({})
    });

    expect(result.metadata.styleTokens).toMatchObject({
      colors: expect.arrayContaining(['#ff00aa']),
      fontSizes: expect.arrayContaining(['42px']),
      fontFamilies: expect.arrayContaining(['Inter'])
    });
    expect(result.metadata.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'local', path: 'site/poster.jpg', kind: 'image' }),
      expect.objectContaining({ source: 'remote', url: 'https://cdn.example/hero.webp', kind: 'image' }),
      expect.objectContaining({ source: 'remote', url: './poster.jpg', kind: 'image' })
    ]));
  });
});
