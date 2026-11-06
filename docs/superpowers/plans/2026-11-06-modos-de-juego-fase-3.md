# Fase 3: modos de juego, plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** seis minijuegos ganan un segundo modo, que se elige en sus ajustes del lobby: Por puntos, Racha infinita, Supervivencia, Revelación manual, Cooperativo y Una palabra.

**Architecture:**
- Cada juego tiene un campo `mode` (`CLASSIC` por defecto) en su configuración (Zod, Java y `registry.json`) y en su estado público.
- El motor Java existente se ramifica solo en las reglas que cambian.
- El panel de ajustes usa un selector común `GameModeField`, y la carta del lobby muestra un `Chip` con el modo.
- La pantalla de cada juego pinta lo propio de su modo.

**Tech Stack:** Java 25 y Micronaut 5 (motores en `backend/src/main/java/es/pokemonuniverse/domain/game/engines/<id>/`), fixtures doradas, Zod en `packages/shared`, React, Vitest y Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-modos-de-juego-fase-3-design.md`

## Global Constraints

- Valores de `mode` y textos:

  | Juego | Valor | Nombre visible | Texto del modo |
  |---|---|---|---|
  | `pokedex-distance` | `POINTS` | «Por puntos» | «Nadie queda fuera: cada ronda suma 100 menos tu distancia, y 50 extra si clavas el número.» |
  | `higher-lower` | `ENDLESS` | «Racha infinita» | «Un fallo y estás fuera. Gana quien encadene más aciertos.» |
  | `shiny-vote` | `SURVIVAL` | «Supervivencia» | «Un fallo y estás fuera; cada pocas rondas hay más candidatos.» |
  | `learnset-guess` | `MANUAL_REVEAL` | «Revelación manual» | «Sin prisas: cada fallo te enseña más movimientos. Menos intentos, más puntos.» |
  | `type-duel` | `COOP` | «Cooperativo» | «Todos contra el reloj: encontrad juntos todos los Pokémon posibles con esos tipos.» |
  | `pokemon-impostor` | `ONE_WORD` | «Una palabra» | «Pistas de una sola palabra y dos vueltas antes de votar.» |

  En todos, `CLASSIC` se muestra como «Clásico».
- `CLASSIC` mantiene el comportamiento actual. Las fixtures doradas existentes solo pueden cambiar por la clave `mode` añadida.
- Ajustes nuevos:
  - `pointsRounds` (3–30, por defecto 10), solo en Distance `POINTS`;
  - `coopSeconds` (30–120, por defecto 60), solo en Type Duel `COOP`.

  Se validan siempre y se muestran solo en su modo.
- Configuraciones guardadas sin `mode`: se leen como `CLASSIC` sin migración de datos.
- Reglas de `AGENTS.md`:
  - comentarios de Java en español;
  - cada cambio de motor va con sus fixtures regrabadas y su entrada en `registry.json` en el mismo commit (ver el README de engines);
  - un cambio de configuración actualiza el esquema Zod y `config-cases.json`;
  - la UI solo usa `frontend/src/ui`, texto ≥ 13 px, un solo dueño por error y una sola región viva por pantalla de juego;
  - Playwright a tres tamaños y rúbrica ≥ 19/24 en las pantallas que cambian.
- **Regla del usuario:** nada de suites completas. Solo:
  - las clases Java del motor tocado y `--tests '*GoldenReplayTest*'`;
  - los ficheros Vitest tocados, `npm run typecheck` y `npm run lint`;
  - un solo spec o test de Playwright filtrado (`npm run ui:check -- juegos -g "<modo>"`).

## Review Focus

1. **Configuraciones guardadas por usuarios** antes de este cambio (sin `mode`, ni `pointsRounds`, ni `coopSeconds`): se cargan y juegan en Clásico. Test en la Task 1 con `migrateStoredGameConfig` y `config-cases`.
2. **Desconexión de un jugador en mitad de un modo con eliminación** (Racha infinita, Supervivencia): cuenta como fallo cuando acaba su gracia de presencia y la partida termina igualmente. Tests en las Tasks 3 y 4.
3. **Todos eliminados en la misma ronda** (Racha infinita, Supervivencia): la partida termina con empate entre las mejores rachas, sin colgarse. Tests en las Tasks 3 y 4.
4. **Revelación manual sin nadie que acierte:** la ronda termina por agotar grupos o por `roundSeconds`, nunca se queda abierta. Test en la Task 5.
5. **Cooperativo con un Pokémon dicho a la vez por dos jugadores:** cuenta una sola vez y el segundo recibe «Ya lo ha encontrado alguien.». Test en la Task 6.

---

### Task 1: Campo `mode` común y selector en el lobby

**Files:**
- Modify: `packages/shared/src/games/{pokedex-distance,higher-lower,shiny-vote,learnset-guess,type-duel,pokemon-impostor}/config.ts`
- Modify: los `<Juego>Config.java` de esos seis motores
- Modify: `backend/src/main/resources/games/registry.json` y los `backend/src/test/resources/golden/<id>/config-cases.json`
- Create: `packages/shared/src/games/modes.ts` (catálogo de modos por juego)
- Create: `frontend/src/room/GameModeField.tsx` y su test
- Modify: los seis `frontend/src/games/<id>/ConfigPanel.tsx` (selector arriba) y `frontend/src/room/Lobby.tsx` (chip en la carta)
- Test: los `config.test.ts` o los `config-cases.test.ts` que existan, `registry-defaults.test.ts`, `GameModeField.test.tsx`, `Lobby.test.tsx`, y los tests Java de config de esos motores más `GoldenReplayTest`

**Interfaces:**
- Produces:
  - `GAME_MODES: Record<GameId, { modes: readonly [ 'CLASSIC', string ]; labels: Record<string, string>; texts: Record<string, string> }>`, con los valores de las Global Constraints;
  - `gameModeLabel(gameId: string, config: unknown): string | null`: el nombre visible si el modo no es `CLASSIC`, y `null` en otro caso o si el juego no tiene modos;
  - `GameModeField({ gameId, value, onChange, disabled })`: un `Segmented` «Modo» con la línea de texto del modo debajo;
  - en Java, el enum `<Juego>Mode { CLASSIC, <NUEVO> }` en cada paquete de motor, y el componente `mode` como **último** campo del record `<Juego>Config`, que es el orden de claves del esquema;
  - el ajuste `pointsRounds` en la config de Distance y `coopSeconds` en la de Type Duel, también al final.

- [ ] **Step 1: Tests que fallan:**
  - Zod: `mode` vale `CLASSIC` por defecto; un valor desconocido se rechaza; `pointsRounds` y `coopSeconds` respetan sus límites y valores por defecto.
  - `config-cases.json` (Java): añadir los casos de los mismos rangos.
  - `gameModeLabel`: devuelve el nombre en el modo nuevo, `null` en Clásico y `null` para un juego sin modos.
  - `GameModeField`: muestra las dos opciones y el texto del modo elegido.
  - `Lobby`: la carta muestra el chip con el modo cuando no es Clásico.
  - Review Focus 1: una configuración guardada sin `mode` se lee como `CLASSIC`.
- [ ] **Step 2: Ejecutar** solo esos tests. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - El Java usa `ConfigReader.enumValue` y `ConfigReader.integer`.
  - Los `ConfigPanel` ponen `GameModeField` arriba y ocultan `pointsRounds` y `coopSeconds` fuera de su modo (Distance y Type Duel).
  - En Type Duel, `typeSelectSeconds` y `searchSeconds` se ocultan en `COOP`; en Higher or Lower, `rounds` se oculta en `ENDLESS`.
  - Los motores todavía no cambian de comportamiento.
- [ ] **Step 4: Regrabar las fixtures:** `cd backend && ./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'`. Revisar el diff: en las fixtures de estos seis juegos solo puede aparecer la clave `mode` (y los ajustes nuevos en la config).
- [ ] **Step 5: Ejecutar** los tests del Step 1, `--tests '*GoldenReplayTest*'`, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Modos de juego: campo mode en seis juegos y selector en el lobby`.

### Task 2: Pokédex Distance · Por puntos

**Files:** el motor `engines/pokedexdistance/` (Config, Types, Rules y Engine), sus tests y su fixture dorada nueva `golden/pokedex-distance/points-mode.json`, `packages/shared/src/games/pokedex-distance/types.ts`, `frontend/src/room/PokedexDistanceGame.tsx`, `PokedexDistanceResults.tsx` y sus tests.

**Interfaces:**
- Consumes: Task 1 (`mode`, `pointsRounds`).
- Produces: en el estado público con `mode = POINTS`, `pointsRound` (la ronda actual), `pointsRounds` y `scores: Record<playerId, number>`; en cada resultado de ronda, `points` por jugador.

- [ ] **Step 1: Tests de motor que fallan:**
  - `pointsModeNeverEliminates`;
  - `pointsPerRoundFormula`: distancia 0 → 150, distancia 30 → 70, distancia 120 → 0, sin elegir → 0;
  - `pointsModeEndsAfterPointsRounds`;
  - `pointsModeTieSharesPosition`, en `getResults`;
  - `classicUnchanged`: las fixtures del Clásico siguen pasando.
- [ ] **Step 2: Ejecutar** el test del motor. Esperado: FAIL.
- [ ] **Step 3: Implementar** las ramas de `POINTS` (sin desempates por ronda ni eliminación) y grabar la fixture dorada nueva. En el frontend:
  - la pantalla muestra el marcador de puntos y la ronda «N de M»;
  - los resultados ordenan por puntos;
  - el título añade «· Por puntos».
- [ ] **Step 4: Ejecutar** el test del motor, `GoldenReplayTest` y los Vitest de `PokedexDistanceGame` y `PokedexDistanceResults`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Pokédex Distance: modo Por puntos`.

