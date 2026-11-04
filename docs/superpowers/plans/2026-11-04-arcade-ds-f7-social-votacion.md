# Arcade DS F7: Los 6 juegos sociales y de votación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar con el catálogo Arcade DS la pantalla de juego, sus fases, la revelación, los resultados y el
`ConfigPanel` (con sus gestores de contenido propio) de Most Likely To, Pokémon Red Flag, Would You Rather, One of Us Is
Fake, Secret Ranking y Poké Taboo, sin cambiar su lógica ni sus motores.

**Architecture:** Estos juegos repiten piezas en cada archivo: la barra de fases (`StageRail`), el progreso de quién ha
respondido/votado (`PlayerProgress`), la papeleta con segunda vuelta (`useRunoffVote`) y la revelación con recuento. La Task 1
las saca a un kit `frontend/src/room/social-kit/` hecho con el catálogo y migra Most Likely To como referencia; el resto se
construye encima. Se reutilizan las piezas de F5/F6: `ScreenSplit`, `GameSkipSlot`, `ResultsShell`
(`standings`/`aside`/`actions`/`fillLarge`), `ResultsRecords`, `Row` (`highlight`, `disconnected`), `Card` (`data-part`),
`Bar`, `Badge`, `Dialog`, `Tabs`, `focus-transition`, `ignoreFailure` y los ayudantes E2E de `juegos.spec.ts`.

