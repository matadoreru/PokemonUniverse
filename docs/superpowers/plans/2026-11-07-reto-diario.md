# Reto diario: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** desde «Jugar», una cuenta registrada juega sola, una vez al día, **el** reto diario: un único reto por día, de un minijuego sorteado a partir de la fecha entre Pokédex Distance, Shiny Quiz, Higher or Lower y Learnset Guess (Decisión del usuario (2026-11-06)). El juego y el contenido son los mismos para todos ese día, y al terminar ve su resultado, la clasificación del día (una por día) y un texto para compartir.

**Architecture:**
- El reto es una sala privada de un jugador, marcada con `LiveRoom.daily`. Reutiliza los motores, los temporizadores y las pantallas.
- `RoomCoordinator.startDaily` la crea y arranca la partida con un `Mulberry32` propio y un `PinnedPokemonCatalog`. La semilla es `HMAC(pu.auth.secret, fecha)`: primero elige el juego (`seed % 4`) y después alimenta el motor. El juego y la lista de ids del catálogo se guardan por día en `DailyChallenge`.
- `DailyChallengeService` (application/daily) inserta `DailyResult` `STARTED` antes de arrancar y sirve las lecturas.
- `DailyRunRecorder` (application/daily) implementa `DailyRunListener`: observa cada ronda y guarda `FINISHED` o `ABANDONED` en segundo plano, sin `GameResultsPersister` ni XP. Va aparte del servicio para que no haya un ciclo de beans con `RoomCoordinator`.
- Transporte: el comando `/ws` `daily:start` (sin juego), el evento `daily:recorded` y las rutas REST `GET /api/daily` y `GET /api/daily/leaderboard`.
- Frontend: panel en `PlayPage` con el juego de hoy, `DailyResultsScreen` en `RoomPage` y la página `/daily`.

