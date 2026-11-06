# Reto diario

Fecha: 2026-11-07. Estado: **revisado por el usuario**. Lo escribió un agente con las decisiones del usuario del
2026-11-06; cada elección que no tomó el usuario va marcada como «Decisión tomada (revisable)», y lo que cambió el
usuario al revisarlo va marcado como «Decisión del usuario (2026-11-06)». Origen:
`MINIJUEGOS_MEJORAS.md` §2.5, §3.5, §5.5, §7.5, §8.8 y §10 «Fase 4».

## Objetivo

Desde «Jugar», una cuenta registrada juega sola **el reto del día**: un único reto, de uno de estos cuatro
minijuegos, elegido al azar a partir de la fecha: Pokédex Distance, Shiny Quiz, Higher or Lower y Learnset Guess. Ese
día, el juego y el contenido son los mismos para todo el mundo. Al terminar ve su resultado y la clasificación del día
entre las cuentas registradas, y puede copiar un texto con emojis para compartirlo.

**Criterio de éxito:**
1. Dos cuentas registradas juegan el reto el mismo día: les toca el mismo minijuego y ven el mismo contenido (por
   ejemplo, si es Higher or Lower, las mismas diez comparaciones).
2. Las dos aparecen en la clasificación del día, ordenadas por puntos.
3. Ninguna puede volver a jugar ese día, aunque salga a mitad de partida o recargue la página.

## Decisiones del usuario

- Solo cuentas registradas.
- En solitario, desde la pantalla «Jugar» (`frontend/src/screens/PlayPage.tsx`), con una tarjeta «Reto diario» que
  muestra el minijuego de hoy.
- Mismo contenido para todos ese día: semilla derivada de la fecha, y el día cambia a las 00:00 de `Europe/Madrid`.
- **Decisión del usuario (2026-11-06): un solo reto al día, no uno por minijuego.** El minijuego del día sale al azar
  de la semilla de la fecha entre los cuatro (Pokédex Distance, Shiny Quiz, Higher or Lower y Learnset Guess), y puede
  repetirse en días seguidos.
- **Decisión del usuario (2026-11-06): un intento por cuenta y día** (clave única cuenta + fecha) y **una
  clasificación por día**.
- **Decisión del usuario (2026-11-06):** se mantiene la tabla de modo y rondas fijos por juego («Qué se juega cada
  día»), que ahora se aplica al minijuego que toque.
- Al terminar, el resultado propio, la clasificación del día y un texto para compartir.
- Los logros son otra pieza (`2026-11-07-logros-y-records-design.md`). Aquí solo se exponen los resultados.

## Decisiones tomadas

- **Un intento al día en total.** Decisión del usuario (2026-11-06): sustituye a la propuesta anterior de un intento
  por minijuego. Como solo hay un reto al día, toda la gente juega lo mismo y la clasificación del día es una sola.
- **Una sala privada de un solo jugador por debajo.** Decisión tomada (revisable): el reto reutiliza tal cual los
  motores, los temporizadores, la reconexión y las pantallas de juego de una sala normal.
  - La sala lleva una marca `daily`.
  - No admite a nadie más.
  - Rechaza todos los comandos de lobby y sesión.
  - Se cierra cuando el jugador sale.
  - Hacer un flujo aparte habría duplicado el ciclo de vida de la partida (`RoomCoordinator`, `GameRuntime`,
    temporizadores y gracia de presencia).
- **Cuenta como jugado desde que empieza.** Al arrancar se guarda una fila `STARTED`, antes de que se genere ningún
  contenido. Salir, cerrar la pestaña, desconectarse o un reinicio del servidor no devuelven el intento.
- **No cuenta para las estadísticas normales ni da XP.** Decisión tomada y confirmada por el usuario (2026-11-06): una partida del reto no pasa
  por `GameResultsPersister`, así que no crea filas en `PlayerGameResult`, `GameHistory` ni `RoomHistory`. Tampoco
  suma a `UserStats` ni a `UserGameStats`, ni da experiencia.
  - En solitario siempre se queda primero: contarla inflaría las victorias y la XP, y permitiría conseguir logros de
    victoria sin rival.
  - El resultado vive solo en `DailyResult`, que es lo que leerán los logros.
