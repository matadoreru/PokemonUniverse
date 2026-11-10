# Traductor Unown: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un minijuego nuevo, `unown-translator`. Llega un nombre (de Pokémon o de movimiento) cifrado con glifos Unown
barajados por partida. Cada pocos segundos se revela una letra, que pasa al alfabeto de la partida, y gana más quien
descifra con menos letras a la vista.

**Architecture:**
- Motor Java nuevo en `domain/game/engines/unowntranslator/`, calcado de Zoomed Pokémon (`zoomedpokemon/`): ronda con
  avances por tiempo en `tickActive`, bloqueo tras fallo y aciertos en carrera.
- Las reglas puras (normalización, comparación, piezas, puntos y mazos) van en `UnownTranslatorRules`.
- Contrato en `packages/shared/src/games/unown-translator/`.
- Un componente nuevo de `ui/`, `UnownGlyph`, con los 26 dibujos en SVG, y la pantalla en `frontend/src/room/`.

**Tech Stack:** Java 25, Micronaut 5, fixtures doradas; TypeScript, Zod, React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-traductor-unown-design.md`

## Global Constraints

- **Nada de suites completas; solo los tests de lo tocado.** Nada de `npm test`, `./gradlew check` ni `./gradlew test`
  sin `--tests`. Se usan `npx vitest run <ficheros>` y `./gradlew test --tests '<clase>'`, además de
  `npm run typecheck` y `npm run lint`. Un solo trabajo pesado (Gradle o Playwright) a la vez.
- **Manifiesto** (`registry.json`):
  - `id: "unown-translator"`, `name: "Traductor Unown"`, `icon: "🔣"`, `minPlayers: 1` y `maxPlayers: 8`;
  - `description`: `Descifra nombres escritos con glifos Unown: cada pista revela una letra que ya no se olvida.`
- **Configuración** (estricta, en este orden de claves). El nombre visible para `ConfigReader` es `"Traductor Unown"`.
  - `generations`: `pokemonGenerationsSchema`; por defecto, las 9;
  - `rounds`: entero de 1 a 10; por defecto, 5;
  - `roundSeconds`: entero de 30 a 120; por defecto, 60;
  - `hintSeconds`: entero de 3 a 15; por defecto, 6;
  - `mode`: `CLASSIC` (se muestra «Pokémon») o `MOVES`, con `.default('CLASSIC')`.
- **Modos** en `games/modes.ts` y `GameModes.java`:
  - etiquetas `{ CLASSIC: 'Pokémon', MOVES: 'Movimientos' }`;
  - texto de `MOVES`: `Los mensajes son nombres de movimientos en lugar de Pokémon.`
- **Fases:** las de `GamePhase` que ya existen. `ROUND_ACTIVE` es lo que la spec llama `DECODING`; después vienen
  `ROUND_RESULTS` y `GAME_RESULTS`.
- **Constantes:**
  - `COOLDOWN_MS = 3_000` y `REVEAL_MS = 6_000`;
  - `MAX_GUESS_LENGTH = 40`;
  - `MIN_LETTERS = 3`;
  - `GLYPH_COUNT = 26`.
- **Normalización** (`UnownTranslatorRules.normalize`): NFD, quitar las marcas `\p{M}` (así Á→A y Ñ→N), y pasar a
  mayúsculas con `Locale.ROOT`. Las letras cifrables son solo `A`–`Z`. El resto de caracteres se queda como está.
- **Comparación** (`matches`): `normalize(guess)` y `normalize(message)`, quitando a los dos todo lo que no sea `A`–`Z`
  ni `0`–`9`, tienen que ser iguales.
- **Puntos:** al acertar, `1 + hiddenLetters`, donde `hiddenLetters` es el número de **posiciones** del mensaje
  normalizado con una letra `A`–`Z` que no está en el alfabeto en ese momento.
- **Clave:** `Randoms.shuffled(context.random(), 0..25)`; la letra `'A' + i` se cifra con el glifo `key[i]`. Se baraja
  una sola vez, en `start`.
- **Pistas:** la pista `k` (desde 1) toca en `roundStartedAt + k * hintSeconds * 1000`. En `tickActive`, por cada pista
  vencida se elige con `Randoms.randomItem(context.random(), …)` una letra entre las **distintas** ocultas del mensaje,
  ordenadas alfabéticamente, y se añade al final de `alphabet`. `nextTransitionAt` (y el `nextHintAt` público) es la
  hora de la siguiente pista, o `null` si ya no quedan letras ocultas o si esa hora es `>= roundEndsAt` (entonces
  `nextTransitionAt` es `roundEndsAt`, como en Zoomed). Solo las pistas añaden letras al alfabeto.
- **Mazos** (se calculan en `start`; se barajan con `Randoms.shuffled` y se toman las primeras `rounds`):
  - `CLASSIC` (Pokémon): `forGenerations(generations, false)`, con `pokemon.name()` como texto (el nombre que muestran los demás
    motores);
  - `MOVES`: para cada Pokémon de ese mazo, `levelUpMoves(id, Math.max(generations))`, con el nombre español como en
    `LearnsetGuessEngine.hint` (si está vacío, `move.name()`), sin repetir texto normalizado y en orden de primera
    aparición. Así el `totalRounds` real es `min(rounds, tamaño del mazo)`;
  - en los dos, solo mensajes con `MIN_LETTERS` letras `A`–`Z` o más tras normalizar.
- **Disponibilidad** (`checkAvailability`; nunca recorre los movimientos):
  - `CLASSIC` (Pokémon): el mazo filtrado tiene al menos `rounds` Pokémon;
  - `MOVES`: el catálogo es `LearnsetPokemonCatalog` y `forGenerations(generations, false)` no está vacío.
- **Fin de ronda:** cuando todos los jugadores con `context.isPlayerRequired` han acertado, o al llegar a
  `roundEndsAt = roundStartedAt + roundSeconds * 1000`. Después, `ROUND_RESULTS` durante `REVEAL_MS` con
  `Timing.advanceTimedRound`.
- **Clasificación final:** puntos; después, `solved`; después, id del jugador.
- **Literales del servidor**, idénticos en Java, en las fixtures y en los tests:
  - `No hay una ronda activa.`
  - `Estás observando esta ronda.`
  - `Ya lo has descifrado.`
  - `El tiempo ha terminado.` (como Zoomed: el rechazo también resuelve la ronda)
  - `Escribe una respuesta antes de enviarla.`
  - `La respuesta no puede superar 40 caracteres.`
  - `` `Solo hay ${n} Pokémon en esas generaciones.` ``
  - `No hay movimientos disponibles en esas generaciones.`
  - `Acción de Traductor Unown no válida.`
  - el del bloqueo es `Timing.cooldownMessage`.
- **Un fallo no es un rechazo:** se acepta, pone el bloqueo, suma el intento y deja `lastAttempt` en `INCORRECT`, como
  Zoomed.
- **Textos de la web:**
  - `Pokémon` y `Movimientos`;
  - `Descifra el mensaje`;
  - `Siguiente letra en ${s} s` y `No quedan letras por revelar`;
  - `¡Descifrado!` y `No es eso`;
  - `Nueva letra: ${letra}` en la región viva;
  - `Alfabeto` en la leyenda;
  - `glifo oculto` y `letra ${letra}` como etiquetas accesibles.
- Las reglas de `AGENTS.md` y de `domain/game/engines/README.md`:
  - builder en los records de estado y en cualquier record de 8 o más componentes;
  - `Immutables.frozenMap` y `frozenList`;
  - `@Serdeable` y `@JsonInclude(ALWAYS)`;
  - el orden de los componentes es el orden de las claves;
  - comentarios en español;
  - UI solo con `frontend/src/ui/`; un componente nuevo va primero en `/dev/ui`;
  - texto ≥ 13 px y objetivos táctiles ≥ 44 px;
  - una sola región viva y un solo dueño por error;
  - Playwright a tres tamaños y rúbrica ≥ 19/24.
- **`-Dupdate=true` regraba todas las fixtures del árbol.** Después de cada regrabación hay que mirar
  `git diff --stat backend/src/test/resources/golden/`: solo pueden salir ficheros de `unown-translator/`. Si cambia
  otra, se para y se avisa, sin `git checkout` de nada ajeno.

## Review Focus

1. **Fuga de la respuesta o de la clave:** en `ROUND_ACTIVE`, ni la proyección pública ni la de un jugador que no ha
   acertado contienen el texto del mensaje, su versión normalizada, el id del Pokémon o del movimiento, ni la letra de
   un glifo que no esté en `alphabet`. Lo comprueba `activeProjectionsLeakNeitherAnswerNorKey` (Task 5).
2. **Respuestas escritas a la española:** `pokémon`, `mr mime`, `Nidoran`, `farfetchd` o con espacios de más cuentan
   como acierto cuando corresponde. Lo comprueba `matchesIgnoresCaseAccentsSpacesAndSigns` (Task 2).
3. **Varias pistas vencidas en un solo tick** (servidor ocupado o reconexión): se revelan todas las que tocan, sin
   repetir letra, y `nextHintAt` queda en la siguiente hora futura. Lo comprueba `lateTickRevealsEveryDueHint` (Task 5).
4. **Un jugador que se desconecta mientras los demás ya han acertado:** la ronda termina sin esperarlo. Lo comprueba
   `disconnectEndsTheRoundWhenTheRestSolved` (Task 5).
5. **Mensaje largo en un móvil de 390 px:** las palabras no se parten entre líneas. Lo comprueba
   `longMessageKeepsWordsWhole` en `UnownTranslatorGame.test.tsx` (Task 4), con un estado de 3 palabras y 20 letras:
   cada palabra va en su propio bloque con la clase que impide partirla. La captura de `MOVES` a 390×844 (Task 6) mira
   el caso que salga, sin scroll horizontal.

---

### Task 1: Contrato compartido

**Files:**
- Create: `packages/shared/src/games/unown-translator/config.ts`, `types.ts` y `rules.ts`
- Modify:
  - `packages/shared/src/public.ts`: exporta los tres módulos;
  - `packages/shared/src/games/modes.ts`: `'unown-translator'` en `GameModeId` y en `GAME_MODES`, con las etiquetas y
    el texto de Global Constraints.
- Test:
  - `packages/shared/src/games/unown-translator/rules.test.ts`;
  - `packages/shared/src/games/modes.test.ts`, ampliado con el juego.

**Interfaces:**
- Produces:
  - En `config.ts`: `UNOWN_TRANSLATOR_MODES = ['CLASSIC', 'MOVES'] as const`, `type UnownTranslatorMode`,
    `unownTranslatorConfigSchema`, `type UnownTranslatorConfig` y `defaultUnownTranslatorConfig`.
  - En `types.ts`:
    - `UnownToken`, unión discriminada por `kind`:
      `{ kind: 'GLYPH'; glyph: number }`, `{ kind: 'LETTER'; glyph: number; letter: string }` y
      `{ kind: 'LITERAL'; text: string }` (`text`, no `char`, que es palabra reservada en Java);
    - `UnownAlphabetEntry { glyph: number; letter: string }`;
    - `UnownTranslatorPokemon { id; name; sprite; nationalDexNumber; types: string[] }`;
    - `UnownTranslatorMove { name; type; category }`;
    - `UnownTranslatorSolve { playerId; points; hiddenLetters; solvedAt }`;
    - `UnownTranslatorRoundResult { mode; answer; pokemon: UnownTranslatorPokemon | null; move: UnownTranslatorMove | null; solves: UnownTranslatorSolve[]; missingPlayerIds: string[] }`.
      `solves` va en orden de acierto. No lleva piezas: pintar glifo y letra juntos para todo el mensaje daría la clave
      entera, y solo las pistas pasan al alfabeto;
    - `UnownTranslatorPlayerStats { roundsPlayed; solved; missed; firstSolves; hiddenLettersAtSolve; pointsFromRounds }`;
    - `UnownTranslatorPublicState`, con estas claves en este orden: `gameId`, `phase`, `mode`, `roundNumber`,
      `totalRounds`, `playerIds`, `tokens`, `alphabet`, `solvedPlayerIds`, `roundPointsByPlayer`, `scores`,
      `roundEndsAt`, `nextHintAt`, `nextTransitionAt`, `lastRound` y `results`. Fuera de `ROUND_ACTIVE`, `tokens` va
      vacío;
    - `UnownTranslatorPlayerState`, una unión con `role: 'PLAYER' | 'SPECTATOR'`, y `canGuess`, `solved`,
      `answer: string | null`, `cooldownUntil: number | null`, `attemptCount` y
      `lastAttempt: { outcome: 'CORRECT' | 'INCORRECT'; at: number } | null`;
    - `unownTranslatorActionSchema`: `GUESS_UNOWN { text: trim, min 1, max 40 }`, estricta, con los literales de la
      respuesta vacía y la larga.
  - En `rules.ts`:
    - `UNOWN_GLYPH_COUNT = 26` y `UNOWN_MAX_GUESS_LENGTH = 40`;
    - `unownTranslatorScoringLabel(): string`, que devuelve
      `1 punto por descifrar y 1 más por cada letra que siguiera oculta.`

- [ ] **Step 1: Tests que fallan** en `rules.test.ts`:
  - el texto de puntuación;
  - el esquema rechaza `rounds: 11`, `roundSeconds: 29`, `hintSeconds: 16` y una clave desconocida;
  - una configuración sin `mode` sale con `CLASSIC`;
  - `GUESS_UNOWN` con `"   "` falla con `Escribe una respuesta antes de enviarla.` y con 41 caracteres, con
    `La respuesta no puede superar 40 caracteres.`;
  - en `modes.test.ts`: `gameModeName('unown-translator', 'MOVES')` es `Movimientos`.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/src/games/unown-translator packages/shared/src/games/modes.test.ts`.
  Esperado: FAIL.
