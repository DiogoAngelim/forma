import type { AiSuggestion, AnalysisResult, GeneratedOutput } from '@forma/shared';
export type AiProvider = {
    suggest: (input: {
        projectId: string;
        output: GeneratedOutput;
        analysis: AnalysisResult;
    }) => Promise<AiSuggestion[]>;
};
export type AiProviderConfig = {
    openAiKey?: string | undefined;
    anthropicKey?: string | undefined;
};
export declare function createAiProvider(config: AiProviderConfig): AiProvider;
//# sourceMappingURL=providers.d.ts.map