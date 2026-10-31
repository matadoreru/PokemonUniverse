# Etapa 2B · Los 26 motores restantes, proxy de assets de ronda y E2E por juego · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una sala Java pueda lanzar los 28 minijuegos con la misma salida bit a bit que los motores TypeScript congelados, sirviendo ella misma las imágenes y gritos de ronda, con el arnés dorado endurecido (orden de claves) y un E2E paramétrico por juego contra Node y contra Java.

**Architecture:** Primero se endurece el arnés dorado (comparación sensible al orden de claves, fixtures de contexto para host, visuales, audio y TCG, paso `asset` que fija `resolveAsset`), se completa el catálogo en memoria (learnsets, evolución, entradas de Pokédex) y se porta el proxy de imágenes/audio de `apps/server/src/http/game-image-cache.ts` a Java puro (ImageIO + operaciones de píxel propias, sin dependencias nuevas). Después se portan los 26 motores por lotes agrupados por dependencia, cada uno registrado en `portedEngines` junto a sus fixtures en el mismo commit. Cierra un spec de Playwright que recorre los 28 ids del registro en ambos modos de tiempo real.

**Tech Stack:** Java 25 · Micronaut 5.1.5 (HTTP, Serde, Data JPA, `java.net.http`) · `java.desktop` (ImageIO, `BufferedImage`) en modo headless · JUnit 5 · Node 22 + `tsx` · Vitest · Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md` (§0 etapa 2, §1.5 golden tests, "Etapa 2: subproyectos", fila 2B) y `docs/migracion-java-pendientes.md` §"2B: lo que necesita". Plan previo del que hereda SPI, arnés y coordinador: `docs/superpowers/plans/2026-10-31-etapa-2a-nucleo-salas.md`.

## Qué existe ya (no se vuelve a planificar)

De la etapa 2A, en `main`: SPI `GameEngine<C,S,A,P>` con `getCursorChannel`/`resolveAsset` opcionales, `GameContext.builder(pokemon, random)` con huecos `tcgCards`, `pokemonVisuals`, `pokemonAudio`, `preloadImage`, `hostCustomCategories`, `hostWouldYouRatherPrompts`; records `AssetRequest`, `AssetResolution` (+`Transform`, `Recolor`), `CursorChannel`, interfaces `PokemonVisualCatalog`, `PokemonAudioCatalog`, `TcgCardCatalog`; infra `TimedLifecycle`, `Timing`, `Randoms`, `RunoffVoting`, `GuessingRound`, `Immutables`, `Mulberry32`, `JsNumbers`, `Scoring`, `GameConfigReadiness`; `RoomCoordinator.gameAsset(code, assetToken, roundNumber, assetId)` y el relé de cursores `CursorRelay` ya cableado a `who-is-who:cursor*` en `RoomWebSocket`; `HostContentProvider` (vacío hasta 2C); guía `domain/game/engines/README.md`; arnés `packages/shared/golden/*` + `backend/src/test/java/es/pokemonuniverse/golden/*`.

## Global Constraints

Se mantienen las 12 de la etapa 2A (PRNG `mulberry32`, formato de fixture, null vs ausente, `actionEpoch`, `LinkedHashMap`, fixture de catálogo, **regla de congelación: los motores TS no cambian**, Clock/Random inyectados, transporte, registro con manifests + motores, `customizedGameIds`) y las de la etapa 1 (Java 25, Micronaut 5.1.x, sin dependencias no usadas, comentarios Java en español, commits en español con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, sin `V2__` de Flyway). Se añaden:

13. **Orden de claves verificado** (sustituye la frase "el orden de claves no importa" de la constraint 3): el exportador ya no ordena las claves de `expected.*` ni de `config-cases.json`; el orden de inserción del motor TS es la referencia y el replayer compara objetos clave a clave **en secuencia**. Regla de port: el orden de los componentes de cada record de estado/proyección/configuración es el orden de **primera inserción** del literal TS (un `{ ...state, x }` conserva la posición original de `x`); los records de configuración siguen el orden de claves del esquema Zod. `JsonTree.equal` de producción (igualdad profunda sin orden para `customizedGameIds`) **no cambia**.
14. **`Record<number, …>`** (claves con aspecto de entero): JS las serializa ascendentes antes que las de texto. En Java se modelan como `TreeMap<Integer, …>` congelado (`Immutables.frozenSortedMap`), nunca `LinkedHashMap<String, …>`.
15. **Asset token**: `context.now.toString(36) + '-' + 3 × Math.floor(random()*0x1_0000_0000).toString(36)` unidos con `-` → `Long.toString(now, 36)` y `Long.toString((long) Math.floor(r * 4294967296.0), 36)`, tres extracciones de `random()` en ese orden.
16. **Seguridad del proxy, literal de Node**: fuentes aceptadas solo `https://raw.githubusercontent.com/…` (error `Untrusted game image source`) o `local-artwork:<id>` con regex `^local-artwork:([a-z0-9]+(?:-[a-z0-9]+)*)$` resuelto a `<artwork-dir>/<id>.png`; descarga con timeout 15 s y tope 8 MiB; `Sprite source returned <status>` si no es 2xx; `/audio` devuelve 415 sin cuerpo si el `Content-Type` no empieza por `audio/` ni `application/ogg`; 404 sin cuerpo si `roundNumber` no es entero o el motor devuelve vacío; éxito con `Cache-Control: private, max-age=86400, immutable`; capacidad agotada → 503 `{"error":"El servidor está procesando demasiados recursos. Reintenta en unos segundos."}`.
17. **Limitador**: las rutas `^/api/rooms/[^/]+/games/` quedan **fuera** de la política global 120/min y bajo una propia de 5000/min por IP (como `gameImageRateLimit` de Node).
18. **Paridad de imágenes por propiedades, no por bytes**: sharp/libvips e ImageIO no producen PNG idénticos. Se verifica: lienzos 512×512 (NORMALIZED, FOCUSED_NORMALIZED, ZOOM_CROP), 320×320 (SILHOUETTE), 192×192 (PIXEL_ART, PALETTE_RECOLOR); alfa preservado; silueta con RGB=0 en todos los píxeles; recorte **antes** de codificar; recoloreado por píxel con la fórmula exacta de `recolorPixels`; punto de foco con el algoritmo exacto de `validFocusPoint`.
19. **Caché de recursos** como `ResourceCache` de Node: LRU por clave, 32 MiB / 256 entradas, concurrencia 8, 64 pendientes, deduplicación en vuelo, un valor mayor que el presupuesto se devuelve sin cachear; clave `${transform}:${focusSeed ?? ''}:${zoom ?? ''}:${recolorKey}:${source}` donde `recolorKey` es `${hue}:${sat}:${light}:${contrast}` si hay recolor y `''` si no.
20. **Enrutado**: las URL de assets son relativas (`/api/rooms/…`) y las resuelve el origen de la página. En dev, el proxy de Vite manda `^/api/rooms/` a `:8080` **solo si** `VITE_REALTIME === 'java'`; `infra/nginx.conf` no cambia (producción sigue en Node hasta 2D).
21. **`localeCompare`**: sobre ids de jugador se traduce como `compareTo` (justificación del README); sobre cualquier otro texto (nombres de movimientos, de Pokémon, de jugadores) se usa `Collations.names()` (`Collator.getInstance(Locale.ROOT)`, el mismo que `PokemonCatalogService`), y la fixture dorada arbitra. Las fixtures se exportan en esta máquina con `LANG=en_US.UTF-8` (ICU `en-US`); si CI difiere en una comparación de textos, la causa es la configuración regional del exportador, no el motor: fijar `LANG` en el script de exportación.
22. **Registro atómico**: cada tarea de motor añade escenarios TS, fixtures y la línea en `portedEngines` de `ClasspathGameRegistryLoader` en el **mismo commit**; `GoldenRegistryConsistencyTest` falla si hay fixtures sin motor o motor sin fixtures.
23. **`tcg-higher-lower`** se porta y verifica con un `TcgCardCatalog` en memoria en el arnés, pero en salas Java sigue devolviendo `checkAvailability` = `No hay al menos dos cartas TCG con imagen y precio comparable para estos filtros.` (literal del TS) porque el catálogo TCG real (`comparable-price.ts`) es de 2C y el coordinador le pasa `tcgCards = null`.
24. **Paletas en el arnés** (enmienda a la constraint 7 de 2A): la BD local no tiene paletas (las calcula el data-sync de 2C), así que `pokemon-palette-guess` las recibe por `catalogPatch` del escenario, aplicado igual en TS y Java; siguen sin salir por `/api/pokemon`.
25. **AWT headless**: `-Djava.awt.headless=true` en `JAVA_TOOL_OPTIONS` del `Dockerfile` y en `application.yml` no aplica (es propiedad de sistema): se fija en `Application.main` antes de arrancar Micronaut. La imagen `eclipse-temurin:25-jre-alpine` incluye `java.desktop`; se comprueba en la Tarea 3 con un contenedor real.

## Review Focus

1. **Imagen de ronda pedida al backend equivocado** (dev con `VITE_REALTIME=java` y proxy sin la regla 20 → 404 silencioso en la UI): test de `vite.config.ts` (Tarea 3) y comprobación E2E de que un `/sprite` responde 200 `image/png` en modo Java (Tarea 17).
2. **Fuente no confiable o excesiva** (`http://`, otro host, 9 MiB, servidor que no responde): `TrustedAssetSourceLoaderTest` (Tarea 3) con rechazo antes de leer el cuerpo, corte a 8 MiB y timeout.
3. **Ocho jugadores cargando opciones** disparan el 120/min global y dejan la sala sin imágenes: `RateLimitFilterTest` (Tarea 3) con 130 peticiones a `/api/rooms/X/games/t/rounds/1/options/a/sprite` → ninguna 429.
4. **Proyección Java con `HashMap` o con componentes en otro orden** que pasaba el comparador antiguo: `OrderedJsonCompareTest` (Tarea 1) y el fallo esperado de los pilotos hasta corregirlos.
5. **Nombre con acento o mayúscula en un empate** (`a.move.name.localeCompare(b.move.name)` en learnset, nombres de Pokémon en Trivia/Connections): `CollationsTest` (Tarea 2) con `"Ñ" < "O"`, `"é" < "f"`, `"a" < "B"`.

---

### Task 1: Arnés dorado 2B — orden de claves, fixtures de contexto y paso `asset`

**Files:**
- Modify: `scripts/export-golden-fixtures.mjs` (dejar de aplicar `sortKeys` a fixtures y `config-cases.json`), `packages/shared/golden/types.ts`, `packages/shared/golden/runner.ts`, `packages/shared/golden/runner.test.ts`
- Create: `packages/shared/golden/context.ts`
- Modify: `backend/src/test/java/es/pokemonuniverse/golden/GoldenFixture.java`, `GoldenReplayer.java`, `GoldenReplayerTest.java`
- Create: `backend/src/test/java/es/pokemonuniverse/golden/OrderedJsonCompare.java`, `OrderedJsonCompareTest.java`, `GoldenContexts.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engine/infra/Immutables.java` (añadir `frozenSortedMap`)
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/game/engines/README.md` (reglas 13, 14, 15, 21), engines piloto si el nuevo comparador los hace fallar
- Regenerate: `backend/src/test/resources/golden/higher-lower/*.json`, `golden/pokedex-distance/*.json`

**Interfaces:**
- `types.ts`: `GoldenScenario` y `GoldenFixture` ganan opcionales `hostCustomCategories?: SubjectiveCategory[]`, `hostWouldYouRatherPrompts?: WouldYouRatherPromptPair[]`, `pokemonVisuals?: Record<string, PokemonVisualAsset>` (tipo exportado por `contracts.ts`), `pokemonAudio?: Record<string, { latest?: string; legacy?: string }>`, `tcgCards?: TcgComparableCard[]`. `GoldenStep` gana `{ kind: 'asset'; assetToken: string; roundNumber: number; assetId: string; now: number }`. `GoldenStepResult` gana `{ resolution: GameAssetResolution | null }` (un `string` devuelto por el motor se normaliza a `{ source, transform: 'ORIGINAL' }`, como `resolution()` de `game-image-cache.ts`).
- `context.ts`: `buildGoldenContext(scenario, catalog): GameContext` — monta `pokemonVisuals` (`artworkFor`/`artworkPokemonIds` sobre el mapa), `pokemonAudio` (`cryFor`/`pokemonIds`), `tcgCards` (`cardsFor` con el filtrado de `comparable-price.ts`: generaciones, setIds, rarities, min/max precio comparados como decimales), `preloadImage: () => {}`, y solo incluye cada clave si el escenario la trae (null vs ausente).
- `runner.ts`: el paso `asset` no cambia el estado; produce `{ resolution }` y no snapshot.
- Java `GoldenFixture`: mismos campos opcionales (`@Nullable`), `GoldenStep` con `assetToken/roundNumber/assetId` nulos salvo en `asset`, `GoldenStepResult.resolution` como `JsonNode` nullable con presencia.
- `GoldenContexts.contextFor(fixture, catalog, random): GameContext` con implementaciones en memoria de `PokemonVisualCatalog`, `PokemonAudioCatalog` y `TcgCardCatalog` dentro del paquete de test.
- `OrderedJsonCompare.firstDifference(String path, JsonNode expected, JsonNode actual): Optional<String>` — igual que `JsonTree.firstDifference` pero en objetos recorre `entries()` de ambos en paralelo y reporta `path: orden de claves esperado [a,b] obtenido [b,a]` ante la primera divergencia de secuencia; números por igualdad numérica. `GoldenReplayer` lo usa en todas las comparaciones.
- `Immutables.frozenSortedMap(Map<Integer, V>)`: `Collections.unmodifiableSortedMap(new TreeMap<>(map))`.

- [ ] **Step 1: Tests que fallan (TS).** En `runner.test.ts`: un módulo falso cuyo `getPublicState` devuelve `{ b: 1, a: 2 }` produce una fixture cuyo JSON serializado contiene `"b": 1` antes de `"a": 2`; un escenario con `pokemonAudio: { bulbasaur: { latest: 'https://raw.githubusercontent.com/PokeAPI/cries/x.ogg' } }` da `context.pokemonAudio.cryFor('bulbasaur','LATEST')` igual a esa URL y `cryFor('bulbasaur','LEGACY')` igual a `null`; un paso `asset` sobre un módulo cuyo `resolveAsset` devuelve `'https://raw.githubusercontent.com/a.png'` produce `{ resolution: { source: 'https://raw.githubusercontent.com/a.png', transform: 'ORIGINAL' } }` y uno que devuelve `null` produce `{ resolution: null }`.
- [ ] **Step 2: Ver fallar.** `npx vitest run packages/shared/golden` → FAIL.
- [ ] **Step 3: Implementar** `types.ts`, `context.ts`, `runner.ts` y quitar `sortKeys` de las fixtures en `export-golden-fixtures.mjs` (el `--check` compara texto; las fixtures se regeneran en el Step 8).
- [ ] **Step 4: Ver pasar.** `npx vitest run packages/shared/golden` → PASS.
- [ ] **Step 5: Tests que fallan (Java).** `OrderedJsonCompareTest`: `{"a":1,"b":2}` vs `{"b":2,"a":1}` → presente con texto `orden de claves`; `{"a":1}` vs `{"a":1.0}` → vacío; anidado `{"x":{"b":1,"a":2}}` vs `{"x":{"a":2,"b":1}}` → `x: orden de claves…`; `{"a":null}` vs `{}` → diferencia de presencia. Añadir un test que confirme que el `JsonMapper` de test conserva el orden al parsear `{"b":1,"a":2}` (`entries()` devuelve `b` y luego `a`); si no lo conserva, el replayer debe parsear las fixtures con `JsonNode` vía streaming (documentar lo elegido en el ledger). Añadir otro que serialice un record con `SortedMap<Integer, String>` = `{10:"a", 2:"b"}` y obtenga `{"2":"b","10":"a"}`; si Serde rechaza claves no `String`, `frozenSortedMap` devuelve un `LinkedHashMap<String, V>` rellenado en orden numérico ascendente y la constraint 14 se reescribe así. `GoldenReplayerTest`: una fixture sintética con paso `asset` y motor falso que devuelve `AssetResolution.original("https://raw.githubusercontent.com/a.png")` pasa; el mismo motor devolviendo `Optional.empty()` falla con `expected.afterSteps[0].resolution`.
- [ ] **Step 6: Ver fallar.** `cd backend && ./gradlew test --tests '*OrderedJsonCompareTest*' --tests '*GoldenReplayerTest*'` → FAIL (clase inexistente).
- [ ] **Step 7: Implementar** `OrderedJsonCompare`, `GoldenContexts`, cambios en `GoldenFixture`/`GoldenReplayer` (paso `asset`: `engine.resolveAsset(state, new AssetRequest(...), context.withNow(now))`, comparar `tree(resolution.orElse(null))` con presencia), `Immutables.frozenSortedMap`.
- [ ] **Step 8: Regenerar y arbitrar los pilotos.** `npm run build -w @pokemon-universe/shared && npm run golden:export`, luego `cd backend && ./gradlew test --tests '*GoldenReplayTest*'`. Cada fallo de orden se corrige **en el record Java** (reordenar componentes según la constraint 13), nunca en el TS ni en la fixture. Repetir hasta PASS.
- [ ] **Step 9: Verificación completa.** `npm test` (incluye `check:golden`) → exit 0; `cd backend && ./gradlew check` → BUILD SUCCESSFUL.
- [ ] **Step 10: README y commit.** Añadir al README de motores las reglas 13, 14, 15 y 21 y el paso `asset` en "Escenarios dorados". `git commit -m "Arnés dorado: comparación sensible al orden de claves, fixtures de contexto y paso asset"`.

---

### Task 2: Catálogo en memoria completo (learnsets, evolución, entradas de Pokédex) y `Collations`

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/pokemon/Move.java`, `ResolvedLevelUpMove.java`, `LearnsetEntry.java`, `PokemonEvolutionInfo.java`, `PokedexEntry.java`, `LearnsetPokemonCatalog.java`, `PokedexEntryPokemonCatalog.java`, `GenerationLearnsetSources.java`
- Create: `backend/src/main/java/es/pokemonuniverse/domain/text/Collations.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/pokemon/InMemoryPokemonCatalog.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/MoveEntity.java`, `MoveRepository.java`, `PokemonLevelUpMoveEntity.java` (`@IdClass` sobre las cuatro columnas: Prisma declara `@@id([pokemonId, moveId, referenceGeneration, level])`), `PokemonLevelUpMoveRepository.java`, `PokedexEntryEntity.java`, `PokedexEntryRepository.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/application/pokemon/PokemonCatalogService.java` (`catalog()` carga las cuatro fuentes), `scripts/export-golden-catalog.mjs` (rellena `moves`, `learnsets`, `evolution`, `pokedexEntries`), `backend/src/test/java/es/pokemonuniverse/golden/GoldenCatalogs.java`
- Regenerate: `backend/src/test/resources/golden/catalog/gen1-2.json`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/pokemon/InMemoryPokemonCatalogTest.java`, `domain/text/CollationsTest.java`, `application/pokemon/PokemonCatalogServiceTest.java` (existente; ampliar)

**Interfaces:**
- `record Move(String id, String name, String type, String category, @Nullable Map<String, Object> names)`; `record ResolvedLevelUpMove(String moveId, int level, Move move)` (orden de claves TS: `moveId, level, move`); `record LearnsetEntry(String pokemonId, String moveId, int referenceGeneration, int level)`; `record PokemonEvolutionInfo(int stage, int stages)`; `record PokedexEntry(String pokemonId, String text, String language, int generation, String version, String versionLabel)`.
- `interface LearnsetPokemonCatalog extends PokemonCatalog { List<ResolvedLevelUpMove> levelUpMoves(String pokemonId, int referenceGeneration); Optional<PokemonEvolutionInfo> evolutionInfo(String pokemonId); }`; `interface PokedexEntryPokemonCatalog extends PokemonCatalog { List<PokedexEntry> pokedexEntries(String pokemonId); }`. El `isLearnsetPokemonCatalog(catalog)` de TS es `catalog instanceof LearnsetPokemonCatalog`.
- `InMemoryPokemonCatalog(List<Pokemon> entries)` se mantiene (delegando a listas vacías) y se añade `InMemoryPokemonCatalog(List<Pokemon> entries, List<Move> moves, List<LearnsetEntry> learnsets, Map<String, PokemonEvolutionInfo> evolution, List<PokedexEntry> pokedexEntries)` que implementa ambas interfaces: índice `pokemonId:referenceGeneration` → lista ordenada por `level` y después `Collations.names()` sobre `move.name()`; entradas de un movimiento desconocido se descartan como en Node; `pokedexEntries` conserva el orden de llegada.
- `GenerationLearnsetSources.versionGroup(int generation)` / `label(int)` con los 9 literales de `GENERATION_LEARNSET_SOURCES`.
- `Collations.names(): Comparator<String>` — `Collator.getInstance(Locale.ROOT)` por hilo (`ThreadLocal`), fuerza `TERTIARY`.
- `PokemonCatalogService.catalog()` carga `Move` (todos), `PokemonLevelUpMove` ordenado por `pokemonId, referenceGeneration, level`, `PokedexEntry` ordenado por `pokemonId asc, generation desc, version asc`, y deriva `evolution` de `evolutionStage`/`evolutionStages` no nulos de cada Pokémon (como `loadPokemonCatalog` de Node).
- Exportador: para los Pokémon de la fixture, `learnsets` con `referenceGeneration ∈ {1,2}`, los `moves` referenciados, `evolution` de esos Pokémon y sus `pokedexEntries`.

- [ ] **Step 1: Tests que fallan.** `CollationsTest`: `names().compare("Ñ","O") < 0`, `compare("é","f") < 0`, `compare("a","B") < 0`, `compare("Zubat","zubat") != 0`. `InMemoryPokemonCatalogTest`: dos learnsets del mismo nivel salen ordenados por nombre de movimiento con `Collations`; un `moveId` desconocido se descarta; `evolutionInfo("missing")` vacío; `pokedexEntries` conserva orden; `catalog instanceof LearnsetPokemonCatalog` verdadero. `PokemonCatalogServiceTest` (Testcontainers): tras insertar un `Move`, un `PokemonLevelUpMove` y un `PokedexEntry`, `catalog().levelUpMoves(id, 1)` tiene un elemento con `move().name()` correcto y `pokedexEntries(id)` uno.
- [ ] **Step 2: Ver fallar.** `cd backend && ./gradlew test --tests '*CollationsTest*' --tests '*InMemoryPokemonCatalogTest*' --tests '*PokemonCatalogServiceTest*'` → FAIL.
- [ ] **Step 3: Implementar** records, interfaces, catálogo, entidades JPA (tablas con comillas: `"Move"`, `"PokemonLevelUpMove"`, `"PokedexEntry"`), repositorios, servicio.
- [ ] **Step 4: Ver pasar.** Mismo comando → PASS.
- [ ] **Step 5: Fixture de catálogo.** Actualizar `export-golden-catalog.mjs`; `npm run build -w @pokemon-universe/server && DATABASE_URL=<local> npm run golden:catalog`; comprobar a ojo que `gen1-2.json` trae `learnsets` (≈3300 filas), `moves` no vacíos, `evolution` con `bulbasaur: {stage:1, stages:3}` y `pokedexEntries` con `language: "es"`. `GoldenCatalogs` construye el `InMemoryPokemonCatalog` de cinco argumentos.
- [ ] **Step 6: Verificación.** `npm test` → exit 0 (las fixtures de los pilotos no cambian: no usan learnsets); `cd backend && ./gradlew check` → BUILD SUCCESSFUL.
- [ ] **Step 7: Commit.** `git commit -m "Catálogo Java completo: learnsets, evolución, entradas de Pokédex y Collations"`.

---

### Task 3: Proxy de imágenes y audio de ronda en Java

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/assets/AlphaPlane.java`, `FocusPoints.java`, `ImageTransforms.java`, `HslColors.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/assets/GameAssetService.java`, `AssetSourceLoader.java`, `LoadedAsset.java`, `ResourceCache.java`, `ResourceCapacityException.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/assets/TrustedAssetSourceLoader.java`, `adapters/out/storage/FilesystemArtworkCatalog.java`, `adapters/out/persistence/PokemonAssetReferenceEntity.java`, `PokemonAssetReferenceRepository.java`, `JpaPokemonAudioCatalog.java`
- Create: `backend/src/main/java/es/pokemonuniverse/domain/pokemon/InMemoryPokemonAudioCatalog.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/rooms/GameAssetController.java`
- Modify: `adapters/in/rest/ratelimit/RateLimitPolicy.java` (constraint 17), `application/rooms/GameCatalogProvider.java`, `application/rooms/RoomCoordinator.java` (`replaceCatalog`, `context()` con visuales/audio/preload), `application/pokemon/PokemonCatalogService.java`, `config/*` (beans), `Application.java` (`java.awt.headless`), `backend/Dockerfile` (`-Djava.awt.headless=true` en `JAVA_TOOL_OPTIONS`), `application.yml` (`pu.artwork-dir: ${POKEMON_ARTWORK_DIR:../apps/server/assets/pokemon-artworks}`, el mismo directorio que escanea Node en dev; `application-test.yml` apunta a un directorio temporal; en compose se monta el mismo volumen que Node, como con los avatares), `compose.yaml` (variable opcional), `apps/web/vite.config.ts` (constraint 20), `backend/openapi/pokemon-universe.yml` (regenerado), `apps/web/src/lib/api-types.ts` (regenerado)
- Test: `domain/game/assets/FocusPointsTest.java`, `ImageTransformsTest.java`, `HslColorsTest.java`; `application/assets/ResourceCacheTest.java`; `adapters/out/assets/TrustedAssetSourceLoaderTest.java`; `adapters/in/rest/rooms/GameAssetControllerTest.java`; `adapters/in/rest/ratelimit/RateLimitFilterTest.java` (ampliar); `apps/web/vite.config.test.ts`

**Interfaces:**
- `record AlphaPlane(int width, int height, byte[] alpha)`; `FocusPoints.alphaBounds(plane, threshold=24)`, `localAlphaDensity(plane, x, y, radius, threshold)`, `validFocusPoint(plane, long seed): Optional<FocusPoint(double x, double y)>` — port literal de `zoomed-pokemon/rules.ts` (umbral `> 24`, radio `max(2, round(min(w,h)*0.08))`, paso `max(1, floor(min(W,H)/64))`, densidad ≥ 0.32, orden densidad desc → y → x, top `ceil(n*0.7)` mínimo 1, índice `|trunc(seed)| mod len`, foco `((x+0.5)/W, (y+0.5)/H)`, sin candidatos → centro del bounding box).
- `ImageTransforms` (estático, entrada y salida `byte[]` PNG, `BufferedImage TYPE_INT_ARGB`): `normalized(byte[] source, @Nullable Long focusSeed)` (trim de píxeles con alfa 0 contra fondo transparente, contain 472×472 con reescalado bilineal, margen 20 → 512×512, desplazamiento al foco si `focusSeed != null`, lanza `EngineException("Visual asset does not contain enough visible pixels")` si no hay foco), `zoomCrop(byte[], long focusSeed, double zoom)` (`zoom` fuera de `[1,32]` o no finito → `Invalid crop magnification`; `size = max(1, floor(512/zoom))`, `inset = floor((512-size)/2)`, recorte y reescalado a 512), `silhouette(byte[])` (trim, contain 320×320, RGB := 0), `pixelArt(byte[], @Nullable Recolor)` (recolor a resolución nativa, luego contain 192×192 con vecino más próximo). `HslColors.rgbToHsl`/`hslToRgb` y `recolor(int[] argb, Recolor)` con los recortes exactos: `saturationScale ∈ [0.5,1.15]`, `lightnessScale ∈ [0.85,1.15]`, `contrast ∈ [0.8,1.1]`, `hueShift = ((deg % 360) + 360) % 360`, omitir si alfa 0, croma < 0.055, L < 0.07 o L > 0.94; `S' = clamp(S*sat, 0, 0.88)`, `L' = clamp((0.5+(L-0.5)*contrast)*light, 0.04, 0.96)`, `round(v*255)`.
- `record LoadedAsset(byte[] body, String contentType)`; `interface AssetSourceLoader { LoadedAsset fetch(String source); }`; `TrustedAssetSourceLoader(Path artworkDir)` con `java.net.http.HttpClient`, `BodyHandlers.ofInputStream` leyendo como máximo 8 MiB (constraint 16).
- `ResourceCache<T>(long maxBytes, int maxEntries, int concurrency, int maxPending, ToLongFunction<T> size)` con `T load(String key, Supplier<T> loader)`; constraint 19.
- `GameAssetService(AssetSourceLoader, ResourceCache<LoadedAsset>)`: `LoadedAsset load(AssetResolution)` (dispatch por `transform`; `PALETTE_RECOLOR` sin `recolor` → `Palette recolor transform requires recolor parameters`), `void preload(String source)` (asíncrono, registra `Failed to preload game image`).
- `GameAssetController`: `GET /api/rooms/{code}/games/{assetToken}/rounds/{roundNumber}/options/{optionId}/sprite` y `/audio`; `roundNumber` como `String` parseado (`Integer.parseInt` fallido → 404 vacío); usa `RoomCoordinator.gameAsset`; sin autenticación (como Node).
- `GameCatalogProvider.loadPokemonCatalog()` pasa a devolver `record GameCatalogs(PokemonCatalog pokemon, PokemonVisualCatalog visuals, PokemonAudioCatalog audio)`; `RoomCoordinator.replaceCatalog(GameCatalogs)`; `context(room)` añade `.pokemonVisuals(…).pokemonAudio(…).preloadImage(assets::preload)`.
- `FilesystemArtworkCatalog(Path dir, Set<String> catalogIds)`: ficheros `^[a-z0-9]+(?:-[a-z0-9]+)*\.png$` cuyo nombre sea un id del catálogo, PNG válido y con ≥ 0.2 % de píxeles con alfa > 24; `Asset(pokemonId, ARTWORK, "local-artwork:<id>", width, height, alphaBounds normalizado 0..1)`; directorio ausente → aviso y catálogo vacío.
- `JpaPokemonAudioCatalog.load(): InMemoryPokemonAudioCatalog` desde `PokemonAssetReference` (`kind ∈ {CRY_LATEST, CRY_LEGACY}`, orden `pokemonId, kind, isPrimary desc, updatedAt desc`) más `Pokemon.metadata.cries.latest/legacy`; solo URLs `^https://raw.githubusercontent.com/PokeAPI/cries/`; primera por `(pokemon, kind)` gana.
- `vite.config.ts`: exportar `proxyFor(realtime: string | undefined)` y usarla en `server.proxy`; con `'java'` añade `'^/api/rooms/': 'http://localhost:8080'` **antes** de `/api`.

- [ ] **Step 1: Tests que fallan (puros).** `HslColorsTest`: `recolor` de un píxel `(255,0,0,255)` con `Recolor(120, 1, 1, 1)` da `(15,240,15,255)`; un píxel gris `(128,128,128,255)` no cambia (croma < 0.055); alfa 0 no cambia. `FocusPointsTest`: plano 64×64 con un cuadrado opaco de 16×16 en (8,8) → `alphaBounds` = `(8,8,16,16)`; `validFocusPoint(plane, 0)` devuelve un punto dentro del cuadrado; con semilla distinta puede cambiar pero sigue dentro; plano vacío → vacío. Para el valor exacto: ejecutar una vez `npx tsx -e` con `validFocusPoint` de `packages/shared/dist` sobre el mismo plano y seeds 0 y 7, y fijar `(x, y)` en el test. `ImageTransformsTest` con PNG sintéticos generados en el test: `normalized` → 512×512 con alfa preservado; `silhouette` → 320×320 y todo píxel con alfa > 0 tiene RGB 0; `pixelArt` → 192×192; `zoomCrop(…, 0, 4)` → 512×512 y `zoomCrop(…, 0, 0.5)` lanza `Invalid crop magnification`; `pixelArt(src, null)` de un sprite 4×4 con un solo color devuelve bloques nítidos (muestra: píxel (0,0) y (47,47) iguales al color de origen). `ResourceCacheTest`: dos `load` concurrentes de la misma clave ejecutan el loader una vez; 65 pendientes → `ResourceCapacityException`; valor mayor que `maxBytes` no queda cacheado; LRU expulsa la más antigua.
- [ ] **Step 2: Ver fallar.** `cd backend && ./gradlew test --tests 'es.pokemonuniverse.domain.game.assets.*' --tests '*ResourceCacheTest*'` → FAIL.
- [ ] **Step 3: Implementar** `AlphaPlane`, `FocusPoints`, `HslColors`, `ImageTransforms`, `ResourceCache`.
- [ ] **Step 4: Ver pasar.** Mismo comando → PASS.
- [ ] **Step 5: Tests que fallan (adaptadores).** `TrustedAssetSourceLoaderTest` (servidor HTTP embebido de Micronaut o `com.sun.net.httpserver`): `http://raw.githubusercontent.com/a.png` → `Untrusted game image source`; `https://example.com/a.png` → ídem; respuesta 404 → `Sprite source returned 404`; cuerpo de 9 MiB → error sin leerlo entero; `local-artwork:bulbasaur` → lee `<dir>/bulbasaur.png`; `local-artwork:../x` → no cumple la regex y se trata como URL inválida. `GameAssetControllerTest` (`@MicronautTest` con `RoomCoordinator` sustituido): `roundNumber=abc` → 404 sin cuerpo; motor devuelve vacío → 404; audio con `Content-Type: image/png` → 415; éxito → 200, `Content-Type` del recurso, `Cache-Control: private, max-age=86400, immutable`; `ResourceCapacityException` → 503 con el mensaje literal. `RateLimitFilterTest`: 130 peticiones seguidas a `/api/rooms/ABC123/games/t/rounds/1/options/a/sprite` → ninguna 429; la 5001.ª → 429. `vite.config.test.ts`: `proxyFor('java')` tiene la clave `^/api/rooms/` apuntando a `:8080` y aparece antes que `/api`; `proxyFor(undefined)` no la tiene.
- [ ] **Step 6: Ver fallar.** `./gradlew test --tests '*TrustedAssetSourceLoaderTest*' --tests '*GameAssetControllerTest*' --tests '*RateLimitFilterTest*'`; `npx vitest run apps/web/vite.config.test.ts` → FAIL.
- [ ] **Step 7: Implementar** adaptadores, controlador, política de limitación, catálogos visual/audio, cableado en `GameCatalogProvider`/`RoomCoordinator`/`PokemonCatalogService`, `Application.main` headless, Dockerfile, `application.yml`, Vite. Regenerar OpenAPI (`./gradlew verifyOpenApi` tras actualizar) y `npm run api:types -w @pokemon-universe/web`.
- [ ] **Step 8: Ver pasar.** Mismos comandos → PASS. `./gradlew check` → BUILD SUCCESSFUL. `npm run typecheck && npm run lint && npm test` → exit 0.
- [ ] **Step 9: Comprobación AWT en contenedor.** `podman build -t pu-backend-2b backend/ && podman run --rm -e DATABASE_URL=… --network host pu-backend-2b` y, con una sala Java viva (ver Tarea 17 para el flujo), `curl -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8080/api/rooms/<code>/games/<token>/rounds/1/options/<id>/sprite` → `200 image/png`. Si `java.desktop` o `libawt_headless` faltaran en la imagen alpine, cambiar la base a `eclipse-temurin:25-jre` (Ubuntu) y anotarlo en `DEPLOY.md`. Esta comprobación puede hacerse también al final de la Tarea 8 (primer motor con assets), pero el resultado va en el informe de esta tarea.
- [ ] **Step 10: Commit.** `git commit -m "Proxy de imágenes y audio de ronda en Java: transformaciones, caché, catálogos visual y de gritos"`.

---

### Task 4: Plantilla de tarea de motor (léela antes de las Tareas 5–16)

Cada tarea de motor sigue estos pasos con su tabla de particularidades. El implementador lee **completo** el `server.ts`, `types.ts`, `config.ts`, `rules.ts` y ficheros extra del motor TS, el README de motores y `higherlower/` como referencia.

**Ficheros por motor** (`backend/src/main/java/es/pokemonuniverse/domain/game/engines/<idsinguiones>/`): `<Juego>Config.java`, `<Juego>Types.java`, `<Juego>Rules.java`, `<Juego>Engine.java` y un fichero por cada módulo extra de la tabla (p. ej. `<Juego>Prompts.java`). Escenarios en `packages/shared/golden/scenarios/<id>.ts` registrados en `scenarios/index.ts`. Fixtures en `backend/src/test/resources/golden/<id>/`. Registro en `portedEngines` de `ClasspathGameRegistryLoader` (constraint 22). Test unitario mínimo `<Juego>EngineTest.java` con los literales de error y una acción inválida (`parseAction` lanza `ConfigValidationException`).

**Pasos:**
- [ ] **A. Escenarios TS.** ≥ 3 escenarios por motor, cada uno con ≥ 3 rondas (o el ciclo completo del juego si no tiene rondas), seeds distintos, `now` realistas, y entre todos: cada literal de error de `server.ts`, la presencia (desconexión que resuelve una fase), la visibilidad por jugador (`getPlayerState` distinto entre jugadores), un `timeout` en cada fase temporizada, una acción que no valida (`invalidAction`) y, si el motor tiene `resolveAsset`, pasos `asset` con token correcto, token incorrecto y ronda incorrecta. `configCases`: cada límite de cada campo (válido en el borde, inválido justo fuera), normalización (dedup, orden) y claves desconocidas.
- [ ] **B. Exportar.** `npm run build -w @pokemon-universe/shared && npm run golden:export`; revisar una fixture a ojo (que `afterSteps` no sea todo `accepted: false`).
- [ ] **C. Ver fallar.** `cd backend && ./gradlew test --tests '*GoldenReplayTest*'` → FAIL con `Motor no portado: <id>`.
- [ ] **D. Portar** siguiendo el README (builder, Immutables, `@JsonInclude(ALWAYS)`, orden de componentes = orden TS, `TreeMap` para claves enteras, `Randoms` en el mismo orden, literales idénticos, `Collations.names()` donde el TS compare textos). Registrar en `portedEngines`.
- [ ] **E. Ver pasar.** `./gradlew test --tests '*GoldenReplayTest*' --tests '*GoldenRegistryConsistencyTest*' --tests '*<Juego>EngineTest*'` → PASS. Ante un desajuste: se corrige el Java; si el desajuste revela una **ambigüedad** de la fixture (p. ej. no cubre una rama), se añade escenario y se vuelve a B. El TS no cambia.
- [ ] **F. Verificación de la tarea.** `./gradlew check` → BUILD SUCCESSFUL; `npm test` → exit 0 (`check:golden` confirma que las fixtures commiteadas coinciden).
- [ ] **G. Commit** por motor o por lote: `Motor <nombre> portado a Java con fixtures doradas`.

**Sobre el contexto en los escenarios:** los motores con `hostCustomCategories`/`hostWouldYouRatherPrompts` llevan escenarios con y sin contenido del host; los de visuales/audio llevan `pokemonVisuals`/`pokemonAudio` en el escenario con un subconjunto del catálogo (ids reales de `gen1-2`), y al menos un escenario **sin** esos mapas para cubrir el camino de respaldo al sprite.

---

### Task 5: Lote A — adivinanzas temporizadas sin assets: `guess-from-stats`, `type-duel`, `pokemon-palette-guess`, `pokemon-trivia`

| Motor | `server.ts` | Extras | Particularidades |
|---|---|---|---|
| `guess-from-stats` | 118 | — | Usa `context.preloadImage?.(sprite)`: en Java `if (context.preloadImage() != null)`. |
| `type-duel` | 109 | — | Tabla de tipos en `rules.ts`; copiar la matriz literal. |
| `pokemon-palette-guess` | 80 | — | Lee `palette`/`paletteWeights` del Pokémon; el record `Pokemon` Java **no los tiene**. Añadir los componentes `@Nullable List<String> palette` y `@Nullable List<Double> paletteWeights` (sin `@JsonIgnore`: Serde lo aplicaría también al deserializar la fixture) y hacer que `/api/pokemon` responda con un DTO `PublicPokemon` sin esos dos campos (test: `GET /api/pokemon` con un Pokémon con paleta → el JSON no contiene `palette`). `PokemonCatalogService` los carga desde `metadata` con la validación de Node (`#rrggbb`, ≥ 3 colores, pesos finitos > 0 de igual longitud, `paletteVersion === 3` y `paletteSpriteUrl === sprite`, como `persistedPokemonPalette`). **Prerrequisito de datos:** las paletas las calcula el data-sync (`pokemon-palette-sync.ts`, 2C) y la BD local tiene **0** Pokémon con paleta, así que la fixture no puede traerlas de la BD. Solución: el escenario dorado admite `catalogPatch?: Record<string, { palette: string[]; paletteWeights: number[] }>` (añadir a `GoldenScenario`/`GoldenFixture` y aplicarlo en `loadGoldenCatalog`/`GoldenCatalogs` de forma idéntica en ambos lados, antes de construir el catálogo); los escenarios de este motor parchean ≥ 12 Pokémon de gen 1 con paletas literales de 8 colores. El exportador de catálogo sigue borrando `palette` de la BD (la constraint 24 se reduce a este parche). |
| `pokemon-trivia` | 171 | — | Comparaciones de nombres con `Collations.names()`; literales de `prompt`/`fact` con tildes copiados exactos. |

- [ ] Seguir A–G de la Tarea 4 para los cuatro motores. Commit por motor.

---

### Task 6: Lote B — rondas de texto y velocidad: `type-chain`, `pokeddle-race`, `pokemon-red-flag`, `poke-taboo`

| Motor | `server.ts` | Extras | Particularidades |
|---|---|---|---|
| `type-chain` | 186 | — | Acción `SUBMIT_POKEMON`. `failsafeWinner` ordena ids de jugador con `localeCompare` → `compareTo` (justificado en README). |
| `pokeddle-race` | 151 | — | Acción `GUESS_POKEMON`; comparación de intentos: port literal, cuidado con `Array.from(string)` (code points, no `charAt`) si el TS lo usa. |
| `pokemon-red-flag` | 209 | — | Acciones `UPDATE_RED_FLAG_DRAFT`, `SUBMIT_RED_FLAG`, `VOTE_RED_FLAG`; votación con `RunoffVoting`. |
| `poke-taboo` | 243 | — | Acciones `GUESS_POKEMON`, `SEND_HINT`; `rules.ts` normaliza texto (minúsculas, `normalize`): portar con `java.text.Normalizer` y `toLowerCase(Locale.ROOT)` literal al TS. |

- [ ] Seguir A–G de la Tarea 4. Para `poke-taboo` (normaliza texto) el escenario incluye una entrada con mayúsculas, tildes y espacios extra. Los otros motores con normalización de texto son `guess-from-stats` (rules), `pokemon-trivia`, `pokedex-entry-guess` (rules) y `pokemon-impostor`: la misma regla aplica en sus tareas.

---

### Task 7: Lote C — contenido del host y prompts: `most-likely-to`, `would-you-rather`, `secret-ranking`, `one-of-us-is-fake`

| Motor | `server.ts` | Extras | Particularidades |
|---|---|---|---|
| `most-likely-to` | 265 | `prompts.ts` (49) | `hostCustomCategories` se mezclan con los prompts incluidos; `Randoms.contentDeck`. |
| `would-you-rather` | 150 | `prompts.ts` (46) | `hostWouldYouRatherPrompts`; `GameConfigReadiness` ya cuenta los pares. |
| `secret-ranking` | 251 | `prompts.ts` (89) | Ranking secreto por jugador; `Record<string, number[]>`; puntuación por distancia. |
| `one-of-us-is-fake` | 225 | `categories.ts` (59) | 4 llamadas a `random()`: el orden exacto importa (impostor, categoría, palabra, barajado). |

- [ ] Seguir A–G de la Tarea 4. Cada motor tiene un escenario con `hostCustomCategories`/`hostWouldYouRatherPrompts` en la fixture y otro sin ellos. Los literales de prompts/categorías se copian en `<Juego>Prompts.java`/`<Juego>Categories.java` como `List.of(...)` en el mismo orden (el orden alimenta el barajado).

---

### Task 8: Lote D — catálogo extendido: `learnset-guess`, `pokedex-entry-guess`

| Motor | `server.ts` | Extras | Particularidades |
|---|---|---|---|
| `learnset-guess` | 198 | — | `isLearnsetPokemonCatalog` → `instanceof LearnsetPokemonCatalog`, si no lanza `EngineException("The Pokémon catalog has no learnset data")`. Orden de learnset por nivel y `Collations.names()`. `showEvolution` filtra Pokémon sin `evolutionInfo`. |
| `pokedex-entry-guess` | 175 | — | `isPokedexEntryPokemonCatalog` → `instanceof`; literal `El catálogo Pokémon no contiene entradas Pokédex en español. Ejecuta el seed actualizado.`. Enmascarado del nombre en el texto (regex con `\\b` y tildes): portar con `Pattern.UNICODE_CASE | CASE_INSENSITIVE` y verificar con un escenario cuya entrada contenga el nombre con otra capitalización. |

- [ ] Seguir A–G de la Tarea 4. Los escenarios usan Pokémon de gen 1–2 con learnsets en la fixture (`bulbasaur`, `pikachu`, `eevee`).

---

### Task 9: Lote E — imágenes y audio de ronda: `whos-that-pokemon`, `zoomed-pokemon`, `pokemon-cry-quiz`, `shiny-vote`

| Motor | `server.ts` | Extras | Particularidades |
|---|---|---|---|
| `whos-that-pokemon` | 183 | — | `assetToken` (constraint 15); `resolveAsset` devuelve `SILHOUETTE` para `shadow` y `ORIGINAL` para `reveal`; token o ronda distintos → vacío. |
| `zoomed-pokemon` | 205 | `rules.ts` (`alphaBounds`, `validFocusPoint`) | Reusa `FocusPoints` de la Tarea 3 (no duplicar). Elige artwork de `pokemonVisuals.artworkFor` o sprite; `focusSeed` y `zoom` según el TS; transforms `ZOOM_CROP` y `NORMALIZED`. |
| `pokemon-cry-quiz` | 119 | — | `pokemonAudio.cryFor(id, version)`; `resolveAsset` `ORIGINAL` de la URL del grito (nunca va a la proyección). 3 `random()`. |
| `shiny-vote` | 269 | `filters.ts` (22) | `FAKE_SHINY_PALETTES` literal; `useShinySpriteForFake` consume `random()`; transforms `PALETTE_RECOLOR` (con `recolor` de la paleta) y `PIXEL_ART`; URL `/api/rooms/<code>/games/<token>/rounds/<n>/options/<id>/sprite` con `encodeURIComponent(roomCode)` → `URLEncoder` **no** es equivalente (codifica espacio como `+`); usar un helper `JsUrl.encodeURIComponent` en `infra/` con la tabla de caracteres reservados de JS y testearlo con `A B/ü`. |

- [ ] Seguir A–G de la Tarea 4, con pasos `asset` en cada escenario (token correcto, token caducado de la ronda anterior, `assetId` desconocido) y escenarios con y sin `pokemonVisuals`/`pokemonAudio`.
- [ ] Al terminar, levantar `npm run dev` con `VITE_REALTIME=java` y jugar una ronda de Quién es ese Pokémon: la silueta y la revelación se ven en el navegador y la pestaña Red muestra `200 image/png` desde `:8080` (esto es el Step 9 de la Tarea 3 si no se hizo entonces).

---

### Task 10: Lote F — `tcg-higher-lower` y `who-is-who-pokemon`

| Motor | `server.ts` | Extras | Particularidades |
|---|---|---|---|
| `tcg-higher-lower` | 77 | — | `context.tcgCards?.cardsFor(config)`; precios como decimales (`BigDecimal` con `compareTo`, nunca `double`); constraint 23. |
| `who-is-who-pokemon` | 80 | — | `getCursorChannel` → `Optional<CursorChannel>` solo en `TURN_ACTIVE` y para el equipo del jugador; tablero `board`; 1 `random()`. |

- [ ] Seguir A–G de la Tarea 4; `tcg-higher-lower` lleva `tcgCards` en los escenarios (≥ 6 cartas con dos sets y dos rarezas) y un escenario sin `tcgCards` cuyo `checkAvailability` devuelve el literal.
- [ ] Test de integración WS para cursores: `RoomWebSocketTest` (ampliar) — dos clientes del mismo equipo en `TURN_ACTIVE`: `who-is-who:cursor` con `pokemonId` del tablero llega al compañero como push `who-is-who:cursor` con `updatedAt`; con un `pokemonId` ajeno responde `{ok:false,error:"Ese Pokémon no está en el tablero."}`; `who-is-who:cursor-clear` llega como push; al terminar el turno llega `who-is-who:cursors-reset`.

---

### Task 11: `pokemon-bingo` (+ `generator.ts`)

- `server.ts` 173, `generator.ts` 54, `rules.ts` 14. Acciones `ASSIGN_POKEMON`, `MOVE_POKEMON`, `REMOVE_POKEMON`, `SKIP_RESULTS`; el generador de cartones (`generator.ts`) consume `random()` en el orden exacto del TS.
- [ ] Seguir A–G de la Tarea 4. Escenario con tres jugadores que cubre cada literal de error de las cuatro acciones, un `SKIP_RESULTS` que adelanta la fase y una desconexión.

---

### Task 12: `pokemon-team-auction`

- `server.ts` 217, `rules.ts` 41. Acciones `RAISE_BID`, `PASS_BID`; `currentLotIndex` entra en `actionEpoch` (ya contemplado en `TimedLifecycle`). Ids de jugador ordenados con `compareTo`.
- [ ] Seguir A–G de la Tarea 4. Escenarios: cada literal de rechazo de `RAISE_BID`/`PASS_BID`, lote que expira por `timeout`, desconexión del mejor postor.

---

### Task 13: `pokemon-bluff-auction` (+ `conditions.ts` y `packages/shared/src/pokemon/conditions/*`)

- `server.ts` 258, `conditions.ts` 118, `pokemon/conditions/{generator,rules,types}.ts` 187. Las condiciones compartidas van a `domain/pokemon/conditions/ConditionGenerator.java`, `ConditionRules.java`, `Condition.java` (reutilizables por 2C si otro juego las usa). Acciones `RAISE_BID`, `PASS_BID`, `SUBMIT_POKEMON`. Evaluación de condiciones sobre el catálogo según `pokemon/conditions/rules.ts`.
- [ ] Seguir A–G de la Tarea 4. Un escenario por familia de condición al menos; test unitario `ConditionRulesTest` con un Pokémon de la fixture por cada operador.

---

### Task 14: `pokemon-connections` (+ `catalog.ts`, 517 líneas)

- `server.ts` 295, `catalog.ts` 517, `rules.ts` 39. El catálogo de grupos (categorías, miembros) se traslada literal a `PokemonConnectionsCatalog.java` como `List.of(new Group(...))` en el **mismo orden**; si el fichero Java supera ~1000 líneas se divide por secciones del TS (`CatalogGroupsA.java`, `...B.java`) y una lista concatenada. Selección de grupos con `random()`; empates de ranking con `compareTo` sobre ids.
- [ ] Antes de D, escribir un test `PokemonConnectionsCatalogTest` que compare el número de grupos y la secuencia de `id` de los grupos con los del TS (exportar la lista con `npx tsx -e` una vez y fijarla en el test como `String[]`).
- [ ] Seguir A–G de la Tarea 4.

---

### Task 15: `pokemon-impostor`

- `server.ts` 326, `rules.ts` 37. Acciones `SUBMIT_CLUE`, `VOTE`, `GUESS_POKEMON`; normaliza texto (ver Tarea 6); la proyección por jugador oculta el impostor salvo a sí mismo. Solo 2 `random()` pero fases largas: escenarios con ≥ 2 partidas completas.
- [ ] Seguir A–G de la Tarea 4. Cubrir cada literal de rechazo de las tres acciones, impostor desconectado y empate en la votación.

---

### Task 16: `sketchmon`

- `server.ts` 341, `types.ts` 156 (acciones `DRAW_BATCH`, `UNDO_STROKE`, `REDO_STROKE`, `CLEAR_DRAWING`, `GUESS_POKEMON`; `strokeIdSchema` `^[a-zA-Z0-9_-]+$` 1..64, `strokeStartSchema`), `rules.ts` 42. Pilas `undoStack`/`redoStack` de `SketchmonStroke[][]`; límites de puntos por trazo y de trazos por dibujo; `pointsFromGuessing`/`pointsFromDrawing`.
- [ ] Seguir A–G de la Tarea 4. `configCases` cubre los límites de la configuración; el escenario de acción inválida envía un `DRAW_BATCH` con un punto de más del máximo. Escenarios: dibujar, deshacer, rehacer, limpiar, adivinar bien y mal, dibujante que se desconecta.

---

### Task 17: E2E paramétrico por juego contra Node y contra Java

**Files:**
- Create: `e2e/tests/juegos.spec.ts`
- Modify: `e2e/src/helpers.ts` (helpers `crearSalaConJugadores(n)`, `seleccionarJuego(id)`, `iniciarPartida()`), `e2e/README.md`, `package.json` raíz si hace falta un script `test:e2e:juegos`

**Interfaces:**
- El spec lee los ids desde `backend/src/main/resources/games/registry.json` y genera un `test(id, …)` por juego. Flujo: `max(3, manifest.minPlayers)` contextos de navegador (campo `minPlayers` de `registry.json`; hay juegos con 3), sala nueva, selección del juego, `Comenzar`, esperar a que el `RoomView` salga de `LOBBY` (la UI deja de mostrar el lobby y aparece el título del manifest), esperar hasta 15 s a que cambie algo en pantalla (fin de `GAME_STARTING`), sin horizontal scroll, `measureLayout` vacío a 1280×720. Para `whos-that-pokemon`, `zoomed-pokemon`, `shiny-vote`, `pokemon-cry-quiz`: capturar la primera respuesta a `/api/rooms/*/games/*/rounds/*/options/*/(sprite|audio)` y exigir 200 con `image/png` o `audio/*`.
- Juegos que el servidor declara no disponibles (`tcg-higher-lower` sin cartas, `pokemon-palette-guess` sin paletas en una BD sin `metadata.palette`): el spec los marca `test.skip` **solo si** el botón de inicio muestra el literal de no disponibilidad; nunca se saltan en silencio.

- [ ] **Step 1: Escribir el spec** y los helpers.
- [ ] **Step 2: Ejecutar contra Node.** `npm run test:e2e -- juegos` (en esta máquina la web corre en 5174 por un override local **no commiteado**; el spec no debe depender del puerto) → 28 pasados o saltados con motivo.
- [ ] **Step 3: Ejecutar contra Java.** `npm run test:e2e:java -- juegos` → igual que Node (ningún `Este minijuego todavía no está disponible en el servidor Java.`).
- [ ] **Step 4: Capturas** de un juego de cada lote a 1280×720, 1920×1080 y 390×844 en `e2e/screenshots/`; mirarlas.
- [ ] **Step 5: Commit.** `git commit -m "E2E paramétrico por minijuego contra Node y contra Java"`.

---

### Task 18: Cierre de 2B — documentación y estado

**Files:**
- Modify: `docs/architecture.md` (sección "Motores y assets en Java (etapa 2B)": proxy, caché, catálogos visual/audio, regla de enrutado 20, lista de motores portados = 28), `docs/migracion-java-pendientes.md` (quitar lo hecho de "2B: lo que necesita"; añadir a 2C "catálogo TCG real para `tcg-higher-lower`", "`PokemonAssetReference` lo escribe data-sync", "`replaceCatalog` tras el sync debe recargar también visuales y audio"; a 2D "`/api/rooms/` de nginx a Java", "AWT en imagen nativa"), `docs/superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md` (bloque **Estado**: 2B implementada), `README.md` (variable `POKEMON_ARTWORK_DIR`), `DEPLOY.md` (si cambió la base de la imagen), `AGENTS.md` (comando `npm run test:e2e:java` y regla "cada motor nuevo lleva fixtures doradas y registro en `portedEngines`"), `backend/src/main/java/es/pokemonuniverse/domain/game/engines/README.md` (eliminar "pendiente de 2B" del Collator)
- Verify: el mensaje `Este minijuego todavía no está disponible en el servidor Java.` se conserva en el coordinador (defensa ante un registro incompleto) pero `GoldenRegistryConsistencyTest` exige 28 motores portados: añadir la aserción `assertEquals(28, ported.size())`.

- [ ] **Step 1:** Añadir la aserción de 28 y verla pasar: `./gradlew test --tests '*GoldenRegistryConsistencyTest*'`.
- [ ] **Step 2:** Actualizar los documentos listados.
- [ ] **Step 3:** Verificación final completa: `cd backend && ./gradlew check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e -- juegos`, `npm run test:e2e:java -- juegos` → todo en verde; anotar los tiempos en el informe.
- [ ] **Step 4: Commit.** `git commit -m "Documentación de 2B: motores completos, proxy de assets y pendientes de 2C/2D"`.
