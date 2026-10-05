# Repository Guidelines

## Project Structure & Module Organization
- `app/` Next.js App Router (pages, layouts, and API routes under `app/api/*/route.ts`).
- `components/` Reusable UI; `components/ui/*` primitives; `components/forms/*` feature forms; `components/table/*` data tables.
- `services/` Feature-specific domain logic (e.g., `services/funding-request`).
- `lib/` Utilities and clients (Prisma, S3, mail).
- `prisma/` Database schema and migrations; commit generated migrations.
- `templates/` Handlebars email templates. `public/` static assets.
- `validations/`, `types/`, `hooks/`, `config/`, `constants/` support modules.

## Build, Test, and Development Commands
- `yarn dev` Start dev server (http://localhost:3000) with Turbopack.
- `yarn build` Create production build. `yarn start` Run production server.
- `yarn lint` Run ESLint checks.
- Prisma: `npx prisma generate`, `npx prisma migrate dev`, `npx prisma studio`, `npx prisma migrate deploy` (deploy).
- Seed/config: `npx tsx scripts/populate-default-form-config.ts`.

## Coding Style & Naming Conventions
- TypeScript (strict). React components in PascalCase; filenames kebab-case (e.g., `funding-request-details.tsx`).
- Indentation: 2 spaces. Keep functions small and typed (no `any`).
- Use path alias `@/*` (see `tsconfig.json`). Keep server-only code in `app/api/*` or server files.
- ESLint extends `next/core-web-vitals` and `next/typescript`. Fix all lint errors before PRs.
- Tailwind CSS v4 is used; prefer utility classes; global styles in `app/globals.css`.

## Testing Guidelines
- No formal test suite yet. Manually verify critical flows (auth, funding requests, file upload, email triggers).
- If adding tests, prefer Playwright for E2E and Vitest/RTL for units. Name tests `*.test.ts(x)` and place under `tests/` or alongside sources.

## Commit & Pull Request Guidelines
- Prefer Conventional Commits (e.g., `feat:`, `fix:`, `chore:`). Imperative, concise subjects; include scope when helpful.
- Reference issues (`Fixes #123`) and describe rationale and impact.
- PRs should include: summary, screenshots for UI changes, verification steps, and migration notes if Prisma schema changed.

## Security & Configuration Tips
- Do not commit secrets. Use `.env.local` for development; required variables are listed in `README.md`.
- Run and commit Prisma migrations (`prisma/migrations/*`). In prod, run `npx prisma migrate deploy`.

## Mandatory verification
- After any code change, always run: `yarn typecheck`
- If typecheck cannot run, explicitly state why in the final response.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
