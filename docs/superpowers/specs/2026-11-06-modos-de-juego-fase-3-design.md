# Fase 3: modos de juego

Fecha: 2026-11-06. Estado: aprobado en conversación, pendiente de revisión escrita. Origen: `MINIJUEGOS_MEJORAS.md`
§10 «Fase 3» y las tablas «Nuevos modos de juego» de §2.5–§7.5.

## Objetivo

Seis minijuegos ganan un segundo modo además del actual (Clásico), elegible desde sus ajustes en el lobby:

| Juego | Modo nuevo | Valor de `mode` |
|---|---|---|
| Pokédex Distance (`pokedex-distance`) | Por puntos | `POINTS` |
| Higher or Lower (`higher-lower`) | Racha infinita | `ENDLESS` |
| Shiny Quiz (`shiny-vote`) | Supervivencia | `SURVIVAL` |
| Learnset Guess (`learnset-guess`) | Revelación manual | `MANUAL_REVEAL` |
| Type Duel (`type-duel`) | Cooperativo | `COOP` |
| Pokémon Impostor (`pokemon-impostor`) | Una palabra | `ONE_WORD` |

**Criterio de éxito:** en el lobby se elige el modo en el panel del juego, la carta lo muestra, y una partida
completa en cada modo nuevo se juega de principio a fin con sus reglas, sin romper el modo Clásico, que sigue siendo
el comportamiento por defecto y queda idéntico (sus fixtures doradas no cambian).

## Decisiones tomadas

- **Enfoque:** un campo `mode` en la configuración de cada juego y **el mismo motor** con ramas en las reglas que
  cambian. Nada de motores ni juegos separados.
- **Una carta por juego:** el modo es un ajuste más. La carta del lobby muestra un `Chip` con el nombre del modo cuando
  no es Clásico.
- **Racha infinita sin récord persistente:** el récord personal guardado en BD queda para la Fase 4 (logros).
- **Impostor:** el plan del documento lo llamaba «Rápido para 3»; se hace «Una palabra» de la tabla §4.5.
- **Fuera de alcance:** Diario, Contrarreloj, Por equipos, Eliminación, Detective, Tema secreto y el resto de modos
  de las tablas; récords y logros.

## Común a los seis

### Configuración

- Campo `mode` (enum `CLASSIC | <modo nuevo>`, por defecto `CLASSIC`) en cada esquema Zod
  (`packages/shared/src/games/<id>/config.ts`), en su `default<Juego>Config`, en el `<Juego>Config` Java (con
  `ConfigReader.enumValue`), en `backend/src/main/resources/games/registry.json` y en el `config-cases.json` del juego.
- Las configuraciones guardadas sin `mode` (usuarios registrados) se leen como `CLASSIC`: el campo tiene valor por
  defecto en Zod y en Java, así que `migrateStoredGameConfig` las da por válidas sin migración de datos.
- Los ajustes que solo aplican a un modo se muestran solo en ese modo (y se validan siempre, para que un cambio de modo
  no deje una configuración inválida).

### Lobby

- En el panel de ajustes del juego, arriba del todo: `Segmented` «Modo» con «Clásico» y el nombre del modo nuevo, y
  debajo una línea (texto 13 px) que explica las reglas del modo elegido (textos en cada sección de abajo).
- La carta del juego en la rejilla muestra `Chip` con el nombre del modo cuando no es `CLASSIC`.
- `GAME_STARTING`/primera ronda: el título de la pantalla del juego añade el nombre del modo («Pokédex Distance · Por
  puntos») cuando no es Clásico.

### Motores

- El estado público de cada motor incluye `mode` (para que la pantalla sepa qué pintar).
- `CLASSIC` conserva exactamente el comportamiento y las fixtures doradas actuales: las ramas nuevas solo se activan con
  el modo nuevo. Cada modo nuevo añade al menos una fixture dorada nueva en `backend/src/test/resources/golden/<id>/`
  y su test Java; se regraban con `./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'` y el diff de las
  fixtures existentes debe ser solo la clave `mode` añadida.

## Los seis modos

### Pokédex Distance · Por puntos (`POINTS`)

- Ajuste nuevo `pointsRounds` (entero 3–30, por defecto 10), visible solo en este modo.
- Nadie queda eliminado. Se juegan `pointsRounds` rondas con la mecánica de elección actual.
- Puntos por ronda: `max(0, 100 − distancia)` y +50 si la distancia es 0. Quien no elige suma 0.
- No hay desempates por ronda (las reglas de desempate del Clásico no se aplican).
- Resultados: clasificación por puntos totales; empate en puntos → comparten puesto.
- Texto del modo: «Nadie queda fuera: cada ronda suma 100 menos tu distancia, y 50 extra si clavas el número.»

