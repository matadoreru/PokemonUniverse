# ¿Quién soy? — diseño

Fecha: 2026-11-11. Tercer juego de los tres pedidos el 2026-11-09 (Pokédex Absurda, Traductor Unown, ¿Quién soy?);
cada uno tiene su propia spec, plan e implementación.

## Idea

Cada jugador recibe un Pokémon que ven todos menos él. Por turnos, escribe preguntas de sí o no sobre su Pokémon
(«¿Soy de tipo fuego?») y los demás responden con botones. Con las pistas que acumula intenta adivinar quién es. Cuantas
menos preguntas necesite, más puntos. Se diferencia de Quién es Quién en que no hay equipos ni tablero: cada uno tiene
su propio misterio, y las preguntas y respuestas van dentro de la app, sin llamada de voz.

## Reglas

- Jugadores: de 2 a 8. Los espectadores lo ven todo, incluidos los Pokémon de todos, pero no preguntan ni responden.
- Id del juego: `who-am-i`. Nombre: «¿Quién soy?».
- Configuración (`whoAmIConfigSchema`, `.strict()`):

  | Clave | Valores | Por defecto |
  |---|---|---|
  | `generations` | `pokemonGenerationsSchema` | todas |
  | `maxLaps` | entero 3–20 | 10 |
  | `askSeconds` | entero 20–90 | 45 |
  | `answerSeconds` | entero 10–60 | 20 |

  Sin modos.

### Reparto

- Al empezar, cada jugador recibe un Pokémon distinto, elegido al azar con `context.random()` entre las formas por
  defecto de las generaciones elegidas (`forGenerations(generations, false)`).
- Disponibilidad: hacen falta al menos tantos Pokémon como jugadores; si no, «Solo hay N Pokémon en esas
  generaciones.».

### Turnos

- El orden de turnos es el de `playerIds`. Se salta a quien ya ha acertado y a quien no es necesario
  (`context.isPlayerRequired` falso, por ejemplo desconectado).
- Una **vuelta** termina cuando todos los jugadores que podían jugar han tenido su turno. La partida acaba al terminar
  la vuelta `maxLaps`, cuando han acertado todos o cuando no queda nadie que pueda jugar un turno.
- Cada turno tiene tres pasos (`turnStep`):
  1. **`ASKING`** (`askSeconds`). El jugador del turno:
     - escribe una pregunta, `ASK_QUESTION { text }`, de 1 a 120 caracteres tras recortar espacios, y se pasa a
       `ANSWERING`; o
     - intenta adivinar directamente, `GUESS_SELF { pokemonId }`.
     - Si se agota el tiempo, pierde el turno.
  2. **`ANSWERING`** (`answerSeconds`). Responden todos los demás jugadores necesarios, incluidos los que ya acertaron,
     con `ANSWER_QUESTION { answer }`, donde `answer` es `YES`, `NO`, `PARTLY` o `UNKNOWN` (Sí, No, A medias, No lo sé).
     - Cada respuesta es definitiva.
     - El paso termina cuando han respondido todos o se agota el tiempo. Quien no respondió queda sin respuesta.
     - Se ve la respuesta de cada uno con su nombre; no se calcula la mayoría.
  3. **`DECIDING`** (20 s fijos, `DECIDE_MS`). El jugador del turno intenta adivinar una vez (`GUESS_SELF`) o pasa
     (`PASS_TURN`). Si se agota el tiempo, pasa.
- **Adivinar:**
  - El `pokemonId` tiene que estar entre las formas por defecto de las generaciones elegidas; si no, se rechaza.
  - El Pokémon de otro jugador se rechaza («Ese Pokémon lo tiene otro jugador.»): no entra en el historial, no cuenta
    como fallo y el turno sigue. Si entrara como fallo, su dueño lo vería en el historial público; quien adivina ya ve
    esa carta, así que el rechazo no le revela nada. El buscador de la web los bloquea junto a los ya probados.
  - **Acierto:** el jugador queda resuelto, suma puntos y ya no tiene más turnos, pero sigue respondiendo a los
    demás. El turno pasa al siguiente.
  - **Fallo:** el intento se añade a su historial público («probó con Charmander») y el turno pasa al siguiente.
- `PASS_TURN` solo vale en `DECIDING`.

### Puntos

- Al acertar: `max(2, 10 − preguntas hechas)`, más +3 al primero en acertar, +2 al segundo y +1 al tercero.
- Las preguntas hechas son las que ese jugador escribió en toda la partida.
- Quien no acierta suma 0.
- Clasificación final: puntos; después, menos preguntas hechas; después, id del jugador.

## Privacidad

- El estado público **no lleva ningún Pokémon asignado** hasta `GAME_RESULTS`.
- La proyección de cada jugador lleva los Pokémon de los demás (`others`), nunca el suyo. Solo cuando acierta recibe
  el suyo (`self`).
- Los espectadores reciben en su proyección los Pokémon de todos.
- El buscador de adivinar trabaja sobre el conjunto de las generaciones elegidas; no recibe ninguna pista del Pokémon
  propio.
- Las preguntas, las respuestas con su autor y los intentos fallidos son públicos.

## Contrato compartido (`packages/shared/src/games/who-am-i/`)