- **La clasificación del día solo se ve después de jugar el reto.** Antes de jugar, la tarjeta muestra el minijuego de
  hoy y cuánta gente lo ha jugado, pero no quién ni con qué puntuación.
- **Fuera de alcance:**
  - rachas de días seguidos (se calculan después a partir de `DailyResult`, con los logros);
  - días anteriores;
  - el reto para invitados;
  - retos de otros minijuegos (el sorteo es solo entre los cuatro);
  - elegir el minijuego del día o jugar el de otro día;
  - dificultad creciente dentro del reto;
  - notificaciones.

## Qué se juega cada día

El minijuego del día sale del sorteo («Mismo contenido para todos», pieza 1). Su reto es la configuración por defecto
del motor (`engine.defaultConfig()`) con estas claves sustituidas, y siempre con todas las generaciones. Decisión del
usuario (2026-11-06): la tabla se mantiene tal cual y se aplica al minijuego que toque.

| Juego | Modo | Claves sustituidas | Rondas | Por qué |
|---|---|---|---|---|
| Pokédex Distance (`pokedex-distance`) | `POINTS` (Por puntos) | `mode: POINTS`, `pointsRounds: 5` | 5 objetivos | Es lo que propone §2.5 (cinco objetivos). Con Clásico, en solitario no se elimina a nadie y no tiene sentido. Por puntos premia la precisión en cada objetivo. |
| Higher or Lower (`higher-lower`) | `CLASSIC` | `mode: CLASSIC`, `rounds: 10` | 10 comparaciones | Es lo que propone §5.5. Con Racha infinita, un fallo temprano deja un resultado de una línea y la puntuación se compara peor. Con diez rondas fijas, todo el mundo juega lo mismo de principio a fin. |
| Shiny Quiz (`shiny-vote`) | `CLASSIC` | `mode: CLASSIC`, `rounds: 10`, `optionCount: 4` | 10 rondas | Es lo que propone §3.5 (diez rondas fijas, `✨✨❌…`). Por la misma razón que Higher or Lower, no se usa Supervivencia. |
| Learnset Guess (`learnset-guess`) | `MANUAL_REVEAL` (Revelación manual) | `mode: MANUAL_REVEAL`, `rounds: 3`, `roundSeconds: 90` | 3 Pokémon | Es el formato «-dle» de §7.5, sin prisa y con menos intentos, más puntos. Con tres Pokémon en vez de uno, la clasificación se desempata mejor y el reto dura unos 3 o 4 minutos. |

- Decisión tomada (revisable): se mantienen el resto de valores por defecto, como `roundSeconds` (20 s en los tres
  primeros), `selectionVisibility: HIDDEN`, `voteVisibility: REVEAL` y `answerVisibility: REVEAL`.
- Las configuraciones viven en Java (`application/daily/DailyGames`). Un test comprueba que cada una pasa el
  `parseConfig` de su motor.
- El orden de `DailyGames.all()` (`pokedex-distance`, `shiny-vote`, `higher-lower`, `learnset-guess`) **forma parte del
  contrato**: el sorteo indexa esa lista, así que reordenarla o añadir un juego cambia el minijuego de los días que
  todavía no tienen fila en `DailyChallenge`. Un test fija el orden. Añadir un juego al sorteo es un cambio de
  comportamiento y se decide aparte.

### Juego en solitario

`registry.json` exige 2 jugadores en Pokédex Distance y Learnset Guess, y sus motores lo comprueban en
`createInitialState`.

- El motor pasa a exigir **1 jugador en el modo del reto**: `POINTS` en Distance y `MANUAL_REVEAL` en Learnset. En
  los demás modos sigue exigiendo el `minPlayers` del manifiesto.
- `registry.json` **no cambia**: las salas normales siguen pidiendo 2 jugadores en el lobby
  (`RoomCoordinator.launchGame`). Solo el arranque del reto se salta esa comprobación de la sala.
- Hay una fixture dorada nueva por motor: `golden/pokedex-distance/solo-points.json` y
  `golden/learnset-guess/solo-manual-reveal.json`, con un jugador. Las fixtures que ya existen no cambian.
- Shiny Quiz y Higher or Lower ya admiten un jugador.

## Mismo contenido para todos

Tres piezas lo garantizan.

