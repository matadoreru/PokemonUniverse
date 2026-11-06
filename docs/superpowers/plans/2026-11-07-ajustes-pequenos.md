# Pequeños ajustes: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** en Pokémon Impostor con más de un impostor, cada impostor ve quiénes son los demás. En el lobby, «Modo y sesión» con la selección vacía dice «Elige al menos un minijuego.». En Pokémon Impostor, una pista de un inocente que contiene el nombre del Pokémon secreto se rechaza con «No puedes decir el nombre del Pokémon.» (Decisión del usuario (2026-11-06)).

**Architecture:**
- Impostor: una clave opcional `fellowImpostorIds` en la proyección por jugador de `PokemonImpostorEngine.getPlayerState`, con su tipo TS. La web la pinta en la tarjeta de rol, en el panel lateral, en la línea del móvil y en la región viva.
- Lobby: `gameOrderHint` distingue entre «selección vacía» y «ningún juego compatible» con un parámetro `selectedCount`.
- Impostor, pistas: `PokemonImpostorEngine.submitClue` rechaza la pista de un inocente cuyo texto normalizado (solo letras) contiene el nombre normalizado del secreto (`name`, `names.es`, `names.en`). `validateImpostorClue` hace lo mismo en el campo con `secretPokemon.name`.

**Tech Stack:** Java 25, Micronaut 5, fixtures doradas; React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-ajustes-pequenos-design.md`

## Global Constraints

- **Nada de suites completas; solo los tests de lo tocado.** Nada de `npm test`, `./gradlew check` ni `./gradlew test` sin `--tests`. Se usan `npx vitest run <ficheros>` y `./gradlew test --tests '<clase>'`, además de `npm run typecheck` y `npm run lint`.
- **Clave nueva: `fellowImpostorIds`.**
  - Va en `PokemonImpostorPlayerState` justo después de `revealedRoles`.
  - En TS es `fellowImpostorIds?: string[]`; en Java, `@JsonInclude(JsonInclude.Include.NON_NULL) @Nullable List<String>`.
  - Solo se pone si `role == IMPOSTOR` y hay otro impostor. Si no, es `null` y no sale en el JSON.
  - Orden: el de `state.playerIds()`, sin el propio jugador. Incluye a los compañeros expulsados.
- **Textos de Impostor:**
  - con un aliado, `Otro impostor: Ana`; con varios, `Otros impostores: Ana y Bea` o `Ana, Bea y Carla`;
  - un expulsado lleva el sufijo ` (fuera)`;
  - en la línea del móvil, `con Ana y Bea`, sin sufijo;
  - región viva en `ROLE_REVEAL`: `Reparto de roles: eres impostor, con Ana.`.
- **Textos del lobby:**
  - `selectedCount === 0`: `Elige al menos un minijuego.`;
  - `selectedCount > 0 && compatibleCount === 0`: `Ninguno de los minijuegos elegidos admite a los jugadores de ahora.`;
  - `compatibleCount === 1`: el texto actual.
- **Fixtures doradas:**
  - Task 1: solo cambia `golden/pokemon-impostor/guess-and-presence.json`, y solo en `playerStates` de sus dos impostores. También `one-word-mode.json`, si existe y tiene más de un impostor.
  - Task 4: solo aparece el fichero nuevo `golden/pokemon-impostor/secret-name-clue.json`. Ninguna de las siete fixtures existentes tiene una pista con el nombre de su secreto (revisado contra la regla), así que ninguna cambia.
  - Cualquier otro cambio es un fallo.
- **Pista con el nombre del Pokémon** (Task 4):
  - normalización, idéntica en Java y TS: NFD, sin `\p{M}`, minúsculas (`Locale.ROOT`), solo `\p{L}`;
  - se rechaza si la pista normalizada contiene como subcadena un nombre normalizado no vacío;
  - nombres en el servidor: `Pokemon.name` y los valores de texto de `names.es` y `names.en`; en el cliente, `secretPokemon.name`;
  - solo para la pista de un inocente; la de un impostor no se compara (si no, el rechazo le revelaría el Pokémon);
  - en `CLASSIC` y en `ONE_WORD`, y por este orden: vacía → una palabra → 25 caracteres → nombre;
  - texto: `No puedes decir el nombre del Pokémon.`
- Las reglas de `AGENTS.md`:
  - comentarios Java en español;
  - UI solo con `frontend/src/ui/` y las clases de `PokemonImpostor.module.css`. No hay componentes nuevos;
  - texto ≥ 13 px y un solo dueño por error;
  - Playwright a tres tamaños y rúbrica ≥ 19/24 en el commit de UI.
- Otros agentes trabajan en la rama `modos`. Hay que tocar solo los ficheros listados y hacer `git add` fichero a fichero, nunca `git add -A`.

## Review Focus

1. **Privacidad:** un inocente, un espectador y un id ajeno no reciben `fellowImpostorIds`, ni siquiera como `[]`. Lo comprueba `fellowImpostorsSeeEachOtherInBothModes` (Task 1).
2. **Un solo impostor:** la proyección no cambia y las cinco fixtures de un impostor siguen idénticas. Lo comprueban `singleImpostorHasNoFellowKey` y el `GoldenReplayTest` regrabado (Task 1).
3. **Los dos modos:** con `CLASSIC` y con `ONE_WORD` la lista es la misma. Lo comprueba el test parametrizado de la Task 1.
4. **Nombre largo a 390 px:** la línea del móvil con dos aliados de 24 caracteres no rompe el encaje. Lo comprueba el test de Playwright de la Task 2.
5. **Lobby con juegos elegidos pero incompatibles:** el aviso no dice «Elige al menos un minijuego.». Lo comprueba `explains how each order mode uses the compatible games` (Task 3).
6. **Sin oráculo para el impostor:** la pista de un impostor con el nombre exacto del secreto se acepta; solo se rechaza la de un inocente. Lo comprueba `impostorClueIsNeverComparedWithTheSecret` (Task 4).
7. **Misma regla en los dos lados y fixtures intactas:** «pikachuuu», «PIKACHÚ» y «pi-ka-chu» se rechazan en Java y en TS, en los dos modos; el `git diff --stat` de `golden/` tras regrabar solo muestra `secret-name-clue.json`. Lo comprueban `innocentClueWithSecretNameIsRejectedInBothModes`, el Vitest de `validateImpostorClue` y el Step 5 de la Task 4.

---

### Task 1: Impostor: proyección `fellowImpostorIds`

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorTypes.java`: componente y setter del `Builder` de `PokemonImpostorPlayerState`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorEngine.java`: `getPlayerState`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorRules.java`: helper `fellowImpostorIds`
- Modify: `packages/shared/src/games/pokemon-impostor/types.ts`: `PokemonImpostorPlayerState`
- Modify: `backend/src/test/resources/golden/pokemon-impostor/guess-and-presence.json` (regrabada), y también `one-word-mode.json` si existe
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorEngineTest.java`

**Interfaces:**
- Produces:
  - `record PokemonImpostorPlayerState(@Nullable ImpostorRole role, @Nullable SecretPokemon secretPokemon, @Nullable Map<String, ImpostorRole> revealedRoles, @JsonInclude(JsonInclude.Include.NON_NULL) @Nullable List<String> fellowImpostorIds, boolean alive, …)`, con el resto de componentes igual.
  - `Builder.fellowImpostorIds(@Nullable List<String> value)`. `build()` congela la lista con `frozenList` si no es `null`.
  - En `PokemonImpostorRules`: `static @Nullable List<String> fellowImpostorIds(PokemonImpostorState state, String playerId)`. Devuelve `null` si el jugador no es impostor o si no hay otro impostor. Si no, devuelve la lista en el orden de `playerIds`.
  - En TS: `fellowImpostorIds?: string[]` tras `revealedRoles`, con un comentario: «Solo para un impostor con compañeros; ausente en el resto».

- [ ] **Step 1: Tests que fallan** en `PokemonImpostorEngineTest`, con el catálogo dorado y 5 jugadores, como `hidesTheSecretFromTheLivingImpostor`:
  - `fellowImpostorsSeeEachOtherInBothModes`, con `@ParameterizedTest @EnumSource(PokemonImpostorMode.class)` e `impostorCount: 2`:
    - cada impostor recibe una lista con exactamente el otro;
    - el JSON serializado de un inocente no contiene `"fellowImpostorIds"`;
    - un espectador y un id ajeno (`"nadie"`) tampoco la contienen;
    - tras expulsar a uno de los dos impostores, el otro sigue viéndolo en la lista.
  - `singleImpostorHasNoFellowKey`: con `impostorCount: 1`, ningún JSON de jugador contiene la clave.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*PokemonImpostorEngineTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar.**
  - El componente va en la posición de la spec: el orden de claves de la proyección es el de los componentes.
  - El patrón que hay que copiar es el de un componente `NON_NULL` dentro de un record con `@JsonInclude(ALWAYS)` en la clase: `@Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<String> alive`, en `HigherLowerTypes.java:214`, o `groupsSeen` en `LearnsetGuessTypes.java:109`.
  - El helper de `PokemonImpostorRules` se llama desde `getPlayerState` con `.fellowImpostorIds(...)`.
  - El Javadoc de `getPlayerState` dice quién ve la lista. No se ramifica por `config.mode()`.
  - Se añade el campo TS.
- [ ] **Step 4: Regrabar y revisar:**
  1. `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'`;
  2. `git diff --stat backend/src/test/resources/golden/`: tiene que listar solo `pokemon-impostor/guess-and-presence.json`, y `one-word-mode.json` si existe;
  3. `git diff` de ese fichero: solo aparecen líneas `"fellowImpostorIds"` dentro de `playerStates`.
  Si cambia algo más, para y corrige el motor. `-Dupdate=true` regraba todas las fixtures del árbol, también las de otro agente: las de `type-duel` ya estaban modificadas y no son de esta task. No las añadas ni las reviertas: nada de `git checkout`, que destruiría trabajo ajeno. Si cambia una fixture ajena que estaba limpia, para y avisa.
