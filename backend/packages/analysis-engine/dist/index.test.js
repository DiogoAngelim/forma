import { describe, expect, it } from 'vitest';
import { analyzeGeneratedOutput, applySuggestionToOutput, generateDeterministicSuggestions } from './index.js';
const output = {
    id: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000002',
    sessionId: '00000000-0000-4000-8000-000000000003',
    htmlEntry: 'index.html',
    blocks: [{ id: 'block-1', name: 'core/group' }],
    markup: `
    <title>Demo</title>
    <main>
      <section class="hero"><h1>Build faster</h1></section>
      <section class="hero"><h1>Launch faster</h1></section>
      <article class="card">Same card</article>
      <article class="card">Same card</article>
      <nav id="primary">Nav</nav>
      <img aria-label="Logo" src="/logo.png">
      <footer>Footer</footer>
    </main>
  `,
    metadata: {},
    artifactKeys: [],
    createdAt: new Date().toISOString()
};
describe('analysis engine', () => {
    it('extracts semantic block candidates and style tokens', () => {
        const result = analyzeGeneratedOutput({
            generated: output,
            assets: [
                {
                    path: 'styles.css',
                    mime: 'text/css',
                    content: 'h1{font-size:48px;color:#ff0000}.x{font-family:Inter;font-size:14px;color:rgba(0,0,0,.4)}'
                }
            ]
        });
        expect(result.heroBlocks).toHaveLength(2);
        expect(result.footerBlocks).toHaveLength(1);
        expect(result.navigationBlocks[0]?.selector).toBe('#primary');
        expect(result.mediaBlocks[0]?.label).toBe('Logo');
        expect(result.structure.title).toBe('Demo');
        expect(result.typography.distinctFontSizes).toBe(2);
        expect(result.typography.fontFamilies).toEqual(['Inter']);
        expect(result.colors.distinctColors).toBe(2);
    });
    it('creates executable suggestions', () => {
        const analysis = analyzeGeneratedOutput({
            generated: output,
            assets: [
                {
                    path: 'tokens.css',
                    mime: 'text/css',
                    content: '.a{font-size:1px;color:#000}.b{font-size:2px;color:#111}.c{font-size:3px;color:#222}.d{font-size:4px;color:#333}.e{font-size:5px;color:#444}.f{font-size:6px;color:#555}.g{font-size:7px;color:#666}.h{color:#777}.i{color:#888}.j{color:#999}'
                }
            ]
        });
        const suggestions = generateDeterministicSuggestions(output.projectId, analysis);
        expect(suggestions.some((suggestion) => suggestion.action.type === 'merge_blocks')).toBe(true);
        expect(suggestions.some((suggestion) => suggestion.action.type === 'normalize_typography')).toBe(true);
        expect(suggestions.some((suggestion) => suggestion.action.type === 'rewrite_styles')).toBe(true);
        expect(suggestions.every((suggestion) => suggestion.autoApplicable)).toBe(true);
        expect(generateDeterministicSuggestions(output.projectId, {
            reusableBlocks: [],
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
        })).toEqual([]);
    });
    it('applies transformations without changing converter responsibility', () => {
        const transformed = applySuggestionToOutput(output, {
            action: {
                type: 'normalize_typography',
                targetIds: [],
                parameters: { maxScaleSteps: 6 }
            }
        });
        expect(transformed.markup).toContain('forma:normalize_typography');
        expect(transformed.metadata.appliedActions).toHaveLength(1);
    });
    it('applies block extraction and default replacement actions', () => {
        const extracted = applySuggestionToOutput(output, {
            action: { type: 'extract_reusable_block', targetIds: ['hero-1'], parameters: {} }
        });
        const replaced = applySuggestionToOutput(output, {
            action: { type: 'replace_blocks', targetIds: ['block-1'], parameters: {} }
        });
        expect(extracted.metadata.reusableBlockIds).toEqual(['hero-1']);
        expect(replaced.metadata.appliedActions).toHaveLength(1);
    });
});
//# sourceMappingURL=index.test.js.map