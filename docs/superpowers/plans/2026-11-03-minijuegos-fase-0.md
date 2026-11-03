# Minijuegos, Fase 0 (bugs y bucles infinitos): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los bucles infinitos de Type Duel e Impostor y corregir los bugs pequeños de Pokédex Distance, Learnset Guess, Higher or Lower y de los paneles de configuración (Fase 0 de §10).

**Architecture:** Cada cambio de motor va en el TS (`packages/shared/src/games/<id>/`, el oráculo) y en su port Java (`backend/src/main/java/es/pokemonuniverse/domain/game/engines/<idsinguiones>/`) en el **mismo commit**, junto con un escenario dorado nuevo, las fixtures regeneradas y la UI de `frontend/src/room/` que lo consume. Los textos nuevos de la UI salen de funciones puras en `frontend/src/room/*.ts` con su Vitest. La regla de paridad de Impostor va en `config-readiness` (TS y Java) y en un `validateConfig` del cliente. El servidor Node (`apps/server`) no se toca.

**Tech Stack:** TypeScript ESM + Zod + Vitest (shared, frontend), Java 25 + Micronaut + JUnit (backend), React + Tailwind (frontend), Playwright (e2e).

**Plan sin versionar:** `.superpowers/` está en `.gitignore`.

**Spec:** `/home/eru/Documents/Projects/PokemonUniverse/MINIJUEGOS_MEJORAS.md`. Es un fichero **sin seguimiento**: no existe dentro de un worktree, así que se lee siempre por ruta absoluta. Las secciones son §10 «Fase 0», §2 (D4, D7, D9), §4 (I2, I3, I7, I9), §5 (H4, H6), §6 (T1, T5, T7), §7 (L1, L5, L6) y §1.7.

**Rama y worktree:** la rama es `minijuegos-fase-0`, sobre `etapa-2d-corte`. Otro agente está haciendo commits en `/home/eru/Documents/Projects/PokemonUniverse`, así que la ejecución va en un worktree aparte (superpowers:using-git-worktrees). Este plan está en `.superpowers/` (ignorado por git), así que también se lee por ruta absoluta.

---

## Diferencias entre el documento y el repositorio actual

El documento es anterior a la etapa 2D. Lo que manda es lo de aquí:

- `apps/web/src/...` ahora es `frontend/src/...` (mismos nombres de fichero).
- Node (`apps/server`) ya no se despliega: Java sirve todo `/api` y `/ws`. **No se cambia `manager.ts` ni `RoomCoordinator` salvo lo que pide la Task 3**.
  - El campo nuevo `playerCount` de `GameConfigReadinessContext` es opcional, así que `manager.ts` compila sin tocarlo.
- `npm run test:e2e:java` ya no existe. `npm run test:e2e` va contra Java.
- **No existe `config-readiness.test.ts`.** La Task 3 lo crea en `packages/shared/src/games/config-readiness.test.ts`.
- §1.6 dice que el esquema pasa por Prisma: ya no es así (Flyway es el dueño). Igualmente, esta fase no cambia ningún esquema de BD ni ninguna configuración Zod de juego, así que no hace falta `registry:export` ni migración.

## Verificación de las afirmaciones del documento (código actual)

| Id | ¿Sigue vigente? | Evidencia actual |
|---|---|---|
| T1 bucle Type Duel | Sí | `type-duel/server.ts:39-40` (`canceled` no suma), `:92` (`INVALID_COMBINATION` vuelve sin contar). Java: `TypeDuelEngine.java:127-128`, `:276` |
| T5 resultado sin tipos ni motivo | Sí, solo en el front | `frontend/src/room/TypeDuelGame.tsx:21` («Selección cancelada»). `lastRound.requiredTypes` ya se publica, pero es `null` en `TYPE_TIMEOUT` y `TYPE_FORFEIT` |
| T7 intentos repetidos | Sí | `type-duel/server.ts:78-80` |
| I2 votación sin fin | Sí | `pokemon-impostor/server.ts:132-143,261`; test `server.test.ts:234` |
| I3 sin motivo del final | Sí | `PokemonImpostorResults.tsx:9-11` |
| I7 límites incoherentes | Sí | `PokemonImpostorGame.tsx:78` (`maxLength={50}`), `games/pokemon-impostor/ConfigPanel.tsx:11` (botones 1–3), `:12` (`max={45}`) |
| I9 paridad tardía | Sí | `config-readiness.ts` no la valida; solo `server.ts:182`. Java: `GameConfigReadiness.java:74-116` |
| D4 `roundsSurvived` | Sí | `pokedex-distance/server.ts:160`; Java `PokedexDistanceTypes.java:42-44` (`afterSelection`) |
| D7 formas regionales | Sí | `pokedex-distance/server.ts:151-152`; Java `PokedexDistanceEngine.java:219` |
| D9 nombre del test | Sí | `pokedex-distance/server.test.ts:179` dice «four-second» y comprueba `6_000` |
| L1 rama muerta | Sí | `LearnsetGuessGame.tsx:30` («No aprende movimientos hasta nivel 15»). `visibleGroups` solo está vacío fuera de `ROUND_ACTIVE` (`server.ts:186`) y el pool exige un movimiento ≤15 (`server.ts:79`) |
| L5 claves duplicadas | Sí, y **más de lo descrito** | Las claves de `LearnsetGuessGame.tsx:30` y `:45`. Además, el `Set` `revealed` de `RoundReveal` (`:45`) usa `${moveId}:${level}` y con `level=null` marca las dos apariciones |
| L6 `missed` a desconectados | Sí | `learnset-guess/server.ts:110-112`; Java `LearnsetGuessEngine.java:264-268` |
| H4 textos en inglés | Sí, y **más de lo descrito** | `HigherLowerGame.tsx:6,12,15,18`, y también `HigherLowerResults.tsx:7` («SAME») |
| H6 `canAnswer` | Sí | `higher-lower/server.ts:82`; Java `HigherLowerEngine.java:253` |
| §1.7 paneles | Sí, las 6 filas | `higher-lower/ConfigPanel.tsx:98` (30), `type-duel/ConfigPanel.tsx:13` (20), `shiny-vote/ConfigPanel.tsx:23` (20), Impostor (ver I7). Pokédex Distance y Learnset ya coinciden con su esquema |

**Nada está ya corregido.** Se descartan de esta fase:
- todo cambio en `manager.ts` (Node);
- `npm run test:e2e:java`;
- cualquier cambio de `z.string().max(200)` en `SUBMIT_CLUE`: Zod cuenta unidades UTF-16 y el motor cuenta puntos de código, y el límite real (25) ya lo aplica el motor.

## Decisiones

Se toman de las recomendaciones del propio documento. Si no hay ninguna, se elige la opción mínima que cumple el criterio de aceptación.

1. **Type Duel: toda resolución consume duelo.** `roundResult` siempre hace `completedRounds + 1`.
   - Las estadísticas (`duelsPlayed`, `duelsWon`) siguen sumando solo con `WINNER`, `TIMEOUT` y `TYPE_FORFEIT`.
   - `TYPE_TIMEOUT`, `DISCONNECTED` y la nueva `INVALID_COMBINATION` no tocan las estadísticas ni dan puntos.
   - `DISCONNECTED` consume duelo pero sigue anulándolo. El forfeit con gracia es de la Fase 1.
