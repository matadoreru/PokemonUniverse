# Arcade DS F9: Administración y limpieza — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el rediseño Arcade DS: la administración con el catálogo, las últimas piezas heredadas fuera, el CSS
antiguo y los alias de Tailwind borrados, reglas de lint y de E2E que impidan volver atrás, y la documentación al día.

**Architecture:** Tras F8 los 28 juegos usan el catálogo. Lo heredado que queda vive en la administración
(`screens/AdminPage.tsx`, `admin/AdminChangelogPanel.tsx`, `admin/AdminFeedbackPanel.tsx`), `GenerationSelector` (lo usan
los `ConfigPanel`), `LoadingFallback`, la vista previa de rotación de `GameSelectionConfig` y el `.timer-pulse` de Learnset.
Se migran primero (Tasks 1–2); después se borra todo lo heredado de `styles.css`, los alias de color de
`tailwind.config.js` y la remezcla `.on-cream`, y se añaden las reglas que lo vigilan (Task 3); la Task 4 endurece el
medidor del E2E y actualiza los documentos. La lista de clases muertas y vivas está en la revisión final de F8 (copiada
en el ledger de este plan).

**Tech Stack:** React 19, catálogo `frontend/src/ui/`, Tailwind solo para maquetar, ESLint (flat config
`eslint.config.mjs`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` (§2 páginas largas en lista y detalle, §3, §4,
§9, §10, §11).

## Global Constraints

- Solo componentes del catálogo y tokens; texto ≥13 px; objetivos ≥44 px; movimiento solo `transform`/`opacity`.
- Administración (spec §2): lista y detalle, cada uno con su propio scroll; escritorio sin scroll de página a 1280×720 y
  1920×1080; móvil 390×844 usable (lista → detalle).
- Ningún cambio de comportamiento: la administración hace las mismas llamadas (`/api/admin/*`) con los mismos permisos.
- Ningún cambio en `packages/shared` ni en `backend/`.
- **Carga de la máquina:** el usuario puede estar jugando. Solo los E2E de lo tocado, con `--workers=1` y pocas
  ejecuciones; la suite completa solo en la Task 5 y con aviso al usuario. Si los puertos 8080/5173 están ocupados,
  esperar: no matar nada. Antes de cada ejecución `rm -rf backend/.micronaut/test-resources`.
- Rúbrica (spec §10) ≥19/24 sin ningún 0 en cada pantalla rediseñada, en el commit.
- `MINIJUEGOS_MEJORAS.md` no está versionado (es del usuario): se edita en el árbol pero no se añade a ningún commit.

## Review Focus

1. **Clases borradas que alguien seguía usando**: tras borrar, ningún `className` apunta a una clase inexistente (test que
   compara las clases usadas en `.tsx` con las definidas).
2. **Diálogos crema sin `.on-cream`**: el texto dentro de `Dialog`/`Panel` crema sigue legible al quitar la remezcla.
3. **Administración con datos largos o vacíos**: listas vacías con `StateBox`, errores con «Reintentar», paginación.
4. **Lint sin falsos positivos**: las reglas nuevas no marcan el catálogo `ui/` ni los estilos permitidos.
5. **E2E con el medidor endurecido**: las capturas existentes siguen pasando con `minFontPx` 13 y sin scroll de página.

---

### Task 1: Administración

**Files:** `frontend/src/screens/AdminPage.tsx`, `frontend/src/admin/*`, sus tests, `e2e/tests/contenido-y-admin.spec.ts`
(y el spec de admin que exista), capturas `admin-*`.

- Lista y detalle con `ScreenSplit`/`Panel`s y scroll propio; resumen con cifras en `HudPlate`/`Badge`; tablas como `Row`s
  o tabla con estilos del catálogo; filtros con `Segmented`/`Field`; acciones con `Pill` y confirmaciones con `Dialog`;
  estados vacío/carga/error con `StateBox`. Changelog y feedback con el catálogo.
- [ ] Tests → implementar → verde → E2E de admin (`--workers=1`) → capturas a 3 tamaños.
- [ ] Commit `Arcade DS F9: administración con el catálogo` (+ rúbricas).

### Task 2: Últimas piezas heredadas y pendientes de F5–F8

**Files:** `components/GenerationSelector.tsx`, `components/LoadingFallback.tsx`, `room/GameSelectionConfig.tsx` (vista
previa de rotación), `games/learnset-guess/LearnsetGuessParts.tsx` (`.timer-pulse`), y los pendientes:
`room/SketchmonCanvas.tsx:194` (no dibujar sin `canDraw`), `games/sketchmon/presentation.ts:209` (re-anunciar error
repetido), placa de Team Auction a 390 en la adjudicación, historial vacío alto de Bluff a 1920, etiqueta del cursor de
Quién es Quién sobre «Bajada», código muerto (`otherTeam`, `currentBidText`), «Ver clasificación final» coherente,
`seleccionarJuego` en `e2e/src/helpers.ts` con `toPass` (falló una vez de forma intermitente).

- `GenerationSelector` con `Chip`s/`Toggle`s del catálogo (una vez, sirve a todos los `ConfigPanel`).
- [ ] Tests → implementar → verde → E2E de los juegos tocados y `sala` (`--workers=1`).
- [ ] Commit(s) `Arcade DS F9: …` por bloque.

### Task 3: Borrado de lo heredado y lint

**Files:** `frontend/src/styles.css`, `frontend/tailwind.config.js`, `eslint.config.mjs`, usos de `.on-cream`, tests.

- Borrar de `styles.css` todas las clases heredadas (`btn*`, `card`, `chip`, `field`, `label`, `panel`, `page-shell`,
  `status-error`, `empty-state`, `skeleton` si se sustituye, `step-number`, `ranking-row`, `reveal-pop`, `timer-pulse`, …) y
  sus keyframes; quitar los alias de color de `tailwind.config.js` y la remezcla `.on-cream`.
- Test que falla si un `className` de `frontend/src/**/*.tsx` nombra una clase global inexistente.
- Lint: prohibir valores arbitrarios de color, tamaño de letra y `z-` en `className` (`text-[…]`, `bg-[#…]`, `z-[…]`…) y los
  alias de color; prohibir pintar componentes de `lucide-react` directamente fuera de `ui/` (deben ir por `Icon` o la prop
  `icon`). Cero avisos.
- [ ] Tests → implementar → `npm run lint` y `npm test` verdes → E2E `galeria inicio` (`--workers=1`).
- [ ] Commit `Arcade DS F9: fuera el CSS heredado y lint del sistema`.

### Task 4: Medidor del E2E y documentación

**Files:** `e2e/src/layout.ts`, `e2e/src/helpers.ts`, `AGENTS.md`, `docs/visual-review.md`, `e2e/README.md`,
`MINIJUEGOS_MEJORAS.md` (sin commit).

- `measureLayout`/`capture`: `minFontPx` 13 y comprobación de scroll de página en escritorio por defecto; las opciones
  explícitas que repiten el valor por defecto se quitan.
- `AGENTS.md`: reglas de UI del sistema Arcade DS (catálogo, tokens, 13 px, 44 px, lint). `docs/visual-review.md`: el
  criterio «Tokens y temas» pasa a «Relieve y color». `MINIJUEGOS_MEJORAS.md` §1.8/§11.1: la hipótesis Arcade DS resuelta.
- [ ] Verificación con los specs de E2E más afectados (`--workers=1`) → commit `Arcade DS F9: medidor del E2E y documentación`.

### Task 5: Verificación (controlador)

- [ ] Avisar al usuario y lanzar la suite E2E completa; revisión final; arreglos; fusión en `main` y push.
