# Pequeños ajustes: impostores que se conocen, pistas sin el nombre del Pokémon y aviso de selección vacía

Fecha: 2026-11-07. Estado: decidido por el usuario, pendiente de revisión escrita.

## Objetivo

Tres cambios pequeños e independientes:

1. **Pokémon Impostor.** Si hay más de un impostor, cada uno sabe quiénes son los demás desde el reparto de roles.
2. **Lobby, pestaña «Modo y sesión».** Con la selección de minijuegos vacía, el aviso deja de decir «Con un solo
   minijuego compatible, se juega siempre ese.» y dice «Elige al menos un minijuego.».
3. **Pokémon Impostor: una pista no puede contener el nombre del Pokémon secreto.** Decisión del usuario
   (2026-11-06). El servidor la rechaza con «No puedes decir el nombre del Pokémon.» y el campo de la pista hace la
   misma comprobación antes de enviar.

**Criterio de éxito:**
- En una partida de 5 jugadores con 2 impostores, cada impostor ve el nombre del otro en su tarjeta de rol, y ningún
  inocente ve nada nuevo.
- Al quitar el único minijuego elegido, «Modo y sesión» dice «Elige al menos un minijuego.».
- Un inocente cuyo Pokémon secreto es Pikachu escribe «pikachuuu» o «PIKACHÚ»: el campo muestra «No puedes decir el
  nombre del Pokémon.», el botón «Enviar pista» se desactiva y, si la pista llega al servidor, este la rechaza con el
  mismo texto. Pasa igual en `CLASSIC` y en `ONE_WORD`.

## 1. Pokémon Impostor: los impostores se conocen

### Decisiones tomadas

- **Solo los impostores reciben la lista.** Un inocente, un espectador o un identificador ajeno no reciben nada nuevo:
  ni la clave en el JSON, ni una lista vacía.
- **La lista está fijada desde el reparto.** Es la de los demás impostores, en el orden de `state.playerIds()`, y no
  cambia durante la partida. Un compañero expulsado sigue en la lista; la web lo marca como fuera.
- **Decisión tomada (revisable): un impostor expulsado sigue viendo la lista.** Ya ve todos los roles
  (`revealedRoles`), así que no revela nada nuevo.
- **Con un solo impostor la clave no aparece**, en lugar de ir como `[]`. Así la proyección de las partidas con un
  impostor queda idéntica byte a byte y sus fixtures doradas no cambian.
- **Funciona igual en los dos modos.** La rama `modos` añade `ONE_WORD`, y `getPlayerState` no distingue entre modos:
  el reparto de roles es el mismo en `CLASSIC` y en `ONE_WORD`. El test unitario se parametriza con los dos modos para
  fijarlo.

### Contrato

En `PokemonImpostorPlayerState`, una clave opcional nueva justo después de `revealedRoles`:

| Clave | Tipo TS | Java | Cuándo |
|---|---|---|---|
| `fellowImpostorIds` | `fellowImpostorIds?: string[]` | `@JsonInclude(NON_NULL) @Nullable List<String>` | Solo si `role === 'IMPOSTOR'` y hay al menos otro impostor. |

- Es una proyección por jugador. La proyección pública no cambia.
- La clave es opcional en TS (`?:`) y se marca `NON_NULL` campo a campo, como pide
  `backend/src/main/java/es/pokemonuniverse/domain/game/engines/README.md` («Proyecciones»).

### Pantalla (`frontend/src/games/pokemon-impostor/ImpostorParts.tsx`)

Los nombres salen de `people.nameOf(id)`, como en el resto de la pantalla. Con un nombre, el texto es «Otro impostor:
Ana»; con varios, «Otros impostores: Ana y Bea» o «Ana, Bea y Carla». Un compañero expulsado lleva « (fuera)».

- **`ImpostorRoleReveal`** (fase `ROLE_REVEAL`): una línea bajo «No conoces el Pokémon. Intenta disimular.».
- **`ImpostorRolePanel`** (columna lateral): la misma línea bajo el Pokémon secreto.
- **`ImpostorRoleStrip`** (línea del móvil). Decisión tomada (revisable): con aliados, la nota «no conoces el
  Pokémon» pasa a «con Ana y Bea». Ya se dijo en el reparto, y no caben las dos cosas. La
  línea se recorta con puntos suspensivos y lleva el texto completo en `title`, para que un nombre largo no rompa el
  encaje a 390 px.
- **Región viva:** en `ROLE_REVEAL`, el anuncio pasa de «Reparto de roles: eres impostor.» a «Reparto de roles: eres
  impostor, con Ana.» (o «con Ana y Bea»). Sigue habiendo una sola región viva.
- No hace falta ningún componente nuevo de `frontend/src/ui/`, solo texto con las clases existentes de
  `PokemonImpostor.module.css`.

### Fixtures doradas

- Solo `golden/pokemon-impostor/guess-and-presence.json` tiene `impostorCount: 2`. Al regrabarla, cambia **solo**
  `playerStates` de sus dos impostores, con la clave nueva. Es el cambio esperado. Ni `publicState` ni `lifecycle`
  cambian.