2. **Type Duel: «tras 2 reintentos».** El duelo termina al cerrarse la pantalla de la **tercera** combinación imposible (`TYPE_DUEL_MAX_INVALID_COMBINATIONS = 3`), con el motivo nuevo `INVALID_COMBINATION`.
3. **Type Duel: tope duro.** Un contador `selectionCycles` sube cada vez que se entra en `SELECTING_TYPES`, reintentos incluidos.
   - Si `selectionCycles >= rounds * 2`, la siguiente transición termina: `advanceAfterResult` acaba la partida, y la pantalla de combinación imposible resuelve el duelo como `INVALID_COMBINATION`.
4. **Type Duel: intento repetido.** Se rechaza por jugador (el mismo `playerId` con el mismo `pokemonId` en `state.attempts`) con el literal `'Ya lo probaste.'`, sin cambiar estado ni estadísticas.
   - Se comprueba después del enfriamiento y de la comprobación del pool, y antes de registrar el intento.
5. **Impostor: «Saltar».**
   - Es la misma acción `VOTE` con `targetId: 'SKIP'` (constante `IMPOSTOR_SKIP_TARGET`). No choca con ningún id: son cuid o `guest_<uuid>`.
   - `SKIP` **no** entra en `voteCandidateIds` ni en `tallies`. Va en un campo nuevo `skipVotes: number` de `ImpostorVoteResult`.
   - Si `skipVotes` iguala o supera el máximo de votos, el resultado es `SKIPPED` y no se expulsa a nadie. Esto cubre el 0–0 cuando nadie vota.
   - El voto a «Saltar» cuenta en `votesCast`.
6. **Impostor: tope de revotación.** Solo hay una revotación (`IMPOSTOR_MAX_VOTING_ROUNDS = 2`). Un empate en la segunda votación da `DEADLOCK` y no se expulsa a nadie.
7. **Impostor: cierre del bucle con jugadores ausentes** *(va más allá del documento; el usuario puede vetarla)*. «Saltar» por sí solo no cierra el bucle: pistas agotadas → 0 votos → `SKIPPED` → nueva ronda, sin fin.
   - Tope: `IMPOSTOR_MAX_ROUNDS_WITHOUT_ELIMINATION = 3`. Tres rondas seguidas sin expulsión (`SKIPPED` o `DEADLOCK`) terminan la partida con victoria de los impostores y `finishReason: 'STALEMATE'`.
   - Sigue la regla de §4.3 «si hay empate, ganan los impostores».
   - La «ronda de acusación final» configurable (`maxRounds`) sigue fuera de esta fase.
8. **Impostor: `finishReason`.** Valores: `'GUESS' | 'PARITY' | 'IMPOSTORS_ELIMINATED' | 'STALEMATE' | null`, en el estado y en la proyección pública.
   - Quien adivinó se deduce en la UI de `results.standings[].stats.pokemonGuessed === 1`: no hace falta un campo nuevo.
9. **Impostor: longitud de la pista en el input** *(se desvía del `maxLength=25` literal del documento; el usuario puede vetarla)*. El documento pide `maxLength=25`. Como el motor cuenta puntos de código, el input recorta en `onChange` a 25 puntos de código: `[...value.normalize('NFC')].slice(0, IMPOSTOR_CLUE_MAX_CODE_POINTS).join('')`.
   - Se quita `maxLength={50}`. Un `maxLength={25}` en HTML (unidades UTF-16) dejaría solo 12 emojis, que el motor sí acepta. Así se cumple el criterio («el input no deja pasar de 25») sin romper ese caso dorado.
10. **Paridad en el lobby.**
    - `GameConfigReadinessContext.playerCount?: number` en TS, y un tercer componente `int playerCount` en `GameConfigReadiness.Context` de Java.
    - Solo se comprueba si `playerCount > 0`. `Context.EMPTY` y el constructor de 2 argumentos pasan 0 y no comprueban.
    - Literal exacto, igual en TS, Java y cliente (se construye con los números): `` `Demasiados impostores: con ${playerCount} jugadores el máximo es ${maximo}.` ``, con `maximo` = `Math.floor((playerCount - 1) / 2)` en TS y `(playerCount - 1) / 2` (división entera) en Java. Es el máximo que cumple `impostorCount * 2 < playerCount`. **No** uses `Math.ceil(playerCount / 2)` en Java: la división entera da 1 para 5 jugadores.
11. **Pokédex Distance: `roundsSurvived`.** Suma +1 a cada superviviente dentro de `eliminateAndContinue`: exactamente uno por `roundNumber` resuelto. Un `TIE` no cuenta y el desempate tampoco suma de nuevo.
12. **Pokédex Distance: formas.** `SELECT_POKEMON` rechaza `isDefault === false` con el literal que ya existe, `'Pokémon is not in the configured pool'`. Ningún literal nuevo.
13. **Learnset: claves.** El arreglo es solo de front: clave con índice y marcado de «visto» por multiconjunto (`revealedLearnsetFlags`). Sin cambio de motor, porque `lastRound.learnset` no garantiza el mismo orden que `revealedMoves`.
14. **Paneles.** Se **ensancha el panel** hasta el esquema y nunca se estrecha el esquema, para no tocar la configuración guardada ni las fixtures:
    - `rounds`: 1–50 en Higher or Lower, Type Duel y Shiny Quiz;
    - `impostorCount`: 1–10 con `ConfigRange`;
    - `clueSeconds`: 10–120.

## Global Constraints

- Node 22+, Java 25. TS ESM con dos espacios, comillas simples y punto y coma. Los comentarios Java van en español.
- **Mismo commit:** el TS del motor, el Java del motor, el escenario dorado nuevo, las fixtures regeneradas (`npm run build -w @pokemon-universe/shared && npm run golden:export`) y la UI que consume el cambio.
  - Se corrige el Java, nunca el TS ni las fixtures (`engines/README.md`).
- **Orden de claves** (constraint 13): cada campo nuevo se inserta en la posición indicada del literal TS (`createInitialState`, proyección o resultado), con su componente Java en la misma posición del record, su setter de `Builder` y `toBuilder()`.
  - Un campo nuevo de estado o de proyección cambia **todas** las fixtures de ese motor. Hay que revisar a ojo el diff de las fixtures viejas: solo pueden cambiar el campo nuevo y los efectos de la regla corregida.
- Los escenarios dorados nuevos se añaden al array `scenarios` del `GoldenEngineEntry` de `packages/shared/golden/scenarios/<id>.ts`, con un seed nuevo distinto de los del fichero, ≥3 rondas cuando el juego las tenga y `catalog: 'gen1-2'`.
- Literales de error idénticos en TS y Java (`GameActionResult.reject`).
- La UI usa solo las clases de `frontend/src/styles.css` y los tokens. Texto de 12 px o más. Animaciones solo de `transform`/`opacity`, con `prefers-reduced-motion`.
- Commits en español, de una línea, sin prefijos ni líneas de atribución.
- Por tarea: el Vitest del workspace tocado, `npm run golden:export` (si hay motor), `cd backend && ./gradlew test --tests '*GoldenReplayTest*' --tests '*<Juego>*'` y `npm run lint && npm run typecheck`. El `./gradlew check` y el `npm test` completos van en la Task 8.

