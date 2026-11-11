# Motores de minijuego

Los motores solo existen en Java. Nacieron como traducción literal de los motores TypeScript del antiguo servidor Node,
que se borraron cuando Java quedó como única implementación (están en el historial de git, antes del commit
«Quitar el servidor Node y los motores TS»). Por eso las convenciones de abajo hablan de equivalencias con TS: siguen
explicando por qué el código es como es, y el frontend sigue leyendo las proyecciones con los tipos de
`packages/shared`. La referencia es `higherlower/`.

Las fixtures doradas (`src/test/resources/golden/<id>/`) son ahora fotos del comportamiento de cada motor: fijan cada
proyección, el orden de claves del cable y los mensajes de error. Un cambio de motor que no las regraba falla en
`GoldenReplayTest`.

## Ficheros (`engines/<idsinguiones>/`)

- `<Juego>Config`: un record `@Serdeable` más `parse(JsonNode)`, que reproduce el esquema Zod. Las claves desconocidas
  se ignoran salvo si el esquema es `.strict()`. Hay que aplicar las mismas transformaciones (dedup, orden). Se
  replica `.int().min().max()` de cada campo, con los mismos límites. Un entero acepta `10.0` y rechaza `10.5`. Un
  fallo lanza `ConfigValidationException`.
- **Config: usar `ConfigReader`** (`engine/infra`). `ConfigReader.of(raw, "<nombre visible>")` comprueba el objeto y
  da `strict`, `integer`, `safeInteger`, `option`, `bool`, `enumValue`, `generations` y `object` (objeto anidado), y
  `allGenerations()` para los valores por defecto. Falla en el primer error con
  `Configuración de <juego> no válida: <detalle>.`, que la sala muestra tal cual. Las reglas propias del esquema
  (`superRefine`) lanzan `config.invalidAt("<clave del issue de Zod>", detalle)` (o `config.invalid(detalle)` si
  el issue va en la raíz) sin punto final. Un helper local solo se justifica si su mensaje difiere del común, y se
  comenta por qué; sus fallos de tipo usan `config.reject(clave, detalle)` y siguen con un valor centinela, para que
  `GameEngine.configIssues` (la migración de configuraciones guardadas) los recoja todos con su ruta.
- `<Juego>Types`: los records del estado, de las proyecciones y de la acción, con su `parse(JsonNode)`. El estado de
  servidor y las acciones solo existen aquí; las proyecciones (`*PublicState`, `*PlayerState`) llevan los mismos
  nombres que sus tipos TS en `packages/shared/src/games/<id>/types.ts`.
- `<Juego>Rules`: las reglas puras del juego (puntuación, pistas, resultados).
- `<Juego>Engine`: el port de `server.ts`. Recibe en el constructor el `GameManifest` de `games/registry.json`; el
  manifiesto no se duplica a mano.
- Las condiciones de `pokemon/conditions/*` (tipos, reglas y generador) están en `domain/pokemon/conditions/`, que
  comparten Pokémon Bingo y Pokémon Bluff Auction; cada juego pasa sus familias en `ConditionGenerationOptions`.

## Convenciones

- **Estado con builder**: todo record de estado tiene un `Builder` anidado con setters con nombre, más `builder()` y
  `toBuilder()`. Cada transición deriva de `state.toBuilder()…build()`, que es el `{ ...state, … }` de TS. El motor
  nunca llama al constructor posicional: dos campos contiguos del mismo tipo se pueden intercambiar sin que lo detecte
  el compilador. Un helper como `finished()` vale si usa el builder. La regla del builder se aplica a los records de
  estado de primer nivel y, desde Bluff Auction, a cualquier record (también de proyección) con 8 o más componentes.
  Los records más pequeños (estadísticas, resultados de ronda) pueden usar su constructor, pero si tienen 3 o más
  campos contiguos del mismo tipo se construyen con un builder o un método estático o de instancia con nombre (por
  ejemplo `PlayerRoundStats.ZERO.afterSelection(distance)`), no por posición. Los motores anteriores a Bluff Auction
  no se han revisado con esta regla.
- **Inmutabilidad**: los `Record<string, …>` son `LinkedHashMap` copiados con `Immutables.frozenMap` en el constructor
  compacto, y las listas usan `Immutables.frozenList`. Sin esto, una acción rechazada podría mutar el estado.
- **Orden de claves** (constraint 13 de 2B): el replayer compara los objetos clave a clave **en secuencia**, así que
  el orden de los componentes de cada record de estado, proyección o configuración es el orden de **primera
  inserción** del literal TS. Un `{ ...state, x }` conserva la posición original de `x`, y un `{ ...a, b }` pone las
  claves de `a` primero y luego las nuevas de `b`. Los records de configuración siguen el orden de claves del esquema
  Zod. Un `LinkedHashMap` conserva el orden de inserción, como JS con claves no numéricas. Ante un fallo
  `orden de claves esperado […] obtenido […]` se reordenan los componentes del record Java (y sus llamadas
  posicionales), nunca el TS ni la fixture. `JsonTree.equal` de producción sigue ignorando el orden.
