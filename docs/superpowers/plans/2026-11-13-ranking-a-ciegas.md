# Ranking a Ciegas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un minijuego nuevo, `blind-ranking` («Ranking a Ciegas»): con una consigna subjetiva, N Pokémon salen de uno en
uno y cada jugador coloca cada uno, para siempre, en un hueco libre del 1 al N; al final de la ronda se compara con el
grupo y puntúa quien más se parece a la media del resto.

**Architecture:**
- Motor Java nuevo en `domain/game/engines/blindranking/`, con el ciclo de Secret Ranking (`secretranking/`) y un paso
  por Pokémon dentro de `ROUND_ACTIVE` (`currentIndex` y plazo por paso).
- Reutiliza sin cambiarlos `SecretRankingPrompts.OFFICIAL` (consignas) y
  `SecretRankingRules.secretRankingDistances` (puntuación), además de `Scoring.pointsForPosition`.
- Contrato en `packages/shared/src/games/blind-ranking/`; pantalla en `frontend/src/games/blind-ranking/`.

**Tech Stack:** Java 25, Micronaut 5, fixtures doradas; TypeScript, Zod, React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-ranking-a-ciegas-design.md`

## Global Constraints

- **Nada de suites completas; solo los tests de lo tocado.** Un solo trabajo pesado (Gradle o Playwright) a la vez.
- **Manifiesto:** `id: "blind-ranking"`, `name: "Ranking a Ciegas"`, `icon: "🙈"`, `minPlayers: 3`, `maxPlayers: 8`;
  `description`: `Coloca cada Pokémon en tu ranking sin saber cuál viene después e intenta pensar como el grupo.`;
  `howTo`:
  1. `Los Pokémon salen de uno en uno: colocad cada uno en un hueco libre de vuestro ranking, sin poder moverlo.`
  2. `Al final de la ronda, cuanto más se parezca vuestro ranking a la media del resto, más puntos.`
  3. `Si se os acaba el tiempo, el Pokémon va a un hueco libre al azar.`
- **Configuración** (estricta, en este orden; sin `mode`; nombre visible `"Ranking a Ciegas"`):
  - `generations`: `pokemonGenerationsSchema`; por defecto, las 9;
  - `rounds`: entero de 1 a 10; por defecto, 3;
  - `pokemonCount`: entero de 5 a 10; por defecto, 10;
  - `placeSeconds`: entero de 8 a 30; por defecto, 15.
- **Ritmo:** claves `rounds` y `placeSeconds`; Rápido `{ rounds: 2, placeSeconds: 10 }`, Experto
  `{ rounds: 5, placeSeconds: 10 }`.
- **Constantes:** `REVEAL_MS = 12_000` (la revelación tiene más que leer que la de Secret Ranking, 8 s),
  `CONTROVERSIAL_COUNT = 3`.
- **Fases:** `GAME_STARTING`, `ROUND_ACTIVE`, `ROUND_RESULTS`, `GAME_RESULTS`. En `ROUND_ACTIVE`, `currentIndex` (0…N−1)
  y `roundEndsAt` es el plazo del Pokémon actual. El paso avanza cuando todos los jugadores necesarios han colocado el
  actual, o al vencer el plazo (a los que faltan, el servidor les coloca el Pokémon en un hueco libre con
  `context.random()`, en el orden de `playerIds`). Tras el último Pokémon, `ROUND_RESULTS`.
- **Ronda:** consigna de `SecretRankingPrompts.OFFICIAL` sin repetir en la partida mientras queden; N Pokémon distintos
  del pool (formas por defecto con sprite de las generaciones elegidas), sin repetir en la partida mientras queden.
- **Puntuación de la ronda:** solo puntúan los jugadores que colocaron **al menos uno** de los N ellos mismos
  («participantes»). Su ranking (ids por hueco 1…N) entra en `secretRankingDistances`; con menos de 2 participantes,
  nadie suma. Los no participantes no cuentan para el ranking del grupo.
- **Ranking del grupo:** posición media de cada Pokémon entre los participantes, de menor a mayor (desempate: orden de
  salida). **Polémicos:** los `CONTROVERSIAL_COUNT` Pokémon con mayor desviación típica de posiciones entre
  participantes (desempate: orden de salida); vacío con menos de 2 participantes.
- **Privacidad:** durante `ROUND_ACTIVE` el estado público solo dice qué Pokémon han salido (`shownPokemon`), el actual
  y quién ha colocado el actual (`placedPlayerIds`), nunca dónde. El tablero propio va en el estado del jugador. Los
  tableros de todos solo salen en `lastRound`, en `ROUND_RESULTS` y `GAME_RESULTS`.
- **Literales del servidor:**
  - `La ronda no está activa.`
  - `Estás observando esta partida.`
  - `Ya has colocado este Pokémon.`
  - `Ese hueco no existe.`
  - `Ese hueco ya está ocupado.`
  - `El tiempo para colocar este Pokémon ha terminado.`
  - `` `Solo hay ${n} Pokémon en esas generaciones.` ``
  - `Acción de Ranking a Ciegas no válida.`
- **Textos de la web:** `¿Dónde lo pones?`, `Hueco ${n}`, `Colocado en el ${n}`, `${n} de ${m} han colocado`
  (singular `ha colocado`), `Ranking del grupo`, `Los más polémicos`, `Puesto al azar` (marca de un hueco
  autocolocado).
- Reglas de `AGENTS.md` y `domain/game/engines/README.md` (builders, `Immutables`, `@Serdeable` +
  `@JsonInclude(ALWAYS)`, orden de componentes = orden de claves, PRNG, comentarios en español; UI solo con
  `frontend/src/ui/`, texto ≥ 13 px, objetivos ≥ 44 px, una región viva, `ignoreFailure`, Playwright a tres tamaños,
  rúbrica ≥ 19/24). Cada clase `@Serdeable` nueva y el motor van también en
  `backend/src/main/resources/META-INF/native-image/es.pokemonuniverse/pokemon-universe-backend/reachability-metadata.json`,
  con la forma de las entradas de `whoami` y `oddoneout`.
- **`-Dupdate=true` regraba todas las fixtures.** Tras cada regrabación, `git diff --stat backend/src/test/resources/golden/`
  solo puede mostrar `blind-ranking/`. Si cambia otra, se para y se avisa.

## Review Focus

1. **Fuga de colocaciones ajenas:** en `ROUND_ACTIVE`, ni el JSON público ni el de otro jugador contienen el tablero
   de nadie más. `activeRoundLeaksNoBoards` (Task 4).
2. **Plazo vencido con varios sin colocar, y el último hueco:** el servidor los coloca en huecos libres distintos; con un
   solo hueco libre, va ahí; nunca se pisa un hueco. `timeoutAutoPlacesIntoFreeSlots` (Task 4).
3. **Un jugador se desconecta a mitad de ronda:** el paso no espera por él; al final no puntúa si no colocó ninguno.
   `disconnectedPlayerDoesNotBlockSteps` (Task 4).
4. **Doble clic en el mismo hueco / carrera de dos colocaciones:** la segunda se rechaza con `Ya has colocado este
   Pokémon.`; la web bloquea los huecos mientras la acción está pendiente. `placeTwiceIsRejected` (Task 4) y
   `slotsLockWhilePending` (Task 3).
5. **Diez huecos a 390 px:** la columna de huecos cabe sin scroll horizontal y cada hueco mide ≥ 44 px. Captura
   390×844 (Task 5).

---

### Task 1: Contrato compartido

**Files:**
- Create: `packages/shared/src/games/blind-ranking/config.ts`, `types.ts`, `rules.ts`
- Modify: `packages/shared/src/public.ts` (la entrada de `projection-keys.test.ts` va en la Task 4)
- Test: `packages/shared/src/games/blind-ranking/rules.test.ts`

**Interfaces:**
- Produces:
  - `config.ts`: `blindRankingConfigSchema`, `type BlindRankingConfig`, `defaultBlindRankingConfig`.
  - `types.ts`:
    - `BlindRankingPokemon { id; name; sprite }`, `BlindRankingPrompt { id; text }`;
    - `BlindRankingConsensus { pokemon; averagePosition }`, `BlindRankingControversial { pokemon; spread }`;
    - `BlindRankingRoundPlayerResult { participated: boolean; autoPlaced: number; distance: number | null; position: number | null; points: number }`;
    - `BlindRankingRoundResult { roundNumber; prompt; pokemon: BlindRankingPokemon[]; boards: Record<string, string[]>; autoPlacedSlots: Record<string, number[]>; consensus: BlindRankingConsensus[]; controversial: BlindRankingControversial[]; players: Record<string, BlindRankingRoundPlayerResult> }`
      (`boards[player][slot−1]` = id del Pokémon en ese hueco);
    - `BlindRankingPublicState`, claves en orden: `gameId`, `phase`, `roundNumber`, `totalRounds`, `playerIds`,
      `prompt`, `slotCount`, `currentIndex`, `currentPokemon` (`BlindRankingPokemon | null`), `shownPokemon`,
      `placedPlayerIds`, `scores`, `roundStartedAt`, `roundEndsAt`, `nextTransitionAt`, `lastRound`
      (`BlindRankingRoundResult | null`), `results`;
    - `BlindRankingPlayerState { role: 'PLAYER' | 'SPECTATOR'; canPlace; board: (BlindRankingPokemon | null)[]; autoPlacedSlots: number[] }`;
    - `blindRankingActionSchema`: `{ type: 'PLACE', slot }` estricto, `slot` entero 1–10.
  - `rules.ts`: `blindRankingScoringLabel()`, que devuelve
    `Cuanto más se parezca tu ranking a la media del resto, mejor puesto en la ronda y más puntos.`

- [ ] **Step 1: Tests que fallan** en `rules.test.ts`: el texto; el esquema rechaza `rounds` 0 y 11, `pokemonCount` 4 y
  11, `placeSeconds` 7 y 31, `mode` y una clave desconocida; los valores por defecto (9 generaciones, 3, 10, 15); la
  acción rechaza `slot` 0, 11, 2.5 y una clave extra.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/src/games/blind-ranking`. Esperado: FAIL.