### 1. Semilla secreta por día: primero el juego, después el contenido

`seed = primeros 4 bytes (big-endian, sin signo) de HMAC-SHA256(pu.auth.secret, "daily|<AAAA-MM-DD>")`.

- **Primero sale el juego:** `DailyGames.all().get(seed % 4)`. Decisión del usuario (2026-11-06): sorteo entre los
  cuatro a partir de la semilla de la fecha, que puede repetir juego en días seguidos. Como `2^32` es múltiplo de 4,
  el reparto es exactamente uniforme sobre todas las semillas; día a día se comporta como un sorteo al azar.
- **Después, el contenido:** la misma semilla alimenta un `Mulberry32` (`domain/game/engine/infra`) **propio de cada partida del reto**. Es la única
  fuente de azar del motor durante toda esa partida: se pasa en `launchGame` y en cada `context(room)`.
- El azar global de la sala (`RandomSource`) sigue sirviendo para los códigos de sala y los ids.
- La semilla no se puede calcular solo con la fecha: sin el secreto del servidor nadie puede simular el motor por su
  cuenta y conocer el reto de antemano. El juego del día sí es público desde las 00:00, porque la tarjeta lo muestra.
- Decisión tomada (revisable): se reutiliza `pu.auth.secret` (`JWT_SECRET`), así que no hace falta otra variable de
  entorno. Si se cambia el secreto, cambia el juego y el contenido de los días que todavía no tienen fila en
  `DailyChallenge`. Un día que ya la tiene conserva su juego (pieza 2), aunque su contenido cambie para quien juegue
  después.

### 2. Catálogo fijado para el día

La sincronización de PokéAPI corre cada día a las 06:00 (`DATA_SYNC_HOUR`) y desde `f1a190d` recarga el catálogo de
las salas. Como el día empieza a las 00:00, cada día hay una recarga a mitad del reto. Con la misma semilla y otro
catálogo, el contenido sería otro.

- **Tabla `DailyChallenge`**, una fila por fecha. La primera partida del día guarda el minijuego sorteado (`gameId`),
  los ids de `pokemon.all()` del catálogo vigente en su orden (`nationalDexNumber`, `id`) y su huella, un SHA-256 de
  esos ids unidos por `\n`. Se inserta con `ON CONFLICT DO NOTHING` y después se lee la fila, así que todos los
  servidores y reinicios usan el mismo juego y la misma lista.
- **El juego guardado manda.** Si la fila del día existe, su `gameId` gana al del sorteo; si no existe todavía (nadie
  ha empezado hoy), `GET /api/daily` muestra el del sorteo sin escribir nada. Así un cambio de secreto o un despliegue
  a mitad de día no parte la clasificación del día en dos juegos. Decisión tomada (revisable).
- Cada partida del reto usa un **`PinnedPokemonCatalog`** (`domain/pokemon`): una vista del catálogo vigente limitada
  a esos ids y en ese orden.
  - `all()` y `forGenerations()` siguen el orden guardado.
  - `byId()` y `byDexNumber()` solo encuentran ids de la lista.
  - Los Pokémon que lleguen con la sincronización de ese día no entran en el reto hasta el día siguiente.
- **Si falta un id guardado**, porque la sincronización quitó un Pokémon, la vista lo omite y se registra un `WARN`
  con la lista de los que faltan. El contenido de ese día puede cambiar para quien juegue después. Decisión tomada
  (revisable): se acepta, porque PokéAPI casi nunca borra entradas y la alternativa sería guardar el catálogo
  entero.
- **Si cambian los datos de un Pokémon de la lista** (stats, sprite shiny o learnset), la selección se mantiene
  porque depende del orden, pero los valores que se ven son los nuevos. Es el comportamiento correcto: muestra los
  datos actualizados.
- Los catálogos de artworks y gritos (`visuals` y `audio`) son siempre los vigentes.

### 3. Determinismo del motor

Con la misma semilla y el mismo catálogo fijado, el contenido de cada ronda tiene que ser el mismo, juegue como juegue
la persona: rápido, lento, fallando o dejando que venza el tiempo. Los cuatro motores sacan el azar solo al preparar
una ronda:
- Distance: el objetivo.
- Higher or Lower: la categoría y el Pokémon.
- Shiny Quiz: el Pokémon, la posición de la opción correcta, las paletas y las falsas.
- Learnset Guess: el Pokémon.

