# Arcade DS F6: Los 12 juegos de adivinar y quiz — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar con el catálogo Arcade DS la pantalla de juego, la revelación de ronda, los resultados y el
`ConfigPanel` de Who's That, Zoomed, Palette, Cry, Pokédex Entry, Guess from Stats, Pokédle Race, Type Chain, Trivia,
TCG Higher or Lower, Connections y Bingo, sin cambiar su lógica ni sus motores.

**Architecture:** Los seis juegos de «pista + buscador» (Who's That, Zoomed, Palette, Cry, Pokédex Entry, Guess from
Stats) repiten las mismas piezas en cada archivo (`PlayersPanel`, `AttemptsPanel`, `HintPanel`, `GuessPanel`,
`RoundReveal`). La Task 1 las saca a un kit compartido `frontend/src/room/guess-kit/` hecho con el catálogo y migra
Who's That como referencia; las Tasks 2–3 pasan los otros cinco al kit, cada uno con su pista propia (zoom, paleta, grito,
entrada, estadísticas). Los demás juegos (Tasks 4–7) se rehacen uno a uno con las piezas de F4/F5 (`ScreenSplit`,
`ResultsShell` con `standings`/`aside`/`actions`/`fillLarge`, `GameSkipSlot`, `Row`, `Card`, `Bar`, `Badge`, `TypeBadge`,
`Cutin`, `room/focus-transition.ts`).

