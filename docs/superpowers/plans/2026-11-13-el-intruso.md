# El Intruso: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un minijuego nuevo, `odd-one-out` («El Intruso»): cuatro Pokémon, tres comparten una categoría oculta y uno
no; todos votan a la vez quién es el intruso y al revelar se ve la categoría.

**Architecture:**
- Motor Java nuevo en `domain/game/engines/oddoneout/`, con el ciclo de Shiny Quiz (`shinyvote/`): `ROUND_ACTIVE` →
  `ROUND_RESULTS` → siguiente ronda, un voto bloqueado por jugador y puntos por orden de acierto.
- El tablero sale de las categorías de Pokémon Connections: se **amplía la visibilidad** de
  `PokemonConnectionsCatalog` (a `public`) en lugar de mover el catálogo, para que Connections no cambie (sus fixtures
  doradas no se tocan). Decisión del plan; el diseño hablaba de extraerlo y esto cumple lo mismo con menos riesgo.
- Contrato en `packages/shared/src/games/odd-one-out/`; pantalla en `frontend/src/games/odd-one-out/`.

**Tech Stack:** Java 25, Micronaut 5, fixtures doradas; TypeScript, Zod, React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-el-intruso-design.md`

## Global Constraints

- **Nada de suites completas; solo los tests de lo tocado.** Nada de `npm test`, `./gradlew check` ni `./gradlew test`
  sin `--tests`. Un solo trabajo pesado (Gradle o Playwright) a la vez.
- **Manifiesto** (`registry.json`): `id: "odd-one-out"`, `name: "El Intruso"`, `icon: "🔍"`, `minPlayers: 1`,
  `maxPlayers: 8`; `description`: `Tres Pokémon comparten algo y uno no: descubre al intruso sin saber la categoría.`;
  `howTo`:
  1. `Cada ronda salen cuatro Pokémon: tres comparten una categoría secreta y uno es el intruso.`
  2. `Cada acierto suma 1 punto, y los tres primeros en acertar ganan 3, 2 y 1 extra.`
  3. `Solo hay un voto por ronda: en cuanto elegís, queda bloqueado.`
- **Configuración** (estricta, en este orden; sin `mode`; nombre visible `"El Intruso"`):
  - `generations`: `pokemonGenerationsSchema`; por defecto, las 9;
  - `rounds`: entero de 3 a 30; por defecto, 10;
  - `roundSeconds`: entero de 10 a 60; por defecto, 20.
- **Ritmo** (`pace-presets.ts`): claves `rounds` y `roundSeconds`; Rápido `{ rounds: 5, roundSeconds: 15 }`, Experto
  `{ rounds: 15, roundSeconds: 15 }` (igual que Shiny Quiz).
- **Constantes:** `OPTION_COUNT = 4`, `ORDER_BONUSES = [3, 2, 1]`, `REVEAL_MS = 5_000`, `BOARD_ATTEMPTS = 40`.
- **Puntos:** acierto = `1 + ORDER_BONUSES[orden − 1]` (0 extra a partir del cuarto), con el orden por `votedAt`
  autoritativo entre los que aciertan. Fallo o sin voto: 0.
- **Fases:** `GAME_STARTING`, `ROUND_ACTIVE`, `ROUND_RESULTS`, `GAME_RESULTS`. La ronda se cierra al votar todos los
  jugadores necesarios o al vencer `roundEndsAt`.
- **Privacidad:** durante `ROUND_ACTIVE` el estado público no dice cuál es el intruso, ni la categoría, ni qué votó
  nadie (solo `votedPlayerIds`). El voto propio sale en el estado del jugador.
- **Tablero válido** (`OddOneOutBoards`), con la categoría `C` y los tres miembros `m1..m3`:
  1. el intruso `x` no está en `C`;
  2. no existe otra categoría `D` del catálogo resuelto (`resolvedCategoryDefinitions(pool)`) con `x ∈ D` y al menos
     dos de `m1..m3` en `D`;
  3. si `C` es de datos (`isDataCategory`), se prefieren intrusos que comparten tipo o generación con algún miembro;
     si es curada (lista a mano), se exige que `x` no comparta ningún tipo con los tres y se prefiere la misma
     generación que alguno;
  4. no se repite categoría en la partida y se prefieren Pokémon no usados (`Randoms.preferUnused`).
  Hasta `BOARD_ATTEMPTS` intentos por categoría; si falla, se prueba otra. Sin ninguna categoría válida, la
  disponibilidad lo rechaza.
- **Literales del servidor:**
  - `La ronda no está activa.`
  - `Estás observando esta partida.`
  - `Ya has votado en esta ronda.`
  - `El tiempo de la ronda ha terminado.`
  - `Esa opción no existe.`
  - `No hay categorías suficientes en esas generaciones.`
  - `Acción de El Intruso no válida.`
- **Textos de la web:** `¿Quién es el intruso?`, `Voto bloqueado`, `Categoría: ${label}`, `El intruso era ${nombre}`,
  `${n} de ${m} han votado`.
- Reglas de `AGENTS.md` y `domain/game/engines/README.md`: builders, `Immutables`, `@Serdeable` +
  `@JsonInclude(ALWAYS)`, orden de componentes = orden de claves, comentarios en español, UI solo con `frontend/src/ui/`,
  texto ≥ 13 px, objetivos ≥ 44 px, una región viva, `gameAction` + `ignoreFailure`, Playwright a tres tamaños y
  rúbrica ≥ 19/24.
- **`-Dupdate=true` regraba todas las fixtures.** Tras cada regrabación, `git diff --stat backend/src/test/resources/golden/`
  solo puede mostrar `odd-one-out/`. Si sale `pokemon-connections/` u otro, se para y se avisa.

## Review Focus

1. **Fuga del intruso antes de revelar:** ni el JSON público ni el de otro jugador en `ROUND_ACTIVE` contienen la
   categoría, el id de la opción correcta ni votos ajenos. `activeRoundLeaksNothing` (Task 4).
2. **Respuesta alternativa defendible:** con el catálogo dorado, 200 tableros seguidos cumplen la condición 2.
   `boardsHaveNoAlternativeAnswer` (Task 2).
3. **Generaciones pequeñas** (solo la 9, o solo la 1): o se genera un tablero válido o la disponibilidad da el literal;
   nunca una excepción a mitad de partida. `smallPoolsEitherWorkOrAreRejected` (Task 2).
4. **Todos votan antes del plazo / un jugador se desconecta sin votar:** la ronda se cierra sin esperar al reloj.
   `roundClosesWhenEveryRequiredPlayerVoted` (Task 4).
5. **Nombre de categoría largo a 390 px** («Evolucionan al intercambiarlos con un objeto»): sin scroll horizontal.
   Captura 390×844 de la revelación (Task 5) y `longCategoryWraps` (Task 3).

---

### Task 1: Contrato compartido

**Files:**
- Create: `packages/shared/src/games/odd-one-out/config.ts`, `types.ts`, `rules.ts`
- Modify: `packages/shared/src/public.ts` (exporta los tres), `packages/shared/src/games/projection-keys.test.ts`
  (entrada `'odd-one-out'`; fallará hasta la Task 4, que graba las fixtures: se añade en la Task 4)
- Test: `packages/shared/src/games/odd-one-out/rules.test.ts`

**Interfaces:**
- Produces:
  - `config.ts`: `oddOneOutConfigSchema`, `type OddOneOutConfig`, `defaultOddOneOutConfig`.
  - `types.ts`:
    - `ODD_ONE_OUT_OPTION_IDS = ['A', 'B', 'C', 'D'] as const`, `type OddOneOutOptionId`;
    - `OddOneOutOption { id; pokemonId; pokemonName; sprite }`;
    - `OddOneOutCategory { id; label; explanation }`;
    - `OddOneOutVote { optionId; votedAt }`;
    - `OddOneOutRoundResult { roundNumber; intruderOptionId; category; votes: Record<string, OddOneOutVote>; points: Record<string, number> }`;
    - `OddOneOutPublicState`, claves en orden: `gameId`, `phase`, `roundNumber`, `totalRounds`, `playerIds`,
      `options`, `votedPlayerIds`, `scores`, `roundStartedAt`, `roundEndsAt`, `nextTransitionAt`, `lastRound`
      (`OddOneOutRoundResult | null`), `results`;
    - `OddOneOutPlayerState { canVote; vote: OddOneOutVote | null }`;
    - `oddOneOutActionSchema`: `{ type: 'VOTE', optionId }` estricto.
  - `rules.ts`: `ODD_ONE_OUT_ORDER_BONUSES = [3, 2, 1] as const` y `oddOneOutScoringLabel()`, que devuelve
    `1 punto por acierto, y +3, +2 y +1 a los tres primeros en acertar.`

- [ ] **Step 1: Tests que fallan** en `rules.test.ts`: el texto de puntuación; el esquema rechaza `rounds` 2 y 31,
  `roundSeconds` 9 y 61, `mode` y una clave desconocida; los valores por defecto son 9 generaciones, 10 y 20; la acción
  rechaza `optionId: 'E'` y una clave extra.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/src/games/odd-one-out`. Esperado: FAIL.
