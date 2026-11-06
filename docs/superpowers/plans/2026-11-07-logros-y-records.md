# Logros y récords: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** las cuentas registradas desbloquean 48 logros jugando. Al acabar la partida los ven en la pantalla de resultados, y después en una pestaña «Logros» del perfil. El récord de la Racha infinita de Higher or Lower se guarda y se muestra en el perfil.

**Architecture:**
- Catálogo declarativo y condiciones puras en `domain/achievements`.
- Tabla `UserAchievement` (Flyway V8).
- La evaluación va dentro de la transacción `SERIALIZABLE` de `RoomHistoryWriter.persistResults`, con `INSERT … ON CONFLICT DO NOTHING RETURNING`.
- Tras el commit, el puerto `AchievementEvents` envía `achievements:unlocked` por `UserConnections`.
- `GET /api/achievements` sirve el catálogo con los secretos ocultos.
- Frontend:
  - `AchievementsProvider`, con una cola que solo se enseña fuera de partida;
  - un recuadro en `ResultsShell`;
  - un `ActionToast` en el lobby;
  - la pestaña «Logros» en el perfil;
  - el componente `AchievementTile`, nuevo en `ui/`.

**Tech Stack:** Java 25, Micronaut 5, Micronaut Data JPA, Flyway, WebSocket nativo, fixtures doradas; React + Vite, Zod/tipos en `packages/shared`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-logros-y-records-design.md`

## Global Constraints

- **Requisito previo:** la rama `modos` (Fase 3) está terminada y fusionada. Se empieza sobre ese `main`.
- Solo cuentas `USER`:
  - un invitado no tiene filas ni recibe eventos;
  - en `/api/achievements` recibe `401 {"error":"Registered account required"}`.
- Ids, textos y condiciones: exactamente los de la tabla del catálogo de la spec, 48 en total.
  - Generales: `general.first-game`, `general.games-10`, `general.games-50`, `general.games-100`, `general.first-win`, `general.wins-10`, `general.wins-50`, `general.level-5`, `general.level-10` y `general.level-20`.
  - Victorias: `game.<gameId>.win`, una por manifiesto, con nombre «Gana en <nombre>» y descripción «Gana una partida de <nombre>.».
  - Específicos: `game.pokedex-distance.bullseye`, `game.higher-lower.endless-10`, `game.shiny-vote.survival-10`, `game.learnset-guess.first-group`, `game.type-duel.coop-20` y `game.pokemon-impostor.disguise`.
  - Secretos: `secret.1`, `secret.2`, `secret.3` y `secret.4`.
- Umbrales de nivel en XP: nivel 5 = 700, nivel 10 = 2700 y nivel 20 = 10450. Salen de `Experience.levelFor`, nunca escritos a mano.
- Zona horaria de «Búho nocturno»: `Europe/Madrid`, con la franja [03:00, 05:00).
- Secreto bloqueado en la API: `name` = «Logro secreto» y `description` = «Sigue jugando para descubrirlo.».
- Evento: `achievements:unlocked`, con este payload:

  ```ts
  {
    achievements: { id: string; family: 'GENERAL' | 'GAME' | 'SECRET'; gameId: string | null; name: string; description: string }[];
    records: { gameId: string; key: string; label: string; value: number; previous: number }[];
  }
  ```

- Métrica nueva: `{"key": "endlessBestStreak", "label": "Récord en Racha infinita", "aggregation": "MAX"}`, al final de `profileStats.metrics` de `higher-lower`. Solo se emite en `ENDLESS`.
- Textos de la UI:
  - recuadro: «¡Logro desbloqueado!» (o «¡Logros desbloqueados!» si son varios);
  - «y N más»;
  - «Nuevo récord personal en Racha infinita: N (antes M)»;
  - «Ver mis logros» y «Cerrar»;
  - pestañas «Estadísticas» y «Logros», con la insignia «N/48»;
  - grupos «Generales», «Minijuegos» y «Secretos»;
  - fecha: «Conseguido el 7 nov 2026».
- Visibilidad de la cola en el cliente: solo con `room === null` o `room.phase ∈ {GAME_RESULTS, SESSION_RESULTS, LOBBY}`.
- La cola se vacía por una transición de estado del reductor: sale de la fase en la que se mostró, o el usuario cierra el aviso. Nunca se vacía en la limpieza de un efecto, porque `main.tsx` usa `StrictMode`, que desmonta y vuelve a montar en desarrollo.
- Reglas de `AGENTS.md`:
  - comentarios de Java en español y capa hexagonal (el dominio no conoce JPA ni REST);
  - migración nueva, sin editar las aplicadas;
  - OpenAPI y tipos regenerados;
  - el cambio de motor va con sus fixtures regrabadas y su `registry.json` en el mismo commit;
  - UI solo con `frontend/src/ui/`, y un componente nuevo va primero a la galería `/dev/ui`;
  - texto ≥ 13 px y objetivos táctiles ≥ 44 px;
  - animaciones solo con `transform` y `opacity`, respetando `prefers-reduced-motion`;
  - una sola región viva por pantalla;
  - Playwright a tres tamaños y rúbrica ≥ 19/24.
- **Regla del usuario:** nada de suites completas. Solo los tests de lo tocado:
  - las clases Java indicadas en cada task, con `--tests`;
  - los ficheros Vitest indicados, `npm run typecheck` y `npm run lint`;
  - un solo spec de Playwright (`npm run ui:check -- logros`).

## Review Focus

1. **Reproducción y reintento:** persistir dos veces el mismo `resultId`, o reintentar tras un `40001`, deja una fila por logro y envía un solo evento. Si falla el último intento, no se envía nada. Tests `replayingSameResultIdSendsNothing` y `rolledBackAttemptSendsNothing` en la Task 6.
2. **Invitados y salas mixtas:** en una partida con un invitado y dos registrados, solo los registrados tienen filas y eventos. Borrar una cuenta borra sus logros. Tests `guestGetsNothing` (Task 5) y `deletingUserDeletesAchievements` (Task 2).
3. **Secretos sin filtrar:** el JSON de `GET /api/achievements` de una cuenta sin secretos no contiene «Foto finish», «Fiel», «Búho nocturno» ni «Lo importante es participar». Test `lockedSecretsLeakNothing` en la Task 7.
4. **Nunca a mitad de partida:** un evento que llega con `room.phase` en una fase de juego queda en cola y aparece en los siguientes `GAME_RESULTS`. Test `heldDuringPlayShownAtResults` en la Task 9.
5. **El récord de Racha infinita solo sube:** una partida `ENDLESS` con una racha menor no lo baja, y una Clásica no lo toca. Test `endlessRecordOnlyRises` en la Task 5.

---

### Task 1: Catálogo y condiciones en el dominio

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/achievements/AchievementFamily.java`, `Achievement.java`, `AchievementFacts.java` y `AchievementCatalog.java`
- Create: `backend/src/main/java/es/pokemonuniverse/config/AchievementBeans.java`, una `@Factory` que crea el bean `AchievementCatalog` desde `GameRegistry`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/achievements/AchievementCatalogTest.java` y `AchievementFactsTest.java`

**Interfaces:**
- Consumes: `GameRegistry.manifests()`, `GameManifest.id()` y `.name()`, `GameStanding`, `Experience.levelFor`.
- Produces:
  - `enum AchievementFamily { GENERAL, GAME, SECRET }`.
  - `record Achievement(String id, AchievementFamily family, @Nullable String gameId, String name, String description, Predicate<AchievementFacts> condition)`.
  - `record AchievementFacts(String gameId, String mode, GameStanding standing, List<GameStanding> standings, boolean won, int gamesPlayed, int gamesWon, int level, Map<String, Integer> winsByGame, List<String> recentGameIds, ZonedDateTime endedAt)`. Tiene estos métodos derivados:
    - `int playerCount()`;
    - `boolean sharedFirst()`;
    - `boolean lastPlace()`: la mayor posición, si es mayor que 1;
    - `boolean individualRanking()`: no es `pokemon-impostor` ni `type-duel` en `COOP`;
    - `long metric(String key)`: 0 si falta.
  - `static AchievementFacts.of(String gameId, @Nullable String mode, GameStanding standing, GameResults results, boolean won, int gamesPlayed, int gamesWon, int xp, Map<String, Integer> winsByGame, List<String> recentGameIds, Instant endedAt)`. Un `mode` `null` pasa a ser `"CLASSIC"`, el nivel sale de `Experience.levelFor(xp)` y `endedAt` se convierte a `Europe/Madrid`.
  - `final class AchievementCatalog`:
    - `static AchievementCatalog of(List<GameManifest> manifests)`;
    - `List<Achievement> all()`, en el orden de la spec;
    - `Optional<Achievement> byId(String)`;
    - `List<String> met(AchievementFacts facts)`.

    Los específicos solo se evalúan si `facts.gameId()` es su juego. Las victorias se evalúan con `winsByGame`, para todos los juegos.

- [ ] **Step 1: Tests que fallan:**
  - `hasFortyEightUniqueIds`: 10 `GENERAL`, 34 `GAME` y 4 `SECRET`;
  - `oneWinPerManifest`: 28 ids `game.<id>.win`, con nombre «Gana en <nombre>»;
  - `secretIdsAreNeutral`: los secretos son `secret.1` a `secret.4`;
  - `generalThresholds`: 9 → 10 partidas, 49 → 50 victorias y 699 → 700 XP, en los bordes;
  - `winsAreRetroactiveAcrossGames`: terminar una partida de Trivia con `winsByGame={pokemon-bingo:1}` da `game.pokemon-bingo.win`;
  - `modeSpecificNeedTheirMode`: `endless-10` con `ENDLESS` y racha 10 sí; con `CLASSIC` y racha 10, no; con racha 9, no. Lo mismo con `survival-10`, `first-group` y `coop-20`;
  - `bullseyeAndDisguiseInAnyMode`;
  - `specificOnlyForItsGame`: un `exactHits` de 1 en otro juego no da `bullseye`;
  - `photoFinish`: un empate en el primer puesto en Trivia sí; en Impostor, con el bando ganador en el puesto 1, no; en Type Duel `COOP`, no; con un solo jugador, no;
  - `loyalNeedsTenSameGame`: 9 partidas no; 10 iguales sí; 10 con una distinta, no;
  - `nightOwlMadridTime`: 02:59 no, 03:00 sí y 04:59 sí, en Madrid; 05:00 no; las 01:30 UTC del 1 de julio (03:30 en Madrid) sí;
  - `takingPart`: último con 0 puntos y 4 jugadores, sí; con 3 jugadores, no; con 1 punto, no;
  - en `AchievementFactsTest`: `nullModeIsClassic`, `levelFromXp` y `missingMetricIsZero`.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*AchievementCatalogTest*' --tests '*AchievementFactsTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar** con los ids, textos y condiciones de la spec. Javadoc en español en cada clase.
- [ ] **Step 4: Ejecutar** el comando del Step 2. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Logros: catálogo y condiciones`.

