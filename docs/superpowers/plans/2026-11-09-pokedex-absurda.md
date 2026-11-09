# Pokédex Absurda: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un minijuego nuevo, `absurd-pokedex`. Sale un Pokémon real y cada jugador escribe una entrada de Pokédex
inventada.
- En Clásico gana la más absurda por votación anónima.
- En `REAL_ENTRY` se mezcla la entrada oficial: hay que descubrirla y colar la propia.

**Architecture:**
- Motor Java nuevo en `domain/game/engines/absurdpokedex/`, calcado de La Frase (`pokemonredflag/`): fases con tiempo,
  borradores y votación anónima, sin la segunda vuelta de desempate.
- El tapado del nombre de Pokédex Entry Guess pasa a una utilidad de `domain/pokemon/` que comparten los dos juegos.
- Contrato en `packages/shared/src/games/absurd-pokedex/` y pantalla con el kit social (`frontend/src/room/social-kit`)
  de La Frase.

**Tech Stack:** Java 25, Micronaut 5, fixtures doradas; TypeScript, Zod, React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-pokedex-absurda-design.md`

## Global Constraints

- **Nada de suites completas; solo los tests de lo tocado.** Nada de `npm test`, `./gradlew check` ni `./gradlew test`
  sin `--tests`. Se usan `npx vitest run <ficheros>` y `./gradlew test --tests '<clase>'`, además de
  `npm run typecheck` y `npm run lint`.
- **Manifiesto** (`registry.json`):
  - `id: "absurd-pokedex"`, `name: "Pokédex Absurda"`, `icon: "📜"`, `minPlayers: 3` y `maxPlayers: 8`;
  - `description`: `Escribe la entrada de Pokédex más absurda para un Pokémon real, o cuela la tuya junto a la oficial.`
- **Configuración** (estricta, en este orden de claves). El nombre visible para `ConfigReader` es `"Pokédex Absurda"`.
  - `generations`: `pokemonGenerationsSchema`; por defecto, las 9;
  - `rounds`: entero de 1 a 10; por defecto, 5;
  - `writeSeconds`: entero de 30 a 120; por defecto, 60;
  - `voteSeconds`: entero de 15 a 60; por defecto, 30;
  - `mode`: `CLASSIC` o `REAL_ENTRY`, con `.default('CLASSIC')`.
- **Fases:** se usan las de `GamePhase` que ya existen, no nombres nuevos.
  - `ROUND_ACTIVE` es la escritura.
  - `VOTING` es el voto.
  - Después vienen `ROUND_RESULTS` y `GAME_RESULTS`.
  - Lo que la spec llama `WRITING` es `ROUND_ACTIVE`.
- **Constantes:**
  - `MAX_ENTRY_LENGTH = 150` y `REVEAL_MS = 8_000`;
  - en Clásico, `POINTS_PER_VOTE = 1` y `WIN_BONUS = 2`;
  - en `REAL_ENTRY`, `REAL_GUESS_POINTS = 2`, `FOOL_POINTS = 1` y `FUNNY_POINTS = 1`.
- **Literales del servidor**, idénticos en Java, en las fixtures y en los tests:
  - `La escritura ya ha terminado.`
  - `No puedes participar en esta ronda.`
  - `Ya has enviado tu entrada.`
  - `Escribe una entrada antes de enviarla.`
  - `La entrada no puede superar 150 caracteres.`
  - `La votación no está activa.`
  - `Esa entrada no existe.`
  - `No puedes votar tu propia entrada.`
  - `Ya has votado.`
  - `La más graciosa solo se vota en «¿Cuál es la real?».`
  - `La más graciosa tiene que ser una entrada inventada por otro jugador.`
  - `No hay Pokémon con entradas de Pokédex en las generaciones seleccionadas.`
  - `` `Solo hay ${n} Pokémon disponibles en estas generaciones: baja las rondas a ${n} o añade generaciones.` ``
  - `` `Se necesitan al menos ${minPlayers} jugadores.` ``
  - `Acción de Pokédex Absurda no válida.`
- **Textos de la web:**
  - `La más absurda` y `¿Cuál es la real?`;
  - `Escribe su entrada de Pokédex`;
  - `Tu entrada`;
  - `Es la real` y `😂 La más graciosa`;
  - `Entrada oficial · ${versionLabel}`;
  - `Engañó a ${nombres}`;
  - `Ronda sin suficientes entradas`.
- **Ids de entrada:** `entry-1` … `entry-n`. Se asignan después de barajar con `Randoms.shuffled` la lista de entradas:
  la oficial primero si existe y luego las inventadas en el orden de `playerIds`. Se muestran en orden de id, así que ni
  el orden ni el id delatan el autor ni cuál es la oficial.
- **Mazo:**
  - En Clásico, `forGenerations(generations, false)`.
  - En `REAL_ENTRY`, solo los Pokémon con alguna entrada de 150 caracteres o menos después de
    `PokedexEntryText.sanitize`.
  - Si el mazo tiene menos Pokémon que `rounds`, se usa el literal de «Solo hay ${n}…».
- **Votantes válidos:** los jugadores conectados de `playerIds`, igual que `allEligibleVoted` de La Frase, hayan
  enviado entrada o no. La fase de voto termina antes de tiempo cuando han votado todos.
- **Voto:** una sola acción `VOTE_ABSURD { entryId, funnyEntryId? }`, definitiva. En `REAL_ENTRY`, la pantalla deja
  marcar la graciosa antes de pulsar «Es la real», que envía las dos cosas juntas.
- **Ronda saltada:** si al cerrar la escritura hay menos de 2 entradas en Clásico, o ninguna inventada en
  `REAL_ENTRY`, se pasa directamente a `ROUND_RESULTS` con `skipped: true` y sin puntos.
- **Victoria de ronda:** se la llevan los jugadores con más puntos en la ronda, con al menos 1 punto. La cuentan
  `roundWins` y el desempate final.
- Las reglas de `AGENTS.md` y de `domain/game/engines/README.md`:
  - builder en los records de estado y en cualquier record de 8 o más componentes;
  - `Immutables.frozenMap` y `frozenList`;
  - `@Serdeable` y `@JsonInclude(ALWAYS)`;
  - el orden de los componentes es el orden de las claves;
  - comentarios en español;
  - UI solo con `frontend/src/ui/` y el kit social;
  - texto ≥ 13 px y objetivos táctiles ≥ 44 px;
  - una sola región viva y un solo dueño por error;
  - Playwright a tres tamaños y rúbrica ≥ 19/24.
- **`-Dupdate=true` regraba todas las fixtures del árbol.** Después de cada regrabación hay que mirar
  `git diff --stat backend/src/test/resources/golden/`: solo pueden salir ficheros de `absurd-pokedex/`. Si cambia
  otra, se para y se avisa, sin `git checkout` de nada ajeno.

## Review Focus

1. **Fuga antes de los resultados:** en `ROUND_ACTIVE` y `VOTING`, ni la proyección pública ni la de ningún jugador
   contienen `authorId`, `isReal`, `versionLabel` ni el borrador o la entrada de otro jugador. Lo comprueban
   `projectionsHideAuthorsAndTheRealEntryUntilResults` (Task 5) y `no pinta autores ni la oficial al votar` (Task 4).
2. **La oficial delatada por el nombre:** si un jugador escribe el nombre del Pokémon en su entrada, en `REAL_ENTRY` se
   ve `???`, igual que en la oficial. Lo comprueba `realEntryModeMasksTheNameInEveryEntry` (Task 5).
3. **Votar la propia entrada o la oficial como graciosa:** se rechazan con su literal y el voto no cuenta. Lo comprueba
   `rejectsOwnVotesAndInvalidFunnyVotes` (Task 5).
4. **Un jugador que se desconecta mientras se vota:** deja de contar como votante y la fase termina si ya han votado los
   demás. Lo comprueba `disconnectDuringVotingClosesTheVoteWhenTheRestVoted` (Task 5).
5. **Empate en Clásico:** las entradas empatadas con más votos reciben los +2, y con 0 votos nadie se lleva el bonus. Lo
   comprueba `classicTieGivesTheBonusToEveryTopEntry` (Task 3).

---

### Task 1: Tapado del nombre como utilidad compartida

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/pokemon/PokedexEntryText.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokedexentryguess/PokedexEntryGuessRules.java`
  - se mueven `sanitizePokedexEntry`, `aliasesFor`, `aliasPattern` y `collapseWhitespace`;
  - se deja `sanitizePokedexEntry` delegando, para no tocar a quien lo llama.
