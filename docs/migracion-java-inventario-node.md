# Inventario de módulos Node pendientes de portar (referencia de la etapa 2C)

> Extraído del código Node el 2026-10-31 durante la etapa 2A. Las secciones 6 (proxy de assets) y 8 (estadísticas) ya están portadas. Es una especificación de comportamiento: ante una duda manda el código Node.

TOP 5 SURPRISES
1. Admin `POST /api/admin/data-sync/all` returns 202 even when a sync is already running. `startAll` is async, so its 409 `SyncAlreadyRunningError` becomes a rejected promise that the route swallows with `void task.catch(()=>undefined)`. The per-source routes throw synchronously and do return 409.
2. INCREMENTAL Pokémon sync can never detect changes once regional forms exist. It compares the remote species count (~1025) with `prisma.pokemon.count()`, which includes forms (>=1083). It short-circuits whenever palettes >= 100. The `updated` counter is also `min(before, after)`, so it is meaningless.
3. `ensureInitialPokemon()` is awaited before `listen` with no try/catch. A first boot downloads the whole PokéAPI dataset and any failure crashes boot. Separately, `avatarRateLimit` (12 per 15 min per IP) ignores `RATE_LIMIT_DISABLED`.
4. The global error handler maps any `entity.too.large` or 413 to the message 'La imagen supera el límite de 5 MB.', including a >32 kb JSON body. `GET /api/auth/avatars/<invalid name>` throws a plain Error and returns 500, not 404.
5. The socket per-connection rate limit (50 events per 10 s, except who-is-who cursor events) rejects through `next(Error('Rate limit exceeded'))`, not through the ack. The client's `sendCommand` ack then times out after 8 s with the generic 'No se pudo confirmar la acción…' message. The Node `game:action` ack error 'El minijuego ya ha cambiado.' is the only stale-round signal.

# Stage 2: Node modules to port (behavioral specs)

Paths are relative to `/home/eru/Documents/Projects/PokemonUniverse`. `S` = `apps/server/src`, `SH` = `packages/shared/src`.

## 1. Data sync (`S/data-sync/*`, `apps/server/prisma/seed.ts`, `S/pokemon/*-source.ts`)

### Types (`types.ts`)
- `SyncResult {processed, inserted, updated, skipped, datasetVersion?, details?: Json}`.
- `DataSyncAdapter {source, run(mode): Promise<SyncResult>, recordsAvailable(): Promise<number>}`.
- `SyncOverviewItem` is identical to `AdminDataSyncItem`. Its `status` can be IDLE, RUNNING, FAILED, COMPLETED or NOT_READY. IDLE is never produced.
- Enums: DataSyncSource {POKEAPI, TCGDEX}; DataSyncStatus {PENDING, RUNNING, COMPLETED, FAILED}; DataSyncMode {INITIAL, INCREMENTAL, FULL, PRICE_REFRESH}.
- Tables: `DataSyncRun` (id cuid, source, mode, status, startedAt, completedAt, durationMs, recordsProcessed, inserted, updated, skipped, error, details Json, createdAt). `DataSyncState` (PK source, datasetVersion, lastSuccessAt, lastAttemptAt, lastFullSyncAt, recordsAvailable, lastError, metadata).

### `DataSyncService(db, adapters, nextSync: ()=>Date)` (`service.ts`)
- `SyncAlreadyRunningError` (status 409). `start()` throws a plain Error('El servidor se está cerrando') while stopping, which gives a 500.
- `recoverInterrupted()`: sets all runs with status PENDING or RUNNING to FAILED, `completedAt=now`, `error='Servidor reiniciado durante la sincronización'`.
- `start(source, mode)` is synchronous. It throws `SyncAlreadyRunningError('<SRC> ya se está sincronizando')` if that source is active. Otherwise it stores the promise from `execute` in the `active` map and removes it in `finally`.
- `startAll(mode)` is async. If anything is running it throws 'Ya hay una sincronización activa'. Otherwise it runs both sources in parallel via `Promise.all`, mapping TCGDEX with INCREMENTAL to PRICE_REFRESH.
- `execute`:
  1. Create a `DataSyncRun` with status RUNNING and `startedAt`.
  2. Upsert state `lastAttemptAt`.
  3. `adapter.run(mode)`.
  4. `available = adapter.recordsAvailable()`.
  5. In one transaction, update the run to COMPLETED (durationMs, counters, details) and upsert state (datasetVersion, lastSuccessAt, lastAttemptAt, `lastFullSyncAt` only for FULL or INITIAL, recordsAvailable, `lastError=null`).
  6. Run `onCompleted` listeners sequentially and awaited, inside `execute`. Listener errors are logged and swallowed.
  7. On failure, in one transaction mark the run FAILED with `error=message` and set state `lastError`. Then rethrow.
- `onCompleted(listener(source))` returns an unsubscribe function.
- `ensureInitialPokemon()`:
  - `available = POKEAPI.recordsAvailable()`, which counts Pokemon where `isDefault && hp>0`.
  - If `available >= 1025` and the persisted palette count >= 100, only upsert state (`recordsAvailable`; `datasetVersion=String(available)` on create only) and return.
  - Otherwise `await start('POKEAPI','INITIAL')`. Errors propagate.
- `startInitialTcgInBackground()` (fire and forget, tracked as `initialTask`):
  - If the TcgCard count is 0, run `start('TCGDEX','INITIAL')`. Otherwise upsert state with `recordsAvailable`.
  - Errors are logged as '[DataSync] TCGdex initial sync failed:' and swallowed.
- `stop()`: sets `stopping`, awaits `initialTask`, then `allSettled` on the active syncs.
- `overview()`:
  - Reads all states and the last 20 runs with status in COMPLETED, FAILED or RUNNING, ordered by `createdAt` desc.
  - Per source, `run` is the first matching run. `running = active || run.status==='RUNNING'`. `ready = recordsAvailable>0`.
  - Status is RUNNING if running, else FAILED if the latest run failed, else COMPLETED if ready, else NOT_READY.
  - `error = run.error ?? state.lastError`.
  - `nextSyncAt = nextSync().toISOString()`, the same for both sources.
  - Order is [POKEAPI, TCGDEX].

