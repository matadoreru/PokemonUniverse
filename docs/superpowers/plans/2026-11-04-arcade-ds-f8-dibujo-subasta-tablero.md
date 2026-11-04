# Arcade DS F8: Sketchmon, subastas y Quién es Quién — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar con el catálogo Arcade DS la pantalla de juego, sus fases, la revelación, los resultados y el
`ConfigPanel` de Sketchmon, Pokémon Team Auction, Pokémon Bluff Auction y Quién es Quién Pokémon, sin cambiar su lógica ni
sus motores. Con F8 quedan los 28 juegos en el catálogo.

**Architecture:** Sketchmon es Taboo con lienzo: reutiliza el patrón de F7 (`PokeTabooGame`: panel secreto solo en el DOM
del que dibuja, turnos, buscador del kit de adivinar de F6) y mete `SketchmonCanvas` en un `Panel` con herramientas del
catálogo. Las dos subastas comparten la puja (lote, presupuesto, controles de puja, historial): la Task 2 saca un kit
`frontend/src/room/auction-kit/` y migra Team Auction; la Task 3 monta Bluff Auction encima. Quién es Quién es un tablero
de `Card`s con cursores compartidos del equipo y el diálogo de adivinar. Se reutilizan `ScreenSplit`, `GameSkipSlot`,
`ResultsShell`/`ResultsRecords`, `Row`, `Card` (`data-part`, `flip`), `Bar`, `Badge`, `Dialog`, `Tabs`, `TextCard`,
`focus-transition` (`useRefocusAfterReject`), `ignoreFailure`, `gameAction(…, { report: false })` y los ayudantes E2E
(`iniciarPartida` con `toPass`, `sinScorePop`, `sinTapar`, `tramasRetenibles`, `adivinar`).

