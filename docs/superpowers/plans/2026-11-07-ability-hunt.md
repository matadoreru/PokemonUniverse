# Ability Hunt: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un minijuego nuevo, `ability-hunt`. Sale una habilidad y gana la ronda el primero que elige un Pokémon que la tiene: 100 puntos, o 200 si es su habilidad oculta. Tras N rondas gana quien más puntos tiene.

**Architecture:**
- El catálogo en memoria gana `Pokemon.hiddenAbilities`, que se lee de `metadata.abilityRelations` sin migración.
- Motor Java nuevo en `domain/game/engines/abilityhunt/` con `Timing.advanceTimedRound`, registrado en `portedEngines` con sus fixtures doradas.
- Contrato en `packages/shared/src/games/ability-hunt/`.
- Pantalla con el kit de adivinar (`frontend/src/room/guess-kit`) y el `PokemonSelector` con `locked`.

**Tech Stack:** Java 25, Micronaut 5, fixtures doradas, ICU4J (`Collations`); TypeScript, Zod, React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-ability-hunt-design.md`

## Global Constraints

- **Nada de suites completas; solo los tests de lo tocado.** Nada de `npm test`, `./gradlew check` ni `./gradlew test` sin `--tests`. Se usan `npx vitest run <ficheros>` y `./gradlew test --tests '<clase>'`, además de `npm run typecheck` y `npm run lint`.
- **Manifiesto** (`registry.json`): `id: "ability-hunt"`, `name: "Ability Hunt"`, `icon: "🧬"`, `minPlayers: 2`, `maxPlayers: 8`. La `description` es: `Sale una habilidad: el primero en nombrar un Pokémon que la tenga gana la ronda. Con la habilidad oculta, puntos dobles.`
- **Configuración** (estricta, en este orden de claves):
  - `generations`: `pokemonGenerationsSchema`; por defecto, las 9;
  - `rounds`: entero de 1 a 20; por defecto, 10;
  - `roundSeconds`: entero de 15 a 60; por defecto, 30;
  - `includeRegionalForms`: booleano; por defecto, `false`.
  - El nombre visible para `ConfigReader` es `"Ability Hunt"`.
- **Constantes:**
  - `POINTS_NORMAL = 100` y `POINTS_HIDDEN = 200`;
  - `MIN_POKEMON_PER_ABILITY = 3`;
  - `COOLDOWN_MS = 2_000`;
  - `REVEAL_MS = 5_000`;
  - `MAX_EXAMPLES = 3`.
- **Literales del servidor**, idénticos en Java, en las fixtures y en los tests:
  - `No hay una ronda activa.`
  - `Estás observando esta ronda.`
  - `El tiempo ha terminado.`
  - `Ese Pokémon no pertenece al pool configurado.`
  - `Ese Pokémon ya se ha dicho en esta ronda.`
  - `Ese Pokémon ya ganó una ronda en esta partida.`
  - `No hay Pokémon con habilidades en las generaciones seleccionadas.`
  - `No hay habilidades con al menos 3 Pokémon en estas generaciones.`
  - `` `Con estas generaciones solo hay ${n} habilidades con al menos 3 Pokémon: baja las rondas a ${n} o añade generaciones.` ``
  - `` `Se necesitan al menos ${minPlayers} jugadores.` ``
  - `Acción de Ability Hunt no válida.`
- **Bloqueos:**
  - en la ronda, por `pokemonId`, los fallos de cualquiera;
  - en la partida, por `nationalDexNumber`, la especie ganadora con todas sus formas.
  - Un intento rechazado por bloqueo no cuenta como intento ni pone espera.
- **Privacidad:**
  - en `ROUND_ACTIVE`, `lastRound` es `null` y ninguna respuesta válida sale en la proyección pública ni en la del jugador;
  - `/api/pokemon/selector` sigue devolviendo solo `id`, `name` y `sprite`.
- **Textos de la web:**
  - `¿Quién tiene ${habilidad}?`
  - `¡${jugador} gana con ${pokémon}!`
  - `Nadie encontró a tiempo`
  - `${n} Pokémon la tienen`
  - `Habilidad oculta: puntos dobles`
  - `100 puntos; 200 si es su habilidad oculta`
  - `Habilidad oculta · ×2`
  - `Habilidad normal`
  - `Oculta`
- Las reglas de `AGENTS.md` y de `domain/game/engines/README.md`:
  - builder en los records de estado y en cualquier record de 8 o más componentes;
  - `Immutables.frozenMap` y `frozenList`;
  - `@Serdeable` y `@JsonInclude(ALWAYS)` en las proyecciones;
  - el orden de los componentes es el orden de las claves;
  - comentarios en español;
  - UI solo con `frontend/src/ui/` y el kit de adivinar, sin componentes nuevos;
  - texto ≥ 13 px y objetivos táctiles ≥ 44 px;
  - una sola región viva y un solo dueño por error;
  - Playwright a tres tamaños y rúbrica ≥ 19/24.
- Otros agentes trabajan en la rama `modos`. Hay que tocar solo los ficheros listados y hacer `git add` fichero a fichero.
- **`-Dupdate=true` regraba todas las fixtures del árbol**, también las que otro agente tenga sin commit, como las de `type-duel`. Después de cada regrabación hay que mirar `git diff --stat backend/src/test/resources/golden/`. Las fixtures ajenas no se añaden ni se revierten: nada de `git checkout`, que destruiría trabajo ajeno. Si cambia una fixture ajena que estaba limpia, para y avisa.

## Review Focus

1. **Fuga de respuestas durante la ronda:** ni `examples`, ni `winner`, ni ningún Pokémon válido aparecen en el JSON de `ROUND_ACTIVE`. Lo comprueban `activeProjectionsNeverContainAValidAnswer` (Task 5) y `nunca pinta una respuesta válida en la ronda` (Task 4).
2. **Bloqueo por especie:** si «Vulpix» ganó una ronda, «Vulpix de Alola» se rechaza en otra, y el buscador lo marca como no elegible. Lo comprueban `winningSpeciesIsLockedWithItsForms` (Task 5) y la fixture `forms-and-presence.json`.
3. **Carrera de dos aciertos casi simultáneos:** el segundo, procesado ya en `ROUND_RESULTS`, recibe `No hay una ronda activa.` y no suma puntos. Lo comprueba `secondCorrectAnswerAfterTheFirstIsRejected` (Task 5).
4. **Habilidad oculta:** solo da 200 si la habilidad está en `hiddenAbilities` de **ese** Pokémon, no si es oculta en otro. Lo comprueban `hiddenAbilityScoresDouble` y `catalogReadsHiddenAbilitiesFromMetadata` (Tasks 1 y 5).
5. **Disponibilidad con pocas habilidades:** con 19 elegibles y 20 rondas, el lobby muestra el literal con `n = 19` y la partida no arranca. Lo comprueba `availabilityNeedsAsManyAbilitiesAsRounds` (Tasks 3 y 5).

---

### Task 1: Habilidades ocultas en el catálogo

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/pokemon/Pokemon.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/pokemon/CatalogHiddenAbilities.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/application/pokemon/PokemonCatalogService.java`: `toPokemon`
- Modify: `backend/src/test/resources/golden/catalog/gen1-2.json`: datos congelados, editados a mano con un script que no se guarda
- Test: `backend/src/test/java/es/pokemonuniverse/application/pokemon/CatalogHiddenAbilitiesTest.java`, `PokemonCatalogServiceTest.java` y `backend/src/test/java/es/pokemonuniverse/golden/GoldenCatalogsTest.java`