- [ ] **Step 3: Implementar**, siguiendo `shiny-vote/{config,types}.ts` y `who-am-i/rules.ts`.
- [ ] **Step 4: Ejecutar** el Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** `El Intruso: contrato compartido`.

### Task 2: Configuración, tipos, reglas y tableros en Java

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonconnections/PokemonConnectionsCatalog.java`:
  pasan a `public` `CategoryDefinition.includes`, `resolvedCategoryDefinitions`, `membersFor`, `categoryFamily` e
  `isDataCategory`. Ningún otro cambio.
- Create, en `backend/src/main/java/es/pokemonuniverse/domain/game/engines/oddoneout/`: `OddOneOutConfig.java`,
  `OddOneOutTypes.java`, `OddOneOutRules.java`, `OddOneOutBoards.java`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/oddoneout/OddOneOutRulesTest.java` y
  `OddOneOutBoardsTest.java`

**Interfaces:**
- Consumes: `ConfigReader`, `PokemonCatalog`, `Randoms`, `Scoring`, y lo que se abre de `PokemonConnectionsCatalog`.
- Produces:
  - `record OddOneOutConfig(List<Integer> generations, int rounds, int roundSeconds)` con `defaults()` y
    `parse(JsonNode)`.
  - `OddOneOutTypes`: los records de la Task 1 con los mismos nombres y orden; `OddOneOutState` (builder,
    `TimedGameState`) con `phase`, `config`, `playerIds`, `roundNumber`, `board` (opciones + `intruderOptionId` +
    categoría, interno), `usedCategoryIds`, `usedPokemonIds`, `votes`, `scores`, `playerStats`, `roundStartedAt`,
    `roundEndsAt`, `nextTransitionAt`, `lastRound`; `OddOneOutPlayerStats(int votes, int correctVotes)` con `ZERO`;
    `OddOneOutAction.parse(JsonNode)`.
  - `OddOneOutRules`: `static int pointsForOrder(int solveOrder)` y `static GameResults buildResults(OddOneOutState)`
    (estadísticas `correctVotes`, `votes`, `incorrectVotes`, `unanswered`, `accuracy`, como `ShinyVoteRules`).
  - `OddOneOutBoards`:
    - `record Board(List<OddOneOutOption> options, String intruderOptionId, OddOneOutCategory category, List<String> pokemonIds)`;
    - `static Optional<String> availabilityIssue(List<Pokemon> pool)`;
    - `static Board generate(List<Pokemon> pool, Set<String> usedCategoryIds, Set<String> usedPokemonIds, DoubleSupplier random)`,
      con las reglas 1–4 de Global Constraints; lanza `EngineException` solo si `availabilityIssue` no está vacío.