### Task 2: Tabla y repositorio de logros

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__logros.sql`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/UserAchievementEntity.java` (con clave compuesta `UserAchievementId`), `UserAchievementRepository.java` (solo lecturas) y `UserAchievementInserts.java`
- Modify: `backend/src/test/java/es/pokemonuniverse/adapters/out/persistence/SchemaBaselineTest.java`, si enumera las tablas esperadas
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/out/persistence/UserAchievementRepositoryTest.java`

**Interfaces:**
- Produces:
  - el SQL de la spec, con un comentario en español en la cabecera;
  - `UserAchievementRepository extends CrudRepository<UserAchievementEntity, UserAchievementId>`, con `List<UserAchievementEntity> findByUserId(String userId)`;
  - `final class UserAchievementInserts`, con `static List<String> insertMissing(EntityManager em, String userId, Collection<String> ids, Instant at)`:
    - lanza una consulta nativa **por id**, como mucho 48: `em.createNativeQuery("INSERT INTO \"UserAchievement\" (\"userId\", \"achievementId\", \"unlockedAt\") VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING RETURNING \"achievementId\"").getResultList()`;
    - devuelve los ids insertados, en el orden recibido.

    No se usa `unnest` con una colección, porque Hibernate la expande en `?, ?, ?`. Tampoco un `@Query` de Micronaut Data con `RETURNING`. Hay que llamarlo dentro de una transacción abierta: en producción, la de `persistResults`.

- [ ] **Step 1: Tests que fallan:**
  - `insertMissingReturnsOnlyNew`, dentro de `TransactionOperations.executeWrite`: insertar `[a, b]` devuelve `[a, b]`; luego `[b, c]` devuelve `[c]`, y quedan 3 filas;
  - `emptyIdsInsertsNothing`;
  - `deletingUserDeletesAchievements` (Review Focus 2);
  - `findByUserIdOnlyOwnRows`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*UserAchievementRepositoryTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** la migración, la entidad y el repositorio, siguiendo `FriendshipEntity` y `FriendshipRepository`.
- [ ] **Step 4: Ejecutar** el test del Step 2 y `--tests '*FlywayMigrationsTest*' --tests '*SchemaBaselineTest*'`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Logros: tabla UserAchievement`.