Un test lo comprueba en los cuatro juegos (Review Focus 3).

## Anticopia

- **Un intento, en el servidor:**
  - índice único `(userId, date)` en `DailyResult` (Decisión del usuario (2026-11-06): un intento por cuenta y día);
  - la fila `STARTED` se inserta antes de generar el contenido;
  - dos `daily:start` simultáneos dan una fila y un error `"Daily challenge already played"`.
- **El contenido no se puede pedir antes de jugar:**
  - solo existe dentro de la partida y viaja en las proyecciones del motor, igual que en una sala normal;
  - `GET /api/daily` y la clasificación nunca devuelven objetivos, Pokémon ni categorías: solo puntos, aciertos y la
    lista de resultados por ronda de la propia cuenta;
  - el catálogo del buscador ya no lleva el número de Pokédex y sirve los sprites por un proxy (`/api/pokemon/selector`
    y `/api/pokemon/{id}/sprite`), así que Distance no se resuelve desde las herramientas del navegador.
- **La sala del reto es privada:**
  - `room:join` con su código responde `"Room not found"` a cualquier otra cuenta;
  - no se puede invitar a nadie a ella;
  - la cabecera no enseña el código.
- **Abandonar cuenta como jugado:**
  - si la sala desaparece antes de llegar a los resultados, la fila pasa a `ABANDONED`. Pasa al pulsar «Salir», al
    vencer la gracia de reconexión (`RECONNECT_GRACE_MS`, 30 s) o al reiniciarse el servidor;
  - una fila `STARTED` sin partida viva en memoria se trata como `ABANDONED` al leerla;
  - `ABANDONED` no entra en la clasificación.
- **Desconexión breve:** el motor sigue con sus tiempos. Al vencer la gracia de presencia (8 s), las rondas siguientes
  se cierran sin respuesta. Si la partida llega a sus resultados, la fila queda `FINISHED` con la puntuación que
  tenga y entra en la clasificación.
- **Límites conocidos.** Decisión tomada (revisable): se aceptan.
  - Con dos cuentas, una puede ver el reto y la otra jugarlo.
  - Las stats de Higher or Lower y los learnsets son datos públicos que se pueden consultar en una wiki mientras
    corre el tiempo.

## Ciclo de vida de una partida del reto

1. La web envía `daily:start {}` por el `/ws`, sin juego (el servidor sabe cuál toca hoy), con ack como los demás
   comandos.
2. `DailyChallengeService.start` comprueba, en este orden:
   - la cuenta es `USER` (si no, `"Registered account required"`);
   - la cuenta no está en una sala (`occupancyOf`; si lo está, `"Leave your current room first"`).
3. Calcula la fecha de hoy en Madrid y la semilla, sortea el juego y fija el día en `DailyChallenge` (juego y
   catálogo). Si la fila ya existía, usa su juego.
4. Inserta `DailyResult` `STARTED`. Si choca con el índice único: `"Daily challenge already played"`.
5. Llama a `RoomCoordinator.startDaily`, que crea la sala y arranca la partida al momento, sin lobby:
   - `maxPlayers` 1 y `sessionMode` `GameCount(1)`;
   - el juego del día y su configuración fija;
   - `daily` con la fecha, el juego y el id de la fila;
   - el catálogo fijado y el `Mulberry32` de la partida;
   - si falla (por ejemplo, el motor no está disponible), se borra la fila `STARTED` y se devuelve el error, para que
     la persona pueda reintentar.
6. Durante la partida, cada difusión de la sala pasa el estado público del motor a `DailyRunListener.observe`, que
   apunta el resultado de cada ronda cerrada (tabla de abajo). Solo trabaja en memoria y lo hace con el lock de la
   sala.
