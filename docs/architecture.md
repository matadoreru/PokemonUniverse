# Architecture

The repository is split into three boundaries:

- `packages/shared`: transport schemas, public types, scoring, game registry and deterministic game engines. It has no Express, Socket.IO, React or database dependency.
- `apps/server`: authentication, PostgreSQL persistence, the live-room coordinator and Socket.IO transport. The coordinator sends intentions to a registered game module and publishes only its public projection.
- `apps/web`: React screens and presentation. It never decides deadlines, winners, eliminations or whether a selection wins a race.

## State and authority

The room state machine uses `LOBBY → GAME_STARTING → ROUND_ACTIVE ↔ ROUND_RESULTS / TIEBREAKER_ACTIVE → GAME_RESULTS → SESSION_RESULTS`. A game module owns the middle states. There are no combinations of gameplay booleans.

Selections are handled synchronously in the Node event loop with no `await` before mutation. Consequently, two events for the same Pokémon are serialized and only the first can add it to `lockedPokemonIds`. For horizontal scale, `InMemoryRoomStore` is the intentional replacement boundary: move rooms/timers to Redis and run each action under a per-room distributed lock or atomic Lua operation. Socket.IO's Redis adapter then distributes events.

The server stores an absolute deadline. Browsers only render an estimate using `serverNow`; the server timer calls `handleTimeout` and owns the transition.

## Reconnection policy

The signed HttpOnly identity cookie is stable through reloads. A disconnected member remains reserved for 30 seconds and receives the full public snapshot after reconnecting, including their prior selection. After grace expires, host ownership transfers to the oldest connected member.

An active player is retained in the running engine to keep results deterministic. They cannot act while offline and will be eliminated by the normal no-response rule at a deadline. Offline members are removed when returning to the lobby. Spectators and lobby members are removed as soon as grace expires.

If every remaining player times out in the same round, the explicit “eliminate every non-responder” rule produces a draw: the game closes with no winner and those final players receive no winner bonus. This avoids inventing a client-side winner or leaving the room stuck with zero active players.

## Pokémon data

`prisma/seed.ts` imports exactly National Dex entries 1–1025 from PokéAPI once, stores canonical metadata in PostgreSQL, and the server loads it into an indexed, immutable in-memory catalog at boot. No game round calls an external service. `POKEMON_SYNC=true npm run db:seed` explicitly refreshes the catalog. The model already has localized names, types and room for enrichment.

## Security boundaries

Passwords use bcrypt cost 12. Identity is an expiring HS256 token in an HttpOnly SameSite cookie. HTTP and socket events are rate-limited, payloads are size-limited, shared Zod schemas validate input, and every host action checks current ownership. In production, use TLS at Cloudflare/reverse proxy, set `COOKIE_SECURE=true`, use a random secret, restrict the origin and keep PostgreSQL private.