### Task 3: Higher or Lower emite `endlessBestStreak`

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/higherlower/HigherLowerRules.java` (`buildHigherLowerResults`)
- Modify: `backend/src/main/resources/games/registry.json`: la métrica nueva al final de `profileStats.metrics` de `higher-lower`
- Modify: `backend/src/test/resources/golden/higher-lower/endless-mode.json`, regrabada
- Modify: `packages/shared/src/games/higher-lower/types.ts`, si tipa las estadísticas de resultados: `endlessBestStreak?: number`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/higherlower/HigherLowerEngineTest.java`

**Interfaces:**
- Produces: en `ENDLESS`, cada clasificación lleva `stats.endlessBestStreak = bestStreak`, después de `accuracy`. En `CLASSIC` la clave no existe.

- [ ] **Step 1: Tests que fallan:**
  - `endlessResultsCarryEndlessBestStreak`: con una racha de 3, vale 3;
  - `classicResultsHaveNoEndlessBestStreak`;
  - `profileStatsDeclareEndlessRecord`: el manifiesto lleva la métrica `MAX` con la etiqueta «Récord en Racha infinita».
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*HigherLowerEngineTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Después, regrabar: `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'`. Revisar el diff: solo puede cambiar `endless-mode.json`, con la clave nueva en los resultados.
- [ ] **Step 4: Ejecutar** `--tests '*HigherLowerEngineTest*' --tests '*GoldenReplayTest*'`, más `npx vitest run packages/shared/src/games/registry-defaults.test.ts` y `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Higher or Lower: récord de Racha infinita en las estadísticas`.