- [ ] **Step 5: Ejecutar** `./gradlew test --tests '*PokemonImpostorEngineTest*' --tests '*GoldenReplayTest*' --tests '*GoldenRegistryConsistencyTest*'` y `npm run typecheck`. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Impostor: con varios impostores, cada uno ve a sus compañeros`. Solo los ficheros de esta task.

### Task 2: Impostor: los compañeros en la tarjeta de rol

**Files:**
- Modify: `frontend/src/room/pokemon-impostor-texts.ts`: helper de texto
- Modify: `frontend/src/games/pokemon-impostor/ImpostorParts.tsx`: `ImpostorRoleReveal`, `ImpostorRolePanel` e `ImpostorRoleStrip` reciben `people`
- Modify: `frontend/src/games/pokemon-impostor/presentation.ts`: `impostorAnnouncement`
- Modify: `frontend/src/games/pokemon-impostor/PokemonImpostor.module.css`: la línea de aliados y el recorte de la línea del móvil
- Modify: `frontend/src/room/PokemonImpostorGame.tsx`: pasa `people` a las tres piezas
- Modify: `e2e/tests/juegos.spec.ts`: test nuevo
- Modify: `e2e/src/helpers.ts`: parámetro opcional `prefijos` de `crearSalaConJugadores`
- Test: `frontend/src/room/pokemon-impostor-texts.test.ts`, `frontend/src/room/PokemonImpostorGame.test.tsx`

**Interfaces:**
- Consumes: `fellowImpostorIds` de la Task 1 y `ImpostorPeople` (`nameOf`) de `ImpostorParts.tsx`.
- Produces:
  - `impostorFellowsText(names: readonly { name: string; out: boolean }[]): string | null`. Devuelve `null` con la lista vacía y, si no, los textos de las Global Constraints.
  - `impostorFellowsShort(names: readonly string[]): string | null`. Devuelve `con Ana y Bea`, o `null` con la lista vacía.
  - `ImpostorRoleReveal({ player, people })`, `ImpostorRolePanel({ player, phase, guessOpen, onToggleGuess, people })` e `ImpostorRoleStrip({ player, people })`.
  - `impostorAnnouncement(game, player, selfId, nameOf)`: `player` añade `'fellowImpostorIds'` a su `Pick`, y la firma no cambia en lo demás.
  - Atributo `data-testid="impostor-fellows"` en la línea de aliados de la tarjeta y del panel.

- [ ] **Step 1: Tests que fallan:**
  - `pokemon-impostor-texts.test.ts`:
    - un aliado da `Otro impostor: Ana`;
    - dos, `Otros impostores: Ana y Bea`;
    - tres, `Ana, Bea y Carla`;
    - un expulsado lleva ` (fuera)`;
    - la lista vacía da `null`;
    - `impostorFellowsShort(['Ana', 'Bea'])` da `con Ana y Bea`.
  - `PokemonImpostorGame.test.tsx`:
    - en `ROLE_REVEAL`, un impostor con `fellowImpostorIds: ['p2']` ve `Otro impostor: Ana`;
    - un inocente y un impostor sin la clave no pintan `impostor-fellows`;
    - en `CLUE_PHASE`, el panel lateral y la línea del móvil (`con Ana`) lo muestran;
    - `impostorAnnouncement` en `ROLE_REVEAL` da `Reparto de roles: eres impostor, con Ana.`.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/room/pokemon-impostor-texts.test.ts frontend/src/room/PokemonImpostorGame.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - La línea de aliados es un `<p className={s.help} data-testid="impostor-fellows">`, con los nombres en `<strong>`.
  - En `ImpostorRoleStrip`, con aliados, la nota `Impostor · no conoces el Pokémon` pasa a `con …`. La clase de la nota recibe `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, y el texto completo va en `title`.
  - Para saber si un aliado está fuera se usa `game.eliminatedIds`, que se pasa desde `PokemonImpostorGame`.
