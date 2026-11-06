# Ability Hunt

Fecha: 2026-11-07. Estado: reglas decididas por el usuario (MINIJUEGOS_MEJORAS.md §9); el resto, pendiente de
revisión escrita.

## Objetivo

Un minijuego nuevo de carrera. Se muestra una habilidad y gana la ronda el primero que nombra un Pokémon que la
tenga. Si es la habilidad oculta de ese Pokémon, gana más puntos. Tras N rondas gana quien más puntos tiene.

**Criterio de éxito:**
- una partida de 3 jugadores a 10 rondas dura menos de 6 minutos;
- cada ronda la cierra el primer acierto o el tiempo;
- en la revelación se ve quién ganó, con qué Pokémon, si era su habilidad oculta y otros Pokémon que la tienen.

## Decisiones tomadas

- **Identidad:** id `ability-hunt`, nombre «Ability Hunt». Mantiene el inglés, como «Type Duel» o «Higher or Lower».
  Emoji del manifiesto `🧬`; icono de línea `Crosshair`; objeto `ability-capsule` (`GAME_ITEMS`; la URL de PokéAPI
  responde 200). Descripción: «Sale una habilidad: el primero en nombrar un Pokémon que la tenga gana la ronda. Con la
  habilidad oculta, puntos dobles.».
- **Jugadores:** de 2 a 8. El máximo es el tope común de 8.
  - Decisión tomada (revisable): el mínimo es 2, como fija §9: es una carrera.
- **La ronda termina con el primer acierto.** Si nadie acierta, termina al agotarse el tiempo, sin puntos.
- **Puntos: 100 por ronda ganada y 200 si es la habilidad oculta de ese Pokémon** («puntúa doble», §9).
  - No hay bonus de rapidez: la rapidez ya decide quién gana.
  - Los puntos de sesión salen de la posición (`sessionPointsForResults`), así que la escala no desequilibra la
    sesión frente a juegos de 10 puntos.
  - Decisión tomada (revisable): doble y no +50, porque la regla de §9 dice «puntúa doble».
- **«Un Pokémon ya nombrado no cuenta»** tiene dos partes:
  1. **En la ronda:** un Pokémon que ya ha intentado cualquiera en esta ronda, y que falló, no se puede volver a
     intentar (`"Ese Pokémon ya se ha dicho en esta ronda."`). No cuenta como intento ni pone espera.
  2. **En la partida:** la especie que ganó una ronda (por `nationalDexNumber`, todas sus formas) no puede volver a
     ganar otra (`"Ese Pokémon ya ganó una ronda en esta partida."`). Decisión tomada (revisable): se bloquea por
     especie y no por forma, para que «Vulpix» y «Vulpix de Alola» no valgan dos veces.
  - El buscador marca los dos casos como no elegibles (`locked`, como Type Chain).
- **Decisión tomada (revisable): espera de 2 s tras un fallo** (`COOLDOWN_MS = 2_000`). Es más que el segundo de
  «¿Quién es ese Pokémon?»: aquí probar Pokémon al azar es la trampa obvia.
- **Decisión tomada (revisable): nombres solo en español.** `Ability.names` solo trae `es` en la BD local, y `Pokemon.abilities` ya guarda el nombre
  oficial en español.
  - El jugador no escribe el nombre a mano: lo elige con el `PokemonSelector` de siempre, que ya ignora acentos y
    mayúsculas (`normalizePokemonQuery`), y la acción envía el `pokemonId`.
  - No hay que comparar texto en el servidor.
- **Formas regionales.** Decisión tomada (revisable): el campo `includeRegionalForms` está desactivado por defecto. Activado, las formas entran en
  el pool y en el buscador, y cada forma cuenta con sus propias habilidades: «Vulpix de Alola» vale para «Manto Níveo»
  y «Vulpix», no.
- **Decisión tomada (revisable): no se muestra la descripción de la habilidad.** `Ability.effect` no está en el catálogo en memoria; queda fuera de
  alcance.
- **No hace falta migración Flyway.** La marca de oculta ya está en la BD en dos sitios:
  - `PokemonAbility.isHidden`;
  - `Pokemon.metadata.abilityRelations[].isHidden`, en 1083 de 1083 filas de la BD local.
  Lo que falta es llevarla al catálogo en memoria (ver «Datos»).

## Reglas

1. **Pool.** Se usa `context.pokemon().forGenerations(config.generations, config.includeRegionalForms)`, sin los Pokémon
   con `abilities` vacío.
2. **Habilidades elegibles.** Decisión tomada (revisable): son las que tienen al menos **3** Pokémon del pool
   (`MIN_POKEMON_PER_ABILITY = 3`). Se
   cuentan sobre `abilities`, que incluye las normales y las ocultas, y se ordenan con `Collations.names()`.
