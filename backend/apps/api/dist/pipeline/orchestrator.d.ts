import { type ProjectBundleFile } from '@forma/gutenberg-generator';
import type { AiSuggestion, ExportRequest, GeneratedOutput, ProcessingStage } from '@forma/shared';
import type { AiProvider } from '../ai/providers.js';
import type { ObjectStorage } from '../storage/r2.js';
import type { ProjectEventBroker } from '../events/broker.js';
export type SessionStore = {
    createSession: (projectId: string) => Promise<string>;
    updateSession: (id: string, stage: ProcessingStage, progress: number, metadata?: Record<string, unknown>) => Promise<void>;
    saveGeneratedOutput: (output: GeneratedOutput) => Promise<void>;
    saveAnalysis: (projectId: string, generatedOutputId: string, result: Record<string, unknown>) => Promise<void>;
    saveSuggestions: (generatedOutputId: string, suggestions: AiSuggestion[]) => Promise<void>;
    saveExport: (projectId: string, generatedOutputId: string, type: string, r2Key: string, metadata: Record<string, unknown>) => Promise<void>;
    latestOutput: (projectId: string) => Promise<GeneratedOutput | undefined>;
    getSuggestion: (projectId: string, suggestionId: string) => Promise<AiSuggestion | undefined>;
    markSuggestionApplied: (suggestionId: string) => Promise<void>;
};
export type PipelineDeps = {
    store: SessionStore;
    storage: ObjectStorage;
    events: ProjectEventBroker;
    ai: AiProvider;
};
export declare function processProjectBundle(deps: PipelineDeps, input: {
    projectId: string;
    uploadId: string;
    files: ProjectBundleFile[];
}): Promise<{
    sessionId: string;
    output: GeneratedOutput;
    suggestions: AiSuggestion[];
}>;
export declare function applyProjectSuggestion(deps: PipelineDeps, input: {
    projectId: string;
    suggestionId: string;
}): Promise<GeneratedOutput>;
export declare function exportProject(deps: PipelineDeps, input: {
    projectId: string;
    request: ExportRequest;
}): Promise<{
    key: string;
    url: string;
}>;
//# sourceMappingURL=orchestrator.d.ts.map