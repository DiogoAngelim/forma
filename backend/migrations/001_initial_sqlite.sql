-- SQLite migration
create table users (
  id text primary key,
  email text not null unique,
  full_name text,
  password_hash text,
  provider text,
  created_at datetime not null default current_timestamp
);

create table subscriptions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  stripe_price_id text,
  plan text not null default 'free',
  status text not null default 'free',
  current_period_end datetime,
  trial_end datetime,
  cancel_at_period_end integer not null default 0,
  metadata text not null default '{}',
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp
);

create unique index subscriptions_user_id_idx on subscriptions(user_id);
create unique index subscriptions_customer_id_idx on subscriptions(stripe_customer_id);
create unique index subscriptions_subscription_id_idx on subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;

create table projects (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  metadata text not null default '{}',
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp
);

create table uploads (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  kind text not null,
  r2_key text not null,
  manifest text not null default '{}',
  created_at datetime not null default current_timestamp
);

create table assets (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  upload_id text not null references uploads(id) on delete cascade,
  path text not null,
  mime text not null,
  size integer not null,
  r2_key text not null,
  metadata text not null default '{}',
  created_at datetime not null default current_timestamp
);

create table processing_sessions (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  status text not null,
  current_stage text not null,
  progress integer not null check (progress >= 0 and progress <= 100),
  logs text not null default '[]',
  metadata text not null default '{}',
  started_at datetime not null default current_timestamp,
  completed_at datetime
);

create table generated_outputs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  session_id text not null references processing_sessions(id) on delete cascade,
  html_entry text not null,
  blocks text not null default '[]',
  markup text not null,
  metadata text not null default '{}',
  artifact_keys text not null default '[]',
  created_at datetime not null default current_timestamp
);

create table analysis_results (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  generated_output_id text not null references generated_outputs(id) on delete cascade,
  result text not null default '{}',
  created_at datetime not null default current_timestamp
);

create table ai_suggestions (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  generated_output_id text not null references generated_outputs(id) on delete cascade,
  title text not null,
  rationale text not null,
  priority text not null,
  action text not null default '{}',
  auto_applicable integer not null default 0,
  status text not null default 'pending',
  created_at datetime not null default current_timestamp,
  applied_at datetime
);

create table exports (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  generated_output_id text not null references generated_outputs(id) on delete cascade,
  type text not null,
  r2_key text not null,
  metadata text not null default '{}',
  created_at datetime not null default current_timestamp
);

create table project_versions (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  generated_output_id text not null references generated_outputs(id) on delete cascade,
  label text not null,
  snapshot text not null,
  created_at datetime not null default current_timestamp
);

create table public_projects (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  slug text not null unique,
  title text not null,
  before_snapshot text not null,
  after_snapshot text not null,
  metadata text not null default '{}',
  created_at datetime not null default current_timestamp
);

create table project_events (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  event text not null,
  data text not null,
  created_at datetime not null default current_timestamp
);