- [ ] **Step 1: Tests que fallan**, con `GoldenCatalogs.load("gen1-2")`:
  - `OddOneOutRulesTest`: `parsesTheStrictConfigWithItsLimits` (límites, `10.0` / `10.5`, clave desconocida, `mode`);
    `pointsForOrder` (1→4, 2→3, 3→2, 4→1, 7→1); `resultsRankByPointsThenPlayerId`.
  - `OddOneOutBoardsTest`:
    - `boardHasFourDistinctPokemonAndOneIntruder`: 4 opciones con ids A–D, 3 en la categoría y el intruso fuera;
    - `boardsHaveNoAlternativeAnswer` (Review Focus 2): 200 tableros con semillas distintas cumplen la regla 2;
    - `curatedCategoryIntruderSharesNoType`;
    - `categoriesDoNotRepeatWhileOthersRemain`;
    - `sameSeedSameBoard`;
    - `smallPoolsEitherWorkOrAreRejected` (Review Focus 3): con el pool de una sola generación de las del catálogo
      dorado, `availabilityIssue` vacío implica que 30 `generate` seguidos no lanzan; un pool de 3 Pokémon da
      `No hay categorías suficientes en esas generaciones.`
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*OddOneOut*Test*'`. Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ejecutar** el Step 2 y `./gradlew test --tests '*PokemonConnections*' --tests '*GoldenReplayTest*'`
  (Connections no cambia). Esperado: PASS.
