# Minijuegos, Fase 1 (equidad y anti-copia): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que copiar, esperar o desconectarse deje de dar ventaja en los 6 primeros minijuegos, y que la API no regale las respuestas (Fase 1 de §10).

**Architecture:**
- **Motores.** Cada cambio va en el TS (`packages/shared/src/games/<id>/`, el oráculo) y en su port Java (`backend/src/main/java/es/pokemonuniverse/domain/game/engines/<idsinguiones>/`) en el **mismo commit**. Lo acompañan el escenario dorado nuevo, las fixtures regeneradas y la UI de `frontend/` que lo consume.
- **Configuración.** Los valores por defecto anti-copia se cambian **renombrando** la clave o el valor del enumerado (§11.2). Así `migrateStoredGameConfig` y `StoredGameConfigMigration` reinician solos lo guardado, sin migración de datos.
- **Sala.** La gracia de presencia vive solo en el `RoomCoordinator` de Java, guiada por un campo nuevo del manifiesto.
- **Catálogo.** El catálogo reducido y el proxy de sprites nacen solo en Java, y se retira `GET /api/pokemon`. Node (`apps/server`) solo se toca para que sus tests y su compilación sigan en verde.

**Tech Stack:** TypeScript ESM + Zod + Vitest (shared, frontend), Java 25 + Micronaut + JUnit (backend), React + Tailwind (frontend), Playwright (e2e).

**Spec:** `/home/eru/Documents/Projects/PokemonUniverse/MINIJUEGOS_MEJORAS.md`. No tiene seguimiento en git, así que se lee siempre por ruta absoluta. Secciones de esta fase:
- §10 «Fase 1»;
- §2.3 y §2.7 (D2, D3, D5);
- §3.3, §3.7 y §3.8 (S1, S2, S3, S4, S5);
- §5.3 y §5.7 (H1, H8);
- §6.3 y §6.7 (T2, T3, T6);
- §7.3 y §7.7 (L3, L4);
- §8.3, §8.7 y §11.2 y §11.5.

**Rama:** `minijuegos-fase-1`, apilada sobre `minijuegos-fase-0` (`e86f9cb`). Este plan está en `.superpowers/` (ignorado por git) y también se lee por ruta absoluta. Si otro agente está haciendo commits en el checkout principal, la ejecución va en un worktree aparte (superpowers:using-git-worktrees).

---

## Diferencias entre el documento y el repositorio actual

El documento es anterior a la etapa 2D. Lo que manda es lo de aquí:

- `apps/web/src/...` ahora es `frontend/src/...`, con los mismos nombres de fichero.
- **Node (`apps/server`) ya no se despliega.** Java sirve todo `/api` y `/ws`.
  - La «gracia de presencia en `manager.ts` y en `RoomCoordinator`» pasa a ser **solo `RoomCoordinator`**.
  - El arreglo de la precarga de Shiny «en Node y Java» pasa a ser **solo Java**, más el contrato TS opcional que lo alimenta.
  - `apps/server` sí compila y ejecuta sus Vitest dentro de `npm test` (`package.json:17`, que hace `build -w @pokemon-universe/server` y `test --workspaces`). Por eso sus tests que fijan los literales viejos de configuración se actualizan en la misma tarea que el renombrado.
- `npm run test:e2e:java` ya no existe. `npm run test:e2e` va contra Java.
- **El esquema es de Flyway, no de Prisma.** Esta fase no cambia ningún esquema de BD.
- **Rutas Java nuevas:**
  - `infra/nginx.conf:22` (`location ^~ /api/`) y el proxy de Vite (`frontend/vite.config.ts:7`, `'/api'`) ya reenvían todo `/api`, así que **no cambian**.
  - Sí cambian el OpenAPI (`./gradlew syncOpenApi` y `verifyOpenApi`) y `frontend/src/lib/api-types.ts` (`npm run api:types -w @pokemon-universe/web`; `npm test` ejecuta `check:api-types`).
- **`migrateStoredGameConfig` no está en shared:**
  - el oráculo es `apps/server/src/game-configs/service.ts`;
  - el espejo es `backend/.../application/gameconfigs/StoredGameConfigMigration.java`;
  - los casos compartidos son `backend/src/test/resources/gameconfigs/migration-cases.json`, generados por `generate-migration-cases.ts`, cuya cabecera tiene el comando.
- **`registry.json` lleva `defaultConfig` y el manifiesto.** Cambiar un valor por defecto o un manifiesto obliga a `npm run build -w @pokemon-universe/shared && npm run registry:export`, porque `npm test` ejecuta `check:registry`.
- **Mensajes de configuración.** Cambiar una clave cambia los mensajes fijados en `backend/src/test/resources/config-messages.json`. Se regenera con `cd backend && ./gradlew test -Dupdate=true --tests '*ConfigMessagesSnapshotTest*'`.

## Verificación de las afirmaciones del documento (código actual, tras la Fase 0)

| Id | ¿Sigue vigente? | Evidencia actual |
|---|---|---|
| H1 copiar en Higher or Lower | Sí | `higher-lower/config.ts:7` (`['REALTIME','REVEAL']`), `:25` (por defecto `REALTIME`); `server.ts:77` (`showAnswers`). No hay bonus de rapidez (`server.ts:43-44`). Java: `HigherLowerConfig.java:31,39`, `HigherLowerEngine.java:239` |
| S1 votos en vivo en Shiny | Sí | `shiny-vote/config.ts:14,25` (`showVotes: true`); `server.ts:234` (`votes`) y `:217` (`publicLastRound`). Java: `ShinyVoteConfig.java:19,47`, `ShinyVoteEngine.java:290,302-303` |
| S2 precarga inútil | Sí | `shiny-vote/server.ts:80` precarga `option.sprite` como `ORIGINAL`; `resolveAsset` (`:259-266`) pide `PIXEL_ART`/`PALETTE_RECOLOR`. Java: `ShinyVoteEngine.java:133-134` → `RoomCoordinator.java:1208` (`assets::preload`) → `GameAssetService.java:42-50` (`AssetResolution.original`), con `cacheKey` (`:53`) que incluye la transformación |
| S3 shiny que no lo es | Sí, pero **no se ve en golden** | `shiny-vote/server.ts:48` (`shinySprite ?? sprite`), `:56` (pool sin filtrar). El catálogo dorado `gen1-2` tiene **0** Pokémon sin `shinySprite`: el filtro solo se puede probar con Vitest y JUnit sobre catálogos propios |
| S5 paletas predecibles | Sí | `shiny-vote/filters.ts:7-14`; `server.ts:60` (`fakePaletteIndex = 0` en cada ronda) |
| D2/D3 selección visible y bloqueo | Sí | `pokedex-distance/server.ts:156` (rechazo «Ese Pokémon ya ha sido elegido.»), `:165` (`lockedPokemonIds`), `:188-191` (`selections` públicas con nombre y sprite), `:210`. Front: `PlayerList.tsx:39,56,62`, `PokedexDistanceGame.tsx:20,45` |
| D5 un microcorte elimina | Sí | `RoomCoordinator.java:385-386` (`markTemporarilyDisconnected` → `applyPresenceChange` al instante), `:1188-1191` (`context`: `connected = presence == CONNECTED`) |
| L3 la puntuación se aplana | Sí | `learnset-guess/rules.ts:8-10`; `server.ts:152` (sin bonus por orden) |
| L4 espera muerta | Sí | `learnset-guess/server.ts:158` (solo se cierra cuando aciertan todos o en `roundEndsAt`) |
| T2/T3 desconectarse anula | Sí | `type-duel/server.ts:102-107` (`DISCONNECTED` sin puntos); Java `TypeDuelEngine.java:317-327` |
| Impostor sin plazo con `clueOrder` vacío (pendiente de la Fase 0) | Sí | `pokemon-impostor/server.ts:87` (`roundEndsAt: clueOrder.length > 0 ? … : null`); Java `PokemonImpostorEngine.java:146` |
| D1/S4/H8/T6 fuga por `/api/pokemon` | Sí, y **peor de lo descrito** | `PokemonController.java:37-43` + `PublicPokemon.java` (todos los campos salvo la paleta). Además `PokemonCatalogService.search` ordena por `nationalDexNumber` (`PokemonCatalogService.java:81-89`): **el índice del array ya da el número** aunque se quite el campo. El sprite es `…/sprites/pokemon/1.png` (catálogo dorado) |
| §8.7 consumidores | Sí | Solo `frontend/src/hooks/usePokemonPool.ts`, usado por 18 pantallas de `frontend/src/room/` (Bluff Auction, Bingo, Cry Quiz…). `frontend/src/lib/api-contract.ts:28` (`PokemonResponse`) no lo usa nadie. Los `pokemon.types`/`generation`/`nationalDexNumber` del front salen de `result.*` o `lastRound.*` del estado, no del catálogo |
| Ids de Pokémon | Son slugs | `bulbasaur`, `raichu-alola`: `/api/pokemon/{id}/sprite` no filtra el número |

**Ya hecho o descartado:**
- `canAnswer` de Higher or Lower, D4, D7 y la paridad de Impostor: hechos en la Fase 0.
- Se descartan de esta fase:
  - cambios en `apps/server/src/rooms/manager.ts`, `presence.ts` y `game-image-cache.ts` (Node);
  - el skeleton de carga de las cartas de Shiny y la revelación de 4 s (§3.4, Fase 2);
  - `disconnectedSince` en el motor de Type Duel (ver Decisión 9);
  - las opciones `maxTiebreaks`/`mode` de Distance y la dificultad de Shiny (Fase 3);
  - el `?v=<versión>` del selector en el estado de la sala (se usa `ETag`).

## Decisiones

