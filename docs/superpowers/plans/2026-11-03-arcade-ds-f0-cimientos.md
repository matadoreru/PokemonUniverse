# Arcade DS F0: Cimientos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda la web pase a los tokens, el tema único, las fuentes y las capas del sistema Arcade DS sin
rediseñar todavía ninguna pantalla.

**Architecture:** Hay un `tokens.css` nuevo con los valores hex del DS en `:root`, espejados en `tokens.ts`. Las
variables `--color-*` de hoy (tripletes RGB que lee Tailwind) se reasignan por papel a valores del DS, así que las
4337 clases existentes siguen funcionando y la web se ve azul noche. Se retira el tema claro, se autoalojan Baloo 2 y
Nunito y se ponen las capas en tokens. Un test protege contraste, espejo y capas.

**Tech Stack:** React 19, Vite 6, Tailwind 3.4, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` (§3, §9 y §11). Plan general:
`/home/eru/.claude/plans/quiero-que-me-hagas-wild-iverson.md`.

## Global Constraints

- Los tokens van en `:root` (tema único). No queda ningún `data-theme`, `ThemeToggle` ni `pokemon-universe-theme`.
- Valores de color: exactamente los de la spec §3.1 (base, acentos y los 18 tipos en hex con su tinta).
- Reasignación por papel: `cream`→`--navy-2`, `ink`→blanco, `surface`→`--navy`, `surface-raised`→`--navy-3`,
  `night`→`--band`, `berry`→`--red-text`, `electric`→`--yellow`, `aqua`→`--info`, `leaf`→`--ok`, `focus`→`--yellow`.
- Fuentes: Baloo 2 (display) y Nunito (texto), woff2 en `frontend/public/fonts/` con `OFL.txt`, `font-display: block`,
  precargadas. Nada de Google Fonts ni Fredoka.
- Capas: `--z-content` 1, `--z-hud` 5, `--z-sticky` 10, `--z-cutin` 25, `--z-toast` 40. Ningún `z-index` literal en CSS
  ni `z-<n>`/`z-[…]` en los `.tsx`.
- En F0 no se rediseña ninguna pantalla ni se cambia `measureLayout` (el mínimo de 13 px llega pantalla a pantalla).
- Comentarios y textos en español; estilo del repo (TS ESM, 2 espacios, comillas simples, punto y coma).

## Review Focus

1. **Texto sobre `bg-cream`/`bg-surface` con opacidades** (`bg-ink/10`, `text-ink/70`…): con `ink` blanco y fondos
   azul noche, el texto secundario `text-ink/60` tiene que seguir siendo legible. Test: `tokens.test.ts` › «texto
   secundario» comprueba que blanco al 60 % sobre `--navy` sigue en ≥4,5:1 (compuesto).
2. **Tipos de tinta blanca sobre azul noche** (fighting, poison, ghost, dragon y dark quedan por debajo de 3:1 frente a
   `--navy-2`): `.type-badge` necesita el anillo blanco de la spec. Test: «tipos con tinta blanca llevan anillo», que
   lee `styles.css`.
3. **Usuario con `pokemon-universe-theme=light` guardado:** la web se ve igual (tema único) y no queda el atributo en el
   `html`. E2E: `inicio.spec.ts` › «ignora un tema claro guardado».
4. **El cut-in y los diálogos por encima de la cabecera fija:** `.reveal-cut-in` (`--z-cutin`) tiene que quedar sobre
   el `header` (`--z-hud`). Test: «orden de capas» en `tokens.test.ts`.
5. **La fuente tarda o falla en cargar:** se usa `system-ui` de reserva, sin errores en consola. Lo cubren los E2E
   existentes, que ya fallan con cualquier error de consola (`collectErrors`).

---

### Task 1: Tokens, espejo y test de contraste

**Files:**
- Create: `frontend/src/styles/tokens.css`, `frontend/src/styles/tokens.ts`, `frontend/src/styles/tokens.test.ts`.
- Modify: `frontend/src/styles.css` (importa `./styles/tokens.css` al principio, antes de `@tailwind`; borra el bloque
  `--type-*` en RGB de `:root`, que pasa a `tokens.css` en hex).

**Interfaces:**
- Produces:
  - `tokens.css` en `:root`: todo el bloque base, de acentos y semántico de la spec §3.1. `--type-<t>` en hex y
    `--type-<t>-ink: var(--navy)|var(--white)`. Para Tailwind se mantienen `--type-<t>-rgb` en triplete, que usa
    `.type-badge`. También van espaciado, radios, contornos, sombras, rayas, movimiento (con su bloque de
    `prefers-reduced-motion` y `.static`), capas y `--focus-ring`. Copia de Inazuma `src/ui/styles/tokens.css`, sin
    los grupos `gk/df/mf/fw`, `fire/wind/forest/mountain`, `team*`, `rival`, `pitch*` ni `bg-*`.
  - `tokens.ts`: `colors` (camelCase → hex), `cssName`, `typeColors: Record<PokemonType, string>`, `typeInk`,
    `fontSizes = [13,15,18,22,26,34,44,68] as const`, `layers = { content: 1, hud: 5, sticky: 10, cutin: 25, toast: 40 } as const`,
    y las funciones `luminance(hex)`, `contrast(a, b)`, `bestInk(bg)` e `inkOn(hex)` (las de Inazuma `tokens.ts`).
    `PokemonType` es la unión de los 18 nombres en inglés en minúscula.

- [ ] **Step 1: Escribir `tokens.test.ts`**
  - `describe('tokens.css ↔ tokens.ts')`: cada `colors[k]` coincide con su `var` en `tokens.css`; cada `typeColors[t]`
    coincide con `--type-<t>`.
  - `describe('contraste AA')`: las parejas de la spec §3.1, todas ≥4,5, con `blanco sobre red` ≥3; para cada tipo,
    `contrast(typeInk[t], typeColors[t]) ≥ 4.5` y `typeInk[t] === bestInk(typeColors[t])`.
  - `it('texto secundario')`: blanco al 60 % compuesto sobre `--navy` ≥4,5 (escribe `mix(fg, bg, alpha)` en el test).
  - `it('orden de capas')`: `layers.content < layers.hud < layers.sticky < layers.cutin < layers.toast`, y cada valor
    coincide con su `--z-*` del CSS.
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- tokens` → FAIL (no existen los ficheros).
- [ ] **Step 3:** Crear `tokens.css` y `tokens.ts` con las interfaces de arriba; importar en `styles.css`.
- [ ] **Step 4:** `npm test -w @pokemon-universe/web -- tokens` → PASS.
- [ ] **Step 5:** Commit `Arcade DS F0: tokens del sistema con espejo en TS y test de contraste`.