**Tech Stack:** Java 25, Micronaut 5, Micronaut Data JPA, Flyway, WebSocket nativo; React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-reto-diario-design.md`

**Requisito previo:** la Fase 3 (modos de juego, rama `modos`) fusionada en `main`. Este plan usa `PokedexDistanceMode.POINTS`, `LearnsetGuessMode.MANUAL_REVEAL` y los motores tal como quedan allí, y se ejecuta en su propia rama desde ese `main`.

## Global Constraints

- **Solo cuentas `USER`.** Un invitado recibe:
  - `401 {"error":"Registered account required"}` en `/api/daily*`;
  - el mismo mensaje en el ack de `daily:start`.
- **Un reto al día** (Decisión del usuario (2026-11-06)): el juego del día es `DailyGames.all().get(seed % 4)`, puede repetirse en días seguidos, y si la fila de hoy de `DailyChallenge` existe, su `gameId` manda. El orden de `DailyGames.all()` y de `DAILY_GAME_IDS` (`pokedex-distance`, `shiny-vote`, `higher-lower`, `learnset-guess`) es contrato: no se reordena.
- **Juegos y configuración fija** (se aplica al juego que toque). Es `engine.defaultConfig()` con estas claves sustituidas:
  - `pokedex-distance`: `mode: POINTS`, `pointsRounds: 5`, y 5 rondas;
  - `higher-lower`: `mode: CLASSIC`, `rounds: 10`, y 10 rondas;
  - `shiny-vote`: `mode: CLASSIC`, `rounds: 10`, `optionCount: 4`, y 10 rondas;
  - `learnset-guess`: `mode: MANUAL_REVEAL`, `rounds: 3`, `roundSeconds: 90`, y 3 rondas.
- **Un intento por cuenta y día** (Decisión del usuario (2026-11-06)): índice único `("userId","date")` en `DailyResult`, y `STARTED` se inserta antes de crear la sala. `DailyResult.gameId` se queda como columna, para mostrarlo.
- **Día:**
  - `ZoneId.of("Europe/Madrid")`, constante, sin configuración;
  - fecha `AAAA-MM-DD`;
  - `resetsAt` es la próxima medianoche de Madrid en ISO-8601 UTC;
  - una partida pertenece a la fecha en la que empezó.
- **Semilla:**
  - los 4 primeros bytes big-endian, sin signo, de `HMAC-SHA256(pu.auth.secret UTF-8, "daily|" + fecha)`;
  - primero da el juego (`seed % 4`, exactamente uniforme porque `2^32` es múltiplo de 4) y después `new Mulberry32(seed)`, que es la única fuente de azar del motor en esa partida, también en cada `context(room)`.
- **Catálogo fijado:**
  - `DailyChallenge(date PK, gameId text, pokemonIds jsonb, catalogFingerprint text, createdAt)`, insertado con `ON CONFLICT DO NOTHING` y leído después;
  - la huella es el SHA-256 hexadecimal en minúsculas de los ids unidos por `\n`;
  - los ids que faltan se omiten y se registra un `WARN` con ellos.
- **Estados de `DailyResult`:**
  - `STARTED`, `FINISHED` y `ABANDONED`;
  - solo se cambia desde `STARTED`;
  - una fila `STARTED` sin partida viva se lee como `ABANDONED`;
  - `score`, `correct` y `rounds` solo existen en `FINISHED`.
- **Errores** (en inglés en el servidor; la web los traduce en `roomCode.ts`):
  - `"Registered account required"`;
  - `"Daily challenge already played"`;
  - `"Leave your current room first"`;
  - `"Not available in the daily challenge"`;
  - `"Play today's challenge first"` (REST `403`).
- **En una sala del reto:**
  - se rechazan con `"Not available in the daily challenge"`: `room:select-game`, `room:update-config`, `room:update-game-config`, `room:update-session`, `room:update-game-selection`, `room:vote-next-game`, `room:set-role`, `room:transfer-host`, `room:kick`, `room:set-ready`, `room:start-game`, `room:continue-session`, `room:return-lobby`, `room:end-session`, `room:update-allowed-modes`, `room:chat:send`, `room:chat:delete`, `room:chat:mute`, `room:invite` y `game:skip-vote:set`;
  - `room:join` de otra cuenta responde `"Room not found"`;
  - `roomOf` devuelve vacío;
  - `gameSkipState` es `null`.
- **Una partida del reto no:**
  - llama a `GameResultsPersister`;
  - suma XP;
  - llama a `RoomAuditSink` (ni `roomCreated`, ni `gameStarted`, ni `roomClosed`).
- **Puntuación y clasificación:**
  - `score = GameStanding.points` y `correct` según la spec;
  - orden por `score` descendente y, a igual puntuación, por `finishedAt` ascendente;
  - las puntuaciones iguales comparten puesto (1, 1, 3);
  - una clasificación por día, sin juego en la ruta: las 50 primeras filas más `me`.
- **`rounds` por juego:**
  - Distance: la distancia, o `-1`;
  - Higher or Lower y Shiny Quiz: `1`, `0` o `-1`;
  - Learnset Guess: los grupos al acertar, o `0`;
  - las rondas que no se observaron se rellenan con `-1` (con `0` en Learnset).
- **Contrato de cable:**
  - comando `daily:start {}` (sin campos), con ack `{room}`;
  - evento `daily:recorded {date, gameId}`;
  - `RoomView.daily: {gameId, date, roundCount, result: {score, correct, rounds} | null} | null`.
- **Migración:**
  - `V13__reto_diario.sql` (V8–V12 ya están en main: logros, racha, notas 0.6.0, perfil visible y notas 0.7.0);
  - nunca se edita una migración aplicada.
- **Textos:** los literales de la spec, en el apartado «Interfaz» y en la tabla del texto para compartir.
- **Las reglas de `AGENTS.md`:**
  - comentarios en Java en español y capa hexagonal (application no depende de adapters/in);
  - OpenAPI y tipos regenerados;
  - UI solo con `frontend/src/ui/`; texto ≥ 13 px; objetivos táctiles ≥ 44 px;
  - un solo dueño por error y una región viva por pantalla;
  - Playwright a tres tamaños y rúbrica ≥ 19/24 en el commit de UI.
- **Fuera del lock:** la escritura en BD y los avisos (`daily:recorded`, `DailyResultEvents`) nunca se hacen con el lock de una sala tomado. `observe` y el cálculo de `daily.outcome` son solo memoria.
- **Regla del usuario:** nada de suites completas; solo los tests de lo tocado. Ni `npm test` ni `./gradlew check` enteros: cada paso nombra sus `--tests` o sus ficheros de Vitest.

## Review Focus

1. **Sala del reto contra todos los comandos.** Cada comando de lobby o sesión se rechaza. Otra cuenta no puede entrar ni ser invitada, y el propio jugador sí se reconecta. Tests `everyLobbyCommandIsRejectedInDailyRoom` y `othersCannotJoinOrInviteIntoDailyRoom` en la Task 4.
2. **Recarga del catálogo y reinicio.**
   - Con una recarga entre dos partidas del mismo día, el contenido es el mismo.
   - Con un servicio nuevo, que simula el reinicio, se reutiliza la lista guardada.
   - Tests `catalogReloadBetweenRunsKeepsContent` y `restartReusesPinnedIds` en la Task 5.
3. **Juego del día y determinismo con acciones distintas.** El juego es el mismo para una fecha y una clave, se reparte de forma casi uniforme (cada juego entre el 20 % y el 30 % de 4000 fechas seguidas, con clave fija) y el de `DailyChallenge` gana al sorteo. Tests `gameOfTheDayIsDeterministicPerDate` y `gameOfTheDayIsRoughlyUniform` en la Task 3 y `pinnedGameWinsOverDraw` en la Task 5. Además, en los cuatro juegos, la misma semilla con el mismo catálogo y tres secuencias de acciones (acertar rápido, fallar y dejar vencer el tiempo) da la misma secuencia de contenido por ronda. Test `DailyDeterminismTest` en la Task 3.
4. **Un intento de verdad:**
   - dos `daily:start` simultáneos dan una fila y un error;
   - con un solo reto al día, no hay forma de empezar un segundo reto ese día;
   - abandonar deja la fila en `ABANDONED` y no permite reintentar;
   - un fallo al arrancar borra la fila y sí permite reintentar.
   - Tests `concurrentStartsLeaveOneRow`, `onlyOneAttemptPerDay`, `leavingMidRunIsAbandonedAndFinal` y `failedLaunchCompensates` en la Task 5.
5. **Sin estadísticas ni XP, y `FINISHED` es definitivo.** Terminar no llama a `GameResultsPersister` ni sube la XP del miembro. Un `abandoned` tardío no toca una fila `FINISHED`. Tests `dailyFinishSkipsPersisterAuditAndXp` en la Task 4 y `finishedNeverBecomesAbandoned` en la Task 5.

---

### Task 1: Motores en solitario en el modo del reto

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokedexdistance/PokedexDistanceEngine.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/learnsetguess/LearnsetGuessEngine.java`
- Create: `backend/src/test/resources/golden/pokedex-distance/solo-points.json`
- Create: `backend/src/test/resources/golden/learnset-guess/solo-manual-reveal.json`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/pokedexdistance/PokedexDistanceEngineTest.java`, `backend/src/test/java/es/pokemonuniverse/domain/game/engines/learnsetguess/LearnsetGuessEngineTest.java`

**Interfaces:**
- Produces:
  - `PokedexDistanceEngine.minPlayers(PokedexDistanceConfig config): int`, con visibilidad de paquete: `1` en `POINTS` y `manifest.minPlayers()` en los demás modos;
  - `LearnsetGuessEngine.minPlayers(LearnsetGuessConfig config): int`: `1` en `MANUAL_REVEAL` y `manifest.minPlayers()` en los demás modos;
  - `createInitialState` usa ese valor en lugar de `manifest.minPlayers()`, con el mismo mensaje de error;
  - `registry.json` no cambia.

- [ ] **Step 1: Tests que fallan:**
  - `pointsModeStartsWithOnePlayer` y `classicStillNeedsTwoPlayers` en Distance;
  - `manualRevealStartsWithOnePlayer` y `classicStillNeedsTwoPlayers` en Learnset.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*PokedexDistanceEngineTest*' --tests '*LearnsetGuessEngineTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** `minPlayers(config)` en los dos motores, con un comentario en español: el reto diario juega estos modos en solitario, y la sala normal sigue exigiendo el `minPlayers` del manifiesto.
- [ ] **Step 4: Escribir las dos fixtures nuevas**, copiando `points-mode.json` y `manual-reveal-mode.json` con un solo jugador:
  - `solo-points.json`: semilla 2026, catálogo `gen1-2`, `pointsRounds` 3, una elección por ronda y un tiempo vencido en la última;
  - `solo-manual-reveal.json`: semilla 2026, `rounds` 2, un fallo y un acierto en la primera, y la segunda sin acertar.
- [ ] **Step 5: Regrabar** con `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'`. Revisar con `git diff --stat backend/src/test/resources/golden` que solo cambian las dos fixtures nuevas.
- [ ] **Step 6: Ejecutar** los tests del Step 2 y `--tests '*GoldenReplayTest*'`. Esperado: PASS.
- [ ] **Step 7: Commit** con el mensaje `Pokédex Distance Por puntos y Learnset Revelación manual admiten un jugador`.