Se toman de las recomendaciones del propio documento. Si no hay ninguna, se elige la opción mínima que cumple el criterio de aceptación. Las marcadas **(más allá del documento)** o **(se desvía del documento)** las puede vetar el usuario.

1. **§11.2, renombrar en vez de migrar.** Es la recomendación del documento.
   - Higher or Lower: el enumerado pasa a `HIGHER_LOWER_VISIBILITIES = ['LIVE', 'REVEAL']` y el valor por defecto a `'REVEAL'`.
     - Un `REALTIME` guardado deja de validar y se repara al nuevo valor por defecto `REVEAL`.
     - Un `REVEAL` guardado se conserva.
   - Shiny Quiz: `showVotes: boolean` pasa a ser `voteVisibility: 'REVEAL' | 'LIVE'`, en la misma posición (tras `optionCount`), con `'REVEAL'` por defecto. `mergeKnown` descarta `showVotes`.
   - Consecuencia aceptada: todo el que tenía guardado el modo en vivo vuelve a «al revelar».
2. **Shiny `REVEAL` = votos visibles al revelar** (§3.3). Durante `ROUND_ACTIVE`, `votes` público vacío. En `ROUND_RESULTS`/`GAME_RESULTS`, los votos completos y el `lastRound` completo.
   - **(Se desvía del documento)** El antiguo `showVotes: false` también ocultaba los votos al revelar. Ese modo «nunca» desaparece.
3. **§3.9 y §5.9: el modo en vivo se mantiene** como opción social. Se llama `LIVE` en los dos juegos. El panel avisa con el literal `'Permite copiar: los demás ven tu elección al momento.'`.
4. **Bonus de rapidez en Higher or Lower** (§5.3).
   - Vale `HIGHER_LOWER_SPEED_BONUS = 1`.
   - Se gana si se acierta con `answeredAt - roundStartedAt < roundSeconds * 500`, en los dos modos.
   - Suma en `awardedPoints`. Las estadísticas no cambian.
5. **Shiny: pool y paletas** (§3.3).
   - El pool es `forGenerations(...).filter((p) => Boolean(p.shinySprite))`, también en la comprobación de `createInitialState`.
   - Las paletas se barajan con `shuffled(FAKE_SHINY_PALETTES, context.random)`. La extracción va **justo después** de la de `correctIndex` y **antes** del `map` de opciones. Las falsas toman `palettes[fakePaletteIndex++ % palettes.length]`.
   - Cambian todas las fixtures de Shiny.
6. **Precarga de Shiny solo en Java, con contrato aditivo.**
   - TS: `GameContext.preloadAsset?: (asset: GameAssetResolution) => void`.
   - Java: `@Nullable Consumer<AssetResolution> preloadAsset` en `GameContext`, más `GameAssetService.preload(AssetResolution)`.
   - `preloadImage(string)` no cambia, porque cambiarlo rompería Node y 10 motores.
   - El motor precarga la misma resolución que sirve `resolveAsset`, también en la primera ronda.
7. **Pokédex Distance: `selectionVisibility: 'HIDDEN' | 'LIVE'`, con `'HIDDEN'` por defecto** (§2.7). Es una clave nueva, así que lo guardado toma `HIDDEN` sin migración.
   - En `HIDDEN` **no hay bloqueo**: dos jugadores pueden elegir el mismo Pokémon y reciben la misma distancia (§2.3 y la respuesta de §2.9).
   - `selections` públicas siempre vacías (`lastRound` ya revela), también en `TIEBREAKER_ACTIVE`.
   - Nuevo `selectedIds` público.
   - `LIVE` conserva el comportamiento actual, con bloqueo.
8. **Learnset.**
   - Bonus por orden: `LEARNSET_ORDER_BONUSES = [2, 1]`, y `learnsetPoints(revealStage, solveOrder) = max(1, 5 − stage) + (bonus[solveOrder−1] ?? 0)`, que entra en `points`, `pointsFromSolves` y `bestRoundPoints`.
   - Último aviso: `LEARNSET_LAST_WARNING_MS = 10_000`. Si ha acertado al menos uno y entre los requeridos queda **exactamente un** jugador sin acertar, `roundEndsAt = min(roundEndsAt, now + 10 s)`.
     - Se fija un `lastWarning: true` para que lo pinte la UI.
     - Si la pista pendiente (`nextTransitionAt`) cae en o después del nuevo final, pasa a `null`.
     - Se comprueba tras cada acierto y en `handlePresenceChange`. Nunca alarga la ronda.
     - Una vez saltado el aviso, el cierre recortado se mantiene aunque un jugador reconecte y vuelvan a faltar dos (nunca se alarga).
9. **Gracia de presencia (§8.3 y §11.5, con 10 s fijos y sin configurar por sala).**
   - Campo opcional del manifiesto `presenceGraceMs`, con la constante `PRESENCE_GRACE_MS = 10_000` en `contracts.ts`, en los 6 juegos del documento.
   - **Se desvía de §6.7:** la gracia vive en la sala, no en el motor de Type Duel (sin `disconnectedSince`). §8.3 dice «ningún motor tiene que cambiar» y §6.7 propone un campo en el motor. Se toma §8.3: un solo mecanismo para los 6 juegos.
   - Durante la gracia, el motor ve al jugador conectado. La UI ya pinta `TEMPORARILY_DISCONNECTED` como «Reconectando…» (`PlayerList.tsx:43`, `Avatar.tsx:19`).
   - La gracia nunca alarga `roundEndsAt`: solo evita cierres anticipados.
   - La gracia efectiva es `min(presenceGraceMs, reconnectGraceMs)`: si antes vence la de reconexión, el jugador pasa a `LEFT`.
   - `ManifestView` (el manifiesto que viaja en la vista de sala) **no** la lleva. Solo `GameManifest` (`/api/games`), que comparte record con `registry.json`.
10. **Type Duel: forfeit tras la gracia** (§6.3). Cuando el motor recibe el cambio de presencia (pasados los 10 s):
    - con **un** duelista ausente: motivo nuevo `'DISCONNECT_FORFEIT'`, `+5` al rival, cuenta como duelo jugado (estadísticas) y `disconnectedIds` igual a `[ausente]`;
    - con **los dos** ausentes: sigue siendo `'DISCONNECTED'` sin puntos.
    - Coste aceptado (vetable): durante la gracia, `selectPlayers` puede emparejar a quien acaba de caerse. Si no vuelve, a los 10 s su rival gana +5 por abandono. Es el precio de poner la gracia en la sala.
11. **Impostor (pendiente de la Fase 0):** `beginCluePhase` fija siempre `roundEndsAt = now + clueSeconds·1000`. Con `clueOrder` vacío, el plazo vence y `advanceClueTurn` pasa a `VOTING` (votación vacía, `SKIPPED` y, a las tres, `STALEMATE`).
12. **Catálogo reducido (§8.7).**
    - `GET /api/pokemon/selector?generations=…&includeForms=…` → `{ pokemon: [{ id, name, sprite }] }`, con `sprite = /api/pokemon/{encodeURIComponent(id)}/sprite`.
    - **Orden por nombre** (`Collations.names()`), después las formas por defecto primero y después el id. El orden por número de Pokédex filtraba el número por la posición.
    - Mandar primero las formas por defecto mantiene la deduplicación de `searchPokemonOptions` sin enviar `isDefault`.
    - Caché:
      - `Cache-Control: no-cache` más un `ETag` débil derivado del contenido (`W/"<16 primeros hex del SHA-256 del JSON>"`);
      - `If-None-Match` igual devuelve `304`;
      - así una recarga del catálogo (`f1a190d`) se ve en la siguiente petición.
    - `GET /api/pokemon/{id}/sprite` → la imagen original por un `GameAssetService` **propio**, con su `ResourceCache`, para que las miniaturas no expulsen los assets precargados de las rondas.
      - `Cache-Control: public, max-age=86400`.
      - `404` si el id no existe y `503` con `ApiError` por capacidad.
13. **Se retira `GET /api/pokemon`.** El documento ofrece «uso interno o de administración, o retirarlo», y §11.7 confirma que no hay consumidores. Dejarlo público anula todo el trabajo anti-trampas.
    - Se borra `PublicPokemon.java` si nada más lo usa, y el `PokemonResponse` de `api-contract.ts:28`.
14. **Fuera de alcance, pero anotado.** El sprite de `currentPokemon` en Higher or Lower (`higher-lower/server.ts:24`, `pokemonView`) sigue llevando el id de PokéAPI, así que en la categoría `DEX_NUMBER` la URL revela el valor antes de tiempo. El nombre del Pokémon ya lo hace consultable (§8.7, «Ojo»). Se deja para la Fase 2.

## Global Constraints

- Node 22+ y Java 25. TS ESM con dos espacios, comillas simples y punto y coma. Los comentarios Java van en español.
- **Mismo commit:** el TS del motor, el Java del motor, el escenario dorado nuevo, las fixtures regeneradas (`npm run build -w @pokemon-universe/shared && npm run golden:export`) y la UI que consume el cambio.
  - Se corrige el Java, nunca el TS ni las fixtures (`engines/README.md`).
- **Orden de claves** (constraint 13): cada campo nuevo va en la posición indicada del literal TS, con su componente Java en la misma posición del record, su setter de `Builder` y `toBuilder()`.
  - Un campo nuevo de estado o de proyección cambia **todas** las fixtures de ese motor. Revisa el diff de las fixtures viejas: solo pueden cambiar el campo nuevo y los efectos de la regla nueva.
- **Escenarios dorados nuevos:**
  - se añaden al array `scenarios` del `GoldenEngineEntry` de `packages/shared/golden/scenarios/<id>.ts`;
  - con un seed nuevo, distinto de los del fichero, ≥3 rondas cuando el juego las tenga y `catalog: 'gen1-2'`.