- [ ] **Step 4: Ejecutar** los tests del Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Test de Playwright** en `e2e/tests/juegos.spec.ts`, llamado `pokemon-impostor: con dos impostores, cada uno ve al otro`:
  1. Abrir la sala con `crearSalaConJugadores(browser, 5, undefined, ['Host', 'Entrenadora Largaa1', 'Entrenadora Largaa2', 'Entrenadora Largaa3', 'Entrenadora Largaa4'])`.
     - Hoy el helper no admite nombres. Hay que añadir en `e2e/src/helpers.ts` un cuarto parámetro opcional, `prefijos?: readonly string[]`, que sustituya a `'Host'` y `` `Inv${i}` `` como prefijo de `uniqueName`.
     - Cada prefijo tiene 19 caracteres. Con el sufijo de 5 de `uniqueName` (espacio y 4 caracteres), el nombre llega a 24, el máximo de `displayNameSchema`.
     - Los 4 invitados llevan nombre largo, así que todo impostor tiene al menos un aliado con nombre de 24 caracteres, salvo si el otro impostor es el host. El test anota qué nombres salieron.
  2. `seleccionarJuego(host.page, 'Pokémon Impostor')` y, en «Configuración», `Impostores` a 2 (con `Home` y `ArrowRight` en el `slider`) y `Tiempo por pista` a 120 s.
  3. En `ROLE_REVEAL`:
     - exactamente 2 páginas muestran `impostor-fellows`;
     - cada una contiene el nombre de la otra;
     - las 3 páginas inocentes no lo muestran.
  4. En `CLUE_PHASE`, con la página de un impostor, `capturarTamanos(page, 'juego-pokemon-impostor-aliados')` a los tres tamaños. A 390×844, `impostor-role-strip` está `toBeInViewport({ ratio: 1 })` y contiene `con `.
  5. `capture()` con sus valores por defecto: sin scroll horizontal y `measureLayout` vacío a 13 px.
  6. `collectErrors` vacío en las 5 páginas.