## Review Focus

1. **Impostor con todos ausentes pero conectados:** pistas en `TIMEOUT`, 0 votos y `SKIPPED`, tres veces. La partida debe terminar con `STALEMATE`, no quedarse en ronda 4. Test: `ends with STALEMATE after three rounds without elimination` (Task 2).
2. **Type Duel con pares que eligen siempre combinaciones imposibles:** el tope `rounds * 2` debe cortar antes del tercer intento. Test: `hard cap ends the game after rounds × 2 selection cycles` (Task 1).
3. **Desconexión en mitad de la revotación de Impostor:** `resolveWhenRequiredPlayersComplete` cierra con los votos que haya, y si el empate persiste debe salir `DEADLOCK`, no una tercera votación. Test: `a disconnect during the revote resolves it without a third voting round` (Task 2).
4. **Reconexión de un duelista tras `DISCONNECTED`:** el duelo cuenta y la ronda siguiente tiene `roundNumber = completedRounds + 1`. La cabecera «Ronda N de M» no se repite. Test: `a disconnect consumes the duel and the next pair starts round 2` (Task 1).
5. **Lobby de Impostor con jugadores que entran y salen:** el aviso de paridad debe aparecer y desaparecer según los conectados, y en rotación el juego se excluye en vez de bloquear. Tests: `validatePokemonImpostorConfig` con 4 y 5 conectados (Task 3) y `GameConfigReadinessTest.impostorParityNeedsMoreInnocents`.

---

### Task 1: Type Duel: toda resolución consume duelo, tope duro, intentos repetidos y resultado con tipos

**Files:**
- Modify: `packages/shared/src/games/type-duel/{types,rules,server}.ts`, `packages/shared/src/games/type-duel/server.test.ts`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/typeduel/{TypeDuelTypes,TypeDuelRules,TypeDuelEngine}.java`, `backend/src/test/java/es/pokemonuniverse/domain/game/engines/typeduel/TypeDuelEngineTest.java`
- Modify: `packages/shared/golden/scenarios/type-duel.ts` y las fixtures de `backend/src/test/resources/golden/type-duel/` (regeneradas)
- Create: `frontend/src/room/type-duel-result.ts`, `frontend/src/room/type-duel-result.test.ts`
- Modify: `frontend/src/room/TypeDuelGame.tsx`

**Interfaces:**
- Produces (TS, `types.ts`):
  - `TypeDuelRoundResult['reason']` añade `'INVALID_COMBINATION'`.
  - `TypeDuelRoundResult` = `{ reason, winnerId, attempts, solutions, requiredTypes, selectedTypes: Record<string, PokemonType>, disconnectedIds: string[] }`, en este orden.
  - `TypeDuelState` añade:
    - `selectionCycles: number` justo **después de `completedRounds`**;
    - `invalidCombinations: number` justo **después de `requiredTypes`**.
  - `TypeDuelPublicState` añade `invalidCombinations: number` justo **después de `requiredTypes`**.
- Produces (TS, `rules.ts`): `export const TYPE_DUEL_MAX_INVALID_COMBINATIONS = 3;`
- Produces (front): `typeDuelResultText(lastRound: TypeDuelRoundResult, participants: readonly [string, string], nameOf: (id: string) => string): { title: string; detail: string | null }`. El llamador pasa `game.participants`, que en `ROUND_RESULTS` sigue siendo la pareja del duelo (solo la cambia `selectPlayers`).
- Java: `TypeDuelRoundReason` añade `INVALID_COMBINATION`. `TypeDuelRules.TYPE_DUEL_MAX_INVALID_COMBINATIONS = 3`. Mismos componentes y posiciones en `TypeDuelState`, `TypeDuelRoundResult` y `TypeDuelPublicState`.

- [ ] **Step 1: Tests Vitest que fallan** en `type-duel/server.test.ts`. Usa los helpers `setup`, `selectTypes` y `advance` que ya existen.
  - Sustituye `cancels without points when neither player selects a type` por `TYPE_TIMEOUT consumes a duel without points or stats`:
    - tras el timeout de selección, `lastRound.reason === 'TYPE_TIMEOUT'`, `completedRounds === 1`, todos los `scores` a 0 y `playerStats[a].duelsPlayed === 0`;
    - tras `ROUND_RESULTS`, `roundNumber === 2`.
  - `two absent duelists finish within rounds × 2 cycles`: `setup(3)`, solo timeouts. Termina en `GAME_RESULTS` con `selectionCycles <= 6` y `completedRounds === 3`.
  - `the third impossible combination ends the duel as INVALID_COMBINATION`: tres veces `dragon`/`fairy` + timeout.
    - Tras la tercera pantalla: `lastRound.reason === 'INVALID_COMBINATION'`, `lastRound.requiredTypes` es `['dragon','fairy']`, `completedRounds === 1`.
    - Durante la segunda pantalla, la proyección pública da `invalidCombinations === 2`.
  - `hard cap ends the game after rounds × 2 selection cycles`: `setup(1)` y dos combinaciones imposibles. Tras la segunda pantalla: `lastRound.reason === 'INVALID_COMBINATION'` con `invalidCombinations === 2` y `selectionCycles === 2`; tras los resultados, `GAME_RESULTS`.
  - `rejects a repeated failed attempt by the same player`: segundo `ATTEMPT_POKEMON` del mismo id fallido, pasado el enfriamiento.
    - Da `accepted: false`, `error: 'Ya lo probaste.'`, `incorrectAttempts` sin cambios y `attempts.length` sin cambios.
    - El rival sí puede probar ese mismo id.
  - Sustituye `cancels without a free win when a duelist disconnects…` por `a disconnect consumes the duel and the next pair starts round 2`: `reason === 'DISCONNECTED'`, `disconnectedIds` igual al id desconectado, `completedRounds === 1`, sin puntos, y la siguiente pareja excluye al desconectado con `roundNumber === 2`.
  - `round result keeps the selected types for TYPE_FORFEIT`: `lastRound.selectedTypes` es `{ [a]: 'fire' }`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- type-duel`. Debe fallar.
- [ ] **Step 3: Implementa en `server.ts`.**
  - `selectPlayers`: `selectionCycles: state.selectionCycles + 1` e `invalidCombinations: 0`.
  - `resolveTypes`: si no hay soluciones, `invalidCombinations: state.invalidCombinations + 1`.
  - Rama `INVALID_COMBINATION` de `handleTimeout`: si `state.invalidCombinations >= TYPE_DUEL_MAX_INVALID_COMBINATIONS || state.selectionCycles >= state.config.rounds * 2`, devuelve `roundResult(state, context, 'INVALID_COMBINATION', null)`. Si no, el reintento actual con `selectionCycles + 1`.
  - `roundResult`:
    - `completed = state.completedRounds + 1` siempre;
    - estadísticas solo si `reason` es `WINNER`, `TIMEOUT` o `TYPE_FORFEIT`;
    - `selectedTypes: { ...state.typeSelections }`;
    - `disconnectedIds`: los `participants` con `!isPlayerRequired(context, id)` si `reason === 'DISCONNECTED'`, y `[]` en otro caso.
  - `advanceAfterResult`: termina si `completedRounds >= rounds || selectionCycles >= rounds * 2`.
  - `handleAction`: tras la comprobación del pool, rechaza con `'Ya lo probaste.'` si `state.attempts.some((a) => a.playerId === playerId && a.pokemonId === pokemon.id)`.
  - `getPublicState`: añade `invalidCombinations`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Ajusta solo los tests viejos que afirmaban la regla antigua (`does not consume a round for an impossible combination` sigue valiendo para la primera).