### Task 3: Higher or Lower · Racha infinita

**Files:** el motor `engines/higherlower/`, sus tests y la fixture `golden/higher-lower/endless-mode.json`, `packages/shared/src/games/higher-lower/types.ts`, `frontend/src/room/HigherLowerGame.tsx` y `HigherLowerResults.tsx` con sus tests.

**Interfaces:**
- Produces: en el estado público con `ENDLESS`, `alive: string[]` y `streaks: Record<playerId, number>`; quien está eliminado no puede responder (`canAnswer` es falso).

- [ ] **Step 1: Tests que fallan:**
  - `wrongAnswerEliminates` y `noAnswerEliminates`;
  - `endsWhenNobodyAlive`;
  - `allEliminatedSameRoundTie` (Review Focus 3);
  - `disconnectAfterGraceCountsAsFail` (Review Focus 2);
  - `safetyCapAt100Rounds`;
  - `resultsRankByStreak`.
- [ ] **Step 2: Ejecutar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor y la fixture. En el frontend: las rachas de cada jugador, «Eliminado» para quien ha caído, el eliminado pasa a mirar y los resultados ordenan por racha.
- [ ] **Step 4: Ejecutar** el test del motor, `GoldenReplayTest` y los Vitest tocados. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Higher or Lower: modo Racha infinita`.

### Task 4: Shiny Quiz · Supervivencia

**Files:** el motor `engines/shinyvote/`, sus tests y la fixture `golden/shiny-vote/survival-mode.json`, `packages/shared/src/games/shiny-vote/types.ts`, `frontend/src/room/ShinyVoteGame.tsx`, `ShinyVoteResults.tsx` y `frontend/src/games/shiny-vote/*` con sus tests.

**Interfaces:**
- Produces: en `SURVIVAL`, `alive: string[]` y `roundsSurvived: Record<playerId, number>`. Las opciones de la ronda r (base 1) son `min(optionCount, 3 + floor((r − 1) / 3))`.

- [ ] **Step 1: Tests que fallan:**
  - `optionCountGrowsEveryThreeRounds`: con `optionCount` 5, la secuencia es 3, 3, 3, 4, 4, 4, 5;
  - `wrongOrNoVoteEliminates`;
  - `endsWhenNobodyAliveOrAfterRounds`;
  - `allEliminatedSameRoundTie` (Review Focus 3);
  - `disconnectAfterGraceCountsAsFail` (Review Focus 2);
  - `resultsRankByRoundsSurvived`.
- [ ] **Step 2: Ejecutar.** Esperado: FAIL.
- [ ] **Step 3: Implementar.** Consumir `context.random()` de forma determinista y grabar la fixture. En el frontend: quién sigue en pie, «Eliminado» y el número de candidatos de la ronda.
- [ ] **Step 4: Ejecutar** el test del motor, `GoldenReplayTest` y los Vitest tocados. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Shiny Quiz: modo Supervivencia`.

### Task 5: Learnset Guess · Revelación manual

**Files:** el motor `engines/learnsetguess/`, sus tests y la fixture `golden/learnset-guess/manual-reveal-mode.json`, `packages/shared/src/games/learnset-guess/types.ts`, `frontend/src/room/LearnsetGuessGame.tsx`, `learnset-reveal.ts` y `LearnsetGuessResults.tsx` con sus tests.

**Interfaces:**
- Produces: en `MANUAL_REVEAL`, la proyección por jugador lleva `revealedGroups` (los grupos que él ve) y `attempts`; la proyección pública no muestra los grupos de nadie hasta la revelación de la ronda. Puntos al acertar con N grupos visibles: `max(1, totalGroups − N + 1) × 10`.

- [ ] **Step 1: Tests que fallan:**
  - `startsWithFirstGroupOnly`;
  - `wrongGuessRevealsNextGroupForThatPlayerOnly`;
  - `noTimedReveal`: el paso del tiempo no revela grupos;
  - `roundEndsWhenAllSolvedOrExhaustedOrTimeout` (Review Focus 4);
  - `scoringFormula`: N=1 con 5 grupos → 50, N=5 → 10;
  - `publicProjectionHidesOthersGroups`.
- [ ] **Step 2: Ejecutar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor y la fixture. En el frontend:
  - la pantalla muestra los grupos desbloqueados por el propio jugador y un indicador «N de M grupos»;
  - sin cuenta atrás de la siguiente pista, solo el tope de la ronda.
- [ ] **Step 4: Ejecutar** el test del motor, `GoldenReplayTest` y los Vitest tocados. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Learnset Guess: modo Revelación manual`.

### Task 6: Type Duel · Cooperativo

**Files:** el motor `engines/typeduel/`, sus tests y la fixture `golden/type-duel/coop-mode.json`, `packages/shared/src/games/type-duel/types.ts`, `frontend/src/room/TypeDuelGame.tsx`, `TypeDuelResults.tsx` y `frontend/src/games/type-duel/*` con sus tests.

**Interfaces:**
- Produces: en `COOP`, el estado público lleva `combination` (los tipos), `found: { pokemonId, playerId }[]` y `contributions: Record<playerId, number>`. La acción es la misma de buscar Pokémon de Type Duel; un duplicado se rechaza con «Ya lo ha encontrado alguien.».

- [ ] **Step 1: Tests que fallan:**
  - `combinationHasAtLeastOneValidPokemon`;
  - `validGuessAddsToGroup`;
  - `duplicateRejectedWithMessage`;
  - `simultaneousSameGuessCountsOnce` (Review Focus 5);
  - `roundEndsAfterCoopSeconds`;
  - `resultsShowGroupTotalAndContributions`.
- [ ] **Step 2: Ejecutar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor y la fixture. En el frontend: la combinación arriba, la lista de encontrados con quién los encontró, el contador del grupo y la aportación propia; los resultados muestran el total y la aportación de cada uno.
- [ ] **Step 4: Ejecutar** el test del motor, `GoldenReplayTest` y los Vitest tocados. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Type Duel: modo Cooperativo`.

### Task 7: Pokémon Impostor · Una palabra

**Files:** el motor `engines/pokemonimpostor/`, sus tests y la fixture `golden/pokemon-impostor/one-word-mode.json`, `frontend/src/games/pokemon-impostor/validation.ts` y su test, y `frontend/src/room/PokemonImpostorGame.tsx`.

**Interfaces:**
- Produces: en `ONE_WORD`, el servidor rechaza una pista con espacios, una vez recortada, con «La pista debe ser una sola palabra.», y hay exactamente 2 rondas de pistas antes de cada votación. El cliente valida lo mismo antes de enviar (un solo dueño del error: el campo).

- [ ] **Step 1: Tests que fallan:**
  - `multiWordClueRejected`;
  - `trimmedSingleWordAccepted`;
  - `twoClueRoundsBeforeVote`;
  - `classicUnchanged`;
  - la validación del cliente, en Vitest.
- [ ] **Step 2: Ejecutar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** el motor, la fixture y la validación del cliente; la pantalla indica «Una sola palabra» bajo el campo de pista.
- [ ] **Step 4: Ejecutar** el test del motor, `GoldenReplayTest` y los Vitest tocados. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Pokémon Impostor: modo Una palabra`.

### Task 8: Recorridos en Playwright, capturas y rúbrica

**Files:** `e2e/tests/juegos.spec.ts`, más los helpers de `e2e/src/helpers.ts` que hagan falta.

- [ ] **Step 1: Añadir un test por modo:**
  1. elegir el juego y su modo en el lobby; la carta muestra el chip;
  2. jugar hasta los resultados con 2 o 3 invitados, usando los ajustes mínimos de rondas y tiempo para que sea rápido;
  3. capturar la pantalla de juego y la de resultados del modo a los tres tamaños.

  Los nombres de los tests llevan el modo, para poder filtrarlos con `-g`.
- [ ] **Step 2: Ejecutar** cada uno por separado: `npm run ui:check -- juegos -g "Por puntos"` y lo mismo con el resto. Esperado: PASS.
- [ ] **Step 3: Revisar las capturas** y puntuar con `docs/visual-review.md` cada pantalla que haya cambiado. Mínimo 19/24 y ningún criterio a 0.
- [ ] **Step 4: Commit** con el mensaje `Modos de juego: recorridos en Playwright y capturas (rúbrica: …)`, con las notas reales.
