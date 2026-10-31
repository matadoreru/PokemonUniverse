# Etapa 2A · Núcleo de salas en Java (coordinador, WebSocket, arnés dorado y dos motores piloto) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el backend Java pueda alojar salas completas (lobby, rotación, votación, resultados de sesión) sobre un WebSocket propio, con dos motores de minijuego portados y verificados bit a bit contra los motores TypeScript mediante fixtures doradas, de modo que los 26 motores restantes (2B) sean trabajo repetitivo sobre una base ya probada.

**Architecture:** Port literal del coordinador `apps/server/src/rooms/manager.ts` a `application/rooms/RoomCoordinator` con un ejecutor por sala que serializa acciones, timers, presencia y ciclo de vida del socket (el invariante de Node "ninguna espera antes de mutar"). Un SPI `GameEngine` idéntico a `MiniGameModule`. Un arnés dorado: un exportador TypeScript ejecuta los motores de referencia con PRNG determinista y guarda cada proyección; un replayer JUnit reproduce la misma secuencia en Java y compara árboles JSON canónicos. Transporte `@ServerWebSocket("/ws")` con sobre `{id,event,payload}` / `{id,ok,data|error}`. El frontend gana un adaptador WebSocket seleccionable con `VITE_REALTIME` (`node` por defecto hasta 2D): las salas Java son solo para desarrollo y E2E hasta que 2B y 2C terminen, porque una sala puede lanzar cualquiera de los 28 juegos.