- [ ] **Step 3: Implementar,** siguiendo `zoomed-pokemon/{config,types}.ts` y el `mode` de `absurd-pokedex/config.ts`.
- [ ] **Step 4: Ejecutar** el test del Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Traductor Unown: contrato compartido`.

### Task 2: Configuración, tipos y reglas en Java

**Files:**
- Create, en `backend/src/main/java/es/pokemonuniverse/domain/game/engines/unowntranslator/`:
  `UnownTranslatorConfig.java`, `UnownTranslatorMode.java`, `UnownTranslatorTypes.java` y
  `UnownTranslatorRules.java`
- Modify: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/GameModeConfigTest.java`: añade
  `new Game("unown-translator", UnownTranslatorConfig::parse, UnownTranslatorConfig.defaults(), "MOVES")`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/unowntranslator/UnownTranslatorRulesTest.java`

**Interfaces:**
- Consumes: `ConfigReader`, `PokemonCatalog`, `LearnsetPokemonCatalog` y `Scoring.buildRankedResults`.
- Produces:
  - `enum UnownTranslatorMode { CLASSIC, MOVES }`.
  - `record UnownTranslatorConfig(List<Integer> generations, int rounds, int roundSeconds, int hintSeconds, UnownTranslatorMode mode)`,
    con `defaults()` y `parse(JsonNode)`.
  - En `UnownTranslatorTypes`:
    - los records de la Task 1, con los mismos nombres y el mismo orden de componentes;
    - `UnownToken` como `PokedexEntryGuessHint`: interfaz sellada con `String kind()` y los records `Glyph(String kind, int glyph)`,
      `Letter(String kind, int glyph, String letter)` y `Literal(String kind, String text)`, cada uno con `kind` primero,
      `@Serdeable`, `@JsonInclude(ALWAYS)` y un constructor corto que fija `"GLYPH"`, `"LETTER"` o `"LITERAL"`;
    - `UnownMessage(String text, String normalized, @Nullable String pokemonId, @Nullable UnownTranslatorMove move)`,
      interno: nunca sale en una proyección de `ROUND_ACTIVE`;
    - el estado `UnownTranslatorState`, que implementa `TimedGameState` y tiene builder. Sus componentes son: `phase`,
      `config`, `playerIds`, `key` (`List<Integer>`, 26), `messages` (`List<UnownMessage>`, ya elegidos), `roundNumber`,
      `alphabet` (`List<String>`, letras en orden de descubrimiento), `hintsGiven`, `solves`
      (jugador → `UnownTranslatorSolve`, en orden de acierto), `attemptCounts`, `lastAttemptResult`, `cooldownUntil`,
      `scores`, `playerStats`, `roundStartedAt`, `roundEndsAt`, `nextTransitionAt` y `lastRound`;
    - `UnownTranslatorPlayerStats.ZERO` y `toMap()`;
    - `UnownTranslatorAction.Guess(String text)`, con `parse(JsonNode)` estricto.
  - En `UnownTranslatorRules`, todo `static` y puro:
    - `String normalize(String text)`;
    - `boolean matches(String guess, String normalizedMessage)`;
    - `int letterCount(String normalized)`;
    - `List<UnownToken> tokens(String normalized, List<Integer> key, Collection<String> alphabet)`;
    - `int hiddenLetters(String normalized, Collection<String> alphabet)`;
    - `List<String> hiddenDistinctLetters(String normalized, Collection<String> alphabet)`, ordenada;
    - `int solvePoints(int hiddenLetters)`, que devuelve `1 + hiddenLetters`;
    - `List<UnownMessage> pokemonDeck(UnownTranslatorConfig config, PokemonCatalog catalog)`;
    - `List<UnownMessage> moveDeck(UnownTranslatorConfig config, LearnsetPokemonCatalog catalog)`;
    - `Optional<String> availabilityIssue(UnownTranslatorConfig config, PokemonCatalog catalog)`, sin llamar a
      `moveDeck`;
    - `GameResults buildResults(UnownTranslatorState state)`, que lanza `EngineException` fuera de `GAME_RESULTS`.

- [ ] **Step 1: Tests que fallan** en `UnownTranslatorRulesTest`, con `GoldenCatalogs.load("gen1-2")`:
  - `parsesTheStrictConfigWithItsLimits`: los límites, `10.0` y `10.5`, el `mode` ausente (sale `CLASSIC`) y una clave
    desconocida;
  - `normalizeStripsAccentsAndKeepsLiterals`: `"Puño Fuego"` da `"PUNO FUEGO"`, `"Nidoran♀"` da `"NIDORAN♀"` y
    `"Mr. Mime"` da `"MR. MIME"`;
  - `matchesIgnoresCaseAccentsSpacesAndSigns` (Review Focus 2): `"mr mime"` acierta `"MR. MIME"`, `" puño  fuego "`
    acierta `"PUNO FUEGO"`, `"farfetchd"` acierta `"FARFETCH'D"` y `"pikach"` no acierta `"PIKACHU"`;
  - `tokensHideUnknownLettersAndKeepLiterals`: con una clave fija y el alfabeto `[P]`, `"PIKA-2"` da `LETTER P`, tres
    `GLYPH` con `key[letra]`, `LITERAL -` y `LITERAL 2`;
  - `pointsCountHiddenPositions`: `"PIPI"` con el alfabeto `[P]` tiene 2 ocultas y vale 3; con todo descubierto vale 1;
  - `decksKeepOnlyMessagesWithThreeLetters`: los dos mazos sobre el catálogo dorado, sin textos normalizados
    repetidos en el de movimientos y todos con `letterCount >= 3`;
  - `availabilityNeedsAsManyPokemonAsRounds` y `movesNeedALearnsetCatalog`.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*UnownTranslatorRulesTest*' --tests '*GameModeConfigTest*'`.
  Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar,** siguiendo `zoomedpokemon/` (config, tipos, `ZoomedPokemonRules`) y el modo de
  `absurdpokedex/`.