- **Configuración renombrada o nueva**, en la misma tarea:
  - escenarios y `configCases` con el valor nuevo, más un caso inválido con el literal viejo;
  - `npm run registry:export`;
  - snapshot de `ConfigMessagesSnapshotTest`;
  - casos nuevos en `generate-migration-cases.ts` y `migration-cases.json` regenerado;
  - literales de los tests Java y Node que fijaban la configuración vieja.
- Literales de error y de texto idénticos en TS y Java.
- La UI usa solo las clases de `frontend/src/styles.css` y los tokens. Texto de 12 px o más. Animaciones solo de `transform`/`opacity`, con `prefers-reduced-motion`.
- Los textos nuevos de la UI salen de funciones puras en `frontend/src/room/*.ts` o `frontend/src/games/<id>/*.ts`, con su Vitest.
- Commits en español, de una línea, sin prefijos ni líneas de atribución.
- **Por tarea:**
  - el Vitest del workspace tocado;
  - `npm run golden:export` (si hay motor);
  - `cd backend && ./gradlew test --tests '*GoldenReplayTest*' --tests '*<Juego>*'` (más los tests Java nombrados en la tarea);
  - `npm run lint && npm run typecheck`.
  - El `./gradlew check` y el `npm test` completos van en la Task 10.

## Review Focus

1. **Desempate de Distance en modo `HIDDEN`:** el estado público de `TIEBREAKER_ACTIVE` tampoco debe revelar elecciones. Test: `hides selections during a tiebreak` (Task 5).
2. **Último en acertar en Learnset que se desconecta:** si el que faltaba se va, la ronda se resuelve; si se va otro y queda uno, se activa el aviso. Nunca alarga un final más cercano. Tests: `last warning never extends a closer deadline` y `a disconnect can trigger the last warning` (Task 6).
3. **Un duelista vuelve justo antes de que venza la gracia:** el duelo sigue sin forfeit y sin `DISCONNECTED`. Test Java `presenceGraceReconnectKeepsTheDuelAlive` en `RoomCoordinatorTest` (Task 8).
4. **Gracia frente a gracia de reconexión de 5 s:** con `reconnectGraceMs = 5_000`, el jugador pasa a `LEFT` a los 5 s y el motor lo ve en ese momento, no a los 10 s. Test `presenceGraceEndsEarlyWhenThePlayerLeaves` (Task 7).
5. **Selector con nombres repetidos entre formas:** la forma por defecto sale antes que la regional del mismo nombre, para que la deduplicación del buscador elija la buena sin `isDefault`. Test `PokemonControllerTest.selectorPutsTheDefaultFormFirstAmongEqualNames` (Task 9).

---

### Task 1: Impostor: la fase de pistas siempre tiene plazo

**Files:**
- Modify: `packages/shared/src/games/pokemon-impostor/server.ts:87`, `server.test.ts`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorEngine.java:146`
- Modify: `packages/shared/golden/scenarios/pokemon-impostor.ts` y las fixtures de `backend/src/test/resources/golden/pokemon-impostor/`

**Interfaces:** ningún campo nuevo. `roundEndsAt` de `CLUE_PHASE` deja de ser `null`.

- [ ] **Step 1: Test que falla.** `an empty clue order still has a deadline and reaches voting`, con 4 jugadores:
  - todos se desconectan durante `ROLE_REVEAL`;
  - tras el timeout de `ROLE_REVEAL`: `phase === 'CLUE_PHASE'`, `clueOrder` vacío y `roundEndsAt === now + clueSeconds * 1000`;
  - tras el timeout en `roundEndsAt`: `phase === 'VOTING'`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- pokemon-impostor`. Debe fallar.
- [ ] **Step 3: Implementa** `roundEndsAt: context.now + state.config.clueSeconds * 1_000` sin condición, en TS y en Java (`context.now() + state.config().clueSeconds() * 1_000L`).
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Escenario dorado** `empty-clue-order-deadline` (seed 1717, 4 jugadores):
  1. desconexión de todos en `ROLE_REVEAL`;
  2. timeout a `CLUE_PHASE`;
  3. timeout a `VOTING`;
  4. reconexión de todos y votos hasta una expulsión.

  Ejecuta `golden:export`. Las fixtures viejas no deberían cambiar.
- [ ] **Step 6:** `./gradlew test --tests '*GoldenReplayTest*' --tests '*PokemonImpostor*'`.
- [ ] **Step 7:** `npm run lint && npm run typecheck`.
- [ ] **Step 8: Commit.** `Impostor: la fase de pistas siempre tiene plazo aunque no haya nadie conectado`

---

### Task 2: Higher or Lower: respuestas ocultas por defecto y bonus por rapidez

**Files:**
- Modify: `packages/shared/src/games/higher-lower/{config,rules,types,server}.ts`, `server.test.ts`
- Modify: `backend/.../engines/higherlower/{HigherLowerConfig,HigherLowerRules,HigherLowerTypes,HigherLowerEngine}.java`, `HigherLowerEngineTest.java`
- Modify: `packages/shared/golden/scenarios/higher-lower.ts` y las fixtures de `backend/src/test/resources/golden/higher-lower/`
- Modify: `backend/src/main/resources/games/registry.json` (con `registry:export`), `backend/src/test/resources/config-messages.json`
- Modify: `backend/src/test/resources/gameconfigs/generate-migration-cases.ts` y `migration-cases.json`
- Modify (literal `REALTIME` → `LIVE`):
  - `backend/src/test/java/es/pokemonuniverse/application/rooms/RoomTestKit.java:34`
  - `RoomConcurrencyTest.java:39`
  - `application/gameconfigs/UserGameConfigServiceTest.java:114`
  - `application/gameconfigs/StoredGameConfigMigrationTest.java:79` (pasa a `"LIVE"`; el test sigue esperando solo los issues de `generations`, `categories` y `rounds`)
  - `apps/server/src/rooms/manager.test.ts:522`

  `ConfigReaderTest.java` usa su propio enumerado y **no** se toca.
- Modify: `frontend/src/games/higher-lower/ConfigPanel.tsx:90-91`, `frontend/src/room/higher-lower-labels.ts`, `higher-lower-labels.test.ts`, `frontend/src/room/HigherLowerGame.tsx`

**Interfaces:**
- Produces (TS, `config.ts`): `HIGHER_LOWER_VISIBILITIES = ['LIVE', 'REVEAL'] as const`, y `answerVisibility: 'REVEAL'` en `defaultHigherLowerConfig`.
- Produces (TS, `rules.ts`): `export const HIGHER_LOWER_SPEED_BONUS = 1;` y `export function speedBonus(answeredAt: number, roundStartedAt: number, roundSeconds: number): number` (1 si `answeredAt - roundStartedAt < roundSeconds * 500`, si no 0).
- Produces (TS, `types.ts`): `HigherLowerOutcome = { choice, correct, basePoints, streakBonus, speedBonus: number, awardedPoints, streak }`, en este orden. `awardedPoints = basePoints + streakBonus + speedBonus`.
- Java:
  - `HigherLowerAnswerVisibility { LIVE, REVEAL }` y `defaults()` con `REVEAL`;
  - `HigherLowerRules.SPEED_BONUS = 1` y `speedBonus(long, long, int)`;
  - `HigherLowerOutcome` con `int speedBonus` tras `streakBonus`.
- Produces (front): `higherLowerVisibilityLabels: Record<HigherLowerAnswerVisibility, string> = { LIVE: 'En directo', REVEAL: 'Al revelar' }` y `higherLowerOutcomeDetail(outcome: HigherLowerOutcome): string | null`.