### `DataSyncScheduler(service, {hour, minute, timeZone})` (`scheduler.ts`)
- Config defaults from `S/config.ts`: DATA_SYNC_HOUR=6, DATA_SYNC_MINUTE=0, DATA_SYNC_TIMEZONE='Europe/Madrid', DATA_SYNC_ENABLED=true.
- `nextScheduledSync(now, schedule)` returns the next wall-clock hh:mm in the zone, strictly after `now`. If the local time is already >= hh:mm, use the next day. In Java use `ZonedDateTime` and handle DST gaps. The Node code scans UTC offsets of +/-14 h in 15-minute steps and throws if nothing matches.
- `start()` arms a single timer (unref'd).
  - delay = min(next - now, 2_147_000_000), with a floor of 1000 ms.
  - On fire, if it is still more than 1 s early it re-arms. Otherwise it calls `service.startAll('INCREMENTAL')`, logs failures ('[DataSync] scheduled synchronization failed:'), and in `finally` re-arms.
- `stop()` clears the timer. It does not cancel an in-flight sync.

### HTTP client (`http-client.ts`, `S/http/response-body.ts`)
- `SyncHttpClient({attempts=4, baseDelayMs=500, timeoutMs=30000, maxBytes=16 MiB, fetcher})` with `.json(url,label)` and `.bytes(url,label)`.
- Headers: `Accept: application/json` for json and `image/*` for bytes (this includes TCG/PokéAPI JSON and sprites); `User-Agent: PokemonUniverse-DataSync/1.0`.
- Retry delay is `base*2^(n-1)` plus 0..149 ms jitter. A `Retry-After` header (seconds or HTTP-date, >=0) overrides it, capped at 60 s.
- Retry on network errors, timeouts, 429 and 5xx. Other 4xx fail immediately.
- Error text: `${label} returned HTTP ${status}`.
- The body is streamed and aborted past `maxBytes` with 'La respuesta supera el límite permitido.' The timeout is enforced via the abort signal.

### `PokemonDataSync` (`pokemon-data-sync.ts`, source POKEAPI)
- `run(mode)`:
  - Take `before = pokemon.count()` (all rows, including forms).
  - If the mode is INCREMENTAL and the palette count >= 100: GET `https://pokeapi.co/api/v2/pokemon-species?limit=1` and read `count`. If `remote.count <= before`, return `{0,0,0,skipped=before, datasetVersion=String(remote.count), details:{changeDetected:false,paletteCount}}`. This is always true once forms are seeded.
  - Otherwise `syncPokemonData({force: mode==='FULL'})`, then `backfillNormalizedData()`, then `syncMissingPokemonPalettes(http)`.
  - Result: `processed=after`, `inserted=max(0,after-before)`, `updated=min(before,after)`, `skipped = INCREMENTAL&&after==before ? after : 0`, `datasetVersion=String(after)`, `details:{palettes:{processed,updated,skipped,failed}}`.
- `backfillNormalizedData()` loads every Pokemon row and then:
  - Upserts `PokemonGeneration` (`slug=generation-N`, name `Generación N`).
  - Upserts a `PokemonSpecies` stub per default row (id = nationalDexNumber, slug = row id, legendary and mythical flags). This stub path is only ever applied to default rows.
  - For each row, in a transaction with a 30 s timeout: set `pokemon.speciesId=nationalDexNumber` and `sourceUpdatedAt=now`, then call `reconcilePokemonRelations`.
  - Assets considered: SPRITE (primary), SHINY_SPRITE (`metadata.shinySprite`), ARTWORK (primary), HOME_ARTWORK, CRY_LATEST, CRY_LEGACY (`metadata.cries.latest` / `.legacy`). Stats written: hp, attack, defense, special-attack, special-defense, speed, bst.
  - Abilities come from `metadata.abilityRelations` ({id, name, slot>=1 int, isHidden}). The fallback is `fallbackAbilityId(name)`: lowercase `es`, NFD strip, non [a-z0-9]+ replaced with '-', edge dashes trimmed.

### `pokemon-relation-reconciler.ts`
- `reconcilePokemonRelations(tx, {pokemonId, abilities, types, stats, assets})` throws 'Duplicate <label>: <value>' on duplicate slot, id, kind or stat.
- Abilities: upsert `Ability {id, name, names:{es}}`; delete `PokemonAbility` rows whose slot now maps to a different ability; upsert by `(pokemonId, slot)`.
- Types: upsert `PokemonType {id, name=id}`; delete assignments whose slot now holds a different type; upsert by `(pokemonId, slot)`.
- Assets (managed kinds only): delete rows whose (kind, url) differs from the desired set; upsert by `(pokemonId, kind, url)` with id `<kind lowercase>:<pokemonId>`.
- Stats: delete stats not in the desired set; upsert by `(pokemonId, stat)` with `effort=0`.

### `pokemon-palette-sync.ts`
- Constants: `POKEMON_PALETTE_VERSION=3`, `POKEMON_PALETTE_SIZE=8`, `MIN_PLAYABLE_POKEMON_PALETTES=100`.
- A palette is persisted in `Pokemon.metadata` as `palette[]` (hex), `paletteWeights[]`, `paletteVersion`, `paletteSpriteUrl`. It is valid only if the version matches, the sprite URL equals the current `sprite`, there are >=3 colors matching `/^#[0-9a-f]{6}$/i`, and the weights array has the same length with all values positive.
- `countPersistedPokemonPalettes` counts only `isDefault` rows.
- `syncMissingPokemonPalettes`:
  - Select default rows ordered by `nationalDexNumber`, process in batches of 6 in parallel, skip rows that already have a valid palette.
  - Sprite host must be https and `raw.githubusercontent.com`, otherwise 'Untrusted sprite source'. Download via `http.bytes`.
  - Per-row errors are logged ('[DataSync] palette skipped pokemon=…') and counted in `failed`; they do not abort the run.
- Extraction algorithm:
  1. Resize the image to fit inside 96x96 (nearest kernel, no enlargement) and read RGBA.
  2. Skip pixels with alpha < 96, and skip when max(rgb) < 20 or min(rgb) > 248.
  3. Quantize each channel to `round(c/24)*24`, capped at 255, and bucket by quantized RGB.
  4. Rank buckets by count desc, then by the "r:g:b" string ascending.
  5. Greedily select up to 8 buckets whose Euclidean distance to every already-selected color is >= 42.
  6. Fewer than 3 selected colors throws 'El sprite no contiene una paleta suficientemente variada.'
  7. Weights: assign every bucket to its nearest selected color (first one wins ties), sum the counts, then normalize.
  8. Colors are `#rrggbb` lowercase hex.

### `TcgDataSync` (`tcg-data-sync.ts`, source TCGDEX, base `https://api.tcgdex.net/v2/en`)
- `recordsAvailable = tcgCard.count()`.
- Card id discovery:
  - PRICE_REFRESH with existing cards: use all existing card ids, with no set fetch.
  - Otherwise: GET `/sets`, then sequentially GET `/sets/{id}` for each set. Upsert `TcgSet {id, name, series (string or series.name), logoUrl, symbolUrl, releaseDate, cardCount (total ?? official), metadata=raw, sourceUpdatedAt=now}` and collect `set.cards[].id`.
- Card fetch: unique ids in batches of 20 concurrent GET `/cards/{id}` (URL-encoded), with a 100 ms pause per batch.
- Per card:
  - No `set.id`: skipped++ and move on.
  - If `mode !== PRICE_REFRESH` or the card is new: upsert `TcgCard {id, localId, setId, name, category, hp, rarity, imageUrl, illustrator, metadata=raw, sourceUpdatedAt = card.updated ?? now}`; inserted++ if new, else updated++.
  - Then replace `TcgCardPokemon` links (delete and createMany) from `dexId[]`, mapped to default Pokemon with those national dex numbers.
  - A PRICE_REFRESH card that already exists only does updated++.
  - Upsert `TcgCardPrice` per price leaf, keyed by `(cardId, provider, currency, variant)`. On update `observedAt=now`.
- `imageUrl`: kept if it already ends in png, webp, jpg or jpeg; otherwise `<value>/high.webp`.
- `priceLeaves(pricing)`:
  - Currency is `record.unit`, else USD for provider 'tcgplayer' and EUR otherwise.
  - Provider 'cardmarket' gives a `standard` leaf (market=avg, low, trend) and, if avg-holo or low-holo exist, a `holo` leaf (avg-holo, low-holo, trend-holo).
  - Other providers: each object-valued key except unit/updated is a variant, with market=marketPrice, low=lowPrice, mid=midPrice, high=highPrice.
  - Leaves with no numeric field are dropped. Each leaf stores its source record as metadata.
- Result: `processed=uniqueIds.length`, `datasetVersion=String(total cards)`, `details:{pricesRefreshed: mode==='PRICE_REFRESH'}`.

### `prisma/seed.ts` `syncPokemonData({force?})`
- Standalone CLI: runs when `argv[1]` is this file. `POKEMON_SYNC=true` also forces.
- External URLs (PokéAPI, `fetchJson`: 4 attempts, sleep `attempt*400` ms, retry on network error, 429 and 5xx; no timeout; other 4xx throw 'PokéAPI returned {status} for {label}'; it does NOT use `SyncHttpClient`):
  - `https://pokeapi.co/api/v2/pokemon/{1..1025}` in batches of 25.
  - `/pokemon-species/{1..1025}` in batches of 25.
  - `/pokemon?limit=100000`, filtered with `isSupportedRegionalFormId`, then each form's `/pokemon/{name}`.
  - Ability and move URLs taken from the Pokémon payloads, in batches of 25.
- Phase gating. A phase runs if `force` or any of these hold:
  - Base: enriched default count (`isDefault`, hp>0, types non-empty) < 1025.
  - Regional: non-default count < 58.
  - Learnsets: sync key `canonical-level-up-learnsets` version < 1, or moves < 500, or `PokemonLevelUpMove` < 5000.
  - Evolution: key `evolution-positions` version < 2, or defaults with stage fields set < 1025.
  - Metadata: key `pokeddle-species-metadata` version < 3, or defaults with height, weight, color != 'unknown' and abilities fewer than 1025.
  - Pokédex entries: key `spanish-pokedex-entries` version < 1, or es entries < 500.
  - If nothing is needed it logs 'Catalog ready…' and returns.
  - Version rows are `PokemonCatalogSync {key, version}`, upserted after each phase succeeds. The metadata phase has no dedicated body: it triggers the base and regional upserts and then writes its version.
- Fetch: default Pokémon and species if any phase needs them (species not needed for learnsets alone). Regional forms are fetched if regional or metadata is needed, and there must be >= 58 or it throws 'Expected at least 58 regional forms, received N'.
- Spanish ability names are fetched for all abilities, sorted, in batches of 25. A missing es name throws 'PokéAPI has no official Spanish name for ability X'.
- `Pokemon` rows are upserted in transactions of 100. Fields:
  - id = pokeapi name; nationalDexNumber parsed from the species URL (1..1025, else throws); name = TitleCase of species (non-default forms: 'X de Alola|Galar|Hisui|Paldea (Detail)', and basculin-white-striped becomes 'Basculin (Raya Blanca)').
  - generation from ends [151,251,386,493,649,721,809,905,1025]; isDefault.
  - sprite = `front_default`, or `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png`.
  - names = {en, es}; types sorted by slot; the six stats plus `baseStatTotal`.
  - heightDecimeters, weightHectograms; legendaryStatus MYTHICAL, LEGENDARY or NORMAL; color; abilities = unique es names.
  - metadata {pokeApiId, species, cries, artwork, homeArtwork, shinySprite, abilityRelations[{id,name,slot,isHidden}]}; sourceUpdatedAt.
- Learnsets:
  - Entries come from `extractCanonicalLevelUpEntries`.
  - Moves are upserted (`Move.id` = name; en name; type; category = damage_class; names {en,es}; power, accuracy, pp, priority; generation from the URL; metadata `{source:'pokeapi'}`) in transactions of 100.
  - Then one transaction (120 s timeout) deletes `PokemonLevelUpMove` for the default pokemon ids and inserts in chunks of 1000 with skipDuplicates.
- Evolution:
  - Per species: `evolutionStages` = depth of the chain from its root; `evolutionStage` = own stage, but if it has no children then `evolutionStages`.
  - `PokemonEvolution` edges have id `chainId:fromId:toId`. They are deleted and recreated for the synchronized ids (chunks of 500, 120 s transaction).
- Pokédex phase: calls `syncNormalizedSpecies` first, then the entries.
  - `syncNormalizedSpecies`: upsert `PokemonGeneration`; per species a transaction with a `PokemonSpecies` upsert (names map of all languages, color, shape, habitat, growthRate, genderRate, captureRate, baseHappiness, hatchCounter, flags, `evolvesFromSpeciesId`, `evolutionChainId`) and replacing `PokemonPokedexNumber`.
  - Entries: fewer than 500 Spanish entries throws 'Expected at least 500 Spanish Pokédex entries, received N'. Otherwise delete and recreate `PokedexEntry` (id `pokemonId:version`) for the default pokemon ids in chunks of 1000 (120 s transaction).

### Extractors
- `ability-source.extractSpanishAbilityName(names)`: the first entry with language 'es', trimmed; undefined if empty.
- `learnset-source.extractCanonicalLevelUpEntries(pokemonId, introducedGeneration, moves)`:
  - For each reference generation g (1..9) where `introducedGeneration <= g`, take the version group from `GENERATION_LEARNSET_SOURCES[g]` (`SH/pokemon/types.ts`): 1 yellow; 2 crystal; 3 emerald; 4 heartgold-soulsilver; 5 black-2-white-2; 6 omega-ruby-alpha-sapphire; 7 ultra-sun-ultra-moon; 8 sword-shield; 9 scarlet-violet.
  - Keep details with method 'level-up', level >= 1 and the matching version group.
  - Dedupe by key `pokemon:move:gen:level`, returning `{pokemonId, moveId, referenceGeneration, level}`.
- `pokedex-entry-source.extractSpanishPokedexEntries(pokemonId, flavorTexts)`:
  - Language 'es' only, and the version must be in the VERSION_GENERATIONS map (red through scarlet/violet, including lets-go and legends-arceus).
  - Text normalization: `[\n\f\r\t]+` becomes a space, 2+ spaces become one space, trim. Empty text is dropped.
  - The last text per version wins. Sorted by generation, then version string.
  - Output has `versionLabel` from a Spanish label map, falling back to the version name.

## 2. Admin (`S/admin/routes.ts`, `audit.ts`, `SH/admin.ts`)

- Everything is mounted at `/api/admin`. Admin gate (`S/auth/middleware.ts` `requireAdmin`):
  - Not logged in, or a guest: 401 `{error:'Registered account required'}`.
  - The role is re-read from the DB on every request; a non-ADMIN gets 403 `{error:'Administrator access required'}`.
- Sub-routers also mounted: `/changelog` (`createAdminChangelogRouter`) and `/feedback` (`createAdminFeedbackRouter`). They are not specified here.
- Constant `ADMIN_PAGE_SIZE = 20`. `PaginatedAdminResponse<T> = {items, page, pageSize:20, total, totalPages: max(1, ceil(total/20))}`.
- Query validation, `pageQuery`: `page` coerced int >=1 (default 1); `search` trimmed, max 80, default ''. Invalid input becomes a ZodError, handled globally as 400 `{error:<first issue message>, issues:[…]}`. A page beyond the range returns empty `items` with that page echoed.
- `GET /summary` returns `{activeRooms, gamesInProgress (rooms with gameId!=null), registeredUsers (user count), interruptedToday, updatedAt}`. `interruptedToday` counts `gameHistory` with status INTERRUPTED and `startedAt >= local midnight`; the zone is the server's local zone.
- `GET /active-rooms` is in-memory (`RoomManager.adminRooms()`). The `search` is a case-insensitive (locale `es`) substring match on code, host display name, or any participant's display name. Slice by page. The item type is `AdminActiveRoom`: `{id, code, phase, gameId, gameName, connectedPlayers, totalPlayers, maxPlayers, hostDisplayName, createdAt, updatedAt, participants[{id, displayName, kind USER|GUEST, presence, roomRole}]}`. Order is the manager's list order.
- `GET /rooms` (table `roomHistory`): filters `status` in ACTIVE|CLOSED|INTERRUPTED; `search` matches roomCode or hostDisplayName (contains, insensitive). Ordered by `createdAt` desc. Item: `{id, code, hostDisplayName, hostUserId, maxPlayers, status, closeReason, gamesStarted (count of games), createdAt, endedAt}`.
- `GET /games` (table `gameHistory`): filters `status` in IN_PROGRESS|COMPLETED|ABANDONED|INTERRUPTED, `gameId` (trim, max 64, exact), `search` on roomCode OR any result displayName. Ordered by `startedAt` desc. Item: `{id, roomCode, gameId, gameName (registry manifest name, fallback gameId), playerCount, status, startedAt, endedAt, participants[{displayName, userId, position, points}]}`. Participants are ordered by position asc.
- `GET /users`: filters `role` USER|ADMIN; `search` on username or email. Ordered by `createdAt` desc. Item: `{id, username, email, role, gamesPlayed, gamesWon, totalPoints (from stats, 0 if none), createdAt, updatedAt}`.
- `GET /data-sync` returns `{sources: SyncOverviewItem[]}`. If the service is absent, 503 `{error:'La sincronización de datos no está disponible'}`.
- `POST /data-sync/:source`:
  - `:source` in pokemon|tcg|all, else 400 Zod.
  - Body `{full:boolean=false, confirmFull:boolean=false}`. `full && !confirmFull` gives 400 `{error:'El Full Sync requiere confirmación explícita'}`.
  - mode = FULL if `full`, else INCREMENTAL. pokemon maps to POKEAPI with that mode. tcg maps to TCGDEX with PRICE_REFRESH unless `full` (then FULL). `all` calls `startAll(mode)`.
  - Fire and forget. Success is 202 `{accepted:true, source, mode}` (the mode echoed is FULL or INCREMENTAL even for tcg). Single-source conflict: 409 `{error:'POKEAPI ya se está sincronizando'}`. For `all`, the conflict is swallowed and still returns 202.
- `admin/audit.ts`:
  - `RoomAuditSink` {roomCreated, roomClosed, gameStarted, gameAbandoned}, backed by a serialized promise queue (an error in one op doesn't block the next). `createPrismaRoomAuditSink`:
    - roomCreated: `roomHistory.create` (id = history uuid).
    - roomClosed: transaction: gameHistory IN_PROGRESS to ABANDONED if `gameResultId`; roomHistory ACTIVE to CLOSED with `closeReason` and `endedAt`.
    - gameStarted: upsert by `resultId` (create IN_PROGRESS with config JSON).
    - gameAbandoned: updateMany IN_PROGRESS to ABANDONED.
  - `interruptStaleActivity()` (boot and shutdown): in one transaction, every IN_PROGRESS game becomes INTERRUPTED with `endedAt`, and every ACTIVE room becomes INTERRUPTED with `closeReason='SERVER_STOPPED'`.

## 3. Custom categories and Would-You-Rather prompts

### Shared pieces
- Normalization key (`S/content/normalize.ts` `normalizeContent`): NFD, strip `\p{Diacritic}`, `toLocaleLowerCase('es')`, replace runs of non letter/number with ' ', trim, collapse whitespace.
- Both routers apply `requireUser` (401 'Registered account required'). Errors with `.status` map to `{error:message}` with that status. Zod errors map to 400 `{error:<first message>, issues}`.
- Both services hold ALL users' rows in memory, `byUser: Map<userId, rows[]>`.
  - `load()` is awaited at boot after `tcgCards`, catalog and audio, and before `RoomManager` is created.
  - Mutations write to the DB first, then update the cache, then call the `onChanged(userId)` listeners.
  - Wiring in `index.ts`: `customCategories.onChanged(uid => rooms.updateHostCategories(uid))` and `wouldYouRatherPrompts.onChanged(uid => rooms.updateHostWouldYouRatherPrompts(uid))`. Each one broadcasts `room:state` only if that user is currently the host of their room.
  - `RoomManager` gets `enabled(userId)` closures, so `enabled()` returns only enabled rows as `{id,text}` for categories and `{id,optionA,optionB}` for prompts, in insertion order.
  - `list()` is sorted by `createdAt` asc.

### Categories (`S/categories/*`, `SH/custom-category.ts`)
- Table `CustomCategory` (userId, text, normalizedText, enabled=true, timestamps), unique `(userId, normalizedText)`.
- Text schema: trim, min 4 'Escribe al menos 4 caracteres.', max 160 'La categoría no puede superar 160 caracteres.'. Create body is `{text}` (strict). Update body is `{text?, enabled?}` (strict) and must have at least one field, else 'No hay cambios que guardar.'.
- Duplicate (cache check, then DB P2002 as a backup): 409 'Ya tienes una categoría igual o equivalente.'. Missing or foreign id: 404 'Categoría no encontrada.'. `:id` must be 1..128 chars.
- Routes:
  - `GET /api/categories` returns `{categories: CustomCategoryView[]}`.
  - `POST /` returns 201 `{category}`.
  - `PATCH /:id` returns `{category}`.
  - `DELETE /:id` returns 204.
- View: `{id, text, enabled, createdAt, updatedAt}` (ISO strings).
- There is no per-user cap and no serialization of mutations (a race window exists between the cache check and the DB write; the DB unique index backs it up).

### Would-You-Rather (`S/would-you-rather-prompts/*`, `SH/custom-would-you-rather.ts`)
- Table `CustomWouldYouRatherPrompt` (userId, optionA, optionB, normalizedKey, enabled, timestamps), unique `(userId, normalizedKey)`.
- Key: `sort([norm(A), norm(B)]).join('::')`, so A/B order is irrelevant.
- Option schema: trim, min 4 'Escribe al menos 4 caracteres.', max 180 'La opción no puede superar 180 caracteres.'.
  - Create is `{optionA, optionB}` (strict). Refine: `localeCompare('es', sensitivity base)` must be non-zero, else 'Las dos opciones deben ser diferentes.' (path `['optionB']`).
  - Update is `{optionA?, optionB?, enabled?}` (strict) with at least one field, else 'No hay cambios que guardar.'.
  - The service also checks normalized equality, giving 400 'Las dos opciones deben ser diferentes.'.
- Import: `POST /import`, body `{version: 1, prompts: [{optionA, optionB}] }`.
  - Strict at both levels; version must be the literal 1.
  - `prompts` has min 1 'Incluye al menos un dilema.' and max 100 'Puedes importar hasta 100 dilemas cada vez.'.
  - Zod issue paths look like `['prompts', i, 'optionB']`, but the HTTP `error` is only the first issue's message; the full `issues` array is also returned.
  - Duplicates within the batch (by key): 409 'El JSON contiene dilemas duplicados o invertidos.'. Duplicate against existing: 409 'Ya tienes una pareja igual o equivalente.'.
  - Insert is all-or-nothing (one `$transaction` of creates). Response is 201 `{prompts: view[]}`.
- Other routes: `GET /api/would-you-rather-prompts` returns `{prompts}`; `POST /` returns 201 `{prompt}`; `PATCH /:id` returns `{prompt}`; `DELETE /:id` returns 204. Not found: 404 'Pareja no encontrada.'.
- Mutations are serialized per user (a promise chain `serialize`; a failure doesn't block the next).
- Repository update runs in a Serializable transaction with up to 3 attempts on P2034. It recomputes the normalized key from the merged options, re-checks distinctness (`InvalidWouldYouRatherPromptError`), and maps P2002 to the duplicate error. If the transaction finds no row it returns null, mapped to 404.

## 4. Game configs (`S/game-configs/service.ts`, `prisma-repository.ts`)

- Table `UserGameConfig` (userId, gameId, config Json), unique `(userId, gameId)`. The repository has `list()` (all rows) and `upsert(userId, gameId, config)`.
- Interface `UserGameConfigPreferences {forUser(userId): ReadonlyMap<gameId, config>; save(userId, gameId, config): void}`, with a no-op default.
- `load()`, awaited at boot:
  - For each row whose game is registered (unknown game ids are skipped and left untouched in the DB), compute `migrateStoredGameConfig(game, row.config)` and set the cache.
  - If the result is not deep-equal to the stored row, upsert the migrated value (all in `Promise.all`).
- `migrateStoredGameConfig(game, stored)`:
  - `fallback = configSchema.parse(defaultConfig)`.
  - `candidate = mergeKnown(fallback, stored)`: recurse only into plain objects; keys that don't exist in the defaults are dropped; missing or non-object branches take the default; arrays and scalars from stored values are taken wholesale.
  - Then loop up to 24 times: `safeParse(candidate)`.
    - On success return the parsed data (including zod transforms).
    - Else, for each issue path, truncate it at the first array index, and replace that path in the candidate with the default's value at that path.
    - If the candidate fingerprint (`JSON.stringify`) repeats or any issue path is the root, return the fallback.
  - After 24 failed attempts return the fallback.
- `forUser(userId)` returns the user's cached map, or an empty map.
- `save(userId, gameId, config)`:
  - Unknown game id: silently ignored.
  - `configSchema.parse(config)` (a Zod error propagates).
  - Update the cache immediately.
  - Debounce 250 ms per (user, game); each call restarts the timer (unref'd).
  - Persistence is last-write-wins, and writes for the same key are chained so they run in order. A failure logs 'Failed to persist game config for X' and does not retry.
- `flush()` (shutdown): clear timers, persist all pending, await all in-flight writes.
- Room usage (`S/rooms/manager.ts`):
  - READ: only in `create()` (room creation). For a USER identity, each registered game's config is `configSchema.parse(stored ?? defaultConfig)`. Guests always get defaults.
  - `selectGame` seeds the room's config from the defaults if it is missing.
  - WRITE: `updateGameConfig`, which requires the EDIT_GAME_CONFIG permission and LOBBY phase. It parses with the schema, stores the config in the room, and, if the acting member is a USER, saves to that actor's preferences. The saved row belongs to the actor, which can be a co-host rather than the host.
  - `room:update-config` delegates to the selected game.
  - Boot: `await userGameConfigs.load()`. Shutdown: `userGameConfigs.flush()`.

## 5. TCG (`S/tcg/*`, `SH/tcg/types.ts`, `SH/games/tcg-higher-lower/config.ts`, `S/http/routes.ts`)

- `TcgCardRepository {findById, count, loadComparableCards}`. `loadComparableCards()`:
  - Select cards where `imageUrl != null` AND at least one price has `market != null`.
  - Fields: id, localId, name, rarity, imageUrl, set{id,name}, prices (market != null only: provider, currency, variant, market as a string, observedAt), and `pokemonGenerations` = distinct generations of linked Pokémon.
- `CachedTcgCardCatalog(repo)`:
  - `refresh()`: load, keep only eligible cards, replace the in-memory array in one swap. Logs '[TCG catalog] loaded N cards…'. Called at boot (awaited), then after every completed TCGDEX sync.
  - Eligible card: non-blank id, localId, name, set id and set name, and `imageUrl` that parses as an `https:` URL.
- Canonical price (`SH`): must match `^\d+(?:\.\d+)?$`, else null. It strips leading integer zeros and trailing fractional zeros. `compareTcgPrices` compares by integer length, then the integer string, then the fraction padded to equal width; there are no floats. Invalid input throws.
- `cardsFor(filters {generations, setIds, rarities, minPrice, maxPrice})`:
  1. Base set: the card has at least one pokemonGeneration in `filters.generations` (cards without Pokémon links are excluded); `setIds` empty means all, else the set must match; `rarities` empty means all, else the rarity must be non-null and match.
  2. Price lane = (currency, provider, variant). Only valid rows count: currency `^[A-Z]{3}$`, non-blank provider and variant, canonical market. A lane is a candidate only if it appears on >= 2 base cards.
  3. Lane order: priority list [EUR:cardmarket:standard, USD:tcgplayer:normal, EUR:cardmarket:holo, USD:tcgplayer:holofoil, USD:tcgplayer:reverseholofoil] (provider and variant lowercased for the comparison); everything else after, ordered by `laneKey.localeCompare`.
  4. For each lane in order, for each base card take that lane's price with the newest `observedAt` that has a canonical non-null market. Apply min and max inclusively (decimal-string compare, in whatever currency the lane has). Return the first lane yielding >= 2 cards; if none does, return [].
  - Output item: `{id, name, localId, setId, setName, rarity, imageUrl, price (string), currency, provider, variant}`.
- `options()`: over "priced" cards (>=1 pokemonGeneration and >=1 canonical market price):
  - `{ready, cardCount, generations:[{value,cardCount}] (asc), sets:[{id,name,cardCount}] (by name localeCompare), rarities:[{value,cardCount}] (by value localeCompare)}`.
  - `cardCount` is the number of distinct cards.
  - `ready = cardsFor(all available generations, no sets, rarities or prices).length >= 2`.
- Routes (no auth, `S/http/routes.ts`; the catalog is registered via `registerTcgCardCatalog` before listen):
  - `GET /api/tcg/options` returns the `TcgFilterOptions` JSON. If the catalog isn't registered it throws a plain Error('El catálogo TCG todavía no está disponible.'), which gives 500.
  - `POST /api/tcg/eligibility` takes the FULL `tcgHigherLowerConfigSchema` body (not just the filters) and returns 200 `{cardCount: cardsFor(config).length}`. Errors are 400 with the Zod first message.
- `tcgHigherLowerConfigSchema` (`SH/games/tcg-higher-lower/config.ts`):
  - `generations`: non-empty int array in [firstGeneration..lastGeneration], deduped and sorted.
  - `setIds[]` and `rarities[]`: non-empty strings, deduped.
  - `minPrice` / `maxPrice`: null or a string matching `^\d+(?:\.\d+)?$` ('Introduce un precio válido.').
  - `showRarity`: boolean. `rounds`: int 5..50. `roundSeconds`: int 5..60.
  - Refine: max < min gives 'El precio máximo debe ser igual o mayor que el mínimo.' (path `['maxPrice']`).
  - Defaults: all generations, empty sets and rarities, null prices, showRarity true, rounds 10, roundSeconds 15.

## 6. Image / audio proxy

### Routes (`S/http/routes.ts`)
- `GET /api/rooms/:code/games/:assetToken/rounds/:roundNumber/options/:optionId/(sprite|audio)`, no auth.
  - Limiter 5000 per minute per IP; the global 120/min limiter skips these paths.
  - 404 (empty body) if the resolver is unset, `roundNumber` is not an integer, or `gameImageResolver(code, assetToken, round, optionId)` returns null. The resolver is `rooms.gameAsset`.
  - Success: 200 with `Content-Type` and `Cache-Control: private, max-age=86400, immutable`.
  - `/audio` returns 415 (no body) if the content type isn't `audio/*` or `application/ogg`. Loader failures go through the global error handler (500, or 503 for capacity).
- The source is either a string (meaning ORIGINAL) or `GameAssetResolution {source, transform, focusSeed?, zoom?, recolor?{hueShiftDegrees, saturationScale, lightnessScale, contrast}}`.

### Source loading (`S/http/game-image-cache.ts` `sourceBuffer`)
- A source of the form `local-artwork:<id>` (regex `^local-artwork:[a-z0-9]+(?:-[a-z0-9]+)*$`) reads `<ARTWORK_DIR>/<id>.png` and reports content type image/png.
- Otherwise only `https://raw.githubusercontent.com/...` is allowed ('Untrusted game image source'). Fetch with a 15 s timeout, an 8 MiB streaming limit, and an error 'Sprite source returned {status}'. Content type is taken from the response, default image/png.

### Cache (`resource-cache.ts`)
- `ResourceCache<T>(limits, size)` is an LRU keyed by string: a hit moves the entry to the end; eviction runs while total bytes exceed the limit or entries exceed the count.
  - Values larger than the byte budget are returned but not cached.
  - In-flight dedupe by key. Pending requests are capped; beyond the cap, `ResourceCapacityError` (status 503, 'El servidor está procesando demasiados recursos. Reintenta en unos segundos.'). Loader concurrency is capped, with excess work queued FIFO.
- Game image cache: bytes 32 MiB, entries 256, concurrency 8, pending 64.
- Cache key: `${transform}:${focusSeed??''}:${zoom??''}:${hue}:${sat}:${light}:${contrast}:${source}`.

### Transforms (all outputs PNG)
- ORIGINAL: raw bytes and upstream content type, unchanged.
- NORMALIZED (`createNormalizedPokemonImage(buf)`):
  1. sharp `ensureAlpha`, `trim` against transparent black (default sharp tolerance).
  2. `resize(472,472, fit contain, centre, transparent background, enlargement allowed)`.
  3. `extend` 20 px on all sides with transparent background, giving 512x512.
- FOCUSED_NORMALIZED: the NORMALIZED canvas, then shifted so the chosen focus point is at the centre.
  - `focusSeed` defaults to 0.
  - `validFocusPoint` (`SH/games/zoomed-pokemon/rules.ts`): alpha threshold 24 (strictly greater counts as visible); bounds = visible-pixel bounding box; radius = max(2, round(min(w,h)*0.08)); stride = max(1, floor(min(W,H)/64)); candidates are visible pixels on the stride grid inside the bounds whose local visible density (square window of the radius) is >= 0.32. With no candidates the focus is the bounds centre. Otherwise sort by density desc, then y, then x; keep the top `ceil(n*0.7)` (min 1); pick index `|trunc(seed)| mod len`; the focus is `((x+0.5)/W, (y+0.5)/H)`.
  - The shift is by `round(W/2 - fx*W)` and `round(H/2 - fy*H)`. Pixels shifted out of bounds are dropped; uncovered areas stay transparent. No focus found: throws 'Visual asset does not contain enough visible pixels'.
- ZOOM_CROP: FOCUSED_NORMALIZED (seed default 0), then `size = max(1, floor(512/zoom))`, `inset = floor((512-size)/2)`, extract the square, resize back to 512x512 (sharp default lanczos3). `zoom` default 1; valid range 1..32 else 'Invalid crop magnification'.
- SILHOUETTE: ensureAlpha, trim, resize 320x320 contain (transparent), set every RGB to 0 and keep alpha.
- PIXEL_ART: decode at native resolution, then `resize(192,192, contain, centre, nearest kernel, transparent)`.
- PALETTE_RECOLOR: requires `recolor` (else 'Palette recolor transform requires recolor parameters'). Recolor the native pixels, then the PIXEL_ART resize.
  - Clamp the parameters: saturationScale to [0.5, 1.15], lightnessScale to [0.85, 1.15], contrast to [0.8, 1.1]. hueShift = `((deg%360)+360)%360`.
  - Per pixel:
    1. Skip if alpha == 0.
    2. r, g, b = channel/255. HSL: `L = (max+min)/2`; `S = delta/(1-|2L-1|)`; hue from the usual sextant formulas, in degrees mod 360.
    3. Skip (leave unchanged) if chroma < 0.055, or L < 0.07, or L > 0.94.
    4. `S' = clamp(S*satScale, 0, 0.88)`.
    5. `L' = clamp((0.5+(L-0.5)*contrast)*lightScale, 0.04, 0.96)`.
    6. `H' = (H+hueShift)%360`.
    7. Standard HSL to RGB, then `round(v*255)`. Alpha is untouched.
- `preloadGameImage(source)` warms the cache and logs 'Failed to preload game image'.

### Local artwork catalog (`S/pokemon/visual-assets.ts`, `assets/pokemon-artworks/README.md`)
- Directory: first existing of `<cwd>/apps/server/assets/pokemon-artworks` or `<cwd>/assets/pokemon-artworks`. The directory currently contains only the README (no PNGs).
- File name regex: `^[a-z0-9]+(?:-[a-z0-9]+)*\.png$`; the stem must equal a catalog Pokemon id.
- A file is accepted only if sharp reports format 'png' with width and height, and the pixels with alpha > 24 number at least 0.2% of all pixels. Anything else is ignored with a warning. A missing directory warns and gives an empty catalog.
- Stored asset: `{pokemonId, source:'ARTWORK', location:'local-artwork:<id>', width, height, alphaBounds{x,y,width,height normalized 0..1}}`. API: `artworkFor(id)`, `artworkPokemonIds()`.
- Loaded at boot and reloaded after a POKEAPI sync. README policy: PNG of at least 512x512 recommended; a missing artwork falls back to the sprite in Mixed mode; Artwork mode restricts the pool to valid files.

### Audio catalog (`S/pokemon/audio-assets.ts`)
- `loadPokemonAudioCatalog()` reads `PokemonAssetReference` rows (kind CRY_LATEST or CRY_LEGACY, ordered pokemonId, kind, `isPrimary` desc, `updatedAt` desc) plus the legacy `Pokemon.metadata.cries.latest` and `.legacy`.
  - It keeps only URLs matching `^https://raw.githubusercontent.com/PokeAPI/cries/`, with one URL per (pokemon, kind), first one wins (the reference rows come first).
- `InMemoryPokemonAudioCatalog`: `cryFor(id, 'LATEST'|'LEGACY')` returns a URL or null; `pokemonIds(version?)`.
- The proxy streams these URLs through the same `loadGameImage` path (raw GitHub host, 8 MiB, 15 s).

## 7. Avatar (`S/avatar/service.ts`, `S/auth/routes.ts`, `S/avatar/storage.ts`, `S/auth/profile-events.ts`)

### `AvatarService.processAndStore(buffer, declaredContentType)`
- Constants: `MAX_AVATAR_UPLOAD_BYTES = 5 MiB`, max dimension 4096, output 256. `AvatarValidationError` has status 400.
- Empty or oversize buffer: 'La imagen supera el límite de 5 MB.'.
- `sharp(buf, {failOn:'warning', limitInputPixels: 4096*4096})`. A metadata failure, or a detected format that is not jpeg, png or webp, or one that doesn't match the declared Content-Type exactly (image/jpeg, image/png, image/webp): 'El archivo no es una imagen JPEG, PNG o WEBP válida.'.
- Dimensions must be 64..4096 on both sides, else 'La imagen debe medir entre 64 y 4096 píxeles por lado.'.
- Processing: `rotate()` (EXIF auto-orient), `resize(256,256, cover, centre)`, `webp({quality:84, effort:5})`.
- File name `<uuid>.webp`. Written with flag 'wx', mode 0600, under `AVATAR_STORAGE_DIR` (default '.data/avatars', or '/data/avatars' in production), creating the directory recursively. The filename must match `^[0-9a-f-]{36}\.webp$` or the storage throws 'Invalid avatar filename'.
- Returns `{type:'CUSTOM', value:filename, version: Date.now()}`. The version actually used for persisted users is `User.avatarVersion` (incremented in the DB), not this timestamp.

### Routes (`/api/auth/*`)
- Global middleware: `/api/auth` is limited to 30 per 15 min per IP (skipped when rate limiting is disabled, and for `/avatars/*`). `avatarRateLimit` is a separate limiter of 12 per 15 min per IP; the same instance is shared by all four write routes (one shared counter), and it IGNORES `RATE_LIMIT_DISABLED`.
- Auth cookie: `AUTH_COOKIE`, httpOnly, sameSite lax, secure from `COOKIE_SECURE`, path '/', 30 days. The JWT is re-signed after changes (`establish`).
- Raw body: `express.raw({type:['image/jpeg','image/png','image/webp'], limit:5 MiB})`. Over the limit gives 413 'La imagen supera el límite de 5 MB.' via the global handler. If the body is not a Buffer (any other Content-Type), 415 `{error:'Usa una imagen JPEG, PNG o WEBP.'}`. On any error after storing, the new file is removed.
- `POST /guest/custom-avatar?displayName=…`: rate limit, then raw body. `displayName` is validated with `guestSchema`. The guest identity is `{id:'guest_<uuid>', displayName, kind:'GUEST', avatar:CUSTOM}`. Sets the cookie, removes the previous guest custom avatar file (fire and forget), responds 201 `{user: AuthUser}`.
- `PUT /profile/avatar/preset`: `requireUser` (401 'Registered account required'), rate limit; body strict `{presetId}` validated by `avatarPresetIdSchema`. Responds 200 `{user}`.
- `DELETE /profile/avatar`: `requireUser`, rate limit; resets to DEFAULT_AVATAR. Responds 200 `{user}`.
- `PUT /profile/avatar/custom`: `requireUser`, rate limit, raw body, `processAndStore`, then `applyAvatar`. Responds 200 `{user}`.
- `applyAvatar(userId, avatar)`:
  1. Read the previous `avatarType` and `avatarValue`.
  2. Update the user: `avatarType`; `avatarValue` (null for DEFAULT); `avatarVersion` +1.
  3. Build the identity from the DB row.
  4. `notifyAvatarUpdated(userId, identity.avatar)`.
  5. Delete the previous custom file if it differs from the new value (fire and forget).
- Hook: `onAvatarUpdated` (`S/auth/profile-events.ts`) is a Set of listeners called synchronously. The only listener (wired in `index.ts`) is `rooms.updateIdentityAvatar(userId, avatar)`: it updates the member identity and the session participant identity, then broadcasts `room:state` (revision++).
- `GET /avatars/:filename` is public: 200 image/webp with `Cache-Control: public, max-age=31536000, immutable`, or 404 if the file is missing. An invalid filename pattern throws 'Invalid avatar filename' and gives 500.
- Avatar mapping from a DB row: PRESET with a valid preset id; CUSTOM with a `<uuid>.webp` value gives `{type:'CUSTOM', value, version: avatarVersion}`; anything else falls back to `DEFAULT_AVATAR`.

## 8. Stats and lifecycle

### `persistGameResults(room{historyId, code, members}, results, resultId, startedAt, gameId, config)` (`S/stats/service.ts`)
- Preconditions (thrown before any DB work): 'No profile statistics registered for {gameId}'; 'Missing result identity: {playerId}' if a standing's player isn't in the room members.
- Up to 3 attempts. Each runs `prisma.$transaction` with `isolationLevel: Serializable`.
  - Retry only on Prisma P2002 (unique violation) or P2034 (serialization failure). On the final attempt, or for any other error, throw.
  - Retrying via the P2002 path relies on the next attempt seeing an existing COMPLETED row. An unrelated unique violation is never treated as success.
- Inside the transaction:
  1. Find `gameHistory` by `resultId` (unique). If its status is COMPLETED, return (idempotent no-op).
  2. If a row exists (for example IN_PROGRESS from `gameStarted`), update it to COMPLETED with `endedAt=now`. Otherwise create it with `{resultId, roomHistoryId, roomCode, gameId, playerCount, config, COMPLETED, startedAt, endedAt}`.
  3. For each standing, create `PlayerGameResult {historyId, userId (only for USER identities, else null), displayName, position, points, metrics: standing.stats}`.
  4. For USER identities only, upsert `UserStats` (gamesPlayed+1, gamesWon+1 if `won`, totalPoints+points).
  5. Also for USER identities only: upsert `UserGameStats` (keyed `userId+gameId`): gamesPlayed+1, gamesWon+1 if `won`, points+points, and `metrics = mergeMetrics(existing?.metrics, standing.stats, definitions)`.
  - `won = standing.won ?? (playerId === results.winnerId)`.
- `mergeMetrics(previous, current, definitions)`: iterate ONLY the manifest's `profileStats.metrics` definitions (undefined keys are dropped); the non-numeric stored values count as 0.
  - MAX: `max(old, new)`.
  - MIN: if new <= 0 keep old; else if old <= 0 take new; else `min`.
  - Anything else (SUM): `old + new`.
- Callers: wrapped by `RoomManager` (`pending.track`).

### `PendingTasks` (`S/lifecycle/pending-tasks.ts`)
- `track(promise)` adds it to a set and removes it on settle (returns the same promise, so failures remain visible to the caller). `flush()` loops while the set is non-empty on `Promise.allSettled`, so tasks added during a flush are also awaited.
- Used inside `RoomManager` for the audit sink and result persistence. Called from shutdown as `rooms.flush()`.

## 9. Boot order and shutdown (`S/index.ts`)

### Construction (synchronous, in order)
1. Services constructed: `customCategories`, `userGameConfigs`, `wouldYouRatherPrompts`, `changelog`, `feedback`, a `roomRegistry` holder, `syncSchedule` (from env), `dataSync` (adapters [PokemonDataSync, TcgDataSync], with `nextSync` closure), `scheduler`, `tcgCards`.
2. Express middleware, in order:
   - `trust proxy` 1, helmet, CORS (`origin WEB_ORIGIN, credentials`), `express.json` (32 kb limit), cookieParser.
   - Global rate limit: 120 per minute, skipped when disabled or for the sprite and audio asset paths; draft-7 headers.
   - `optionalAuth`.
   - Routers: `/api/auth` (30 per 15 min), `/api/categories`, `/api/would-you-rather-prompts`, `/api/changelog`, `/api/feedback`, `/api/admin`, then `/api` (`apiRouter`).
3. Error handler:
   - ZodError gives 400 `{error:first message, issues}`.
   - `AvatarValidationError` gives its status.
   - Any Error with a numeric `status` uses that status and `{error:message}`.
   - A 413 or `entity.too.large` body gives 413 'La imagen supera el límite de 5 MB.'.
   - Anything else is a 500 (message hidden in production as 'Internal server error').
4. `http.createServer(app)` and socket.io `Server`:
   - CORS as above; transports ['websocket','polling'].
   - `connectionStateRecovery {maxDisconnectionDuration: RECONNECT_GRACE_MS (5s..300s, default 30s), skipMiddlewares: false}`.
   - `maxHttpBufferSize: 32768`.
5. `io.use`: reads the auth cookie from the handshake and `verifyIdentity(token)`; stores `socket.data.identity`. Any failure results in `Error('Authentication required')`.

### Awaited boot sequence
1. `await interruptStaleActivity()`.
2. `await dataSync.recoverInterrupted()`.
3. `if DATA_SYNC_ENABLED: await dataSync.ensureInitialPokemon()`. This can run a full PokéAPI sync and an exception aborts boot.
4. `await tcgCards.refresh()`.
5. `dataSync.onCompleted(src => src==='TCGDEX' && tcgCards.refresh())`.
6. `catalog = await loadPokemonCatalog()`.
7. `pokemonAudio = await loadPokemonAudioCatalog()`.
8. `await customCategories.load()`, then `await userGameConfigs.load()`, then `await wouldYouRatherPrompts.load()`.
9. `registerPokemonRepository(new CatalogPokemonRepository(catalog))` and `registerTcgCardCatalog(tcgCards)`.
10. `pokemonVisuals = await loadPokemonVisualCatalog(catalog)`.
11. `rooms = new RoomManager(io, catalog, pokemonVisuals, uid=>customCategories.enabled(uid), createPrismaRoomAuditSink(), userGameConfigs, uid=>wouldYouRatherPrompts.enabled(uid), tcgCards, pokemonAudio)`; `roomRegistry.current = rooms`.
12. Wiring (synchronous):
    - POKEAPI completion: reload catalog and audio in parallel, then visuals, `rooms.replaceCatalog(...)` (new random `catalogVersion`), and `registerPokemonRepository`.
    - `customCategories.onChanged` leads to `rooms.updateHostCategories`.
    - `wouldYouRatherPrompts.onChanged` leads to `rooms.updateHostWouldYouRatherPrompts`.
    - `onAvatarUpdated` leads to `rooms.updateIdentityAvatar`.
    - `registerGameImageResolver` leads to `rooms.gameAsset`.
    - `io.on('connection')`: per-socket sliding window of 50 events per 10 s, excluding the `who-is-who:cursor` and `who-is-who:cursor-clear` events; on overflow `next(Error('Rate limit exceeded'))`. Then `rooms.bind(socket)`.
13. If DATA_SYNC_ENABLED: `scheduler.start()` and `dataSync.startInitialTcgInBackground()`.
14. `httpServer.listen(PORT)`.

### Shutdown (SIGTERM and SIGINT, idempotent via a shared promise)
1. `scheduler.stop()`.
2. `rooms.stop()` (sets stopping, cancels transition and disconnect timers; new sockets are disconnected, and acks return 'El servidor se está cerrando').
3. `await io.close()` (this also closes the HTTP server).
4. `await Promise.all([rooms.flush(), userGameConfigs.flush(), dataSync.stop()])`.
5. `await interruptStaleActivity()`.
6. `await prisma.$disconnect()`.
- Errors are logged ('Shutdown failed') and set `process.exitCode=1`. There is no explicit `process.exit`.

## Web socket usage (`apps/web/src`)

- Only four files touch the socket. Everything else goes through `useRoom()`.
- `lib/socket.ts`: `createSocket()` = `io(socketUrl, {withCredentials: true, autoConnect: true})`. `socketUrl = API_URL || window.location.origin` (`lib/api.ts`). It uses default socket.io-client reconnection settings, with no custom timeouts, auth, or transport configuration. The auth cookie is sent with the handshake.
- `room/RoomContext.tsx` (`RoomProvider`):
  - The effect is keyed on `user?.id`. No user: disconnect and clear the room. User present: create a socket and `attachWhoIsWhoCursorChannel`. Cleanup: detach, `socket.disconnect()`, clear the projection.
  - Listens to: `connect` (connected=true); `disconnect` (connected=false and drops all pending optimistic updates, but keeps the authoritative room); `room:state(room)` (`projection.setAuthoritative(room)`); `session:restored(room)` (`setAuthoritative(room, clearPending=true)`); `room:kicked(message)` (room=null, error=message); `error:message(text)`; `connect_error` (error = event.message).
  - Emits (through `sendCommand`): room:create, room:join, room:leave, room:select-game, room:update-config, room:update-game-config, room:update-session, room:update-game-selection, room:vote-next-game, room:set-role, room:transfer-host, room:kick, room:set-ready, room:start-game, room:continue-session, room:return-lobby, room:end-session, game:skip-vote:set, game:action.
  - Optimistic lobby updates (`room/optimistic-room.ts`) apply only in the LOBBY phase, for config, session and game-selection changes.
  - `continueSession` is de-duplicated by an in-flight promise.
  - `game:action` payload is `{gameInstanceId: room.gameSkipState.gameInstanceId, actionEpoch: room.gameActionEpoch, action}`. A missing id gives 'No hay un minijuego activo.'; a missing epoch gives 'Actualiza la conexión para recuperar la ronda.'.
- `room/send-command.ts` `sendCommand(socket, event, payload)`:
  - Rejects immediately with 'Sin conexión con el servidor' if the socket is not connected.
  - Uses `socket.timeout(8000).emit(...)`. The ack is `{ok:true,...}` or `{ok:false,error}`; `ok:false` rejects with the server's message.
  - A timeout or an empty response rejects with 'No se pudo confirmar la acción. Comprueba el estado de la sala antes de reintentar.'.
  - A disconnect while waiting rejects with 'Conexión perdida: no se pudo confirmar la acción.'.
  - Commands are never replayed automatically (unknown outcome by design).
  - Excludes the `who-is-who:*` events from the typed command set.
- `room/who-is-who-cursor-channel.ts`: a module-level singleton socket reference and listener set.
  - Listens to `who-is-who:cursor(cursor)`, `who-is-who:cursor-clear({playerId})` and `who-is-who:cursors-reset()`.
  - Emits `who-is-who:cursor(position)` and `who-is-who:cursor-clear({})` fire-and-forget (no ack requested, no timeout).
  - Detach resets the cursors.
- `hooks/useServerTime.ts` has no socket access. `useServerOffset(serverNow) = serverNow - Date.now()` is recomputed whenever the snapshot's `serverNow` changes. `useRemainingMs(deadline, offset, interval)` is `max(0, deadline - now - offset)` on a 100 ms interval. `components/ServerTimer.tsx` uses a 250 ms interval. The offset comes from game state snapshots, so every `room:state`/`session:restored` refreshes it.
- `hooks/useRunoffVote.ts` has no socket access. It wraps a submit function with a per-round epoch guard. A pending flag blocks double submit. A round change resets state and increments the epoch, so a stale rejection is ignored. The pending flag stays true after success until the round changes.

### Reconnection, ack and revision semantics the client relies on
- **`revision` handling (`OptimisticRoomProjection.setAuthoritative`):** a snapshot is ignored if it has the same `roomInstanceId` as the current one and a strictly lower `revision`. The server increments `room.revision` on every broadcast, and `room:state` is sent per member via `io.to(socketId)`. The `session:restored` view reuses the same revision.
- **`connectionStateRecovery`:** the server config is above (`RECONNECT_GRACE_MS`). The client has no recovery-specific code.
- **Server-side restore:** on every connection (fresh or recovered), `rooms.bind` calls `restore()`: if the identity is already a room member, it rebinds the member to the new socket id, joins the socket.io room, emits `session:restored` and applies a presence change. On disconnect the member gets a grace timer.
- **Stale connections:** commands from a replaced socket fail with 'Esta conexión ha sido reemplazada por una sesión más reciente.'.
- **`game:action` guards:** 'El minijuego ya ha cambiado.' (wrong `gameInstanceId`) and 'La ronda o el turno ya ha cambiado.' (wrong `actionEpoch`).
- **Ack contract:** the server `guard` calls `ack({ok:true, ...result})` or `ack({ok:false,error})`. If the client sends no ack function, the server ignores the event. The who-is-who cursor events use `cursorEvent` (optional ack). A per-socket rate-limit rejection uses the socket.io middleware error path, so the client ack never fires.