### Task 4: Tipos compartidos del evento

**Files:**
- Create: `packages/shared/src/achievements.ts`, exportado desde el índice público que usa `room.ts`
- Modify: `packages/shared/src/room.ts`: `'achievements:unlocked'` en `ServerToClientEvents`
- Modify: `frontend/src/room/RoomContext.tsx`: añadir `'achievements:unlocked'` a `FriendSocketEvent` y a `FRIEND_SOCKET_EVENTS`, y actualizar el comentario («Avisos del `/ws` de la cuenta»)
- Test: `packages/shared/src/achievements.test.ts`

**Interfaces:**
- Produces:
  - `type AchievementFamily = 'GENERAL' | 'GAME' | 'SECRET'`;
  - `interface AchievementUnlock { id: string; family: AchievementFamily; gameId: string | null; name: string; description: string }`;
  - `interface PersonalRecord { gameId: string; key: string; label: string; value: number; previous: number }`;
  - `interface AchievementsUnlocked { achievements: AchievementUnlock[]; records: PersonalRecord[] }`;
  - `const ACHIEVEMENT_TOTAL = 48`.

- [ ] **Step 1: Test que falla:** `achievementsUnlockedShape`, que comprueba con `satisfies` y un objeto de ejemplo que los tipos compilan y que `ACHIEVEMENT_TOTAL === 48`.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/src/achievements.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ejecutar** el test, `npm run check:boundaries` y `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Logros: tipos del evento achievements:unlocked`.

### Task 5: Evaluar logros en la transacción de resultados

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/achievements/AchievementsUnlocked.java`, con los records `AchievementUnlock` y `PersonalRecord`
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/RoomHistoryWriter.java` (`persistResults`)
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/UserGameStatsRepository.java`, si hace falta `findByUserId` (ya lo usa `ProfileService`)
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/out/persistence/RoomHistoryWriterAchievementsTest.java` (Testcontainers)

**Interfaces:**
- Consumes: las Tasks 1 a 3.
- Produces:
  - `@Serdeable record AchievementUnlock(String id, String family, @Nullable String gameId, String name, String description)`, construido con `AchievementUnlock.of(Achievement)`;
  - `@Serdeable record PersonalRecord(String gameId, String key, String label, long value, long previous)`;
  - `@Serdeable record AchievementsUnlocked(List<AchievementUnlock> achievements, List<PersonalRecord> records)`;
  - `RoomHistoryWriter.persistResults(...)` mantiene sus parámetros y devuelve `Map<String, AchievementsUnlocked>` (por `userId`, solo con algo nuevo). Devuelve `Map.of()` si la partida ya estaba `COMPLETED`.
  - El constructor pasa a ser `RoomHistoryWriter(EntityManager, AchievementCatalog, Clock)`, con el `Clock` de `config/ClockBeans`. El `now` de `persistResults` pasa a ser `Instant.now(clock)`, y es también el `endedAt` de «Búho nocturno».
  - Los tests no construyen `RoomHistoryWriter` ni `JpaGameResultsPersister` con `new`: son beans inyectados en `JpaGameResultsPersisterTest`, `JpaRoomAuditSinkTest`, `StaleRoomActivityCleanupTest` y `RoomCoordinatorWiringTest`. Estos tests siguen compilando sin cambios.

  Por cada jugador `USER`, después de actualizar sus estadísticas:
  1. `entityManager.flush()`;
  2. lee `winsByGame` de todas sus `UserGameStats`;
  3. lee `recentGameIds` con la consulta de «Fiel» de la spec;
  4. construye `AchievementFacts.of(...)` con `mode` = `config.get("mode")` y `endedAt` = `now`;
  5. `UserAchievementInserts.insertMissing(entityManager, userId, ids, now)`.

  El récord se calcula comparando `endlessBestStreak` de las métricas previas y las fusionadas, solo en `higher-lower` con `ENDLESS`.