**Tech Stack:** Java 25 · Micronaut 5.1.5 (`micronaut-websocket`, Serde, Data JPA) · JUnit 5 + Testcontainers · Node 22 + `tsx` para el exportador · Vitest · Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md` (§0 etapa 2, §1.5 golden tests, §2.5, §3.2, §3.3 contrato WebSocket) y la sección "Etapa 2: subproyectos" añadida con este plan.

## Descomposición de la etapa 2 (contexto)

| Subproyecto | Contenido | Estado |
|---|---|---|
| **2A (este plan)** | arnés dorado, SPI, coordinador, WebSocket, motores `higher-lower` y `pokedex-distance`, adaptador WS en el front bajo bandera, nginx `/ws` | — |
| 2B Motores | 26 motores restantes por lotes, proxy de imágenes/audio de ronda (transformaciones de `sharp`), canal de cursores de Quién es Quién | pendiente |
| 2C Datos y administración | data-sync (PokéAPI/TCGdex), refresco del catálogo, catálogo TCG y `/api/tcg/*`, API admin, categorías/WYR/avatares con escritura, caché de configuraciones por usuario, `/api/health` | pendiente |
| 2D Cutover | `VITE_REALTIME=java` por defecto, nginx todo a Java, retirar Node y `prisma migrate deploy`, mover `apps/web` a `frontend/`, Flyway único dueño, CI y docs | pendiente |

## Global Constraints

Se mantienen las de la etapa 1 (Java 25, Micronaut 5.1.x, Gradle wrapper, sin dependencias no usadas, nombres de tabla Prisma, cookie `pu_session`, errores `{error}`, commits en español con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, hexagonal: `domain` y `application` sin imports de `adapters`/Micronaut salvo anotaciones Serde/`@Singleton`) y además:

1. **PRNG determinista idéntico en ambos lados**: `mulberry32(seed)`; TS: `let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }`. Java: mismas operaciones con `int` y `Integer.toUnsignedLong`, división `double`. Un motor Java consume el PRNG **el mismo número de veces y en el mismo orden** que el TS: los ports son traducciones literales, incluidos los idiomas `Math.min(Math.floor(random() * n), n - 1)`.
2. **Formato de fixture** (`backend/src/test/resources/golden/<engineId>/<scenario>.json`): `{ engineId, scenario, seed, catalog: "<fixtureId>", players: [{id, displayName, connected?, active?}], config, steps: [ { kind: "action", playerId, action, now } | { kind: "timeout", now } | { kind: "presence", players, now } ], expected: { configNormalized, initial: Snapshot, afterStart: Snapshot, afterSteps: [ { accepted?, error?, snapshot: Snapshot } ], results? } }` donde `Snapshot = { lifecycle, publicState, playerStates: { [playerId]: ... }, finished }`. Además `backend/src/test/resources/golden/<engineId>/config-cases.json`: `[{ input, valid: true, normalized } | { input, valid: false }]`.
3. **Comparación canónica**: árboles JSON con claves ordenadas e igualdad numérica (`1` de JS == `1.0` de Java); el orden de claves no importa; **la presencia sí**: una clave `null` en TS debe estar presente con `null` en Java y una clave ausente en TS debe estar ausente en Java.
4. **Null vs ausente en proyecciones**: los records de estado público/privado de los motores llevan `@JsonInclude(ALWAYS)` a nivel de clase; los campos `?:` opcionales de TS se modelan como `Optional`/anotación `NON_ABSENT` campo a campo. La comparación estricta del punto 3 lo verifica.
5. **`actionEpoch` byte a byte**: `JSON.stringify([phase, roundNumber, roundStartedAt, turnNumber, turnIndex, currentLotIndex, voteRoundNumber, currentTeam])` con `undefined` → `null` (p. ej. `["ROUND_ACTIVE",1,1000,null,null,null,null,null]`). El navegador lo devuelve tal cual.
6. **Mapas con orden de inserción** (`LinkedHashMap`) para cada `Record<string, …>`; para claves con aspecto de entero JS las ordena ascendentes sin importar la inserción: cualquier `Record<number, …>` sigue esa regla al serializar.
7. **Fixture de catálogo** (`backend/src/test/resources/golden/catalog/<fixtureId>.json`) exportada desde la BD local con el mismo cargador que producción (`apps/server/dist/src/pokemon/catalog.js`): Pokémon por defecto de las generaciones 1 y 2 más las formas regionales soportadas de esas generaciones, con los campos públicos de `Pokemon` (sin paleta). Ambos lados construyen el catálogo desde ese JSON con el **mismo filtrado y orden** que `InMemoryPokemonCatalog`.
8. **Regla de congelación**: los motores TS son la referencia y **no cambian** durante la etapa 2. Las fixtures se commitean; `npm run check:golden` regenera y compara, y forma parte de `npm test`, así cualquier edición de un motor TS obliga a regenerar a propósito.
9. **Paridad del coordinador**: `Clock` y `RandomSource` inyectados (Node usa `Date.now()`/`Math.random` en línea); una sección crítica por sala (`ReentrantLock` por sala o un hilo virtual con cola) tomada por acciones, callbacks de timer, cambios de presencia y apertura/cierre de sockets.
10. **Transporte**: identidad desde la cookie `pu_session` en el *handshake* con `IdentityTokens` (sin cookie o inválida → cierre 4401 antes de aceptar); límite por conexión de 50 eventos / 10 s excluyendo `who-is-who:cursor*`; mensaje máximo 32 768 bytes (`maxHttpBufferSize` de Node); `session:restored` en cada apertura para un miembro conocido; mismos nombres de evento y mismos payloads que `ClientToServerEvents`/`ServerToClientEvents`.
11. **Registro de juegos**: `GameRegistry` mantiene los 28 manifests desde `registry.json` (`/api/games` y el perfil no cambian) y un `Map<String, GameEngine>` de motores portados; el coordinador rechaza arrancar uno no portado con `Este minijuego todavía no está disponible en el servidor Java.`
12. **`customizedGameIds`** se calcula con igualdad de árbol JSON entre la configuración normalizada y la por defecto (equivalente a `isDeepStrictEqual`).

## Review Focus

1. **Dos acciones simultáneas de jugadores distintos en la misma sala** deben serializarse: la segunda ve el estado producido por la primera y nunca se pierde una mutación (test de concurrencia en Tarea 6).
2. **Callback de timer que llega tras cambiar la fase** (deadline antiguo) no debe aplicar un `handleTimeout` obsoleto: guardia de identidad de timer como `room.transitionTimer !== timer` (Tarea 6).
3. **Reconexión dentro de la gracia con una pestaña nueva**: la conexión antigua queda reemplazada y sus comandos responden `Esta conexión ha sido reemplazada por una sesión más reciente.` (Tarea 7).
4. **Mensaje WebSocket mal formado o mayor de 32 KiB**: ack `{ok:false,error}` o cierre limpio, nunca excepción sin control ni caída de la sala (Tarea 7).
5. **Motor con `random()` consumido en orden distinto al TS**: lo detecta la fixture dorada de la Tarea 4/5 con `seed` fijo; el plan exige escenarios con ≥ 3 rondas para que la deriva aparezca.

---

### Task 1: Fixture de catálogo y exportador de fixtures doradas (lado TypeScript)

**Files:**
- Create: `scripts/export-golden-catalog.mjs`, `scripts/export-golden-fixtures.mjs`, `packages/shared/golden/runner.ts`, `packages/shared/golden/prng.ts`, `packages/shared/golden/types.ts`, `packages/shared/golden/catalog.ts`, `packages/shared/golden/scenarios/index.ts`
- Create: `backend/src/test/resources/golden/catalog/gen1-2.json`
- Modify: `package.json` (scripts `golden:catalog`, `golden:export`, `check:golden`; `check:golden` en `test` tras `check:registry`), `packages/shared/tsconfig.json` (excluir `golden/` del build de `dist`), `eslint.config.mjs` si hace falta
- Test: `packages/shared/golden/prng.test.ts`, `packages/shared/golden/runner.test.ts`

**Interfaces:**
- `prng.ts`: `export function mulberry32(seed: number): () => number` (constraint 1).
- `types.ts`: tipos `GoldenScenario`, `GoldenStep`, `GoldenSnapshot`, `GoldenFixture`, `ConfigCase` exactamente como la constraint 2.
- `catalog.ts`: `loadGoldenCatalog(fixtureId): PokemonCatalog` construyendo `InMemoryPokemonCatalog` (import desde `../../apps/server/dist/src/pokemon/catalog.js`) con las filas del JSON.
- `runner.ts`: `runScenario(module, scenario): GoldenFixture` — crea `context` con `random = mulberry32(seed)`, `now` del paso, `players` (actualizados por pasos `presence`), ejecuta `createInitialState` → snapshot `initial`, `start` → `afterStart`, y cada paso (`handleAction`/`handleTimeout`/`handlePresenceChange`) guardando `{accepted, error, snapshot}`; snapshot = `{ lifecycle: module.getLifecycle(state), publicState: module.getPublicState(state, context), playerStates: {id → getPlayerState}, finished: module.isFinished(state) }`; `results` cuando `finished`. Si el motor lanza, el paso guarda `{ threw: message }`.
- `scenarios/index.ts`: `export const scenarios: Record<string, { module, scenarios: GoldenScenario[], configCases: ConfigCase[] }>` (vacío en esta tarea; las tareas 4 y 5 añaden entradas).
- `scripts/export-golden-fixtures.mjs`: ejecuta `tsx packages/shared/golden/runner.ts --out backend/src/test/resources/golden` (escribe un JSON por escenario con `JSON.stringify(..., null, 2) + '\n'` y claves ordenadas recursivamente) o `--check` (compara y sale 1 con `Ejecuta npm run golden:export`).
- `scripts/export-golden-catalog.mjs`: con `DATABASE_URL`, carga el catálogo real con `loadPokemonCatalog()` del `dist` del servidor, filtra generaciones 1 y 2 (`forGenerations([1,2], {includeForms:true})`), elimina `palette`/`paletteWeights`, y escribe `gen1-2.json` (`{ fixtureId: "gen1-2", pokemon: [...] }`). Se ejecuta una vez y se commitea.

- [ ] **Step 1: Tests que fallan.** `prng.test.ts`: `mulberry32(42)` produce la secuencia `[0.6011037519201636, 0.44829055899754167, 0.8524657934904099]` (valores calculados con la implementación de referencia; si difieren, el test fija los que produzca la implementación TS y Java los reproduce) y `mulberry32(1)()` ≠ `mulberry32(2)()`. `runner.test.ts`: con un módulo mínimo falso (un contador), `runScenario` devuelve `initial`, `afterStart`, un `afterSteps` por paso y `results` al terminar; con un paso que lanza, guarda `threw`.
- [ ] **Step 2: Ver fallar.** `npx vitest run packages/shared/golden` → FAIL.
- [ ] **Step 3: Implementar** los ficheros de Interfaces. Añadir `tsx` como devDependency raíz si no está (ya es dependencia de `apps/server`; reutilizarla con `npx tsx`).
- [ ] **Step 4: Ver pasar.** `npx vitest run packages/shared/golden` → PASS; `npm run build -w @pokemon-universe/server && DATABASE_URL=... npm run golden:catalog` crea `gen1-2.json` con 251 Pokémon por defecto más las formas regionales soportadas; `npm run golden:export` sin escenarios escribe nada y sale 0; `npm run check:golden` → 0.
- [ ] **Step 5: Commit.** `Arnés dorado: PRNG, runner de escenarios y fixture de catálogo`.

---

### Task 2: SPI de motores e infraestructura compartida en Java

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engine/GameEngine.java`, `GameContext.java`, `GamePlayer.java`, `GameLifecycle.java`, `GameActionResult.java`, `GameResults.java`, `GameStanding.java`, `GamePhase.java`, `EngineException.java`
- Create: `.../domain/game/engine/infra/TimedLifecycle.java`, `Timing.java`, `TimedRoundStrategy.java`, `RunoffVoting.java`, `Randoms.java` (`shuffled`, `contentDeck`, `randomItem`), `GuessingRound.java`
- Create: `.../domain/game/Scoring.java` (`pointsForPosition`, `rankCompetition`, `buildRankedResults`, `sessionPointsForResults`, `SESSION_SCORING_VERSION`)
- Create: `.../domain/game/GameConfigReadiness.java` (`validateGameConfigReadiness`)
- Create: `.../domain/pokemon/PokemonCatalog.java` (interfaz `all/byId/byDexNumber/forGenerations`), `InMemoryPokemonCatalog.java` (filtrado y orden de `catalog.ts` — extraer el filtro ya existente en `PokemonCatalogService` para reutilizarlo), `.../domain/json/JsonTree.java` (canonicalización, igualdad numérica, orden de claves enteras)
- Test: `ScoringTest`, `TimingTest`, `RandomsTest`, `JsonTreeTest`, `InMemoryPokemonCatalogTest`

**Interfaces:**
- `GameEngine<C, S, A, P>`: `GameManifest manifest()`, `C parseConfig(JsonNode raw)` (lanza `ConfigValidationException(message)`; devuelve la configuración normalizada como lo haría Zod), `A parseAction(JsonNode raw)`, `C defaultConfig()`, `Optional<String> checkAvailability(C, GameContext)`, `S createInitialState(C, GameContext)`, `S start(S, GameContext)`, `GameActionResult<S> handleAction(S, String playerId, A, GameContext)`, `S handleTimeout(S, GameContext)`, `S handlePresenceChange(S, GameContext)` (por defecto devuelve `state`), `P getPublicState(S, GameContext)`, `Object getPlayerState(S, String playerId, GameContext)`, `GameLifecycle getLifecycle(S)`, `boolean isFinished(S)`, `GameResults getResults(S)`, `Optional<CursorChannel> getCursorChannel(S, String playerId)` (vacío por defecto), `Optional<AssetResolution> resolveAsset(S, AssetRequest, GameContext)` (vacío por defecto).
- `GameContext(List<GamePlayer> players, PokemonCatalog pokemon, long now, DoubleSupplier random, @Nullable String roomCode, @Nullable String hostId, List<SubjectiveCategory> hostCustomCategories, List<WouldYouRatherPromptPair> hostWouldYouRatherPrompts, …)` con `isPlayerRequired(playerId)`, `connectedRequiredPlayerIds(ids)`, `allConnectedRequiredCompleted(ids, predicate)`.
- `GameLifecycle(GamePhase phase, @Nullable Long nextDeadline, String actionEpoch, List<String> spectatorIds)`; `TimedLifecycle.of(phase, roundEndsAt, nextTransitionAt, roundStartedAt, roundNumber, turnNumber, turnIndex, currentLotIndex, voteRoundNumber, currentTeam)` produce el `actionEpoch` de la constraint 5 (test byte a byte).
- `Scoring.pointsForPosition(int playerCount, int position)` con `RangeError` → `IllegalArgumentException`; `rankCompetition(entries, comparator, tieKey)`; `buildRankedResults(entries, comparator, tieKey, mapStats)`; `sessionPointsForResults(GameResults)`.
- `JsonTree.canonical(Object)`/`equal(a, b)` sobre `io.micronaut.json.tree.JsonNode` o `Map`/`List` (constraint 3 y 6).

- [ ] **Step 1: Tests que fallan.** Portar los casos de `packages/shared/src/scoring.test.ts` (si existe; si no, los ejemplos: `pointsForPosition(4,1)==8`, `(4,2)==5`, `(4,3)==3`, `(4,4)==1`, ranking `1,2,2,4`), `timing`/`runoff` casos de sus tests TS, `TimedLifecycle` epoch exacto `["ROUND_ACTIVE",1,1000,null,null,null,null,null]`, `JsonTree.equal` con `1` vs `1.0` y claves `{"10":..,"2":..}` ordenadas como JS, `InMemoryPokemonCatalog` cargando `golden/catalog/gen1-2.json` y comprobando `forGenerations([1])` con 151 y orden por número de Pokédex.
- [ ] **Step 2: Ver fallar.** `./gradlew test --tests 'es.pokemonuniverse.domain.game.*'` → FAIL.
- [ ] **Step 3: Implementar.** Traducción literal de `scoring.ts`, `timing.ts`, `runoff-voting.ts`, `random.ts`, `guessing-round.ts`, `lifecycle.ts`, `config-readiness.ts`. `Randoms.shuffled` y `contentDeck` consumen `random()` exactamente como el TS.
- [ ] **Step 4: Ver pasar.** → PASS.
- [ ] **Step 5: Commit.** `Backend Java: SPI de motores, puntuación, temporización y catálogo en memoria`.

---

### Task 3: Replayer dorado en Java

**Files:**
- Create: `backend/src/test/java/es/pokemonuniverse/golden/GoldenFixture.java` (records del formato), `GoldenCatalogs.java`, `Mulberry32.java` (en `src/main/java/.../domain/game/engine/infra/` porque el coordinador también lo necesita en tests; el replayer lo usa), `GoldenReplayer.java`, `GoldenReplayTest.java` (`@TestFactory` → un `DynamicTest` por fichero `golden/<engineId>/*.json` y por caso de `config-cases.json`), `GoldenEngines.java` (mapa `engineId → GameEngine`, vacío hasta la Tarea 4)
- Test: `Mulberry32Test` (misma secuencia que `prng.test.ts`), `GoldenReplayerTest` (con un motor falso y una fixture mínima inline: detecta un valor cambiado, una clave ausente y una clave `null` convertida en ausente)

**Interfaces:**
- `GoldenReplayer.replay(GameEngine engine, GoldenFixture fixture, PokemonCatalog catalog)`: ejecuta la misma secuencia que `runner.ts`, serializa cada proyección con el `ObjectMapper` de Serde a `JsonNode`, y compara con `JsonTree.equal` contra `expected`; el primer desajuste lanza `AssertionError` con la ruta JSON (`afterSteps[3].snapshot.publicState.scores.p2`), el valor esperado y el obtenido.
- Los motores no registrados en `GoldenEngines` hacen que el `DynamicTest` falle con `Motor no portado: <id>` (no se saltan).

- [ ] **Step 1: Tests que fallan.** `Mulberry32Test`, `GoldenReplayerTest`.
- [ ] **Step 2: Ver fallar.** `./gradlew test --tests '*golden*'` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver pasar.** → PASS (sin fixtures reales aún, `GoldenReplayTest` genera 0 tests dinámicos y pasa).
- [ ] **Step 5: Commit.** `Backend Java: replayer de fixtures doradas`.

---

### Task 4: Motor piloto `higher-lower` con escenarios dorados

**Files:**
- Create: `packages/shared/golden/scenarios/higher-lower.ts` (≥ 4 escenarios: `two-players-three-rounds` (3 rondas, respuestas correctas/incorrectas/sin responder, `REVEAL` por timeout), `realtime-visibility`, `presence-resolves-round` (un jugador desconecta a mitad), `difficulty-very-hard-single-player`; cada uno con `seed` distinto; `configCases` con normalización de `generations` y `categories` duplicadas, y 3 inválidos)
- Modify: `packages/shared/golden/scenarios/index.ts`
- Create: `backend/src/test/resources/golden/higher-lower/*.json` (generados)
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/higherlower/HigherLowerConfig.java` (record + `parse(JsonNode)` con los mismos límites y normalización que `higherLowerConfigSchema`), `HigherLowerTypes.java` (records de estado/acción/proyecciones), `HigherLowerRules.java` (port de `rules.ts`), `HigherLowerEngine.java` (port de `server.ts`)
- Modify: `GoldenEngines.java` (registrar `higher-lower`)
- Test: `HigherLowerRulesTest` (port de los casos de `rules.test.ts` si existe; si no, `streakBonus`, `higherLowerAnswer`, `selectPokemonByDifficulty` con PRNG fijo)

**Interfaces:**
- `HigherLowerEngine implements GameEngine<HigherLowerConfig, HigherLowerState, HigherLowerAction, HigherLowerPublicState>`; `manifest()` devuelve el `GameManifest` cargado del `registry.json` para `higher-lower` (no se duplica a mano).
- Mensajes de error literales del TS: `La ronda no está activa.`, `No participas.`, `No estás conectado como participante.`, `El tiempo ha terminado.`, `Tu respuesta ya está bloqueada.`, `Se necesitan al menos dos Pokémon en las generaciones seleccionadas.`.

- [ ] **Step 1: Escenarios TS y fixtures.** Escribir los escenarios, `npm run build -w @pokemon-universe/shared && npm run golden:export`; revisar a ojo un fixture (fases `ROUND_ACTIVE → ROUND_RESULTS → … → GAME_RESULTS`, `results` presente al final); commit de los escenarios y fixtures.
- [ ] **Step 2: Ver fallar en Java.** `./gradlew test --tests '*GoldenReplayTest*'` → FAIL con `Motor no portado: higher-lower`.
- [ ] **Step 3: Implementar** el port literal (config, rules, engine). Reglas: `LinkedHashMap` para `answers/scores/streaks/playerStats`; `randomItem` idéntico; `getPublicState` con `@JsonInclude(ALWAYS)` y `value: null` explícito.
- [ ] **Step 4: Ver pasar.** `./gradlew test --tests '*GoldenReplayTest*' --tests '*HigherLower*'` → PASS, incluidos los `config-cases`.
- [ ] **Step 5: Commit.** `Backend Java: motor Higher or Lower verificado con fixtures doradas`.

---

### Task 5: Motor piloto `pokedex-distance` con escenarios dorados

**Files:**
- Create: `packages/shared/golden/scenarios/pokedex-distance.ts` (≥ 4 escenarios incluyendo eliminación, empate, desconexión y partida completa de 3 jugadores), fixtures generadas
- Create: `.../domain/game/engines/pokedexdistance/PokedexDistanceConfig.java`, `PokedexDistanceTypes.java`, `PokedexDistanceRules.java`, `PokedexDistanceEngine.java`
- Modify: `GoldenEngines.java`
- Test: `PokedexDistanceRulesTest`

**Interfaces:** como la Tarea 4, para `pokedex-distance` (leer `packages/shared/src/games/pokedex-distance/{server,rules,types,config}.ts` y su `server.test.ts`).

- [ ] **Step 1–5:** idénticos a la Tarea 4. Commit: `Backend Java: motor Pokédex Distance verificado con fixtures doradas`.

---

### Task 6: Coordinador de salas (dominio y aplicación)

**Files:**
- Create: `.../domain/room/LiveRoom.java`, `RoomMember.java`, `GameRuntime.java`, `NextGameVote.java`, `SessionParticipant.java`, `RoomPhase.java`, `RoomRole.java`, `RoomPermission.java` (tabla de permisos de `room.ts`), `PresenceStatus.java`, `MemberRole.java`, `SessionMode.java` (sealed), `GameSelectionMode.java` (sealed), `Presence.java` (port de `presence.ts`), `GameSkip.java` (port de `game-skip.ts`), `RoomCodes.java` (alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 6 caracteres)
- Create: `.../application/rooms/RoomCoordinator.java` (port de `manager.ts`), `RoomStore.java` (port de `store.ts`), `RoomViews.java` (`publicView`/`view`), `RoomSchedulers.java` (timers con `ScheduledExecutorService` y guardia de identidad), `RoomLocks.java` (sección crítica por sala), `RoomEvents.java` (puerto: `sendToMember(memberId, event, payload)`, `kick(memberId, reason)`), `RoomAuditSink.java` (puerto), `GameResultsPersister.java` (puerto), `RoomCommand*` records de entrada, `RoomException.java` (mensaje literal → ack `{ok:false,error}`)
- Create: `.../adapters/out/persistence/JpaRoomAuditSink.java` (port de `admin/audit.ts`: `RoomHistory`/`GameHistory` entidades + `interruptStaleActivity` al arrancar), `JpaGameResultsPersister.java` (port de `stats/service.ts`: transacción `SERIALIZABLE`, 3 reintentos, idempotencia por `resultId`, `mergeMetrics` SUM/MAX/MIN, `PlayerGameResult`, `UserStats`, `UserGameStats`), entidades `RoomHistoryEntity`, `GameHistoryEntity`, `PlayerGameResultEntity` con los enums nativos `RoomHistoryStatus`/`GameHistoryStatus`
- Create: `.../application/rooms/PendingTasks.java` (port), `Clock`/`RandomSource` puertos en `application/time`
- Test: `RoomCoordinatorTest` (con `RoomEvents` falso que captura eventos, `Clock` manual, `RandomSource` = `Mulberry32`, motores piloto reales, catálogo dorado): escenarios portados de `apps/server/src/rooms/manager.test.ts`: crear/unirse/`Room is full`/`Leave your current room first`/abandonar/transferencia de host por antigüedad/gracia de desconexión y expiración/`ready` obligatorio con `Falta por confirmar: …`/arranque con `higher-lower` hasta `GAME_RESULTS`/`continueSession` en modo `FIXED`/rotación `RANDOM` y `VOTE` (15 s, empate aleatorio, 3 s de resultado)/`SESSION_RESULTS` por `GAME_COUNT` y `POINT_TARGET`/voto unánime de salto/expulsión/roles y permisos (`No tienes permiso para realizar esta acción.`)/`revision` monótona y `roomInstanceId`/`customizedGameIds`/juego no portado rechazado; `RoomConcurrencyTest` (Review Focus 1 y 2: 200 acciones concurrentes de 4 jugadores sobre `higher-lower` nunca pierden una respuesta; un timer obsoleto no aplica); `JpaGameResultsPersisterTest` y `JpaRoomAuditSinkTest` con Testcontainers (idempotencia por `resultId`, `UserGameStats.metrics` MAX/MIN/SUM)
- Modify: `GameRegistry` (añadir `engines()`/`engine(id)`), `ClasspathGameRegistryLoader` (registrar motores portados como beans `GameEngine`)

**Interfaces:**
- `RoomCoordinator`: métodos públicos uno por evento de `ClientToServerEvents` (`create(identity, maxPlayers)`, `join(identity, code)`, `leave(playerId)`, `selectGame`, `updateConfig`, `updateGameConfig`, `updateSession`, `updateGameSelection`, `voteNextGame`, `setRoomRole`, `transferHost`, `kick`, `setReady`, `startGame`, `continueSession`, `returnLobby`, `endSession`, `setGameSkipVote(playerId, request)`, `gameAction(playerId, GameActionRequest)`, `connect(identity, connectionId)` (→ `restore`), `disconnect(playerId, connectionId)`, `updateIdentityAvatar`, `updateHostCategories`, `updateHostWouldYouRatherPrompts`, `replaceCatalog`, `adminRooms()`, `gameAsset(...)`, `stop()`, `flush()`); cada uno toma el lock de la sala y devuelve `RoomView` cuando el TS lo hace.
- `RoomView` como record `@Serdeable @JsonInclude(ALWAYS)` con **exactamente** las claves de `RoomView` TS (incluidas las opcionales `gameConfigs`, `customizedGameIds`, `gameSkipState`, `roomInstanceId`, `revision`, `gameCatalogVersion`, `gameActionEpoch`, `hostCustomCategoryCount`, `hostWouldYouRatherPromptCount`, siempre presentes como en Node).
- Mensajes literales de `manager.ts` (en inglés o español tal como están) se copian sin traducir.
- `RoomEvents.sendToMember(id, "room:state", view)`; `broadcast` calcula `publicView` una vez y `view` por miembro (igual que Node).

- [ ] **Step 1: Tests que fallan.** Los de la lista (leer `manager.test.ts` y portar los que cubren cada ítem; mantener nombres equivalentes).
- [ ] **Step 2: Ver fallar.** `./gradlew test --tests '*Room*' --tests '*Jpa*'` → FAIL.
- [ ] **Step 3: Implementar** el port literal de `manager.ts` y módulos. Timers: `ScheduledExecutorService` de un hilo virtual; cada callback re-entra por el lock de la sala y comprueba la identidad del timer. Cierre: `stop()` cancela timers; `flush()` espera `PendingTasks`.
- [ ] **Step 4: Ver pasar.** → PASS.
- [ ] **Step 5: Commit.** `Backend Java: coordinador de salas con persistencia de resultados y auditoría`.

---

### Task 7: Transporte WebSocket `/ws`

**Files:**
- Create: `.../adapters/in/ws/RoomWebSocket.java` (`@ServerWebSocket("/ws")`), `WsEnvelope.java` (`ClientMessage(id, event, payload)`, `AckMessage(id, ok, data?, error?)`, `PushMessage(event, payload)`), `WsSessions.java` (conexión ↔ identidad ↔ `connectionId`), `WsRateLimiter.java` (50 / 10 s excluyendo cursores), `WsRoomEvents.java` (implementa `RoomEvents` enviando `PushMessage` por `connectionId`), `WsHandshake.java` (cookie → `IdentityTokens.verify`)
- Modify: `application.yml` (`micronaut.server.max-request-size` no afecta a WS: configurar `micronaut.websocket.max-frame-payload-length` o la propiedad equivalente en Micronaut 5 a 32768), `build.gradle.kts` (`io.micronaut:micronaut-websocket`)
- Test: `RoomWebSocketTest` (`@MicronautTest`, cliente `WebSocketClient` de Micronaut): sin cookie → cierre 4401; con cookie: `room:create` → ack con `room.code`; segundo cliente `room:join`, `room:set-ready`, host `room:select-game` `higher-lower`, `room:start-game` → ambos reciben `room:state` con `phase ROUND_ACTIVE`; `game:action` con `gameInstanceId`/`actionEpoch` del snapshot → ack ok; desconexión de uno → el otro ve `presence TEMPORARILY_DISCONNECTED`; reconexión del mismo usuario con otra conexión → `session:restored` y la conexión antigua recibe `Esta conexión ha sido reemplazada por una sesión más reciente.` al enviar un comando (Review Focus 3); mensaje no JSON → ack `{ok:false,error:"Mensaje inválido"}` sin cerrar; mensaje de 40 KiB → conexión cerrada con código 1009 y la sala sigue viva (Review Focus 4); 51 comandos en 10 s → ack `{ok:false,error:"Rate limit exceeded"}`.

**Interfaces:**
- Sobre de cliente: `{"id": "<string>", "event": "<nombre ClientToServerEvents>", "payload": {...}}`; ack: `{"id", "ok": true, "data": {...}}` o `{"id", "ok": false, "error": "..."}`; push: `{"event": "room:state", "payload": RoomView}` (y `room:kicked` con `payload: string`, `session:restored`, `error:message`, `who-is-who:*`). Los eventos de cursor no llevan `id` y no reciben ack salvo que lo incluyan.
- `connectionId` = id de sesión WebSocket; `RoomCoordinator.connect(identity, connectionId)` en `@OnOpen`, `disconnect` en `@OnClose`.

- [ ] **Step 1: Test que falla.** `RoomWebSocketTest`.
- [ ] **Step 2: Ver fallar.** → FAIL.
- [ ] **Step 3: Implementar.** Ejecutar cada comando dentro del lock de sala del coordinador (nunca en el hilo del event loop de Netty: `@ExecuteOn(BLOCKING)` en el endpoint).
- [ ] **Step 4: Ver pasar.** `./gradlew check` → PASS.
- [ ] **Step 5: Commit.** `Backend Java: transporte WebSocket de salas con sobre, acks y límites`.

---

### Task 8: Adaptador WebSocket en el frontend bajo bandera

**Files:**
- Create: `apps/web/src/lib/realtime.ts` (interfaz), `apps/web/src/lib/realtime-socketio.ts` (envuelve el `createSocket` actual), `apps/web/src/lib/realtime-ws.ts` (WebSocket nativo), `apps/web/src/lib/realtime-ws.test.ts`
- Modify: `apps/web/src/lib/socket.ts` (fábrica `createRealtime()` según `import.meta.env.VITE_REALTIME ?? 'node'`), `apps/web/src/room/RoomContext.tsx`, `apps/web/src/room/send-command.ts`, `apps/web/src/room/who-is-who-cursor-channel.ts`, `apps/web/vite.config.ts` (proxy `/ws` → `ws://localhost:8080` con `ws: true`), `apps/web/src/vite-env.d.ts` (tipo de `VITE_REALTIME`)
- Test: `realtime-ws.test.ts` con un `WebSocket` falso: envía sobre con `id` incremental, resuelve el ack, rechaza a los 8 s con `No se pudo confirmar la acción. Comprueba el estado de la sala antes de reintentar.`, rechaza en desconexión con `Conexión perdida: no se pudo confirmar la acción.`, `emit` sin conexión rechaza `Sin conexión con el servidor`, reconexión con *backoff* 500 ms → 8 s y `connect`/`disconnect` emitidos, push `room:state` entregado a los listeners; `send-command.test.ts` actualizado al adaptador.

**Interfaces:**
```ts
export interface RealtimeClient {
  readonly connected: boolean;
  on<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): void;
  off<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): void;
  onConnection(listener: (connected: boolean, error?: string) => void): () => void;
  request<E extends CommandEvent>(event: E, payload: CommandPayload<E>): Promise<CommandResult<E>>; // ack con timeout 8 s
  fire<E extends 'who-is-who:cursor' | 'who-is-who:cursor-clear'>(event: E, payload: CommandPayload<E>): void; // sin ack
  disconnect(): void;
}
```
- `RoomContext` solo usa `RealtimeClient`; el comportamiento con `VITE_REALTIME=node` es idéntico al actual (los tests existentes de `RoomContext`/`send-command` siguen en verde).

- [ ] **Step 1–5:** TDD como arriba; `npm run typecheck && npm run lint && npm test` en verde. Commit: `Web: adaptador de tiempo real intercambiable (Socket.IO o WebSocket nativo) bajo VITE_REALTIME`.

---

### Task 9: nginx, Compose y E2E bajo la bandera

**Files:**
- Modify: `infra/nginx.conf` (`location /ws { proxy_pass http://backend:8080; proxy_http_version 1.1; Upgrade/Connection; proxy_read_timeout 75s; }`), `e2e/playwright.config.ts` (segundo *project* `chromium-java` con `env VITE_REALTIME=java` para el `webServer` de web, o un script `npm run test:e2e:java` que exporta la variable), `package.json` (`test:e2e:java`), `README.md`, `docs/architecture.md` (sección "Salas en Java (etapa 2A)": bandera, límites, no apto para producción hasta 2D), `docs/migracion-java-pendientes.md` (2A hecho; 2B/2C/2D)
- Test: `npm run test:e2e:java` ejecuta `sala.spec.ts` y `acceso.spec.ts` contra el WebSocket Java (crear sala, unirse desde dos navegadores, listo, empezar `higher-lower`), además de la suite normal `npm run test:e2e` (Node) que sigue en verde.

- [ ] **Step 1:** Cambios de configuración y docs.
- [ ] **Step 2:** Verificar: `npm run test:e2e` 12/12; `npm run test:e2e:java` con `sala.spec.ts` en verde (si `sala.spec` arranca un juego distinto de los pilotos, parametrizarlo para elegir `higher-lower` en el project `chromium-java`); `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait` y comprobación manual con `websocat`/`curl` de que `/ws` llega a Java (handshake 101) — cerrar después.
- [ ] **Step 3: Commit.** `Salas Java accesibles en /ws para desarrollo y E2E bajo VITE_REALTIME=java`.