### Task 2: Tablas y repositorios del reto

**Files:**
- Create: `backend/src/main/resources/db/migration/V13__reto_diario.sql` (`DailyChallenge` con `gameId`; `DailyResult` con `gameId` y el índice único `("userId","date")`)
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/DailyChallengeEntity.java`, `DailyChallengeRepository.java`, `DailyResultEntity.java`, `DailyResultRepository.java`
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/out/persistence/DailyRepositoriesTest.java`

**Interfaces:**
- Produces:
  - `DailyChallengeRepository`:
    - `void insertIfAbsent(LocalDate date, String gameId, String pokemonIdsJson, String fingerprint)`, que hace un `INSERT … ON CONFLICT DO NOTHING` nativo;
    - `Optional<DailyChallengeEntity> findById(LocalDate date)`.
  - `DailyChallengeEntity`: `getDate()`, `getGameId()`, `getPokemonIds()` (el JSON en texto), `getCatalogFingerprint()`.
  - `DailyResultEntity.started(String id, String userId, LocalDate date, String gameId, Instant now)`, con los getters de cada columna. `rounds` se guarda como texto JSON.
  - `DailyResultRepository extends CrudRepository<DailyResultEntity, String>`:
    - `int finish(String id, int score, int correct, String roundsJson, Instant now)`, que hace un `UPDATE … WHERE "status" = 'STARTED'` y devuelve las filas tocadas;
    - `int abandon(String id, Instant now)`, igual, solo desde `STARTED`;
    - `void deleteStarted(String id)`;
    - `Optional<DailyResultEntity> findByUserIdAndDate(String userId, LocalDate date)` (como mucho una fila por el índice único);
    - `List<DailyResultEntity> topFinished(LocalDate date, int limit)`, ordenadas por `score DESC, finishedAt ASC`;
    - `long countFinished(LocalDate date)`;
    - `long countFinishedAbove(LocalDate date, int score)`, para el puesto `1 + n`;
    - `List<DailyResultEntity> findFinishedByUser(String userId, int limit)`, ordenadas por `date DESC`.

- [ ] **Step 1: Escribir la migración** con las dos tablas, columnas, `CHECK`, FK e índices de la spec («Datos»). Añadir un comentario arriba sobre el renombrado a `V8` si llega antes que los logros.
- [ ] **Step 2: Tests que fallan:**
  - `insertIfAbsentKeepsTheFirstList`: también conserva el primer `gameId`;
  - `uniqueAttemptPerUserAndDate`: la segunda inserción de la misma cuenta y fecha lanza `DataAccessException`, aunque lleve otro `gameId`;
  - `finishAndAbandonOnlyFromStarted`: `abandon` después de `finish` devuelve 0 y la fila sigue `FINISHED`;
  - `scoreOnlyWhenFinishedCheck`;
  - `leaderboardOrderAndRank`, con empates en `score` y distinto `finishedAt`;
  - `deletingUserCascades`;
  - `unknownGameIdViolatesCheck`, en las dos tablas.
- [ ] **Step 3: Ejecutar** `cd backend && ./gradlew test --tests '*DailyRepositoriesTest*'`. Esperado: FAIL.
- [ ] **Step 4: Implementar** las entidades y repositorios, siguiendo `FriendshipEntity` y `FriendshipRepository`. Las consultas con `ON CONFLICT` o `jsonb` son `@Query(nativeQuery = true)`.
- [ ] **Step 5: Ejecutar** el test del Step 3 y `--tests '*FlywayMigrationsTest*' --tests '*SchemaBaselineTest*'`. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Tablas del reto diario`.

### Task 3: Calendario, semilla, catálogo fijado y juegos del reto

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/daily/DailyCalendar.java`, `DailySeed.java`, `CatalogFingerprint.java` y `DailyOutcome.java`
- Create: `backend/src/main/java/es/pokemonuniverse/domain/pokemon/PinnedPokemonCatalog.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/daily/DailyGame.java` y `DailyGames.java`. Las cuatro implementaciones van anidadas y privadas en `DailyGames`.
- Test: `backend/src/test/java/es/pokemonuniverse/domain/daily/DailyCalendarTest.java`, `DailySeedTest.java`, `backend/src/test/java/es/pokemonuniverse/domain/pokemon/PinnedPokemonCatalogTest.java`, `backend/src/test/java/es/pokemonuniverse/application/daily/DailyGamesTest.java` y `DailyDeterminismTest.java`