3. **Mazo.** En `createInitialState`, `Randoms.shuffled(elegibles, context.random())` baraja **todas** las elegibles,
   y no solo `rounds`. Así, si una habilidad se queda sin Pokémon desbloqueados, se salta a la siguiente.
4. **Inicio de ronda.**
   - Se toma la siguiente habilidad del mazo que tenga al menos un Pokémon del pool cuya especie no esté bloqueada.
   - Si no queda ninguna, la partida termina. En la práctica no pasa: bloquear 19 especies no agota el mazo, pero se
     cubre.
   - `roundEndsAt = now + roundSeconds·1000`.
5. **Intento** (`{ type: 'GUESS_POKEMON', pokemonId }`, estricto). Las comprobaciones van en este orden:

   | Comprobación | Respuesta |
   |---|---|
   | Fase distinta de `ROUND_ACTIVE` | `"No hay una ronda activa."` |
   | El jugador no está en `playerIds` o no es obligatorio | `"Estás observando esta ronda."` |
   | `now >= roundEndsAt` | `"El tiempo ha terminado."`, con la ronda resuelta, como en ¿Quién es ese Pokémon? |
   | Espera activa | `Timing.cooldownMessage(now, cooldown)` |
   | Fuera del pool | `"Ese Pokémon no pertenece al pool configurado."` |
   | Ya intentado en la ronda | `"Ese Pokémon ya se ha dicho en esta ronda."` |
   | Especie bloqueada | `"Ese Pokémon ya ganó una ronda en esta partida."` |
   | Tiene la habilidad | Acierto: puntos, se bloquea la especie y la ronda se resuelve **en la misma acción** |
   | No la tiene | Fallo público en `attempts`, `attemptCount + 1` y espera de 2 s |

6. **Resolución.** Decisión tomada (revisable): la ronda pasa a `ROUND_RESULTS` durante `REVEAL_MS = 5_000`. Es un segundo más que ¿Quién es ese
   Pokémon?, porque hay más que leer. Después empieza la siguiente ronda o llegan los resultados (`Timing.advanceTimedRound`).
7. **Presencia.** `handlePresenceChange` no cambia nada: la ronda sigue hasta el primer acierto o el tiempo. Un
   desconectado deja de ser obligatorio y recibe `"Estás observando esta ronda."` si actúa en ese momento.
8. **Disponibilidad** (`checkAvailability`; el lobby muestra el literal):
   - sin Pokémon en el pool: `"No hay Pokémon con habilidades en las generaciones seleccionadas."`;
   - sin elegibles: `"No hay habilidades con al menos 3 Pokémon en estas generaciones."`;
   - con menos elegibles que rondas: `` `Con estas generaciones solo hay ${n} habilidades con al menos 3 Pokémon: baja las rondas a ${n} o añade generaciones.` ``.
   - Hace falta: la Gen 7 sola tiene 19 elegibles en la BD local y el máximo es de 20 rondas.
   - `createInitialState` lanza `EngineException` con el mismo literal. También lanza `` `Se necesitan al menos ${minPlayers} jugadores.` ``.
9. **Resultados.**
   - `Scoring.buildRankedResults`, ordenando por puntos, rondas ganadas y victorias con habilidad oculta (las tres de
     mayor a menor) y, al final, por `playerId`.
   - Un empate a cero no corona (`winnersNeedPoints`).

## Configuración (`abilityHuntConfigSchema`, estricta)

El orden de las claves es el del esquema.

| Clave | Tipo | Rango | Por defecto |
|---|---|---|---|
| `generations` | `pokemonGenerationsSchema` | 1–9, sin duplicados, ascendente | las 9 |
| `rounds` | entero | 1–20 | 10 |
| `roundSeconds` | entero | 15–60 | 30 |
| `includeRegionalForms` | booleano | — | `false` |

- Decisión tomada (revisable): `roundSeconds` va de 15 a 60 s, con 30 por defecto. Hace falta pensar en una
  habilidad, buscar y escribir.
- Sin `mode`: este juego no tiene modos.
- En el panel, `roundSeconds` va de 5 en 5.
- Una clave desconocida invalida la configuración, como en ¿Quién es ese Pokémon?.

## Datos: `hiddenAbilities` en el catálogo

- `domain/pokemon/Pokemon` gana un componente al final, `List<String> hiddenAbilities`.
  - Contiene los nombres en español de las habilidades ocultas.
  - Siempre es un subconjunto de `abilities` y nunca es `null`: el constructor compacto convierte `null` en
    `List.of()`.
  - El constructor canónico lleva `@Creator`, como `GameResults`, para que Micronaut Serde lo use al leer el
    catálogo dorado.
  - Hay un constructor más con la aridad anterior, que delega con `List.of()`. Así los tests que construyen `Pokemon`
    por posición no cambian (`PokemonSpriteServiceTest`, `HigherLowerRulesTest`, `PokedexEntryGuessEngineTest`,
    `PokemonBluffAuctionEngineTest`, `PokemonConnectionsEngineTest`, `ShinyVoteEngineTest` y
    `WhosThatPokemonEngineTest`).
  - `withPalette` la conserva.