- [ ] **Step 4: Ejecutar** el test del Step 2. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Traductor Unown: configuración y reglas del motor`.

### Task 3: Componente `UnownGlyph`

**Files:**
- Create: `frontend/src/ui/UnownGlyph.tsx`, `frontend/src/ui/UnownGlyph.module.css` y
  `frontend/src/ui/UnownGlyph.test.tsx`
- Modify: `frontend/src/ui/index.ts` (exporta el componente) y la galería de `frontend/src/ui/dev/` (una sección
  «Glifos Unown» con los 26 y los tres estados)

**Interfaces:**
- Produces: `UnownGlyph({ glyph, letter, size = 'md', className })`.
  - `glyph: number` (0–25); fuera de rango no dibuja nada y devuelve `null`;
  - `letter?: string`: si viene, se muestra debajo del glifo y la etiqueta accesible es `letra ${letter}`; si no,
    `glifo oculto`;
  - `size: 'sm' | 'md' | 'lg'`;
  - el SVG usa `currentColor` y `viewBox="0 0 48 48"`, con `role="img"`.
- Los 26 dibujos son trazos propios inspirados en los Unown: un ojo central (un círculo con su pupila) y trazos
  gruesos y redondeados alrededor, todos distintos entre sí. El dibujo `i` se basa en la forma de la letra `'A' + i`,
  pero la clave barajada hace que eso no delate nada. Se guardan como una tabla de `path` en el propio fichero.

- [ ] **Step 1: Tests que fallan** en `UnownGlyph.test.tsx`, con `renderToStaticMarkup`:
  - los 26 índices dibujan un `<svg` y los 26 `d` son distintos;
  - `glyph={26}` y `glyph={-1}` dan markup vacío;
  - sin `letter`, la etiqueta es `glifo oculto`; con `letter="P"`, `letra P`, y la P se ve.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/ui/UnownGlyph.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar** el componente, con CSS Modules sobre `tokens.css`; la letra va con la escala `text-13` o
  mayor.
- [ ] **Step 4: Ejecutar** el test del Step 2, `npx vitest run frontend/src/styles/global-classes.test.ts`,
  `npm run typecheck` y `npm run lint`. Abrir `/dev/ui` con Playwright y mirar la sección a 1280×720 y 390×844: los
  26 se distinguen a simple vista.
- [ ] **Step 5: Commit** con el mensaje `Arcade DS: glifos Unown`.

### Task 4: Pantalla, resultados y ajustes

**Files:**
- Create:
  - `frontend/src/games/unown-translator/ConfigPanel.tsx`, con el selector de modo como `absurd-pokedex/ConfigPanel.tsx`
    y los rangos de Global Constraints;
  - `frontend/src/games/unown-translator/presentation.ts` y `UnownTranslator.module.css`;
  - `frontend/src/room/UnownTranslatorGame.tsx` y `UnownTranslatorResults.tsx`.
- Modify:
  - `frontend/src/games/registry.ts`: el módulo nuevo al final;
  - `frontend/src/games/game-icons.ts`: `Languages` de `lucide-react` en `GAME_ICONS` y `'unown-report'` en
    `GAME_ITEMS`;
  - `frontend/src/room/game-skip-slot.ts`: el id en `GAMES_WITH_SKIP_IN_SCREEN`.
- Test:
  - `frontend/src/room/UnownTranslatorGame.test.tsx` y `frontend/src/games/unown-translator/presentation.test.ts`;
  - `frontend/src/games/registry.test.ts`, `frontend/src/room/RoomSessionLayout.test.tsx` y
    `frontend/src/games/config-panel-ranges.test.tsx`, ampliados con el id.

**Interfaces:**
- Consumes: la Task 1, `UnownGlyph` (Task 3) y la estructura de `ZoomedPokemonGame.tsx` y
  `ZoomedPokemonResults.tsx` (campo de respuesta, bloqueo, `ResultsShell`).
- Produces:
  - `UnownTranslatorGame({ room, selfId, onAction })`;
  - `UnownTranslatorResults(…)`, con la firma de `ZoomedPokemonResults`;
  - `UnownTranslatorConfigPanel({ config, disabled, onChange })`.
  - En `presentation.ts`:
    - `splitWords(tokens: UnownToken[]): UnownToken[][]`, que corta por los `LITERAL` de espacio y no los incluye;
    - `newLetters(previous: UnownAlphabetEntry[], next: UnownAlphabetEntry[]): string[]`, para la región viva;
    - `hintCountdownLabel(nextHintAt: number | null, now: number): string`, que devuelve `Siguiente letra en ${s} s` o
      `No quedan letras por revelar`.
- Comportamiento:
  - **Ronda:**
    - el mensaje con `UnownGlyph` `lg` (y `md` en móvil); cada palabra en un bloque que no se parte, y las palabras
      sí bajan de línea;
    - el campo de respuesta con Enviar, desactivado mientras dure `cooldownUntil`, con `No es eso` tras un fallo;
    - quien ya acertó ve `¡Descifrado!` y su `answer`, sin el campo;
    - la cuenta atrás de la ronda y `hintCountdownLabel`;
    - la leyenda `Alfabeto` con los 26 glifos `sm` en orden de índice, con la letra de los que estén en `alphabet`;
    - quién ha acertado, con sus puntos de la ronda.
  - **Región viva:** anuncia `Nueva letra: P` por cada letra nueva de `newLetters` y `¡Descifrado!` al acertar uno
    mismo.
  - **Resultados de ronda y final:** `answer` grande, con el sprite, el número y los tipos del Pokémon, o el tipo y la
    categoría del movimiento; los `solves` en orden, con puntos y letras ocultas; quién no lo descifró.

- [ ] **Step 1: Tests que fallan:**
  - `presentation.test.ts`: `splitWords` con `PUNO FUEGO`, `newLetters` con una y dos nuevas, y los dos textos de
    `hintCountdownLabel`.
  - `UnownTranslatorGame.test.tsx`, con `renderToStaticMarkup` como `AbsurdPokedexGame.test.tsx`:
    - en la ronda salen tantos `glifo oculto` como `GLYPH` haya y la letra de cada `LETTER`;
    - con `cooldownUntil` en el futuro, el botón está desactivado y sale `No es eso`;
    - con `solved` sale `¡Descifrado!` con la respuesta, y no hay campo;
    - la leyenda tiene 26 glifos;
    - los resultados de `CLASSIC` (Pokémon) muestran el sprite y los de `MOVES`, el tipo;
    - hay exactamente un `aria-live`;
    - `longMessageKeepsWordsWhole` (Review Focus 5).
  - Los tres tests de registro, ampliados. Los rangos del panel son 1–10, 30–120 y 3–15.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/games/unown-translator frontend/src/room/UnownTranslatorGame.test.tsx frontend/src/games/registry.test.ts frontend/src/room/RoomSessionLayout.test.tsx frontend/src/games/config-panel-ranges.test.tsx`.
  Esperado: FAIL.