**Interfaces:**
- Produces:
  - `DailyCalendar`:
    - `public static final ZoneId ZONE = ZoneId.of("Europe/Madrid")`;
    - `static LocalDate dateAt(long epochMs)`;
    - `static long nextResetAt(long epochMs)`.
  - `DailySeed.seed(byte[] key, LocalDate date): long`, en `[0, 2^32)`.
  - `CatalogFingerprint.of(List<String> orderedIds): String`.
  - `record DailyOutcome(int score, int correct, List<Integer> rounds)`.
  - `PinnedPokemonCatalog implements PokemonCatalog`:
    - `static PinnedPokemonCatalog of(PokemonCatalog current, List<String> pinnedIds)`;
    - `List<String> missingIds()`;
    - los cuatro métodos de `PokemonCatalog` según la spec.
  - `interface DailyGame`:
    - `String gameId()`;
    - `int roundCount()`;
    - `JsonNode config(JsonNode defaultConfig)`, que devuelve la configuración por defecto con las claves de las Global Constraints sustituidas;
    - `void observe(Object publicState, String playerId, SortedMap<Integer, Integer> outcomes)`;
    - `int missingValue()`;
    - `int correct(List<Integer> rounds)`.
  - `DailyGames`:
    - `static List<DailyGame> all()`, en el orden `pokedex-distance`, `shiny-vote`, `higher-lower`, `learnset-guess`;
    - `static Optional<DailyGame> byId(@Nullable String gameId)`;
    - `static DailyGame ofTheDay(long seed)`: `all().get((int) (seed % 4))`;
    - `static DailyOutcome outcome(DailyGame game, SortedMap<Integer, Integer> outcomes, GameResults results, String playerId)`, que rellena las rondas que faltan y toma `points` de la clasificación.

- [ ] **Step 1: Tests que fallan:**
  - `DailyCalendarTest`:
    - 23:59:59 y 00:00:00 de Madrid, en invierno y en verano;
    - `nextResetAt` el día del cambio de hora (2026-03-29 y 2026-10-25).
  - `DailySeedTest`:
    - un vector fijo (clave `"k".repeat(32)`, fecha 2026-11-07), con el valor calculado una vez y anotado en el test;
    - cambia con la fecha y con la clave.
  - `PinnedPokemonCatalogTest`:
    - el orden se conserva;
    - un Pokémon nuevo del catálogo vigente queda fuera;
    - un id que falta va a `missingIds` y no rompe;
    - `byId` de un id ajeno devuelve vacío.
  - `DailyGamesTest`:
    - `allKeepsTheContractOrder`: `pokedex-distance`, `shiny-vote`, `higher-lower`, `learnset-guess`;
    - `gameOfTheDayIsDeterministicPerDate` (Review Focus 3): la misma clave y fecha dan siempre el mismo juego, y el juego del vector fijo de `DailySeedTest` queda anotado;
    - `gameOfTheDayIsRoughlyUniform` (Review Focus 3): con la clave fija, sobre 4000 fechas seguidas desde 2026-01-01, cada juego sale entre el 20 % y el 30 % de los días. Es determinista (sin azar en el test) y no comprueba que no se repita, porque puede repetirse;
    - cada `config(...)` pasa el `parseConfig` de su motor y tiene el `mode` y las rondas de las Global Constraints;
    - un extractor por juego, con estados públicos construidos a mano: acierto, fallo, sin respuesta y la última ronda en `GAME_RESULTS`;
    - el relleno de las rondas que faltan;
    - `correct` en cada juego.
  - `DailyDeterminismTest` (Review Focus 3), por juego:
    - motor real, catálogo de `GoldenCatalogs` (`gen1-2`) envuelto en `PinnedPokemonCatalog`, un jugador y `new Mulberry32(seed)`. Para cubrir los cuatro juegos, el test no depende del sorteo: usa una semilla fija por juego;
    - se juegan las rondas con tres estrategias: acertar al momento, responder mal y dejar vencer el tiempo;
    - cada estrategia anota el contenido de cada ronda: el objetivo en Distance, la categoría y el par de Pokémon en Higher or Lower, el `pokemonId` y el orden de las opciones en Shiny Quiz, y el `correctPokemonId` en Learnset;
    - las tres listas son iguales.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*DailyCalendarTest*' --tests '*DailySeedTest*' --tests '*PinnedPokemonCatalogTest*' --tests '*DailyGamesTest*' --tests '*DailyDeterminismTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - HMAC con `javax.crypto.Mac`.
  - Los extractores leen los records públicos tipados de cada motor (`PokedexDistancePublicState`, `HigherLowerPublicState`, `ShinyVotePublicState` y `LearnsetGuessPublicState`) según la tabla «Resultado de cada ronda» de la spec.
  - Si `DailyDeterminismTest` falla porque un motor consume `random` en un camino que depende de la acción, **no se cambia el test**: se para y se documenta el camino. La corrección del motor (con su fixture regrabada) va en este mismo task.
- [ ] **Step 4: Ejecutar** los tests del Step 2. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Reto diario: calendario de Madrid, semilla, sorteo del juego, catálogo fijado y juegos`.

### Task 4: Salas del reto en `RoomCoordinator`

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/room/DailyRoom.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/rooms/DailyRunListener.java`, `DailyLaunch.java` y `DailyRunRef.java`
- Modify:
  - `backend/src/main/java/es/pokemonuniverse/domain/room/LiveRoom.java`: `public @Nullable DailyRoom daily;`
  - `backend/src/main/java/es/pokemonuniverse/domain/room/GameRuntime.java`: `public final @Nullable DoubleSupplier random`, más un constructor que lo recibe; el actual pasa `null`.
  - `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java`
  - `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomView.java` y `RoomViews.java`: el campo `daily` y `gameSkipState` a `null` en las salas del reto.
- Test: `backend/src/test/java/es/pokemonuniverse/application/rooms/RoomCoordinatorDailyTest.java`

