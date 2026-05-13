import { z } from 'zod';
export const processingStages = [
    'uploaded',
    'converting_gutenberg',
    'analyzing_output',
    'generating_ai_suggestions',
    'building_export',
    'storing_artifacts',
    'completed',
    'failed'
];
export const processingStageSchema = z.enum(processingStages);
export const processingSessionSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    status: z.string(),
    currentStage: processingStageSchema,
    progress: z.number().min(0).max(100),
    logs: z.array(z.record(z.unknown())).default([]),
    metadata: z.record(z.unknown()).default({}),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional()
});
export const sseEventNames = [
    'upload.progress',
    'conversion.progress',
    'analysis.progress',
    'suggestions.generated',
    'export.ready',
    'preview.updated'
];
export const sseEventSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    event: z.enum(sseEventNames),
    data: z.record(z.unknown()),
    createdAt: z.string().datetime()
});
export const generatedOutputSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    sessionId: z.string().uuid(),
    htmlEntry: z.string(),
    blocks: z.array(z.record(z.unknown())),
    markup: z.string(),
    metadata: z.record(z.unknown()),
    artifactKeys: z.array(z.string()),
    createdAt: z.string().datetime()
});
export const analysisResultSchema = z.object({
    reusableBlocks: z.array(z.record(z.unknown())),
    layoutBlocks: z.array(z.record(z.unknown())),
    sectionBlocks: z.array(z.record(z.unknown())),
    textBlocks: z.array(z.record(z.unknown())),
    mediaBlocks: z.array(z.record(z.unknown())),
    navigationBlocks: z.array(z.record(z.unknown())),
    footerBlocks: z.array(z.record(z.unknown())),
    heroBlocks: z.array(z.record(z.unknown())),
    cardBlocks: z.array(z.record(z.unknown())),
    pricingBlocks: z.array(z.record(z.unknown())),
    ctaBlocks: z.array(z.record(z.unknown())),
    typography: z.record(z.unknown()),
    colors: z.record(z.unknown()),
    structure: z.record(z.unknown())
});
export const suggestionActionSchema = z.object({
    type: z.enum([
        'merge_blocks',
        'normalize_typography',
        'extract_reusable_block',
        'replace_blocks',
        'rewrite_styles',
        'semantic_grouping'
    ]),
    targetIds: z.array(z.string()),
    parameters: z.record(z.unknown()).default({})
});
export const aiSuggestionSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    rationale: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    action: suggestionActionSchema,
    autoApplicable: z.boolean(),
    status: z.enum(['pending', 'applied', 'dismissed']).default('pending'),
    createdAt: z.string().datetime()
});
export const exportRequestSchema = z.object({
    type: z.enum(['plugin_zip', 'react', 'blocks_only', 'block_library', 'style_tokens', 'tailwind_config'])
});
export class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
export const jsonRecord = z.record(z.unknown());
//# sourceMappingURL=index.js.map