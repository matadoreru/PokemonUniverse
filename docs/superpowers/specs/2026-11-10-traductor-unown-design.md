# Traductor Unown — diseño

Fecha: 2026-11-10. Segundo juego de los tres pedidos el 2026-11-09 (Pokédex Absurda, Traductor Unown, ¿Quién soy?);
cada uno tiene su propia spec, plan e implementación.

## Idea

En cada ronda llega un mensaje escrito con glifos Unown: el nombre de un Pokémon o el de un movimiento. Al empezar la
partida, el servidor baraja qué glifo representa cada letra, así que saberse los Unown no sirve: hay que deducir. Cada
pocos segundos se revela una letra del mensaje para todos y pasa al alfabeto de la partida, que se mantiene en las
rondas siguientes. Es una carrera: quien descifra con menos letras a la vista gana más puntos.

## Reglas

- Jugadores: de 1 a 8. Los espectadores ven todo lo público, pero no adivinan.
- Id del juego: `unown-translator`. Nombre: «Traductor Unown».
- Configuración (`unownTranslatorConfigSchema`, `.strict()`):

  | Clave | Valores | Por defecto |
  |---|---|---|
  | `generations` | `pokemonGenerationsSchema` | todas |
  | `rounds` | entero 1–10 | 5 |
  | `roundSeconds` | entero 30–120 | 60 |
  | `hintSeconds` | entero 3–15 | 6 |
  | `mode` | `CLASSIC` (se muestra «Pokémon») \| `MOVES` (`.default('CLASSIC')`) | `CLASSIC` |

### Clave y mensajes

- **Clave:** al empezar la partida, el servidor baraja con `context.random()` una biyección entre las 26 letras A–Z y
  los 26 glifos Unown (índices 0–25, que identifican el dibujo, no la letra). La clave es secreta y dura toda la
  partida.
- **Normalización** del texto de un mensaje: mayúsculas, sin tildes ni diéresis, y la Ñ pasa a N. Las letras A–Z van
  cifradas. El resto de caracteres (espacio, guion, apóstrofo, punto, dígitos, ♀, ♂) se muestran tal cual.
- **Mazo:**
  - `CLASSIC` (Pokémon): nombres en español de las formas por defecto de las generaciones elegidas
    (`forGenerations(generations, false)`);
  - `MOVES`: nombres en español, sin repetir, de los movimientos que aprenden por nivel esos Pokémon (con
    `LearnsetPokemonCatalog.levelUpMoves` y la generación de referencia `Math.max(generations)`, como Learnset Guess).
    Se calcula al empezar la partida, nunca al comprobar disponibilidad;
  - solo mensajes con al menos 3 letras A–Z tras normalizar; no se repiten mensajes en la partida.
- **Disponibilidad:**
  - `CLASSIC` (Pokémon): hace falta al menos `rounds` Pokémon en el mazo; si no, «Solo hay N Pokémon en esas generaciones.»;
  - `MOVES`: el catálogo debe ser `LearnsetPokemonCatalog` y haber algún Pokémon en esas generaciones; si no, «No hay
    movimientos disponibles en esas generaciones.». Si al empezar hay menos movimientos que `rounds`, `totalRounds`
    es el número de movimientos.

### Ronda

1. **`DECODING`.** Se publica el mensaje como piezas (ver Contrato). Las letras del alfabeto descubierto en rondas
   anteriores salen ya traducidas.
   - **Pistas:** cada `hintSeconds`, contados desde el inicio de la ronda, se revela una letra elegida al azar entre las
     letras distintas del mensaje que siguen ocultas. Pasa al alfabeto de la partida para todos. Cuando no queda ninguna
     oculta, no hay más pistas (`nextHintAt` nulo).
   - **Adivinar:** `GUESS_UNOWN { text }`. Se compara la respuesta normalizada con el mensaje normalizado, ignorando
     además todo lo que no sea A–Z o dígito. Los intentos son ilimitados, pero un fallo bloquea 3 s
     (`Timing.setPlayerCooldown`); un intento durante el bloqueo se rechaza con `Timing.cooldownMessage`.
   - Quien acierta ya no puede adivinar: se rechaza con «Ya lo has descifrado.».
   - La fase termina cuando han acertado todos los jugadores o se agota `roundSeconds`.