- [ ] **Step 1: Tests que fallan** (`higher-lower/server.test.ts`):
  - `hides other answers during ROUND_ACTIVE by default`: con `defaultHigherLowerConfig`, tras un `ANSWER` de `p1`, `getPublicState(...).answers` es `{}` y `answeredIds` es `['p1']`. Tras la revelación, `answers.p1` existe.
  - `LIVE shows answers while the round is open`.
  - `awards the speed bonus in the first half of the round`: `roundSeconds: 20`. Acierto a los 9 999 ms: `speedBonus === 1`. Acierto a los 10 000 ms: `speedBonus === 0`. Fallo rápido: `speedBonus === 0` y `awardedPoints === 0`.
  - `parses REALTIME as invalid`: `higherLowerConfigSchema.safeParse({ ...defaultHigherLowerConfig, answerVisibility: 'REALTIME' }).success === false`.
  - Ajusta los tests viejos que usaban `'REALTIME'`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- higher-lower`. Debe fallar.
- [ ] **Step 3: Implementa** en `config.ts`, `rules.ts`, `types.ts` y `server.ts`:
  - `server.ts:77`: `showAnswers` con `state.config.answerVisibility === 'LIVE' || revealPhase`;
  - en `reveal` (`server.ts:43-46`), `const speed = correct ? speedBonus(state.answers[id]!.answeredAt, state.roundStartedAt!, state.config.roundSeconds) : 0`, sumado a `scores` y al resultado.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Golden.**
  - En `golden/scenarios/higher-lower.ts`: `baseConfig.answerVisibility` pasa a `'LIVE'` (`realtime-visibility` sigue cubriendo el modo en vivo) y se añade `{ ...baseConfig, answerVisibility: 'REALTIME' }` a `configCases` como inválido.
  - Escenario nuevo `reveal-default-speed-bonus` (seed 707, 3 jugadores, 3 rondas, `answerVisibility: 'REVEAL'`), con un acierto rápido y otro lento en la misma ronda.
  - Ejecuta `golden:export` y `npm run registry:export`.
  - Diff esperado en **todas** las fixtures viejas de Higher or Lower: cada `outcomes[*]` gana `speedBonus`, y `awardedPoints`/`scores` suben donde hubo aciertos en la primera mitad. Cualquier otro cambio es una regresión.
- [ ] **Step 6: Port Java** (config, record `HigherLowerOutcome` y `reveal` en `HigherLowerEngine.java:123-164`, `getPublicState` `:239`).
  - Ejecuta `./gradlew test --tests '*GoldenReplayTest*' --tests '*HigherLower*'`.
  - Después, `./gradlew test -Dupdate=true --tests '*ConfigMessagesSnapshotTest*'`, y revisa que en el diff solo cambian los mensajes de `answerVisibility`.
- [ ] **Step 7: Migración guardada.** En `generate-migration-cases.ts`, tras los casos de `higher-lower`:
  - `add('higher-lower: REALTIME guardado pasa a REVEAL', 'higher-lower', { ...def('higher-lower'), answerVisibility: 'REALTIME', rounds: 7 })`;
  - `add('higher-lower: LIVE guardado se conserva', 'higher-lower', { ...def('higher-lower'), answerVisibility: 'LIVE', rounds: 4 })`.

  Regenera con `cd apps/server && npx tsx -e "$(cat ../../backend/src/test/resources/gameconfigs/generate-migration-cases.ts)"`. Comprueba en el JSON que el primero da `answerVisibility: 'REVEAL', rounds: 7` y el segundo conserva `LIVE`. Después, `./gradlew test --tests '*StoredGameConfigMigrationTest*' --tests '*UserGameConfigServiceTest*' --tests '*RoomConcurrencyTest*'`.
- [ ] **Step 8: Front con TDD** (`higher-lower-labels.test.ts`):
  - las dos etiquetas de visibilidad;
  - `higherLowerOutcomeDetail` devuelve:
    - `'+1 racha · +1 rapidez'` con `{ streakBonus: 1, speedBonus: 1 }`;
    - `'+1 rapidez'` con `{ streakBonus: 0, speedBonus: 1 }`;
    - `null` sin bonus.

  Después:
  - `ConfigPanel.tsx:90-91`: botones `LIVE`/`REVEAL` con las etiquetas. Bajo ellos, `<p className="text-sm font-bold text-ink/65">Permite copiar: los demás ven tu elección al momento.</p>` solo si `value.answerVisibility === 'LIVE'`.
  - `HigherLowerGame.tsx`: el detalle del resultado de cada jugador muestra `higherLowerOutcomeDetail(outcome)` junto a «✓ +N».
  - Ejecuta `npm test -w @pokemon-universe/web -- higher-lower`.
- [ ] **Step 9:** `npm test -w @pokemon-universe/server` (manager.test.ts), `npm run lint && npm run typecheck`.
- [ ] **Step 10: Commit.** `Higher or Lower: respuestas ocultas hasta revelar por defecto y bonus por rapidez`

---

### Task 3: Shiny Quiz: votos al revelar, pool solo con shiny y paletas barajadas

**Files:**
- Modify: `packages/shared/src/games/shiny-vote/{config,types,server}.ts`, `server.test.ts`
- Modify: `backend/.../engines/shinyvote/{ShinyVoteConfig,ShinyVoteTypes,ShinyVoteEngine}.java`, `ShinyVoteEngineTest.java`
- Modify: `packages/shared/golden/scenarios/shiny-vote.ts` y las fixtures de `backend/src/test/resources/golden/shiny-vote/` (cambian todas)
- Modify: `registry.json`, `config-messages.json`, `generate-migration-cases.ts`, `migration-cases.json`
- Modify (`showVotes: true` → `voteVisibility: 'LIVE'`, `false` → `'REVEAL'`):
  - `apps/server/src/rooms/manager.test.ts:114,125,235,238,401,402,432,830`
  - `apps/server/src/game-configs/service.test.ts:52`
- Modify: `frontend/src/games/shiny-vote/{ConfigPanel,ShinyGameHeader,ShinyGameSidebar}.tsx`, `frontend/src/room/ShinyVoteGame.tsx:91,112`, `ShinyVoteGame.test.tsx`
- Create: `frontend/src/games/shiny-vote/vote-visibility.ts`, `vote-visibility.test.ts`
- Modify: `docs/architecture.md:198` (párrafo de Shiny: «Public-vote rooms… hidden-vote rooms…» pasa a describir `LIVE`/`REVEAL`, el pool solo con `shinySprite` y las paletas barajadas)

**Interfaces:**
- Produces (TS):
  - `SHINY_VOTE_VISIBILITIES = ['REVEAL', 'LIVE'] as const` y `type ShinyVoteVisibility`;
  - `shinyVoteConfigSchema.voteVisibility: z.enum(SHINY_VOTE_VISIBILITIES)` en el lugar de `showVotes`, con `'REVEAL'` por defecto;
  - `ShinyVotePublicState.voteVisibility: ShinyVoteVisibility` en el lugar de `showVotes` (tras `votedPlayerIds`).
- Java: `ShinyVoteConfig.VoteVisibility { REVEAL, LIVE }` como quinto componente (`voteVisibility`), y el mismo cambio en `ShinyVotePublicState` (`ShinyVoteTypes.java:241`).
- Produces (front):
  - `shinyVotersVisible(visibility: ShinyVoteVisibility, revealed: boolean): boolean`;
  - `shinyVisibilityChip(visibility): string`, que devuelve `'Votos en directo'` o `'Votos al revelar'`.

- [ ] **Step 1: Tests que fallan** (`shiny-vote/server.test.ts`):
  - `hides votes during ROUND_ACTIVE by default and shows them at the reveal`:
    - con la configuración por defecto, tras un voto, `getPublicState(...).votes` es `{}` y `votedPlayerIds` contiene el votante;
    - tras la revelación, `votes` y `lastRound.votes` lo incluyen y `lastRound.correctPlayerIds` está completo.
  - `LIVE shows votes while the round is open`.
  - `never uses a Pokémon without shinySprite`: un catálogo de prueba con 1 Pokémon con `shinySprite` y 5 sin él. Con `SAME_POKEMON`, todas las opciones son el que tiene shiny. Con `DIFFERENT_POKEMON` y `optionCount: 4`, `createInitialState` lanza `At least 4 Pokémon are required for the selected generations`.
  - `shuffles the decoy palettes each round`: con un `random` fijo que hace que la barajada no sea la identidad, el primer `recolor` falso no es `FAKE_SHINY_PALETTES[0]`, y cada `recolor` falso pertenece a `FAKE_SHINY_PALETTES`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- shiny-vote`. Debe fallar.
- [ ] **Step 3: Implementa** (Decisiones 2 y 5).
  - `getPublicState`:
    - `votes: state.config.voteVisibility === 'LIVE' || reveal ? state.votes : {}`;
    - `voteVisibility` en la posición de `showVotes`;
    - `lastRound: reveal ? state.lastRound : null`.
  - La función de pool `shinyPool(state, context)` la usan `createOptions` y `createInitialState`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Golden.**
  - `baseConfig` con `voteVisibility: 'LIVE'`. Renombra los escenarios si su nombre deja de describirlos: `same-pokemon-show-votes` sigue con `LIVE` y `different-pokemon-hidden-votes` pasa a `REVEAL`.
  - `configCases`: sustituye `showVotes: 'true'`/`undefined` por `voteVisibility: 'SHOW'`/`undefined` y añade `{ ...baseConfig, voteVisibility: undefined, showVotes: true }` como inválido.
  - Escenario nuevo `reveal-default-shuffled-palettes` (seed 919, 3 jugadores, 3 rondas, `REVEAL`).
  - Ejecuta `golden:export` y `registry:export`. Revisa que **todas** las fixtures de Shiny cambian solo en las paletas (`recolor` en los pasos `asset`), en `votes`/`lastRound` y en `voteVisibility`.
- [ ] **Step 6: Port Java.**
  - `createOptions` (`ShinyVoteEngine.java:106-128`): `Randoms.shuffled(ShinyVoteFilters.FAKE_SHINY_PALETTES, context.random())` justo tras `correctIndex`.
  - El pool filtra `pokemon.shinySprite() != null && !pokemon.shinySprite().isEmpty()`.
  - También `getPublicState` (`:285-310`) y `createInitialState`.
  - En `ShinyVoteEngineTest`: `neverUsesAPokemonWithoutShinySprite`, con un `InMemoryPokemonCatalog` propio que repite el caso del Step 1.
  - Ejecuta `./gradlew test --tests '*GoldenReplayTest*' --tests '*ShinyVote*'` y regenera el snapshot de `ConfigMessagesSnapshotTest`.
- [ ] **Step 7: Migración guardada.** En `generate-migration-cases.ts`, añade `add('shiny-vote: showVotes guardado se descarta', 'shiny-vote', (({ voteVisibility, ...rest }) => ({ ...rest, showVotes: true, rounds: 4 }))(def('shiny-vote')))`.
  - Regenera `migration-cases.json` y comprueba que el resultado es `voteVisibility: 'REVEAL', rounds: 4`, sin `showVotes`.
  - Ejecuta `./gradlew test --tests '*StoredGameConfigMigrationTest*'`.