- Test: `backend/src/test/java/es/pokemonuniverse/domain/pokemon/PokedexEntryTextTest.java`

**Interfaces:**
- Produces: `PokedexEntryText.sanitize(String text, Pokemon pokemon): String`, con el mismo comportamiento byte a byte
  que el `sanitizePokedexEntry` actual.

- [ ] **Step 1: Test que falla** en `PokedexEntryTextTest`, con `GoldenCatalogs.load("gen1-2")`:
  - `"Pikachu  guarda\nelectricidad. PIKACHU."` con Pikachu da `"??? guarda electricidad. ???."`;
  - `"Pikachuelo"` no se tapa, porque va pegado a otra letra;
  - un alias de `names` (por ejemplo, el japonés) también se tapa.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*PokedexEntryTextTest*'`. Esperado: FAIL de
  compilación.
- [ ] **Step 3: Mover** el código a `PokedexEntryText` y dejar `PokedexEntryGuessRules.sanitizePokedexEntry`
  delegando.
- [ ] **Step 4: Ejecutar** `./gradlew test --tests '*PokedexEntryTextTest*' --tests '*PokedexEntryGuess*' --tests '*GoldenReplayTest*'`
  **sin** `-Dupdate`. Esperado: PASS, sin cambios en ninguna fixture.