- [ ] **Step 5: Escenarios dorados** en `golden/scenarios/type-duel.ts`. Añádelos a `scenarios`.
  - `absent-duelists-hard-cap` (seed 505, `rounds: 3`, 3 jugadores): solo timeouts hasta `GAME_RESULTS`. Incluye una desconexión en `POKEMON_SEARCH` que da `DISCONNECTED` con `disconnectedIds`.
  - `invalid-combinations-and-repeats` (seed 606, `rounds: 2`): tres combinaciones imposibles, luego un duelo válido en el que `p1` repite un intento fallido (`'Ya lo probaste.'`) y `p2` acierta.
  - Si un escenario viejo deja de cubrir lo que dicen su nombre y sus comentarios, ajusta **sus pasos** (los escenarios son entradas), no te limites a aceptar la fixture nueva.
  - Ejecuta `npm run build -w @pokemon-universe/shared && npm run golden:export` y revisa el diff de las cuatro fixtures viejas: debe cambiar `completedRounds`/`roundNumber` en `TYPE_TIMEOUT`/`DISCONNECTED`, y deben aparecer los campos nuevos.
- [ ] **Step 6: Port Java.** Mismos cambios en `TypeDuelEngine.java` (`selectPlayers`, `resolveTypes`, `roundResult` en `:127-160`, `advanceAfterResult` en `:163`, la rama `INVALID_COMBINATION` en `:276`, `handleAction` tras `:244`) y en los records y builders de `TypeDuelTypes.java`.
  - Añade `"Ya lo probaste."` a `TypeDuelEngineTest.rejectsEachActionWithItsLiteral`.
  - Ejecuta `cd backend && ./gradlew test --tests '*GoldenReplayTest*' --tests '*TypeDuel*'`. Debe pasar.
- [ ] **Step 7: UI con TDD.**
  - `type-duel-result.test.ts`: un caso por motivo con `participants = ['p1', 'p2']` y `nameOf = (id) => ({ p1: 'Ana', p2: 'Bruno' })[id]`:

    | Motivo | `title` | `detail` |
    |---|---|---|
    | `WINNER` (`winnerId: 'p1'`) | `'Ana gana'` | `null` |
    | `TIMEOUT` | `'Tiempo agotado'` | `'Nadie encontró un Pokémon con esa combinación.'` |
    | `TYPE_FORFEIT` (`winnerId: 'p1'`) | `'Ana gana'` | `'Bruno no eligió tipo a tiempo.'` (el rival es el participante de `participants` distinto de `winnerId`) |
    | `TYPE_TIMEOUT` | `'Ninguno eligió tipo'` | `'El duelo cuenta sin puntos.'` |
    | `DISCONNECTED` (`disconnectedIds: ['p2']`) | `'Duelo anulado'` | `'Bruno se desconectó.'` |
    | `INVALID_COMBINATION` | `'Combinación imposible'` | `'Tres intentos sin ningún Pokémon válido: el duelo cuenta sin puntos.'` |

  - Implementa `typeDuelResultText` y úsala en el bloque `ROUND_RESULTS` de `TypeDuelGame.tsx:21`, en lugar del ternario de «Selección cancelada».
  - Muestra siempre la fila de tipos: los `TypeBadge` de `lastRound.requiredTypes` si no es `null`, y si no, los de `Object.values(lastRound.selectedTypes)`.
  - Cambia el texto de `INVALID_COMBINATION` (`:19`) a `` `No existe ningún Pokémon válido (intento ${game.invalidCombinations} de ${TYPE_DUEL_MAX_INVALID_COMBINATIONS}).` ``, seguido de «Los mismos jugadores elegirán de nuevo.» si `invalidCombinations < TYPE_DUEL_MAX_INVALID_COMBINATIONS`.
  - Ejecuta `npm test -w @pokemon-universe/web -- type-duel-result`.
- [ ] **Step 8:** `npm run lint && npm run typecheck`.
- [ ] **Step 9: Commit.** `Type Duel: toda ronda consume duelo, tope duro, intentos repetidos y resultado con tipos`

---

### Task 2: Impostor: «Saltar», tope de revotación, fin por bloqueo y `finishReason`

**Files:**
- Modify: `packages/shared/src/games/pokemon-impostor/{types,rules,server}.ts`, `packages/shared/src/games/pokemon-impostor/server.test.ts`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/{PokemonImpostorTypes,PokemonImpostorRules,PokemonImpostorEngine}.java`
- Modify: `packages/shared/golden/scenarios/pokemon-impostor.ts` y las fixtures de `backend/src/test/resources/golden/pokemon-impostor/`
- Create: `frontend/src/room/pokemon-impostor-texts.ts`, `frontend/src/room/pokemon-impostor-texts.test.ts`
- Modify: `frontend/src/room/PokemonImpostorGame.tsx`, `frontend/src/room/PokemonImpostorResults.tsx`

**Interfaces:**
- Produces (TS, `types.ts`):
  - `export const IMPOSTOR_SKIP_TARGET = 'SKIP';`
  - `export type ImpostorFinishReason = 'GUESS' | 'PARITY' | 'IMPOSTORS_ELIMINATED' | 'STALEMATE';`
  - `ImpostorVoteResult` = `{ kind: 'TIE' | 'ELIMINATION' | 'SKIPPED' | 'DEADLOCK', votes, tallies, skipVotes: number, tiedIds, eliminatedId }`, en este orden.
  - `PokemonImpostorState` añade:
    - `roundsWithoutElimination: number` justo **después de `votingRound`**;
    - `finishReason: ImpostorFinishReason | null` justo **después de `winnerTeam`**.
  - `PokemonImpostorPublicState` añade `finishReason: ImpostorFinishReason | null` justo **después de `winnerTeam`**.
- Produces (TS, `rules.ts`): `IMPOSTOR_MAX_VOTING_ROUNDS = 2`, `IMPOSTOR_MAX_ROUNDS_WITHOUT_ELIMINATION = 3`, `IMPOSTOR_CLUE_MAX_CODE_POINTS = 25`. El literal de error de 25 caracteres no cambia.
- Produces (front):
  - `impostorVoteHeadline(result: ImpostorVoteResult, nameOf: (id: string) => string): string`
  - `impostorVoteTargetLabel(targetId: string, nameOf): string`: devuelve `'Saltar'` para `IMPOSTOR_SKIP_TARGET`.
  - `impostorFinishText(reason: ImpostorFinishReason | null, guesserName: string | null): string | null`
- Java: `VoteResultKind { TIE, ELIMINATION, SKIPPED, DEADLOCK }` y `enum ImpostorFinishReason`. El record `ImpostorVoteResult` lleva `int skipVotes` tras `tallies`, y los componentes de estado y de proyección van en las posiciones indicadas.

- [ ] **Step 1: Tests Vitest que fallan** en `pokemon-impostor/server.test.ts`.
  - `accepts SKIP as a vote, never as a candidate, and counts it in votesCast`: `VOTE {targetId:'SKIP'}` se acepta. `voteCandidateIds` no contiene `'SKIP'` y `playerStats[p].votesCast === 1`.
  - `nobody voting skips to the next clue round without eliminating`: tras el timeout de `VOTING`, `lastVoteResult.kind === 'SKIPPED'` y `skipVotes === 0`. Tras `VOTE_RESULTS`: `phase === 'CLUE_PHASE'`, `roundNumber === 2` y `eliminatedIds` vacío.
  - `SKIP tying the maximum eliminates nobody`: 4 vivos, votos A, A, SKIP, SKIP. El resultado es `SKIPPED`.
  - `a repeated tie ends in DEADLOCK without elimination`: empate entre dos, revotación (`votingRound === 2`), mismo empate. Da `kind === 'DEADLOCK'`, `tiedIds` de longitud 2 y, tras `VOTE_RESULTS`, `CLUE_PHASE` sin expulsión.
  - `a disconnect during the revote resolves it without a third voting round`.
  - `ends with STALEMATE after three rounds without elimination`: tres ciclos de pistas en `TIMEOUT` y votación vacía. Da `phase === 'GAME_RESULTS'`, `winnerTeam === 'IMPOSTORS'` y la proyección pública con `finishReason === 'STALEMATE'`.
  - `an elimination resets the rounds-without-elimination counter`.
  - `finishReason is GUESS when an impostor guesses`, `PARITY on parity` e `IMPOSTORS_ELIMINATED when innocents win`. Amplía los tests que ya existen en l.154, l.279 y l.271.
  - Mantén `uses only tied candidates in repeated voting and never eliminates randomly` (l.234). Ahora debe seguir valiendo en la **primera** revotación.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- pokemon-impostor`. Debe fallar.
