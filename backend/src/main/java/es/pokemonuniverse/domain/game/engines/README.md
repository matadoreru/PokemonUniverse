# Cómo portar un motor

Cada motor Java es una traducción literal del motor TypeScript congelado (`packages/shared/src/games/<id>/`). Las
fixtures doradas lo verifican. La referencia es `higherlower/`.

## Ficheros (`engines/<idsinguiones>/`)

- `<Juego>Config`: un record `@Serdeable` más `parse(JsonNode)`, que reproduce el esquema Zod. Las claves desconocidas
  se ignoran salvo si el esquema es `.strict()`. Hay que aplicar las mismas transformaciones (dedup, orden). Un entero
  acepta `10.0` y rechaza `10.5`. Un fallo lanza `ConfigValidationException`.
- `<Juego>Types`: los records de `types.ts` con los mismos nombres, más la acción con su `parse(JsonNode)`, que es
  estricto si el esquema TS lo es.
- `<Juego>Rules`: el port de `rules.ts`.
- `<Juego>Engine`: el port de `server.ts`. Recibe en el constructor el `GameManifest` de `games/registry.json`; el
  manifiesto no se duplica a mano.

## Convenciones

- **Estado con builder**: todo record de estado tiene un `Builder` anidado con setters con nombre, más `builder()` y
  `toBuilder()`. Cada transición deriva de `state.toBuilder()…build()`, que es el `{ ...state, … }` de TS. El motor
  nunca llama al constructor posicional: dos campos contiguos del mismo tipo se pueden intercambiar sin que lo detecte
  el compilador. Un helper como `finished()` vale si usa el builder.
- **Inmutabilidad**: los `Record<string, …>` son `LinkedHashMap` copiados con `Immutables.frozenMap` en el constructor
  compacto, y las listas usan `Immutables.frozenList`. Sin esto, una acción rechazada podría mutar el estado.
- **Orden de claves** (constraint 6): un `LinkedHashMap` conserva el orden de inserción, como JS con claves no numéricas.
  Si aparece un `Record<number, …>`, sus claves se ordenan como `JsonTree` al proyectar.
- **Proyecciones**: cada record público o de jugador, incluidos los anidados, lleva `@Serdeable` y
  `@JsonInclude(ALWAYS)`. Un `null` de TS debe salir como `null`. Un `?:` de TS se marca `NON_ABSENT`/`NON_NULL` campo
  a campo.
- **PRNG**: hay que consumir `context.random()` el mismo número de veces y en el mismo orden que el TS. Se usa
  `Randoms.randomItem`/`shuffled`/`contentDeck` y se conserva el `Math.min(Math.floor(r * n), n - 1)`. Una extracción
  de más o de menos aparece como desajuste dorado.
- **Ciclo de vida**: `TimedLifecycle.builder(phase)` lleva exactamente los campos que `timedGameLifecycle` lee del
  estado TS. El ciclo activo → resultados → siguiente usa `Timing.advanceTimedRound` con un `TimedRoundStrategy`
  `static final`.
- **Errores**: los literales de `server.ts`, idénticos, en `GameActionResult.reject`. Un `throw new Error` de TS se
  traduce como `EngineException` con el mismo mensaje.
- **`localeCompare`**: si se traduce como `String.compareTo`, hay que documentar por qué es equivalente (por ejemplo,
  ids cuid en minúsculas).

## Escenarios dorados y verificación

1. Escribe `packages/shared/golden/scenarios/<id>.ts` y regístralo en `scenarios/index.ts`. Cada escenario necesita
   como mínimo 3 rondas, un `seed` distinto y un `now` realista. Elige seeds que roten categorías o contenido entre
   rondas. Cubre cada literal de error, la presencia (desconexión que resuelve), la visibilidad y una acción inválida
   que detenga el escenario. Los `configCases` deben incluir entradas válidas con normalización e inválidas en cada
   límite.
2. Ejecuta `npm run build -w @pokemon-universe/shared && npm run golden:export` y commitea los escenarios y las fixtures.
   Revisa una fixture a ojo.
3. Ejecuta `cd backend && ./gradlew test --tests '*GoldenReplayTest*'`. Debe fallar con `Motor no portado: <id>`.
4. Porta el motor y regístralo en `backend/src/test/java/es/pokemonuniverse/golden/GoldenEngines.java` con
   `new <Juego>Engine(GoldenManifests.of(<Juego>Engine.ID))`.
5. Vuelve a ejecutar el paso 3 hasta que pase. Ante un desajuste, corrige el Java: nunca las fixtures ni el TS. Termina
   con `./gradlew check` y, en la raíz, con `npm run lint && npm test`, que incluye `check:golden`.
