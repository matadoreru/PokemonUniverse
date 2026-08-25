# Architecture

The repository is split into three boundaries:

- `packages/shared`: transport schemas, public types, scoring, game registry and deterministic game engines. It has no Express, Socket.IO, React or database dependency.
- `apps/server`: authentication, PostgreSQL persistence, the live-room coordinator and Socket.IO transport. The coordinator sends intentions to a registered game module and publishes only its public projection.
- `apps/web`: React screens and presentation. It never decides deadlines, winners, eliminations or whether a selection wins a race.

## State and authority

The room state machine uses `LOBBY → game-owned phases → GAME_RESULTS → SESSION_RESULTS`. Round games use active/results phases; Pokémon Impostor uses `ROLE_REVEAL → ordered CLUE_PHASE turns → VOTING → VOTE_RESULTS → ELIMINATION`, while Type Duel owns its private type-selection, reveal and Pokémon-search phases. A game module owns every middle state. There are no combinations of gameplay booleans.

`LiveRoom` owns only room lifecycle data: code, host, members, selected game id, per-game configurations, session progress and the optional active runtime. A `GameRuntime` captures the selected module, game id, stable participant roster, validated configuration and opaque module state. Room presence code uses that roster and never inspects a game's private state shape. Returning to the lobby discards that runtime and restores connected members to player status; it does not recreate the room or sockets.

The shared `GameRegistry` is additive and rejects duplicate ids. Its manifests are included in every public room view, so the lobby selector and client strategy registry use the same authoritative metadata. Selecting another manifest switches to that game's preserved configuration; starting a game instantiates only that module. Optional module facilities such as private asset resolution remain behind the same contract rather than adding game-specific branches to the room coordinator.

Actions are handled synchronously in the Node event loop with no `await` before mutation. Consequently, concurrent votes in one room are serialized and a player's first valid vote is final. Every mutation produces one public projection plus a separate `getPlayerState` projection sent only to that player's socket. This keeps private roles and secrets out of shared room state. For horizontal scale, `InMemoryRoomStore` is the intentional replacement boundary: move rooms/timers to Redis and run each action under a per-room distributed lock or atomic Lua operation. Socket.IO's Redis adapter then distributes events.

The server stores an absolute deadline. Shared timed-round and cooldown helpers perform the common deadline, reveal and completion bookkeeping while each game injects its own transition strategy. Browsers only render an estimate through the shared server-clock hooks; the server timer calls `handleTimeout` and owns the transition.

## Reconnection policy

The signed HttpOnly identity cookie is stable through reloads. A disconnected member remains reserved for 30 seconds and receives the current public snapshot plus their own private game projection after reconnecting. After grace expires, host ownership transfers to the oldest connected member.

Presence has three room-level states: `CONNECTED`, `TEMPORARILY_DISCONNECTED` and `LEFT`. The shared game contract exposes one definition of an active, connected participant and a presence-change hook. Completion checks therefore wait only for connected required players; accepted votes, choices and clues remain immutable after their sender disconnects. Turn-based games skip an offline turn immediately, and Type Duel cancels an affected duel without awarding a free win.

An active identity is retained in the running engine after grace expires when its historical state is needed for results, but it is no longer eligible for actions or future waits. A reconnect inside the 30-second grace restores the same private projection. Returning to the lobby keeps temporarily disconnected identities reserved until their own grace expires; definitive departures are removed. Host ownership transfers to the oldest connected member only after definitive departure, not on a transient socket loss.

The shiny answer is absent from the public state during voting. Candidate images use opaque, round-scoped application URLs; the server resolves and caches the trusted upstream sprite without exposing a semantic `/shiny/` URL to clients. During the reveal, the public projection adds the correct option and per-player outcome for three seconds.

## Pokémon data

`prisma/seed.ts` imports exactly National Dex entries 1–1025 from PokéAPI once, including ordered types, all six base stats, physical measurements, official species colour, legendary/mythical classification, normal and hidden abilities, evolution position, normalized move metadata, level-up learnsets and official flavor text explicitly tagged as Spanish. `extractCanonicalLevelUpEntries` and `extractSpanishPokedexEntries` are the acquisition boundaries; English or unknown-version Pokédex text is discarded rather than translated. The server loads Pokémon, moves, learnsets and Pokédex entries into one indexed, immutable in-memory catalog at boot. All twelve games consume this shared catalog; no game round, reveal or attempt calls an external service. Evolution branches use the maximum family depth while every terminal branch is normalized as final. The seed skips work once every dataset section is enriched, while `POKEMON_SYNC=true npm run db:seed` explicitly refreshes it.