**Interfaces:**
- Produces:
  - `record Pokemon(…, List<String> types, List<String> hiddenAbilities)`, con un componente nuevo al final:
    - el constructor compacto pone `List.of()` si llega `null` y copia con `List.copyOf`;
    - el constructor canónico lleva `@Creator` (`io.micronaut.core.annotation.Creator`, como `GameResults`). Así Serde no elige el de la aridad anterior al leer `gen1-2.json`, cosa que perdería el campo sin avisar. La aserción de Bulbasaur del Step 1 lo detecta;
    - el constructor de la aridad anterior delega con `List.of()`;
    - `withPalette` conserva `hiddenAbilities`.
  - `CatalogHiddenAbilities.from(@Nullable Map<String, Object> metadata): List<String>`:
    - devuelve los `name` de `abilityRelations` con `isHidden == true`, ordenados por `slot`;
    - con datos ausentes o mal formados, devuelve `List.of()`.

- [ ] **Step 1: Tests que fallan:**
  - `CatalogHiddenAbilitiesTest`:
    - con dos normales y una oculta, devuelve `["Clorofila"]`;
    - con `metadata` nulo, `abilityRelations` que no es lista, una entrada sin `name` o un `isHidden` que no es booleano, devuelve `[]`;
    - con dos ocultas, las ordena por `slot`.
  - `PokemonCatalogServiceTest`: `catalogReadsHiddenAbilitiesFromMetadata`, con una fila cuyo `metadata` trae la relación.
  - `GoldenCatalogsTest`:
    - `bulbasaur.hiddenAbilities()` es `["Clorofila"]`;
    - `vulpix-alola` es `["Nevada"]`;
    - en las 293 filas, `hiddenAbilities ⊆ abilities`.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*CatalogHiddenAbilitiesTest*' --tests '*PokemonCatalogServiceTest*' --tests '*GoldenCatalogsTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** el componente, el lector (siguiendo `CatalogPalette.from`) y la llamada en `toPokemon`.