- [ ] **Step 5: Commit** `El Intruso: configuración, reglas y tableros del motor`.

### Task 3: Pantalla, resultados y ajustes

**Files:**
- Create, en `frontend/src/games/odd-one-out/`: `ConfigPanel.tsx`, `OddOneOutGame.tsx`, `OddOneOutResults.tsx`,
  `presentation.ts`, `OddOneOut.module.css`
- Modify: `frontend/src/games/registry.ts` (al final), `frontend/src/games/common/pace-presets.ts`,
  `frontend/src/games/game-icons.ts` (icono `SearchCheck` de `lucide-react`, o `Search` si no existe),
  `frontend/src/room/game-skip-slot.ts` (el id en `GAMES_WITH_SKIP_IN_SCREEN`)
- Test: `frontend/src/games/odd-one-out/OddOneOutGame.test.tsx`, `presentation.test.ts`; ampliar
  `frontend/src/games/registry.test.ts`, `frontend/src/room/RoomSessionLayout.test.tsx` y
  `frontend/src/games/config-panel-ranges.test.tsx`

**Interfaces:**
- Consumes: Task 1; la estructura de `frontend/src/games/shiny-vote/` (opciones como cartas, `GameScreen`, barra
  lateral, revelación).
- Produces: `OddOneOutGame`, `OddOneOutResults`, `OddOneOutConfigPanel` con las firmas de los demás juegos;
  en `presentation.ts`: `votedCountText(voted, total)` → `${n} de ${m} han votado` (singular `ha votado` con 1) y
  `roundOutcome(lastRound, selfId)` → `{ title, tone }` (`¡Era el intruso!` / `No era ese` / `Sin voto`).
- Comportamiento:
  - **Activa:** título `¿Quién es el intruso?`, cuatro cartas grandes (sprite y nombre) que votan al pulsar; tras
    votar, la carta elegida en `selected` y la placa `Voto bloqueado`; chips de quién ha votado.
  - **Revelación:** `Categoría: ${label}` con su `explanation`, la carta del intruso en `wrong`/destacada y las otras
    tres en `correct` (pertenecen a la categoría), y bajo cada carta los votantes; lateral con puntos de la ronda.
  - **Resultados:** clasificación con aciertos y precisión.
  - Una sola región viva; el error de `gameAction` lo da la sala (`ignoreFailure`).

- [ ] **Step 1: Tests que fallan:**
  - `presentation.test.ts`: `votedCountText` (1 y 3) y los tres casos de `roundOutcome`.
  - `OddOneOutGame.test.tsx` (`renderToStaticMarkup`): en `ROUND_ACTIVE` no aparece ninguna categoría ni marca de
    correcto; con `vote` sale `Voto bloqueado`; en `ROUND_RESULTS` sale `Categoría: Pokémon fósiles` y
    `El intruso era …`; `longCategoryWraps` (Review Focus 5: el texto de la categoría lleva la clase que parte
    palabras); exactamente un `aria-live`.
  - Los tres tests de registro ampliados; los rangos del panel son 3–30 y 10–60.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/games/odd-one-out frontend/src/games/registry.test.ts frontend/src/room/RoomSessionLayout.test.tsx frontend/src/games/config-panel-ranges.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ejecutar** el Step 2, `npx vitest run frontend/src/styles/global-classes.test.ts`, `npm run typecheck`
  y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** `El Intruso: pantalla, resultados y ajustes`.

### Task 4: Motor, registro y fixtures doradas

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/oddoneout/OddOneOutEngine.java`
- Modify: `backend/src/main/resources/games/registry.json` (entrada al final, con `profileStats`: `correctVotes`,
  `votes`, `incorrectVotes`, `unanswered` y la derivada `accuracy`, como `shiny-vote`, y `defaultConfig`);
  `ClasspathGameRegistryLoader.java` (`portedEngines`); `packages/shared/src/games/projection-keys.test.ts`
- Create, en `backend/src/test/resources/golden/odd-one-out/`: `rounds-votes-and-reveal.json`,
  `timeouts-and-presence.json`, `errors.json`, `config-cases.json`
- Modify: `config-messages.json` (regenerado), `gameconfigs/migration-cases.json` (dos casos a mano), las cuentas de
  juegos 31 → 32 en los tests que tocó `bba7ab5b` (`git show --stat bba7ab5b`), los logros (comprobar los números
  reales antes de editar), `README.md` y `docs/architecture.md`. Sin modos: no se toca `GameModes.java` ni
  `GameModeConfigTest`.
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/oddoneout/OddOneOutEngineTest.java`