- [ ] **Step 5: Commit** con el mensaje `Tapado de entradas de Pokédex como utilidad compartida`.

### Task 2: Contrato compartido

**Files:**
- Create: `packages/shared/src/games/absurd-pokedex/config.ts`, `types.ts` y `rules.ts`
- Modify:
  - `packages/shared/src/public.ts`: exporta los tres módulos;
  - `packages/shared/src/games/modes.ts`: `'absurd-pokedex'` en `GameModeId` y en `GAME_MODES`, con
    `labels: { CLASSIC: CLASSIC_MODE_LABEL, REAL_ENTRY: '¿Cuál es la real?' }` y
    `texts: { REAL_ENTRY: 'La entrada oficial se esconde entre las vuestras: descúbrela y cuela la tuya.' }`.
- Test:
  - `packages/shared/src/games/absurd-pokedex/rules.test.ts`;
  - `packages/shared/src/games/modes.test.ts`, ampliado con el juego.

**Interfaces:**
- Produces:
  - En `config.ts`:
    - `ABSURD_POKEDEX_MODES = ['CLASSIC', 'REAL_ENTRY'] as const` y `type AbsurdPokedexMode`;
    - `absurdPokedexConfigSchema`, `type AbsurdPokedexConfig` y `defaultAbsurdPokedexConfig`.
  - En `types.ts`:
    - `AbsurdPokedexPokemon { id; name; sprite; nationalDexNumber; types: string[] }`;
    - `AbsurdPokedexEntryView { id; text }`;
    - `AbsurdPokedexEntryResult { id; text; authorId: string | null; isReal: boolean; votesReceived: number; funnyVotesReceived: number; votedBy: string[]; funnyVotedBy: string[] }`;
    - `AbsurdPokedexRoundResult { mode; pokemon; skipped: boolean; entries: AbsurdPokedexEntryResult[]; realEntry: { id; versionLabel } | null; winnerPlayerIds: string[]; pointsAwarded: Record<string, number>; missingPlayerIds: string[] }`.
      Las entradas van ordenadas por `votesReceived` descendente y luego por id.
    - `AbsurdPokedexPlayerStats { roundsPlayed; entriesSubmitted; votesReceived; funnyVotesReceived; roundWins; realGuessed; playersFooled; pointsFromRounds }`;
    - `AbsurdPokedexPublicState`, con estas claves en este orden:
      - `gameId`, `phase`, `mode`, `roundNumber`, `totalRounds` y `pokemon`;
      - `playerIds`, `submittedPlayerIds` y `votedPlayerIds`;
      - `entries` (`AbsurdPokedexEntryView[]`, vacío fuera de `VOTING`);
      - `scores`, `roundEndsAt` y `nextTransitionAt`;
      - `lastRound` y `results`.
    - `AbsurdPokedexPlayerState`, una unión con `role: 'PLAYER' | 'SPECTATOR'` (como La Frase) y `canSubmit`,
      `ownDraft`, `ownEntry: { id: string | null; text } | null`, `canVote`, `ownVoteEntryId` y `ownFunnyEntryId`.
      `ownEntry.id` vale `null` hasta `VOTING`.
    - `absurdPokedexActionSchema`, una unión discriminada estricta con:
      - `UPDATE_ABSURD_DRAFT { text: max 150 }`;
      - `SUBMIT_ABSURD_ENTRY { text: trim, min 1, max 150 }`, con los literales de la entrada vacía y la larga;
      - `VOTE_ABSURD { entryId: 1–96, funnyEntryId?: 1–96 }`.
  - En `rules.ts`:
    - `ABSURD_POKEDEX_MAX_ENTRY_LENGTH = 150`;
    - `absurdPokedexScoringLabel(mode: AbsurdPokedexMode): string`. En `CLASSIC` devuelve
      `+1 por cada voto y +2 a la más votada.` En `REAL_ENTRY` devuelve
      `+2 si aciertas la oficial, +1 por cada jugador al que engañes y +1 por cada voto a la más graciosa.`

