# Forma Gutenberg Platform

Production-oriented backend scaffold for an AI-assisted frontend-to-Gutenberg visual builder SaaS.

The platform treats generated Gutenberg output as the source of truth, then layers analysis, executable AI suggestions, previews, exports, publishing, and versioning around it.

## Stack

- Node.js, TypeScript, Fastify
- PostgreSQL compatible with Neon
- Kysely
- Cloudflare R2
- SSE
- Zod
- Pino

## Structure

```txt
apps/api                 Fastify API and serverless orchestration
apps/web                 Frontend placeholder for React/Zustand/React Query clients
packages/shared          Contracts, schemas, error primitives
packages/gutenberg-generator html-to-gutenberg orchestration wrapper
packages/analysis-engine Bundle/output analysis and transformations
migrations               SQL migrations for Neon PostgreSQL
```

## Development

```bash
npm install
cp .env.example .env
npm run build
npm test
npm run dev
```

## Migration

Apply `migrations/001_initial.sql` to Neon. The app uses JSONB for generated outputs, analysis, AI suggestions, exports, and metadata so the pipeline can evolve without churn.

## Coverage Policy

`vitest` is configured with 100% global coverage thresholds for statements, branches, functions, and lines. Production logic should live in testable package or service modules, with API integration coverage around routes and SSE behavior.