- [ ] **Step 1: Tests que fallan.** El test reemplaza el `Clock` (`@Replaces(Clock.class)`) por `Clock.fixed(2026-11-07T12:00:00Z)`, para que «Búho nocturno» no dependa de la hora a la que se ejecute:
  - `firstGameUnlocksFirstGameAndGameWin`: una partida de Trivia ganada con 2 registrados da `general.first-game`, `general.first-win` y `game.pokemon-trivia.win` al ganador, y `general.first-game` al otro;
  - `guestGetsNothing` (Review Focus 2): sala con un invitado y dos registrados; el mapa solo tiene los dos `userId` y la tabla no tiene filas del invitado;
  - `secondGameReturnsOnlyNew`;
  - `completedResultIdReturnsEmpty`;
  - `retroactiveMilestones`: una cuenta con 50 partidas previas en `UserStats` recibe `general.games-10` y `general.games-50` en su siguiente partida;
  - `endlessRecordOnlyRises` (Review Focus 5): `ENDLESS` con 5 da un récord `5 (antes 0)`; luego `ENDLESS` con 3 no da récord y el valor guardado sigue en 5; luego `CLASSIC` lo deja en 5;
  - `loyalAfterTenSameGame`: 9 partidas de Higher or Lower no lo dan y la décima da `secret.2`;
  - `nightOwlUsesInjectedClock`: con `Clock.fixed(2026-11-07T02:30:00Z)` (03:30 en Madrid) sale `secret.3`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*RoomHistoryWriterAchievementsTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** La evaluación va dentro de la misma transacción `SERIALIZABLE`: nada se confirma si falla. Para el `insertMissing` se usa SQL nativo, y nunca `persist`, para no provocar `23505`.
- [ ] **Step 4: Ejecutar** el test del Step 2 y `--tests '*JpaGameResultsPersisterTest*'`, que tiene que seguir pasando. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Logros: se evalúan al guardar los resultados`.

### Task 6: Avisar tras el commit

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/achievements/AchievementEvents.java` (puerto) y `UserConnectionsAchievementEvents.java` (`@Singleton`)
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/JpaGameResultsPersister.java`
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/out/persistence/JpaGameResultsPersisterTest.java` (ampliado) y `backend/src/test/java/es/pokemonuniverse/application/achievements/UserConnectionsAchievementEventsTest.java`

**Interfaces:**
- Consumes: la Task 5 y `UserConnections`.
- Produces:
  - `interface AchievementEvents { void unlocked(String userId, AchievementsUnlocked payload); AchievementEvents NONE = (userId, payload) -> {}; }`;
  - `UserConnectionsAchievementEvents.unlocked`, que llama a `connections.send(userId, "achievements:unlocked", payload)`. Captura y registra cualquier excepción;
  - `JpaGameResultsPersister(RoomHistoryWriter, GameRegistry, JsonMapper, AchievementEvents)`. `persistNow` guarda el mapa del intento que sale bien y, al salir del bucle, llama a `unlocked` por cada entrada. Si se agotan los intentos, no llama a nada.

- [ ] **Step 1: Tests que fallan:**
  - `sendsOnePushPerUserAfterCommit`, con un `AchievementEvents` falso que registra las llamadas;
  - `replayingSameResultIdSendsNothing` (Review Focus 1): la segunda `persistNow` con el mismo `resultId` no registra llamadas y la tabla sigue con las mismas filas;
  - `rolledBackAttemptSendsNothing` (Review Focus 1): un `RoomHistoryWriter` que lanza `40001` dos veces y acierta a la tercera da una sola llamada; uno que lanza las tres veces no da ninguna;
  - `pushFailureDoesNotFailPersistence`;
  - en `UserConnectionsAchievementEventsTest`: `sendsEventNameAndPayload`, con un `UserConnections` falso.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*JpaGameResultsPersisterTest*' --tests '*UserConnectionsAchievementEventsTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ejecutar** el comando del Step 2 y `--tests '*RoomWebSocketTest*'`, para comprobar que las salas siguen arrancando con el bean nuevo. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Logros: aviso achievements:unlocked tras guardar la partida`.

### Task 7: Ruta `GET /api/achievements`

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/achievements/AchievementService.java` y `AchievementView.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/achievements/AchievementsController.java`, `AchievementsResponse.java` y `AchievementResponse.java`
- Modify: `backend/openapi/pokemon-universe.yml` (con `./gradlew syncOpenApi`), `backend/src/test/java/es/pokemonuniverse/OpenApiSpecTest.java`, `frontend/src/lib/api-types.ts`, `frontend/src/lib/api-types.test.ts` y `frontend/src/lib/api-contract.ts`
- Test: `backend/src/test/java/es/pokemonuniverse/application/achievements/AchievementServiceTest.java` y `backend/src/test/java/es/pokemonuniverse/adapters/in/rest/achievements/AchievementsControllerTest.java`