- [ ] **Step 3: Implementar.** Solo componentes de `frontend/src/ui/`; nada de componentes nuevos de `ui/` en esta
  tarea, aparte del de la Task 3.
- [ ] **Step 4: Ejecutar** los tests del Step 2, `npx vitest run frontend/src/styles/global-classes.test.ts`,
  `npm run typecheck` y `npm run lint`. Esperado: PASS. La web va antes que el motor porque el lobby lanza con un id
  sin módulo de cliente.
- [ ] **Step 5: Commit** con el mensaje `Traductor Unown: pantalla, resultados y ajustes`.

### Task 5: Motor, registro y fixtures doradas

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/unowntranslator/UnownTranslatorEngine.java`
- Modify:
  - `backend/src/main/resources/games/registry.json`: una entrada al final, con `profileStats` (las 6 métricas de
    `UnownTranslatorPlayerStats` y la derivada `solveRate`, `PERCENT`, con `solved` / [`solved`, `missed`]) y
    `defaultConfig`;
  - `backend/src/main/java/es/pokemonuniverse/adapters/out/resources/ClasspathGameRegistryLoader.java`: el motor en
    `portedEngines`;
  - `backend/src/main/java/es/pokemonuniverse/domain/room/GameModes.java`: los modos del juego (y su caso en
    `GameModesTest`).
- Create, en `backend/src/test/resources/golden/unown-translator/`: `pokemon-hints-and-solves.json`,
  `moves-and-persistent-alphabet.json`, `errors-and-presence.json` y `config-cases.json`
- Modify:
  - `backend/src/test/resources/config-messages.json` (regenerado) y
    `backend/src/test/resources/gameconfigs/migration-cases.json` (dos casos a mano);
  - las cuentas de juegos de 29 a 30: `GamesControllerTest`, `ProfileControllerTest`,
    `ClasspathGameRegistryLoaderTest` (tres asserts), `StoredGameConfigMigrationTest` (assert y comentario) y
    `RoomCoordinatorTest` (dos asserts);
  - los logros: 49 → 50 en `AchievementsControllerTest` (tres asserts), `PublicProfileControllerTest` y
    `AchievementCatalogTest` (con el nombre `hasFiftyUniqueIds` y su comentario), la familia `GAME` 35 → 36 y las
    victorias 29 → 30;
  - `README.md:61` y `docs/architecture.md:6,33,63,77,87`, que dicen «29».
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/unowntranslator/UnownTranslatorEngineTest.java`