- [ ] **Step 3: Implementar**, siguiendo `secret-ranking/` y `odd-one-out/`.
- [ ] **Step 4: Ejecutar** el Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** `Ranking a Ciegas: contrato compartido`.

### Task 2: Configuración, tipos y reglas en Java

**Files:**
- Create, en `backend/src/main/java/es/pokemonuniverse/domain/game/engines/blindranking/`: `BlindRankingConfig.java`,
  `BlindRankingTypes.java`, `BlindRankingRules.java`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/blindranking/BlindRankingRulesTest.java`

**Interfaces:**
- Consumes: `ConfigReader`, `Randoms`, `Scoring`, `SecretRankingPrompts.OFFICIAL`,
  `SecretRankingRules.secretRankingDistances`.
- Produces:
  - `record BlindRankingConfig(List<Integer> generations, int rounds, int pokemonCount, int placeSeconds)` con
    `defaults()` y `parse(JsonNode)`.
  - `BlindRankingTypes`: los records de la Task 1 con los mismos nombres y orden; `BlindRankingState` (builder,
    `TimedGameState`) con `phase`, `config`, `playerIds`, `roundNumber`, `prompt`, `roundPokemon`, `currentIndex`,
    `boards` (jugador → lista de N ids o null), `autoPlacedSlots`, `placedPlayerIds`, `usedPromptIds`,
    `usedPokemonIds`, `scores`, `playerStats`, `roundStartedAt`, `roundEndsAt`, `nextTransitionAt`, `lastRound`;
    `BlindRankingPlayerStats(int roundsPlayed, int rankingsSubmitted, int autoPlaced, int roundWins, int distanceTotal, int pointsFromRounds)`
    con `ZERO`; `BlindRankingAction.parse(JsonNode)`.
  - `BlindRankingRules`, todo `static` y puro:
    - `List<Integer> freeSlots(List<String> board)` (huecos 1…N libres, ascendentes);
    - `List<String> autoPlace(List<String> board, String pokemonId, DoubleSupplier random)` (un hueco libre al azar);
    - `BlindRankingRoundResult roundResult(int roundNumber, BlindRankingPrompt prompt, List<BlindRankingPokemon> pokemon, Map<String, List<String>> boards, Map<String, List<Integer>> autoPlacedSlots, List<String> playerIds)`
      con participantes, `secretRankingDistances` sobre los participantes, ranking del grupo y polémicos según Global
      Constraints;
    - `GameResults buildResults(BlindRankingState state)`, con las 6 estadísticas.

- [ ] **Step 1: Tests que fallan**, con `GoldenCatalogs.load("gen1-2")`:
  - `parsesTheStrictConfigWithItsLimits` (límites, `5.0` / `5.5`, `mode`, clave desconocida);
  - `autoPlaceUsesAFreeSlot` (con un solo hueco libre va ahí; nunca un ocupado; misma semilla, mismo hueco);
  - `participantsOnlyScore`: 4 jugadores, uno con los N autocolocados: `participated=false`, `points=0`,
    `distance=null`, y no influye en el ranking del grupo;
  - `fewerThanTwoParticipantsScoreNothing`;
  - `consensusOrdersByAveragePosition` y `controversialPicksTheWidestSpread` (con tableros escritos a mano y sus
    valores esperados);
  - `resultsRankByPoints`.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*BlindRankingRulesTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ejecutar** el Step 2 y `./gradlew test --tests '*SecretRanking*'` (no cambia). Esperado: PASS.
- [ ] **Step 5: Commit** `Ranking a Ciegas: configuración y reglas del motor`.

### Task 3: Pantalla, resultados y ajustes

**Files:**
- Create, en `frontend/src/games/blind-ranking/`: `ConfigPanel.tsx`, `BlindRankingGame.tsx`, `BlindRankingResults.tsx`,
  `presentation.ts`, `BlindRanking.module.css`
- Modify: `frontend/src/games/registry.ts`, `frontend/src/games/common/pace-presets.ts`,
  `frontend/src/games/game-icons.ts` (icono `EyeOff` de `lucide-react`), `frontend/src/room/game-skip-slot.ts`
- Test: `frontend/src/games/blind-ranking/BlindRankingGame.test.tsx`, `presentation.test.ts`; ampliar
  `frontend/src/games/registry.test.ts`, `frontend/src/room/RoomSessionLayout.test.tsx` y
  `frontend/src/games/config-panel-ranges.test.tsx`

**Interfaces:**
- Consumes: Task 1; la estructura de `frontend/src/games/secret-ranking/` y `odd-one-out/`.
- Produces: `BlindRankingGame`, `BlindRankingResults`, `BlindRankingConfigPanel`; en `presentation.ts`:
  `placedCountText(placed, total)` y `consensusRows(lastRound)` (filas del ranking del grupo con la posición propia al
  lado).
- Comportamiento:
  - **Activa:** consigna como título, el Pokémon actual grande (sprite y nombre) con `¿Dónde lo pones?`, y la columna de
    N huecos (`Hueco n`): los ocupados muestran su Pokémon, los libres son botones; pulsar uno coloca (con
    `usePendingAction`: todos los huecos bloqueados mientras está pendiente). Tras colocar, `Colocado en el n` y espera.
    Fichas de quién ha colocado. Los huecos autocolocados llevan `Puesto al azar`.
  - **Revelación:** `Ranking del grupo` (posición media) con tu hueco al lado de cada Pokémon, `Los más polémicos` con
    sus dispersiones, y en el lateral los puntos de la ronda.
  - **Resultados:** clasificación con `blindRankingScoringLabel()` como en who-am-i.
  - Una sola región viva; errores de `gameAction` con `ignoreFailure`.

- [ ] **Step 1: Tests que fallan:**
  - `presentation.test.ts`: `placedCountText` (1 y 3) y `consensusRows` con un `lastRound` escrito a mano.
  - `BlindRankingGame.test.tsx` (`renderToStaticMarkup`): en `ROUND_ACTIVE` solo hay botones en los huecos libres; los
    ocupados muestran su Pokémon; no aparece ningún tablero ajeno; `slotsLockWhilePending` (Review Focus 4); en
    `ROUND_RESULTS` salen `Ranking del grupo` y `Los más polémicos`; exactamente un `aria-live`.
  - Los tres tests de registro; rangos del panel 1–10, 5–10 y 8–30.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/games/blind-ranking frontend/src/games/registry.test.ts frontend/src/room/RoomSessionLayout.test.tsx frontend/src/games/config-panel-ranges.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ejecutar** el Step 2, `npx vitest run frontend/src/styles/global-classes.test.ts`, `npm run typecheck` y
  `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** `Ranking a Ciegas: pantalla, resultados y ajustes`.