- [ ] **Step 4: Completar el catálogo dorado.**
  1. Con la BD local sembrada (`npm run db:up` y, si hace falta, `npm run db:seed`), saca las ocultas de las 293 filas con `podman exec pokemonuniverse_postgres_1 psql -U pokemon -d pokemon_universe -Atc 'SELECT id, metadata->'"'"'abilityRelations'"'"' FROM "Pokemon"'`.
  2. Con un script de un solo uso en `/tmp`, que no se guarda, añade `"hiddenAbilities": [...]` a cada objeto de `pokemon`. Las claves van en orden alfabético, como el resto del fichero.
  3. Un id que no esté en la BD recibe `[]` y se anota en el commit.
- [ ] **Step 5: Ejecutar** el test del Step 2 y `./gradlew test --tests '*GoldenReplayTest*'` **sin** `-Dupdate`. Esperado: PASS, sin cambios en ninguna fixture, porque ningún motor lee el campo.
- [ ] **Step 6: Commit** con el mensaje `Catálogo: habilidades ocultas de cada Pokémon`.

### Task 2: Contrato compartido de Ability Hunt

**Files:**
- Create: `packages/shared/src/games/ability-hunt/config.ts`, `types.ts` y `rules.ts`
- Modify: `packages/shared/src/public.ts`
- Test: `packages/shared/src/games/ability-hunt/rules.test.ts`

**Interfaces:**
- Produces:
  - En `config.ts`:
    - `abilityHuntConfigSchema`, un `z.object({...}).strict()` con las claves y los límites de las Global Constraints;
    - `type AbilityHuntConfig`;
    - `defaultAbilityHuntConfig`.
  - En `types.ts`:
    - `AbilityHuntAbility { name: string; pokemonCount: number }`;
    - `AbilityHuntAttempt { playerId; guessedPokemon: { id; name; sprite }; attemptedAt }`;
    - `AbilityHuntWinner { playerId; pokemon: { id; name; sprite }; hidden: boolean; points: number; elapsedMs: number }`;
    - `AbilityHuntExample { id; name; sprite; hidden: boolean }`;
    - `AbilityHuntRoundResult { ability; winner: AbilityHuntWinner | null; examples: AbilityHuntExample[]; solves: Record<string, { solveOrder: number; points: number }>; attemptCounts: Record<string, number> }`;
    - `AbilityHuntPlayerStats { roundsWon; hiddenAbilityWins; totalAttempts; solveTimeTotalMs; bestTimeMs; pointsFromRounds }`;
    - `AbilityHuntPublicState`, con las claves de la spec en ese orden;
    - `AbilityHuntPlayerState { canGuess; solved; solveOrder: number | null; cooldownUntil: number | null; roundPoints; attemptCount; lastAttempt: { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number } | null }`;
    - `abilityHuntActionSchema = z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(64) }).strict()`.
  - En `rules.ts`:
    - `ABILITY_HUNT_POINTS = { normal: 100, hidden: 200 } as const`;
    - `ABILITY_HUNT_MIN_POKEMON_PER_ABILITY = 3`;
    - `abilityHuntScoringLabel(): string`, que devuelve `100 puntos; 200 si es su habilidad oculta`.

