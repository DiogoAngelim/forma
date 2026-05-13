# Forma — Premium Visual Builder Platform

A dark-first, premium AI-assisted visual builder SaaS platform inspired by Webflow, Figma, Framer, and Linear. Forma lets designers and developers build, transform, and publish visual projects in an intelligent, polished workspace.

## Run & Operate

- `pnpm --filter @workspace/visual-builder run dev` — run the frontend (auto-started via workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TailwindCSS + shadcn/ui
- State: Zustand (mocked data, no backend)
- Animation: Framer Motion throughout
- Routing: wouter
- Icons: Lucide React

## Where things live

- `artifacts/visual-builder/` — the entire frontend app
- `artifacts/visual-builder/src/store/index.ts` — Zustand store with all mocked data
- `artifacts/visual-builder/src/pages/` — all page components
- `artifacts/visual-builder/src/components/` — shared + builder-specific components
- `artifacts/visual-builder/src/index.css` — dark-first theme with violet/purple palette

## Architecture decisions

- Frontend-only: all data is mocked in Zustand, no API calls or backend needed
- Dark-first: the `dark` class is applied to `html` by default; users can toggle
- Auth is mocked via localStorage key `forma_user`
- CSS gradient thumbnails replace images — unique per project using CSS variables
- react-resizable-panels powers the 3-panel builder workspace layout

## Product

- **Login / Register** — animated split-screen auth with glassmorphism
- **Dashboard** — project cards, AI insights, activity feed, upload/import modal
- **Builder Workspace** — 3-panel layout: file tree sidebar, visual canvas, inspector panel; AI suggestion panel; responsive preview controls; zoom; element selection
- **Showcase** — masonry community gallery with trending projects, tags, likes/views
- **Public Project** — before/after slider, generated design tokens, comments, share
- **Profile & Settings** — tabs for profile, projects, billing, settings

## User preferences

- Frontend-only, no backend
- Dark-first UI with violet/purple (#8B5CF6) accent color
- All motion via Framer Motion; no CSS-only transitions for complex interactions
- No emojis in the UI

## Gotchas

- Zustand must be installed in `artifacts/visual-builder` (already done)
- Auth guard: visiting `/` without `forma_user` in localStorage redirects to `/login`
- The builder page is at `/builder/:projectId` — click a project card to open it
