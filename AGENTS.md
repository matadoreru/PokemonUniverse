# Repository Guidelines

## Project Structure & Module Organization

This Node 22+ npm-workspaces monorepo separates authority from presentation:

- `packages/shared/src/` contains Zod contracts, public types, scoring, the game registry, and deterministic game engines. Keep it independent of React, Express, Socket.IO, and Prisma.
- `apps/server/src/` owns authentication, persistence, rooms, timers, and Socket.IO/HTTP transport. Prisma schema, migrations, and seeding live in `apps/server/prisma/`.
- `frontend/src/` contains React screens, reusable components, room UI, and game configuration panels. Static files belong in `frontend/public/`.
- `backend/` is the Java 25 (Micronaut, Gradle) REST service that serves part of the HTTP API next to Node. Hexagonal layering under `backend/src/main/java/es/pokemonuniverse/`: `domain/` (pure rules), `application/` (use cases and ports), `adapters/in/rest` (controllers), `adapters/out` (persistence, storage), `config/`. Flyway migrations are in `backend/src/main/resources/db/migration/`; the generated REST contract is `backend/openapi/pokemon-universe.yml`.
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
- `npm run dev:backend` starts only the Java backend on :8080 with hot reload; `npm run dev` starts Node, Java and Vite together.
- `cd backend && ./gradlew check` runs the Java tests (Testcontainers needs a container runtime) and `verifyOpenApi`.
- `npm run registry:export` regenerates the game registry fixture the backend reads from `packages/shared`; `npm run api:types -w @pokemon-universe/web` regenerates `frontend/src/lib/api-types.ts` from the OpenAPI file.
- `npm run test:e2e` runs the Playwright suite (`npm run test:e2e:ui` opens the UI mode); `npm run test:e2e:java` runs the same specs with `VITE_REALTIME=java` (rooms on the Java `/ws`), and `-- juegos` limits either run to the per-game spec. It needs a local `.env`, a seeded catalog (`npm run db:seed`), and `npx playwright install chromium` (on Fedora, without `--with-deps`). `npm test` does not run Playwright.

Use `.env.example` as the local configuration template. PostgreSQL is required for server development.

## Coding Style & Naming Conventions

Use TypeScript ESM, two-space indentation, single quotes, and semicolons. The compiler enables strictness, unchecked-index checks, exact optional properties, and casing enforcement. Use `PascalCase` for React components and exported types, `camelCase` for functions/variables, and kebab-case game directories (for example, `games/type-chain/`). Java code targets Java 25 with the hexagonal layering above (domain and application do not depend on controllers); comments are in Spanish, as in the existing sources. Keep gameplay decisions and secrets server-authoritative; web code should only render public or player-specific projections.

## Testing Guidelines

Vitest is the project test runner. Add focused, deterministic tests beside changed code and cover success, rejection, timeout, reconnect, and privacy behavior where relevant. Run `npm test`, `npm run typecheck`, and `npm run lint` before submitting; for backend changes also run `cd backend && ./gradlew check`. Do not add a `V2__` Flyway migration while Node still runs `prisma migrate deploy`: schema changes go through Prisma until stage 2 (see `docs/architecture.md`). Changing a Java route means updating `infra/nginx.conf` and the Vite proxy together and regenerating the OpenAPI types (exception until stage 2D: `/api/rooms/` and the 2C routes `/api/categories`, `/api/would-you-rather-prompts`, avatar writes, `/api/tcg/` and `/api/admin/` go to Java only in Vite with `VITE_REALTIME=java`; Java's data-sync switch is `BACKEND_DATA_SYNC_ENABLED`, never on together with Node's `DATA_SYNC_ENABLED`). Every new or changed Java game engine ships with its golden fixtures and its `portedEngines` registration in `ClasspathGameRegistryLoader` in the same commit (see `backend/src/main/java/es/pokemonuniverse/domain/game/engines/README.md`).

**After every UI change, verify with Playwright**: run the relevant `e2e/tests/*.spec.ts`, capture at 1280×720, 1920×1080 and 390×844 into `e2e/screenshots/`, confirm there is no horizontal scroll and `measureLayout` reports nothing, and look at the images before considering the task done. Every new or redesigned screen is scored with the visual review rubric in `docs/visual-review.md` (minimum 19/24, no criterion at 0) and the score goes in the commit or PR. UI is built only with the component classes in `frontend/src/styles.css` and the theme tokens; text is never below 12 px; animations use only transform/opacity and respect `prefers-reduced-motion`.

## Commit & Pull Request Guidelines

Recent history uses brief, single-line summaries, usually in Spanish, without Conventional Commit prefixes (for example, `Nuevo minijuego`). Keep commits focused and describe the user-visible change. Pull requests should explain scope and architectural impact, link issues when applicable, list verification commands, call out migrations/configuration changes, and include screenshots for UI work. Never commit secrets or generated `dist/`, `coverage/`, or `node_modules/` content.