- [ ] **Step 1: Test que falla** en `rules.test.ts`:
  - el texto de `abilityHuntScoringLabel`;
  - el esquema rechaza `rounds: 21`, `roundSeconds: 14` y una clave desconocida;
  - el esquema normaliza `generations: [2, 1, 1]` a `[1, 2]`.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/src/games/ability-hunt`. Esperado: FAIL.
- [ ] **Step 3: Implementar,** siguiendo `whos-that-pokemon/{config,types,rules}.ts`, y exportar los tres módulos en `public.ts`.
- [ ] **Step 4: Ejecutar** el test del Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Ability Hunt: contrato compartido`.

### Task 3: Configuración, tipos y reglas en Java

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/abilityhunt/AbilityHuntConfig.java`, `AbilityHuntTypes.java` y `AbilityHuntRules.java`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/abilityhunt/AbilityHuntRulesTest.java`

**Interfaces:**
- Consumes: `Pokemon.hiddenAbilities()` de la Task 1, `Collations.names()` (`domain/text/Collations`), `Scoring.buildRankedResults` y `ConfigReader`.
- Produces:
  - `AbilityHuntConfig`:
    - `record AbilityHuntConfig(List<Integer> generations, int rounds, int roundSeconds, boolean includeRegionalForms)`;
    - `defaults()`;
    - `parse(JsonNode)`, con `ConfigReader.of(raw, "Ability Hunt")`, `strict(KEYS)`, `generations`, `integer` y `bool`.
  - En `AbilityHuntTypes`:
    - el estado `AbilityHuntState`, que implementa `TimedGameState` y tiene builder. Sus componentes son: `phase`, `config`, `playerIds`, `poolIds`, `abilityDeck`, `deckIndex`, `roundNumber`, `currentAbility`, `lockedDexNumbers`, `attempts`, `attemptCounts`, `cooldownUntil`, `lastAttemptResult`, `scores`, `playerStats`, `roundStartedAt`, `roundEndsAt`, `nextTransitionAt` y `lastRound`;
    - los records de proyección de la Task 2, con los mismos nombres;
    - `AbilityHuntPlayerStats`, con `ZERO`, `afterWrongAttempt()`, `afterWin(boolean hidden, long elapsedMs, int points)` y `toMap()`. `toMap()` lo usa `buildRankedResults` para las estadísticas de la clasificación y del perfil, con las claves en el orden del record;
    - `AbilityHuntAction.GuessPokemon(String pokemonId)`, con `parse(JsonNode)` estricto.
  - En `AbilityHuntRules`:
    - `static List<Pokemon> pool(AbilityHuntConfig config, PokemonCatalog catalog)`, sin los Pokémon con `abilities` vacío;
    - `static List<String> eligibleAbilities(List<Pokemon> pool)`, con las de al menos 3 Pokémon y orden `Collations.names()`;
    - `static Optional<String> availabilityIssue(AbilityHuntConfig config, List<Pokemon> pool)`, con los tres literales;
    - `static int points(Pokemon pokemon, String ability)`: 200 si la habilidad está en `hiddenAbilities` y 100 si no;
    - `static List<AbilityHuntExample> examples(List<Pokemon> pool, String ability, @Nullable String exceptId)`, con hasta 3 en orden del pool;
    - `static GameResults buildResults(AbilityHuntState state)`, que lanza `EngineException("Results are unavailable before the game finishes")` fuera de `GAME_RESULTS`.

- [ ] **Step 1: Tests que fallan** en `AbilityHuntRulesTest`, con `GoldenCatalogs.load("gen1-2")`:
  - `parsesTheStrictConfigWithItsLimits`: los límites, `10.0` y `10.5`, y una clave desconocida;
  - `eligibleAbilitiesNeedThreePokemon`: con la Gen 1 sin formas, salen 64 y todas tienen al menos 3 Pokémon;
  - `availabilityNeedsAsManyAbilitiesAsRounds`: con un catálogo sintético de 19 elegibles y 20 rondas, el literal lleva `n = 19`; sin Pokémon, sale el literal del pool;
  - `hiddenAbilityScoresDouble`: Bulbasaur con «Clorofila» da 200 y con «Espesura», 100;
  - `examplesSkipTheWinnerAndStopAtThree`;
  - `resultsOrderByPointsWinsHiddenThenId`.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*AbilityHuntRulesTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar,** siguiendo `whosthatpokemon/` y las convenciones del `README.md` de motores: builder, `frozenMap` y el orden de componentes igual al de las claves TS.