7. Al terminar la partida (`finishGame`):
   - primero se observa el estado final: `finishGame` corre dentro de `syncAndBroadcast` antes de la última
     difusión, así que, sin esa llamada, se perderían la última ronda y el `roundHistory` de Distance;
   - no se llama a `GameResultsPersister`, no se suma XP al miembro y no se audita;
   - `DailyRunListener.finished` calcula en el acto `daily.outcome`, con la puntuación, los aciertos y las rondas, y
     la vista de la sala lo publica;
   - en segundo plano, la fila pasa a `FINISHED`;
   - después de la escritura, la cuenta recibe `daily:recorded {date, gameId}` en todas sus conexiones (puerto
     `UserConnections` de amigos);
   - se avisa a `DailyResultEvents.finished` (puerto vacío por defecto, para los logros).
8. En `GAME_RESULTS`, la pantalla del reto sustituye a la de resultados del juego. «Volver a Jugar» hace `room:leave`,
   lo que cierra la sala, y lleva a `/play`.
9. Si la sala desaparece antes del paso 7, `DailyRunListener.abandoned` pasa la fila a `ABANDONED` en segundo plano.

Nada saca la sala de `GAME_RESULTS` sin un comando: `advanceSessionAfterGame` solo lo llaman `continueSession` y el
salto unánime, y los dos se rechazan en el reto. La sala se queda en `GAME_RESULTS` hasta que el jugador sale.

Una partida pertenece a la fecha en la que empezó: la que empieza a las 23:59 y acaba a las 00:03 cuenta para el día
anterior.

### Comandos que rechaza una sala del reto

Responden `"Not available in the daily challenge"`:
- `room:select-game`, `room:update-config`, `room:update-game-config`, `room:update-session` y
  `room:update-game-selection`;
- `room:vote-next-game`, `room:set-role`, `room:transfer-host`, `room:kick` y `room:set-ready`;
- `room:start-game`, `room:continue-session`, `room:return-lobby` y `room:end-session`;
- `game:skip-vote:set`.

Además:
- `gameSkipState` va siempre a `null` en estas salas;
- `room:join` de otra cuenta responde `"Room not found"`, pero el propio jugador sí puede volver a entrar para
  reconectarse;
- `room:invite` desde ella responde `"You are not in a room"`, porque `roomOf` no devuelve salas del reto.

Sí funcionan `game:action`, `room:leave`, `session:attach` y la reconexión.

### Resultado de cada ronda

Se guarda como una lista de enteros, `rounds`, que es lo único que hace falta para el texto de compartir.

| Juego | Cuándo se lee | Valor por ronda |
|---|---|---|
| Distance | `GAME_RESULTS`: `roundHistory` (registros con `tiebreakDepth == 0`) | la distancia (≥ 0) o `-1` sin elección |
| Higher or Lower | `ROUND_RESULTS` o `GAME_RESULTS` con `lastRound`; la clave es el `roundNumber` público | `1` acierto, `0` fallo, `-1` sin respuesta (`choice == null`) |
| Shiny Quiz | igual, con `lastRound.roundNumber` | `1` si está en `correctPlayerIds`, `0` si votó, `-1` si no votó |
| Learnset Guess | igual, con el `roundNumber` público | grupos que veía al acertar (`solves[p].revealStage + 1`) o `0` sin acertar |

Al terminar, las rondas que no se hayan observado se rellenan con `-1` (o con `0` en Learnset).

**Puntuación:** `points` de la clasificación del motor (`GameStanding.points`). Decisión tomada (revisable): es la
misma que la del modo del juego:
- Distance Por puntos: `max(0, 100 − distancia)`, y +50 si es exacta;
- Higher or Lower: incluye los bonus de racha y de rapidez;
- Shiny Quiz: puntos por acierto con su bonus de orden, que en solitario siempre es el máximo;
- Learnset Revelación manual: `max(1, grupos − N + 1) × 10`.

**Aciertos** (`correct`), para mostrar: los exactos en Distance, los `1` en Higher or Lower y en Shiny Quiz, y los
Pokémon acertados (valor ≥ 1) en Learnset.

## Datos (Flyway `V9__reto_diario.sql`)

`V8` queda para los logros (`V8__logros.sql`). **Si el reto diario se fusiona antes que los logros, esta migración se
renombra a `V8__reto_diario.sql` antes de fusionar, y los logros pasan a `V9`.** Flyway no admite migraciones fuera
de orden: un `V8` que llegue después de aplicar un `V9` se rechaza.

`DailyChallenge`:

| Columna | Tipo | Nota |
|---|---|---|
| `date` | date PK | Día de Madrid |
| `gameId` | text NOT NULL | Minijuego del día (`CHECK` con los cuatro ids); el sorteado al crear la fila |
| `pokemonIds` | jsonb NOT NULL | Lista ordenada de ids del catálogo fijado |
| `catalogFingerprint` | text NOT NULL | SHA-256 en hexadecimal |
| `createdAt` | timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP | |

`DailyResult`:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | UUID |
| `userId` | text NOT NULL | FK `"User"(id)` `ON DELETE CASCADE` |
| `date` | date NOT NULL | FK `"DailyChallenge"(date)` |
| `gameId` | text NOT NULL | `CHECK` con los cuatro ids. Copia del de `DailyChallenge`: se queda como columna para mostrarlo (perfil, logros, `DailyResultView`) sin cruzar tablas |
| `status` | text NOT NULL | `STARTED`, `FINISHED` o `ABANDONED` (`CHECK`) |
| `score` | integer NULL | Solo en `FINISHED` (`CHECK`) |
| `correct` | integer NULL | Solo en `FINISHED` |
| `rounds` | jsonb NULL | Lista de enteros; solo en `FINISHED` |
| `startedAt` | timestamp(3) NOT NULL | |
| `finishedAt` | timestamp(3) NULL | Al pasar a `FINISHED` o `ABANDONED` |

- Índice único `("userId", "date")`: un intento por cuenta y día (Decisión del usuario (2026-11-06)).
- Índice `("date", "status", "score" DESC, "finishedAt")` para la clasificación, que es una por día.
- Los cambios de estado solo valen desde `STARTED` (`UPDATE … WHERE "status" = 'STARTED'`): un resultado
  `FINISHED` nunca pasa a `ABANDONED`.

## Rutas REST (`/api/daily`, solo `USER`; un invitado recibe `401 "Registered account required"`)

| Ruta | Respuesta |
|---|---|
| `GET /api/daily` | `{date, resetsAt, gameId, name, icon, roundCount, players, status, result}` |
| `GET /api/daily/leaderboard` | `{date, gameId, total, entries: [{position, userId, username, avatar, score, correct, finishedAt}], me}` |

`GET /api/daily`:
- `date` va en `AAAA-MM-DD` y `resetsAt` es la próxima medianoche de Madrid en ISO.
- `gameId` es el minijuego de hoy: el de la fila de `DailyChallenge` si existe y, si no, el del sorteo.
- `name` e `icon` salen del manifiesto del registro: `PlayPage` no tiene sala de la que leer `availableGames`.
- `players` es cuántas cuentas han terminado hoy el reto.
- `status` es `AVAILABLE`, `IN_PROGRESS` (fila `STARTED` con la partida viva), `FINISHED` o `ABANDONED`.
- `result` es `{score, correct, roundCount, rounds, position, total}` o `null`.

`GET /api/daily/leaderboard`:
- Una sola clasificación por día (Decisión del usuario (2026-11-06)), así que la ruta no lleva juego. Solo da el día
  de hoy: las 50 primeras filas `FINISHED`. `gameId` es el juego de hoy, para el título.
- Ordena por `score` descendente y, a igual puntuación, por `finishedAt` ascendente. Las puntuaciones iguales
  comparten puesto (1, 1, 3).
- `me` es la fila propia, con `status` y `rounds`, aunque no esté entre las 50.
- Sin fila propia de hoy responde `403 "Play today's challenge first"`.

Además:
- `avatar` tiene la misma forma que en `UserResponse`.
- OpenAPI y `frontend/src/lib/api-types.ts` se regeneran.
- Vite y nginx ya envían `/api` a Java.

## Contratos compartidos (`packages/shared`)

- `room.ts`:
  - `RoomView.daily: DailyRoomInfo | null`, con `DailyRoomInfo = {gameId, date, roundCount, result: {score, correct,
    rounds} | null}`;
  - el comando `'daily:start'` sin campos (`{}`), con ack `{room}`;
  - el evento `'daily:recorded' {date, gameId}`.