### Task 2: Tema único y reasignación por papel

**Files:**
- Modify:
  - `frontend/src/styles.css`: `:root` con `color-scheme: dark` y las `--color-*` reasignadas (triplete RGB del token
    DS por papel, ver Global Constraints); `body` con `background: var(--band)` y la escena (spec §3.6) como
    `background-image` de un SVG en línea (cielo `--blue-d` → `--navy-2` y patrón tenue de Poké Ball al 6 %), fijo y sin
    animación; foco de 3 px `--focus-ring` con 2 px de separación; `::selection` azul noche sobre amarillo; barra de
    desplazamiento amarilla sobre `--navy-2`.
  - Se borran `:root[data-theme='light']` y los cuatro `:root[data-theme='light'] .text-*`. `.type-badge` usa
    `--type-<t>-rgb` y lleva `box-shadow: 0 0 0 2px var(--white)` en los cinco tipos de tinta blanca.
  - `frontend/index.html`: fuera el `<script>` de `data-theme`; `theme-color` `#0B1640`.
  - `frontend/src/components/Layout.tsx`: fuera `ThemeToggle`. Se borra `frontend/src/components/ThemeToggle.tsx`.
  - `e2e/src/helpers.ts`: fuera `Theme` y `pinTheme`.
  - `e2e/tests/juegos.spec.ts`: `capturarTamanos` pierde la opción `claro`, y todas sus llamadas también; la matriz de
    la línea ~333 pierde la fila `claro: true`.
  - `e2e/tests/acceso.spec.ts` y `e2e/tests/sala.spec.ts`: fuera los tests «en tema claro».
  - `e2e/tests/inicio.spec.ts`: la comprobación de `data-theme="dark"` pasa a ser el test «ignora un tema claro
    guardado» (localStorage `pokemon-universe-theme=light` por `addInitScript` → `html` sin atributo `data-theme` y
    `body` con el fondo `--band`).
  - Se borran `e2e/screenshots/*-claro-*.png`.
  - `docs/visual-review.md`: el criterio «Tokens y temas» pasa a «Relieve y color» (texto de la spec §10) y se quita la
    sección de tema claro.
- Test: añadir a `tokens.test.ts` «tipos con tinta blanca llevan anillo», que lee `styles.css` y busca el
  `box-shadow` de los cinco.

- [ ] **Step 1:** Añadir el test del anillo → `npm test -w @pokemon-universe/web -- tokens` FAIL.
- [ ] **Step 2:** Hacer los cambios de arriba.
- [ ] **Step 3:** `npm test -w @pokemon-universe/web`, `npm run typecheck` y `npm run lint` → PASS;
  `grep -rn "data-theme\|ThemeToggle\|pinTheme\|claro" frontend/src e2e/src e2e/tests` no encuentra nada (salvo texto
  de interfaz en español que diga «claro» con otro sentido).
- [ ] **Step 4:** Commit `Arcade DS F0: tema único azul noche, fuera el tema claro y su selector`.

### Task 3: Fuentes autoalojadas, escala tipográfica y contorno de texto