- [ ] **Step 4: Ejecutar** el test del Step 2. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Ability Hunt: configuración y reglas del motor`.

### Task 4: Pantallas de Ability Hunt

**Files:**
- Create: `frontend/src/games/ability-hunt/ConfigPanel.tsx` y `ConfigPanel.module.css`, copiados de `whos-that-pokemon/`
- Create: `frontend/src/games/ability-hunt/presentation.ts` y `AbilityHunt.module.css`
- Create: `frontend/src/room/AbilityHuntGame.tsx` y `AbilityHuntResults.tsx`
- Modify:
  - `frontend/src/games/registry.ts`: `clientModule({ id: 'ability-hunt', … })` al final;
  - `frontend/src/games/game-icons.ts`: `'ability-hunt': Crosshair` en `GAME_ICONS` y `'ability-hunt': 'ability-capsule'` en `GAME_ITEMS`;
  - `frontend/src/room/game-skip-slot.ts`: `'ability-hunt'` en `GAMES_WITH_SKIP_IN_SCREEN`.
- Test:
  - `frontend/src/room/AbilityHuntGame.test.tsx` y `frontend/src/games/ability-hunt/presentation.test.ts`;
  - `frontend/src/games/registry.test.ts`, `frontend/src/room/RoomSessionLayout.test.tsx` y `frontend/src/games/config-panel-ranges.test.tsx`, ampliados con el id.

**Interfaces:**
- Consumes: la Task 2 y el kit de adivinar (`GuessScreen`, `GuessClue`, `GuessPanel`, `GuessPlayersPanel`, `GuessAttemptsFeed`, `GuessRevealBoard`, `GuessRoundReveal`, `useGuessRound`, `guessScoreboard`, `guessRevealLines` y `guessSolvedOrders`). También `usePokemonPool({ generations, includeForms })` y `ResultsShell`/`ResultsRecords`.
- Produces:
  - `AbilityHuntGame({ room, selfId, onAction })`;
  - `AbilityHuntResults({ room, selfId, onLobby, onEnd })`;
  - `AbilityHuntConfigPanel({ config, disabled, onChange })`.
  - En `presentation.ts`:
    - `abilityHuntHeading(game, nameOf): string`;
    - `abilityHuntLocked(game): ReadonlySet<string>`, que une `lockedPokemonIds` y los ids de `attempts`;
    - `abilityHuntAnswer(lastRound): string`;
    - `abilityHuntStatsLine(stats): string`;
    - `abilityHuntRecords(standings, nameOf)`.

- [ ] **Step 1: Tests que fallan:**
  - `presentation.test.ts`:
    - las tres cabeceras (ronda, ganador y nadie);
    - `abilityHuntLocked` une los dos orígenes;
    - `abilityHuntAnswer` con ganador da su Pokémon y sin ganador, `${n} respuestas válidas`;
    - la línea de estadísticas.
  - `AbilityHuntGame.test.tsx`, con mocks de `RoomContext` y `usePokemonPool` como en `WhosThatPokemonGame.test.ts`:
    - `nunca pinta una respuesta válida en la ronda` (Review Focus 1): con un `lastRound` sobrante en `ROUND_ACTIVE`, el markup no contiene sus `examples`;
    - la pista muestra la habilidad, `${n} Pokémon la tienen` y `Habilidad oculta: puntos dobles`;
    - la revelación muestra la carta del ganador con `Habilidad oculta · ×2` y los ejemplos con `Oculta`;
    - hay exactamente un `aria-live`;
    - la clasificación pinta los récords.
  - `registry.test.ts`, `RoomSessionLayout.test.tsx` y `config-panel-ranges.test.tsx`: el id nuevo. Los rangos del panel son 1–20 y 15–60.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/games/ability-hunt frontend/src/room/AbilityHuntGame.test.tsx frontend/src/games/registry.test.ts frontend/src/games/game-icons.test.ts frontend/src/room/RoomSessionLayout.test.tsx frontend/src/games/config-panel-ranges.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar,** siguiendo `WhosThatPokemonGame.tsx` y `WhosThatPokemonResults.tsx`.
  - El nombre de la habilidad usa `var(--fs-34)` y, desde `lg`, `var(--fs-44)`, con la fuente de display, en `AbilityHunt.module.css`.
  - `locked` va al `selector` de `GuessPanel`, con `` inputLabel: `Buscar respuesta para la ronda ${game.roundNumber}` ``. Es la etiqueta que busca `buscadorRespuesta` en `juegos.spec.ts`.
  - La carta del ganador va primero en `answers` de `GuessRoundReveal`.
  - No hay `className` con valores arbitrarios ni `lucide-react` en JSX fuera de `ui/`: se usa `Icon`.
- [ ] **Step 4: Ejecutar** los tests del Step 2, `npx vitest run frontend/src/styles/global-classes.test.ts`, `npm run typecheck` y `npm run lint`. Esperado: PASS. Playwright se ejecuta en la Task 6: hasta la Task 5 el servidor no ofrece el juego. Va antes que el motor porque el lobby llama a `clientGameRegistry.get(game.id)` con cada juego de `availableGames` (`Lobby.tsx:171`), que lanza con un id sin módulo: un servidor con el juego y una web sin él romperían el lobby entre los dos commits.
- [ ] **Step 5: Commit** con el mensaje `Ability Hunt: pantalla, resultados y ajustes`.

### Task 5: Motor, registro y fixtures doradas

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/abilityhunt/AbilityHuntEngine.java`
- Modify: `backend/src/main/resources/games/registry.json`: entrada nueva al final, con `profileStats` y `defaultConfig` de la spec
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/out/resources/ClasspathGameRegistryLoader.java`: `engines.put(AbilityHuntEngine.ID, new AbilityHuntEngine(manifest(manifests, AbilityHuntEngine.ID)))`
- Create: `backend/src/test/resources/golden/ability-hunt/first-answer-wins.json`, `locks-and-errors.json`, `forms-and-presence.json` y `config-cases.json`
- Modify: `backend/src/test/resources/config-messages.json` (regenerado) y `backend/src/test/resources/gameconfigs/migration-cases.json` (dos casos a mano)
- Modify, por la cuenta de 28 a 29:
  - `GamesControllerTest.java:32`, `ProfileControllerTest.java:87` y `ClasspathGameRegistryLoaderTest.java:26,27,48`;
  - `StoredGameConfigMigrationTest.java:68`, `RoomCoordinatorTest.java:624,1479` y el comentario de `ConfigMessagesSnapshotTest.java:36`;
  - `README.md:61` y `docs/architecture.md` (líneas 6, 33, 61, 75 y 85).
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/abilityhunt/AbilityHuntEngineTest.java`

