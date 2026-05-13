import type { Kysely } from 'kysely';
import type { AiSuggestion, GeneratedOutput, ProcessingStage } from '@forma/shared';
import type { Database } from './schema.js';
import type { SessionStore } from '../pipeline/orchestrator.js';
export declare class KyselySessionStore implements SessionStore {
    private readonly db;
    constructor(db: Kysely<Database>);
    createSession(projectId: string): Promise<string>;
    updateSession(id: string, stage: ProcessingStage, progress: number, metadata?: Record<string, unknown>): Promise<void>;
    saveGeneratedOutput(output: GeneratedOutput): Promise<void>;
    saveAnalysis(projectId: string, generatedOutputId: string, result: Record<string, unknown>): Promise<void>;
    saveSuggestions(generatedOutputId: string, suggestions: AiSuggestion[]): Promise<void>;
    saveExport(projectId: string, generatedOutputId: string, type: string, r2Key: string, metadata: Record<string, unknown>): Promise<void>;
    latestOutput(projectId: string): Promise<GeneratedOutput | undefined>;
    getSuggestion(projectId: string, suggestionId: string): Promise<AiSuggestion | undefined>;
    markSuggestionApplied(suggestionId: string): Promise<void>;
}
//# sourceMappingURL=repositories.d.ts.map