# Arcade DS F4: Sala y piezas compartidas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar con el catálogo Arcade DS la sala (armazón de sesión, lobby, intro, votación del siguiente juego y
resultados de sesión) y las piezas que comparten los 28 minijuegos (buscador de Pokémon, temporizador, resultados, lista
de jugadores, avatar, deslizador de configuración), de modo que F5–F8 sean sobre todo maquetación de cada juego.

**Architecture:** Las piezas compartidas conservan su API para no tocar los 28 juegos ahora: cambian por dentro a
componentes del catálogo. `RoomSessionLayout` pasa a `ScreenSplit` con una placa de sala (código, jugadores, saltar juego,
feedback con contexto). Las pantallas de la sala caben sin scroll de página ni de `main` en escritorio; las listas largas
se desplazan dentro de su `Panel`. Los `ConfigPanel` de cada juego (`games/<id>/ConfigPanel.tsx`) se rediseñan con su
juego en F5–F8; aquí solo se enmarcan.

**Tech Stack:** React 19, catálogo `frontend/src/ui/`, audio (F2), Tailwind para maquetar, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` §2 (ScreenSplit, columna lateral), §4, §6
(Lobby; Intro, votación y resultados de sesión), §7, §9, §10.

## Global Constraints

- Las del catálogo (F1–F3): solo componentes de `frontend/src/ui/` y tokens; nada de `btn-*`, `card`, `chip`, `field`,
  `panel`, `lobby-*`, `session-card*`, `ranking-row*` ni colores alias en lo que se rediseña; texto ≥13 px; objetivos ≥44 px;
  movimiento solo `transform`/`opacity`.
- Escritorio (1280×720 y 1920×1080): sin scroll de página ni de `main` en Lobby, Intro, Votación y Resultados de sesión;
  «¡Empezar partida!» (rojo principal) visible sin desplazar en el lobby del anfitrión. Móvil (390×844): `ScreenSplit` con
  la acción abajo; scroll solo si el contenido lo exige.
- Las piezas compartidas mantienen su API pública (props y nombres exportados): ningún juego cambia en esta fase salvo que
  lo exija una prop nueva opcional.
- E2E: los specs existentes siguen localizando por rol y nombre; si un nombre cambia, se actualiza en el mismo commit.
  Antes de cada ejecución: puertos 8080/5173 libres (no reutilizar servidores ajenos) y `rm -rf backend/.micronaut/test-resources`.
- Cada pantalla rediseñada lleva rúbrica (spec §10) ≥19/24 sin ningún 0 en el commit de sus capturas.

## Review Focus

1. **Anfitrión que se va o se desconecta en el lobby**: la placa de jugadores refleja el cambio de anfitrión, «Empezar»
   pasa al nuevo anfitrión y nadie se queda con un botón muerto. E2E de dos jugadores.
2. **Buscador de Pokémon sin catálogo o con error** (red caída): esqueleto, error con «Reintentar» y foco; los 18 juegos que
   lo usan siguen funcionando (E2E de 3 de ellos).
3. **Sala llena / 8 jugadores** en el lobby a 390 px: la lista de jugadores se desplaza dentro de su panel, sin empujar
   «Empezar» fuera de la pantalla.
4. **Votación del siguiente juego con empate o sin votos**: el resultado se muestra claro y el temporizador no queda en
   negativo.
5. **Reconexión a mitad de la intro**: la intro se muestra en el paso correcto, sin sonar `game.start` dos veces seguidas
   (cooldown) y sin duplicar el carrusel.

---

### Task 1: Piezas compartidas de los juegos

**Files:** Modify `frontend/src/room/PokemonSelector.tsx` (y su hook `usePokemonPool`), `frontend/src/components/ServerTimer.tsx`,
`frontend/src/room/ResultsShell.tsx`, `frontend/src/room/ConfigRange.tsx`, `frontend/src/components/Avatar.tsx`,
`frontend/src/ui/dev/Gallery.tsx`; sus tests.

- `PokemonSelector`: buscador como `Field` grande con icono de lupa, lista de resultados como `Card`s pequeñas (sprite +
  nombre + número) en una rejilla con scroll interno y teclado (flechas, Enter); estados carga (esqueleto), error
  (`StateBox` con «Reintentar» y foco) y vacío («Ningún Pokémon coincide con …» y acción de limpiar).
- `ServerTimer`: por dentro usa el `Timer` del catálogo (placa con número `text-26` y barra), conservando su API y el sonido
  de cuenta atrás de F2.
- `ResultsShell`: podio y clasificación con `Row`s (puesto, avatar, nombre, puntos, color del jugador), el ganador con `Badge`
  y `ScorePop`; conserva `resultsCue`.
- `ConfigRange`: por dentro `Slider` del catálogo (misma API).
- `Avatar`: sin colores alias; fondo por defecto con tokens (`--blue` → `--navy-3`) e inicial con `.ol`; tamaños existentes.
- Galería: figuras del selector en sus estados, del temporizador de servidor y de un `ResultsShell` de ejemplo.
- [ ] Tests (estados del selector, navegación por teclado como función pura, API intacta) → FAIL → implementar → verde.
- [ ] Commit `Arcade DS F4: buscador, temporizador, resultados, deslizador y avatar con el catálogo`.

### Task 2: Armazón de la sesión

**Files:** Modify `frontend/src/room/RoomSessionLayout.tsx`, `frontend/src/room/PlayerList.tsx`, el control de saltar juego
(`SkipGameControl` o similar), el aviso de conexión de sala; E2E `sala.spec.ts`.

- `RoomSessionLayout`: `ScreenSplit` con `side` = placa de sala (código con copiar, `PlayerList`, saltar juego) en
  escritorio ≥1024 px y en móvil la placa de sala compacta arriba. Un único acceso a feedback con contexto
  (`/feedback?game=&room=`), quitando la tarjeta duplicada del lobby y el enlace suelto; la píldora de la cabecera se queda.
- `PlayerList`: `Row`s con avatar, nombre, insignias (anfitrión con corona, listo, puntos) y menú del anfitrión
  (expulsar) como `Pill round` + diálogo de confirmación; el color del jugador en la banda; estado desconectado con texto.
  Conserva `room.join`/`room.leave` de F2.
- Quitar los `lg:sticky lg:top-20` heredados de la cabecera antigua.
- [ ] Tests → implementar → verde; E2E `sala`.
- [ ] Commit `Arcade DS F4: sesión de sala con placa de jugadores y pantalla doble`.

### Task 3: Lobby

**Files:** Modify `frontend/src/room/Lobby.tsx`, `frontend/src/room/GameSelectionConfig.tsx`; E2E `sala.spec.ts` y los de
`juegos.spec.ts` que usan el lobby (selección de juego, configuración, «cómo se juega», rotación).

- Columna principal con `Tabs` (Minijuegos · Configuración · Modo y sesión): rejilla de `Card`s de juego (icono, nombre,
  jugadores, insignias TOP/Experimental como `Badge`, botón «Cómo se juega» como `Pill ghost small`), buscador de juegos
  como `Field`; la configuración enmarca el `ConfigPanel` del juego en un `Panel` crema. Columna lateral (placa de sala de la
  Task 2) con «Marcarme listo» (`Pill yellow`) y «¡Empezar partida!» (`Pill red main`, solo anfitrión) siempre visibles.
- Errores de la sala en español (aprovecha `roomErrorMessage` de F3).
- [ ] Tests → implementar → verde; E2E `sala` y `juegos -g "lobby"`.
- [ ] Commit `Arcade DS F4: lobby con cartas de juego y empezar siempre a la vista`.

### Task 4: Intro, votación del siguiente juego y resultados de sesión

**Files:** Modify `frontend/src/room/GameIntro.tsx`, `frontend/src/room/NextGameVote.tsx`, `frontend/src/room/SessionResults.tsx`;
E2E correspondientes.

- Intro: `Cutin` de entrada con el nombre del juego, el carrusel (ya en catálogo desde F3) en un `Panel`, recuento de listos
  y «Empezar ya»/«Saltar» como `Pill`s; cabecera de la intro sin estilos antiguos.
- Votación: `Card`s de juego seleccionables con recuento de votos (`Badge`), `Timer`, resultado con `Cutin` o resaltado.
- Resultados de sesión: podio con los tres primeros en `Card`s/`Row`s grandes, resto en `Row`s, `game.podium`/`game.win`,
  `Pill`s «Otra partida» / «Volver al lobby» / «Terminar».
- [ ] Tests → implementar → verde; E2E.
- [ ] Commit `Arcade DS F4: intro, votación y resultados de sesión con el catálogo`.

### Task 5: Verificación (controlador)

- [ ] E2E `sala inicio galeria audio` y `juegos -g "lobby|intro|pokedex-distance|shiny-vote|who-is-who"`; revisar capturas
  del lobby (anfitrión, invitado, lista, configuración), intro, votación y resultados de sesión a 3 tamaños; rúbricas.
- [ ] Commit de capturas con rúbricas; revisión final, arreglos, fusión en `main` y push.