**Tech Stack:** React 19, catálogo `frontend/src/ui/`, audio (F2), Tailwind solo para maquetar, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` §2, §4, §6 «Juegos», §7, §8, §9, §10.

## Global Constraints

- Solo componentes del catálogo y tokens en lo rediseñado (nada de `btn-*`, `card`, `chip`, `label`, `field`, `panel`,
  `reveal-pop`, `timer-pulse` heredados ni colores alias `text-ink/…`, `bg-berry`, `text-leaf`, `text-electric`…); texto
  ≥13 px; objetivos ≥44 px; movimiento solo `transform`/`opacity` con reducción y `body.static`; sin emojis de medalla.
- Disposición: escritorio (≥1024 px) sin scroll de página ni de `main` a 1280×720 y 1920×1080, zona principal (pregunta +
  acción) y columna lateral (jugadores/progreso/marcador); a 1920 la pantalla se llena. Móvil 390×844: arriba fase,
  pregunta y temporizador; abajo la acción (papeleta, escritura, buscador); lo necesario para actuar se ve sin desplazar
  (aserción `toBeInViewport`).
- Privacidad: los votos, respuestas escritas y elecciones secretas de otros no entran en el DOM antes de su fase de
  revelación (test de render por juego); en los juegos anónimos (Red Flag, One of Us Is Fake) la autoría tampoco.
- Un dueño por error (`ignoreFailure`); una sola región viva por pantalla; el foco no cae al `body` al cambiar de fase.
- Lógica, motores, proyecciones intactos: ningún cambio en `packages/shared` ni en `backend/`.
- Cada juego en `GAMES_WITH_SKIP_IN_SCREEN` con `<GameSkipSlot/>`.
- Funciones de la pantalla antigua: si una se quita o cambia, se lista en el informe y se restaura salvo que la tarea diga
  otra cosa.
- `ConfigPanel` y gestores de contenido propio (`CustomCategoryManager`, `CustomPromptManager` con importación JSON) con
  controles del catálogo (`Field`, `Pill`, `Toggle`, `Slider`/`ConfigRange`, `Row`, `Dialog`), sin `window.confirm`.
  `GenerationSelector` se deja para F9.
- E2E sin red: cada juego con un test propio que juega al menos una ronda hasta los resultados y captura juego, cada fase
  propia (votación, segunda vuelta si se puede forzar, revelación) y resultados a 1280×720, 1920×1080 y 390×844 con
  `capture(…, { minFontPx: 13, noPageScroll: true })` (`ARCADE`) y `sinScorePop` en resultados. Antes de cada ejecución:
  puertos 8080/5173 libres y `rm -rf backend/.micronaut/test-resources`.
- Rúbrica (spec §10) ≥19/24 sin ningún 0 por pantalla, en el mensaje del commit. Un commit por juego:
  `Arcade DS F7: <Juego> con el catálogo`.

## Review Focus

1. **Secreto de votos y autoría** hasta la revelación, también tras recargar a mitad de fase.
2. **Segunda vuelta (`REVOTE`) y empates**: la papeleta solo ofrece los empatados, el recuento final es claro y nadie ve
   «0 votos» como ganador.
3. **Jugadores que no responden o se desconectan**: el progreso lo dice en texto y la revelación muestra «Sin respuesta».
4. **Textos largos** (respuestas de Red Flag, pistas de Taboo, categorías propias): se ajustan sin romper filas ni desbordar.
5. **Móvil con el teclado abierto** en las fases de escritura (Red Flag, Taboo): el campo y el botón de enviar siguen a la vista.

---

### Task 1: Kit social + Most Likely To

**Files:** Create `frontend/src/room/social-kit/` (`PhaseRail`, `ResponseProgress`, `VoteBallot` con segunda vuelta,
`VoteTally`, `SocialScreen` y CSS Modules; `index.ts`) con tests; Modify `MostLikelyToGame.tsx`, `MostLikelyToResults.tsx`,
`games/most-likely-to/*`, `game-skip-slot.ts`, E2E.

- `PhaseRail`: fases del juego como `Badge`s/pasos con la actual marcada (no solo por color) y `aria-current="step"`.
- `ResponseProgress`: `Row`s de jugadores con «Respondió/Votó» o «Pendiente»/«Sin conexión» en texto, sin desvelar el qué.
- `VoteBallot`: opciones (jugadores o Pokémon) como `Card`/`Pill` seleccionables con `aria-pressed`, confirmación, voto
  bloqueado, modo segunda vuelta con solo los empatados; usa `useRunoffVote`.
- `VoteTally`: revelación con `Bar`s por opción, número en texto, ganador con `Badge`, empates explícitos.
- Most Likely To sobre el kit (pregunta en `Panel`, buscador de Pokémon donde lo use hoy); resultados con `ResultsShell`.
- [ ] Tests del kit (estados, privacidad, segunda vuelta) → implementar → verde → E2E `juegos -g "most-likely-to"` → capturas.
- [ ] Commit `Arcade DS F7: kit social y Most Likely To con el catálogo` (+ rúbricas).

### Task 2: Pokémon Red Flag y Would You Rather

**Files:** `PokemonRedFlagGame.tsx`, `PokemonRedFlagResults.tsx`, `games/pokemon-red-flag/*`, `WouldYouRatherGame.tsx`,
`WouldYouRatherResults.tsx`, `games/would-you-rather/*` (`CustomPromptManager`, `json-import`), E2E.

- Red Flag: Pokémon de la ronda en `Card`, escritura con `Field` (contador de caracteres, enviar visible con el teclado
  abierto), votación anónima sobre el kit, revelación con autoría y votos.
- Would You Rather: dos opciones grandes enfrentadas (`Card`s con atajos 1–2), progreso, revelación con `Bar`s y quién
  eligió qué; gestor de preguntas propias e importación JSON con el catálogo.
- [ ] Tests → implementar → verde → E2E `juegos -g "pokemon-red-flag|would-you-rather"` → capturas.
- [ ] Dos commits, uno por juego.

### Task 3: One of Us Is Fake

**Files:** `OneOfUsIsFakeGame.tsx`, `OneOfUsIsFakeResults.tsx`, `games/one-of-us-is-fake/*` (`CustomCategoryManager`), E2E.

- Fases (elección, revelación de elecciones, discusión, votación, segunda vuelta, resultado) sobre `PhaseRail`; categoría en
  `Panel` (el impostor ve su variante sin que el DOM de los demás la contenga), rejilla de elecciones con `Card`s, votación
  con el kit, resultado con quién era el falso; gestor de categorías propias con el catálogo.
- [ ] Tests → implementar → verde → E2E `juegos -g "one-of-us-is-fake"` → capturas.
- [ ] Commit `Arcade DS F7: One of Us Is Fake con el catálogo`.

### Task 4: Secret Ranking

**Files:** `SecretRankingGame.tsx`, `SecretRankingResults.tsx`, `games/secret-ranking/*`, E2E.

- Ordenar la lista con teclado y puntero (botones subir/bajar con nombre accesible, sin depender de arrastrar), estado de
  envío, consenso en la revelación con `Row`s y `Bar`s de distancia al consenso.
- [ ] Tests → implementar → verde → E2E `juegos -g "secret-ranking"` → capturas.
- [ ] Commit `Arcade DS F7: Secret Ranking con el catálogo`.

### Task 5: Poké Taboo

**Files:** `PokeTabooGame.tsx`, `PokeTabooResults.tsx`, `games/poke-taboo/*`, E2E.

- Descriptor con su Pokémon secreto y palabras prohibidas en `Panel` (solo en su DOM), redactor de pistas con `Field`,
  pistas en `Row`s, buscador para los que adivinan (kit de adivinar de F6 si encaja), intentos, orden de turnos y revelación.
- [ ] Tests → implementar → verde → E2E `juegos -g "poke-taboo"` → capturas.
- [ ] Commit `Arcade DS F7: Poké Taboo con el catálogo`.

### Task 6: Verificación (controlador)

- [ ] Suite E2E completa; revisar capturas de los 6 juegos; revisión final; arreglos; fusión en `main` y push.