**Interfaces:**
- Consumes: las Tasks 1, 3 y 4 (el módulo de cliente ya existe), `Timing.advanceTimedRound`, `Timing.setPlayerCooldown`, `Timing.cooldownMessage` y `Randoms.shuffled`.
- Produces: `AbilityHuntEngine implements GameEngine<AbilityHuntConfig, AbilityHuntState, AbilityHuntAction, AbilityHuntPublicState>`, con:
  - `ID = "ability-hunt"`, `COOLDOWN_MS` y `REVEAL_MS`;
  - `checkAvailability`, que devuelve `AbilityHuntRules.availabilityIssue`;
  - `createInitialState`, que lanza con los literales y baraja el mazo completo;
  - `start`;
  - `handleAction`, con las comprobaciones en el orden de la spec;
  - `handleTimeout`, con `advanceTimedRound` y un `TimedRoundStrategy` `static final`;
  - `handlePresenceChange`, que devuelve el estado sin cambios;
  - `getPublicState` y `getPlayerState`;
  - `getLifecycle`, con `TimedLifecycle.builder(phase)`, `roundEndsAt`, `nextTransitionAt`, `roundStartedAt` y `roundNumber`;
  - `isFinished` y `getResults`.
  - `beginRound` avanza `deckIndex` hasta la primera habilidad con algún Pokémon de especie no bloqueada. Si no queda ninguna, termina la partida.