- [ ] **Step 1: Tests que fallan** en `rules.test.ts`:
  - los dos textos de puntuación;
  - el esquema rechaza `rounds: 11`, `writeSeconds: 29`, `voteSeconds: 61` y una clave desconocida;
  - una configuración sin `mode` sale con `CLASSIC`;
  - `SUBMIT_ABSURD_ENTRY` con `"   "` falla con `Escribe una entrada antes de enviarla.`
  - En `modes.test.ts`: `gameModeName('absurd-pokedex', 'REAL_ENTRY')` es `¿Cuál es la real?`
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/src/games/absurd-pokedex packages/shared/src/games/modes.test.ts`.
  Esperado: FAIL.
- [ ] **Step 3: Implementar,** siguiendo `pokemon-red-flag/{config,types,rules}.ts` y el `mode` de
  `pokemon-impostor/config.ts`.
- [ ] **Step 4: Ejecutar** el test del Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Pokédex Absurda: contrato compartido`.

### Task 3: Configuración, tipos y reglas en Java

**Files:**
- Create, en `backend/src/main/java/es/pokemonuniverse/domain/game/engines/absurdpokedex/`:
  `AbsurdPokedexConfig.java`, `AbsurdPokedexMode.java`, `AbsurdPokedexTypes.java` y `AbsurdPokedexRules.java`
- Modify: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/GameModeConfigTest.java`: añade
  `new Game("absurd-pokedex", AbsurdPokedexConfig::parse, AbsurdPokedexConfig.defaults(), "REAL_ENTRY")`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/absurdpokedex/AbsurdPokedexRulesTest.java`

**Interfaces:**
- Consumes: `PokedexEntryText.sanitize` (Task 1), `PokedexEntryPokemonCatalog`, `ConfigReader` y
  `Scoring.buildRankedResults`.