- [ ] **Step 6: Ejecutar** `npm run ui:check -- juegos -g "dos impostores"` y `npm run ui:check -- juegos -g "pokemon-impostor: roles"`, porque el test existente comprueba el texto de la línea con un impostor. Esperado: PASS, con capturas a tres tamaños y sin avisos de tamaños que falten.
- [ ] **Step 7: Revisar las capturas** de `e2e/screenshots/juego-pokemon-impostor-aliados*` y puntuar la tarjeta de rol con aliados con `docs/visual-review.md`. Mínimo 19/24 y ningún criterio a 0.
- [ ] **Step 8: Commit** con el mensaje `Impostor: la tarjeta de rol muestra a los otros impostores (rúbrica: N/24)`.

### Task 3: Lobby: aviso de la selección vacía

**Files:**
- Modify: `frontend/src/room/GameSelectionConfig.tsx`: `gameOrderHint` y `GameOrderChoice`
- Modify: `e2e/tests/sala.spec.ts`: el test de la línea 150
- Test: `frontend/src/room/GameSelection.test.tsx`

**Interfaces:**
- Produces: `gameOrderHint(type: GameSelectionType, compatibleCount: number, selectedCount: number): string`. `GameOrderChoice` la llama con `mode.gameIds.length`, y su firma (`OrderProps`) no cambia.