**Interfaces:**
- Consumes: las Tasks 1, 2 y 4, `Timing`, `TimedLifecycle`, `TimedRoundStrategy` y `Randoms`.
- Produces: `UnownTranslatorEngine implements GameEngine<…>`, con `ID = "unown-translator"` y la misma superficie
  que `ZoomedPokemonEngine` (sin `resolveAsset`):
  - `checkAvailability`, `createInitialState` y `start` (baraja la clave y elige los mensajes);
  - `handleAction`, `handleTimeout` (con `tickActive` para las pistas) y `handlePresenceChange`;
  - `getPublicState`, `getPlayerState` y `getLifecycle`;
  - `isFinished` y `getResults`.
  - `getPlayerState` solo rellena `answer` (el texto original) si ese jugador tiene `solve`.

- [ ] **Step 1: Tests que fallan** en `UnownTranslatorEngineTest`, con el catálogo dorado, un `random` fijo y un reloj
  controlado, como `ZoomedPokemonEngineTest`:
  - `defaultConfigMatchesTheRegistryManifest` y `soloGameIsAllowed`;
  - `hintsArriveOnScheduleAndStopWhenNothingIsHidden`, incluido que `nextHintAt` es `null` cuando la siguiente pista
    caería en `roundEndsAt` o después;
  - `lateTickRevealsEveryDueHint` (Review Focus 3);
  - `alphabetPersistsAcrossRoundsAndOnlyGrowsWithHints`: tras una ronda resuelta, la siguiente empieza con el mismo
    `alphabet`, sin las letras no reveladas del mensaje anterior;
  - `wrongGuessStartsTheCooldownAndIsAccepted` y `guessDuringCooldownIsRejected`;
  - `solveScoresOnePlusHiddenLettersAndBlocksASecondGuess`;
  - `roundEndsWhenEveryoneSolvedOrOnTimeout`;
  - `disconnectEndsTheRoundWhenTheRestSolved` (Review Focus 4);
  - `activeProjectionsLeakNeitherAnswerNorKey` (Review Focus 1): en cada `ROUND_ACTIVE` de una partida de 2 rondas,
    el JSON público y el de cada jugador sin acierto no contienen `normalized`, el texto ni el id del mensaje; los
    `glyph` de los `GLYPH` no aparecen en `alphabet`; quien acertó sí recibe `answer`;
  - `movesModeUsesMoveNamesAndShortensTheGame`;
  - `spectatorCannotGuess` y `finalResultsRankByPointsThenSolved`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*UnownTranslatorEngineTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor, la entrada de `registry.json`, `portedEngines` y `GameModes.java`.