- Produces:
  - `enum AbsurdPokedexMode { CLASSIC, REAL_ENTRY }`.
  - `AbsurdPokedexConfig`:
    - `record AbsurdPokedexConfig(List<Integer> generations, int rounds, int writeSeconds, int voteSeconds, AbsurdPokedexMode mode)`;
    - `defaults()` y `parse(JsonNode)`.
  - En `AbsurdPokedexTypes`:
    - los records de la Task 2, con los mismos nombres y el mismo orden de componentes;
    - `AbsurdPokedexEntry(String id, String text, @Nullable String authorId, boolean isReal)`, que es interno y no
      sale en las proyecciones antes de los resultados;
    - el estado `AbsurdPokedexState`, que implementa `TimedGameState` y tiene builder. Sus componentes son: `phase`,
      `config`, `playerIds`, `pokemonDeckIds`, `roundNumber`, `currentPokemon`, `realEntry` (`{ text, versionLabel }`
      o `null`), `drafts`, `submissions` (de jugador a texto), `entries`, `votes`, `funnyVotes`, `scores`,
      `playerStats`, `roundEndsAt`, `nextTransitionAt` y `lastRound`;
    - `AbsurdPokedexPlayerStats.ZERO` y `toMap()`;
    - `AbsurdPokedexAction`: `UpdateDraft(String text)`, `SubmitEntry(String text)` y
      `Vote(String entryId, @Nullable String funnyEntryId)`, con `parse(JsonNode)` estricto.
  - En `AbsurdPokedexRules`:
    - `static List<Pokemon> pool(AbsurdPokedexConfig config, PokedexEntryPokemonCatalog catalog)`;
    - `static List<PokedexEntry> usableRealEntries(Pokemon pokemon, PokedexEntryPokemonCatalog catalog)`: las de 150
      caracteres o menos, ya tapadas;
    - `static Optional<String> availabilityIssue(AbsurdPokedexConfig config, List<Pokemon> pool)`;
    - `static AbsurdPokedexRoundResult score(AbsurdPokedexMode mode, Pokemon pokemon, List<AbsurdPokedexEntry> entries, Map<String,String> votes, Map<String,String> funnyVotes, @Nullable String versionLabel, List<String> missingPlayerIds)`,
      que es pura y aplica las constantes;
    - `static GameResults buildResults(AbsurdPokedexState state)`: ordena por puntos, luego por `roundWins` y luego por
      id, y lanza `EngineException` fuera de `GAME_RESULTS`.

- [ ] **Step 1: Tests que fallan** en `AbsurdPokedexRulesTest`:
  - `parsesTheStrictConfigWithItsLimits`: los límites, `10.0` y `10.5`, el `mode` ausente (sale `CLASSIC`) y una clave
    desconocida;
  - `classicScoresOnePerVotePlusTwoForTheTop`: tres entradas con 2, 1 y 0 votos dan +4, +1 y 0;
  - `classicTieGivesTheBonusToEveryTopEntry` (Review Focus 5): con 1 y 1 votos, las dos reciben +3. Con 0 votos en
    todas, nadie suma ni gana la ronda;
  - `realEntryScoresGuessFoolAndFunny`: con p1 que acierta la real, p2 que vota la de p3 como real y p1 que marca la de
    p3 como graciosa, p1 suma 2 y p3 suma 2;
  - `realEntryPoolNeedsAnEntryOfAtMost150Chars`: con el catálogo dorado, todo Pokémon del pool tiene alguna entrada
    usable y ninguna supera 150;
  - `availabilityNeedsAsManyPokemonAsRounds`.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*AbsurdPokedexRulesTest*' --tests '*GameModeConfigTest*'`.
  Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar,** siguiendo `pokemonredflag/` y el modo de `pokemonimpostor/`.