**Tech Stack:** React 19, catálogo `frontend/src/ui/`, audio (F2), Tailwind solo para maquetar, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` §2, §4, §6 «Juegos», §7, §8, §9, §10.

## Global Constraints

- Solo componentes del catálogo y tokens en lo rediseñado (nada de `btn-*`, `card`, `chip`, `label`, `field`, `panel`,
  `reveal-pop`, `timer-pulse` heredados ni colores alias `text-ink/…`, `bg-berry`, `text-leaf`, `text-electric`…); texto
  ≥13 px; objetivos ≥44 px; movimiento solo `transform`/`opacity` con reducción y `body.static`; sin emojis de medalla.
- Disposición: escritorio (≥1024 px) sin scroll de página ni de `main` a 1280×720 y 1920×1080, zona principal y columna
  lateral; a 1920 la pantalla se llena. Móvil 390×844: lo necesario para actuar se ve sin desplazar (`toBeInViewport`).
- Privacidad: el Pokémon secreto (Sketchmon, Quién es Quién), las pujas ocultas y los faroles (Bluff) no entran en el DOM
  de quien no debe verlos antes de su revelación (test de render por juego).
- Un dueño por error: el aviso global de la sala; las acciones frecuentes que no deben borrar el aviso (trazos del lienzo,
  movimiento del cursor) van con `gameAction(…, { report: false })` o por su canal propio; una sola región viva por
  pantalla; el foco no cae al `body` al cambiar de fase ni tras un rechazo.
- Lógica, motores y proyecciones intactos: ningún cambio en `packages/shared` ni en `backend/`.
- Cada juego en `GAMES_WITH_SKIP_IN_SCREEN` con `<GameSkipSlot/>`.
- Funciones de la pantalla antigua: si una se quita o cambia, se lista en el informe y se restaura salvo que la tarea diga
  otra cosa. `window.confirm` → `Dialog`.
- `ConfigPanel` con controles del catálogo; `GenerationSelector` se deja para F9.
- E2E sin red: cada juego con un test propio que juega hasta los resultados y captura cada fase propia y los resultados a
  1280×720, 1920×1080 y 390×844 (`ARCADE`, `sinScorePop`). Antes de cada ejecución: puertos 8080/5173 libres (si están
  ocupados, esperar; no matar nada) y `rm -rf backend/.micronaut/test-resources`.
- Rúbrica (spec §10) ≥19/24 sin ningún 0 por pantalla, en el mensaje del commit. Un commit por juego:
  `Arcade DS F8: <Juego> con el catálogo`.

## Review Focus

1. **Lienzo de Sketchmon con puntero, táctil y teclado**: dibujar, borrar y deshacer siguen funcionando; las herramientas
   tienen nombre accesible y el color no es la única pista (nombre del color).
2. **Pujas simultáneas y presupuesto agotado**: el botón de pujar se bloquea con texto claro, sin `NaN` ni negativos.
3. **Cursores compartidos de Quién es Quién**: no tapan las cartas ni los controles; con movimiento reducido no animan.
4. **Reconexión a mitad de turno o de subasta**: el estado propio (puja, trazos, cartas bajadas) se restaura.
5. **Tableros y lotes grandes**: caben en escritorio sin scroll de página (scroll interno del `Panel`).

---

### Task 1: Sketchmon

**Files:** `SketchmonGame.tsx`, `SketchmonCanvas.tsx`, `SketchmonResults.tsx`, `games/sketchmon/*`, E2E.

- El que dibuja: Pokémon secreto en `Panel` (solo en su DOM), lienzo dentro de un `Panel` que escala, herramientas como
  `Pill`s/`Segmented` (lápiz, goma, grosor, deshacer, borrar con `Dialog` si hoy confirma), paleta con nombre de color.
- Los que adivinan: lienzo en vivo, buscador e intentos del kit de adivinar de F6, orden de turnos en texto, revelación.
- [ ] Tests (privacidad, herramientas como funciones puras) → implementar → verde → E2E `juegos -g "sketchmon"` → capturas.
- [ ] Commit `Arcade DS F8: Sketchmon con el catálogo` (+ rúbricas).

### Task 2: Kit de subasta + Pokémon Team Auction

**Files:** Create `frontend/src/room/auction-kit/` (`AuctionLot`, `BidControls`, `BudgetPlate`, `BidHistory`,
`AuctionScreen` y CSS Modules; `index.ts`) con tests; Modify `PokemonTeamAuctionGame.tsx`, `PokemonTeamAuctionResults.tsx`,
`games/pokemon-team-auction/*`, E2E.

- Lote en `Card` con el Pokémon y sus datos, puja actual y líder, presupuesto propio y de rivales, controles de puja
  (incrementos como `Pill`s con atajos, campo numérico, «Pasar»), historial en `Row`s, equipos en el lateral con `Tabs` o
  `Row` + `Dialog`; temporizador del lote; adjudicación con `Cutin` o banda.
- [ ] Tests del kit (presupuesto, límites, bloqueo) → implementar → verde → E2E `juegos -g "pokemon-team-auction"` → capturas.
- [ ] Commit `Arcade DS F8: kit de subasta y Team Auction con el catálogo` (+ rúbricas).

### Task 3: Pokémon Bluff Auction

**Files:** `PokemonBluffAuctionGame.tsx`, `PokemonBluffAuctionResults.tsx`, `games/pokemon-bluff-auction/*`, E2E.

- Sobre el kit de subasta: condición de la ronda, lista de subasta por jugador, pujas, fase de búsqueda de Pokémon con el
  buscador, demostración con métricas (`Bar`s con número en texto) y resultado de la ronda con quién cumplió.
- [ ] Tests → implementar → verde → E2E `juegos -g "pokemon-bluff-auction"` → capturas.
- [ ] Commit `Arcade DS F8: Bluff Auction con el catálogo` (+ rúbricas).

### Task 4: Quién es Quién Pokémon

**Files:** `WhoIsWhoPokemonGame.tsx`, `WhoIsWhoPokemonResults.tsx`, `who-is-who-cursor-*`, `games/who-is-who-pokemon/*`, E2E.

- Tablero de `Card`s seleccionables para bajar/levantar (estado en texto y `aria-pressed`, no solo atenuado), cursores del
  equipo sin tapar controles, panel del secreto propio, turno y preguntas en texto, diálogo «Adivinar Pokémon» con el
  catálogo; resultados con `ResultsShell`. La insignia «SECRETO» de 10 px pasa a ≥13 px.
- [ ] Tests → implementar → verde → E2E `juegos -g "who-is-who"` → capturas.
- [ ] Commit `Arcade DS F8: Quién es Quién con el catálogo` (+ rúbricas).

### Task 5: Verificación (controlador)

- [ ] Suite E2E completa; revisar capturas de los 4 juegos; revisión final; arreglos; fusión en `main` y push.