- [ ] **Step 1: Tests que fallan** en `explains how each order mode uses the compatible games`. Las llamadas existentes pasan a 3 argumentos (`selectedCount` igual a `compatibleCount`) y se añaden:
  - `gameOrderHint('ORDER', 0, 0)` da `Elige al menos un minijuego.`;
  - `gameOrderHint('VOTE', 0, 2)` da `Ninguno de los minijuegos elegidos admite a los jugadores de ahora.`;
  - `gameOrderHint('RANDOM', 1, 3)` da `Con un solo minijuego compatible, se juega siempre ese.`;
  - un render de `GameOrderChoice` con `gameIds: []` contiene `Elige al menos un minijuego.`.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/room/GameSelection.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Comprueba primero `selectedCount === 0`, después `compatibleCount === 0` y luego `compatibleCount === 1`. El resto queda igual.
- [ ] **Step 4: Ejecutar** el test del Step 2, `npx vitest run frontend/src/room/Lobby.test.tsx`, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Playwright.** En `el host quita el único minijuego`, tras abrir la pestaña `Modo y sesión`:
  - `await expect(host.page.getByRole('status').filter({ hasText: 'Elige al menos un minijuego.' })).toBeVisible()`;
  - captura `lobby-modo-seleccion-vacia` a los tres tamaños, con `capture()` y sus valores por defecto. Se recorre `SIZES` como en la captura `lobby-seleccion-vacia` del mismo test.
- [ ] **Step 6: Ejecutar** `npm run ui:check -- sala -g "quita el único minijuego"`. Esperado: PASS, con las capturas a tres tamaños.
- [ ] **Step 7: Revisar las capturas** y puntuar «Modo y sesión» vacía con `docs/visual-review.md`. Mínimo 19/24 y ningún criterio a 0.
- [ ] **Step 8: Commit** con el mensaje `Lobby: con la selección vacía, Modo y sesión pide elegir un minijuego (rúbrica: N/24)`.

### Task 4: Impostor: una pista no puede contener el nombre del Pokémon

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorRules.java`: `lettersOnly` y `mentionsSecret`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorEngine.java`: `submitClue`
- Modify: `frontend/src/games/pokemon-impostor/validation.ts`: `validateImpostorClue` y `IMPOSTOR_SECRET_NAME_ERROR`
- Modify: `frontend/src/room/PokemonImpostorGame.tsx`: la llamada de la línea 48 pasa `player.secretPokemon?.name`
- Create: `backend/src/test/resources/golden/pokemon-impostor/secret-name-clue.json`
- Modify: `e2e/tests/juegos.spec.ts`: el test `pokemon-impostor: roles, pistas, …`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorEngineTest.java`, `frontend/src/games/pokemon-impostor/validation.test.ts`

**Interfaces:**
- Produces:
  - En `PokemonImpostorRules`:
    - `static String lettersOnly(String value)`: NFD, sin `\p{M}`, `toLowerCase(Locale.ROOT)` y solo `\p{L}`;
    - `static boolean mentionsSecret(String clue, Pokemon secret)`: `true` si `lettersOnly(clue)` contiene `lettersOnly` de `secret.name()` o de `names.get("es")` / `names.get("en")` cuando son `String`, descartando los vacíos.
  - En `submitClue`, después de la comprobación de 25 caracteres: si el jugador es `INNOCENT` y `mentionsSecret(text, context.pokemon().byId(state.secretPokemonId()))`, `GameActionResult.reject(state, "No puedes decir el nombre del Pokémon.")`. Comentario en español: por qué el impostor no se comprueba (oráculo).
  - En TS:
    - `export const IMPOSTOR_SECRET_NAME_ERROR = 'No puedes decir el nombre del Pokémon.'`;
    - `validateImpostorClue(text: string, mode: PokemonImpostorMode | undefined, secretName?: string | null): string | null`: primero la regla de `ONE_WORD` y después la del nombre, con la misma normalización (`normalize('NFD')`, `/\p{M}/gu`, `toLowerCase()`, `/[^\p{L}]/gu`). Sin `secretName` (el impostor), no comprueba el nombre.

- [ ] **Step 1: Tests que fallan.**
  - En `PokemonImpostorEngineTest`, con el catálogo dorado:
    - `innocentClueWithSecretNameIsRejectedInBothModes`, con `@ParameterizedTest @EnumSource(PokemonImpostorMode.class)`: el inocente en turno envía el nombre del secreto en mayúsculas, con tilde y con letras repetidas (`<nombre>uuu`) y separado por guiones; los cuatro rechazos llevan `No puedes decir el nombre del Pokémon.`, el estado no cambia y el turno sigue siendo suyo; después una pista válida se acepta;
    - `regionalFormBlocksTheBaseName`: con un secreto de forma regional (por ejemplo `raichu-alola`), la pista «raichu» se rechaza por `names.es`;
    - `impostorClueIsNeverComparedWithTheSecret` (Review Focus 6): el impostor en turno envía el nombre exacto del secreto y se acepta;
    - `shortNamesBlockWordsThatContainThem`: `mentionsSecret("cabra", abra)` es `true` (falso positivo aceptado y fijado);
    - `emptyNormalizedNameBlocksNothing`: un nombre que queda vacío al normalizar no bloquea ninguna pista.
  - En `validation.test.ts`:
    - con `secretName` `Pikachu`, `pikachuuu`, `PIKACHÚ` y `pi-ka-chu` dan `No puedes decir el nombre del Pokémon.`, en `CLASSIC` y en `ONE_WORD`;
    - `ratón eléctrico` en `CLASSIC` da `null`;
    - en `ONE_WORD`, `pika chu` da el error de una palabra (va antes);
    - sin `secretName` (`null` o ausente), `Pikachu` da `null`.
- [ ] **Step 2: Ejecutar** `cd backend && ./gradlew test --tests '*PokemonImpostorEngineTest*'` y `npx vitest run frontend/src/games/pokemon-impostor/validation.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** según las Interfaces y pasar `player.secretPokemon?.name` desde `PokemonImpostorGame.tsx`. El error es del campo (un solo dueño): no se anuncia en la región viva ni se publica en el aviso de la sala. Un rechazo del servidor que el cliente no vio (forma regional, Nidoran) llega al aviso de la sala por `gameAction`, y la pantalla sigue con `ignoreFailure`.
- [ ] **Step 4: Fixture nueva** `secret-name-clue.json`, copiando `one-word-mode.json` (semilla 1509, 4 jugadores, `impostorCount: 1`, Eevee) con `mode: CLASSIC`. Un solo impostor, para que la Task 1 no la toque:
  - el inocente en turno envía `Eevee`, `EÉVÉE` y `eeveeee` (tres rechazos con el texto nuevo) y después una pista válida;
  - en su turno, el impostor envía `Eevee` y se acepta.
