# Arcade DS F3: Armazón y páginas públicas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Primera fase visible del rediseño: la cabecera como placas de HUD, el armazón de pantalla completa y las páginas
públicas (Inicio, Acceso, Jugar, Novedades, Perfil con el editor de avatar y Feedback) construidas solo con el catálogo de
`frontend/src/ui/`.

**Architecture:** `Layout` pasa a una rejilla de `100dvh` (cabecera + `main` con `min-h-0`). Cada página rediseñada cabe
entera en escritorio (1280×720 y 1920×1080) sin scroll de página ni de `main`: las listas se desplazan dentro de su
`Panel`. Las rutas que todavía no se rediseñan (sala y administración) conservan el scroll dentro de `main` hasta su fase.
Las pantallas usan componentes del catálogo y Tailwind solo para maquetar (grid, flex, gap, breakpoints).

**Tech Stack:** React 19, React Router 7, catálogo `frontend/src/ui/` (F1), audio (F2), Tailwind 3 para maquetar,
Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` §1, §2 (disposición híbrida), §4, §6 (Cabecera;
Inicio, Acceso y Jugar), §7, §9, §10 (rúbrica).

## Global Constraints

- Solo componentes del catálogo (`Pill`, `Panel`, `HudPlate`, `Tabs`, `Segmented`, `Field`, `TextArea`, `Toggle`,
  `Badge`, `Chip`, `StateBox`, `Dialog`, `ToastStack`, `Icon`, `Row`, `Card`…). Si una pantalla necesita una pieza nueva,
  entra antes en `frontend/src/ui/` con su figura en la galería. Nada de `btn-*`, `card`, `chip`, `field`, `panel` ni
  colores de alias (`text-ink/…`, `bg-berry`…) en las páginas rediseñadas.
- Texto ≥13 px (escala `text-13`…`text-68`); objetivos táctiles ≥44 px; foco visible.
- Escritorio (≥1024 px): sin scroll de página ni de `main` a 1280×720 ni a 1920×1080 en las páginas de esta fase; contenido
  limitado a 1600 px; a 1920 el espacio sobrante se aprovecha o queda limpio a propósito. Móvil (390×844): columna, scroll
  permitido solo si el contenido lo exige (formularios largos), sin scroll horizontal.
- Transición de pantalla al cambiar de ruta: opacidad + `translateY(8px)` en `--t-screen` (220 ms), con reducción de
  movimiento solo opacidad 120 ms, y nada con `body.static`.
- Textos en español; los errores del servidor se muestran en español (nunca «Invalid email or password»).
- Cada pantalla rediseñada lleva rúbrica (spec §10) ≥19/24 sin ningún 0, anotada en el commit de sus capturas.
- Los E2E existentes siguen localizando por rol y nombre accesible; si un nombre cambia, se actualiza el spec en el mismo
  commit.

## Review Focus

1. **Usuario invitado vs. registrado vs. administrador en la cabecera**: cada uno ve sus placas (perfil solo USER,
   administración solo ADMIN, nombre del invitado), y a 390 px nada se sale ni se solapa. E2E `inicio` a 3 tamaños con los
   tres tipos.
2. **Avisos con un diálogo abierto** (pendiente de F1): un aviso lanzado mientras hay un `Dialog` modal abierto se ve, se
   anuncia y se puede cerrar. Test en la galería (E2E) y unitario del portal.
3. **Error del servidor en Acceso** (credenciales incorrectas, nombre ocupado, red caída): mensaje en español junto al
   campo o en un `StateBox`, foco en el error. Test de la función de traducción de errores.
4. **Novedades sin entradas o con error de carga**: `StateBox` vacío o de error con «Reintentar». Test.
5. **Ruta lenta (lazy) entre páginas**: el `Suspense` muestra un esqueleto del catálogo dentro del armazón, sin saltos de
   la cabecera.

---

### Task 1: Armazón: cabecera de placas, rejilla 100dvh, transición, avisos sobre diálogos y ScreenSplit

**Files:**
- Modify: `frontend/src/components/Layout.tsx` (AppHeader y Layout), `frontend/src/components/LoadingFallback.tsx`,
  `frontend/src/ui/Toast.tsx` (+ test), `frontend/src/ui/ScreenSplit.module.css`, `frontend/src/ui/dev/Gallery.tsx`,
  `e2e/tests/inicio.spec.ts`.
- Create: `frontend/src/ui/ScreenTransition.tsx` (+ `.module.css`) y, si hace falta, `frontend/src/components/AppToasts.tsx`.

**Interfaces:**
- Produces:
  - `AppHeader`: dos `HudPlate`. Izquierda: logotipo («Pokémon Universe» con `.ol2`, `text-26`; «PU» en <640 px) como
    enlace a inicio y `AudioButton`. Derecha: `Pill round` de Novedades con `Badge` de no leídas, `Pill` de
    Administración (solo ADMIN), placa de perfil (avatar + nombre con `title`, solo USER; nombre del invitado), `Pill round`
    ghost de cerrar sesión. Mantiene `HEADER_NOTICES_ID` debajo de las placas y los nombres accesibles actuales.
  - `Layout`: `grid h-[100dvh] grid-rows-[auto_minmax(0,1fr)]`; `main` con `min-h-0` y `overflow-y-auto` (para las rutas
    aún no rediseñadas); el pie legal pasa a una línea `text-13` dentro de las páginas que lo muestran (Inicio y Acceso), no
    en el armazón.
  - `ScreenTransition({ routeKey, children })`: envuelve el `Outlet`; anima la entrada de cada ruta nueva.
  - `RouteLoadingFallback`: `StateBox kind="loading"` dentro de un `Panel`.
  - `ToastStack`: cuando hay un `<dialog open>` modal, el contenedor del aviso se monta dentro de ese diálogo (portal al
    último `dialog[open]`), así se ve, se anuncia y se puede cerrar; sin diálogo, el `popover` de siempre. Función pura
    `toastHost(doc): Element | null` probada.
  - `ScreenSplit`: `min-height: 100%` del padre en lugar de `100dvh`.

- [ ] **Step 1: Tests.** `Toast.test.tsx` › `toastHost` devuelve el último `dialog[open]` o `null`. E2E: `inicio.spec.ts`
  › cabecera de invitado, de USER y de ADMIN a los 3 tamaños (`capture` con `minFontPx: 13`), y en la galería: aviso con
  diálogo abierto visible y cerrable con su botón.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `npm test -w @pokemon-universe/web`, typecheck, lint, build.
- [ ] **Step 5:** Commit `Arcade DS F3: cabecera de placas, armazón de pantalla completa y avisos sobre diálogos`.

### Task 2: Inicio (pantalla de título)

**Files:** Modify `frontend/src/screens/HomePage.tsx` (y lo que use de `changelog/`), `e2e/tests/inicio.spec.ts`.

- Diseño: pantalla de título. A la izquierda (arriba en móvil) el logotipo grande (imagen actual del planeta + «Pokémon
  Universe» en `text-68` con `.ol2`; `text-44` en móvil) y una frase; debajo, la pila de píldoras: «Empezar a jugar»
  (`Pill yellow main` → `/play` o `/auth`), «Entrar como invitado» (`Pill cream`). A la derecha (abajo en móvil), un
  `Panel` «Lo último en el universo» con la última entrada de Novedades y su `StateBox` vacío/error; enlace «Ver todas»
  (`Pill ghost small`). Pie legal en `text-13` al fondo.
- Sin scroll a 1280×720 y 1920×1080. Test unitario: el panel de novedades muestra `StateBox` vacío sin entradas y de
  error con «Reintentar».
- [ ] Tests → FAIL → implementar → verde + typecheck + lint + build.
- [ ] Commit `Arcade DS F3: inicio como pantalla de título`.

### Task 3: Acceso

**Files:** Modify `frontend/src/screens/AuthPage.tsx`, `frontend/src/auth/` (formularios, si viven ahí), `e2e/tests/acceso.spec.ts`.
Create `frontend/src/auth/authErrors.ts` (+ test).

- Diseño: `Panel` crema centrado (ancho máx. 520 px) con la Poké Ball y «Qué bueno verte», `Tabs` Entrar · Registro ·
  Invitado, `Field`s, `Pill yellow` de envío a todo el ancho y el error del servidor como `Field` con error (campo
  concreto) o `StateBox kind="error"` dentro del panel; foco al error.
- `authErrorMessage(code | message): string` traduce los errores del backend (credenciales, correo ocupado, nombre
  ocupado, validación, red) a español; test con cada caso y uno desconocido.
- [ ] Tests → FAIL → implementar → verde.
- [ ] Commit `Arcade DS F3: acceso con pestañas y errores en español`.

### Task 4: Jugar (crear o unirse a sala)

**Files:** Modify `frontend/src/screens/PlayPage.tsx`, sus E2E (`sala.spec.ts` usa esta pantalla).

- Diseño: dos `Panel`s lado a lado en escritorio (apilados en móvil): «Crear sala» (texto breve + `Pill yellow main`
  «¡Crear sala!») y «Unirse con código» (`Field` de código en mayúsculas con 6 casillas visuales o un campo grande
  `text-26` con espaciado, y `Pill blue`). Estados de carga en la píldora (`loading`) y errores en el campo.
- [ ] Tests unitarios de lo que tenga lógica (normalizar código) → implementar → verde.
- [ ] Commit `Arcade DS F3: jugar con crear sala y unirse por código`.

### Task 5: Novedades, Perfil (con editor de avatar) y Feedback

**Files:** Modify `frontend/src/screens/ChangelogPage.tsx`, `frontend/src/changelog/ChangelogEntryView.tsx`,
`frontend/src/screens/ProfilePage.tsx`, `frontend/src/components/AvatarEditor.tsx`, `frontend/src/screens/FeedbackPage.tsx`,
sus tests y E2E (`contenido-y-admin.spec.ts`, el de novedades si existe).

- Novedades: lista y detalle. Escritorio: `Panel` lista (versiones con fecha y `Badge` «Nueva» si no leída) a la izquierda
  con scroll interno y `Panel` crema de detalle a la derecha; móvil: lista y al tocar, detalle con «Volver».
- Perfil: placa con avatar grande (`Pill round` de cámara para el editor), nombre en `text-34` `.ol2` y miembro desde; a la
  derecha (abajo en móvil) estadísticas en `Panel` con `Row`s por juego (scroll interno). Editor de avatar ya en `Dialog`
  (F1): su contenido pasa a componentes del catálogo (`Card` seleccionable para los avatares predefinidos, `Pill` para
  subir).
- Feedback: `Panel` crema con `Segmented` del tipo (Bug · Sugerencia · Otro, o los tipos actuales), `SelectField` del
  minijuego si aplica, `TextArea` con contador y `Pill yellow` «Enviar»; confirmación con aviso (`ToastStack`) y error
  con `StateBox`.
- [ ] Tests de lo que cambie de lógica → implementar → verde.
- [ ] Commit `Arcade DS F3: novedades, perfil y feedback con el catálogo`.

### Task 6: Verificación (controlador)

- [ ] Borrar `backend/.micronaut/test-resources` antes de cada E2E. `npx playwright test inicio acceso sala contenido-y-admin galeria audio`.
- [ ] Revisar las capturas de cada página a los 3 tamaños; puntuar con la rúbrica (spec §10) Inicio, Acceso, Jugar,
  Novedades, Perfil y Feedback; arreglar lo que baje de 19 o tenga un 0.
- [ ] Commit de capturas con las rúbricas; revisión final, arreglos, fusión en `main` y push.