### Task 4: Motor, registro y fixtures doradas

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/blindranking/BlindRankingEngine.java`
- Modify: `registry.json` (entrada al final con `profileStats` de las 6 estadísticas y la derivada
  `submissionRate`, `PERCENT`, `rankingsSubmitted` / [`roundsPlayed`], y `defaultConfig`); `ClasspathGameRegistryLoader`
  (`portedEngines`); `reachability-metadata.json` (Global Constraints); `projection-keys.test.ts`; la regla del juego en
  `RoundSecretsProjectionTest`
- Create, en `backend/src/test/resources/golden/blind-ranking/`: `placements-and-reveal.json`,
  `timeouts-and-presence.json`, `errors.json`, `config-cases.json`
- Modify: `config-messages.json` (regenerado), `gameconfigs/migration-cases.json` (dos casos a mano), las cuentas de
  juegos 32 → 33 y de logros en los tests que tocó `590fab86` (`git show --stat 590fab86`), `README.md` y
  `docs/architecture.md`.
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/blindranking/BlindRankingEngineTest.java`

**Interfaces:**
- Consumes: Tasks 1–3, `Timing`, `TimedLifecycle`, la superficie de `SecretRankingEngine` y `OddOneOutEngine`.
- Produces: `BlindRankingEngine implements GameEngine<…>` con `ID = "blind-ranking"`.

