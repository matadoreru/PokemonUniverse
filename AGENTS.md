# Repository Guidelines

## Project Structure & Module Organization

This Node 22+ npm-workspaces monorepo separates authority from presentation. The Java backend is the only server and the only place where game engines live:

- `packages/shared/src/` contains the browser contracts: Zod schemas, public and per-player projection types, default configs, presentation rules and scoring. It has no engines and depends only on `zod` (`npm run check:boundaries`). The old Node server and the TypeScript engines were removed; they are in git history before the commit «Quitar el servidor Node y los motores TS».
- `frontend/src/` contains React screens, the Arcade DS component catalogue (`ui/`, with its gallery in `ui/dev/`), reusable components, room UI, and game configuration panels. Static files belong in `frontend/public/`.
- `backend/` is the Java 25 (Micronaut, Gradle) server: the whole HTTP API under `/api`, rooms over the `/ws` WebSocket, data-sync and the schema (Flyway). Hexagonal layering under `backend/src/main/java/es/pokemonuniverse/`: `domain/` (pure rules), `application/` (use cases and ports), `adapters/in/rest` (controllers), `adapters/out` (persistence, storage), `config/`. Flyway migrations are in `backend/src/main/resources/db/migration/`; the generated REST contract is `backend/openapi/pokemon-universe.yml`.
- `e2e/` contains the Playwright end-to-end tests: specs in `tests/*.spec.ts`, shared helpers in `src/helpers.ts`, the layout and legibility measurer in `src/layout.ts`, and review screenshots in `screenshots/`. See `e2e/README.md`.
- Tests are colocated as `*.test.ts` or `*.test.tsx`. Operational files live in `scripts/`, `infra/`, and the Compose manifests. See `docs/architecture.md` before changing game-state or privacy boundaries.

## Build, Test, and Development Commands

- `npm install` installs all workspaces.
- `npm run dev` starts the Java backend watcher and the Vite frontend together.
- `npm run build` builds shared, then web.
- `npm run typecheck` runs strict TypeScript checks across the monorepo.
- `npm test` runs all Vitest suites; target one workspace with `npm test -w @pokemon-universe/shared`.
- `npm run lint` runs ESLint with zero warnings allowed.
- The Java backend owns the schema: on startup Flyway applies `backend/src/main/resources/db/migration/` (an empty database gets the whole schema from `V1__baseline.sql`). `npm run db:seed` starts the dev backend with `BACKEND_DATA_SYNC_ENABLED=true`, which loads the Pokémon catalog before opening :8080 (stop it with Ctrl+C or keep it running).
- `npm run db:up` starts a local PostgreSQL with podman (`compose.local.yaml`); `npm run db:down` stops it.
- `npm run dev:backend` starts only the Java backend on :8080 with hot reload; `npm run dev` starts Java and Vite together (the web talks only to Java).
- `cd backend && ./gradlew check` runs the Java tests (Testcontainers needs a container runtime) and `verifyOpenApi`.
- Game manifests and default configs are written by hand in `backend/src/main/resources/games/registry.json`; `packages/shared/src/games/registry-defaults.test.ts` checks that each `default<Game>Config` matches it. `npm run api:types -w @pokemon-universe/web` regenerates `frontend/src/lib/api-types.ts` from the OpenAPI file.
- `cd backend && ./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'` re-records the golden fixtures from the Java engines after an intended engine change; review their diff, which is the behaviour change.
- `npm run test:e2e` runs the Playwright suite against the Java backend only, rooms on its `/ws` (`npm run test:e2e:ui` opens the UI mode; `-- juegos` limits the run to the per-game spec). `npm run ui:check -- <spec or filter> [playwright args]` is the one-command UI check: it starts the local Postgres if needed, runs those specs, warns about captures missing one of the three sizes and writes `e2e/test-results/revision.html` with every capture of the run side by side. It needs a local `.env`, a seeded catalog (`npm run db:seed`), and `npx playwright install chromium` (on Fedora, without `--with-deps`). `npm test` does not run Playwright.

Use `.env.example` as the local configuration template. PostgreSQL is required for server development.