- [ ] **Step 4: Escribir las fixtures,** con `catalog: "gen1-2"`, un `seed` distinto en cada una y `now` realista.
  Hay que grabar primero, leer qué mensaje sale y, si un paso depende de él, ajustarlo y volver a grabar.
  - `pokemon-hints-and-solves.json`, 3 jugadores y 2 rondas: ticks con pistas, un fallo con bloqueo, un intento
    durante el bloqueo, aciertos con distintas letras ocultas y una ronda que termina por tiempo.
  - `moves-and-persistent-alphabet.json`, 2 jugadores, `MOVES` y 3 rondas: el alfabeto se mantiene de una ronda a
    otra y una respuesta con tilde acierta.
  - `errors-and-presence.json`, 3 jugadores: todos los literales de rechazo, un `presence` que desconecta a quien no
    ha acertado cuando los demás sí, y una acción no válida (`{ "type": "GUESS_UNOWN" }`), que detiene el escenario.
  - `config-cases.json`, con estas entradas:
    - la configuración por defecto;
    - `rounds` 0, 1, 10 y 11;
    - `roundSeconds` 29, 30, 120 y 121;
    - `hintSeconds` 2, 3, 15 y 16;
    - `rounds` 5.0 y 5.5;
    - `generations` `[2,1,1]` y `[]`;
    - `mode` ausente, `MOVES` y `"WORDS"`;
    - una clave desconocida.
