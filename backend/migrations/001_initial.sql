create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  password_hash text,
  provider text,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  r2_key text not null,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  upload_id uuid not null references uploads(id) on delete cascade,
  path text not null,
  mime text not null,
  size integer not null,
  r2_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table processing_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null,
  current_stage text not null,
  progress integer not null check (progress >= 0 and progress <= 100),
  logs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table generated_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  session_id uuid not null references processing_sessions(id) on delete cascade,
  html_entry text not null,
  blocks jsonb not null default '[]'::jsonb,
  markup text not null,
  metadata jsonb not null default '{}'::jsonb,
  artifact_keys jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table analysis_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  generated_output_id uuid not null references generated_outputs(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  generated_output_id uuid not null references generated_outputs(id) on delete cascade,
  title text not null,
  rationale text not null,
  priority text not null,
  action jsonb not null default '{}'::jsonb,
  auto_applicable boolean not null default false,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create table exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  generated_output_id uuid not null references generated_outputs(id) on delete cascade,
  type text not null,
  r2_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  generated_output_id uuid not null references generated_outputs(id) on delete cascade,
  label text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public_projects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  slug text not null unique,
  title text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  event text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index projects_user_id_idx on projects(user_id);
create index uploads_project_id_idx on uploads(project_id);
create index processing_sessions_project_id_idx on processing_sessions(project_id);
create index generated_outputs_project_id_created_at_idx on generated_outputs(project_id, created_at desc);
create index ai_suggestions_project_id_idx on ai_suggestions(project_id);
create index exports_project_id_idx on exports(project_id);
create index project_versions_project_id_idx on project_versions(project_id);
create index project_events_project_id_created_at_idx on project_events(project_id, created_at desc);
