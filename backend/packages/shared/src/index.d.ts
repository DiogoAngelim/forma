import { z } from 'zod';
export declare const processingStages: readonly ["uploaded", "converting_gutenberg", "analyzing_output", "generating_ai_suggestions", "building_export", "storing_artifacts", "completed", "failed"];
export declare const processingStageSchema: z.ZodEnum<["uploaded", "converting_gutenberg", "analyzing_output", "generating_ai_suggestions", "building_export", "storing_artifacts", "completed", "failed"]>;
export declare const processingSessionSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodString;
    currentStage: z.ZodEnum<["uploaded", "converting_gutenberg", "analyzing_output", "generating_ai_suggestions", "building_export", "storing_artifacts", "completed", "failed"]>;
    progress: z.ZodNumber;
    logs: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    startedAt: z.ZodString;
    completedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: string;
    id: string;
    metadata: Record<string, unknown>;
    projectId: string;
    currentStage: "uploaded" | "converting_gutenberg" | "analyzing_output" | "generating_ai_suggestions" | "building_export" | "storing_artifacts" | "completed" | "failed";
    progress: number;
    logs: Record<string, unknown>[];
    startedAt: string;
    completedAt?: string | undefined;
}, {
    status: string;
    id: string;
    projectId: string;
    currentStage: "uploaded" | "converting_gutenberg" | "analyzing_output" | "generating_ai_suggestions" | "building_export" | "storing_artifacts" | "completed" | "failed";
    progress: number;
    startedAt: string;
    metadata?: Record<string, unknown> | undefined;
    logs?: Record<string, unknown>[] | undefined;
    completedAt?: string | undefined;
}>;
export type ProcessingStage = z.infer<typeof processingStageSchema>;
export type ProjectProcessingSession = z.infer<typeof processingSessionSchema>;
export declare const sseEventNames: readonly ["upload.progress", "conversion.progress", "analysis.progress", "suggestions.generated", "export.ready", "preview.updated"];
export declare const sseEventSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    event: z.ZodEnum<["upload.progress", "conversion.progress", "analysis.progress", "suggestions.generated", "export.ready", "preview.updated"]>;
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    projectId: string;
    event: "upload.progress" | "conversion.progress" | "analysis.progress" | "suggestions.generated" | "export.ready" | "preview.updated";
    data: Record<string, unknown>;
    createdAt: string;
}, {
    id: string;
    projectId: string;
    event: "upload.progress" | "conversion.progress" | "analysis.progress" | "suggestions.generated" | "export.ready" | "preview.updated";
    data: Record<string, unknown>;
    createdAt: string;
}>;
export type SseEventName = (typeof sseEventNames)[number];
export type ProjectEvent = z.infer<typeof sseEventSchema>;
export declare const generatedOutputSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    sessionId: z.ZodString;
    htmlEntry: z.ZodString;
    blocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    markup: z.ZodString;
    metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    artifactKeys: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    metadata: Record<string, unknown>;
    projectId: string;
    createdAt: string;
    sessionId: string;
    htmlEntry: string;
    blocks: Record<string, unknown>[];
    markup: string;
    artifactKeys: string[];
}, {
    id: string;
    metadata: Record<string, unknown>;
    projectId: string;
    createdAt: string;
    sessionId: string;
    htmlEntry: string;
    blocks: Record<string, unknown>[];
    markup: string;
    artifactKeys: string[];
}>;
export type GeneratedOutput = z.infer<typeof generatedOutputSchema>;
export declare const analysisResultSchema: z.ZodObject<{
    reusableBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    layoutBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    sectionBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    textBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    mediaBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    navigationBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    footerBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    heroBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    cardBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    pricingBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    ctaBlocks: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    typography: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    colors: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    structure: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    reusableBlocks: Record<string, unknown>[];
    layoutBlocks: Record<string, unknown>[];
    sectionBlocks: Record<string, unknown>[];
    textBlocks: Record<string, unknown>[];
    mediaBlocks: Record<string, unknown>[];
    navigationBlocks: Record<string, unknown>[];
    footerBlocks: Record<string, unknown>[];
    heroBlocks: Record<string, unknown>[];
    cardBlocks: Record<string, unknown>[];
    pricingBlocks: Record<string, unknown>[];
    ctaBlocks: Record<string, unknown>[];
    typography: Record<string, unknown>;
    colors: Record<string, unknown>;
    structure: Record<string, unknown>;
}, {
    reusableBlocks: Record<string, unknown>[];
    layoutBlocks: Record<string, unknown>[];
    sectionBlocks: Record<string, unknown>[];
    textBlocks: Record<string, unknown>[];
    mediaBlocks: Record<string, unknown>[];
    navigationBlocks: Record<string, unknown>[];
    footerBlocks: Record<string, unknown>[];
    heroBlocks: Record<string, unknown>[];
    cardBlocks: Record<string, unknown>[];
    pricingBlocks: Record<string, unknown>[];
    ctaBlocks: Record<string, unknown>[];
    typography: Record<string, unknown>;
    colors: Record<string, unknown>;
    structure: Record<string, unknown>;
}>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export declare const suggestionActionSchema: z.ZodObject<{
    type: z.ZodEnum<["merge_blocks", "normalize_typography", "extract_reusable_block", "replace_blocks", "rewrite_styles", "semantic_grouping"]>;
    targetIds: z.ZodArray<z.ZodString, "many">;
    parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "merge_blocks" | "normalize_typography" | "extract_reusable_block" | "replace_blocks" | "rewrite_styles" | "semantic_grouping";
    targetIds: string[];
    parameters: Record<string, unknown>;
}, {
    type: "merge_blocks" | "normalize_typography" | "extract_reusable_block" | "replace_blocks" | "rewrite_styles" | "semantic_grouping";
    targetIds: string[];
    parameters?: Record<string, unknown> | undefined;
}>;
export declare const aiSuggestionSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    title: z.ZodString;
    rationale: z.ZodString;
    priority: z.ZodEnum<["low", "medium", "high"]>;
    action: z.ZodObject<{
        type: z.ZodEnum<["merge_blocks", "normalize_typography", "extract_reusable_block", "replace_blocks", "rewrite_styles", "semantic_grouping"]>;
        targetIds: z.ZodArray<z.ZodString, "many">;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        type: "merge_blocks" | "normalize_typography" | "extract_reusable_block" | "replace_blocks" | "rewrite_styles" | "semantic_grouping";
        targetIds: string[];
        parameters: Record<string, unknown>;
    }, {
        type: "merge_blocks" | "normalize_typography" | "extract_reusable_block" | "replace_blocks" | "rewrite_styles" | "semantic_grouping";
        targetIds: string[];
        parameters?: Record<string, unknown> | undefined;
    }>;
    autoApplicable: z.ZodBoolean;
    status: z.ZodDefault<z.ZodEnum<["pending", "applied", "dismissed"]>>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "applied" | "dismissed";
    id: string;
    projectId: string;
    createdAt: string;
    title: string;
    rationale: string;
    priority: "low" | "medium" | "high";
    action: {
        type: "merge_blocks" | "normalize_typography" | "extract_reusable_block" | "replace_blocks" | "rewrite_styles" | "semantic_grouping";
        targetIds: string[];
        parameters: Record<string, unknown>;
    };
    autoApplicable: boolean;
}, {
    id: string;
    projectId: string;
    createdAt: string;
    title: string;
    rationale: string;
    priority: "low" | "medium" | "high";
    action: {
        type: "merge_blocks" | "normalize_typography" | "extract_reusable_block" | "replace_blocks" | "rewrite_styles" | "semantic_grouping";
        targetIds: string[];
        parameters?: Record<string, unknown> | undefined;
    };
    autoApplicable: boolean;
    status?: "pending" | "applied" | "dismissed" | undefined;
}>;
export type SuggestionAction = z.infer<typeof suggestionActionSchema>;
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;
export declare const exportRequestSchema: z.ZodObject<{
    type: z.ZodEnum<["plugin_zip", "blocks_only", "block_library", "style_tokens", "tailwind_config"]>;
}, "strip", z.ZodTypeAny, {
    type: "plugin_zip" | "blocks_only" | "block_library" | "style_tokens" | "tailwind_config";
}, {
    type: "plugin_zip" | "blocks_only" | "block_library" | "style_tokens" | "tailwind_config";
}>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export declare class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: unknown;
    constructor(statusCode: number, code: string, message: string, details?: unknown);
}
export declare const jsonRecord: z.ZodRecord<z.ZodString, z.ZodUnknown>;
//# sourceMappingURL=index.d.ts.map