- `config.ts`: el esquema y `defaultWhoAmIConfig`.
- `types.ts`:
  - Acciones (`.strict()`):
    - `ASK_QUESTION { text: trim 1–120 }`;
    - `ANSWER_QUESTION { answer }`;
    - `GUESS_SELF { pokemonId }`;
    - `PASS_TURN {}`.
  - `WhoAmIPokemon { id, name, sprite, nationalDexNumber, types }`.
  - Entrada de historial (`WhoAmIHistoryEntry`), una de:
    - `{ kind: 'QUESTION', text, answers: { playerId, answer }[] }`;
    - `{ kind: 'GUESS', pokemon: WhoAmIPokemon }`, solo para los fallos.
  - Estado público:
    - `gameId`, `phase`, `lap` y `maxLaps`;
    - `playerIds`, `turnPlayerId` y `turnStep`;
    - `currentQuestion`, con el texto, las respuestas recibidas y `answeredPlayerIds`; nulo fuera de `ANSWERING` y
      `DECIDING`;
    - `history`, de jugador a lista de entradas;
    - `solvedPlayerIds` en orden de acierto y `questionsAsked` por jugador;
    - `scores`, `turnEndsAt` y `results`.
  - Estado por jugador: `role`, `others` (de jugador a `WhoAmIPokemon`), `self` (nulo hasta acertar), `canAsk`,
    `canAnswer`, `canGuess`, `canPass` y `ownAnswer`.
  - `results`: por jugador, su Pokémon, si acertó, sus preguntas hechas, sus puntos y su posición.
- Se exporta en `public.ts`.

## Motor Java (`domain/game/engines/whoami/`)

- `WhoAmIConfig`, `WhoAmITypes`, `WhoAmIRules` y `WhoAmIEngine`, con las convenciones de `engines/README.md`.
- Fases: `GAME_STARTING`, `TURN_ACTIVE` (con `turnStep` en el estado) y `GAME_RESULTS`.
- Temporizador con `TimedLifecycle` y `turnEndsAt`, como Quién es Quién. Al vencer:
  - en `ASKING` se pierde el turno;
  - en `ANSWERING` se pasa a `DECIDING`;
  - en `DECIDING` se pasa.
- Si en `ANSWERING` un cambio de presencia deja respondidos a todos los que faltaban, el paso se cierra.
- Si se desconecta el jugador del turno, el turno pasa.
- `WhoAmIRules`, todo puro:
  - el reparto sin repetir;
  - los puntos;
  - el siguiente jugador y el cambio de vuelta;
  - el fin de partida;
  - la clasificación.
- Estadísticas de perfil:
  - `gamesPlayed`, `solved`, `questionsAsked`, `wrongGuesses`, `firstSolves` y `pointsFromRounds`;
  - derivada: `solveRate` (`solved` / `gamesPlayed`).
- Registro:
  - `registry.json`;
  - `portedEngines`;
  - fixtures doradas en `src/test/resources/golden/who-am-i/`;
  - las cuentas de juegos y logros que pasan de 30 a 31 y de 50 a 51 en los tests que las comprueban.

## Frontend

- `frontend/src/room/WhoAmIGame.tsx`, registrado en `games/registry.ts`, `game-icons.ts` y `game-skip-slot.ts`:
  - arriba, las cartas de los jugadores: la de cada uno de los demás con su Pokémon, y la tuya con «?» (o con tu
    Pokémon si ya acertaste);
  - en el centro, el turno:
    - si es tu turno en `ASKING`, el campo de pregunta (contador de 120) y «Adivinar»;
    - si te toca responder, la pregunta y los cuatro botones;
    - si es tu turno en `DECIDING`, las respuestas recibidas, «Adivinar» y «Pasar»;
    - si no, la pregunta en curso y quién ha respondido;
  - tu historial de pistas, siempre visible, y el de los demás al tocar su carta;
  - el buscador `PokemonSelector` para adivinar, sobre el conjunto de las generaciones elegidas.
- `WhoAmIResults.tsx`: todos los Pokémon revelados, con cuántas preguntas necesitó cada uno, si acertó y sus puntos.
- Solo componentes de `frontend/src/ui/`. Si hace falta algo nuevo (por ejemplo, la carta de jugador con Pokémon u
  oculta), primero entra en `/dev/ui`.
- Una región `aria-live` siempre montada, que anuncia cada turno, cada pregunta nueva y cada acierto. Los errores van
  al aviso de la sala (`ignoreFailure`).
- Texto ≥13 px y botones ≥44 px.

## Pruebas (solo de lo tocado)

- **Java:**
  - `WhoAmIRulesTest`: el reparto sin repetir, los puntos con su mínimo y los extras por orden, el siguiente jugador
    saltando a los resueltos y a los no necesarios, el fin de partida y la clasificación.
  - `WhoAmIEngineTest`:
    - los tres pasos del turno y sus tiempos agotados;
    - una pregunta vacía o larga, responder la propia pregunta, responder dos veces y actuar fuera de turno;
    - el fallo que acaba el turno y queda en el historial;
    - el acierto, que deja de dar turnos pero sigue respondiendo;
    - la desconexión del jugador del turno y de quien falta por responder;
    - el fin por aciertos y por vueltas;
    - privacidad: el JSON público no contiene ningún id asignado antes de `GAME_RESULTS`, y la proyección de un
      jugador no contiene el suyo hasta acertar.
  - Fixtures doradas nuevas.
- **Shared:** `config-cases.test.ts` (con su `config-cases.json`) y `registry-defaults.test.ts`.
- **Frontend:** `WhoAmIGame.test.tsx` para preguntar, responder, decidir, la carta propia oculta y los resultados.
- **e2e:** el caso del juego en `e2e/tests/juegos.spec.ts` con 3 jugadores, con `npm run ui:check -- juegos` a
  1280×720, 1920×1080 y 390×844, y la nota de la rúbrica de `docs/visual-review.md` (mínimo 19/24) en el commit.

## Fuera de alcance

- Moderar el texto de las preguntas, más allá del límite de longitud.
- Modos de juego y reto diario.
- Calcular la mayoría de las respuestas o detectar respuestas falsas.