- [ ] **Step 4: Ejecutar** el test del Step 2. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Pokédex Absurda: configuración y reglas del motor`.

### Task 4: Pantalla, resultados y ajustes

**Files:**
- Create:
  - `frontend/src/games/absurd-pokedex/ConfigPanel.tsx`, copiado de `pokemon-red-flag/`, con el selector de modo como
    en `pokemon-impostor/ConfigPanel.tsx`;
  - `frontend/src/games/absurd-pokedex/presentation.ts` y `AbsurdPokedex.module.css`;
  - `frontend/src/room/AbsurdPokedexGame.tsx` y `AbsurdPokedexResults.tsx`.
- Modify:
  - `frontend/src/games/registry.ts`: el módulo nuevo al final;
  - `frontend/src/games/game-icons.ts`: un icono de `lucide-react` (`ScrollText`) y su objeto;
  - `frontend/src/room/game-skip-slot.ts`: si La Frase está en una de sus listas, el juego nuevo va en la misma.
- Test:
  - `frontend/src/room/AbsurdPokedexGame.test.tsx` y `frontend/src/games/absurd-pokedex/presentation.test.ts`;
  - `frontend/src/games/registry.test.ts`, `frontend/src/room/RoomSessionLayout.test.tsx` y
    `frontend/src/games/config-panel-ranges.test.tsx`, ampliados con el id.

**Interfaces:**
- Consumes: la Task 2, el kit social (`SocialScreen`, `SocialPlate`, `PhaseRail` y `ResponseProgress`) y
  `ResultsShell`/`ResultsRecords`, como en `PokemonRedFlagGame.tsx`.
- Produces:
  - `AbsurdPokedexGame({ room, selfId, onAction })`;
  - `AbsurdPokedexResults(…)`, con la firma de `PokemonRedFlagResults`;
  - `AbsurdPokedexConfigPanel({ config, disabled, onChange })`.
  - En `presentation.ts`:
    - `absurdModeTitle(mode): string`, que devuelve `La más absurda` o `¿Cuál es la real?`;
    - `fooledNames(entry, nameOf): string`, que devuelve `Engañó a Ana y Luis` o `''`;
    - `sortedRoundEntries(lastRound)`, con la oficial primero en `REAL_ENTRY` y luego por votos.
- Comportamiento:
  - **Escritura:**
    - ficha con el sprite, el nombre, `#número` y los `TypeBadge`;
    - `Textarea` con contador `n/150` y el borrador con *debounce*, como La Frase;
    - el botón Enviar;
    - `ResponseProgress` con quién ha enviado.
  - **Voto:**
    - una tarjeta por entrada; la propia lleva `Chip` «Tu entrada» y no tiene botones;
    - en `REAL_ENTRY`, «😂 La más graciosa» es un conmutador local (`aria-pressed`) y «Es la real» envía
      `VOTE_ABSURD` con la graciosa marcada;
    - en Clásico, un solo botón «La más absurda».
  - **Resultados:** las entradas de `sortedRoundEntries`, con autor, votos y, en `REAL_ENTRY`, la etiqueta
    `Entrada oficial · ${versionLabel}` y `Engañó a …`. Si la ronda se saltó, `Ronda sin suficientes entradas`.

- [ ] **Step 1: Tests que fallan:**
  - `presentation.test.ts`: los dos títulos, `fooledNames` con 0, 1 y 2 nombres y el orden de `sortedRoundEntries`.
  - `AbsurdPokedexGame.test.tsx`, con `renderToStaticMarkup` como `SketchmonGame.test.tsx`:
    - en la escritura salen la ficha y el contador `0/150`;
    - `no pinta autores ni la oficial al votar` (Review Focus 1): con un `lastRound` sobrante en `VOTING`, el markup no
      contiene `Entrada oficial` ni nombres de autor;
    - la entrada propia lleva «Tu entrada» y no tiene botón de voto;
    - en `REAL_ENTRY` salen los dos botones y en Clásico solo uno;
    - la revelación muestra `Entrada oficial · Pokémon Rojo` y `Engañó a Ana`;
    - hay exactamente un `aria-live`.
  - Los tres tests de registro, ampliados. Los rangos del panel son 1–10, 30–120 y 15–60.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/games/absurd-pokedex frontend/src/room/AbsurdPokedexGame.test.tsx frontend/src/games/registry.test.ts frontend/src/room/RoomSessionLayout.test.tsx frontend/src/games/config-panel-ranges.test.tsx`.
  Esperado: FAIL.
- [ ] **Step 3: Implementar,** siguiendo `PokemonRedFlagGame.tsx` y `PokemonRedFlagResults.tsx`. Si hace falta una
  tarjeta de entrada que no exista en `frontend/src/ui/`, se compone con `Card` y `Panel`. Nada de componentes nuevos
  de `ui/` en esta tarea.
- [ ] **Step 4: Ejecutar** los tests del Step 2, `npx vitest run frontend/src/styles/global-classes.test.ts`,
  `npm run typecheck` y `npm run lint`. Esperado: PASS. La web va antes que el motor por la misma razón que en Ability
  Hunt: el lobby lanza con un id sin módulo de cliente.
- [ ] **Step 5: Commit** con el mensaje `Pokédex Absurda: pantalla, resultados y ajustes`.

### Task 5: Motor, registro y fixtures doradas

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/absurdpokedex/AbsurdPokedexEngine.java`
- Modify:
  - `backend/src/main/resources/games/registry.json`: una entrada al final, con `profileStats` (las 8 métricas de
    `AbsurdPokedexPlayerStats` y la derivada `answerRate` = `entriesSubmitted` / `roundsPlayed`) y `defaultConfig`;
  - `backend/src/main/java/es/pokemonuniverse/adapters/out/resources/ClasspathGameRegistryLoader.java`: el motor nuevo
    en `portedEngines`.