**Interfaces:**
- Consumes: la Task 3 (`DailyOutcome`).
- Produces:
  - `DailyRoom` (clase final, mutable solo con el lock de la sala):
    - `DailyRoom(String resultRowId, String userId, LocalDate date, String gameId, int roundCount)`;
    - `public final SortedMap<Integer, Integer> outcomes = new TreeMap<>()`;
    - `public @Nullable DailyOutcome outcome`.
  - `record DailyLaunch(DailyRoom daily, JsonNode config, PokemonCatalog pokemon, DoubleSupplier random)`.
  - `record DailyRunRef(LocalDate date, String gameId, boolean finished)`.
  - `interface DailyRunListener`, con `NONE` sin efecto:
    - `void observe(DailyRoom daily, Object publicState)`;
    - `CompletableFuture<Void> finished(DailyRoom daily, GameResults results)`, que fija `daily.outcome` antes de volver;
    - `CompletableFuture<Void> abandoned(DailyRoom daily)`.
  - En `RoomCoordinator`:
    - `RoomView startDaily(AuthUser identity, String connectionId, DailyLaunch launch)`. Crea la sala como `create`, con `maxPlayers` 1, `GameCount(1)`, el juego elegido y la configuración de `launch`, y arranca sin la comprobación de `minPlayers` del manifiesto (sí la de `maxPlayers`). Lanza `RoomException("Leave your current room first")` si la cuenta ya está en una sala.
    - `Optional<DailyRunRef> dailyRunOf(String userId)`.
    - `@Inject void useDailyRuns(DailyRunListener listener)`, inyección por método como `useActivity`;
    - `PokemonCatalog currentPokemonCatalog()`, que devuelve el catálogo vigente (`currentCatalog.pokemon()`), de solo lectura.
  - `RoomView.daily`: `record DailyView(String gameId, String date, int roundCount, @Nullable DailyOutcomeView result)` y `record DailyOutcomeView(int score, int correct, List<Integer> rounds)`, anidados en `RoomView` (otro nombre que `application/daily/DailyResultView`).

- [ ] **Step 1: Tests que fallan** en `RoomCoordinatorDailyTest`, con el montaje de `RoomCoordinatorTest`, un `DailyRunListener` falso que registra las llamadas, un `GameResultsPersister` y un `RoomAuditSink` espía, y el reloj y los planificadores manuales:
  - `startsSoloGameWithoutLobby`: Distance `POINTS` con un jugador; la fase sale del motor y `view.daily` va relleno;
  - `contextUsesTheRunRandom`: un `DoubleSupplier` contador del `DailyLaunch` es el que consume el motor, y el `RandomSource` global no se usa para el contenido;
  - `everyLobbyCommandIsRejectedInDailyRoom` (Review Focus 1): cada comando de las Global Constraints lanza `RoomException("Not available in the daily challenge")`;
  - `othersCannotJoinOrInviteIntoDailyRoom` (Review Focus 1): `join` de otra cuenta lanza `"Room not found"`, `roomOf` del jugador está vacío y el propio jugador reconecta con `join` y con `attach`;
  - `observeIsCalledOnEveryBroadcast`;
  - `dailyFinishSkipsPersisterAuditAndXp` (Review Focus 5): al terminar se llama a `finished`, el persistidor y la auditoría no reciben nada, `member.xp` no cambia y `view.daily.result` va relleno;
  - `leavingMidRunCallsAbandoned`, y `leavingAfterResultsDoesNot`;
  - `reconnectGraceExpiryMidRunCallsAbandoned`;
  - `startDailyWhileInRoomIsRejected`;
  - `dailyRunOfReportsLiveRun`;
  - `outcomeIncludesLastRoundAndDistanceHistory`: con motores reales, en Distance `daily.outcome.rounds` lleva las distancias reales (no `-1`), y en Higher or Lower cuenta la respuesta de la última ronda;
  - `staysInGameResultsUntilLeave`: tras terminar, avanzar el reloj 10 min no cambia la fase.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*RoomCoordinatorDailyTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - `launchGame(room)` pasa a `launchGame(room, @Nullable DailyLaunch launch)`. Con `launch`, usa su catálogo envuelto en un `GameCatalogSnapshot` con `random.uuid()` como versión, más los `visuals` y `audio` vigentes, y su `random`.
  - `contextBuilder(catalog, @Nullable DoubleSupplier random)` usa el `random` de la partida si existe.
  - La guarda de comandos es una sola función, `assertNotDaily(room)`, llamada al principio de cada comando de la lista.
  - `finishGame`, `finalDisconnect` y `syncAndBroadcast` ramifican con `room.daily != null`. El futuro de `finished`/`abandoned` se registra en `pending.track`.
  - En una sala del reto, `finishGame` llama primero a `listener.observe(daily, game.engine.getPublicState(game.state, context(room)))` y después a `listener.finished(...)`. `finishGame` corre dentro de `syncAndBroadcast` antes de la última difusión: sin esa llamada, la última ronda y el `roundHistory` de Distance no llegarían a observarse.
  - `roomOf` devuelve vacío para las salas del reto.
- [ ] **Step 4: Ejecutar** el test del Step 2 y `--tests '*RoomCoordinatorTest*' --tests '*RoomInvitationsTest*'`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Salas privadas de un jugador para el reto diario`.

### Task 5: `DailyChallengeService`

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/daily/DailyChallengeService.java`, `DailyRunRecorder.java`, `DailyOverview.java`, `DailyLeaderboard.java`, `DailyResultView.java`, `DailyResultsReader.java`, `DailyResultEvents.java`, `DailyException.java` (400) y `DailyForbiddenException.java` (403). Las dos excepciones se registran en el manejador de errores de aplicación, como `FriendRequestException`.
- Create: `backend/src/main/java/es/pokemonuniverse/config/DailyBeans.java`: el `@Secondary` vacío de `DailyResultEvents` y la clave HMAC desde `PuConfig.Auth.secret()`.
- Test: `backend/src/test/java/es/pokemonuniverse/application/daily/DailyChallengeServiceTest.java`