**Interfaces:**
- Consumes: Tasks 1–3, `Timing`, `TimedLifecycle`, la superficie de `ShinyVoteEngine`.
- Produces: `OddOneOutEngine implements GameEngine<…>` con `ID = "odd-one-out"`.

- [ ] **Step 1: Tests que fallan** en `OddOneOutEngineTest` (catálogo dorado, `random` fijo, reloj controlado, como
  `ShinyVoteEngineTest`):
  - `defaultConfigMatchesTheRegistryManifest`;
  - `voteLocksAndScoresByOrder`: tres aciertos en orden suman 4, 3 y 2; un fallo, 0;
  - `roundClosesWhenEveryRequiredPlayerVoted` (Review Focus 4), también cuando el que falta se desconecta;
  - `timeoutRevealsAndAdvances` y `gameEndsAfterLastRound`;
  - `rejectsInvalidActions`: todos los literales del servidor;
  - `activeRoundLeaksNothing` (Review Focus 1);
  - `spectatorCannotVote`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*OddOneOutEngineTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor, `registry.json` y `portedEngines`.
- [ ] **Step 4: Escribir las fixtures** (`catalog: "gen1-2"`, `seed` distinto en cada una; grabar, leer qué sale y
  ajustar): rondas con aciertos y fallos y el fin; plazo vencido con votos parciales y desconexión; todos los
  literales y una acción no válida; `config-cases.json` con los límites de `rounds` y `roundSeconds`, `5.0`/`5.5`,
  generaciones `[2,1,1]` y `[]`, `mode` y una clave desconocida.
- [ ] **Step 5: Regenerar** `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*' --tests '*ConfigMessagesSnapshotTest*'`;
  `git diff --stat backend/src/test/resources/golden/` solo muestra `odd-one-out/`.
- [ ] **Step 6: Añadir a mano** a `migration-cases.json` `odd-one-out: configuración válida sin cambios` y
  `odd-one-out: clave obsoleta eliminada`; subir las cuentas; añadir la entrada de `projection-keys.test.ts`.
- [ ] **Step 7: Ejecutar** `./gradlew test --tests '*OddOneOut*' --tests '*GoldenReplayTest*' --tests '*GoldenRegistryConsistencyTest*' --tests '*ConfigMessagesSnapshotTest*' --tests '*StoredGameConfigMigrationTest*' --tests '*ClasspathGameRegistryLoaderTest*' --tests '*GamesControllerTest*' --tests '*ProfileControllerTest*' --tests '*PublicProfileControllerTest*' --tests '*AchievementsControllerTest*' --tests '*RoomCoordinatorTest*' --tests '*AchievementCatalogTest*' --tests '*OpenApiSpecTest*'`
  y `npx vitest run packages/shared/src/games/registry-defaults.test.ts packages/shared/src/games/config-cases.test.ts packages/shared/src/games/projection-keys.test.ts`. Esperado: PASS.
- [ ] **Step 8: Commit** `Motor de El Intruso con fixtures doradas` (motor, registro y fixtures juntos).

### Task 5: Playwright, capturas y rúbrica

**Files:**
- Create: `e2e/tests/juegos/odd-one-out.spec.ts`
- Modify: `e2e/tests/juegos.spec.ts` (`'odd-one-out'` en `SCREENSHOT_GAMES`)

- [ ] **Step 1: Escribir el test** `el intruso: votar, revelar y clasificación`, con 2 jugadores y `rounds: 3`: uno
  vota y se ve `Voto bloqueado` (captura `juego-odd-one-out-votar`); el otro vota; revelación con la categoría
  (captura `juego-odd-one-out-revelacion`); clasificación al final (captura `juego-odd-one-out-clasificacion`).
  `collectErrors` vacío.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- juegos/odd-one-out`. Esperado: PASS, capturas a 1280×720, 1920×1080 y
  390×844, `capture()` con sus valores por defecto.
- [ ] **Step 3: Revisar las capturas** y puntuar votar, revelación y clasificación con `docs/visual-review.md`
  (≥ 19/24, ningún criterio a 0).
- [ ] **Step 4: Verificación final:** `npm run typecheck`, `npm run lint` y los `--tests` del Step 7 de la Task 4.
- [ ] **Step 5: Commit** `El Intruso: flujo en Playwright y capturas (rúbrica: votar N/24, revelación N/24, clasificación N/24)` y `git push`.
