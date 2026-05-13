import * as cheerio from 'cheerio';
import { parse as parseCss } from 'css-tree';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';
import { randomUUID } from 'node:crypto';
export function analyzeGeneratedOutput(input) {
    const $ = cheerio.load(input.generated.markup);
    const dom = new JSDOM(input.generated.markup);
    /* v8 ignore next -- either MIME or path can identify CSS depending on upload source */
    const cssAssets = input.assets.filter((asset) => asset.mime.includes('css') || asset.path.endsWith('.css'));
    const css = cssAssets.map((asset) => asset.content).join('\n');
    const typography = extractTypography(css);
    const colors = extractColors(css);
    return {
        reusableBlocks: findRepeatedSections($),
        layoutBlocks: findBySelector($, 'main, section, article, aside', 'layout'),
        sectionBlocks: findBySelector($, 'section', 'section'),
        textBlocks: findBySelector($, 'h1,h2,h3,h4,h5,h6,p,blockquote,li', 'text'),
        mediaBlocks: findBySelector($, 'img,video,picture,figure,svg', 'media'),
        navigationBlocks: findBySelector($, 'nav,header [role="navigation"],.nav,.navbar', 'navigation'),
        footerBlocks: findBySelector($, 'footer', 'footer'),
        heroBlocks: findSemanticSections($, ['hero', 'headline', 'masthead'], 'hero'),
        cardBlocks: findSemanticSections($, ['card', 'tile'], 'card'),
        pricingBlocks: findSemanticSections($, ['pricing', 'price', 'plan'], 'pricing'),
        ctaBlocks: findSemanticSections($, ['cta', 'call-to-action', 'signup'], 'cta'),
        typography,
        colors,
        structure: {
            /* v8 ignore next -- absent title is valid bundle metadata */
            title: dom.window.document.querySelector('title')?.textContent ?? null,
            blockCount: input.generated.blocks.length,
            assetCount: input.assets.length,
            htmlEntry: input.generated.htmlEntry
        }
    };
}
export function generateDeterministicSuggestions(projectId, analysis) {
    const suggestions = [];
    if (analysis.reusableBlocks.length > 0) {
        suggestions.push(createSuggestion(projectId, 'Extract repeated sections into reusable blocks', 'Repeated markup appears multiple times and can become a reusable Gutenberg pattern.', 'high', {
            type: 'extract_reusable_block',
            targetIds: idsOf(analysis.reusableBlocks),
            parameters: { source: 'analysis.reusableBlocks' }
        }));
    }
    if (Number(analysis.typography.distinctFontSizes ?? 0) > 6) {
        suggestions.push(createSuggestion(projectId, 'Normalize typography scale', 'The bundle contains many font sizes that can be mapped to a smaller token scale.', 'medium', {
            type: 'normalize_typography',
            targetIds: [],
            parameters: { maxScaleSteps: 6 }
        }));
    }
    if (Number(analysis.colors.distinctColors ?? 0) > 8) {
        suggestions.push(createSuggestion(projectId, 'Normalize color tokens', 'The generated output uses more colors than a maintainable block theme usually needs.', 'medium', {
            type: 'rewrite_styles',
            targetIds: [],
            parameters: { strategy: 'cluster_nearest_tokens' }
        }));
    }
    if (analysis.heroBlocks.length > 1) {
        suggestions.push(createSuggestion(projectId, 'Merge hero variants into a block library item', 'Multiple hero-like sections can share a block definition with editable attributes.', 'high', {
            type: 'merge_blocks',
            targetIds: idsOf(analysis.heroBlocks),
            parameters: { blockName: 'Hero' }
        }));
    }
    return suggestions;
}
export function applySuggestionToOutput(output, suggestion) {
    const action = suggestion.action;
    const metadata = {
        ...output.metadata,
        appliedActions: [...(output.metadata.appliedActions ?? []), action]
    };
    if (action.type === 'normalize_typography' || action.type === 'rewrite_styles') {
        return {
            ...output,
            metadata,
            markup: injectFormaStyle(output.markup, action.type)
        };
    }
    if (action.type === 'extract_reusable_block' || action.type === 'merge_blocks' || action.type === 'semantic_grouping') {
        return {
            ...output,
            metadata: {
                ...metadata,
                reusableBlockIds: action.targetIds
            }
        };
    }
    return {
        ...output,
        metadata
    };
}
function injectFormaStyle(markup, actionType) {
    const style = actionType === 'normalize_typography'
        ? ':where(.forma-ai-normalized) h1,:where(.forma-ai-normalized) h2,:where(.forma-ai-normalized) h3{line-height:1.05}:where(.forma-ai-normalized) p{line-height:1.6}'
        : ':where(.forma-ai-normalized){--forma-surface:#ffffff;--forma-text:#111827;--forma-accent:#2563eb;color:var(--forma-text)}';
    const wrapped = `<div class="forma-ai-normalized">${markup}</div>`;
    return `<style data-forma-ai="${actionType}">${style}</style>\n${wrapped}`;
}
function findBySelector($, selector, kind) {
    return $(selector)
        .toArray()
        .map((element, index) => candidate($, element, kind, `${kind}-${index + 1}`));
}
function findSemanticSections($, terms, kind) {
    const selector = terms.map((term) => `[class*="${term}"],[id*="${term}"],[data-block*="${term}"]`).join(',');
    return findBySelector($, selector, kind);
}
function findRepeatedSections($) {
    const sections = $('section, article, .card, [class*="card"]')
        .toArray()
        .map((element) => cheerio.load($.html(element)).text().replace(/\s+/g, ' ').trim().slice(0, 80))
        .filter(Boolean);
    const repeated = new Set(sections.filter((text, index) => sections.indexOf(text) !== index));
    return $('section, article, .card, [class*="card"]')
        .toArray()
        .filter((element) => repeated.has(cheerio.load($.html(element)).text().replace(/\s+/g, ' ').trim().slice(0, 80)))
        .map((element, index) => candidate($, element, 'reusable', `reusable-${index + 1}`));
}
function candidate($, element, kind, id) {
    const node = $(element);
    const raw = element;
    const label = node.attr('aria-label') ?? node.attr('id') ?? node.attr('class') ?? raw?.tagName ?? 'node';
    return {
        id,
        kind,
        selector: selectorFor(element),
        label,
        textLength: node.text().trim().length
    };
}
function selectorFor(element) {
    const node = element;
    /* v8 ignore next -- Cheerio selectors used here always provide tagName */
    const tagName = node.tagName ?? 'node';
    const id = node.attribs?.id;
    const className = node.attribs?.class?.split(/\s+/)[0];
    return id ? `#${id}` : className ? `${tagName}.${className}` : tagName;
}
function extractTypography(css) {
    const sizes = new Set();
    const families = new Set();
    /* v8 ignore next -- empty CSS is accepted as a no-token stylesheet */
    const root = postcss.parse(css || '');
    root.walkDecls((decl) => {
        if (decl.prop === 'font-size')
            sizes.add(decl.value);
        if (decl.prop === 'font-family')
            families.add(decl.value);
    });
    return {
        fontSizes: [...sizes],
        fontFamilies: [...families],
        distinctFontSizes: sizes.size
    };
}
function extractColors(css) {
    const colors = new Set();
    if (css.trim().length > 0) {
        parseCss(css, {
            /* v8 ignore next -- only invalid CSS from user bundles enters this callback */
            onParseError() {
                return undefined;
            }
        });
    }
    const colorPattern = /#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/gi;
    for (const match of css.matchAll(colorPattern)) {
        colors.add(match[0].toLowerCase());
    }
    return {
        colors: [...colors],
        distinctColors: colors.size
    };
}
function createSuggestion(projectId, title, rationale, priority, action) {
    return {
        id: randomUUID(),
        projectId,
        title,
        rationale,
        priority,
        action,
        autoApplicable: true,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
}
function idsOf(items) {
    return items.map((item) => String(item.id)).filter(Boolean);
}
//# sourceMappingURL=index.js.map