- [ ] **Step 5: Regrabar y revisar:**
  1. `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'`;
  2. `git diff --stat backend/src/test/resources/golden/` y `git status --short backend/src/test/resources/golden/`: el único cambio es el fichero nuevo `pokemon-impostor/secret-name-clue.json`. Las siete fixtures existentes de Impostor no cambian, porque ninguna tiene una pista con el nombre de su secreto;
  3. en la fixture nueva, los tres `afterSteps` rechazados llevan `"error": "No puedes decir el nombre del Pokémon."` y el del impostor va `"accepted": true`.
  Si cambia algo más, para y corrige el motor. Las mismas cautelas que la Task 1 con las fixtures de otros agentes: nada de `git checkout` ni `git add -A`.
- [ ] **Step 6: Ejecutar** `./gradlew test --tests '*PokemonImpostorEngineTest*' --tests '*GoldenReplayTest*'`, `npx vitest run frontend/src/games/pokemon-impostor/validation.test.ts frontend/src/room/PokemonImpostorGame.test.tsx`, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 7: Playwright.** En el test `pokemon-impostor: roles, pistas, …` de `e2e/tests/juegos.spec.ts`, cuando le toca pista a un inocente: escribe el nombre que lee de `[data-impostor-secret]` seguido de `uuu`, comprueba que el campo muestra `No puedes decir el nombre del Pokémon.` y que «Enviar pista» está desactivado, captura `juego-pokemon-impostor-pista-nombre` a los tres tamaños con `capture()` y sus valores por defecto, y borra el texto antes de seguir con la pista de siempre.
- [ ] **Step 8: Ejecutar** `npm run ui:check -- juegos -g "pokemon-impostor: roles"`. Esperado: PASS, con las capturas a tres tamaños. Revisar las capturas; el campo con error usa el estado de error que ya existe del componente, así que no hay pantalla nueva que puntuar con la rúbrica.
- [ ] **Step 9: Commit** con el mensaje `Impostor: una pista no puede contener el nombre del Pokémon`. Solo los ficheros de esta task.