**Files:**
- Create:
  - `frontend/public/fonts/baloo-2-latin.woff2` y `nunito-latin.woff2`, copiados de
    `/home/eru/Documents/Projects/InazumaElevenManager/assets/own/fonts/`;
  - `frontend/public/fonts/OFL.txt`, con el texto de la SIL Open Font License 1.1 y los avisos de copyright de Baloo 2
    («Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2)») y de Nunito («Copyright 2014 The
    Nunito Project Authors (https://github.com/googlefonts/nunitofont)»);
  - `frontend/src/styles/fonts.css`, con los dos `@font-face` de Inazuma `src/ui/styles/fonts.css`, URLs `/fonts/…`.
- Modify:
  - `frontend/index.html`: fuera los tres `<link>` de Google Fonts; dos `<link rel="preload" as="font" type="font/woff2" crossorigin>`.
  - `frontend/src/styles.css`: importa `fonts.css`; `:root` con `font-family: var(--font-text)`, `font-weight: 700` y
    `font-variant-numeric: tabular-nums`; clases `.ol` y `.ol2` (Inazuma `global.css`) y `.font-display` con
    `line-height: var(--lh-display)`.
  - `frontend/tailwind.config.js`: `fontFamily.display = ['"Baloo 2"', 'Nunito', 'system-ui', 'sans-serif']`,
    `fontFamily.body = ['Nunito', 'system-ui', 'sans-serif']`; `fontSize` extendido con `13`…`68` (`text-13` … `text-68`,
    `px` y su interlineado). Los tamaños por defecto de Tailwind (`text-xs`…) se quedan hasta F9.
- Test: `tokens.test.ts` › «la escala de Tailwind es la de la spec» (importa `tailwind.config.js` y compara las claves
  numéricas de `fontSize` con `fontSizes`).

- [ ] **Step 1:** Escribir el test → FAIL.
- [ ] **Step 2:** Hacer los cambios.
- [ ] **Step 3:** `npm test -w @pokemon-universe/web`, `npm run typecheck`, `npm run lint` y `npm run build -w @pokemon-universe/web` → PASS; `dist/fonts/` contiene los dos woff2.
- [ ] **Step 4:** Commit `Arcade DS F0: Baloo 2 y Nunito autoalojadas, escala tipográfica y contorno de texto`.

### Task 4: Capas por token

**Files:**
- Modify:
  - `frontend/tailwind.config.js`: `zIndex: { content: 'var(--z-content)', hud: 'var(--z-hud)', sticky: 'var(--z-sticky)', cutin: 'var(--z-cutin)', toast: 'var(--z-toast)' }` (sustituye la escala por defecto).
  - Los `.tsx` con `z-<n>`: `components/Layout.tsx:16` (`z-40` → `z-hud`); `room/RoomSessionLayout.tsx:51` (`z-50` →
    `z-toast`); `room/PlayerList.tsx:73`, `room/PokeddleBoard.tsx:75,76,82`, `room/PokeddleRaceGame.tsx:75,133`,
    `room/WhoIsWhoPokemonGame.tsx:37` y `room/WhosThatPokemonGame.tsx:30`. Las capas internas de un componente pasan a
    `z-content`, o a `isolate` más el orden del DOM cuando solo apilan dentro de su caja. Los menús o capas sobre la
    página pasan a `z-sticky`.
  - `frontend/src/styles.css`: los `z-index` literales (`.connections-submit`, `.answer-dock`, `.zoomed-answer` →
    `var(--z-sticky)`; `.shiny-option-correct` → `var(--z-content)`; `.reveal-cut-in` → `var(--z-cutin)`).
- Test: `tokens.test.ts` › «sin z-index literales»: ningún `z-index:\s*\d` en `styles.css`, y ningún `\bz-(\d+|\[)` en
  los `.tsx` de `frontend/src` (recorrido con `readdirSync` recursivo).

- [ ] **Step 1:** Escribir el test → FAIL (lista los ficheros de arriba).
- [ ] **Step 2:** Hacer los cambios.
- [ ] **Step 3:** `npm test -w @pokemon-universe/web`, `npm run typecheck` y `npm run lint` → PASS.
- [ ] **Step 4:** Commit `Arcade DS F0: capas por token y sin z-index literales`.

### Task 5: Verificación visual de F0

- [ ] **Step 1:** Ejecutar los E2E de pantallas: `npm run test:e2e -- inicio acceso sala contenido-y-admin` y
  `npm run test:e2e -- juegos -g "pokedex-distance|shiny-vote|type-duel"`. Expected: verdes, sin errores de consola.
- [ ] **Step 2:** Revisar las capturas de `e2e/screenshots/` a 1280×720, 1920×1080 y 390×844: fondo azul noche con
  escena, Baloo 2 en los títulos, texto legible, sin scroll horizontal y `measureLayout` sin problemas nuevos frente a
  `main`. Si una pantalla pierde contraste por la reasignación (por ejemplo un `text-night` sobre amarillo), se corrige
  con la clase del papel correcto, sin rediseñar.
- [ ] **Step 3:** Commit de las capturas regeneradas: `Arcade DS F0: capturas con los tokens nuevos`. F0 no rediseña
  ninguna pantalla, así que no lleva rúbrica; el estado se anota en `docs/visual-review.md` como «línea base Arcade DS
  F0».
- [ ] **Step 4:** Fusionar en `main` (fast-forward) tras la revisión final de la rama.
