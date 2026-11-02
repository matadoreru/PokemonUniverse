# Cómo portar un motor

Cada motor Java es una traducción literal del motor TypeScript congelado (`packages/shared/src/games/<id>/`). Las
fixtures doradas lo verifican. La referencia es `higherlower/`.

## Ficheros (`engines/<idsinguiones>/`)

- `<Juego>Config`: un record `@Serdeable` más `parse(JsonNode)`, que reproduce el esquema Zod. Las claves desconocidas
  se ignoran salvo si el esquema es `.strict()`. Hay que aplicar las mismas transformaciones (dedup, orden). Se
  replica `.int().min().max()` de cada campo, con los mismos límites. Un entero acepta `10.0` y rechaza `10.5`. Un
  fallo lanza `ConfigValidationException`.
- **Config: usar `ConfigReader`** (`engine/infra`). `ConfigReader.of(raw, "<nombre visible>")` comprueba el objeto y
  da `strict`, `integer`, `safeInteger`, `option`, `bool`, `enumValue`, `generations` y `object` (objeto anidado), y
  `allGenerations()` para los valores por defecto. Falla en el primer error con
  `Configuración de <juego> no válida: <detalle>.`, que la sala muestra tal cual. Las reglas propias del esquema
  (`superRefine`) lanzan `config.invalid(detalle)` sin punto final. Un helper local solo se justifica si su mensaje
  difiere del común, y se comenta por qué.
- `<Juego>Types`: los records de `types.ts` con los mismos nombres, más la acción con su `parse(JsonNode)`, que es
  estricto si el esquema TS lo es.
- `<Juego>Rules`: el port de `rules.ts`.
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
  nivel primario y pone `"Thunderbolt"` antes que `"Thunder Shock"`, al revés que `localeCompare`. Hoy ICU 78.3 en
  los dos lados (`process.versions.icu` y `com.ibm.icu:icu4j` en `backend/build.gradle.kts`): subir la ICU de Node
  obliga a subir `icu4j` y a reexportar las fixtures. Las fixtures se exportan con `LANG=en_US.UTF-8` (ICU `en-US`): si
  CI difiere en una comparación de textos, la causa es la configuración regional del exportador, no el motor.
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

## Escenarios dorados y verificación

1. Escribe `packages/shared/golden/scenarios/<id>.ts` y regístralo en `scenarios/index.ts`. Cada escenario necesita
   como mínimo 3 rondas, un `seed` distinto y un `now` realista. Elige seeds que roten categorías o contenido entre
   rondas. Cubre cada literal de error, la presencia (desconexión que resuelve), la visibilidad y una acción inválida
   que detenga el escenario. Los `configCases` deben incluir entradas válidas con normalización e inválidas en cada
   límite.
   - **Contexto**: un escenario puede traer `hostCustomCategories`, `hostWouldYouRatherPrompts`, `pokemonVisuals`
     (`Record<id, PokemonVisualAsset>`), `pokemonAudio` (`Record<id, { latest?, legacy? }>`) y `tcgCards`
     (`TcgComparableCard[]`). Solo los que trae llegan al `GameContext` (ausente ≠ vacío); `preloadImage` es siempre
     un no-op. `golden/context.ts` y `GoldenContexts.java` montan los mismos catálogos en memoria, en el orden de la
     fixture; `tcgCards.cardsFor` filtra por sets, rarezas y precio decimal, no por generación.
   - **Parche de catálogo**: `catalogPatch` (`Record<id, { palette: string[]; paletteWeights: number[] }>`) superpone
     la paleta a esas filas del catálogo antes de construirlo, tal cual y sin la validación del cargador de Node:
     `applyCatalogPatch` (`golden/catalog-patch.ts`) y `GoldenCatalogs.load(catalog, catalogPatch)` hacen lo mismo y
     fallan si un id no está en la fixture. Existe porque el exportador de catálogo borra las paletas (las calcula el
     data-sync) y `pokemon-palette-guess` las necesita; sus escenarios traen paletas literales de 8 colores. Úsalo
     solo para datos que la base local no tiene.
   - **Paso `asset`**: `{ kind: 'asset', assetToken, roundNumber, assetId, now }` llama a `resolveAsset` sin cambiar el
     estado y graba `{ resolution }` sin snapshot. Un `string` del motor TS se normaliza a
     `{ source, transform: 'ORIGINAL' }` (como `game-image-cache.ts`) y `null` o un motor sin `resolveAsset` graba
     `resolution: null`, que en Java es `Optional.empty()`. Copia el token y la ronda de la proyección grabada y cubre
     también un token o una ronda distintos. `AssetResolution` serializa `source, transform, focusSeed, zoom, recolor`
     sin los nulos (inclusión `NON_NULL`), así que los literales TS `{ source, transform }`,
     `{ source, transform, focusSeed, zoom }` y `{ source, transform, recolor }` coinciden con la comparación ordenada.
2. Ejecuta `npm run build -w @pokemon-universe/shared && npm run golden:export` y commitea los escenarios y las fixtures.
   Revisa una fixture a ojo.
3. Ejecuta `cd backend && ./gradlew test --tests '*GoldenReplayTest*'`. Debe fallar con `Motor no portado: <id>`.
4. Porta el motor y regístralo en un único sitio: `portedEngines` de
   `adapters/out/resources/ClasspathGameRegistryLoader.java`, con
   `engines.put(<Juego>Engine.ID, new <Juego>Engine(manifest(manifests, <Juego>Engine.ID)))`. El arnés dorado
   (`GoldenEngines`) lee ese mismo registro, así que `GoldenReplayTest` lo recoge solo, y
   `GoldenRegistryConsistencyTest` exige que todo motor registrado tenga fixtures y viceversa. El manifiesto ya está en
   `registry.json`: `npm run registry:export` solo hace falta cuando cambia un manifiesto.
5. Vuelve a ejecutar el paso 3 hasta que pase. Ante un desajuste, corrige el Java: nunca las fixtures ni el TS. Termina
   con `./gradlew check` y, en la raíz, con `npm run lint && npm test`, que incluye `check:golden`.
