import type { AiSuggestion, AnalysisResult, GeneratedOutput } from '@forma/shared';
import { generateDeterministicSuggestions } from '@forma/analysis-engine';

export type AiProvider = {
  suggest: (input: { projectId: string; output: GeneratedOutput; analysis: AnalysisResult }) => Promise<AiSuggestion[]>;
};

export type AiProviderConfig = {
  openAiKey?: string | undefined;
  anthropicKey?: string | undefined;
};

export function createAiProvider(config: AiProviderConfig): AiProvider {
  return {
    async suggest(input) {
      if (!config.openAiKey) {
        return [];
      }

      const deterministic = generateDeterministicSuggestions(input.projectId, input.analysis);

      return deterministic.map((suggestion) => ({
        ...suggestion,
        rationale: `${suggestion.rationale} This can be applied automatically to the generated output.`
      }));
    }
  };
}
