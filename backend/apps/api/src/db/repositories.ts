import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { AiSuggestion, GeneratedOutput, ProcessingStage } from '@forma/shared';
import type { Database } from './schema.js';
import type { SessionStore } from '../pipeline/orchestrator.js';

export class KyselySessionStore implements SessionStore {
  constructor(private readonly db: Kysely<Database>) { }

  async createSession(projectId: string): Promise<string> {
    const id = randomUUID();
    await this.db
      .insertInto('processing_sessions')
      .values({
        id,
        project_id: projectId,
        status: 'running',
        current_stage: 'uploaded',
        progress: 0,
        logs: json([]),
        metadata: json({}),
        started_at: new Date().toISOString()
      })
      .execute();
    return id;
  }

  async updateSession(id: string, stage: ProcessingStage, progress: number, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.db
      .updateTable('processing_sessions')
      .set({
        current_stage: stage,
        progress,
        status: stage === 'completed' ? 'completed' : stage === 'failed' ? 'failed' : 'running',
        metadata: json(metadata),
        completed_at: stage === 'completed' || stage === 'failed' ? new Date().toISOString() : null
      })
      .where('id', '=', id)
      .execute();
  }

  async saveGeneratedOutput(output: GeneratedOutput): Promise<void> {
    await this.db
      .insertInto('generated_outputs')
      .values({
        id: output.id,
        project_id: output.projectId,
        session_id: output.sessionId,
        html_entry: output.htmlEntry,
        blocks: json(output.blocks),
        markup: output.markup,
        metadata: json(output.metadata),
        artifact_keys: json(output.artifactKeys),
        created_at: output.createdAt
      })
      .execute();
  }

  async saveAnalysis(projectId: string, generatedOutputId: string, result: Record<string, unknown>): Promise<void> {
    await this.db
      .insertInto('analysis_results')
      .values({ id: randomUUID(), project_id: projectId, generated_output_id: generatedOutputId, result: json(result), created_at: new Date().toISOString() })
      .execute();
  }

  async saveSuggestions(generatedOutputId: string, suggestions: AiSuggestion[]): Promise<void> {
    for (const suggestion of suggestions) {
      await this.db
        .insertInto('ai_suggestions')
        .values({
          id: suggestion.id,
          project_id: suggestion.projectId,
          generated_output_id: generatedOutputId,
          title: suggestion.title,
          rationale: suggestion.rationale,
          priority: suggestion.priority,
          action: json(suggestion.action),
          auto_applicable: suggestion.autoApplicable ? 1 : 0,
          status: suggestion.status,
          created_at: suggestion.createdAt
        })
        .execute();
    }
  }

  async saveExport(projectId: string, generatedOutputId: string, type: string, r2Key: string, metadata: Record<string, unknown>): Promise<void> {
    await this.db
      .insertInto('exports')
      .values({ id: randomUUID(), project_id: projectId, generated_output_id: generatedOutputId, type, r2_key: r2Key, metadata: json(metadata), created_at: new Date().toISOString() })
      .execute();
  }

  async latestOutput(projectId: string): Promise<GeneratedOutput | undefined> {
    const row = await this.db
      .selectFrom('generated_outputs')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id,
      htmlEntry: row.html_entry,
      blocks: parseJson(row.blocks, []),
      markup: row.markup,
      metadata: parseJson(row.metadata, {}),
      artifactKeys: parseJson(row.artifact_keys, []),
      createdAt: timestamp(row.created_at)
    };
  }

  async getSuggestion(projectId: string, suggestionId: string): Promise<AiSuggestion | undefined> {
    const row = await this.db.selectFrom('ai_suggestions').selectAll().where('project_id', '=', projectId).where('id', '=', suggestionId).executeTakeFirst();
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      rationale: row.rationale,
      priority: row.priority as AiSuggestion['priority'],
      action: parseJson(row.action, {}) as AiSuggestion['action'],
      autoApplicable: Boolean(row.auto_applicable),
      status: row.status as AiSuggestion['status'],
      createdAt: timestamp(row.created_at)
    };
  }

  async markSuggestionApplied(suggestionId: string): Promise<void> {
    await this.db.updateTable('ai_suggestions').set({ status: 'applied', applied_at: new Date().toISOString() }).where('id', '=', suggestionId).execute();
  }
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value ?? fallback) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function timestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