- Create, en `backend/src/test/resources/golden/absurd-pokedex/`: `classic-votes-and-tie.json`,
  `real-entry-fool-and-funny.json`, `errors-and-presence.json` y `config-cases.json`
- Modify:
  - `backend/src/test/resources/config-messages.json` (regenerado) y
    `backend/src/test/resources/gameconfigs/migration-cases.json` (dos casos a mano);
  - las cuentas de 28 a 29: `GamesControllerTest.java:32`, `ProfileControllerTest.java:87`,
    `ClasspathGameRegistryLoaderTest.java:26,27,48`, `StoredGameConfigMigrationTest.java:68` y
    `AchievementCatalogTest.java:85`;
  - `README.md:61` y `docs/architecture.md:6,33,63,77,87`, que dicen «28».
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/absurdpokedex/AbsurdPokedexEngineTest.java`

**Interfaces:**
- Consumes: las Tasks 1, 3 y 4, `Timing`, `TimedLifecycle` y `Randoms.shuffled`/`contentDeck`.
- Produces: `AbsurdPokedexEngine implements GameEngine<…>`, con `ID = "absurd-pokedex"` y la misma superficie que
  `PokemonRedFlagEngine`:
  - `checkAvailability`, `createInitialState` y `start`;
  - `handleAction`, `handleTimeout` y `handlePresenceChange`;
  - `getPublicState`, `getPlayerState` y `getLifecycle`;
  - `isFinished` y `getResults`.
  - En `REAL_ENTRY`, `beginVoting` elige la oficial con `Randoms.randomItem` sobre `usableRealEntries` y tapa también
    las inventadas con `PokedexEntryText.sanitize`.

- [ ] **Step 1: Tests que fallan** en `AbsurdPokedexEngineTest`, con el catálogo dorado, un `random` fijo y un reloj
  controlado, como `PokemonRedFlagEngineTest`:
  - `defaultConfigMatchesTheRegistryManifest` y `needsThreePlayers`;
  - `writingEndsWhenEveryoneSubmitted` y `writingTimeoutGoesToVotingWithTheEntriesSoFar`;
  - `skipsTheRoundWithTooFewEntries`, en los dos modos;
  - `rejectsOwnVotesAndInvalidFunnyVotes` (Review Focus 3): la propia; la graciosa en Clásico; la graciosa apuntando a
    la oficial y a la propia; un id inexistente; votar dos veces;
  - `realEntryModeMasksTheNameInEveryEntry` (Review Focus 2);
  - `projectionsHideAuthorsAndTheRealEntryUntilResults` (Review Focus 1): en cada `ROUND_ACTIVE` y `VOTING` de una
    partida de 2 rondas, en el JSON público y en el de cada jugador no aparecen `authorId`, `isReal` ni `versionLabel`,
    ni el texto de otro jugador antes de `VOTING`;
  - `disconnectDuringVotingClosesTheVoteWhenTheRestVoted` (Review Focus 4);
  - `spectatorCannotWriteNorVote`;
  - `finalResultsRankByPointsThenRoundWins`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*AbsurdPokedexEngineTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor, la entrada de `registry.json` y el registro en `portedEngines`.
- [ ] **Step 4: Escribir las fixtures,** con `catalog: "gen1-2"`, un `seed` distinto en cada una y `now` realista.
  Hay que grabar primero, leer qué entradas salen y, si un paso depende de un id, ajustarlo y volver a grabar.
  - `classic-votes-and-tie.json`, 4 jugadores y 2 rondas:
    - borradores;
    - un jugador que no envía;
    - votos con empate arriba;
    - una ronda por tiempo.
  - `real-entry-fool-and-funny.json`, 3 jugadores, `REAL_ENTRY` y Gen 1:
    - una entrada inventada que contiene el nombre del Pokémon, para comprobar que sale `???`;
    - un acierto de la oficial;
    - un engaño;
    - un voto de graciosa.
  - `errors-and-presence.json`, 4 jugadores:
    - todos los literales de rechazo del motor;
    - un `presence` que desconecta a un jugador en `VOTING`;
    - una acción no válida (`{ "type": "VOTE_ABSURD" }`), que detiene el escenario.
  - `config-cases.json`, con estas entradas:
    - la configuración por defecto;
    - `rounds` 0, 1, 10 y 11;
    - `writeSeconds` 29, 30, 120 y 121;
    - `voteSeconds` 14, 15, 60 y 61;
    - `rounds` 5.0 y 5.5;
    - `generations` `[2,1,1]` y `[]`;
    - `mode` ausente, `REAL_ENTRY` y `"MIXED"`;
    - una clave desconocida.
- [ ] **Step 5: Regenerar** `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*' --tests '*ConfigMessagesSnapshotTest*'`.
  En `git diff --stat backend/src/test/resources/golden/` solo pueden salir ficheros de `absurd-pokedex/`.