- [ ] **Step 1: Tests que fallan** en `BlindRankingEngineTest` (catálogo dorado, `random` fijo, reloj controlado):
  - `defaultConfigMatchesTheRegistryManifest` y `needsThreePlayers`;
  - `stepAdvancesWhenEveryRequiredPlayerPlaced`;
  - `timeoutAutoPlacesIntoFreeSlots` (Review Focus 2);
  - `disconnectedPlayerDoesNotBlockSteps` (Review Focus 3);
  - `placeTwiceIsRejected` (Review Focus 4) y `rejectsInvalidActions` (todos los literales);
  - `roundEndsAfterLastPokemonAndScores`, `promptsAndPokemonDoNotRepeat`, `gameEndsAfterLastRound`;
  - `activeRoundLeaksNoBoards` (Review Focus 1), con control positivo tras la revelación;
  - `spectatorCannotPlace`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*BlindRankingEngineTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor, `registry.json`, `portedEngines` y los metadatos nativos.
- [ ] **Step 4: Escribir las fixtures** (`catalog: "gen1-2"`, `pokemonCount: 5` para que sean cortas, `seed` distinto
  en cada una; grabar, leer y ajustar): colocaciones completas de 3 jugadores y la revelación; plazo vencido con
  autocolocación y desconexión; todos los literales y una acción no válida; `config-cases.json` con los límites de las
  tres claves numéricas, `5.0`/`5.5`, generaciones `[2,1,1]` y `[]`, `mode` y una clave desconocida.