- [ ] **Step 8: Front con TDD** (`vote-visibility.test.ts`):
  - `shinyVotersVisible('REVEAL', false) === false`;
  - `('REVEAL', true) === true`;
  - `('LIVE', false) === true`;
  - las dos etiquetas del chip.

  Después:
  - `ShinyVoteGame.tsx:112` pasa `showVoters={shinyVotersVisible(game.voteVisibility, revealPhase)}`, con `revealPhase = game.phase === 'ROUND_RESULTS' || game.phase === 'GAME_RESULTS'`.
  - `ShinyGameHeader` recibe `voteVisibility` y muestra `shinyVisibilityChip`.
  - `ShinyGameSidebar.tsx:33`: «Elección privada» si `voteVisibility === 'REVEAL'`.
  - `ConfigPanel.tsx:20`: etiqueta «Votos de otros jugadores», botones «Al revelar» y «En directo», y la misma nota de copia de la Task 2 con `LIVE`.
  - Ajusta `ShinyVoteGame.test.tsx` (`showVotes` → `voteVisibility`).
  - Ejecuta `npm test -w @pokemon-universe/web -- shiny`.
- [ ] **Step 9:** `npm test -w @pokemon-universe/server`, `npm run lint && npm run typecheck`.
- [ ] **Step 10: Commit.** `Shiny Quiz: votos visibles solo al revelar, solo Pokémon con shiny y paletas barajadas`

---

### Task 4: Shiny Quiz: la precarga calienta la imagen que se sirve

**Files:**
- Modify: `packages/shared/src/games/contracts.ts` (`GameContext`), `packages/shared/src/games/shiny-vote/server.ts`, `server.test.ts`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engine/GameContext.java`, `backend/.../engines/shinyvote/ShinyVoteEngine.java`, `ShinyVoteEngineTest.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/application/assets/GameAssetService.java`, `backend/src/test/java/.../application/assets/GameAssetServiceTest.java` (créalo si no existe)
- Modify: `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java:1203-1209` (`contextBuilder`)

**Interfaces:**
- Produces (TS): `GameContext.preloadAsset?: (asset: GameAssetResolution) => void`, justo después de `preloadImage`. Además, en `shiny-vote/server.ts`, `function optionResolution(option: ShinyOptionState): GameAssetResolution`, que usan `resolveAsset` y la precarga.
- Produces (Java):
  - `GameContext` con `@Nullable Consumer<AssetResolution> preloadAsset` como último componente, más su setter de `Builder` y `toBuilder()`;
  - `GameAssetService.preload(AssetResolution asset)`. El `preload(String)` actual delega en `preload(AssetResolution.original(source))`.

- [ ] **Step 1: Tests que fallan.**
  - Vitest `preloads the exact resolution each option is served with`: un contexto con `preloadAsset: (asset) => seen.push(asset)`. Tras `start`, `seen` tiene `optionCount` entradas. Tras la revelación, `seen` contiene, para cada opción preparada, el mismo objeto que devuelve `resolveAsset` en la ronda siguiente (compara con `toEqual`). Ninguna lleva `transform: 'ORIGINAL'`.
  - JUnit `GameAssetServiceTest.preloadUsesTheServedCacheKey`: con un `AssetSourceLoader` falso que cuenta descargas, `preload(resolución PALETTE_RECOLOR)` seguido de `load(misma resolución)` da **una** sola descarga (espera a la precarga con un `CountDownLatch` en el loader).
  - JUnit `ShinyVoteEngineTest.preloadsEveryOptionResolution`, como el Vitest.
- [ ] **Step 2:** Ejecuta los dos workspaces y `./gradlew test --tests '*GameAssetServiceTest*' --tests '*ShinyVote*'`. Deben fallar.
- [ ] **Step 3: Implementa.**
  - `createOptions` no cambia (sin extracciones nuevas de `random`).
  - `prepareNextRound` llama a `context.preloadAsset?.(optionResolution(option))` en lugar de `preloadImage`.
  - `beginRound`, cuando genera sin opciones preparadas (ronda 1), precarga igual.
  - En Java, el mismo cambio, más `.preloadAsset(assets::preload)` en `contextBuilder`.
  - Golden: `GoldenContexts`/`golden/context.ts` no pasan `preloadAsset`, así que las fixtures no cambian.
- [ ] **Step 4:** Repite el Step 2. Debe pasar. `./gradlew test --tests '*GoldenReplayTest*'` sin cambios en las fixtures.
- [ ] **Step 5:** `npm run build -w @pokemon-universe/server` (Node compila sin pasar `preloadAsset`), `npm run lint && npm run typecheck`.
- [ ] **Step 6: Commit.** `Shiny Quiz: la precarga prepara la imagen transformada que se sirve`

---

### Task 5: Pokédex Distance: selección oculta hasta revelar

**Files:**
- Modify: `packages/shared/src/games/pokedex-distance/{config,types,server}.ts`, `server.test.ts`
- Modify: `backend/.../engines/pokedexdistance/{PokedexDistanceConfig,PokedexDistanceTypes,PokedexDistanceEngine}.java`, `PokedexDistanceEngineTest.java`
- Modify: `packages/shared/golden/scenarios/pokedex-distance.ts` y las fixtures de `backend/src/test/resources/golden/pokedex-distance/`
- Modify: `registry.json`, `config-messages.json`
- Modify: `frontend/src/games/pokedex-distance/ConfigPanel.tsx`, `frontend/src/room/PokedexDistanceGame.tsx:20,45`, `frontend/src/room/PlayerList.tsx:39,56,62`
- Create: `frontend/src/room/pokedex-distance-selection.ts`, `pokedex-distance-selection.test.ts`

**Interfaces:**
- Produces (TS):
  - `POKEDEX_DISTANCE_SELECTION_VISIBILITIES = ['HIDDEN', 'LIVE'] as const`;
  - `pokedexDistanceConfigSchema = { generations, roundSeconds, selectionVisibility }`, con `'HIDDEN'` por defecto;
  - `PokedexDistancePublicState.selectedIds: string[]` justo **después de `selections`** (literal de `getPublicState`, `server.ts:207-213`).
- Java: tercer componente `selectionVisibility` del record de configuración y `List<String> selectedIds` en el record público, en la misma posición.
- Produces (front): `distanceMemberStatus(game: PokedexDistancePublicState, memberId: string): { kind: 'picked'; pokemonName: string; sprite: string } | { kind: 'hidden-picked' } | { kind: 'picking' }`.

- [ ] **Step 1: Tests que fallan** (`pokedex-distance/server.test.ts`):
  - `hides selections during ROUND_ACTIVE by default`: con la configuración por defecto, tras la selección de `p1`, la proyección pública da `selections` igual a `{}`, `selectedIds` igual a `['p1']` y `lockedPokemonIds` igual a `[]`.
  - `hides selections during a tiebreak`: fuerza un empate. En `TIEBREAKER_ACTIVE`, tras una selección, `selections` es `{}`.
  - `allows duplicate picks in HIDDEN and gives them the same distance`: `p1` y `p2` eligen el mismo id. Las dos se aceptan y `lastRound.selections.p1.distance === lastRound.selections.p2.distance`.
  - `LIVE keeps the lock and the live selections`: con `selectionVisibility: 'LIVE'`, el segundo da `'Ese Pokémon ya ha sido elegido.'` y `selections.p1.pokemonName` existe.
  - `the private state still confirms the own pick`: `getPlayerState(...).selection` no es nulo en `HIDDEN`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- pokedex-distance`. Debe fallar.
- [ ] **Step 3: Implementa.**
  - `handleAction` (`server.ts:156,165`): el rechazo por bloqueo y el `lockedPokemonIds` añadido, solo si `selectionVisibility === 'LIVE'`.
  - `getPublicState`:
    - `selections: LIVE ? (actual) : {}`;
    - `selectedIds: Object.keys(state.selections)`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Golden.**
  - `baseConfig` y la configuración de `:123` llevan `selectionVisibility: 'LIVE'`, para que `every-rejection` siga cubriendo el literal del bloqueo.
  - `configCases`: añade como inválidos `selectionVisibility: 'SECRET'` y una configuración sin la clave (Zod la exige).
  - Escenario nuevo `hidden-duplicates-and-tiebreak` (seed 818, 3 jugadores, `HIDDEN`): una ronda con elección duplicada, un empate con desempate y el final.
  - Ejecuta `golden:export` y `registry:export`. En las fixtures viejas solo cambian `selectedIds` y la configuración.
- [ ] **Step 6: Port Java** (`PokedexDistanceConfig.java`, `handleAction` `:211-249`, `getPublicState` `:268-311`).
  - Ejecuta `./gradlew test --tests '*GoldenReplayTest*' --tests '*PokedexDistance*'` y regenera el snapshot de `ConfigMessagesSnapshotTest`.
- [ ] **Step 7: Front con TDD** (`pokedex-distance-selection.test.ts`): los tres casos de `distanceMemberStatus` (`LIVE` con selección → `picked`; `HIDDEN` con id en `selectedIds` → `hidden-picked`; sin elegir → `picking`).
  - `PlayerList.tsx`: usa `distanceMemberStatus`. `hidden-picked` muestra `<p className="text-sm font-bold text-leaf">✓ Ya ha elegido</p>`, sin sprite.
  - `PokedexDistanceGame.tsx:20`: `hasSelection` sale de `player.selection` (privado), no de `game.selections`.
  - `ConfigPanel.tsx`: grupo de dos botones «Elecciones de los rivales: Ocultas / Visibles», con la nota de copia si `LIVE`.
  - Ejecuta `npm test -w @pokemon-universe/web -- pokedex-distance`.
- [ ] **Step 8:** `npm run lint && npm run typecheck`.
- [ ] **Step 9: Commit.** `Pokédex Distance: las elecciones de los rivales se ven solo al revelar`

---

### Task 6: Learnset Guess: bonus por orden y último aviso de 10 s