- `daily.ts` (nuevo), con:
  - `DAILY_GAME_IDS`, en el mismo orden que `DailyGames.all()` (la web no sortea; el orden solo se comparte para que
    los dos lados digan lo mismo);
  - los textos del reto de cada juego: «5 objetivos · Por puntos», «10 comparaciones», «10 rondas · 4 candidatos» y
    «3 Pokémon · Revelación manual»;
  - `dailyShareText(input)`.

**Texto para compartir** (`dailyShareText`), con la fecha en `dd/mm/aaaa` y los números en `es-ES`:

```
Pokémon Universe · Reto diario 07/11/2026
🎯 Pokédex Distance · 612 pts
0·3·12·1·7
https://<origen>/play
```

| Juego | Segunda línea | Tercera línea |
|---|---|---|
| Distance | `🎯 Pokédex Distance · <score> pts` | las distancias unidas por `·`; `✖` sin elección |
| Higher or Lower | `📈 Higher or Lower · <correct>/10 · <score> pts` | `✅` acierto, `❌` fallo, `⌛` sin respuesta |
| Shiny Quiz | `✨ Shiny Quiz · <correct>/10 · <score> pts` | `✨` acierto, `❌` fallo, `⌛` sin respuesta |
| Learnset Guess | `📚 Learnset Guess · <correct>/3 · <score> pts` | por Pokémon, `⬛` × (N − 1) seguido de `🟩`; `🟥` sin acertar; los Pokémon separados por un espacio |

«Compartir» usa `navigator.share` si existe y, si no, copia al portapapeles. La región viva de la pantalla anuncia
«Resultado copiado».

## Interfaz

No hacen falta componentes nuevos en `frontend/src/ui/`: bastan `Panel`, `Row` (con `rank` y `self`), `Pill`,
`Chip`, `StateBox` y `Dialog`.

### En `PlayPage`

**Sin sala activa**, «Reto diario» es un tercer `Panel` crema junto a «Crear sala» y «Unirse con código»:
- En `lg`, los tres van en columnas con `Screen width="wide"`. Por debajo de `lg` se apilan.
- La cabecera lleva «Reto diario» y debajo «Nuevo reto en 5 h 12 min», que es la cuenta atrás hasta `resetsAt`.
- Hay **una sola `Row`**, la del minijuego de hoy (Decisión del usuario (2026-11-06)), con el antetítulo «Hoy toca»,
  el icono del manifiesto, el nombre, el texto del reto como meta y, a la derecha, según el estado:
  - `AVAILABLE`: `Pill` «Jugar» (≥ 44 px) y la meta «N han jugado hoy»;
  - `IN_PROGRESS`: «Volver al reto»;
  - `FINISHED`: `Chip` con «612 pts · 3.º de 40» y `Pill` «Ver resultado», que lleva a `/daily`;
  - `ABANDONED`: `Chip` «Abandonado» y «Ver clasificación».
- Para un invitado, el panel muestra un `StateBox` «El reto diario es para cuentas registradas» con un `PillLink`
  «Crear cuenta» hacia `/auth`.
- Al llegar a `resetsAt`, la web vuelve a pedir `GET /api/daily`.
- Los errores de «Jugar» se muestran en el panel, igual que los de «Crear sala» (un solo dueño).

**Con una sala del reto en curso**, la tarjeta de «Ya tienes una sala activa» cambia de textos:
- título «Tienes un reto diario en curso»;
- sin código;
- botones «Volver al reto» y «Abandonar el reto». Este último confirma con un `Dialog`: «Si sales ahora, el reto de
  hoy cuenta como jugado y no entrarás en la clasificación».

Si la sala del reto ya está en `GAME_RESULTS`, `PlayPage` la cierra sola (`room:leave` sin aviso) y muestra la
pantalla normal.

### En la sala

- **Durante la partida**, la pantalla del juego es la de siempre. La placa de la cabecera (`RoomPlate`) lleva el
  antetítulo «Reto diario», el nombre del juego y su modo, y no muestra el código. La confirmación de «Salir» usa el
  texto de «Abandonar el reto».
- **En `GAME_RESULTS`**, en lugar de `gameClient.Results`, `RoomPage` muestra `DailyResultsScreen`, que contiene:
  - el título «Reto diario · <juego>» y la fecha;
  - la puntuación grande, los aciertos sobre el total y la línea de emojis;
  - «Compartir»;
  - la clasificación (`DailyLeaderboard`, con `Row` y la fila propia marcada con `self`), que se pide al montar y otra
    vez con `daily:recorded`;
  - «Volver a Jugar».