- **`Record<number, …>`** (constraint 14): JS serializa las claves con aspecto de entero ascendentes y antes que las de
  texto. En Java se modelan como `SortedMap<Integer, …>` congelado con `Immutables.frozenSortedMap`, que Serde
  serializa como `{"2":…,"10":…}`. Nunca un `LinkedHashMap<String, …>`: el orden de inserción no coincidiría.
- **Asset token** (constraint 15): `context.now.toString(36)` y tres `Math.floor(random() * 0x1_0000_0000).toString(36)`
  unidos con `-` se traducen como `Long.toString(now, 36)` y `Long.toString((long) Math.floor(r * 4294967296.0), 36)`,
  con las tres extracciones de `random()` en ese orden: `AssetTokens.randomToken(context)`. Comprueba la variante de
  cada motor (`shiny-vote` usa solo `context.now.toString(36)`, sin `random()`).
- **Rutas de recursos**: `/api/rooms/${encodeURIComponent(roomCode)}/games/<token>/rounds/<n>/options/<id>/<sprite|audio>`
  se construye con `AssetTokens.roundAssetPath`, que codifica con `JsUrl.encodeURIComponent`. `URLEncoder` no vale:
  codifica el espacio como `+` y no deja intactos `! ' ( ) * ~`. El respaldo de `roomCode` (`?? 'opaque'`, o el sprite
  directo de `shiny-vote`) lo decide cada motor como su TS.
- **Proyecciones**: cada record público o de jugador, incluidos los anidados, lleva `@Serdeable` y
  `@JsonInclude(ALWAYS)`. Un `null` de TS debe salir como `null`. Un `?:` de TS se marca `NON_ABSENT`/`NON_NULL` campo
  a campo.
- **PRNG**: hay que consumir `context.random()` el mismo número de veces y en el mismo orden que el TS. Se usa
  `Randoms.randomItem`/`shuffled`/`contentDeck` y se conserva el `Math.min(Math.floor(r * n), n - 1)`. Una extracción
  de más o de menos aparece como desajuste dorado.
- **Ciclo de vida**: `TimedLifecycle.builder(phase)` lleva exactamente los campos que `timedGameLifecycle` lee del
  estado TS, incluido `spectatorIds` si el estado lo tiene. El ciclo activo → resultados → siguiente usa
  `Timing.advanceTimedRound` con un `TimedRoundStrategy` `static final` cuando el TS lo usa. Si el TS escribe su propio
  `handleTimeout` (por ejemplo, con dos fases activas como `pokedexdistance/`), se porta literal.
- **Errores**: los literales de `server.ts`, idénticos, en `GameActionResult.reject`. Un `throw new Error` de TS se
  traduce como `EngineException` con el mismo mensaje.
- **`localeCompare`** (constraint 21): sobre ids de jugador se traduce como `String.compareTo`. Es equivalente: cuid de usuario (`c` + minúsculas y dígitos) y `guest_<uuid>` (hexadecimal en minúscula), con el
  `_` solo en el prefijo fijo y los `-` en posiciones fijas, así que dos ids difieren siempre en una minúscula o un
  dígito, donde ICU y UTF-16 ordenan igual. No lo es en general (`"_"` va antes que `"-"` en ICU, y las mayúsculas y
  los acentos cambian el orden). Sobre cualquier otro texto (nombres de movimientos, de Pokémon o de jugadores) se usa
  `Collations.names()` (ICU4J con la raíz CLDR y fuerza terciaria, la misma ICU que Node; también lo usa
  `PokemonCatalogService`) y la fixture dorada arbitra. `java.text.Collator` no vale: ignora espacios y guiones en el
  nivel primario y pone `"Thunderbolt"` antes que `"Thunder Shock"`, al revés que `localeCompare`. Las fixtures
  se grabaron con ICU 78.3 (`com.ibm.icu:icu4j` en `backend/build.gradle.kts`): subir `icu4j` puede cambiar algún
  orden de nombres, y entonces hay que regrabarlas y revisar el diff.
- **`.int()` de Zod**: en Zod 4 es `Number.isSafeInteger` (`|n| <= 2^53 - 1`), no solo "sin decimales": se traduce
  con `JsNumbers.isSafeInteger` (`domain/json`). `1e20` y `2^53` no validan; `2^53 - 1` sí. Con `.min().max()`, el
  primer issue de Zod para `1e20` es `too_big`, no `invalid_type`: `ConfigReader.integer` lo rechaza con «debe estar
  entre», y reserva «debe ser un número entero» para `10.5` o un tipo erróneo.
- **`trim()`**: todo `trim()` de TS o de Zod (`z.string().trim()`) se traduce con `JsStrings.trim`, nunca con
  `String.trim()` ni `String.strip()`: JS también quita los espacios de no separación (`U+00A0`, `U+202F`), `U+FEFF` y
  toda la categoría `Zs`.