**Files:**
- Modify: `packages/shared/src/games/learnset-guess/{rules,types,server}.ts`, `server.test.ts`
- Modify: `backend/.../engines/learnsetguess/{LearnsetGuessRules,LearnsetGuessTypes,LearnsetGuessEngine}.java`, `LearnsetGuessEngineTest.java`
- Modify: `packages/shared/golden/scenarios/learnset-guess.ts` y las fixtures de `backend/src/test/resources/golden/learnset-guess/`
- Create: `frontend/src/room/learnset-texts.ts`, `learnset-texts.test.ts`
- Modify: `frontend/src/room/LearnsetGuessGame.tsx`

**Interfaces:**
- Produces (TS, `rules.ts`):
  - `LEARNSET_ORDER_BONUSES = [2, 1] as const`;
  - `learnsetPoints(revealStage: number, solveOrder: number): number`;
  - `LEARNSET_LAST_WARNING_MS = 10_000`.
- Produces (TS, `types.ts`):
  - `LearnsetGuessState.lastWarning: boolean` justo **después de `cooldownUntil`** (`createInitialState` y `beginRound` lo ponen a `false`);
  - `LearnsetGuessPublicState.lastWarning: boolean` justo **después de `nextTransitionAt`** (`true` solo en `ROUND_ACTIVE`).
- Java: `LearnsetGuessRules.ORDER_BONUSES`, `learnsetPoints(int, int)`, `LAST_WARNING_MS`, más los componentes en las mismas posiciones.
- Produces (front): `learnsetLastWarningText(lastWarning: boolean, solved: boolean): string | null`.