**Interfaces:**
- Consumes: las Tasks 1 y 2.
- Produces:
  - `record AchievementView(String id, AchievementFamily family, @Nullable String gameId, String name, String description, @Nullable Instant unlockedAt)`;
  - `AchievementService.listFor(String userId): List<AchievementView>`, en el orden de `AchievementCatalog.all()`. Los secretos bloqueados llevan los textos de las Global Constraints. Un id de la tabla que ya no está en el catálogo se ignora;
  - `GET /api/achievements` → `200 AchievementsResponse { achievements: AchievementResponse[], unlocked: int, total: int }`, con `unlockedAt` en ISO (`IsoTimestamps.millis`) o `null`. La identidad es obligatoria, como en `FriendsController`;
  - `api-contract.ts` exporta `AchievementsResponse` y `AchievementResponse`.

- [ ] **Step 1: Tests que fallan:**
  - `guestGets401`;
  - `listsFortyEightInCatalogOrder`: `total` vale 48, `unlocked` 0 y el primero es `general.first-game`;
  - `unlockedCarriesDate`;
  - `lockedSecretsLeakNothing` (Review Focus 3): el cuerpo JSON en texto no contiene «Foto finish», «Fiel», «Búho nocturno» ni «Lo importante es participar»;
  - `unlockedSecretShowsRealName`;
  - `unknownStoredIdIgnored`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*AchievementServiceTest*' --tests '*AchievementsControllerTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** con `@ExecuteOn(TaskExecutors.BLOCKING)`. Después, regenerar: `./gradlew syncOpenApi` y `npm run api:types -w @pokemon-universe/web`, y añadir la ruta a `OpenApiSpecTest` y `api-types.test.ts`.
- [ ] **Step 4: Ejecutar** los tests del Step 2, `--tests '*OpenApiSpecTest*' verifyOpenApi`, `npx vitest run frontend/src/lib/api-types.test.ts` y `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Logros: ruta GET /api/achievements`.

### Task 8: Componente `AchievementTile`

**Files:**
- Create: `frontend/src/ui/AchievementTile.tsx`, `AchievementTile.module.css` y `AchievementTile.test.tsx`
- Modify: `frontend/src/ui/index.ts` y `frontend/src/ui/dev/Gallery.tsx`

**Interfaces:**
- Produces: `AchievementTile({ name, description, state, art, date, fresh }: { name: string; description: string; state: 'unlocked' | 'locked' | 'secret'; art: ReactNode; date?: string; fresh?: boolean })`.
  - Es un `<li>` con el nombre en `h3`, la descripción y la fecha.
  - En `locked` y `secret`: gris con el icono `Lock`, y `aria-label` «Bloqueado: <nombre>».
  - `fresh` anima la entrada una vez, solo con `transform` y `opacity`, y nada con `prefers-reduced-motion`.
  - Usa los tokens de `tokens.css`, sin valores arbitrarios en `className`.

- [ ] **Step 1: Tests que fallan:**
  - `rendersNameDescriptionAndDate`;
  - `lockedHasLockAndLabel`;
  - `secretShowsGivenPlaceholderText`;
  - `freshAddsAnimationClassOnlyWithoutReducedMotion`.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/ui/AchievementTile.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Después, añadir a la galería la sección `achievement-tile`, con los estados `unlocked`, `locked`, `secret` y `fresh`, cada uno en su `<figure data-gallery="achievement-tile-<estado>">`.
- [ ] **Step 4: Ejecutar** el test, `npm run typecheck`, `npm run lint` y `npm run ui:check -- galeria`. Esperado: PASS y capturas de la galería revisadas.
- [ ] **Step 5: Commit** con el mensaje `Componente AchievementTile en Arcade DS`.

### Task 9: Cola de logros, recuadro en resultados y aviso fuera de partida

**Files:**
- Create: `frontend/src/achievements/achievements-state.ts` y `achievements-state.test.ts`
- Create: `frontend/src/achievements/AchievementsContext.tsx` (`AchievementsProvider` y `useAchievements`)
- Create: `frontend/src/achievements/AchievementNotice.tsx`, `AchievementNotice.module.css` y `AchievementNotice.test.tsx`
- Create: `frontend/src/achievements/AchievementToasts.tsx`
- Create: `frontend/src/achievements/achievement-art.tsx`: `achievementArt(unlock)` devuelve `GameArt` o `Icon` (`Medal` o `Sparkles`)
- Modify: `frontend/src/room/ResultsShell.tsx`, que monta `<AchievementNotice />` y la región viva
- Modify: `frontend/src/components/SessionRoot.tsx`: `<RoomProvider …><FriendsProvider><AchievementsProvider><Layout /></AchievementsProvider></FriendsProvider></RoomProvider>`
- Modify: `frontend/src/components/Layout.tsx`, que monta `<AchievementToasts />` junto a `<InviteToasts />`
- Test: los tres ficheros de test de arriba y `frontend/src/room/ResultsShell.test.tsx`