- Mientras la propia fila no ha llegado, la clasificación muestra «Guardando tu resultado…».
- La región viva de la pantalla es única y siempre está montada.

### `/daily`

`DailyPage` muestra el resultado propio del reto de hoy, la clasificación del día y «Compartir», con los datos de
REST. Para un invitado redirige a `/play`, y si no has jugado el reto hoy, también.

### Errores

Se traducen en `roomCode.ts`:
- `"Registered account required"`: «El reto diario es solo para cuentas registradas.»
- `"Daily challenge already played"`: «Ya has jugado el reto de hoy.»
- `"Not available in the daily challenge"`: «No disponible en el reto diario.»

`"Leave your current room first"` ya tiene traducción. `"Unknown daily game"` desaparece: con un solo reto al día,
`daily:start` no lleva juego y la clasificación no tiene ruta por juego.

## Para los logros

Los logros no se evalúan en `GameResultsPersister` para estas partidas. El reto ofrece dos puntos de enganche:
- **Lectura:** `DailyResultsReader.finishedBy(String userId, int limit)` devuelve `DailyResultView(date, gameId,
  score, correct, rounds, finishedAt)` ordenados por fecha descendente.
- **Aviso:** `DailyResultEvents.finished(String userId, DailyResultView result)` se llama tras guardar `FINISHED`.
  Por defecto es un `@Secondary` vacío, y la pieza de logros lo implementará.

## Pruebas

- **Java:**
  - los motores en solitario (Distance `POINTS` y Learnset `MANUAL_REVEAL` con 1 jugador; Clásico sigue pidiendo 2),
    con dos fixtures doradas nuevas;
  - `DailyCalendar` (medianoche de Madrid, incluido el cambio de hora), `DailySeed` y `PinnedPokemonCatalog`;
  - el juego del día: es determinista por fecha (misma clave y fecha, mismo juego), cambia con la clave, y sobre
    4000 fechas seguidas con una clave fija cada juego sale entre el 20 % y el 30 % de los días (determinista, sin
    azar en el test; no se comprueba que no se repita);
  - el orden fijo de `DailyGames.all()`;
  - el determinismo de los cuatro juegos con secuencias de acciones distintas;
  - los extractores de rondas;
  - `RoomCoordinator.startDaily`, con cada comando rechazado, sin persistencia ni XP, y abandonar frente a terminar;
  - `DailyChallengeService` con Testcontainers:
    - intento único por día, también con dos arranques simultáneos;
    - el juego guardado en `DailyChallenge` gana al del sorteo;
    - compensación si falla el arranque;
    - recarga del catálogo entre dos partidas y reinicio, con el mismo contenido;
    - clasificación con empates;
    - `403` antes de jugar;
  - las rutas, el `401` y la migración (`FlywayMigrationsTest`, `SchemaBaselineTest`).
- **Vitest:** `dailyShareText` en los cuatro juegos, la tarjeta del reto (una fila con el juego de hoy) en sus cuatro
  estados y para un invitado,
  `DailyResultsScreen` y las traducciones.
- **Playwright** (`e2e/tests/reto-diario.spec.ts`):
  - El juego del día depende de la fecha y de la clave, así que el spec lo fija antes de empezar: escribe por `psql` la
    fila de hoy de `DailyChallenge` con `gameId` `higher-lower` (y la lista de ids del catálogo, como la calcularía el
    servidor). Como el juego guardado manda, el servidor juega ese.
  1. Una cuenta juega el reto hasta el final, ve su resultado y la clasificación, y copia el texto.
  2. Una segunda cuenta lo juega y ve las mismas comparaciones y dos filas.
  3. Una tercera cuenta empieza el reto y abandona; la tarjeta muestra «Abandonado» y no deja reintentar. (La
     primera ya gastó su intento del día.)
  4. Un invitado ve el panel bloqueado.
  - Capturas a 1280×720, 1920×1080 y 390×844, y nota de la rúbrica (≥ 19/24) para la tarjeta, la pantalla de
    resultados y `/daily`.
- **Regla del usuario:** nada de suites completas; solo los tests y specs de lo tocado.