- `application/pokemon/CatalogHiddenAbilities.from(metadata)` lee `metadata.abilityRelations[]` y devuelve los `name`
  con `isHidden == true`, en orden de `slot`. Sigue el modelo de `CatalogPalette`. Si falta la relación o viene mal
  formada, devuelve `[]`, y entonces nadie gana el doble.
  - `PokemonCatalogService.toPokemon` lo usa.
  - No hace falta otra consulta: `metadata` ya se carga, y el data-sync (`PokemonCatalogSeeder`) ya escribe
    `abilityRelations` con `isHidden`.
- **Privacidad:** `/api/pokemon/selector` sigue devolviendo solo `id`, `name` y `sprite`. La marca de oculta solo sale
  en la revelación, para los Pokémon de la ronda.
- **Catálogo dorado** (`backend/src/test/resources/golden/catalog/gen1-2.json`, datos congelados):
  - se añade `hiddenAbilities` a sus 293 filas, sacado de la BD local sembrada;
  - es un cambio de datos a mano: el script no se guarda en el repo;
  - ningún motor actual lee el campo, así que las demás fixtures no cambian.
  - Decisión tomada (revisable): completar el catálogo en vez de ampliar `catalogPatch`, para que el bonus de oculta se
    pruebe con datos reales en cualquier escenario.
- El tipo TS `Pokemon` de `packages/shared` no cambia: ningún contrato del navegador lleva el catálogo completo.

## Proyecciones

Pública (`AbilityHuntPublicState`):

```
gameId, phase, roundNumber, totalRounds,
ability: { name, pokemonCount } | null,      // solo en ROUND_ACTIVE y ROUND_RESULTS
attempts: [{ playerId, guessedPokemon: { id, name, sprite }, attemptedAt }],   // fallos de la ronda
lockedPokemonIds: string[],                  // ids del pool de las especies que ya ganaron
solvedPlayers: [{ playerId, solveOrder }],   // como mucho el ganador, con solveOrder 1
scores, roundStartedAt, roundEndsAt, nextTransitionAt,
lastRound: AbilityHuntRoundResult | null,    // solo en ROUND_RESULTS y GAME_RESULTS
results: GameResults | null
```

`AbilityHuntRoundResult`:

```
ability: { name, pokemonCount },
winner: { playerId, pokemon: { id, name, sprite }, hidden, points, elapsedMs } | null,
examples: [{ id, name, sprite, hidden }],    // hasta 3, sin el del ganador
solves: Record<playerId, { solveOrder, points }>,
attemptCounts: Record<playerId, number>
```

- `examples` son los primeros 3 Pokémon del pool con la habilidad, en orden del catálogo (número de Pokédex) y sin el
  ganador.
  - Decisión tomada (revisable): el orden del catálogo, sin azar, para que la revelación sea estable.
  - Decisión tomada (revisable): como mucho 3 (`MAX_EXAMPLES = 3`). Con la carta del ganador son 4, y así la
    revelación cabe a 390×844 sin scroll de documento. Guess from Stats ya pinta varias cartas con detalle en
    `GuessRoundReveal`, que se desplaza por dentro.
- `pokemonCount` es cuántos Pokémon del pool la tienen. Se ve durante la ronda como pista de dificultad. Decisión
  tomada (revisable): se muestra.
- Por jugador (`AbilityHuntPlayerState`): `canGuess`, `solved`, `solveOrder`, `cooldownUntil`, `roundPoints`,
  `attemptCount` y `lastAttempt: { result: 'CORRECT' | 'INCORRECT', attemptedAt } | null`. Son los campos que lee
  `useGuessRound`.
- **Privacidad:** durante `ROUND_ACTIVE` no sale ninguna respuesta válida. `examples` y `winner` solo van en `lastRound`,
  que es `null` en la fase activa. Los intentos fallidos sí son públicos: así todos saben qué no repetir.

## Estadísticas y perfil

`AbilityHuntPlayerStats` tiene, en este orden: `roundsWon`, `hiddenAbilityWins`, `totalAttempts`, `solveTimeTotalMs`,
`bestTimeMs` y `pointsFromRounds`.