Pokédle Race shuffles its configured canonical-form pool once with the game context random source. It assigns the shuffled entries without replacement; only when there are fewer valid entries than players does it cycle through the same shuffled order. This makes the restrictive-pool fallback deterministic for a deterministic random source. `secretPokemonIds` remains exclusively in opaque module state. Public and reconnect projections contain only accepted guesses, server-computed feedback and targets already revealed by a solve or by the end of the game. Each unresolved player receives one `GUESS` or explicit `NO_GUESS` row per synchronized round; disconnected players do not participate in the completion wait.

Pokémon Bingo derives numeric thresholds from quantiles of the configured pool and retains only conditions whose conjunction has real candidates. Every generated board is checked with an augmenting-path bipartite matching between cells and Pokémon; the game timer starts only after every player has a different board with a perfect matching. The matching itself and candidate ids remain opaque. Assign, replace and move intentions are applied synchronously as one server mutation, so a Pokémon is never visible in two cells of the same board. Incorrect attempts and cooldowns exist only in the per-player projection, while accepted assignments and progress are public.

Learnset Guess takes the highest enabled Pokémon generation as its reference generation. At round creation the engine resolves and groups the entire canonical learnset, then publishes only groups whose reveal deadline has passed. The target id, name and sprite remain exclusively in opaque server state until `ROUND_RESULTS`; correct guesses add only the player's id to the public solved set. Incorrect guesses are intentionally public and server-enforced cooldowns prevent spam.

Pokédex Entry Guess also takes the highest enabled generation as its reference. Its precomputed round deck selects only default Pokémon with a Spanish entry at that generation or the newest prior generation, never a future entry. The server removes localized target-name aliases before publishing the text; the deck, target id, target name, sprite and correct attempts remain private until the synchronized four-second reveal. Regional and other forms are excluded until the catalog can associate them with genuinely distinct official entries.

¿Quién es ese Pokémon? uses only catalog entries with a trusted sprite and optionally includes the regional forms normalized by the seed. Its active public state contains an opaque per-game asset token rather than the target identity or source URL. The image proxy trims the alpha bounds, normalizes the shape into a 320×320 canvas and replaces every RGB pixel with black while preserving alpha. A different reveal asset id is rejected until `ROUND_RESULTS`, when the same authoritative target may be served in colour. Incorrect guesses are public; correct guesses publish only the player id until the synchronized four-second reveal.

Pokémon Impostor never includes `secretPokemonId`, the target sprite or the role map in its public projection. Living impostors receive `secretPokemon: null`; innocents receive only the display name and sprite in their socket-specific projection. Eliminated players may receive the reveal because the application has no spectator-to-player communication channel.

Type Duel follows the same boundary: public state reports only which participants have locked a type. Each participant receives only their own choice until both are committed, after which the game publishes the pair atomically. Exact type matching, cooldowns and the first winning attempt are resolved synchronously by the server.

Type Chain preloads the configured canonical and supported-form pool and reduces every transition to one shared rule: the set intersection between the previous and candidate types must contain exactly one element. Used ids are global to the current chain. Before every turn the server computes all unused continuations; an empty set starts a fresh, prevalidated chain without eliminating the waiting player. Turn acceptance, chain append and player advance happen in one synchronous room mutation, while timeouts and current-player disconnects remove that player from the circular order.

Guess from Stats builds each round from a normalized signature containing only enabled numeric stats and enabled public hints. Every configured-pool Pokémon with the same signature is stored as a private accepted answer, so hidden fields never affect correctness and indistinguishable forms are all valid. Active public and reconnect projections contain the signature's visible values but neither the source nor accepted ids; the complete equivalent set and each solver's selected answer appear only during the synchronized reveal.

## Security boundaries

Passwords use bcrypt cost 12. Identity is an expiring HS256 token in an HttpOnly SameSite cookie. HTTP and socket events are rate-limited, payloads are size-limited, shared Zod schemas validate input, and every host action checks current ownership. In production, use TLS at Cloudflare/reverse proxy, set `COOKIE_SECURE=true`, use a random secret, restrict the origin and keep PostgreSQL private.
