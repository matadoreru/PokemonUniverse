# Pokémon Universe

Real-time multiplayer minigame hub. The first registered game is **Pokédex Distance**.

## Run local code with Docker

1. Copy `.env.example` to `.env` and set matching PostgreSQL credentials in `PU_POSTGRES_PASSWORD` and `DATABASE_URL`.
2. Run `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait`.
3. Open <http://localhost:8080>.

The first boot runs the database migration and imports the 1,025 National Pokédex species. Later boots skip the import when the catalog is complete. This one-time seed needs internet access; actual games do not.

For local Node 22 development:

```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Useful checks are `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`.

## Production deployment

Production follows the same model as Tabi: GitHub Actions validates the repository and publishes immutable multi-platform
GHCR images, while Ubuntu only pulls them. The application binds to `127.0.0.1` for Cloudflare Tunnel, PostgreSQL stays
private, and the assisted deploy performs backup, migrations, healthcheck and image rollback.

See [DEPLOY.md](DEPLOY.md) for installation, GHCR, Cloudflare Tunnel, backups and updates by commit SHA.

## Environment

- `PU_IMAGE_TAG`: `latest` or an immutable commit SHA published by CI.
- `PU_POSTGRES_PASSWORD`, `PU_JWT_SECRET`: production secrets; both are required by Compose.
- `PU_PUBLIC_ORIGIN`: exact public HTTPS origin allowed by CORS.
- `PU_SECURE_COOKIE`: keep `true` behind Cloudflare HTTPS.
- `PU_ROOM_MAX_PLAYERS`: visible default/cap for new rooms (8 by default; the UI and score formula are dynamic).
- `PU_RECONNECT_GRACE_MS`: reservation before a disconnect is definitive (30,000 ms).
- `PU_HOST_PORT`: localhost-only Cloudflare Tunnel target (8080 by default).
- `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, `COOKIE_SECURE`: equivalent variables for direct local Node development.
- `VITE_API_URL`: API origin when the dev client does not use Vite's proxy. Leave empty behind the included nginx proxy.

See [docs/architecture.md](docs/architecture.md) for concurrency, reconnect and scaling decisions.

## Add a second minigame

Create `packages/shared/src/games/<id>/` with config/action schemas, state/action types, pure rules and a `MiniGameModule` implementation. Export it, then add one `.register(newGame)` call in the shared `games/registry.ts`. Add its configuration, active-game and results components to the declarative client registry at `apps/web/src/games/registry.ts`. The room coordinator discovers its manifest and drives it through the common contract; central auth, rooms, host, scoring, sessions, persistence, reconnection and spectators require no changes.

## Current production boundary

The implementation is complete for a single application node. PostgreSQL persists accounts, profiles and match statistics, while live rooms intentionally live in process memory for low-latency atomic mutation. Before running multiple server replicas, implement the documented Redis room-store/lock adapter and Socket.IO Redis adapter. Other natural follow-ups are email verification/password reset, localized Pokémon names, moderation/admin tooling, and browser end-to-end tests.