- [ ] **Step 5: Regenerar** `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*' --tests '*ConfigMessagesSnapshotTest*'`.
  En `git diff --stat backend/src/test/resources/golden/` solo pueden salir ficheros de `unown-translator/`.
- [ ] **Step 6: Añadir a mano** a `migration-cases.json`:
  - `unown-translator: configuración válida sin cambios`;
  - `unown-translator: clave obsoleta eliminada` (`"legacy": true`).
  Después, sube todas las cuentas listadas en «Files».
- [ ] **Step 7: Ejecutar:**
  - `./gradlew test --tests '*UnownTranslator*' --tests '*GoldenReplayTest*' --tests '*GoldenRegistryConsistencyTest*' --tests '*ConfigMessagesSnapshotTest*' --tests '*StoredGameConfigMigrationTest*' --tests '*ClasspathGameRegistryLoaderTest*' --tests '*GamesControllerTest*' --tests '*ProfileControllerTest*' --tests '*PublicProfileControllerTest*' --tests '*AchievementsControllerTest*' --tests '*RoomCoordinatorTest*' --tests '*GameModeConfigTest*' --tests '*GameModesTest*' --tests '*AchievementCatalogTest*' --tests '*OpenApiSpecTest*'`;
  - `npx vitest run packages/shared/src/games/registry-defaults.test.ts packages/shared/src/games/config-cases.test.ts`.
  Esperado: PASS.