- [ ] **Step 3: Implementa en `server.ts`.**
  - `createInitialState`: los campos nuevos a `0`/`null` en sus posiciones.
  - Acción `VOTE`: la comprobación de candidato pasa a `action.targetId !== IMPOSTOR_SKIP_TARGET && (!voteCandidateIds.includes(...) || !aliveIds.includes(...))`.
  - `resolveVoting`:

    ```ts
    tallies = candidatos → 0; los votos a SKIP van a skipVotes, el resto suma a tallies[targetId]
    maximum = Math.max(skipVotes, ...Object.values(tallies))
    tied = candidatos con tallies === maximum
    kind = skipVotes === maximum ? 'SKIPPED'
         : tied.length > 1 ? (state.votingRound >= IMPOSTOR_MAX_VOTING_ROUNDS ? 'DEADLOCK' : 'TIE')
         : 'ELIMINATION'
    tiedIds = (kind === 'TIE' || kind === 'DEADLOCK') ? tied : []
    eliminatedId = kind === 'ELIMINATION' ? tied[0] : null
    ```

  - `VOTE_RESULTS` en `handleTimeout`:
    - `TIE` → `beginVoting(tiedIds)`;
    - `ELIMINATION` → `beginElimination`;
    - `SKIPPED`/`DEADLOCK` → `afterNoElimination(state, context)`. Esta función suma `roundsWithoutElimination + 1`; si llega a `IMPOSTOR_MAX_ROUNDS_WITHOUT_ELIMINATION`, devuelve `finishGame({ ...state, roundsWithoutElimination: n, winnerTeam: 'IMPOSTORS', finishReason: 'STALEMATE' })`, y si no, `beginCluePhase({ ...state, roundsWithoutElimination: n }, context)`.
  - `beginElimination`: `roundsWithoutElimination: 0` y `finishReason` igual a `'IMPOSTORS_ELIMINATED'` si gana `INNOCENTS`, `'PARITY'` si gana `IMPOSTORS` y `null` si no hay ganador.
  - `GUESS_POKEMON` correcto: `finishReason: 'GUESS'`.
  - `getPublicState`: `finishReason` tras `winnerTeam`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Escenario dorado** `skip-deadlock-stalemate` (seed 1513, 4 jugadores) en `pokemon-impostor.ts`. Recorre:
  1. una ronda con dos «Saltar» que empatan con el máximo (`SKIPPED`);
  2. una ronda con empate, revotación y `DEADLOCK`;
  3. una ronda de ausentes (todo `TIMEOUT` y 0 votos) que lleva a `STALEMATE`;
  4. un `VOTE` a un id que no es candidato (`'Ese jugador no es candidato.'`).

  Ejecuta `golden:export` y revisa el diff de `tie-and-parity` (su 0–0, si lo hay, ahora es `SKIPPED`). Si `tie-and-parity` ya no llega a la paridad o `innocents-win` ya no llega a la victoria inocente, ajusta los pasos de esos escenarios (por ejemplo, votos explícitos en lugar de timeouts) hasta que vuelvan a cubrirlo.
- [ ] **Step 6: Port Java.** `resolveVoting` (`PokemonImpostorEngine.java:197-218`), `beginElimination` (`:220`), la adivinanza (`:334`), la transición de `VOTE_RESULTS` (`:404-406`), la comprobación de candidato de `VOTE` y la proyección pública (`:474`), con los records y builders de `PokemonImpostorTypes.java`.
  - `tallies` sigue siendo un `LinkedHashMap` en el orden de los candidatos.
  - Ejecuta `./gradlew test --tests '*GoldenReplayTest*' --tests '*PokemonImpostor*'`.
- [ ] **Step 7: UI con TDD** (`pokemon-impostor-texts.test.ts`):
  - `impostorVoteHeadline` devuelve:
    - `TIE`: `'⚔️ Empate: habrá una nueva votación'` (el texto actual);
    - `ELIMINATION`: `'Ana recibió más votos'`;
    - `SKIPPED`: `'⏭️ Se salta la votación: nadie es expulsado'`;
    - `DEADLOCK`: `'⚔️ Empate otra vez: nadie es expulsado'`.
  - `impostorVoteTargetLabel('SKIP', nameOf) === 'Saltar'`.
  - `impostorFinishText` devuelve:
    - `GUESS`: `'Ana adivinó el Pokémon secreto.'`;
    - `PARITY`: `'Los impostores igualaron en número a los inocentes.'`;
    - `IMPOSTORS_ELIMINATED`: `'Todos los impostores fueron expulsados.'`;
    - `STALEMATE`: `'Tres rondas seguidas sin expulsar a nadie.'`;
    - `null`: `null`.

  Después, en `PokemonImpostorGame.tsx`:
  - **Votación:** tras la rejilla de candidatos, un botón «Saltar» con la misma clase de botón de candidato, `aria-pressed={voteDraft === IMPOSTOR_SKIP_TARGET}` y `disabled={!player.canVote || submitting}`.
    - Debajo, la nota `«Tres rondas seguidas sin expulsión dan la victoria a los impostores.»` (`text-sm font-bold text-ink/65`).
    - «Confirmar voto» envía `targetId: voteDraft` tal cual.
  - **`VOTE_RESULTS`:**
    - el titular sale de `impostorVoteHeadline`;
    - el borde es `electric` para `TIE`, `SKIPPED` y `DEADLOCK`;
    - el chip `Saltar · N votos` aparece si `skipVotes > 0`;
    - la lista votante → objetivo usa `impostorVoteTargetLabel`.
  - **Pista:** quita `maxLength={50}` y recorta en `onChange` a `IMPOSTOR_CLUE_MAX_CODE_POINTS` puntos de código (Decisión 9).
  - En `PokemonImpostorResults.tsx`, bajo «Ganan …», un `<p>` con `impostorFinishText(game.finishReason, guesserName)`. `guesserName` es el `displayName` del `standing` con `stats.pokemonGuessed === 1`, o `null`.
  - Ejecuta `npm test -w @pokemon-universe/web -- pokemon-impostor-texts`.