- [ ] **Step 1: Tests que fallan** en `AbilityHuntEngineTest`, con el catálogo dorado, un `random` fijo y un reloj controlado, como en `WhosThatPokemonEngineTest`:
  - `defaultConfigMatchesTheRegistryManifest` y `rejectsAManifestOfAnotherGame`;
  - `needsTwoPlayers`;
  - `firstCorrectAnswerEndsTheRound`: 100 puntos, `ROUND_RESULTS`, `lastRound.winner` con el Pokémon y `hidden: false`;
  - `hiddenAbilityScoresDouble`, en el motor;
  - `wrongAttemptIsPublicAndBlocksThatPokemonForTheRound`: el segundo jugador recibe `Ese Pokémon ya se ha dicho en esta ronda.`, sin espera;
  - `cooldownAfterAMiss`, con 2 s;
  - `winningSpeciesIsLockedWithItsForms`, con `includeRegionalForms: true` (Review Focus 2);
  - `secondCorrectAnswerAfterTheFirstIsRejected` (Review Focus 3);
  - `timeoutWithoutWinnerRevealsThreeExamples`;
  - `actionAfterTheDeadlineResolvesTheRound`;
  - `spectatorAndDisconnectedPlayersAreObserving`;
  - `skipsAbilitiesWithoutUnlockedPokemon`: un mazo forzado cuya siguiente habilidad solo tienen especies bloqueadas;
  - `activeProjectionsNeverContainAValidAnswer` (Review Focus 1): en cada `ROUND_ACTIVE` de una partida de 3 rondas, ni el JSON público ni el de cada jugador contienen el nombre de ningún Pokémon del pool con la habilidad, salvo los de `attempts`, que son fallos.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*AbilityHuntEngineTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor, la entrada de `registry.json` y el registro en `portedEngines`.
- [ ] **Step 4: Escribir las fixtures.** Cada una tiene al menos 3 rondas, un `seed` distinto, `catalog: "gen1-2"` y un `now` realista (por ejemplo, `1794000000000`).
  1. Escribe cada escenario solo con `start` y pasos `timeout`. Grábalo con `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'` y lee `publicState.ability.name` de cada ronda.
  2. Con `gen1-2.json`, elige las respuestas y añade los pasos `action`. Vuelve a grabar.
  - `first-answer-wins.json`, 3 jugadores y Gen 1:
    - un fallo;
    - el mismo Pokémon repetido por otro jugador, que se rechaza;
    - un intento en espera;
    - un acierto normal;
    - un acierto con habilidad oculta;
    - una ronda que termina por tiempo;
    - los resultados.
  - `locks-and-errors.json`, 3 jugadores y Gens 1 y 2:
    - un Pokémon fuera del pool;
    - una especie que ya ganó;
    - una acción después de `roundEndsAt`;
    - un espectador;
    - una acción no válida (`{ "type": "GUESS_POKEMON" }`), que detiene el escenario.
  - `forms-and-presence.json`, 4 jugadores, Gen 1 e `includeRegionalForms: true`:
    - una forma de Alola que acierta;
    - su especie de Kanto, que se rechaza en otra ronda;
    - un paso `presence` que desconecta a un jugador y lo deja observando.
    - Puede hacer falta probar varios `seed` hasta que la habilidad de alguna ronda la tenga una forma regional, por ejemplo «Manto Níveo» o «Gula». El rechazo de la especie de Kanto no depende de la habilidad de esa ronda: el bloqueo por especie se comprueba antes que la habilidad.
  - `config-cases.json`, con estas entradas:
    - la configuración por defecto;
    - `rounds` 0, 1, 20 y 21;
    - `roundSeconds` 14, 15, 60 y 61;
    - `rounds` 10.0 y 10.5;
    - `generations` `[2,1,1]` y `[]`;
    - `includeRegionalForms` ausente y `"sí"`;
    - una clave desconocida.
    El grabador corrige `valid` y añade `normalized`.
- [ ] **Step 5: Regenerar** `./gradlew test -Dupdate=true --tests '*ConfigMessagesSnapshotTest*'`.
- [ ] **Step 6: Añadir a mano** a `migration-cases.json`, con el formato de los casos existentes:
  - `ability-hunt: configuración válida sin cambios`;
  - `ability-hunt: clave obsoleta eliminada` (`"legacy": true`).
  Después, sube a 29 todas las cuentas fijas listadas en «Files».
- [ ] **Step 7: Ejecutar:**
  - `./gradlew test --tests '*AbilityHunt*' --tests '*GoldenReplayTest*' --tests '*GoldenRegistryConsistencyTest*' --tests '*ConfigMessagesSnapshotTest*' --tests '*StoredGameConfigMigrationTest*' --tests '*ClasspathGameRegistryLoaderTest*' --tests '*GamesControllerTest*' --tests '*ProfileControllerTest*' --tests '*RoomCoordinatorTest*' --tests '*GameModeConfigTest*'`;
  - `npx vitest run packages/shared/src/games/registry-defaults.test.ts packages/shared/src/games/config-cases.test.ts`.
  Esperado: PASS. En `git diff --stat backend/src/test/resources/golden/` solo salen ficheros nuevos de `ability-hunt/`.