- [ ] **Step 8: Commit** con el mensaje `Motor de Traductor Unown con fixtures doradas`. Lleva el motor, el registro y
  las fixtures en el mismo commit.

### Task 6: Playwright, capturas y rúbrica

**Files:**
- Modify: `e2e/tests/juegos.spec.ts`: `'unown-translator'` en `SCREENSHOT_GAMES` y un test propio

**Interfaces:**
- Consumes: todo lo anterior y los ayudantes de `e2e/src/helpers.ts` y `juegos.spec.ts` (`crearSalaConJugadores`,
  `seleccionarJuego`, `iniciarPartida`, `capturarTamanos` y `collectErrors`).

- [ ] **Step 1: Escribir el test** `traductor unown: pistas, fallo, acierto y clasificación`. Usa 2 jugadores, 2
  rondas en `CLASSIC` (Pokémon) con `roundSeconds: 60` y `hintSeconds: 3`, y después una partida de 1 ronda en `MOVES`.
  1. `CLASSIC` (Pokémon):
     - se espera a la primera pista y se comprueba que aparece una letra;
     - un jugador falla y ve `No es eso` con el botón desactivado; cuando ya no quedan glifos ocultos, también acierta,
       para que la ronda acabe antes de los 60 s;
     - captura `juego-unown-translator-ronda`;
     - el otro espera a que no quede ningún `glifo oculto` (las pistas lo destapan todo en menos de 60 s), escribe
       las letras que se leen y ve `¡Descifrado!`;
     - Captura `juego-unown-translator-revelacion`.
  2. `MOVES`: captura `juego-unown-translator-movimiento` a 390×844 con `capture()` por defecto.
  3. En la clasificación, captura `juego-unown-translator-clasificacion`. `collectErrors` queda vacío.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- juegos -g "unown"`. Esperado: PASS, con las capturas a 1280×720,
  1920×1080 y 390×844, sin avisos de tamaños que falten y con `capture()` en sus valores por defecto.
- [ ] **Step 3: Revisar las capturas** en `e2e/test-results/revision.html` y puntuar ronda, revelación, movimiento y
  clasificación con `docs/visual-review.md`. Mínimo 19/24 cada una y ningún criterio a 0.
- [ ] **Step 4: Verificación final:** `npm run typecheck`, `npm run lint` y los `--tests` del Step 7 de la Task 5.
- [ ] **Step 5: Commit** con el mensaje
  `Traductor Unown: flujo en Playwright y capturas (rúbrica: ronda N/24, revelación N/24, movimiento N/24, clasificación N/24)`
  y `git push`.