- [ ] **Step 8:** `npm run lint && npm run typecheck`.
- [ ] **Step 9: Commit.** `Impostor: opción Saltar, tope de revotación y motivo de la victoria`

---

### Task 3: Impostor: paridad de impostores en el lobby (`config-readiness`)

**Files:**
- Modify: `packages/shared/src/games/config-readiness.ts`
- Create: `packages/shared/src/games/config-readiness.test.ts`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/GameConfigReadiness.java`, `backend/src/test/java/es/pokemonuniverse/domain/game/GameConfigReadinessTest.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java` (`readinessContext` en `:635-637` y `launchGame` en `:707-708`), `backend/src/test/java/es/pokemonuniverse/application/rooms/RoomCoordinatorTest.java`
- Create: `frontend/src/games/pokemon-impostor/validation.ts`, `frontend/src/games/pokemon-impostor/validation.test.ts`
- Modify: `frontend/src/games/registry.ts` (registro de `pokemon-impostor`)

**Interfaces:**
- Produces:
  - TS: `GameConfigReadinessContext.playerCount?: number`.
  - Java: `record Context(int hostCustomCategoryCount, int hostWouldYouRatherPromptCount, int playerCount)`, más un constructor de 2 argumentos que delega con `playerCount = 0`. `EMPTY = new Context(0, 0, 0)`.
  - Front: `validatePokemonImpostorConfig(config: unknown, room?: RoomView): string | null`. Cuenta los miembros con `presence === 'CONNECTED'` (igual que `Lobby.tsx:45`) y delega en `validateGameConfigReadiness('pokemon-impostor', config, { playerCount })`.

- [ ] **Step 1: Tests que fallan.**
  - `config-readiness.test.ts`, `describe('validateGameConfigReadiness')`:
    - `rejects impostor parity before start`: `('pokemon-impostor', { impostorCount: 2 }, { playerCount: 4 })` da `'Demasiados impostores: con 4 jugadores el máximo es 1.'`.
    - `accepts parity with more innocents`: con `playerCount: 5` da `null`.
    - `computes the maximum with odd player counts`: `{ impostorCount: 3 }` con `playerCount: 5` da `'Demasiados impostores: con 5 jugadores el máximo es 2.'`.
    - `skips the parity check without a player count`: sin contexto da `null`.
    - Más un caso de regresión que ya existe (pokeddle sin pistas da `'Selecciona al menos una pista.'`).
  - `GameConfigReadinessTest.impostorParityNeedsMoreInnocents`: los mismos cuatro casos con `new Context(0, 0, n)`.
  - Busca `Debe haber más inocentes que impostores al comenzar.` en `backend/src/test` y `apps/server/src`. Un test que pase por `startGame`/`launchGame` y espere ese literal ahora recibe antes el de readiness: actualízalo. Los tests del motor (`createInitialState`) lo conservan.
  - `validation.test.ts`: una sala con 4 miembros `CONNECTED` y `impostorCount: 2` da el literal. Con 5 conectados da `null`. Con 5 miembros de los que 1 está desconectado da el literal de 4.
- [ ] **Step 2:** Ejecuta `npm test -w @pokemon-universe/shared -- config-readiness`, `npm test -w @pokemon-universe/web -- pokemon-impostor/validation` y `./gradlew test --tests '*GameConfigReadinessTest*'`. Deben fallar.
- [ ] **Step 3: Implementa.**
  - Regla (TS y Java): si `gameId === 'pokemon-impostor'`, `playerCount > 0` y `impostorCount` es número con `impostorCount * 2 >= playerCount`, devuelve el literal de la Decisión 10.
  - En Java, el número se formatea con `JsNumbers.format` si es `double`, o como `int`.
  - `RoomCoordinator.readinessContext(room)` pasa `connectedPlayerCount(room)`, y `launchGame` pasa `players.size()`.
  - Registra `validateConfig: validatePokemonImpostorConfig` en `registry.ts`.
- [ ] **Step 4:** Repite el Step 2 y ejecuta `./gradlew test --tests '*RoomCoordinatorTest*'`. Debe pasar.
  - Añade a `RoomCoordinatorTest` el caso `impostorParityBlocksStartWithTheReadinessLiteral`: 4 conectados, `impostorCount: 2` y `startGame`. Lanza `RoomException` con el mensaje `"Pokémon Impostor: Demasiados impostores: con 4 jugadores el máximo es 1."`.
- [ ] **Step 5:** `npm run lint && npm run typecheck`.
- [ ] **Step 6: Commit.** `Impostor: el lobby avisa si hay demasiados impostores`

---

### Task 4: Pokédex Distance: `roundsSurvived` correcto, solo formas por defecto y nombre del test

**Files:**
- Modify: `packages/shared/src/games/pokedex-distance/server.ts`, `server.test.ts`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokedexdistance/{PokedexDistanceTypes,PokedexDistanceEngine}.java`
- Modify: `packages/shared/golden/scenarios/pokedex-distance.ts` y las fixtures de `backend/src/test/resources/golden/pokedex-distance/`

**Interfaces:**
- Java:
  - `PlayerRoundStats.afterSelection(int distance)` deja de sumar `roundsSurvived`.
  - Nuevo `PlayerRoundStats afterSurvival()`, que devuelve `roundsSurvived + 1`.
  - Ningún campo de estado ni de proyección nuevo.