**Interfaces:**
- Consumes: las Tasks 4 y 8, `useRoom()` (`room`, `subscribe`) y `useAuth()`.
- Produces:
  - Estado puro en `achievements-state.ts`:
    - `type AchievementsQueue = { achievements: AchievementUnlock[]; records: PersonalRecord[]; shownIn: RoomPhase | 'NO_ROOM' | null }`;
    - `enqueue(queue, payload)`, que no repite ids;
    - `phaseChanged(queue, phase: RoomPhase | 'NO_ROOM'): AchievementsQueue`:
      - si hay cola, `shownIn` es `null` y `canShow` lo permite, marca `shownIn = phase`;
      - si `shownIn` no es `null` y la fase es otra, vacía la cola, porque ya se vio.

      El provider lo llama con cada cambio de `room?.phase`.
    - `acknowledge(): AchievementsQueue`, que la vacía (el «Cerrar» del aviso);
    - `canShow(phase: RoomPhase | 'NO_ROOM'): boolean`, que es `true` con `NO_ROOM`, `GAME_RESULTS`, `SESSION_RESULTS` o `LOBBY`;
    - `noticeTitle(count)`, que da «¡Logro desbloqueado!» o «¡Logros desbloqueados!»;
    - `recordLine(record)`, que da «Nuevo récord personal en Racha infinita: N (antes M)»;
    - `announcement(queue)`, que da «Logro desbloqueado: A, B» o una cadena vacía.
  - `useAchievements()` devuelve `{ queue, visible: boolean, acknowledge(): void }`. Fuera del provider devuelve una cola vacía, para que la galería y los tests de `ResultsShell` sigan funcionando.
  - `AchievementNotice`: un `Panel` crema con `noticeTitle`, hasta 3 `AchievementTile` con `fresh`, «y N más», las `recordLine` y un `PillLink` «Ver mis logros» a `/profile?tab=logros`. No renderiza nada si `visible` es falso o la cola está vacía. No vacía la cola en ningún efecto: lo hace `phaseChanged` al salir de `GAME_RESULTS` (Global Constraints, `StrictMode`).
  - `ResultsShell` monta siempre `<p className="sr-only" role="status" aria-live="polite">{announcement}</p>`: es la única región viva de los resultados.
  - `AchievementToasts`: fuera de `GAME_RESULTS`, y con `visible`, muestra un `ActionToast` `quiet` con `noticeTitle`, los nombres, «Ver mis logros» (que navega a `/profile?tab=logros` y hace `acknowledge`) y «Cerrar» (que hace `acknowledge`). En `GAME_RESULTS` no muestra nada, porque allí manda el recuadro.

- [ ] **Step 1: Tests que fallan:**
  - en `achievements-state.test.ts`:
    - `enqueueDeduplicates`;
    - `canShowOnlyOutsidePlay`: falso en `GAME_STARTING`, `ROUND_ACTIVE`, `ROUND_RESULTS`, `CLUE_PHASE`, `NEXT_GAME_VOTE` y `NEXT_GAME_VOTE_RESULTS`; verdadero en `NO_ROOM`, `LOBBY`, `GAME_RESULTS` y `SESSION_RESULTS`;
    - `heldDuringPlayShownAtResults` (Review Focus 4), en cuatro pasos:
      1. se encola en `ROUND_ACTIVE` y no es visible;
      2. `phaseChanged(GAME_RESULTS)` la hace visible y fija `shownIn`;
      3. otro `phaseChanged(GAME_RESULTS)`, como el doble montaje de `StrictMode`, no la vacía;
      4. `phaseChanged(GAME_STARTING)` la vacía.
    - `recordLineText`;
    - `announcementJoinsNames`;
  - en `AchievementNotice.test.tsx`:
    - `showsUpToThreeAndMore`: con 5, se ven 3 y «y 2 más»;
    - `showsRecordLine`;
    - `rendersNothingWhenEmpty`;
    - `remountKeepsQueue`: desmontar y volver a montar el recuadro con la misma fase sigue mostrando los logros;
  - en `ResultsShell.test.tsx`: `hasExactlyOneLiveRegion`.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/achievements frontend/src/room/ResultsShell.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** El provider solo escucha con una cuenta `USER` y reinicia la cola al cambiar de cuenta, como `FriendsProvider`.