- `profileStats.metrics` en `registry.json` (todas `SUM`, salvo `bestTimeMs`, que es `MIN`):

  | Clave | Etiqueta | Formato |
  |---|---|---|
  | `roundsWon` | «Rondas ganadas» | |
  | `hiddenAbilityWins` | «Con habilidad oculta» | |
  | `totalAttempts` | «Intentos totales» | |
  | `solveTimeTotalMs` | «Tiempo total en aciertos» | `DURATION_MS` |
  | `bestTimeMs` | «Mejor tiempo» | `DURATION_MS` |
  | `pointsFromRounds` | «Puntos en rondas» | |

- `derivedMetrics`:
  - `accuracy`, «Precisión»: `PERCENT`, `roundsWon / totalAttempts`;
  - `averageSolveTime`, «Tiempo medio para acertar»: `AVERAGE`, `solveTimeTotalMs / roundsWon`, en `DURATION_MS`.

## Pantallas

Con el kit de adivinar (`frontend/src/room/guess-kit`) y sin componentes nuevos de `ui/`.

- **Pista** (`GuessClue`):
  - el nombre de la habilidad en grande: `var(--fs-34)` en móvil y `var(--fs-44)` desde `lg`, en
    `AbilityHunt.module.css`, con la fuente de display;
  - un `Chip` con «N Pokémon la tienen»;
  - un recordatorio: «Habilidad oculta: puntos dobles».
- **Cabecera:**
  - en la ronda, «¿Quién tiene {habilidad}?»;
  - en la revelación, con ganador, «¡{jugador} gana con {Pokémon}!», y sin ganador, «Nadie encontró a tiempo».
- **Placa inferior** (`GuessPanel`):
  - el buscador, con `locked` igual a `lockedPokemonIds` más los Pokémon de `attempts`;
  - la ayuda «100 puntos; 200 si es su habilidad oculta».
- **Lateral:** en la ronda, el marcador (`GuessPlayersPanel`) y los fallos (`GuessAttemptsFeed`); en la revelación,
  `GuessRevealBoard`.
- **Revelación** (`GuessRoundReveal`):
  - primero la carta del ganador, con detalle «Habilidad oculta · ×2» o «Habilidad normal»;
  - después los ejemplos, con detalle «Oculta» en los que la tienen oculta;
  - en `details`, «{pokemonCount} Pokémon tienen {habilidad}».
- **Región viva:** una sola, la de `useGuessRound`. `answer` es el Pokémon del ganador o `` `${pokemonCount} respuestas válidas` ``.
- **Errores:** un solo dueño. `gameAction` los publica en el aviso de la sala y el kit descarta el fallo del buscador.
- **Resultados** (`ResultsShell` con `standings`, como `WhosThatPokemonResults`):
  - en cada fila, rondas ganadas, con habilidad oculta, intentos, precisión y mejor tiempo;
  - récords: «Más rondas ganadas», «Acierto más rápido» y «Cazador de ocultas».
- **Panel de configuración:**
  - `GenerationSelector`;
  - `Toggle`: «Formas regionales»;
  - `ConfigRange`: «Número de rondas» (1–20) y «Tiempo por ronda» (15–60, de 5 en 5).

## Ficheros por juego

- **Java** (`domain/game/engines/abilityhunt/`): `AbilityHuntConfig`, `AbilityHuntTypes`, `AbilityHuntRules` y
  `AbilityHuntEngine`. Además:
  - la entrada de `registry.json`;
  - `portedEngines` en `ClasspathGameRegistryLoader`;
  - `golden/ability-hunt/*.json` y `config-cases.json`;
  - `config-messages.json`, regenerado;
  - un caso a mano en `gameconfigs/migration-cases.json`.
- **Shared** (`packages/shared/src/games/ability-hunt/`): `config.ts`, `types.ts` y `rules.ts` (constantes de puntos y
  `abilityHuntScoringLabel()`), exportados en `public.ts`.
- **Frontend:**
  - `frontend/src/games/ability-hunt/ConfigPanel.tsx`, `presentation.ts` y `AbilityHunt.module.css`;
  - `frontend/src/room/AbilityHuntGame.tsx` y `AbilityHuntResults.tsx`;
  - `registry.ts`, `game-icons.ts` y `game-skip-slot.ts`.
- **Cuentas fijas de 28 juegos que pasan a 29:**
  - `GamesControllerTest`, `ProfileControllerTest`, `ClasspathGameRegistryLoaderTest` (×3),
    `StoredGameConfigMigrationTest`, `RoomCoordinatorTest` (×2) y el comentario de `ConfigMessagesSnapshotTest`;
  - `README.md` y `docs/architecture.md`.
- **E2E:** el bucle genérico de `juegos.spec.ts` recoge el juego solo. Además, un test propio y la entrada en
  `SCREENSHOT_GAMES`.

## Fuera de alcance

- Descripción o efecto de la habilidad.
- Modos de juego, como «Supervivencia» o «Todas las respuestas».
- Una nota de parche en «Novedades».
- Rachas y logros: los cubre la spec de logros.