- [ ] **Step 1: Tests que fallan.**
  - `the player eliminated as FARTHEST does not add roundsSurvived`: 3 jugadores y una ronda normal. `playerStats.p3.roundsSurvived === 0` y los supervivientes tienen `=== 1`.
  - `a tie and its tiebreak count as one survived round`: en el escenario de `starts a tiebreak…`, tras resolverse el desempate cada superviviente tiene `roundsSurvived === 1`.
  - `rejects a non-default form`: añade `{ id: 'raichu-alola', isDefault: false, generation: 1, nationalDexNumber: 26, … }` al catálogo del test. Da `accepted: false` y `error: 'Pokémon is not in the configured pool'`.
  - Renombra el test de `server.test.ts:179` a `publishes a rich six-second result with target, choices, distances and exact hits`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- pokedex-distance`. Debe fallar.
- [ ] **Step 3: Implementa.**
  - En `handleAction`, quita `roundsSurvived: stats.roundsSurvived + 1` (`server.ts:160`).
  - En `eliminateAndContinue`, suma +1 a `playerStats[id].roundsSurvived` para cada `id` de `survivorIds`, recorriéndolos en su orden.
  - Tras `byId` (`:151-152`): `if (!pokemon || pokemon.isDefault === false || !generations.includes(...))` usa el literal que ya existe.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Escenario dorado** `rounds-survived-and-forms` (seed 606, 3 jugadores, ≥2 rondas con un desempate):
  - incluye `SELECT_POKEMON raichu-alola` (rechazo);
  - termina con un ganador para que `getResults` grabe `roundsSurvived`.

  Ejecuta `golden:export` y revisa en las fixtures viejas que solo cambia `roundsSurvived`.
- [ ] **Step 6: Port Java.**
  - `afterSelection` y `afterSurvival` en `PokedexDistanceTypes.java:42-44`.
  - `eliminateAndContinue` en `PokedexDistanceEngine.java:120`.
  - La comprobación `!pokemon.isDefault()` en `:219`.
  - Ejecuta `./gradlew test --tests '*GoldenReplayTest*' --tests '*PokedexDistance*'`.
- [ ] **Step 7:** `npm run lint && npm run typecheck`.
- [ ] **Step 8: Commit.** `Pokédex Distance: rondas superadas al sobrevivir y solo formas por defecto`

---

### Task 5: Learnset Guess: `missed` solo para requeridos, claves sin colisión y sin rama muerta

**Files:**
- Modify: `packages/shared/src/games/learnset-guess/server.ts`, `server.test.ts`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/learnsetguess/LearnsetGuessEngine.java` (`resolveRound`, `:264-268`)
- Modify: `packages/shared/golden/scenarios/learnset-guess.ts` y las fixtures de `backend/src/test/resources/golden/learnset-guess/`
- Create: `frontend/src/room/learnset-reveal.ts`, `frontend/src/room/learnset-reveal.test.ts`
- Modify: `frontend/src/room/LearnsetGuessGame.tsx`

**Interfaces:**
- Produces (front): `revealedLearnsetFlags(learnset: LearnsetMoveHint[], revealedMoves: LearnsetMoveHint[]): boolean[]`.
  - Cuenta las apariciones de `` `${moveId}:${level}` `` en `revealedMoves`.
  - Recorre `learnset` en orden y marca `true` mientras queden apariciones de esa clave (multiconjunto).

- [ ] **Step 1: Tests que fallan.**
  - Vitest `a disconnected player does not add missed`: 3 jugadores. `p1` acierta, `p3` se desconecta y la ronda se resuelve por tiempo. Da `missed` de `p2` igual a 1 y de `p3` igual a 0.
  - `learnset-reveal.test.ts`:
    - con `level: null` en todos, un mismo `moveId` dos veces en `learnset` y una sola vez en `revealedMoves` da exactamente un `true` para ese movimiento;
    - con niveles visibles, cada entrada se marca por su nivel.
- [ ] **Step 2:** `npm test -w @pokemon-universe/shared -- learnset-guess` y `npm test -w @pokemon-universe/web -- learnset-reveal`. Deben fallar.
- [ ] **Step 3: Implementa.**
  - `resolveRound` suma `missed` solo si `!state.solves[playerId] && isPlayerRequired(context, playerId)`, y Java igual con `context`.
  - En `LearnsetGuessGame.tsx`:
    - `:30`: la clave de `MoveHint` es `` `${move.moveId}-${move.level ?? 'x'}-${index}` `` (usa el índice del `map`);
    - quita la rama vacía «No aprende movimientos hasta nivel 15» / «La primera pista superior aparecerá pronto» y renderiza la rejilla sin condición;
    - `:45` (`RoundReveal`): sustituye el `Set` `revealed` por `revealedLearnsetFlags(result.learnset, result.revealedMoves)` indexado por posición, con la clave `` `${move.moveId}-${index}` ``.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Escenario dorado** `disconnected-not-missed` (seed 812, 3 jugadores, 3 rondas): en una ronda hay un desconectado que no suma `missed`; termina en `GAME_RESULTS`. Ejecuta `golden:export` y revisa `hidden-levels-crystal` (su desconexión cambia `missed`).
- [ ] **Step 6:** `./gradlew test --tests '*GoldenReplayTest*' --tests '*LearnsetGuess*'`.
- [ ] **Step 7:** `npm run lint && npm run typecheck`.
- [ ] **Step 8: Commit.** `Learnset Guess: fallos solo de quien jugaba y claves de movimientos únicas`

---

### Task 6: Higher or Lower: `canAnswer` con `isPlayerRequired` y textos en español

**Files:**
- Modify: `packages/shared/src/games/higher-lower/server.ts` (`getPlayerState`, `:82`), `server.test.ts`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/higherlower/HigherLowerEngine.java` (`getPlayerState`, `:253`)
- Modify: `packages/shared/golden/scenarios/higher-lower.ts` y las fixtures de `backend/src/test/resources/golden/higher-lower/`
- Create: `frontend/src/room/higher-lower-labels.ts`, `frontend/src/room/higher-lower-labels.test.ts`
- Modify: `frontend/src/room/HigherLowerGame.tsx` (`:6,12,15,18`), `frontend/src/room/HigherLowerResults.tsx` (`:7`)

**Interfaces:**
- Produces: `export const higherLowerChoiceLabels: Record<HigherLowerChoice, string> = { HIGHER: 'Mayor', SAME: 'Igual', LOWER: 'Menor' };`

- [ ] **Step 1: Tests que fallan.**
  - Vitest `canAnswer is false for a disconnected player`: con `connected: false` en el contexto, `getPlayerState(state, 'p2', context).canAnswer === false`.
  - `higher-lower-labels.test.ts`: las tres etiquetas exactas.
- [ ] **Step 2:** Ejecuta los dos workspaces. Deben fallar.
- [ ] **Step 3: Implementa.**
  - `getPlayerState(state, playerId, context)` exige `isPlayerRequired(context, playerId)`, y Java igual.
  - En el front:
    - botones con `higherLowerChoiceLabels[id]`;
    - `Respuesta: {higherLowerChoiceLabels[correctAnswer]}`;
    - `Respuesta {label} bloqueada.`;
    - encabezados de la barra lateral con la etiqueta;
    - en `HigherLowerResults.tsx:7`, `{sameCorrect} iguales`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Escenario dorado** `disconnected-cannot-answer` (seed 66, 3 jugadores, 3 rondas): una desconexión en `ROUND_ACTIVE` graba `canAnswer: false` en la proyección privada del desconectado. Ejecuta `golden:export` y revisa `presence-resolves-round`.
- [ ] **Step 6:** `./gradlew test --tests '*GoldenReplayTest*' --tests '*HigherLower*'`.
- [ ] **Step 7:** `npm run lint && npm run typecheck`.
- [ ] **Step 8: Commit.** `Higher or Lower: textos en español y sin botones para quien no juega`

---

### Task 7: Rangos de los paneles alineados con los esquemas

**Files:**
- Modify:
  - `frontend/src/games/higher-lower/ConfigPanel.tsx:98`
  - `frontend/src/games/type-duel/ConfigPanel.tsx:13`
  - `frontend/src/games/shiny-vote/ConfigPanel.tsx:23`
  - `frontend/src/games/pokemon-impostor/ConfigPanel.tsx:11-12`
- Create: `frontend/src/games/config-panel-ranges.test.tsx`

- [ ] **Step 1: Test que falla.** `config-panel-ranges.test.tsx` renderiza cada panel con `renderToStaticMarkup(createElement(Panel, { config: default<Juego>Config, disabled: false, onChange: async () => {} }))` y comprueba el `max` del `<input type="range" aria-label="…">`:
  - `Número de rondas` → `max="50"` en Higher or Lower, Type Duel y Shiny Quiz;
  - `Impostores` → `min="1" max="10"`;
  - `Tiempo por pista` → `max="120"`.

  Si un panel no se puede renderizar en estático, crea un contenedor mínimo en el test, nunca un `export` solo para el test.
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- config-panel-ranges`. Debe fallar.
- [ ] **Step 3: Implementa.**
  - `max={50}` en los tres `rounds`.
  - En Impostor, sustituye el grupo de botones 1–3 por `<ConfigRange label="Impostores" value={value.impostorCount} min={1} max={10} … hint="Debe haber más inocentes que impostores." />`.
  - `clueSeconds`: `max={120}`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: Commit.** `Paneles con los mismos rangos que la configuración del servidor`