- [ ] **Step 8: Commit** con el mensaje `Motor Ability Hunt con fixtures doradas`. Lleva el motor, el registro y las fixtures en el mismo commit, como pide el README de motores.

### Task 6: Ability Hunt en Playwright, capturas y rúbrica

**Files:**
- Modify: `e2e/tests/juegos.spec.ts`: `'ability-hunt'` en `SCREENSHOT_GAMES` y un test propio

**Interfaces:**
- Consumes: todo lo anterior y, de `e2e/src/helpers.ts`, `crearSalaConJugadores`, `seleccionarJuego`, `iniciarPartida`, `esperarPartida`, `psql`, `comprobarBdE2E` y `collectErrors`. También `capturarTamanos`, `capturarAnotando`, `buscadorRespuesta`, `adivinar` y `sinScorePop`, que ya están en `juegos.spec.ts`.

- [ ] **Step 1: Escribir el test** `ability-hunt: un fallo, un acierto con la habilidad, la revelación y la clasificación`. Usa 3 jugadores y la configuración de la Gen 1, con 2 rondas de 15 s, el mínimo, para que la ronda que acaba por tiempo no alargue el test. Hay tiempo de sobra para el fallo y el acierto, porque se ejecutan sin esperas.
  1. Lee la habilidad del título (`¿Quién tiene X?`).
  2. Con `psql`, busca un Pokémon de la Gen 1 que la tenga como normal y otro que no la tenga:
     `SELECT p.name, pa."isHidden" FROM "Pokemon" p JOIN "PokemonAbility" pa ON pa."pokemonId" = p.id JOIN "Ability" a ON a.id = pa."abilityId" WHERE a.name = :'habilidad' AND p.generation = 1 AND p."isDefault"`.
     Para el fallo, otra consulta da un Pokémon de la Gen 1 por defecto que **no** la tiene:
     `SELECT p.name FROM "Pokemon" p WHERE p.generation = 1 AND p."isDefault" AND NOT (:'habilidad' = ANY(p.abilities)) ORDER BY p."nationalDexNumber" LIMIT 1`.
  3. Un invitado prueba el que no la tiene. Se comprueba el fallo en `guess-attempt` y que, en el buscador del host, ese Pokémon sale bloqueado. Captura `juego-ability-hunt-ronda` a tres tamaños.
  4. El host acierta. Se comprueban la cabecera `¡Host… gana con …!`, `Habilidad normal` y que el ganador suma 100. Captura `juego-ability-hunt-revelacion` con `capturarAnotando`.
  5. La segunda ronda termina por tiempo. Se comprueba `Nadie encontró a tiempo`, con algún ejemplo visible.
  6. En la clasificación, captura `juego-ability-hunt-clasificacion` a tres tamaños.
  7. `collectErrors` vacío en las tres páginas. Ninguna página abre Socket.IO.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- juegos -g "ability-hunt"`. Recoge el test propio y el del bucle genérico. Esperado: PASS, con capturas a 1280×720, 1920×1080 y 390×844, y sin avisos de tamaños que falten. `capture()` va con sus valores por defecto: sin scroll horizontal ni de documento y `measureLayout` vacío a 13 px.
- [ ] **Step 3: Revisar las capturas** en `e2e/test-results/revision.html` y puntuar la ronda, la revelación y la clasificación con `docs/visual-review.md`. Mínimo 19/24 cada una y ningún criterio a 0.
- [ ] **Step 4: Verificación final,** sin suites completas:
  - `npm run typecheck` y `npm run lint`;
  - `cd backend && ./gradlew test --tests '*AbilityHunt*' --tests '*GoldenReplayTest*' --tests '*GoldenRegistryConsistencyTest*' --tests '*OpenApiSpecTest*'`. `OpenApiSpecTest` va porque `/api/games` lista un manifiesto más; las rutas no cambian.
  Esperado: todo en verde.
- [ ] **Step 5: Commit** con el mensaje `Ability Hunt: flujo en Playwright y capturas (rúbrica: ronda N/24, revelación N/24, clasificación N/24)`.