**Interfaces:**
- Consumes:
  - la Task 2 (repositorios) y la Task 3;
  - la Task 4 (`startDaily`, `dailyRunOf`, `DailyRunListener`);
  - `RoomCoordinator.occupancyOf`, `UserConnections` de amigos y `UserRepository` para el nombre y el avatar;
  - `RoomCoordinator.currentPokemonCatalog()` (Task 4).
- Produces:
  - `DailyRunRecorder implements DailyRunListener, DailyResultsReader` (`@Singleton`). Depende de los repositorios, `UserConnections`, `DailyResultEvents` y `Clock`, **no** de `RoomCoordinator`: así `RoomCoordinator.useDailyRuns` lo recibe sin ciclo.
  - `DailyChallengeService` (`@Singleton`) depende de `RoomCoordinator`, los repositorios, `UserRepository`, `Clock` y la clave HMAC:
    - `RoomView start(AuthUser identity, String connectionId)`, sin juego;
    - `DailyOverview overview(AuthUser user)`;
    - `DailyLeaderboard leaderboard(AuthUser user)`.
  - `record DailyOverview(String date, String resetsAt, String gameId, String name, String icon, int roundCount, long players, String status, @Nullable MyResult result)`, con `gameId` el de la fila de hoy de `DailyChallenge` o, sin fila, el del sorteo (sin escribir), y `name` e `icon` del manifiesto del registro.
  - `record MyResult(int score, int correct, int roundCount, List<Integer> rounds, int position, long total)`.
  - `record DailyLeaderboard(String date, String gameId, long total, List<Entry> entries, @Nullable Me me)`, con:
    - `Entry(int position, String userId, String username, AvatarRef avatar, int score, int correct, String finishedAt)`;
    - `Me(String status, @Nullable Integer position, @Nullable Integer score, @Nullable Integer correct, @Nullable List<Integer> rounds)`.
  - `record DailyResultView(String date, String gameId, int score, int correct, List<Integer> rounds, String finishedAt)`.
  - `interface DailyResultsReader { List<DailyResultView> finishedBy(String userId, int limit); }`.
  - `interface DailyResultEvents { void finished(String userId, DailyResultView result); DailyResultEvents NONE = …; }`.

- [ ] **Step 1: Tests que fallan** (Testcontainers, `RoomCoordinator` real con el montaje de prueba, `UserConnections` falso y reloj manual):
  - `guestIsRejected` e `inRoomIsRejected`;
  - `startPinsCatalogAndInsertsStarted`: la fila de `DailyChallenge` lleva el juego del sorteo, y la sala juega ese juego con su configuración fija;
  - `pinnedGameWinsOverDraw` (Review Focus 3): con una fila de hoy cuyo `gameId` no es el del sorteo, `overview` y `start` usan el de la fila;
  - `onlyOneAttemptPerDay`: tras terminar, un segundo `start` del mismo día da `"Daily challenge already played"`; al día siguiente (reloj manual) vuelve a dejar;
  - `concurrentStartsLeaveOneRow` (Review Focus 4): dos hilos con un `CyclicBarrier`; uno recibe la sala y el otro `"Daily challenge already played"`, y queda una fila;
  - `failedLaunchCompensates` (Review Focus 4): con un `RoomCoordinator` de prueba cuyo `startDaily` lanza `RoomException` la primera vez, el arranque falla, no queda fila y el segundo intento sí arranca;
  - `leavingMidRunIsAbandonedAndFinal` (Review Focus 4);
  - `finishWritesResultAndNotifies`: la fila queda `FINISHED` con `score`, `correct` y `rounds`; se envía `daily:recorded` y `DailyResultEvents` recibe el resultado;
  - `finishedNeverBecomesAbandoned` (Review Focus 5);
  - `catalogReloadBetweenRunsKeepsContent` (Review Focus 2): con la fila de hoy fijada a Distance, dos cuentas juegan el reto el mismo día con un `replaceCatalog` entre las dos (catálogo con un Pokémon más al principio) y ven los mismos objetivos;
  - `restartReusesPinnedIds` (Review Focus 2): un `DailyChallengeService` nuevo sobre la misma BD y con el catálogo cambiado da los mismos objetivos;
  - `missingPinnedIdLogsWarningAndStillStarts`;
  - `overviewStatuses`: `AVAILABLE`, `IN_PROGRESS`, `FINISHED`, `ABANDONED`, y `STARTED` sin partida viva leído como `ABANDONED`;
  - `leaderboardTiesAndMe`: empates (1, 1, 3), `me` fuera de las 50 y `403` sin fila propia;
  - `runBelongsToStartDate`: empieza a las 23:59 de Madrid, termina a las 00:01 y cuenta para el día anterior;
  - `finishedByForAchievements`.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*DailyChallengeServiceTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - **`start`:**
    1. Comprueba la cuenta, el juego y la sala, en ese orden.
    2. Calcula `date = DailyCalendar.dateAt(clock.now())`, la semilla y `DailyGames.ofTheDay(seed)`.
    3. Fija el día con `insertIfAbsent(date, gameId, ids, huella)` y lo lee; el juego de la fila manda.
    4. Construye el `PinnedPokemonCatalog`.
    5. Inserta `STARTED`; si salta el `23505`, lanza `"Daily challenge already played"`.
    6. Llama a `startDaily`. Si falla, borra la fila y relanza.
    - Todo fuera de cualquier lock de sala.
  - **`finished` y `abandoned`** (en `DailyRunRecorder`): calculan en memoria y escriben en el ejecutor `BLOCKING`. `daily:recorded` y `DailyResultEvents` se envían después del commit.
  - **Puesto:** `1 + countFinishedAbove(date, score)`.
  - **`overview`:** lee la fila de `DailyChallenge` si existe; si no, calcula el juego con el sorteo y no escribe nada.
