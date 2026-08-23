# Architecture

The repository is split into three boundaries:

- `packages/shared`: transport schemas, public types, scoring, game registry and deterministic game engines. It has no Express, Socket.IO, React or database dependency.
- `apps/server`: authentication, PostgreSQL persistence, the live-room coordinator and Socket.IO transport. The coordinator sends intentions to a registered game module and publishes only its public projection.
- `apps/web`: React screens and presentation. It never decides deadlines, winners, eliminations or whether a selection wins a race.

## State and authority

The room state machine uses `LOBBY → game-owned phases → GAME_RESULTS → SESSION_RESULTS`. Round games use active/results phases; Pokémon Impostor uses `ROLE_REVEAL → CLUE_PHASE → VOTING → VOTE_RESULTS → ELIMINATION`. A game module owns every middle state. There are no combinations of gameplay booleans.

`LiveRoom` owns only room lifecycle data: code, host, members, selected game id, per-game configurations, session progress and the optional active runtime. A `GameRuntime` captures the selected module, game id, validated configuration and opaque module state. Returning to the lobby discards that runtime and restores connected members to player status; it does not recreate the room or sockets.

The shared `GameRegistry` is additive and rejects duplicate ids. Its manifests are included in every public room view, so the lobby selector is driven by the same authoritative list used by the server. Selecting another manifest switches to that game's preserved configuration; starting a game instantiates only that module. Optional module facilities such as private asset resolution remain behind the same contract rather than adding game-specific branches to the room coordinator.

Actions are handled synchronously in the Node event loop with no `await` before mutation. Consequently, concurrent votes in one room are serialized and a player's first valid vote is final. Every mutation produces one public projection plus a separate `getPlayerState` projection sent only to that player's socket. This keeps private roles and secrets out of shared room state. For horizontal scale, `InMemoryRoomStore` is the intentional replacement boundary: move rooms/timers to Redis and run each action under a per-room distributed lock or atomic Lua operation. Socket.IO's Redis adapter then distributes events.

The server stores an absolute deadline. Browsers only render an estimate using `serverNow`; the server timer calls `handleTimeout` and owns the transition.

## Reconnection policy

The signed HttpOnly identity cookie is stable through reloads. A disconnected member remains reserved for 30 seconds and receives the current public snapshot plus their own private game projection after reconnecting. After grace expires, host ownership transfers to the oldest connected member.

An active player is retained in the running engine to keep results deterministic. They cannot act while offline; a voting round waits for them until its server deadline and then records no response. Offline members are removed when returning to the lobby. Spectators and lobby members are removed as soon as grace expires.

The shiny answer is absent from the public state during voting. Candidate images use opaque, round-scoped application URLs; the server resolves and caches the trusted upstream sprite without exposing a semantic `/shiny/` URL to clients. During the reveal, the public projection adds the correct option and per-player outcome for three seconds.

## Pokémon data

`prisma/seed.ts` imports exactly National Dex entries 1–1025 from PokéAPI once, stores canonical metadata in PostgreSQL, and the server loads it into one indexed, immutable in-memory `PokemonCatalog` at boot. Pokédex Distance, Shiny Quiz and Pokémon Impostor consume this same catalog; there is no per-game Pokémon dataset. No game round calls an external service. `POKEMON_SYNC=true npm run db:seed` explicitly refreshes the catalog. The model already has localized names, types and room for enrichment.

Pokémon Impostor never includes `secretPokemonId`, the target sprite or the role map in its public projection. Living impostors receive `secretPokemon: null`; innocents receive only the display name and sprite in their socket-specific projection. Eliminated players may receive the reveal because the application has no spectator-to-player communication channel.

## Security boundaries

Passwords use bcrypt cost 12. Identity is an expiring HS256 token in an HttpOnly SameSite cookie. HTTP and socket events are rate-limited, payloads are size-limited, shared Zod schemas validate input, and every host action checks current ownership. In production, use TLS at Cloudflare/reverse proxy, set `COOKIE_SECURE=true`, use a random secret, restrict the origin and keep PostgreSQL private.