---

### Task 8: E2E, capturas, rúbrica y verificación completa

**Files:**
- Modify: `e2e/tests/juegos.spec.ts`
- Create: `e2e/screenshots/juego-type-duel-resultado-{1280x720,1920x1080,390x844}.png`, `e2e/screenshots/juego-pokemon-impostor-votacion-{…}.png`
- Possibly modify: `frontend/src/room/TypeDuelGame.tsx`, `frontend/src/room/PokemonImpostorGame.tsx` (solo para llegar a la rúbrica)

**Preparación:**
- El `webServer` de `e2e/playwright.config.ts` hace `reuseExistingServer`. Antes de ejecutar, para cualquier backend en :8080 o :5173 que se haya arrancado desde otro checkout (el del agente de `etapa-2d-corte`), para que Playwright arranque Java y Vite **desde el worktree** con los motores nuevos.
- Necesita `.env`, el catálogo sembrado (`npm run db:seed`) y `npx playwright install chromium`.

- [ ] **Step 1: Test `type-duel: resultado con tipos`** en `juegos.spec.ts`, fuera del bucle por manifiesto. Usa `crearSalaConJugadores(browser, 3)`, `seleccionarJuego(host.page, 'Type Duel')` e `iniciarPartida`.
  - Las dos páginas con el botón `Elegir tipo Fuego` visible son los duelistas: los dos lo pulsan.
  - Espera hasta 30 s al texto `Tiempo agotado` (fin de la búsqueda de 20 s).
  - Comprueba que se ve la insignia del tipo «Fuego» en la tarjeta del resultado.
  - Captura en el host a los tres `SIZES` con `layoutProblems(page, 'juego-type-duel-resultado', true)` y espera `problems` vacío en los tres. `ROUND_RESULTS` avanza solo a los 10 s y nadie pulsa «continuar»: después de cada captura, comprueba que `Tiempo agotado` sigue visible, para que una captura tardía falle en vez de fotografiar la ronda 2.
  - `test.setTimeout(120_000)`.
- [ ] **Step 2: Test `pokemon-impostor: votación con Saltar`.** 3 jugadores.
  - Durante 3 turnos, busca la página con el campo de placeholder `Escribe algo relacionado…` visible, rellénalo con `pista` y pulsa Enter.
  - En `VOTING`, comprueba que el botón `Saltar` está visible en las 3 páginas y captura `juego-pokemon-impostor-votacion` a los tres tamaños (`problems` vacío).
  - Cada página pulsa `Saltar` y luego `Confirmar voto`.
  - Espera `Se salta la votación: nadie es expulsado` y después `Ronda 2`.
- [ ] **Step 2b: Cobertura del resto de pantallas tocadas.**
  - Añade `'higher-lower'` a `SCREENSHOT_GAMES` (botones Mayor/Igual/Menor).
  - Panel de Impostor rediseñado (deslizador de impostores): test `pokemon-impostor: panel de configuración` que abre la configuración del juego en el lobby del host y captura `lobby-config-pokemon-impostor` a los tres tamaños, con `problems` vacío.
  - Son solo cambios de texto, cubiertos por las capturas por juego que ya existen o por los tests de funciones puras: la línea de motivo de los resultados de Impostor, Learnset (claves y rama muerta), el texto de `INVALID_COMBINATION` y los paneles de Higher or Lower, Type Duel y Shiny.
- [ ] **Step 3:** `npm run test:e2e -- juegos`. Pasan los 28 tests por juego y los dos nuevos, sin scroll horizontal. **Mira las 6 capturas.**
- [ ] **Step 4: Rúbrica** (`docs/visual-review.md`) para «Type Duel · resultado», «Impostor · votación» y «Impostor · configuración» (la línea base de Juego es 7/24).
  - Si una baja de 19 o tiene un criterio a 0, corrige **solo esas pantallas** con estas palancas:
    - el `<p>` de error con `role="alert"`;
    - botones de tipo, candidato y «Saltar» con `min-h-11` y foco visible (`focus-visible:` con el token `focus`);
    - `aria-busy={pending}` en la acción que envía;
    - la cabecera del resultado con `reveal-pop` (ya respeta reduced-motion en `styles.css:163`);
    - una captura en tema claro con `pinTheme(context, 'light')` para el criterio d.
  - Repite los Steps 3–4 hasta llegar a ≥19 sin ningún 0.
- [ ] **Step 5: Verificación completa.** `npm test`, `npm run typecheck`, `npm run lint` y `cd backend && ./gradlew check`. Todo en verde.
- [ ] **Step 6: Commit.**

  ```
  E2E de Type Duel e Impostor con capturas (Rúbrica Type Duel resultado: a,b,c,d,e,f,g,h = N/24; Impostor votación: … = N/24; Impostor configuración: … = N/24)
  ```

  Pon la nota real en una sola línea.

---

## Paso de operador (no es tarea de agente)

**Métrica de base.** Con una cuenta de administrador contra **producción**, antes de desplegar y unas semanas después, anota los totales de:
- `GET /api/admin/games?status=ABANDONED&gameId=type-duel`
- `GET /api/admin/games?status=INTERRUPTED&gameId=type-duel`
- las mismas dos consultas con `gameId=pokemon-impostor`

`AdminGamesController.java:46`. La proporción de partidas sin terminar de esos dos juegos debe bajar.

## Criterios de aceptación (§10, Fase 0)

- Una partida de Type Duel con dos jugadores ausentes termina en `rounds × 2` ciclos como máximo (Task 1: `two absent duelists finish within rounds × 2 cycles` y `hard cap…`).
- En Impostor, si nadie vota, se pasa a la siguiente ronda de pistas sin eliminar a nadie (Task 2: `nobody voting skips…`). Con tres rondas así, la partida termina (`STALEMATE`).
- Ninguna regla de configuración falla solo al pulsar `start` (Task 3; la regla de paridad era la única fuera de `config-readiness`).

## Decisiones del coordinador (2026-11-03, usuario dormido; revisables)
- Se acepta STALEMATE en Impostor: tras 3 rondas seguidas sin eliminación ganan los impostores (evita el bucle infinito, objetivo de la Fase 0). Pendiente de confirmación del usuario.
- Se acepta recortar la pista a 25 puntos de código en lugar de `maxLength=25` (paridad con el motor). Pendiente de confirmación del usuario.