- [ ] **Step 4: Ejecutar** el test del Step 2. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Servicio del reto diario: un reto e intento al día, catálogo fijado y clasificación`.

### Task 6: Contrato compartido y texto para compartir

**Files:**
- Create: `packages/shared/src/daily.ts` y `packages/shared/src/daily.test.ts`
- Modify: `packages/shared/src/public.ts` (exporta `daily`)

**Interfaces:**
- Produces:
  - `DAILY_GAME_IDS = ['pokedex-distance', 'shiny-vote', 'higher-lower', 'learnset-guess'] as const` (mismo orden que `DailyGames.all()`) y `type DailyGameId`;
  - `type DailyStatus = 'AVAILABLE' | 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED'`;
  - `interface DailyRoomInfo { gameId: DailyGameId; date: string; roundCount: number; result: { score: number; correct: number; rounds: number[] } | null }`;
  - `DAILY_RULE_TEXT: Record<DailyGameId, string>`, con los cuatro textos de la spec;
  - `formatDailyDate(date: string): string`, que convierte `AAAA-MM-DD` en `dd/mm/aaaa`;
  - `dailyShareText(input: { gameId: DailyGameId; date: string; score: number; correct: number; roundCount: number; rounds: readonly number[]; origin: string }): string`;
  - `isDailyGameId(value: unknown): value is DailyGameId`.

- [ ] **Step 1: Tests que fallan:**
  - un texto completo por juego, igual al ejemplo y a la tabla de la spec (puntos en `es-ES`: `1.240`);
  - Distance con `-1` muestra `✖`;
  - Learnset `[3, 1, 0]` da `⬛⬛🟩 🟩 🟥`;
  - `formatDailyDate`.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/src/daily.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** sin dependencias nuevas (solo TypeScript; `npm run check:boundaries` sigue en verde).
- [ ] **Step 4: Ejecutar** el test del Step 2, `npm run check:boundaries` y `npm run typecheck -w @pokemon-universe/shared`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Reto diario: textos y resultado para compartir`.

### Task 7: Transporte: `daily:start`, rutas REST y contrato

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/daily/DailyController.java`, `DailyOverviewResponse.java` y `DailyLeaderboardResponse.java`
- Modify:
  - `backend/src/main/java/es/pokemonuniverse/adapters/in/ws/RoomWebSocket.java`: `case "daily:start" -> roomData(daily.start(identity, connectionId))`;
  - `packages/shared/src/room.ts`: `RoomView.daily`, `'daily:start'` en `ClientToServerEvents` y `'daily:recorded'` en `ServerToClientEvents`;
  - `frontend/src/room/roomCode.ts`: las tres traducciones de la spec («Errores»);
  - `backend/src/test/java/es/pokemonuniverse/OpenApiSpecTest.java`, `backend/openapi/pokemon-universe.yml`, `frontend/src/lib/api-types.ts`, `frontend/src/lib/api-types.test.ts` y `frontend/src/lib/api-contract.ts`
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/in/rest/daily/DailyControllerTest.java`, `RoomWebSocketTest` ampliado y `frontend/src/room/roomCode.test.ts`

**Interfaces:**
- Consumes: las Tasks 5 y 6.
- Produces:
  - el contrato HTTP de la spec («Rutas REST»), con exactamente esos códigos;
  - los tipos `DailyOverviewResponse` y `DailyLeaderboardResponse` en `api-contract.ts`;
  - el comando y el evento de las Global Constraints.

- [ ] **Step 1: Tests que fallan:**
  - en `DailyControllerTest`:
    - `guestGets401OnEveryRoute`;
    - `overviewBeforeAndAfterPlaying`;
    - `leaderboardIs403BeforePlaying`;
    - `overviewShowsTodaysSingleGame`: `GET /api/daily` da un objeto con `gameId`, no una lista de juegos;
    - `responsesNeverContainContent`: el JSON de las dos rutas no tiene las claves `target`, `pokemonId`, `category` ni `pokemonIds`;
  - en `RoomWebSocketTest`: `dailyStartOverWsReturnsRoomAndRecordedEventArrives`;
  - en Vitest: las tres traducciones.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*DailyControllerTest*' --tests '*RoomWebSocketTest*'` y `npx vitest run frontend/src/room/roomCode.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** el controlador (`@ExecuteOn(BLOCKING)`, con la identidad obligatoria como `FriendsController`) y el `case` del WebSocket.
- [ ] **Step 4: Regenerar el contrato:** `./gradlew syncOpenApi` y `npm run api:types -w @pokemon-universe/web`. Después, añadir las rutas a las listas de `OpenApiSpecTest` y de `api-types.test.ts`.
- [ ] **Step 5: Ejecutar** los tests del Step 2, `./gradlew test --tests '*OpenApiSpecTest*'` y `./gradlew verifyOpenApi`, `npx vitest run frontend/src/lib/api-types.test.ts` y `npm run typecheck`. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Rutas y comando del reto diario`.

### Task 8: Pantallas del reto

**Files:**
- Create: `frontend/src/daily/daily-api.ts`, `useDailyOverview.ts`, `daily-state.ts` y `daily-state.test.ts`
- Create: `frontend/src/daily/DailyPanel.tsx` y `DailyPanel.test.tsx`
- Create: `frontend/src/daily/DailyLeaderboard.tsx`, `DailyResultsScreen.tsx`, `DailyResultsScreen.test.tsx` y `DailyPage.tsx`
- Modify:
  - `frontend/src/room/RoomContext.tsx`: `startDaily()`, y `subscribe` a `daily:recorded`;
  - `frontend/src/screens/PlayPage.tsx`;
  - `frontend/src/screens/RoomPage.tsx`;
  - `frontend/src/room/RoomPlate.tsx`;
  - `frontend/src/room/RoomSessionLayout.tsx`: el texto de confirmación de «Salir» en el reto;
  - `frontend/src/main.tsx`: la ruta `/daily`, protegida como `/profile`.

