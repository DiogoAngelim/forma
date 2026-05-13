import type { AiSuggestion, AnalysisResult, GeneratedOutput } from '@forma/shared';
export type BundleAsset = {
    path: string;
    mime: string;
    content: string;
};
export type AnalysisInput = {
    generated: GeneratedOutput;
    assets: BundleAsset[];
};
export declare function analyzeGeneratedOutput(input: AnalysisInput): AnalysisResult;
export declare function generateDeterministicSuggestions(projectId: string, analysis: AnalysisResult): AiSuggestion[];
export declare function applySuggestionToOutput(output: GeneratedOutput, suggestion: Pick<AiSuggestion, 'action'>): GeneratedOutput;
//# sourceMappingURL=index.d.ts.map