- [ ] **Step 4: Ejecutar** los tests del Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Logros: aviso en los resultados y fuera de partida`.

### Task 10: Pestaña «Logros» en el perfil

**Files:**
- Create: `frontend/src/achievements/AchievementsPanel.tsx` y `achievements-groups.ts`, con su test `achievements-groups.test.ts`
- Modify: `frontend/src/screens/ProfilePage.tsx` y `frontend/src/screens/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: las Tasks 7 y 8, `Tabs` y `TabPanel` de `ui`, y `useSearchParams`.
- Produces:
  - `groupAchievements(list: AchievementResponse[]): { key: 'GENERAL' | 'GAME' | 'SECRET'; title: 'Generales' | 'Minijuegos' | 'Secretos'; items: AchievementResponse[] }[]`;
  - `unlockedDate(iso: string): string`, que da «Conseguido el 7 nov 2026» con `Intl` `es-ES`;
  - `AchievementsPanel({ data }: { data: AchievementsResponse })`.
  - En `ProfilePage`:
    - el panel derecho lleva `Tabs` con `idBase="perfil"`, las pestañas «Estadísticas» y «Logros», y la insignia `${unlocked}/${total}`;
    - `?tab=logros` abre «Logros»;
    - `GET /api/achievements` se pide al montar, en paralelo con el perfil;
    - si falla, la pestaña muestra `StateBox` de error con «Reintentar», sin afectar a «Estadísticas».

- [ ] **Step 1: Tests que fallan:**
  - en `achievements-groups.test.ts`: `groupsInOrder` y `dateFormat`;
  - en `ProfilePage.test.tsx`:
    - `logrosTabShowsBadge`;
    - `tabParamOpensLogros`;
    - `lockedSecretShowsPlaceholder`;
    - `achievementsErrorKeepsStats`.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/achievements/achievements-groups.test.ts frontend/src/screens/ProfilePage.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** La rejilla de `AchievementTile` va con scroll dentro del panel (`Panel scroll`): una columna en móvil, dos desde `sm` y tres desde `2xl`. El récord de Racha infinita no necesita código, porque ya sale en las métricas de Higher or Lower (Task 3).
- [ ] **Step 4: Ejecutar** los tests del Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Perfil: pestaña de logros`.

### Task 11: Recorrido en Playwright, capturas y rúbrica

**Files:**
- Create: `e2e/tests/logros.spec.ts`
- Modify: `e2e/src/helpers.ts`, solo si hace falta un helper (por ejemplo, `jugarHigherLowerSolo(page)`)

**Interfaces:**
- Consumes: todo lo anterior, y de `e2e/src/helpers.ts`: `comprobarBdE2E`, `nuevaCuenta`, `registrarPorApi`, `borrarCuentas`, `createRoom`, `seleccionarJuego`, `capture`, `SIZES` y `collectErrors`.

- [ ] **Step 1: Escribir el spec.** Por cada tamaño de `SIZES`, con una cuenta nueva:
  1. `registrarPorApi`;
  2. crear una sala y elegir Higher or Lower con «Número de rondas» en 1;
  3. iniciar y responder la ronda;
  4. en los resultados, esperar el recuadro con «Primera partida». Al jugar solo, la partida cuenta como victoria y el título es «¡Logros desbloqueados!», con «Primera partida», «Primera victoria» y «Gana en Higher or Lower». Capturar `logros-resultados`;
  5. comprobar que la región `role="status"` de los resultados anuncia un texto que empieza por «Logro desbloqueado:» y contiene «Primera partida»;
  6. pulsar «Ver mis logros»: se llega a `/profile?tab=logros` con la pestaña «Logros» activa y una insignia que casa con `/^[34]\/48$/`. Puede ser 4 si la partida termina entre las 3:00 y las 5:00 en Madrid, por «Búho nocturno», así que el spec no depende de la hora. Capturar `logros-perfil`;
  7. comprobar que los secretos bloqueados dicen «Logro secreto»;
  8. volver a la sala y jugar otra partida: no vuelve a salir «Primera partida».
  - Además, una prueba `ENDLESS` con una sola cuenta: elegir el modo «Racha infinita» y fallar en la primera ronda. En los resultados no sale ningún récord, porque la racha es 0. En el perfil, «Récord en Racha infinita» sale en las métricas de Higher or Lower.
  - En `afterAll`, `borrarCuentas`.
  - `collectErrors` vacío en todo el recorrido.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- logros`. Esperado: PASS, con las capturas a 1280×720, 1920×1080 y 390×844 en `e2e/screenshots/`, sin avisos de tamaños que falten y con `capture()` pasando con sus valores por defecto.
- [ ] **Step 3: Revisar las capturas** y puntuar con `docs/visual-review.md` los resultados con el recuadro y la pestaña «Logros» del perfil. Mínimo 19/24 en cada una y ningún criterio a 0.
- [ ] **Step 4: Commit** con el mensaje `Logros: recorrido en Playwright y capturas (rúbrica: resultados N/24, perfil N/24)`, con las notas reales.