- [ ] **Step 6: Añadir a mano** a `migration-cases.json`:
  - `absurd-pokedex: configuración válida sin cambios`;
  - `absurd-pokedex: clave obsoleta eliminada` (`"legacy": true`).
  Después, sube a 29 todas las cuentas listadas en «Files».
- [ ] **Step 7: Ejecutar:**
  - `./gradlew test --tests '*AbsurdPokedex*' --tests '*GoldenReplayTest*' --tests '*GoldenRegistryConsistencyTest*' --tests '*ConfigMessagesSnapshotTest*' --tests '*StoredGameConfigMigrationTest*' --tests '*ClasspathGameRegistryLoaderTest*' --tests '*GamesControllerTest*' --tests '*ProfileControllerTest*' --tests '*GameModeConfigTest*' --tests '*AchievementCatalogTest*' --tests '*OpenApiSpecTest*'`;
  - `npx vitest run packages/shared/src/games/registry-defaults.test.ts packages/shared/src/games/config-cases.test.ts`.
  Esperado: PASS.
- [ ] **Step 8: Commit** con el mensaje `Motor de Pokédex Absurda con fixtures doradas`. Lleva el motor, el registro y
  las fixtures en el mismo commit.

### Task 6: Playwright, capturas y rúbrica

**Files:**
- Modify: `e2e/tests/juegos.spec.ts`: `'absurd-pokedex'` en `SCREENSHOT_GAMES` y un test propio

**Interfaces:**
- Consumes: todo lo anterior y los ayudantes de `e2e/src/helpers.ts` y `juegos.spec.ts` (`crearSalaConJugadores`,
  `seleccionarJuego`, `iniciarPartida`, `capturarTamanos` y `collectErrors`).

- [ ] **Step 1: Escribir el test** `pokédex absurda: escribir, votar la más absurda y la real, y la clasificación`.
  Usa 3 jugadores, 1 ronda en Clásico y 1 en `REAL_ENTRY`, en dos partidas seguidas con el modo cambiado en el lobby.
  1. Clásico:
     - los tres escriben; una entrada propia no tiene botón de voto;
     - dos votan la misma;
     - en la revelación sale el autor con sus +2.
     - Captura `juego-absurd-pokedex-escribir`, `-votar` y `-revelacion`.
  2. `REAL_ENTRY`:
     - un jugador marca la graciosa y pulsa «Es la real»;
     - en la revelación sale `Entrada oficial · …`.
     - Captura `juego-absurd-pokedex-real`.
  3. En la clasificación, captura `juego-absurd-pokedex-clasificacion`. `collectErrors` queda vacío.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- juegos -g "absurd"`. Esperado: PASS, con las capturas a 1280×720,
  1920×1080 y 390×844, sin avisos de tamaños que falten y con `capture()` en sus valores por defecto.
- [ ] **Step 3: Revisar las capturas** en `e2e/test-results/revision.html` y puntuar escritura, voto, revelación y
  clasificación con `docs/visual-review.md`. Mínimo 19/24 cada una y ningún criterio a 0.
- [ ] **Step 4: Verificación final:** `npm run typecheck`, `npm run lint` y los `--tests` del Step 7 de la Task 5.
- [ ] **Step 5: Commit** con el mensaje
  `Pokédex Absurda: flujo en Playwright y capturas (rúbrica: escribir N/24, votar N/24, revelación N/24, clasificación N/24)`
  y `git push`.