## Coding Style & Naming Conventions

Use TypeScript ESM, two-space indentation, single quotes, and semicolons. The compiler enables strictness, unchecked-index checks, exact optional properties, and casing enforcement. Use `PascalCase` for React components and exported types, `camelCase` for functions/variables, and kebab-case game directories (for example, `games/type-chain/`). Java code targets Java 25 with the hexagonal layering above (domain and application do not depend on controllers); comments are in Spanish, as in the existing sources. Keep gameplay decisions and secrets server-authoritative; web code should only render public or player-specific projections.

## Testing Guidelines

Vitest is the project test runner. Add focused, deterministic tests beside changed code and cover success, rejection, timeout, reconnect, and privacy behavior where relevant. Run `npm test`, `npm run typecheck`, and `npm run lint` before submitting; for backend changes also run `cd backend && ./gradlew check`. Schema changes are Flyway migrations (`V2__…`, `V3__…`) in `backend/src/main/resources/db/migration/`; never edit an applied migration such as `V1__baseline.sql`. The old Prisma migrations survive only as frozen test data (`backend/src/test/resources/db/prisma-migrations/`) for `FlywayMigrationsTest`. Changing a Java route means regenerating the OpenAPI types; Vite (`frontend/vite.config.ts`) and nginx (`infra/nginx.conf`) already send every `/api` route and `/ws` to Java, so only a new top-level prefix needs both proxies changed together. Java's data-sync switch is `BACKEND_DATA_SYNC_ENABLED`: on in `compose.yaml`, off in development except `npm run db:seed`. Every new or changed Java game engine ships with its re-recorded golden fixtures, its `registry.json` entry and its `portedEngines` registration in `ClasspathGameRegistryLoader` in the same commit (see `backend/src/main/java/es/pokemonuniverse/domain/game/engines/README.md`). Other fixtures under `backend/src/test/resources/` that came from Node (PokéAPI and TCG sync, palettes, session token, stored-config migration cases, `golden/catalog/`) are frozen data: edit them by hand when the expected behaviour changes.

**After every UI change, verify with Playwright** (`npm run ui:check -- <spec>` does the run and gathers the captures): run the relevant `e2e/tests/*.spec.ts`, capture at 1280×720, 1920×1080 and 390×844 into `e2e/screenshots/`, confirm `capture()` passes with its defaults (no horizontal scroll, no document scroll at any width nor `main` scroll on desktop, `measureLayout` empty at 13 px; any exception is an explicit option with a comment saying why), and look at the images before considering the task done. Every new or redesigned screen is scored with the visual review rubric in `docs/visual-review.md` (minimum 19/24, no criterion at 0) and the score goes in the commit or PR.

UI follows the Arcade DS system (`docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md`): screens use only the components in `frontend/src/ui/` (CSS Modules over the tokens in `frontend/src/styles/tokens.css`; Tailwind only for layout), and a new component or state goes into the gallery at `/dev/ui` before any screen uses it. Text is never below 13 px (the `text-13`…`text-68` scale), touch targets are at least 44 px, and animations use only transform/opacity and respect `prefers-reduced-motion`. `npm run lint` rejects arbitrary style values in `className`/`cx()` (`text-[…]`, `text-xs`…, arbitrary colours, `z-[…]`) and raw `lucide-react` JSX outside `ui/` (use `Icon`, or pass the icon as `icon={X}`); `frontend/src/styles/global-classes.test.ts` fails on any global class that neither Tailwind nor `styles.css` defines. Each game screen has exactly one live region (always mounted) and one owner per error: `gameAction` already publishes failures to the room notice, so the screen catches with `ignoreFailure` instead of showing them again.

## Commit & Pull Request Guidelines

Recent history uses brief, single-line summaries, usually in Spanish, without Conventional Commit prefixes (for example, `Nuevo minijuego`). Keep commits focused and describe the user-visible change. Pull requests should explain scope and architectural impact, link issues when applicable, list verification commands, call out migrations/configuration changes, and include screenshots for UI work. Never commit secrets or generated `dist/`, `coverage/`, or `node_modules/` content.
