import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = ColumnType<Record<string, unknown>, Record<string, unknown> | string, Record<string, unknown> | string>;
type JsonArray = ColumnType<unknown[], unknown[] | string, unknown[] | string>;
type SqliteBoolean = ColumnType<boolean, boolean | number, boolean | number>;
export type UserTable = {
    id: Generated<string>;
    email: string;
    full_name: string | null;
    password_hash: string | null;
    provider: string | null;
    created_at: Timestamp;
};
export type SubscriptionTable = {
    id: Generated<string>;
    user_id: string;
    stripe_customer_id: string;
    stripe_subscription_id: string | null;
    stripe_price_id: string | null;
    plan: string;
    status: string;
    current_period_end: Timestamp | null;
    trial_end: Timestamp | null;
    cancel_at_period_end: SqliteBoolean;
    metadata: Json;
    created_at: Timestamp;
    updated_at: Timestamp;
};
export type ProjectTable = {
    id: Generated<string>;
    user_id: string;
    name: string;
    status: string;
    metadata: Json;
    created_at: Timestamp;
    updated_at: Timestamp;
};
export type UploadTable = {
    id: Generated<string>;
    project_id: string;
    user_id: string;
    kind: string;
    r2_key: string;
    manifest: Json;
    created_at: Timestamp;
};
export type AssetTable = {
    id: Generated<string>;
    project_id: string;
    upload_id: string;
    path: string;
    mime: string;
    size: number;
    r2_key: string;
    metadata: Json;
    created_at: Timestamp;
};
export type ProcessingSessionTable = {
    id: Generated<string>;
    project_id: string;
    status: string;
    current_stage: string;
    progress: number;
    logs: JsonArray;
    metadata: Json;
    started_at: Timestamp;
    completed_at: Timestamp | null;
};
export type GeneratedOutputTable = {
    id: Generated<string>;
    project_id: string;
    session_id: string;
    html_entry: string;
    blocks: JsonArray;
    markup: string;
    metadata: Json;
    artifact_keys: JsonArray;
    created_at: Timestamp;
};
export type AnalysisResultTable = {
    id: Generated<string>;
    project_id: string;
    generated_output_id: string;
    result: Json;
    created_at: Timestamp;
};
export type AiSuggestionTable = {
    id: Generated<string>;
    project_id: string;
    generated_output_id: string;
    title: string;
    rationale: string;
    priority: string;
    action: Json;
    auto_applicable: SqliteBoolean;
    status: string;
    created_at: Timestamp;
    applied_at: Timestamp | null;
};
export type ExportTable = {
    id: Generated<string>;
    project_id: string;
    generated_output_id: string;
    type: string;
    r2_key: string;
    metadata: Json;
    created_at: Timestamp;
};
export type ProjectVersionTable = {
    id: Generated<string>;
    project_id: string;
    generated_output_id: string;
    label: string;
    snapshot: Json;
    created_at: Timestamp;
};
export type PublicProjectTable = {
    id: Generated<string>;
    project_id: string;
    slug: string;
    title: string;
    before_snapshot: Json;
    after_snapshot: Json;
    metadata: Json;
    created_at: Timestamp;
};
export type ProjectEventTable = {
    id: Generated<string>;
    project_id: string;
    event: string;
    data: Json;
    created_at: Timestamp;
};
export type Database = {
    users: UserTable;
    subscriptions: SubscriptionTable;
    projects: ProjectTable;
    uploads: UploadTable;
    assets: AssetTable;
    processing_sessions: ProcessingSessionTable;
    generated_outputs: GeneratedOutputTable;
    analysis_results: AnalysisResultTable;
    ai_suggestions: AiSuggestionTable;
    exports: ExportTable;
    project_versions: ProjectVersionTable;
    public_projects: PublicProjectTable;
    project_events: ProjectEventTable;
};
export type Project = Selectable<ProjectTable>;
export type NewProject = Insertable<ProjectTable>;
export type ProjectUpdate = Updateable<ProjectTable>;
export {};
//# sourceMappingURL=schema.d.ts.map