### Higher or Lower · Racha infinita (`ENDLESS`)

- Todos responden la misma comparación, como en el Clásico.
- Un fallo (o no responder a tiempo) te deja **fuera**: pasas a espectador el resto de la partida.
- La partida termina cuando no queda ningún jugador en pie, o al llegar a 100 rondas (tope de seguridad). El ajuste
  `rounds` no se usa en este modo (se oculta).
- Puntuación: tu racha (aciertos seguidos antes de caer). Gana la racha más larga; empate → comparten puesto.
- La pantalla muestra la racha de cada jugador y quién sigue en pie.
- Texto: «Un fallo y estás fuera. Gana quien encadene más aciertos.»

### Shiny Quiz · Supervivencia (`SURVIVAL`)

- Un voto incorrecto (o no votar) te deja fuera.
- Número de opciones por ronda: empieza en 3 y sube 1 cada 3 rondas hasta el ajuste `optionCount` (3–6).
- La partida termina cuando no queda nadie en pie o tras `rounds` rondas.
- Puntuación: rondas superadas. Gana quien aguante más; empate → comparten puesto.
- Texto: «Un fallo y estás fuera; cada pocas rondas hay más candidatos.»

### Learnset Guess · Revelación manual (`MANUAL_REVEAL`)

- Sin revelación por tiempo de grupos de movimientos: cada jugador ve los grupos que ha desbloqueado. Empieza con el
  primer grupo; **cada intento fallido le revela el siguiente**.
- La ronda termina cuando todos han acertado o agotado los grupos, o al acabar `roundSeconds` (se mantiene como tope).
- Puntuación por ronda: acertar con N grupos visibles da `max(1, gruposTotales − N + 1) × 10` puntos; no acertar, 0.
- Gana quien sume más tras `rounds` rondas.
- Las pistas y los intentos son privados de cada jugador en la proyección por jugador (nadie ve los grupos que otro
  ha desbloqueado hasta la revelación de la ronda).
- Texto: «Sin prisas: cada fallo te enseña más movimientos. Menos intentos, más puntos.»

### Type Duel · Cooperativo (`COOP`)

- Ajuste nuevo `coopSeconds` (entero 30–120, por defecto 60), visible solo en este modo; `typeSelectSeconds` y
  `searchSeconds` se ocultan.
- Cada ronda, toda la sala recibe la misma combinación de tipos (aleatoria entre las que tienen al menos un Pokémon
  válido en las generaciones elegidas) y tiene `coopSeconds` para nombrar Pokémon que la cumplan.
- Un Pokémon ya encontrado por cualquiera no cuenta de nuevo (se rechaza con «Ya lo ha encontrado alguien.»).
- Puntuación del grupo: total de Pokémon distintos encontrados; cada jugador ve cuántos aportó.
- Se juegan `rounds` rondas; los resultados muestran el total del grupo y la aportación de cada uno (no hay ganador
  individual: la clasificación de la sesión usa la aportación).
- Texto: «Todos contra el reloj: encontrad juntos todos los Pokémon posibles con esos tipos.»

### Pokémon Impostor · Una palabra (`ONE_WORD`)

- Las pistas deben ser una sola palabra: tras recortar, sin espacios. El servidor rechaza las demás con «La pista debe
  ser una sola palabra.» (además de las reglas actuales: longitud y no decir el nombre del Pokémon).
- Hay exactamente 2 rondas de pistas antes de cada votación (en lugar de la configuración actual).
- El resto (votación, «Saltar», tope de revotación, condiciones de victoria) es igual que el Clásico.
- Texto: «Pistas de una sola palabra y dos vueltas antes de votar.»

## Pruebas

- **Java:** para cada modo, tests de sus reglas en el test del motor (fin de partida, puntuación, eliminación,
  desconexión durante el modo, `getResults`) y una fixture dorada nueva; `GoldenReplayTest` en verde con las fixtures
  del Clásico sin cambios salvo `mode`. Tests de configuración (`config-cases.json`) con el nuevo campo y los ajustes
  propios de cada modo.
- **Vitest:** esquema Zod (valor por defecto, rechazo de valores fuera de rango), `config-cases.test.ts`, el panel de
  ajustes (selector de modo, campos que aparecen y desaparecen) y la pantalla de cada juego en el modo nuevo.
- **Playwright:** en `e2e/tests/juegos.spec.ts`, un recorrido por cada modo nuevo (elegir el modo en el lobby, jugar
  hasta los resultados) con capturas a 1280×720, 1920×1080 y 390×844 de las pantallas que cambian; nota de la rúbrica
  ≥ 19/24 para cada pantalla que cambie.
- **Regla del usuario:** nada de suites completas; solo los tests y specs de lo tocado.