- Las otras cinco fixtures tienen un impostor y no cambian.
- Si al aplicar este cambio ya existe `golden/pokemon-impostor/one-word-mode.json` (Task 7 del plan de modos) y
  tiene más de un impostor, también cambia, y solo en `playerStates`.

## 2. Aviso de la pestaña «Modo y sesión» con la selección vacía

Hoy `gameOrderHint(type, compatibleCount)` (`frontend/src/room/GameSelectionConfig.tsx:52`) devuelve «Con un solo
minijuego compatible, se juega siempre ese.» con `compatibleCount <= 1`. El valor 0 cubre dos casos distintos, porque
el lobby pasa `compatibleGameIds.length` (`Lobby.tsx:222`):

- la selección está vacía;
- hay juegos elegidos, pero ninguno admite el número actual de jugadores.

### Decisiones tomadas

- `gameOrderHint` recibe un tercer parámetro, `selectedCount`, que `GameOrderChoice` saca de `mode.gameIds.length`.
  No hay que cambiar ninguna llamada a `GameOrderChoice`.
- Decisión tomada (revisable): un tercer parámetro en vez de cambiar el significado de `compatibleCount`.
- Con `selectedCount === 0`: «Elige al menos un minijuego.».
- **Decisión tomada (revisable):** con `selectedCount > 0` y `compatibleCount === 0`: «Ninguno de los minijuegos
  elegidos admite a los jugadores de ahora.». Hoy ese caso también dice, por error, «Con un solo minijuego…». El
  botón de empezar ya da el motivo exacto («Ningún minijuego elegido admite el número actual de jugadores.»), así que
  este aviso solo describe el modo, sin repetir esa frase.
- Con `compatibleCount === 1` sigue «Con un solo minijuego compatible, se juega siempre ese.». El resto de casos no
  cambia.
- `RotationPreview.tsx` usa `GameOrderChoice` con `compatibleCount={3}` y una sala de prueba cuyo `gameIds` no está
  vacío (`games.map((game) => game.id)`). No hay que tocarlo.

## 3. Pokémon Impostor: una pista no puede contener el nombre del Pokémon

Decisión del usuario (2026-11-06): una pista que contiene el nombre del Pokémon secreto se rechaza con «No puedes
decir el nombre del Pokémon.».

### Dónde está hoy

- **Servidor:** `PokemonImpostorEngine.submitClue`
  (`backend/src/main/java/es/pokemonuniverse/domain/game/engines/pokemonimpostor/PokemonImpostorEngine.java`) recorta
  y normaliza la pista con `normalizedClue` (`trim` + NFC) y la rechaza, por este orden, si está vacía («Escribe una
  pista.»), si en `ONE_WORD` tiene espacios («La pista debe ser una sola palabra.», regla de la rama `modos`) o si
  pasa de 25 caracteres. Un rechazo devuelve el estado sin cambios: no gasta el turno y se puede reintentar.
- **Cliente:** `validateImpostorClue(text, mode)` (`frontend/src/games/pokemon-impostor/validation.ts`) repite la regla
  de `ONE_WORD`, y `PokemonImpostorGame.tsx:48` pasa su resultado como `error` del campo de la pista y desactiva
  «Enviar pista».

### Regla

- **Normalización**, idéntica en Java y en TS: descomponer en NFD, quitar las marcas combinantes (`\p{M}`), pasar a
  minúsculas (`Locale.ROOT` / `toLowerCase()`) y **quedarse solo con las letras** (`\p{L}`): se quitan espacios,
  signos, dígitos y símbolos.
  - Ejemplos: «PIKACHÚ» → `pikachu`; «Mr. Mime» → `mrmime`; «Nidoran♀» → `nidoran`; «Porygon2» → `porygon`.
- **Comprobación:** la pista normalizada **contiene como subcadena** algún nombre normalizado. Decisión tomada
  (revisable): subcadena sobre solo letras, no palabra entera, así que «pikachuuu», «superpikachu» y «pi-ka-chu»
  quedan bloqueadas.
  - Se descartan los nombres que quedan vacíos al normalizar: `"x".contains("")` es verdadero y bloquearía todas las
    pistas.
  - **Falsos positivos conocidos, aceptados** (Decisión tomada (revisable)): un nombre corto bloquea palabras
    normales que lo contienen, como Abra en «cabra» o «palabra», Natu en «natural» o Mew en «homework». La regla
    es simple y predecible, y el jugador reformula. Un test lo fija con Abra y «cabra».
- **Nombres que cuentan en el servidor:** `Pokemon.name` (el nombre que se muestra en la partida) y, de
  `Pokemon.names`, los valores `es` y `en` que sean texto. El catálogo trae esas dos claves (comprobado en
  `golden/catalog/gen1-2.json`: 293 Pokémon, todos con `names.es` y `names.en`). En español los nombres de Pokémon
  coinciden con los ingleses, pero `name` difiere de `names` en las formas regionales («Raichu de Alola» frente a
  «Raichu») y en Nidoran («Nidoran F» frente a «Nidoran♀»). Sin `names`, «raichu» pasaría para Raichu de Alola.