**Interfaces:**
- Consumes: las Tasks 6 y 7.
- Produces:
  - `useRoom().startDaily(): Promise<RoomView>`, sin juego. Si la sala actual es del reto y está en `GAME_RESULTS`, antes hace `leaveRoom({ reportError: false })`.
  - `daily-state.ts`:
    - `dailyRowAction(overview): 'play' | 'resume' | 'result' | 'leaderboard'`;
    - `dailyChipText(overview): string | null` (por ejemplo, «612 pts · 3.º de 40» o «Abandonado»);
    - `countdownText(resetsAt: string, now: number): string` (por ejemplo, «Nuevo reto en 5 h 12 min»).
  - `roomPlateHeading(room)` devuelve el antetítulo «Reto diario» cuando hay `room.daily`. La placa oculta el código en ese caso.
  - `DailyResultsScreen({ room, onLeave })` y `DailyLeaderboard({ refreshKey })`.

- [ ] **Step 1: Tests que fallan:**
  - en `daily-state.test.ts`: los cuatro estados, el texto del chip con empates, la cuenta atrás (horas y minutos, «menos de 1 min») y la cuenta atrás el día del cambio de hora;
  - en `DailyPanel.test.tsx`: una sola fila, con el juego de hoy (`Hoy toca` y su nombre), en cada uno de los cuatro estados; la versión de invitado con «Crear cuenta», y el error de «Jugar» traducido en el panel;
  - en `DailyResultsScreen.test.tsx`: la puntuación y la línea de emojis, «Compartir» (con `navigator.clipboard` simulado, anuncia «Resultado copiado» en la región viva) y «Guardando tu resultado…» hasta que llega la fila propia.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/daily`. Esperado: FAIL.
- [ ] **Step 3: Implementar** según la spec («Interfaz»), solo con `Panel`, `Row`, `Pill`, `PillLink`, `Chip`, `StateBox` y `Dialog`.
  - `PlayPage` pasa a `Screen width="wide"`, con tres columnas en `lg` y apiladas por debajo.
  - Con una sala del reto en curso, muestra la variante «Tienes un reto diario en curso».
  - Con una sala del reto en `GAME_RESULTS`, la cierra sola.
  - `RoomPage`, en `GAME_RESULTS` con `room.daily`, muestra `DailyResultsScreen`.
- [ ] **Step 4: Ejecutar** el test del Step 2, `npx vitest run frontend/src/room frontend/src/styles/global-classes.test.ts`, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Reto diario en Jugar, resultados y clasificación`.

### Task 9: Flujo completo en Playwright, capturas y rúbrica

**Files:**
- Create: `e2e/tests/reto-diario.spec.ts`
- Modify: `e2e/src/helpers.ts`:
  - `fijarJuegoDelDia(gameId)`: por `psql`, hace un upsert de la fila de hoy (fecha de Madrid) de `DailyChallenge` con ese `gameId` y la lista de ids del catálogo en el orden del servidor (`jsonb_agg("id" ORDER BY "nationalDexNumber", "id")`) y su huella (`encode(sha256(convert_to(string_agg(…, E'\n' …), 'UTF8')), 'hex')`). Con `ON CONFLICT ("date") DO UPDATE SET "gameId"`, porque la BD de desarrollo puede tener ya la fila de hoy con otro juego. El juego guardado manda, así que el spec no depende del sorteo;
  - `jugarHigherLowerHastaElFinal(page)`, si hace falta: pulsa la primera respuesta de cada ronda hasta los resultados.

**Interfaces:**
- Consumes: todo lo anterior y, de `e2e/src/helpers.ts`: `nuevaCuenta`, `registrarPorApi`, `borrarCuentas`, `comprobarBdE2E`, `capture`, `SIZES`, `loginAsGuest`, `collectErrors` y `psql`.

- [ ] **Step 1: Escribir el spec**, con cuentas nuevas por tamaño (cada cuenta solo puede jugar una vez al día). En `beforeAll`, `fijarJuegoDelDia('higher-lower')`:
  1. A entra en `/play` y ve el panel con una sola fila, «Hoy toca» Higher or Lower, en «Jugar» (captura `reto-diario-jugar`).
  2. A juega Higher or Lower hasta el final y ve `DailyResultsScreen` con su fila en la clasificación (captura `reto-diario-resultado`). Pulsa «Compartir» y el portapapeles tiene el texto con `📈 Higher or Lower`.
  3. B, en otro contexto, juega el mismo reto. Las parejas de Pokémon de cada ronda (`alt` de los sprites) coinciden con las de A, y la clasificación tiene dos filas.
  4. C, una tercera cuenta (A ya gastó su intento del día), empieza el reto, sale con «Abandonar el reto» y confirma. En `/play`, la fila muestra «Abandonado» y no tiene «Jugar» (captura `reto-diario-jugado`).
  5. A abre «Ver resultado» y llega a `/daily` (captura `reto-diario-pagina`).
  6. Un invitado ve el panel bloqueado (captura `reto-diario-invitado`).
  7. Con `psql`, se comprueba que A tiene una sola fila en `DailyResult` (`FINISHED`, `gameId` `higher-lower`), que C tiene una (`ABANDONED`) y que ninguna de las tres cuentas tiene filas en `PlayerGameResult`.
  - En `afterAll`, `borrarCuentas`.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- reto-diario`. Esperado: PASS, con las capturas a tres tamaños y sin avisos de tamaños que falten.
- [ ] **Step 3: Revisar las capturas** y puntuar con `docs/visual-review.md` el panel de «Jugar», la pantalla de resultados del reto y `/daily`: mínimo 19/24 cada uno, sin ningún criterio a 0.
- [ ] **Step 4: Verificación final de lo tocado:**
  - `cd backend && ./gradlew test --tests '*Daily*' --tests '*RoomCoordinator*' --tests '*RoomWebSocketTest*' --tests '*GoldenReplayTest*' --tests '*OpenApiSpecTest*'`;
  - `npx vitest run packages/shared/src/daily.test.ts frontend/src/daily frontend/src/room frontend/src/lib`;
  - `npm run typecheck` y `npm run lint`.
  - Esperado: todo en verde.
- [ ] **Step 5: Commit** con el mensaje `Reto diario: flujo en Playwright y capturas (rúbrica: Jugar N/24, resultados N/24, página N/24)`.
