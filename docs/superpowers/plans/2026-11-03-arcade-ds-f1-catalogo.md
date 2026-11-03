# Arcade DS F1: Catálogo de componentes y galería — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el catálogo de componentes Arcade DS en `frontend/src/ui/`, con una galería en `/dev/ui` que los muestra en
todos sus estados, sin migrar todavía ninguna pantalla (salvo los 3 `modal-dialog`, que pasan a `Dialog`).

**Architecture:** Componentes React con CSS Modules que solo usan los tokens de `frontend/src/styles/tokens.css` (F0). No
llevan lógica de juego. Los sonidos de interfaz se piden con `uiSound(kind)` de `frontend/src/audio/uiSound.ts`, que en F1
no hace nada y en F2 se conecta al motor. La galería es una ruta lazy solo en desarrollo. Se portan los componentes de
Inazuma (`/home/eru/Documents/Projects/InazumaElevenManager/src/ui/components/`) sin teclas, escudos, retratos, escena ni
store.

**Tech Stack:** React 19, Vite 6 (CSS Modules), Tailwind 3 (solo para maquetar las pantallas, no dentro de `src/ui`),
Vitest 5 (`renderToStaticMarkup`, sin jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` (§3–§5, §7, §9).

## Global Constraints

- Cada componente vive en `frontend/src/ui/<Nombre>.tsx` y su CSS en `<Nombre>.module.css`; se reexporta en
  `frontend/src/ui/index.ts`. Dentro de `src/ui` no hay utilidades de Tailwind ni colores, tamaños o `z-index` literales:
  solo `var(--…)` de `tokens.css`.
- Tamaños de letra solo de la escala `--fs-13 … --fs-68`; nada por debajo de 13 px.
- Contornos: 3 px en paneles, píldoras, cartas y diálogos; 2,5 px en franjas; 2 px en insignias, chips y barras. Sombra
  dura `--sh-hard-*`, nunca animada.
- Objetivo táctil ≥44 px en todo lo pulsable; la píldora `small` (34 px visibles) amplía su área a 44 px con un
  pseudo-elemento o relleno.
- Movimiento: solo `transform` y `opacity`, duraciones de los tokens `--t-*` (que ya pasan a 0 con
  `prefers-reduced-motion` y `.static`). Pulsar una píldora: `translateY(4px)` y sombra `--sh-hard-1` en `--t-press`.
- Foco visible: anillo `--focus-ring` de 3 px con 2 px de separación (blanco sobre amarillo).
- Textos en español; comentarios en español; estilo del repo.
- Los interactivos cubren normal, hover, foco, pulsado y deshabilitado; la galería los fuerza con la prop `forced`
  (`'hover' | 'focus' | 'active'`), que solo usa la galería.

## Review Focus

1. **Diálogo cerrado con Esc o con clic fuera:** `onClose` se llama una sola vez y el foco vuelve al elemento que lo
   abrió. Test: `Dialog` › «devuelve el foco y avisa una vez» (función pura `dialogCloseReason(event)` + test del
   efecto con un `HTMLDialogElement` simulado).
2. **Toast encima de un diálogo abierto:** el `ToastStack` usa `popover="manual"` y se muestra con `showPopover()`, que
   lo pone en la capa superior por encima del `<dialog>`. E2E de la galería: abre el diálogo, lanza un aviso y comprueba
   que el aviso es visible y no está tapado (`elementFromPoint`).
3. **Píldora deshabilitada o cargando:** no llama a `onClick` ni a `uiSound`, sale del orden de tabulación y anuncia
   `aria-busy` al cargar. Test: `Pill` › «deshabilitada y cargando no responden».
4. **Pestañas con teclado:** flechas, Inicio y Fin mueven la pestaña activa y saltan las deshabilitadas. Test: función
   pura `nextTab(items, active, key)`.
5. **`RevealCutIn` sigue funcionando para los juegos de la Fase 2** con su API actual (tonos `electric|berry|aqua|leaf`,
   `delayedLine`, `delayedTone`, `holdMs`, región `status` viva al ocultarse). Sus tests actuales
   (`RevealCutIn.test.tsx`) siguen en verde sin cambios de aserciones, salvo nombres de clase.

---

### Task 1: Base del catálogo: `cx`, `uiSound`, `Icon`, `Pill`, `Panel` y `StateBox`

**Files:**
- Create: `frontend/src/ui/cx.ts`, `frontend/src/audio/uiSound.ts`, `frontend/src/ui/Icon.tsx`, `frontend/src/ui/Pill.tsx`
  + `.module.css` + `.test.tsx`, `frontend/src/ui/Panel.tsx` + `.module.css`, `frontend/src/ui/StateBox.tsx` +
  `.module.css` + `.test.tsx`, `frontend/src/ui/index.ts`.

**Interfaces:**
- Produces:
  - `cx(...parts: Array<string | false | null | undefined>): string`; `type ForcedState = 'hover' | 'focus' | 'active'`.
  - `type UiSoundKind = 'confirm' | 'tap' | 'cancel' | 'open' | 'close' | 'tab' | 'tick' | 'error' | 'move'`;
    `uiSound(kind: UiSoundKind): void` (en F1 vacío, con un comentario «lo conecta F2»);
    `setUiSoundSink(fn: ((kind: UiSoundKind) => void) | null): void` (para tests y para F2).
  - `Icon({ icon: LucideIcon, size?: 18 | 22 | 24 | 32, label?: string, className? })`: `strokeWidth` 2.5,
    `aria-hidden` salvo con `label` (entonces `role="img"` y `aria-label`), color `currentColor`.
  - `Pill(props: PillProps)`: `variant?: 'blue' | 'yellow' | 'red' | 'danger' | 'ghost' | 'cream'` (por defecto
    `blue`), `size?: 'std' | 'small' | 'main' | 'round'`, `icon?: LucideIcon`, `loading?`, `block?`, `badge?: string`
    (insignia de número en la esquina, para los atajos `1`–`4`), `forced?`, y el resto de atributos de `<button>`.
    Alturas: std 46, small 34 (área 44), main 60 (solo `red`/`yellow`, texto `--fs-26`), round 44×44. Sonido al pulsar:
    `tap` en `ghost` y `cream`; `confirm` en el resto. `red` solo con texto ≥24 px (main); `danger` es `--red-text` con
    texto blanco.
  - `Panel(props)`: `title?`, `right?`, `variant?: 'blue' | 'cream' | 'dark'`, `scroll?`, `flush?`, `status?: StateBoxProps | null`,
    `className?`, `bodyClassName?`, `as?: 'section' | 'div'`, y `aria-*`. Cabecera `--navy-3` de 40 px; rayas
    `--stripes-blue`/`--stripes-cream`; `cream` usa tinta `--ink`.
  - `StateBox(props: StateBoxProps)`: `kind: 'empty' | 'loading' | 'error'`, `title`, `text?`, `action?: { label: string; onClick(): void }`,
    `onCream?`. `loading` pinta un esqueleto de 3 filas que late con opacidad (el único bucle permitido, apagado con
    reducción de movimiento); `error` lleva `role="alert"` y su acción es una `Pill` `yellow` («Reintentar» la pone el
    que llama).

- [ ] **Step 1: Tests**
  - `Pill.test.tsx`: «usa el tono y el tamaño» (clases por variante y tamaño en el marcado); «deshabilitada y cargando
    no responden» (el `onClick` del elemento renderizado con `disabled`/`loading` no llama a la función ni a
    `uiSound`: prueba la función `pillClickHandler(props)` exportada, que devuelve `undefined` si está deshabilitada o
    cargando; con `setUiSoundSink` comprueba que una píldora `ghost` pide `tap` y una `yellow` pide `confirm`); «al cargar
    anuncia `aria-busy` y `tabindex=-1`».
  - `StateBox.test.tsx`: «error es una alerta con su acción»; «vacío y carga no son alertas»; «carga lleva el esqueleto
    con `aria-busy`».
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- ui/` → FAIL.
- [ ] **Step 3:** Implementar las interfaces de arriba, portando el CSS de Inazuma `Pill.module.css`, `Panel.module.css`
  y `StateBox.module.css` (sin teclas, sin `menu`, sin `dot`; valores literales cambiados por tokens).
- [ ] **Step 4:** Tests en verde; `npm run typecheck` y `npm run lint` en verde.
- [ ] **Step 5:** Commit `Arcade DS F1: píldora, panel y estados del catálogo`.

### Task 2: Controles: `Tabs`, `Segmented`, `Field`, `SelectField`, `TextArea`, `Slider`, `Toggle`

**Files:**
- Create: `frontend/src/ui/Tabs.tsx`, `Segmented.tsx`, `Field.tsx` (con `Field`, `SelectField`, `TextArea`),
  `Slider.tsx`, `Toggle.tsx`, sus `.module.css` y `Tabs.test.tsx`, `Field.test.tsx`; añadir a `index.ts`.

**Interfaces:**
- Consumes: `cx`, `uiSound`, `ForcedState` (Task 1).
- Produces:
  - `Tabs<K extends string>({ items: { key: K; label: ReactNode; icon?: LucideIcon; disabled?: boolean; badge?: ReactNode }[], active: K, onChange(k: K), label: string, idBase: string })`:
    `role="tablist"` con `aria-label`, cada pestaña `role="tab"`, `aria-selected`, `aria-controls={idBase}-panel-{key}`,
    foco itinerante (solo la activa con `tabIndex=0`), sonido `tab`. `TabPanel({ idBase, tabKey, children })` con
    `role="tabpanel"`. Función pura exportada `nextTab<K>(items, active: K, key: string): K | null` (flechas
    izquierda/derecha circulares, `Home`, `End`, salta deshabilitadas).
  - `Segmented<T extends string | number>({ value: T, options: { value: T; label: ReactNode; disabled?: boolean }[], onChange(v: T), label: string })`:
    `role="radiogroup"`, cada opción `role="radio"` con `aria-checked`, flechas con `nextTab` adaptado, sonido `tick`.
  - `Field({ label, error?, hint?, hideLabel?, ...input })`, `SelectField({ label, value, options: { value: string; label: string }[], onChange })`,
    `TextArea({ label, value, onChange, maxLength?, rows? })`: crema con contorno 3 px, etiqueta visible (o `sr-only`
    con `hideLabel`), `aria-invalid` y `aria-describedby` hacia el error; contador `n / max` en `TextArea`.
  - `Slider({ label, value, onChange, min, max, step, valueText?: (v: number) => string })`: `<input type="range">`
    con pista azul noche, relleno amarillo por `scaleX`, pulgar crema de 28 px con contorno; valor visible a la derecha
    de la etiqueta; sonido `tick` al cambiar.
  - `Toggle({ label, checked, onChange, hint? })`: interruptor `role="switch"` con `aria-checked`, sonido `tick`.

- [ ] **Step 1: Tests:** `Tabs.test.tsx` › `nextTab` (derecha en la última vuelve a la primera; `Home`/`End`; salta
  deshabilitadas; tecla ajena → `null`); marcado con `aria-selected` y `aria-controls`. `Field.test.tsx` › con `error`
  lleva `aria-invalid="true"` y `aria-describedby` apunta al id del error; `hideLabel` deja la etiqueta en `sr-only`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (portando Inazuma `Tabs`, `Segmented`, `Slider`, `Form`, y `Field`/
  `SelectField` de `Dialog.tsx`). **Step 4:** verde + typecheck + lint.
- [ ] **Step 5:** Commit `Arcade DS F1: pestañas, segmentos y campos de formulario`.

### Task 3: Datos y juego: `Badge`, `TypeBadge`, `Chip`, `Bar`, `Timer`, `Row`, `Card`, `HudPlate`

**Files:**
- Create: `frontend/src/ui/Badge.tsx` (con `Badge`, `TypeBadge`, `Chip`), `Bar.tsx`, `Timer.tsx`, `Row.tsx`, `Card.tsx`,
  `HudPlate.tsx`, sus `.module.css`, y `Badge.test.tsx`, `Bar.test.tsx`, `Timer.test.tsx`; añadir a `index.ts`.

**Interfaces:**
- Consumes: `cx`, `Icon` (Task 1); `typeColors`, `typeInk`, `PokemonType`, `inkOn` de `frontend/src/styles/tokens.ts`.
- Produces:
  - `Badge({ children, tone?: 'yellow' | 'navy' | 'cream' })`: insignia numérica o de estado, `--fs-13`, 2 px.
  - `TypeBadge({ type: PokemonType, label: string, size?: 'sm' | 'md' })`: fondo `var(--type-<t>)`, tinta
    `var(--type-<t>-ink)`, anillo blanco de 2 px si la tinta es blanca (F0 ya lo hace en `.type-badge`; aquí con tokens).
  - `Chip({ tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral', children, icon? })`: texto azul noche sobre el tono.
  - `Bar({ value, max, tone?: 'yellow' | 'ok' | 'bad' | 'info' | 'player', label: string, showValue?, valueText? })`:
    `role="meter"` con `aria-valuenow/min/max` y `aria-label`; relleno por `transform: scaleX(value/max)` con
    `transition` `--t-reveal`; función pura `barRatio(value, max): number` (0 si `max ≤ 0`, recortado a [0, 1]).
  - `Timer({ endsAt: number | null, now: number, totalMs: number, label?: string })`: placa con número grande
    (`--fs-26`, segundos redondeados hacia arriba) y `Bar` debajo; clase de urgencia en los 5 últimos segundos (pulso
    `scale(1.06)` alternado de 400 ms, único bucle además del esqueleto). Funciones puras `timerSeconds(endsAt, now)`
    y `timerUrgent(endsAt, now)`. No sustituye todavía a `ServerTimer` (eso es F4).
  - `Row({ rank?, avatar?: ReactNode, name: string, meta?: ReactNode, value?: ReactNode, color?: string, self?, disconnected?, children? })`:
    franja de 2,5 px, radio `--r-franja`, banda de 6 px a la izquierda con `color` (el del jugador), `self` en amarillo,
    `disconnected` con opacidad 0,6 y el texto «Sin conexión» además del color; nombre con elipsis y `title`.
  - `Card({ sprite?: string, name: string, number?: number, types?: { type: PokemonType; label: string }[], state?: 'idle' | 'selected' | 'correct' | 'wrong' | 'revealing', onSelect?(), children? })`:
    carta crema con contorno 3 px y radio 14; seleccionable como `<button>` con `aria-pressed`; `correct` con ✓ y texto
    «Correcta», `wrong` con ✗ y «Incorrecta» (el color nunca va solo); `revealing` gira (`rotateY(90deg) → 0` en
    `--t-reveal`).
  - `HudPlate({ children, side?: 'left' | 'right' })`: placa azul noche con radio `--r-hud`, contorno 3 px, sombra dura.

- [ ] **Step 1: Tests:** `Badge.test.tsx` › `TypeBadge` usa `--type-<t>` y su tinta para los 18 tipos (clase o estilo en
  el marcado); `Bar.test.tsx` › `barRatio` (0, negativo, mayor que max, max 0) y `role="meter"` con sus `aria-*`;
  `Timer.test.tsx` › `timerSeconds` redondea hacia arriba y no baja de 0; `timerUrgent` es verdadero en ≤5 s y falso
  con `endsAt` nulo.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** verde + typecheck + lint.
- [ ] **Step 5:** Commit `Arcade DS F1: insignias, barras, temporizador, franjas, cartas y placas del HUD`.

### Task 4: Capas: `Dialog`, `Toast`, `Cutin`, `ScorePop` y `ScreenSplit`; `RevealCutIn` sobre `Cutin`

**Files:**
- Create: `frontend/src/ui/Dialog.tsx`, `Toast.tsx` (con `ToastStack`), `Cutin.tsx`, `ScorePop.tsx`, `ScreenSplit.tsx`,
  sus `.module.css`, y `Dialog.test.tsx`, `Cutin.test.tsx`; añadir a `index.ts`.
- Modify: `frontend/src/components/RevealCutIn.tsx` y `frontend/src/components/ScorePop.tsx` pasan a ser envoltorios
  finos de `ui/Cutin` y `ui/ScorePop` con su API actual; `frontend/src/styles.css` pierde `.reveal-cut-in*` y
  `.score-pop*` (sus estilos viven ahora en los módulos). Los selectores que usan los E2E (`.reveal-cut-in[role="status"]`,
  `data-layer="reveal-cut-in"`) se mantienen: el envoltorio conserva la clase `reveal-cut-in` en el elemento raíz.

**Interfaces:**
- Consumes: `Pill`, `uiSound`, `cx`, `usePrefersReducedMotion` (`frontend/src/hooks/`), `useTimedVisibility` y
  `useDelayElapsed` (`frontend/src/hooks/useTimedVisibility.ts`).
- Produces:
  - `Dialog({ open, title, onClose(reason: 'escape' | 'backdrop' | 'action'), children, actions?: { label: string; variant?: PillVariant; onClick(): void; autoFocus?: boolean }[], width?: number })`:
    `<dialog>` nativo abierto con `showModal()` en un efecto cuando `open` pasa a verdadero y cerrado con `close()`;
    crema, radio `--r-dialog`, contorno 3 px, `--sh-dialog`; rebote de entrada (`scale(.96) → 1` con `--ease-bounce`
    en `--t-bounce`); guarda `document.activeElement` al abrir y le devuelve el foco al cerrar; `cancel` (Esc) y clic
    en el fondo llaman a `onClose` una sola vez; sonidos `open` y `close`. Función pura
    `dialogCloseReason(e: { type: string; target: unknown; currentTarget: unknown }): 'escape' | 'backdrop' | null`.
  - `ToastStack({ toasts: ToastData[], onClose(id: number) })` y `ToastData = { id: number; kind: 'ok' | 'error' | 'info'; text: string }`:
    contenedor `popover="manual"` que llama a `showPopover()` cuando hay avisos; abajo en el centro; cada aviso con
    `role="status"` (o `role="alert"` si es error) y botón de cerrar de 44 px; sonido `error` al aparecer uno de error.
    Hook `useToasts(): { toasts, push(kind, text, ms = 4000), close(id) }`.
  - `Cutin({ tone: 'yellow' | 'red' | 'info' | 'ok', title: string, subtitle?, media?: ReactNode, delayedLine?, delayedTone?, holdMs = 1600, reducedMotion?, onDone?, onSkip?, className? })`:
    losa azul noche de borde superior e inferior de 4 px en el tono, a todo el ancho, `position: fixed`, `--z-cutin`;
    entra con `translateX(-100%) → 0` en 200 ms y sale por la derecha al terminar (1400 ms en total con la pausa); se
    salta con clic o Espacio (`onSkip`); título `--fs-44` en Baloo 2 con `.ol2` (en móvil `--fs-34`); misma semántica de
    `role="status"`, región viva al ocultarse y `delayedLine` que `RevealCutIn` hoy; con reducción de movimiento,
    aparece sin desplazarse. Sonido `cutin` lo añadirá F2 (no aquí).
  - Mapa de tonos del envoltorio `RevealCutIn`: `electric → yellow`, `berry → red`, `aqua → info`, `leaf → ok`.
  - `ScorePop({ points, color?: string, reducedMotion? })`: «+N» `--fs-22` Baloo 2 con `.ol`, en el color del jugador,
    sube y se desvanece en 400 ms.
  - `ScreenSplit({ top: ReactNode, bottom: ReactNode, side?: ReactNode })`: en <1024 px, columna con `top` arriba,
    bisagra de 8 px `--navy-2` y `bottom` pegada al fondo (`position: sticky; bottom: 0`, `--z-sticky`,
    `padding-bottom: env(safe-area-inset-bottom)`); en ≥1024 px, rejilla de columna principal (`top` sobre `bottom`)
    y columna lateral `side` de 320 px, contenido limitado a 1600 px.

- [ ] **Step 1: Tests:** `Dialog.test.tsx` › `dialogCloseReason` (Esc → `escape`; clic con `target === currentTarget` →
  `backdrop`; clic dentro → `null`) y «devuelve el foco y avisa una vez» con un objeto `dialog` simulado
  (`showModal`/`close` espiados) usando la función `createDialogController(dialog, getActive)` que exporta el
  componente para su efecto. `Cutin.test.tsx` › clases por tono y `data-motion`; región `status` vacía al ocultarse;
  mapa de tonos del envoltorio. Los tests existentes `RevealCutIn.test.tsx` y `ScorePop.test.tsx` se actualizan solo
  en nombres de clase.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `npm test -w @pokemon-universe/web`, typecheck, lint y
  `npm run build -w @pokemon-universe/web` en verde.
- [ ] **Step 5:** Commit `Arcade DS F1: diálogo nativo, avisos, cut-in, puntos y pantalla doble`.

### Task 5: Galería `/dev/ui`, los 3 `modal-dialog` a `Dialog` y E2E de la galería

**Files:**
- Create: `frontend/src/ui/dev/Gallery.tsx` (+ `.module.css`), `e2e/tests/galeria.spec.ts`.
- Modify:
  - `frontend/src/main.tsx`: ruta `/dev/ui` solo si `import.meta.env.DEV`, lazy, fuera de `Layout` (página propia con
    scroll).
  - `frontend/src/components/AvatarEditor.tsx`, `frontend/src/room/GameHowToPlayDialog.tsx` y el diálogo de adivinar de
    `frontend/src/room/WhoIsWhoPokemonGame.tsx`: pasan de `<dialog className="modal-dialog">` + `showModal()` a `Dialog`.
    Se borra `.modal-dialog` de `styles.css`.
  - `e2e/src/helpers.ts`: `capture(page, name, opts?: { minFontPx?: number; noPageScroll?: boolean })`, con
    `noPageScroll` comprobando `scrollHeight ≤ innerHeight` en viewports ≥1024 px de ancho.
- **Galería:** una sección por componente (`data-gallery-section="<nombre>"`) con cada estado en
  `<figure data-gallery="<nombre>-<estado>">` y su `<figcaption>`: todas las variantes y tamaños de `Pill` con los
  `forced` y deshabilitada/cargando; `Panel` en sus 3 variantes y con `status` vacío, carga y error; `Tabs`,
  `Segmented`, campos (normal, con error, deshabilitado), `Slider`, `Toggle`; `Badge`, los 18 `TypeBadge`, `Chip`;
  `Bar` en sus tonos; `Timer` normal y urgente (con `now` fijo); `Row` normal, propia y desconectada; `Card` en sus 5
  estados; `HudPlate`; botón que abre el `Dialog`; botones que lanzan avisos; botón que lanza el `Cutin` de cada tono;
  `ScorePop`; un `ScreenSplit` de ejemplo. Datos ficticios fijos, sprites por la ruta del proxy existente o sin sprite.
- **E2E `galeria.spec.ts`:** carga `/dev/ui?static` (añadir `body.static` cuando la URL lleva `?static`), espera a las
  fuentes; comprueba que hay al menos 15 secciones y 60 figuras, sin ids repetidos; captura cada figura en
  `e2e/screenshots/galeria/<id>.png` y la página a 1280×720, 1920×1080 y 390×844 (`galeria-<tamaño>.png`);
  `measureLayout(page, 13)` sin problemas; sin errores de consola; abre el diálogo, lanza un aviso y comprueba con
  `elementFromPoint` que el aviso queda encima; Esc cierra el diálogo y el foco vuelve al botón que lo abrió.
- **E2E existentes** que abren los 3 diálogos migrados (cómo se juega, editor de avatar, adivinar de Quién es Quién)
  siguen en verde sin cambiar sus localizadores por rol.

- [ ] **Step 1:** Escribir `galeria.spec.ts` → falla (no existe la ruta).
- [ ] **Step 2:** Galería, ruta y migración de los 3 diálogos.
- [ ] **Step 3:** `npm test -w @pokemon-universe/web`, typecheck, lint y build en verde. Los E2E los ejecuta el
  controlador.
- [ ] **Step 4:** Commit `Arcade DS F1: galería del catálogo en /dev/ui y diálogos nativos del sistema`.

### Task 6: Verificación (controlador)

- [ ] Borrar `backend/.micronaut/test-resources` antes de cada ejecución E2E.
- [ ] `npx playwright test galeria` y `npx playwright test juegos -g "who-is-who|pokedex-distance|shiny-vote"` y
  `npx playwright test sala inicio` (cómo se juega y perfil). Revisar las capturas de la galería.
- [ ] Rúbrica de la galería como pantalla (spec §10) en el commit de capturas: `Arcade DS F1: capturas de la galería
  (Rúbrica galería: …)`.
- [ ] Revisión final de la rama, arreglos, fusión en `main` y push.