- **`\p{Diacritic}`**: una regex TS con `\p{Diacritic}` se traduce filtrando por punto de código con
  `UCharacter.hasBinaryProperty(codePoint, UProperty.DIACRITIC)` de ICU4J (ver `poketaboo/PokeTabooRules`). El `\p{M}`
  de Java no es equivalente: deja fuera `^`, `` ` `` o `¨` e incluye marcas que no son diacríticos.

## Fixtures doradas: cambiar un motor o añadir uno

Cada fixture guarda una entrada (jugadores, `seed`, `now`, configuración, contexto y pasos) y lo que el motor devolvió
(`expected`, y `stoppedAt` si un paso se detuvo). `config-cases.json` guarda configuraciones de entrada y si validan.

1. **Cambiar un motor a propósito.** Cambia el Java y regraba:
   `cd backend && ./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'`. Revisa el diff de
   `src/test/resources/golden/`: es el cambio de comportamiento, y tiene que ser solo el que buscabas. Sin `-Dupdate`,
   `GoldenReplayTest` compara y falla en el primer desajuste con su ruta JSON. Un desajuste que no esperabas es un
   fallo del motor, no de la fixture. Si cambia la configuración, cambia también su esquema Zod en
   `packages/shared/src/games/<id>/config.ts`, del que la web saca sus tipos (Guess From Stats valida además con él);
   `config-cases.test.ts` exige que acepte y normalice lo mismo que graba `config-cases.json`.
2. **Añadir un escenario.** Escribe a mano `golden/<id>/<escenario>.json` con `engineId`, `scenario`, `seed`,
   `catalog` (`gen1-2`), `players`, `config` y `steps` (copia uno existente del mismo motor), sin `expected`, y
   grábalo con el comando del paso 1. Cada escenario necesita como mínimo 3 rondas, un `seed` distinto y un `now`
   realista. Cubre cada literal de error, la presencia (desconexión que resuelve), la visibilidad y una acción
   inválida que detenga el escenario. En `config-cases.json` añade entradas `{ "input": …, "valid": false }`
   válidas con normalización e inválidas en cada límite; el grabador corrige `valid` y añade `normalized`.
   - **Pasos**: `{ kind: 'action', playerId, action, now }`, `{ kind: 'timeout', now }`,
     `{ kind: 'presence', players, now }` y `{ kind: 'asset', assetToken, roundNumber, assetId, now }`. Un paso
     `asset` llama a `resolveAsset` sin cambiar el estado y graba `{ resolution }` sin snapshot; copia el token y la
     ronda de la proyección grabada y cubre también un token o una ronda distintos.
   - **Contexto**: un escenario puede traer `hostCustomCategories`, `hostWouldYouRatherPrompts`, `pokemonVisuals`
     (`Record<id, PokemonVisualAsset>`), `pokemonAudio` (`Record<id, { latest?, legacy? }>`) y `tcgCards`. Solo los
     que trae llegan al `GameContext` (ausente ≠ vacío). `GoldenContexts` monta los catálogos en memoria, en el orden
     de la fixture; `tcgCards.cardsFor` filtra por sets, rarezas y precio decimal, no por generación.
   - **Parche de catálogo**: `catalogPatch` (`Record<id, { palette: string[]; paletteWeights: number[] }>`) superpone
     la paleta a esas filas del catálogo dorado (`golden/catalog/gen1-2.json`, que no trae paletas) antes de
     construirlo; `GoldenCatalogs.load` falla si un id no está en la fixture.
3. **Añadir un motor.** Créalo con los ficheros de arriba y regístralo en un único sitio: `portedEngines` de
   `adapters/out/resources/ClasspathGameRegistryLoader.java`, con
   `engines.put(<Juego>Engine.ID, new <Juego>Engine(manifest(manifests, <Juego>Engine.ID)))`. Su manifiesto y su
   configuración por defecto se escriben a mano en `src/main/resources/games/registry.json`, la fuente de los dos;
   la `default<Juego>Config` de `packages/shared` tiene que coincidir (lo comprueba `registry-defaults.test.ts`). En
   `packages/shared/src/games/<id>/` van `config.ts` (esquema Zod y configuración por defecto), en `types.ts` las
   proyecciones que lee la web y lo que referencian, y las constantes o textos que muestre la pantalla. No va el
   estado de servidor ni ninguna regla autoritativa. Las excepciones son las acciones que construye la web
   (`shinyVoteActionSchema`, `sketchmonActionSchema`, `whoIsWhoCursorPositionSchema`) y las copias de presentación de
   reglas del motor (`learnsetPoints`, `learnsetManualRevealPoints`, `normalizeTabooText`, `tabooBaseId`): si cambia
   el motor, cámbialas también.
   Escribe sus escenarios como en el paso 2 y grábalos. `GoldenReplayTest` los recoge solo y
   `GoldenRegistryConsistencyTest` exige que todo motor registrado tenga fixtures y viceversa. Todo en el mismo commit.
4. Termina con `./gradlew check` y, en la raíz, con `npm run lint && npm test`.
