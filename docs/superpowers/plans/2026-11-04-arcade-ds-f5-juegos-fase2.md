# Arcade DS F5: Los 6 juegos de la Fase 2 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar con el catálogo Arcade DS la pantalla de juego, sus resultados y su `ConfigPanel` de Pokédex Distance,
Shiny Quiz, Pokémon Impostor, Higher or Lower, Type Duel y Learnset Guess, sin cambiar su lógica ni sus motores.

**Architecture:** Cada juego vive en `frontend/src/room/<Nombre>Game.tsx` (+ `<Nombre>Results.tsx`) y
`frontend/src/games/<id>/` (`ConfigPanel.tsx` y piezas propias). Se rehacen con los componentes de `frontend/src/ui/` y las
piezas compartidas de F4 (`PokemonSelector`, `ServerTimer`, `ResultsShell` con `standings`/`podium`, `playerColor`,
`SessionScreen`/`ScreenSplit`, `Cutin`, `Card`, `Row`, `Bar`, `Badge`). La revelación de cada juego (Fase 2 de minijuegos)
conserva su comportamiento y sus tiempos; cambia su aspecto.

**Tech Stack:** React 19, catálogo `frontend/src/ui/`, audio (F2), Tailwind solo para maquetar, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` §2 (pantalla doble: arriba se mira, abajo se
actúa; columna lateral en escritorio), §4, §6 «Juegos», §7, §8, §9, §10.

## Global Constraints

- Solo componentes del catálogo y tokens en lo rediseñado: nada de `btn-*`, `card`, `chip`, `field`, `panel`,
  `session-card*`, `ranking-row*`, `shiny-*`/`pokeddle-*` heredados que se sustituyan, ni colores alias (`text-ink/…`,
  `bg-berry`…); texto ≥13 px; objetivos ≥44 px; movimiento solo `transform`/`opacity` con reducción y `body.static`.
- Disposición de juego (spec §2/§6): en escritorio (≥1024 px) sin scroll de página ni de `main` a 1280×720 y 1920×1080 —
  zona principal (pista/escena + acción) y columna lateral (marcador/jugadores) con `SessionScreen`/`ScreenSplit`; en móvil
  (390×844) pantalla superior (estado, pista, temporizador) y pantalla inferior pegada al fondo (acción, buscador).
- Un dueño por error: los fallos de comandos del servidor ya salen traducidos en el aviso global de la sala (F4); la pantalla
  del juego no repite `caught.message` en línea, solo muestra sus validaciones previas.
- Lógica, motores, proyecciones y privacidad intactos: ningún cambio en `packages/shared` ni en `backend/` salvo que un test
  lo exija (no se espera). Los textos visibles se mantienen salvo para corregirlos.
- E2E: los specs de cada juego (`e2e/tests/juegos.spec.ts`) siguen localizando por rol y nombre; si un nombre cambia, se
  actualiza en el mismo commit. Capturas de cada pantalla del juego a 1280×720, 1920×1080 y 390×844 con
  `capture(…, { minFontPx: 13, noPageScroll: true })` en escritorio. Antes de cada ejecución: puertos 8080/5173 libres y
  `rm -rf backend/.micronaut/test-resources`.
- `ConfigPanel` de cada juego: controles del catálogo (`Segmented`, `Toggle`, `Slider`/`ConfigRange`, `Chip`/`Card`
  seleccionables), sin depender de la remezcla `.on-cream` de alias.
- Rúbrica (spec §10) ≥19/24 sin ningún 0 por pantalla (juego, revelación, resultados), en el mensaje del commit.

## Review Focus

1. **Revelaciones con sus tiempos** (cut-in de Distance, giro de Shiny, VS de Type Duel, barras de Higher or Lower,
   expulsión de Impostor con el rol tras 1 s, pistas de Learnset): mismo orden y duración, sin filtrar información antes de
   tiempo (rol del impostor fuera del DOM antes de 1 s, número de Pokédex oculto).
2. **Espectadores y jugadores desconectados** en cada juego: ven la pantalla sin controles de acción y con su estado en texto.
3. **Móvil a 390×844 con el teclado del buscador abierto**: la acción y el buscador siguen accesibles.
4. **Empates y rondas sin respuesta** en los resultados: sin `NaN`, sin coronas con 0 puntos, «Sin respuesta» en texto.
5. **Reducción de movimiento**: todas las revelaciones se ven completas sin animar.

---

### Task 1: Pokédex Distance

**Files:** `frontend/src/room/PokedexDistanceGame.tsx`, `DistanceRuler.tsx`, `PokedexDistanceResults.tsx`,
`frontend/src/games/pokedex-distance/*`, specs y capturas `juego-pokedex-distance-*`.

- Pantalla superior: objetivo («Objetivo #N» grande con `.ol2`), ronda, `ServerTimer`, quién ha elegido (`Chip`s); inferior:
  `PokemonSelector` y elección bloqueada; lateral: marcador con `Row`s y `playerColor`. Revelación: regla numérica con
  marcadores del color de cada jugador, acierto exacto con `Cutin` (ya existe), resultados de ronda en `Row`s.
- Resultados: `ResultsShell` con `standings` y las métricas propias (distancia por ronda, mejor acierto, desempates).
- [ ] Tests de lo que cambie → implementar → verde → E2E `juegos -g "pokedex-distance"` → capturas revisadas.
- [ ] Commit `Arcade DS F5: Pokédex Distance con el catálogo` (+ rúbricas).

### Task 2: Shiny Quiz

**Files:** `frontend/src/room/ShinyVoteGame.tsx`, `ShinyVoteResults.tsx`, `frontend/src/games/shiny-vote/*`
(`ShinyOptionCard`, `ShinyGameSidebar`, `ShinyVoteStatus`, `ShinyGameHeader`, `ConfigPanel`), estilos `.shiny-*` de
`styles.css` (se retiran los que dejen de usarse), specs y capturas `juego-shiny-*`.

- Cartas de opción como `Card` (estado seleccionable/seleccionada/correcta/incorrecta/revelándose con giro), votos con
  `Badge`, temporizador, barra lateral de marcador con `Row`s, revelación con el antes y el después.
- [ ] Tests → implementar → verde → E2E `juegos -g "shiny"` → capturas.
- [ ] Commit `Arcade DS F5: Shiny Quiz con el catálogo` (+ rúbricas).

### Task 3: Pokémon Impostor

**Files:** `frontend/src/room/PokemonImpostorGame.tsx`, `PokemonImpostorResults.tsx`,
`frontend/src/games/pokemon-impostor/*`, el `.session-card` que solo usa este juego, specs y capturas `juego-pokemon-impostor-*`.

- Fases (rol, pistas, votación, eliminación, resultado) con `Panel`s; pistas en `Row`s; votación con `Card`s/`Pill`s de
  jugador; eliminación con el `Cutin` y el rol tras 1 s (sin cambiar los tiempos ni lo que entra en el DOM); resultados con
  equipos y ganador.
- [ ] Tests → implementar → verde → E2E `juegos -g "pokemon-impostor"` → capturas.
- [ ] Commit `Arcade DS F5: Pokémon Impostor con el catálogo` (+ rúbricas).

### Task 4: Higher or Lower

**Files:** `frontend/src/room/HigherLowerGame.tsx`, `HigherLowerResults.tsx`, `frontend/src/room/higher-lower-labels.ts`,
`frontend/src/games/higher-lower/*`, specs y capturas `juego-higher-lower-*`.

- Dos `Card`s de Pokémon (el segundo con «???» hasta revelar), `Pill`s «Mayor / Igual / Menor» (atajos 1–3 como insignia),
  barras comparadas con `Bar`, rachas con `Badge`, `ScorePop` en los aciertos; marcador lateral.
- [ ] Tests → implementar → verde → E2E `juegos -g "higher-lower"` → capturas.
- [ ] Commit `Arcade DS F5: Higher or Lower con el catálogo` (+ rúbricas).

### Task 5: Type Duel

**Files:** `frontend/src/room/TypeDuelGame.tsx`, `TypeDuelResults.tsx`, `frontend/src/games/type-duel/*`, specs y
capturas `juego-type-duel-*`.

- Elección de tipo con `TypeBadge`s seleccionables (los 18), VS con `Cutin`/losa de enfrentamiento y número de soluciones,
  buscador para la combinación, marcador lateral.
- [ ] Tests → implementar → verde → E2E `juegos -g "type-duel"` → capturas.
- [ ] Commit `Arcade DS F5: Type Duel con el catálogo` (+ rúbricas).

### Task 6: Learnset Guess

**Files:** `frontend/src/room/LearnsetGuessGame.tsx`, `LearnsetGuessResults.tsx`, `frontend/src/games/learnset-guess/*`,
specs y capturas `juego-learnset-*`.

- Pistas de movimientos como `Row`s/`Chip`s que entran de una en una, «Ahora vale N pts» con `Badge`, buscador, marcador en
  vivo lateral con quién ha acertado.
- [ ] Tests → implementar → verde → E2E `juegos -g "learnset"` → capturas.
- [ ] Commit `Arcade DS F5: Learnset Guess con el catálogo` (+ rúbricas).

### Task 7: Verificación (controlador)

- [ ] Suite E2E completa; revisar capturas de los 6 juegos; revisión final; arreglos; fusión en `main` y push.