- [ ] **Step 1: Tests que fallan** (`learnset-guess/server.test.ts`):
  - `rules`: `learnsetPoints(0, 1) === 7`, `(0, 2) === 6`, `(0, 3) === 5`, `(4, 1) === 3`, `(6, 3) === 1`.
  - `the first two solvers earn the order bonus`: tres jugadores aciertan en la fase 0 en orden. Sus `points` son 7, 6 y 5, y `pointsFromSolves`/`bestRoundPoints` lo reflejan.
  - `cuts the round to 10 s when only one player is missing`: 3 jugadores y `roundSeconds: 60`. Tras dos aciertos a `t+5 s`: `roundEndsAt === t+15 s`, `lastWarning === true` y `nextTransitionAt` es `null` o menor que `roundEndsAt`. El timeout en `t+15 s` resuelve la ronda.
  - `last warning never extends a closer deadline`: el segundo acierto a 4 s del final deja `roundEndsAt` igual.
  - `a disconnect can trigger the last warning`: 3 jugadores, acierta `p1` y se desconecta `p3`. `handlePresenceChange` deja a `p2` con el aviso.
  - `no warning while two players are missing` y `the warning resets next round`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- learnset-guess`. Debe fallar.
- [ ] **Step 3: Implementa** `applyLastWarning(state, context): LearnsetGuessState` (Decisión 8).
  - Se llama tras `resolveWhenRequiredPlayersComplete` en el acierto (`server.ts:158`) y en `handlePresenceChange`, solo si la fase sigue siendo `ROUND_ACTIVE`.
  - `points = learnsetPoints(revealStage, solveOrder)`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Escenario dorado** `order-bonus-last-warning` (seed 913, 3 jugadores, 3 rondas):
  - una ronda con dos aciertos y aviso, resuelta por el plazo recortado;
  - una ronda en la que el aviso salta por una desconexión.

  Ejecuta `golden:export` y revisa que en las fixtures viejas cambian `points`/`scores` y aparece `lastWarning`.
- [ ] **Step 6: Port Java** (`resolveIfComplete` `:292`, acierto en `handleAction` `:328-371`, `handlePresenceChange` `:378`, `tickActive` sin cambios).
  - Ejecuta `./gradlew test --tests '*GoldenReplayTest*' --tests '*LearnsetGuess*'`.
- [ ] **Step 7: Front con TDD** (`learnset-texts.test.ts`). `learnsetLastWarningText` devuelve:
  - `(true, false)` → `'¡Último aviso! Solo faltas tú: 10 segundos.'`;
  - `(true, true)` → `'Último aviso: la ronda se cierra en 10 segundos.'`;
  - `(false, *)` → `null`.

  En `LearnsetGuessGame.tsx`, el texto va en un chip con `timer-pulse` y borde `berry`, junto al chip «Nueva pista en Ns». En `RoundReveal`, los puntos siguen saliendo de `solve.points`. Ejecuta `npm test -w @pokemon-universe/web -- learnset`.
- [ ] **Step 8:** `npm run lint && npm run typecheck`.
- [ ] **Step 9: Commit.** `Learnset Guess: bonus por orden de acierto y último aviso de 10 segundos`

---

### Task 7: Gracia de presencia por juego en la sala Java

**Files:**
- Modify: `packages/shared/src/games/contracts.ts` (`MiniGameManifest`, constante)
- Modify: el manifiesto de `packages/shared/src/games/{pokedex-distance,shiny-vote,pokemon-impostor,higher-lower,type-duel,learnset-guess}/server.ts`
- Modify: `backend/src/main/resources/games/registry.json` (con `registry:export`)
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/GameManifest.java` y todas sus construcciones (`grep -rn "new GameManifest(" backend/src`)
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/room/{RoomMember,Presence}.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java` (`disconnect` `:379-395`, `context` `:1188-1191`)
- Test: `backend/src/test/java/es/pokemonuniverse/application/rooms/RoomCoordinatorTest.java`
- Modify: `backend/src/test/java/es/pokemonuniverse/application/rooms/RoomTestKit.java:56-62`. Hoy pasa `RoomSettings.DEFAULTS` (30 s). Añade un constructor que reciba `RoomSettings` (y el registro) para el caso de 5 s.
- Modify: `backend/openapi/pokemon-universe.yml` (`./gradlew syncOpenApi`), `frontend/src/lib/api-types.ts` (`npm run api:types -w @pokemon-universe/web`)
- Modify: `docs/architecture.md:194`. Añade que los juegos con `presenceGraceMs` no ven una desconexión hasta que vence esa gracia (sin alargar plazos).

**Interfaces:**
- Produces (TS):
  - `export const PRESENCE_GRACE_MS = 10_000;`
  - `MiniGameManifest.presenceGraceMs?: number`, justo **después de `maxPlayers`**, con el comentario `/** Ms durante los que una desconexión no llega al motor; nunca alarga un plazo. */`.
  - En los 6 manifiestos, `presenceGraceMs: PRESENCE_GRACE_MS` justo **después de `minPlayers`**.
- Produces (Java):
  - `GameManifest` con `@Nullable Integer presenceGraceMs` tras `maxPlayers`;
  - `RoomMember.disconnectedAt` (`long`) y `RoomMember.presenceGraceTimer` (`@Nullable RoomTimer`);
  - `Presence.restoreMember` y `Presence.markLeft` cancelan y anulan `presenceGraceTimer`;
  - `RoomCoordinator.withinPresenceGrace(LiveRoom room, RoomMember member, long now): boolean`, privado de paquete.
  - `ManifestView` **no** cambia.

- [ ] **Step 1: Tests que fallan** en `RoomCoordinatorTest` (`RoomTestKit` ya registra el motor real de `pokedex-distance`; usa 3 invitados y la configuración por defecto, con `HIDDEN` tras la Task 5):
  - `presenceGraceKeepsAShortDisconnectInTheRound`:
    - `p3` se desconecta y `p1` y `p2` eligen;
    - la fase sigue en `ROUND_ACTIVE`;
    - `kit.time.advance(5_000)`, `p3` se reconecta y elige;
    - `lastRound.reason` no es `NO_RESPONSE` y `p3` no está en `eliminatedIds` por `NO_RESPONSE`.
  - `presenceGraceExpiresAndTheEngineSeesTheDisconnect`: `p3` se desconecta y `p1` y `p2` eligen. Con `advance(9_999)` sigue en `ROUND_ACTIVE`. Con `advance(1)` pasa a `ROUND_RESULTS`, con `reason == NO_RESPONSE` y `eliminatedIds == [p3]`.
  - `presenceGraceNeverExtendsTheRound`: `p3` se desconecta 15 s después del inicio (ronda de 20 s). La ronda se resuelve en `roundEndsAt`, no 10 s después.
  - `presenceGraceEndsEarlyWhenThePlayerLeaves`: con `RoomTestKit` creado con `new RoomSettings(8, 5_000)`, el motor ve la ausencia a los 5 000 ms.
  - `gamesWithoutGraceSeeDisconnectsImmediately`: con un juego falso (`fakeGames`, manifiesto sin gracia), `kit.manager.context(room).isPlayerRequired(p3)` es `false` justo después de `disconnect`.
- [ ] **Step 2:** `cd backend && ./gradlew test --tests '*RoomCoordinatorTest*'`. Debe fallar.
- [ ] **Step 3: Implementa.**
  - TS: la constante, el campo y los 6 manifiestos. Después, `npm run build -w @pokemon-universe/shared && npm run registry:export`.
  - Java:
    - `disconnect()` guarda `member.disconnectedAt = clock.now()`. Si hay partida viva (`room.game != null && room.game.finishReason == null`) y su manifiesto tiene `presenceGraceMs`, programa `member.presenceGraceTimer` a `presenceGraceMs` ms. Ese temporizador, dentro de `timerCallback`, comprueba que el miembro sigue en `TEMPORARILY_DISCONNECTED` con el mismo temporizador y llama a `applyPresenceChange(room)`.
    - `context(room, catalog)` calcula `connected = presence == CONNECTED || withinPresenceGrace(room, member, now)`. `withinPresenceGrace` exige partida viva, `TEMPORARILY_DISCONNECTED`, gracia no nula y `now < disconnectedAt + presenceGraceMs`. El flag `active` no cambia.
    - El resto (`connectedPlayerCount`, votos, salto, lobby) sigue usando `presence`.
  - OpenAPI: `./gradlew syncOpenApi`, luego `npm run api:types -w @pokemon-universe/web`. El diff solo añade `presenceGraceMs` a `GameManifest`.
- [ ] **Step 4:** Repite el Step 2 y ejecuta `./gradlew test --tests '*RoomCoordinatorTest*' --tests '*Registry*' --tests '*GoldenRegistryConsistencyTest*' verifyOpenApi`. Debe pasar.
- [ ] **Step 5:** `npm run build -w @pokemon-universe/server` (Node ignora el campo), `npm run lint && npm run typecheck`.
- [ ] **Step 6: Commit.** `Salas: una desconexión de menos de 10 s no cuenta en los seis primeros minijuegos`

---

### Task 8: Type Duel: el rival gana si el desconectado no vuelve

Depende de la Task 7: el motor solo recibe el cambio de presencia cuando vence la gracia.

**Files:**
- Modify: `packages/shared/src/games/type-duel/{types,server}.ts` (`handlePresenceChange` `:102-107`, `roundResult` `:38-48`), `server.test.ts`
- Modify: `backend/.../engines/typeduel/{TypeDuelTypes,TypeDuelEngine}.java` (`:33`, `:128-168`, `:317-327`), `TypeDuelEngineTest.java`
- Modify: `packages/shared/golden/scenarios/type-duel.ts` y las fixtures de `backend/src/test/resources/golden/type-duel/` (cambian `presence-and-early-finish` y `absent-duelists-hard-cap`)
- Modify: `frontend/src/room/type-duel-result.ts`, `type-duel-result.test.ts`
- Test: `backend/src/test/java/.../application/rooms/RoomCoordinatorTest.java`
- Modify: `docs/architecture.md:194`. «Type Duel cancels an affected duel without awarding a free win» pasa a: tras la gracia, el rival gana por abandono; si faltan los dos, el duelo se anula sin puntos.

**Interfaces:**
- Produces: `TypeDuelRoundResult['reason']` añade `'DISCONNECT_FORFEIT'`. Java: `TypeDuelRoundReason.DISCONNECT_FORFEIT`, tras `DISCONNECTED`.

- [ ] **Step 1: Tests que fallan.**
  - Vitest `a lone disconnected duelist forfeits to the rival`, en `SELECTING_TYPES` y en `POKEMON_SEARCH`:
    - `reason === 'DISCONNECT_FORFEIT'`, `winnerId` es el rival y `scores[rival] === 5`;
    - `playerStats` de los dos con `duelsPlayed + 1`, y el rival con `duelsWon + 1`;
    - `disconnectedIds` igual a `[ausente]` y `completedRounds + 1`.
  - Vitest `two disconnected duelists still cancel without points`: `reason === 'DISCONNECTED'` y sin puntos.
  - JUnit `presenceGraceReconnectKeepsTheDuelAlive` (`RoomCoordinatorTest`; registra el motor real `type-duel` en el kit de este test con `REAL_REGISTRY.engine("type-duel")`): un duelista se desconecta y vuelve a los 9 s. La fase sigue en `SELECTING_TYPES`/`POKEMON_SEARCH` y no hay `lastRound`.
  - JUnit `presenceGraceExpiryForfeitsTheDuel`: sin volver, a los 10 s, `lastRound.reason == DISCONNECT_FORFEIT`.
  - `type-duel-result.test.ts`:
    - `DISCONNECT_FORFEIT` (`winnerId: 'p1'`, `disconnectedIds: ['p2']`) → `{ title: 'Ana gana', detail: 'Bruno se desconectó.' }`;
    - `DISCONNECTED` con `['p1','p2']` → `{ title: 'Duelo anulado', detail: 'Ana y Bruno se desconectaron.' }`. Es el texto actual: confirma que no cambia.
- [ ] **Step 2:** `npm test -w @pokemon-universe/shared -- type-duel`, `npm test -w @pokemon-universe/web -- type-duel-result` y `./gradlew test --tests '*RoomCoordinatorTest*'`. Deben fallar.
- [ ] **Step 3: Implementa.**
  - `handlePresenceChange`: `absent = participants.filter((id) => !isPlayerRequired(context, id))`.
    - Con `absent.length === 1`, llama a `roundResult(state, context, 'DISCONNECT_FORFEIT', otro)`.
    - Con 2, a `'DISCONNECTED'`.
  - `roundResult`:
    - `played` incluye `DISCONNECT_FORFEIT`;
    - `disconnectedIds` se rellena para `DISCONNECTED` y `DISCONNECT_FORFEIT`.
  - Añade el `case` en `typeDuelResultText`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Golden.** Escenario `disconnect-forfeit` (seed 909, 3 jugadores, `rounds: 3`):
  - un forfeit en `SELECTING_TYPES`;
  - un forfeit en `POKEMON_SEARCH`;
  - una doble desconexión (`DISCONNECTED`).

  Ejecuta `golden:export` y revisa que en las dos fixtures viejas `DISCONNECTED` pasa a `DISCONNECT_FORFEIT` solo donde había un único ausente. Ejecuta `./gradlew test --tests '*GoldenReplayTest*' --tests '*TypeDuel*'`.
- [ ] **Step 6:** `npm run lint && npm run typecheck`.
- [ ] **Step 7: Commit.** `Type Duel: si un duelista no vuelve en 10 segundos, gana su rival`

---

### Task 9: Catálogo reducido para el buscador, sprite opaco y retirada de `/api/pokemon`

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/pokemon/PokemonController.java`
- Create: `backend/.../adapters/in/rest/pokemon/SelectorPokemon.java`
- Delete: `PublicPokemon.java` (si `grep -rn PublicPokemon backend/src` solo da el controlador)
- Modify: `backend/src/main/java/es/pokemonuniverse/application/pokemon/PokemonCatalogService.java` (`selectorSearch`)
- Create: `backend/src/main/java/es/pokemonuniverse/application/pokemon/PokemonSpriteService.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/config/AssetBeans.java`
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/in/rest/pokemon/PokemonControllerTest.java`
- Modify: `backend/openapi/pokemon-universe.yml`, `frontend/src/lib/api-types.ts`, `frontend/src/lib/api-contract.ts:28`
- Modify: `frontend/src/hooks/usePokemonPool.ts`, `frontend/src/room/PokemonSelector.tsx`, `frontend/src/room/pokemon-search.ts`, y las pantallas que señale `tsc`
- Create: `frontend/src/hooks/usePokemonPool.test.ts` (o amplía el que exista)
- Test: `backend/src/test/java/es/pokemonuniverse/application/pokemon/PokemonSpriteServiceTest.java`
- Modify: `docs/architecture.md:54` («Como Java ya sirve `/api/pokemon`…» pasa a describir `/api/pokemon/selector` y `/api/pokemon/{id}/sprite`, con su caché propia y su `ETag`)

**Interfaces:**
- Produces (Java):
  - `@Serdeable @Schema(name = "SelectorPokemon") record SelectorPokemon(String id, String name, String sprite)`, con `static SelectorPokemon from(Pokemon p)` que construye `"/api/pokemon/" + JsUrl.encodeURIComponent(p.id()) + "/sprite"`;
  - `record PokemonSelectorResponse(List<SelectorPokemon> pokemon)`;
  - `List<Pokemon> PokemonCatalogService.selectorSearch(PokemonSearchQuery query)`: mismo filtro que `search`, ordenado por `Collations.names()` sobre `name`, luego `isDefault` primero y luego `id`;
  - `PokemonSpriteService(GameAssetService assets)` con `LoadedAsset sprite(Pokemon pokemon)`, que hace `assets.load(AssetResolution.original(pokemon.sprite()))`.
    - En `AssetBeans`, `@Singleton PokemonSpriteService pokemonSpriteService(AssetSourceLoader loader)` construye un `GameAssetService` **propio** con `PokemonSpriteService.cache()`.
    - Esa caché es `new ResourceCache<>(SPRITE_CACHE_BYTES, SPRITE_CACHE_ENTRIES, SPRITE_CACHE_CONCURRENCY, SPRITE_CACHE_PENDING, asset -> asset.body().length)`, con `SPRITE_CACHE_BYTES = 16 MiB`, `SPRITE_CACHE_ENTRIES = 4096`, `SPRITE_CACHE_CONCURRENCY = 8` y `SPRITE_CACHE_PENDING = 512`.
    - No sirve `defaultCache()`: 256 entradas y 64 pendientes no aguantan unos 1 500 sprites, a 40 miniaturas por búsqueda y varios jugadores escribiendo a la vez.
- Rutas:
  - `GET /api/pokemon/selector` (`operationId = "listSelectorPokemon"`);
  - `GET /api/pokemon/{id}/sprite` (`operationId = "pokemonSprite"`, `image/png`, 404, 503);
  - `GET /api/pokemon` se elimina.
- Produces (front):
  - `export type PokemonSelectorResponse = JsonBody<'/api/pokemon/selector', 'get', 200>;` sustituye a `PokemonResponse`;
  - `usePokemonPool` devuelve `pokemon: PokemonSearchOption[]`;
  - `PokemonSelector` y `firstSelectablePokemonOption` aceptan `readonly PokemonSearchOption[]`.

- [ ] **Step 1: Tests que fallan** (`PokemonControllerTest`):
  - `selectorReturnsOnlyIdNameAndOpaqueSprite`: cada objeto de `pokemon` tiene exactamente las claves `id`, `name` y `sprite`, y `sprite` cumple `^/api/pokemon/[^/]+/sprite$`. El cuerpo no contiene `nationalDexNumber`, `generation`, `types`, `hp`, `shinySprite`, `abilities` ni `sprites/pokemon/`.
  - `selectorIsNotOrderedByDexNumber`: con Bulbasaur (#1) e Ivysaur (#2) y Abra (#63), Abra va primero.
  - `selectorPutsTheDefaultFormFirstAmongEqualNames`: dos entradas con el mismo `name`, una con `isDefault=false` y un id anterior. La de por defecto va primero.
  - `selectorFiltersGenerationsAndForms`: mismo contrato de `generations`/`includeForms` que el `list` actual (reutiliza sus casos de `parseGenerations`).
  - `selectorAnswers304ForAMatchingETag`: la primera respuesta lleva `ETag` (`W/"…"`) y `Cache-Control: no-cache`. Con `If-None-Match` igual responde `304` sin cuerpo.
  - `spriteServesTheImageAndCachesIt`: id conocido → `200 image/png` con `Cache-Control: public, max-age=86400`. Id desconocido → `404`.
  - `legacyCatalogRouteIsGone`: `GET /api/pokemon` → `404`.
  - `PokemonSpriteServiceTest.absorbsAFullSearchBurst`: con un loader falso lento (50 ms) y 120 ids distintos lanzados a la vez desde hilos virtuales, ninguna llamada a `sprite()` lanza `ResourceCapacityException`.
- [ ] **Step 2:** `./gradlew test --tests '*PokemonControllerTest*'`. Debe fallar.
- [ ] **Step 3: Implementa** en Java (Decisiones 12 y 13).
  - El `ETag` se calcula sobre el JSON serializado de la lista.
  - El `@Error(ResourceCapacityException)` del controlador devuelve `503` con `ApiError`, como `GameAssetController`.
  - Después, `./gradlew syncOpenApi` y `npm run api:types -w @pokemon-universe/web`.
- [ ] **Step 4:** Repite el Step 2 y ejecuta `./gradlew verifyOpenApi`. Debe pasar.
- [ ] **Step 5: Front con TDD.**
  - `usePokemonPool.test.ts`: con `api` simulado, la URL pedida es `/pokemon/selector?generations=1%2C2` (y `&includeForms=true` si toca), y el hook devuelve las entradas tal cual.
  - Implementa:
    - `usePokemonPool` llama a `/pokemon/selector?…` y devuelve `PokemonSearchOption[]`;
    - cambia los tipos de `PokemonSelector` y de `pokemon-search.ts` (`SearchablePokemon` acepta `isDefault` opcional, así que no se rompe);
    - `npm run typecheck`, y corrige cada pantalla que lea del pool algo distinto de `id`/`name`/`sprite`, leyéndolo del estado de la partida (§8.7 dice que no hay ninguna; si aparece alguna, anótala en el informe).
  - Busca `grep -rn "'/pokemon?" frontend/src e2e` y actualiza los mocks.
- [ ] **Step 6:** `npm test -w @pokemon-universe/web`, `npm run lint && npm run typecheck`.
- [ ] **Step 7: Commit.** `Catálogo del buscador sin datos de respuesta y sprites por proxy; se retira /api/pokemon`

---

### Task 10: E2E, capturas, rúbrica y verificación completa

**Files:**
- Modify: `e2e/tests/juegos.spec.ts`
- Create:
  - `e2e/screenshots/juego-pokedex-distance-ronda-oculta-{1280x720,1920x1080,390x844}.png`;
  - `e2e/screenshots/juego-shiny-vote-votos-al-revelar-{…}.png`;
  - `e2e/screenshots/lobby-config-higher-lower-{…}.png`;
  - `e2e/screenshots/lobby-config-pokedex-distance-{…}.png`.
- Possibly modify: `frontend/src/room/PlayerList.tsx`, `frontend/src/games/shiny-vote/ShinyGameHeader.tsx`, `frontend/src/games/higher-lower/ConfigPanel.tsx` (solo para llegar a la rúbrica)

**Preparación:**
- El `webServer` de `e2e/playwright.config.ts` hace `reuseExistingServer`. Antes de ejecutar, para cualquier backend en :8080 o :5173 arrancado desde otro checkout, para que Playwright arranque Java y Vite **desde este árbol**.
- Necesita `.env`, el catálogo sembrado (`npm run db:seed`) y `npx playwright install chromium`.

- [ ] **Step 1: Test `pokedex-distance: recarga a mitad de ronda`** (`crearSalaConJugadores(browser, 3)`, `seleccionarJuego(host.page, 'Pokédex Distance')`, y en el panel el deslizador «Tiempo por ronda» a 60 s antes de `iniciarPartida`, para que quepan la recarga, las dos elecciones y las capturas):
  - Antes de nada, registra en la página del host `page.waitForResponse((r) => new URL(r.url()).pathname === '/api/pokemon/selector')`. Lee su JSON y comprueba:
    - que cada entrada tiene `Object.keys(e).sort()` igual a `['id','name','sprite']`;
    - que ningún `sprite` contiene `sprites/pokemon/`;
    - que ninguna petición de la página va a `/api/pokemon?` (recógelas con `page.on('request')`).
  - El tercer jugador hace `page.reload()`. Los otros dos eligen un Pokémon cada uno con el buscador.
  - En ninguna página aparece una fila con `→ ` (ningún rival muestra su Pokémon), y la lista muestra «✓ Ya ha elegido» para el host y el segundo jugador.
  - Antes de 10 s, el tercero vuelve a ver el buscador (no «Estás observando») y elige. La ronda se resuelve y el resultado no lo marca como «sin respuesta».
  - Durante la ronda, y antes de que elija el tercero, captura `juego-pokedex-distance-ronda-oculta` en el host a los tres `SIZES` con `layoutProblems(page, …, true)`. Espera `problems` vacío.
  - `test.setTimeout(120_000)`.
- [ ] **Step 2: Test `shiny-vote: votos al revelar`.** 2 jugadores. El primero vota y la página del segundo no muestra avatares de votantes en las cartas durante la ronda. Captura `juego-shiny-vote-votos-al-revelar` a los tres tamaños. Tras la revelación, los avatares aparecen.
- [ ] **Step 3: Paneles nuevos.**
  - Higher or Lower: en el lobby del host, abre la configuración, captura `lobby-config-higher-lower` a los tres tamaños con «Al revelar» activo, pulsa «En directo» y comprueba que aparece «Permite copiar».
  - Pokédex Distance: lo mismo con `lobby-config-pokedex-distance` y el grupo «Elecciones de los rivales».
  - Quedan cubiertos solo por Vitest, porque el e2e no puede forzarlos sin conocer la respuesta: el chip de último aviso de Learnset (Task 6, `learnset-texts`) y el texto de abandono de Type Duel (Task 8, `type-duel-result`).
- [ ] **Step 4:** `npm run test:e2e -- juegos`. Pasan los tests por juego y los nuevos, sin scroll horizontal. **Mira las 12 capturas.**
- [ ] **Step 5: Rúbrica** (`docs/visual-review.md`) para «Pokédex Distance · ronda oculta», «Shiny · votos al revelar», «Higher or Lower · configuración» y «Pokédex Distance · configuración».
  - Si una baja de 19 o tiene un criterio a 0, corrige **solo esa pantalla** con las mismas palancas de la Fase 0:
    - `role="alert"`;
    - `min-h-11` y `focus-visible:` con `focus`;
    - `aria-busy`;
    - captura en tema claro con `pinTheme`.
  - Repite los Steps 4 y 5 hasta llegar a ≥19 sin ningún 0.
- [ ] **Step 6: Verificación completa.** `npm test`, `npm run typecheck`, `npm run lint` y `cd backend && ./gradlew check`. Todo en verde.
- [ ] **Step 7: Commit.** Pon la nota real en una sola línea:

  ```
  E2E de la Fase 1 con capturas (Rúbrica Distance ronda oculta: a,b,c,d,e,f,g,h = N/24; Shiny votos al revelar: … = N/24; Higher or Lower configuración: … = N/24; Distance configuración: … = N/24)
  ```

---

## Pasos de operador (no son tareas de agente)

- **Tras desplegar, comprobar en producción:**
  - en la pestaña de red, `GET /api/pokemon` da `404`;
  - `GET /api/pokemon/selector?generations=1` devuelve solo `id`, `name` y `sprite` opaco.
- **Avisar a los usuarios** de que la visibilidad de Higher or Lower y Shiny guardada en su perfil vuelve a «Al revelar» (Decisión 1).

## Criterios de aceptación (§10, Fase 1)

- **Ningún estado público de `ROUND_ACTIVE` revela la elección de otro jugador con la configuración por defecto.**
  - Higher or Lower: Task 2, `hides other answers…`.
  - Shiny Quiz: Task 3, `hides votes…`.
  - Pokédex Distance: Task 5, `hides selections…`, también en el desempate.
  - Learnset y Type Duel ya no publicaban elecciones correctas. Impostor publica solo quién ha votado.
- **Un corte de menos de 10 s no elimina ni anula.**
  - Task 7: `presenceGraceKeepsAShortDisconnectInTheRound`.
  - Task 8: `presenceGraceReconnectKeepsTheDuelAlive`.
  - Task 10: E2E de recarga.
- **La respuesta del selector no contiene `nationalDexNumber`, `generation`, `types`, `stats`, `shinySprite` ni URLs de sprite con el id de PokéAPI.**
  - Task 9: `selectorReturnsOnlyIdNameAndOpaqueSprite`.
  - Task 10: comprobación de red.
  - Además, el orden no es el de la Pokédex y `/api/pokemon` ya no existe.

## Decisiones del coordinador (2026-11-03, usuario dormido; revisables)
- Se aceptan todas las decisiones marcadas como «más allá del documento». §8.7 permite retirar `/api/pokemon`; la gracia vive en la sala (§8.3) y es fija de 10 s (§11.5 recomendación); el modo «nunca mostrar votos» de Shiny desaparece.