2. **Resultados de ronda**, con el ciclo temporizado habitual (`Timing.advanceTimedRound`), y después la ronda
   siguiente o el final.

- Solo pasan al alfabeto las letras reveladas como pista. Las demás letras del mensaje no se añaden, aunque alguien
  acierte o termine la ronda.

### Puntos

- Al acertar: 1 punto más 1 por cada posición del mensaje con una letra A–Z que siguiera oculta en ese momento. Si ya
  se veía todo, vale 1.
- Clasificación final: puntos; después, mensajes descifrados; después, id del jugador.

## Privacidad

- La clave completa y el texto del mensaje no salen del servidor hasta los resultados de la ronda.
- El estado público solo lleva los glifos, las letras reveladas (`alphabet`) y quién ha acertado y con cuántos puntos.
  Nunca lleva lo que ha escrito nadie, ni los intentos fallidos.
- La respuesta solo aparece en la proyección de quien ya la acertó.
- El índice de glifo identifica el dibujo. Como la clave está barajada, no delata la letra.

## Contrato compartido (`packages/shared/src/games/unown-translator/`)

- `config.ts`: el esquema, `defaultUnownTranslatorConfig` y `UNOWN_TRANSLATOR_MODES = ['CLASSIC', 'MOVES']`. Se
  registra en `games/modes.ts` con las etiquetas «Pokémon» y «Movimientos».
- `types.ts`:
  - Acción (`.strict()`): `GUESS_UNOWN { text: trim 1–40 }`.
  - Pieza del mensaje (`UnownToken`), una de:
    - `{ kind: 'GLYPH', glyph: 0–25 }`, letra oculta;
    - `{ kind: 'LETTER', glyph: 0–25, letter: 'A'–'Z' }`, letra descubierta;
    - `{ kind: 'LITERAL', text }`, carácter sin cifrar.
  - Estado público:
    - `gameId`, `phase`, `roundNumber`, `totalRounds` y `mode`;
    - `tokens`;
    - `alphabet`, una lista `{ glyph, letter }[]` con las letras descubiertas, en orden de descubrimiento;
    - `solvedPlayerIds` y `roundPointsByPlayer` de la ronda en curso;
    - `scores`, `roundEndsAt`, `nextHintAt` y `nextTransitionAt`;
    - `lastRound` y `results`.
  - Estado por jugador: `role`, `canGuess`, `solved`, `answer` (solo si acertó) y `cooldownUntil`.
  - `lastRound`:
    - `answer` (el texto original, con tildes);
    - en `CLASSIC` (Pokémon), `pokemon` (id, nombre, sprite, número y tipos); en `MOVES`, `move` (nombre, tipo y categoría);
    - `solves`, una lista `{ playerId, points, hiddenLetters }[]` en orden de acierto;
    - `missingPlayerIds`.
- Se exporta en `public.ts`.

## Motor Java (`domain/game/engines/unowntranslator/`)

- `UnownTranslatorConfig`, `UnownTranslatorMode`, `UnownTranslatorTypes`, `UnownTranslatorRules` y
  `UnownTranslatorEngine`, con las convenciones de `engines/README.md` (builder, inmutabilidad, orden de claves, PRNG
  y errores literales).
- `UnownTranslatorRules` tiene funciones puras para:
  - normalizar el texto;
  - comparar respuestas;
  - convertir el mensaje en piezas a partir de la clave y el alfabeto;
  - contar las letras ocultas;
  - calcular los puntos;
  - montar el mazo de cada modo.
- Referencias:
  - Zoomed Pokémon (`zoomedpokemon/`) para los avances por tiempo dentro de la ronda, el bloqueo tras fallo y los
    aciertos en carrera;
  - Learnset Guess para `levelUpMoves` y la generación de referencia.