- **Orden de los rechazos** en `submitClue`, el mismo en el cliente: vacía → una sola palabra (`ONE_WORD`) → más de 25
  caracteres → nombre del Pokémon.
- **Funciona igual en los dos modos.** En `ONE_WORD` la pista ya es una palabra, y la regla del nombre se aplica
  después de la de espacios.

### Quién la recibe: solo los inocentes

Decisión tomada (revisable), que se aparta de «se aplica a todos»: **la comprobación solo se hace con las pistas de
los jugadores que conocen el Pokémon**, es decir, los inocentes vivos (los expulsados y los espectadores ya no dan
pistas).

- Si se aplicara también al impostor, el rechazo sería un oráculo: como no gasta el turno, el impostor podría escribir
  nombres de candidatos como pista hasta que uno se rechazara, y después adivinar el Pokémon con `GUESS_POKEMON` y
  ganar.
- Así, la pista de un impostor nunca se compara con el secreto: si escribe el nombre por casualidad, se acepta como
  cualquier otra pista.
- Encaja con el cliente: el impostor vivo recibe `secretPokemon: null`, así que su campo no tiene nada que comprobar.

### Cliente: un solo dueño, el campo

- `validateImpostorClue(text, mode, secretName)` recibe un tercer parámetro, `secretName: string | null | undefined`,
  y `PokemonImpostorGame.tsx` le pasa `player.secretPokemon?.name`. Con el nombre, aplica la misma normalización y la
  misma subcadena, después de la regla de `ONE_WORD`, y devuelve `IMPOSTOR_SECRET_NAME_ERROR = 'No puedes decir el
  nombre del Pokémon.'`.
- El error es del campo: «Enviar pista» se desactiva y la pista no se envía. No se repite en la región viva ni en el
  aviso de la sala.
- **Hueco conocido** (Decisión tomada (revisable)): el cliente solo tiene `secretPokemon.name`, porque la proyección es
  `SecretPokemon(name, sprite)`. Por eso no detecta el nombre base de una forma regional («raichu» con Raichu de Alola)
  ni «nidoran» con Nidoran F. En esos casos la pista sale y el servidor la rechaza; `gameAction` ya publica ese fallo
  en el aviso de la sala, que es su único dueño, y la pantalla lo ignora con `ignoreFailure`, como cualquier otro
  rechazo del servidor. La alternativa, añadir `names` a `SecretPokemon`, cambiaría la proyección de todos los
  inocentes y obligaría a regrabar las siete fixtures doradas de Impostor.

### Fixtures doradas

- Se revisaron las pistas de las siete fixtures (`empty-clue-order-deadline`, `guess-and-presence`, `innocents-win`,
  `invalid-action-stops`, `one-word-mode`, `skip-deadlock-stalemate` y `tie-and-parity`) contra el nombre de su
  Pokémon secreto con la regla de arriba: **ninguna contiene el nombre, así que ninguna cambia al regrabar**. Solo
  cambiaría una fixture que tuviera una pista así.
- Hay una fixture nueva, `golden/pokemon-impostor/secret-name-clue.json`, copiada de `one-word-mode.json` (semilla
  1509, 4 jugadores, **un impostor**, secreto Eevee) pero en `CLASSIC`, para que el cambio de `fellowImpostorIds`
  (apartado 1) no la toque sea cual sea el orden de las tareas. Pasos:
  - un inocente envía «Eevee», «EÉVÉE» y «eeveeee»: tres rechazos con «No puedes decir el nombre del Pokémon.»;
  - el mismo inocente envía después una pista válida, que se acepta;
  - en su turno, el impostor envía «Eevee» y se acepta, porque su pista no se compara.
- Al regrabar (`-Dupdate=true`), el único cambio en `golden/` es el fichero nuevo.

- Que los impostores se comuniquen entre sí (chat privado o señales).
- Cambiar cuántos impostores se permiten o la regla de paridad.
- Bloquear sinónimos, motes o nombres de otros Pokémon de la misma línea evolutiva en las pistas.
- Rehacer los textos del resto de la pestaña «Modo y sesión».

## Verificación

- Java: `PokemonImpostorEngineTest` (también las pistas con el nombre, en los dos modos) y `GoldenReplayTest` de
  `pokemon-impostor`, regrabado, con la fixture nueva `secret-name-clue.json`.
- Vitest: `pokemon-impostor-texts.test.ts`, `PokemonImpostorGame.test.tsx` (que ya cubre `impostorAnnouncement`),
  `validation.test.ts` de Impostor y `GameSelection.test.tsx`.
- Playwright:
  - un test nuevo de Impostor con 5 jugadores y 2 impostores;
  - `sala.spec.ts:150`, ampliado, con capturas a tres tamaños;
  - rúbrica de `docs/visual-review.md` ≥ 19/24 en la tarjeta de rol con aliados;
  - en el test existente de pistas de Impostor, un inocente escribe el nombre del Pokémon y ve el error en el campo,
    con capturas a tres tamaños.