- [ ] **Step 5: Regenerar** `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*' --tests '*ConfigMessagesSnapshotTest*'`;
  `git diff --stat backend/src/test/resources/golden/` solo muestra `blind-ranking/`.
- [ ] **Step 6: Añadir a mano** los dos casos de `migration-cases.json`, subir las cuentas y la entrada de
  `projection-keys.test.ts`.
- [ ] **Step 7: Ejecutar** `./gradlew test --tests '*BlindRanking*' --tests '*GoldenReplayTest*' --tests '*GoldenRegistryConsistencyTest*' --tests '*ConfigMessagesSnapshotTest*' --tests '*StoredGameConfigMigrationTest*' --tests '*ClasspathGameRegistryLoaderTest*' --tests '*GamesControllerTest*' --tests '*ProfileControllerTest*' --tests '*PublicProfileControllerTest*' --tests '*AchievementsControllerTest*' --tests '*RoomCoordinatorTest*' --tests '*AchievementCatalogTest*' --tests '*OpenApiSpecTest*' --tests '*RoundSecretsProjectionTest*'`
  y `npx vitest run packages/shared/src/games/registry-defaults.test.ts packages/shared/src/games/config-cases.test.ts packages/shared/src/games/projection-keys.test.ts`. Esperado: PASS.
- [ ] **Step 8: Commit** `Motor de Ranking a Ciegas con fixtures doradas`.

### Task 5: Playwright, capturas y rúbrica

**Files:**
- Create: `e2e/tests/juegos/blind-ranking.spec.ts`
- Modify: `e2e/tests/juegos.spec.ts` (`'blind-ranking'` en `SCREENSHOT_GAMES`)

- [ ] **Step 1: Escribir el test** `ranking a ciegas: colocar, revelar y clasificación`, con 3 jugadores,
  `rounds: 1`, `pokemonCount: 5`: cada uno coloca los 5 en huecos distintos entre jugadores (captura
  `juego-blind-ranking-colocar` a mitad de ronda, con huecos ocupados y libres); revelación (captura
  `juego-blind-ranking-revelacion`); clasificación (captura `juego-blind-ranking-clasificacion`). `collectErrors`
  vacío.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- juegos/blind-ranking` y el humo `npm run ui:check -- juegos.spec -g "blind-ranking$"`.
  Esperado: PASS, capturas a 1280×720, 1920×1080 y 390×844 (también con 10 huecos a 390: Review Focus 5), `capture()`
  con sus valores por defecto.
- [ ] **Step 3: Revisar las capturas** y puntuar colocar, revelación y clasificación (≥ 19/24, ningún criterio a 0).
- [ ] **Step 4: Verificación final:** `npm run typecheck`, `npm run lint`.
- [ ] **Step 5: Commit** `Ranking a Ciegas: flujo en Playwright y capturas (rúbrica: colocar N/24, revelación N/24, clasificación N/24)`.