- Estadísticas de perfil:
  - `roundsPlayed`, `solved`, `missed`, `firstSolves`, `hiddenLettersAtSolve` (suma) y `pointsFromRounds`;
  - derivada: `solveRate` (`solved` / (`solved` + `missed`)).
- Registro:
  - entrada en `backend/src/main/resources/games/registry.json`;
  - `portedEngines` en `ClasspathGameRegistryLoader`;
  - los modos en `GameModes.java`;
  - fixtures doradas en `src/test/resources/golden/unown-translator/`;
  - las cuentas de juegos y logros que pasan de 29 a 30 en los tests que las comprueban.

## Frontend

- **Componente nuevo `UnownGlyph`** en `frontend/src/ui/`:
  - los 26 diseños Unown como SVG en línea, con ojo y trazos y sin imágenes externas;
  - props `glyph` (0–25) y `size`; usa `currentColor`, para que sirva en los dos temas;
  - entra en la galería `/dev/ui` antes de que lo use la pantalla.
- **`frontend/src/room/UnownTranslatorGame.tsx`**, registrado en `games/registry.ts` y `game-icons.ts`, y en las
  listas que enumeran juegos (`game-skip-slot.ts` si aplica):
  - el mensaje en glifos grandes, con la letra debajo de cada glifo descubierto; las palabras no se parten entre
    líneas;
  - el campo de respuesta y Enviar, con la espera visible tras un fallo; quien ya acertó ve su respuesta y «¡Descifrado!»;
  - la cuenta atrás de la ronda y de la siguiente pista;
  - la leyenda con los 26 glifos y, debajo, la letra de los ya descubiertos;
  - quién ha acertado y con cuántos puntos.
- **`UnownTranslatorResults.tsx`**: la respuesta descifrada, con sprite o tipo del movimiento, y quién acertó, en
  orden.
- Solo componentes de `frontend/src/ui/`.
- Una región `aria-live` siempre montada, que anuncia cada pista («Nueva letra: P») y el propio acierto. Los errores van
  al aviso de la sala (`ignoreFailure`).
- Texto ≥13 px y botones ≥44 px. Animaciones solo con transform u opacity, respetando `prefers-reduced-motion`. Cada
  glifo lleva una etiqueta accesible: «glifo oculto» o su letra.

## Pruebas (solo de lo tocado)

- **Java:**
  - `UnownTranslatorRulesTest`:
    - normalización: tildes, Ñ, ♀ y ♂, guiones y espacios;
    - comparación de respuestas;
    - piezas;
    - letras ocultas y puntos;
    - mazos de los dos modos.
  - `UnownTranslatorEngineTest`:
    - pistas a su hora y su fin cuando no quedan letras;
    - el alfabeto se mantiene entre rondas y solo con pistas;
    - el bloqueo tras fallo;
    - acierto y rechazo de un segundo intento;
    - fin de ronda por tiempo y porque aciertan todos;
    - clasificación;
    - disponibilidad;
    - privacidad: ni la respuesta ni la clave salen antes de los resultados, y la respuesta solo va a quien acertó.
  - Fixtures doradas nuevas y `verifyOpenApi` si cambia algo del contrato.
- **Shared:** `config-cases.test.ts` (con su `config-cases.json`), `registry-defaults.test.ts` y `modes.test.ts`.
- **Frontend:**
  - `UnownGlyph`: los 26 índices se dibujan, y uno fuera de rango no;
  - `UnownTranslatorGame.test.tsx`: adivinar, la espera tras un fallo, el estado de descifrado y los resultados de los
    dos modos.
- **e2e:** el caso del juego en `e2e/tests/juegos.spec.ts`, con `npm run ui:check -- juegos` a 1280×720, 1920×1080 y
  390×844, y la nota de la rúbrica de `docs/visual-review.md` (mínimo 19/24) en el commit.

## Fuera de alcance

- El reto diario de este juego.
- Mensajes que sean frases libres, o glifos para «!» y «?».
- Pedir pistas a cambio de puntos o alfabetos por jugador.