**Tech Stack:** React 19, catálogo `frontend/src/ui/`, audio (F2), Tailwind solo para maquetar, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` §2, §4, §6 «Juegos», §7, §8, §9, §10.

## Global Constraints

- Las de F5, que siguen vigentes: solo componentes del catálogo y tokens en lo rediseñado (nada de `btn-*`, `card`,
  `chip`, `label`, `field`, `panel`, `reveal-pop`, `timer-pulse` heredados ni colores alias `text-ink/…`, `bg-berry`,
  `text-leaf`, `text-electric`…); texto ≥13 px; objetivos ≥44 px; movimiento solo `transform`/`opacity` con reducción y
  `body.static`; emojis de medalla fuera (puesto en `Row`/`Badge`).
- Disposición: escritorio (≥1024 px) sin scroll de página ni de `main` a 1280×720 y 1920×1080, con zona principal (pista
  + acción) y columna lateral (jugadores/intentos/marcador); a 1920 la pantalla se llena (escala con `clamp()`/unidades de
  contenedor a ≥1600 px, sin contenido pequeño flotando en paneles grandes). Móvil 390×844: arriba la pista y el
  temporizador, abajo la acción/buscador pegada al fondo; lo que hace falta para actuar se ve sin desplazar (aserción
  `toBeInViewport` en el E2E).
- Un dueño por error: los fallos de comandos del servidor ya salen traducidos en el aviso global de la sala; la pantalla
  no repite `caught.message` (usa `ignoreFailure` como en F5) y solo muestra sus validaciones previas.
- `window.confirm` fuera: las confirmaciones (mover un Pokémon ya usado en Bingo) van con `Dialog` del catálogo.
- Lógica, motores, proyecciones y privacidad intactos: ningún cambio en `packages/shared` ni en `backend/`. La respuesta
  de la ronda no entra en el DOM antes de `ROUND_RESULTS` (test de render).
- Cada juego entra en `GAMES_WITH_SKIP_IN_SCREEN` y monta `<GameSkipSlot/>` en su pantalla, como los de F5.
- Una sola región viva por pantalla (siempre montada) para «Incorrecto», «¡Acertado!», cooldown y cambios de turno; el foco
  no cae al `body` al cambiar de fase (`focus-transition.ts`).
- E2E: cada juego en `SCREENSHOT_GAMES` de `e2e/tests/juegos.spec.ts` con `ARCADE` (`minFontPx: 13`, `noPageScroll`) y
  capturas `juego-<id>-*` a 1280×720, 1920×1080 y 390×844. Si el juego llega a la revelación o a los resultados en un test
  propio razonable (ronda corta por configuración), también se capturan. Antes de cada ejecución: puertos 8080/5173
  libres y `rm -rf backend/.micronaut/test-resources`.
- `ConfigPanel` de cada juego: controles del catálogo (`Segmented`, `Toggle`, `Slider`/`ConfigRange`, `Chip`/`Card`
  seleccionables), sin la remezcla `.on-cream` de alias. `GenerationSelector`, si se toca, se rehace una vez y sirve a todos.
- Rúbrica (spec §10) ≥19/24 sin ningún 0 por pantalla (juego, revelación, resultados), en el mensaje del commit.
- Un commit por juego: `Arcade DS F6: <Juego> con el catálogo` (+ rúbricas).

## Review Focus

1. **Respuesta oculta hasta la revelación** en los seis juegos de pista (nombre, sprite, `aria-label`, `title`, `alt`).
2. **Cooldown tras fallo** con el buscador: el contador se ve y se anuncia una vez, sin bloquear la búsqueda.
3. **Espectadores y jugadores desconectados**: ven la pista y el marcador sin controles de acción y con su estado en texto.
4. **Grito de Cry Quiz**: el botón de reproducir es un `Pill` accesible y la música baja mientras suena (F2), sin autoplay.
5. **Tableros grandes** (Bingo 5×5, Connections 16 cartas, Pokédle con muchas filas): caben en escritorio sin scroll de
   página (scroll interno del `Panel`) y en móvil la casilla elegida y el buscador se ven juntos.

---

### Task 1: Kit de adivinar + Who's That Pokémon

**Files:** Create `frontend/src/room/guess-kit/` (`GuessPlayersPanel`, `GuessAttemptsFeed`, `GuessHints`, `GuessPanel`,
`GuessRoundReveal`, `GuessScreen` y sus CSS Modules; `index.ts`), su test; Modify `WhosThatPokemonGame.tsx`,
`WhosThatPokemonResults.tsx`, `frontend/src/games/whos-that-pokemon/ConfigPanel.tsx`, `game-skip-slot.ts`, E2E.

- `GuessScreen`: `ScreenSplit` con cabecera (ronda N/M, nombre del juego, `ServerTimer`, `GameSkipSlot`), zona de pista
  (slot), `GuessHints` (`Chip`s), `GuessPanel` abajo y lateral con `GuessPlayersPanel` + `GuessAttemptsFeed`.
- `GuessPanel`: estados espectador, acertado («¡Acertado!» con puesto y puntos, `Badge`), incorrecto con cooldown y
  normal (`PokemonSelector`); conserva `inputLabel`, `confirmationDisabled` y `key` por ronda de cada juego.
- `GuessPlayersPanel`: `Row`s con avatar, nombre, puntos, `playerColor` y marca de acertado en texto («Acertó»).
- `GuessAttemptsFeed`: intentos públicos incorrectos en `Row`s con scroll interno y vacío con `StateBox`.
- `GuessRoundReveal`: «¡Era X!» con `Card` del Pokémon (+ slot de la pista desvelada), `Row`s de cada jugador por orden de
  acierto (puesto, tiempo, intentos, puntos; «No acertó» en texto) y `ServerTimer` de la siguiente ronda.
- Who's That: silueta en un `Panel` que escala (la silueta sigue siendo una imagen sin nombre en `alt`); resultados con
  `ResultsShell` (`standings` con las métricas en texto: aciertos, sin acertar, intentos, precisión, media, mejor tiempo,
  al primer intento).
- [ ] Tests del kit (estados de `GuessPanel`, orden y textos del reveal, privacidad: sin nombre antes de revelar) → FAIL →
  implementar → verde → E2E `juegos -g "whos-that-pokemon"` → capturas revisadas.
- [ ] Commit `Arcade DS F6: kit de adivinar y Who's That Pokémon con el catálogo` (+ rúbricas).

### Task 2: Zoomed Pokémon y Palette Guess

**Files:** `ZoomedPokemonGame.tsx`, `ZoomedPokemonResults.tsx`, `games/zoomed-pokemon/*`, `PokemonPaletteGuessGame.tsx`,
`PokemonPaletteGuessResults.tsx`, `games/pokemon-palette-guess/*`, E2E.

- Ambos sobre el kit de la Task 1. Zoomed: el visor de zoom como pista (sin cambiar el recorte ni sus tiempos). Palette:
  la barra de colores como pista, con los nombres de color y porcentajes en texto ≥13 px (la información no va solo en
  color). Resultados con `ResultsShell`.
- [ ] Tests → implementar → verde → E2E `juegos -g "zoomed-pokemon|pokemon-palette-guess"` → capturas.
- [ ] Dos commits: `Arcade DS F6: Zoomed Pokémon con el catálogo`, `Arcade DS F6: Palette Guess con el catálogo`.

### Task 3: Cry Quiz, Pokédex Entry y Guess from Stats

