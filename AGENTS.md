# Repository Guidelines

## Project Structure & Module Organization

This Node 22+ npm-workspaces monorepo separates authority from presentation:

- `packages/shared/src/` contains Zod contracts, public types, scoring, the game registry, and deterministic game engines. Keep it independent of React, Express, Socket.IO, and Prisma.
- `apps/server/src/` owns authentication, persistence, rooms, timers, and Socket.IO/HTTP transport. Prisma schema, migrations, and seeding live in `apps/server/prisma/`.
- `apps/web/src/` contains React screens, reusable components, room UI, and game configuration panels. Static files belong in `apps/web/public/`.
- `e2e/` contains the Playwright end-to-end tests: specs in `tests/*.spec.ts`, shared helpers in `src/helpers.ts`, the layout and legibility measurer in `src/layout.ts`, and review screenshots in `screenshots/`. See `e2e/README.md`.
- Tests are colocated as `*.test.ts` or `*.test.tsx`. Operational files live in `scripts/`, `infra/`, and the Compose manifests. See `docs/architecture.md` before changing game-state or privacy boundaries.

## Build, Test, and Development Commands

- `npm install` installs all workspaces and generates the Prisma client.
- `npm run dev` starts the server watcher and Vite frontend together.
- `npm run build` builds shared, server, then web in dependency order.
- `npm run typecheck` runs strict TypeScript checks across the monorepo.
- `npm test` runs all Vitest suites; target one workspace with `npm test -w @pokemon-universe/shared`.
- `npm run lint` runs ESLint with zero warnings allowed.
- `npm run db:migrate` creates/applies a development migration; `npm run db:seed` populates Pokémon data.
- `npm run db:up` starts a local PostgreSQL with podman (`compose.local.yaml`); `npm run db:down` stops it.
- `npm run test:e2e` runs the Playwright suite (`npm run test:e2e:ui` opens the UI mode). It needs a local `.env`, a seeded catalog (`npm run db:seed`), and `npx playwright install chromium` (on Fedora, without `--with-deps`). `npm test` does not run Playwright.

Use `.env.example` as the local configuration template. PostgreSQL is required for server development.

## Coding Style & Naming Conventions

Use TypeScript ESM, two-space indentation, single quotes, and semicolons. The compiler enables strictness, unchecked-index checks, exact optional properties, and casing enforcement. Use `PascalCase` for React components and exported types, `camelCase` for functions/variables, and kebab-case game directories (for example, `games/type-chain/`). Keep gameplay decisions and secrets server-authoritative; web code should only render public or player-specific projections.

## Testing Guidelines

Vitest is the project test runner. Add focused, deterministic tests beside changed code and cover success, rejection, timeout, reconnect, and privacy behavior where relevant. Run `npm test`, `npm run typecheck`, and `npm run lint` before submitting.

**After every UI change, verify with Playwright**: run the relevant `e2e/tests/*.spec.ts`, capture at 1280×720, 1920×1080 and 390×844 into `e2e/screenshots/`, confirm there is no horizontal scroll and `measureLayout` reports nothing, and look at the images before considering the task done. Every new or redesigned screen is scored with the visual review rubric in `docs/visual-review.md` (minimum 19/24, no criterion at 0) and the score goes in the commit or PR. UI is built only with the component classes in `apps/web/src/styles.css` and the theme tokens; text is never below 12 px; animations use only transform/opacity and respect `prefers-reduced-motion`.

## Commit & Pull Request Guidelines

Recent history uses brief, single-line summaries, usually in Spanish, without Conventional Commit prefixes (for example, `Nuevo minijuego`). Keep commits focused and describe the user-visible change. Pull requests should explain scope and architectural impact, link issues when applicable, list verification commands, call out migrations/configuration changes, and include screenshots for UI work. Never commit secrets or generated `dist/`, `coverage/`, or `node_modules/` content.
