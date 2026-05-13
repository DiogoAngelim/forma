import { generateDeterministicSuggestions } from '@forma/analysis-engine';
export function createAiProvider(config) {
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
//# sourceMappingURL=providers.js.map