**Files:** `PokemonCryQuizGame.tsx`, `PokedexEntryGuessGame.tsx`, `GuessFromStatsGame.tsx`, sus `*Results.tsx` y
`games/<id>/*`, E2E.

- Sobre el kit. Cry: reproductor del grito como `Pill` grande con estado en texto («Reproducir grito»/«Sonando…»),
  conserva el ducking de música de F2. Entry: la entrada en un `Panel` crema legible (texto ≥15 px, nombre tapado como
  ahora). Stats: estadísticas con `Bar` (nombre y número en texto); la ficha completa al revelar.
- [ ] Tests → implementar → verde → E2E `juegos -g "pokemon-cry-quiz|pokedex-entry-guess|guess-from-stats"` → capturas.
- [ ] Tres commits, uno por juego.

### Task 4: Pokédle Race

**Files:** `PokeddleRaceGame.tsx`, `PokeddleBoard.tsx`, `PokeddleRaceTimer.tsx`, `pokeddle-presentation.ts`,
`PokeddleRaceResults.tsx`, `games/pokeddle-race/*`, estilos `.pokeddle-*` de `styles.css` (se retiran los que dejen de
usarse), E2E.

- Tablero de intentos con celdas por atributo (acierto/cerca/fallo con color **y** icono/texto, flechas de mayor/menor),
  buscador abajo, rivales en el lateral como `Row`s con su progreso (sin desvelar sus intentos más allá de lo que hoy se
  ve). Resultados con `ResultsShell`.
- [ ] Tests → implementar → verde → E2E `juegos -g "pokeddle-race"` → capturas.
- [ ] Commit `Arcade DS F6: Pokédle Race con el catálogo`.

### Task 5: Type Chain y Pokémon Trivia

**Files:** `TypeChainGame.tsx`, `TypeChainResults.tsx`, `games/type-chain/*`, `PokemonTriviaGame.tsx`,
`PokemonTriviaResults.tsx`, `games/pokemon-trivia/*`, E2E.

- Type Chain: Pokémon actual en `Card` con `TypeBadge`s, turno y temporizador del turno en `Timer`, cadena como `Row`s con
  scroll interno, aviso de evento como `Cutin` corto o banda, jugadores eliminados en texto.
- Trivia: pregunta en `Panel`, opciones como `Pill`/`Card` grandes con atajos 1–4 (`badge`), revelación con correcta e
  incorrectas marcadas con icono y texto, quién respondió qué; resultados con aciertos por categoría.
- [ ] Tests → implementar → verde → E2E `juegos -g "type-chain|pokemon-trivia"` → capturas.
- [ ] Dos commits, uno por juego.

### Task 6: TCG Higher or Lower y Pokémon Connections

**Files:** `TcgHigherLowerGame.tsx`, `TcgHigherLowerResults.tsx`, `games/tcg-higher-lower/*`,
`PokemonConnectionsGame.tsx`, `PokemonConnectionsResults.tsx`, `games/pokemon-connections/*`, E2E.

- TCG: mismo lenguaje que Higher or Lower de F5 (dos `Card`s de carta con «¿?» de precio hasta revelar, `Pill`s
  Más/Igual/Menos con atajos, rachas con `Badge`, marcador lateral).
- Connections: rejilla de 16 `Card`s seleccionables (aria-pressed), grupos encontrados como bandas con su tema en texto,
  vidas/errores en texto, revelación de los grupos al final de ronda.
- [ ] Tests → implementar → verde → E2E `juegos -g "tcg-higher-lower|pokemon-connections"` → capturas.
- [ ] Dos commits, uno por juego.

### Task 7: Pokémon Bingo

**Files:** `PokemonBingoGame.tsx`, `PokemonBingoResults.tsx`, `games/pokemon-bingo/*`, E2E.

- Tablero propio como rejilla de `Card`s (condición en texto, asignado con sprite y «Completa», vacía), casilla elegida
  con el buscador al lado en escritorio y debajo en móvil, «Quitar Pokémon» como `Pill ghost`, confirmación de mover con
  `Dialog`, rivales con `Tabs` del catálogo, «¡BINGO!» con `Cutin` y «Saltar y continuar» del anfitrión.
- [ ] Tests → implementar → verde → E2E `juegos -g "pokemon-bingo"` → capturas.
- [ ] Commit `Arcade DS F6: Pokémon Bingo con el catálogo`.

### Task 8: Verificación (controlador)

- [ ] Suite E2E completa; revisar capturas de los 12 juegos; revisión final; arreglos; fusión en `main` y push.
