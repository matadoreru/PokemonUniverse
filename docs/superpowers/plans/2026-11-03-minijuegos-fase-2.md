# Minijuegos, Fase 2 (UX, onboarding y feedback): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los 6 primeros minijuegos se entiendan antes de jugar y que cada momento clave (revelación, acierto, eliminación) tenga una respuesta visual y, si el jugador lo activa, sonora. Todo dentro de las reglas de UI de `AGENTS.md` (Fase 2 de §10).

**Architecture:**
- **Lenguaje común.** Un vocabulario de movimiento en `frontend/src/styles.css`: clases `motion-*`, solo `transform`/`opacity`, ≤400 ms, apagado en un único sitio con `prefers-reduced-motion`. Encima van dos componentes, `RevealCutIn` y `ScorePop`, y una utilidad `sfx.ts` (WebAudio, silenciada por defecto). Cada juego reutiliza estas piezas y no inventa las suyas.
- **Onboarding.** `HowToPlayCarousel` se generaliza para aceptar diapositivas. Los 3 pasos de cada juego viven en `frontend/src/games/how-to-play.ts` y se ven en dos sitios:
  - en un diálogo desde la tarjeta del lobby;
  - en una pantalla de intro que la **sala Java** mantiene en `GAME_STARTING` (hoy esa fase nunca llega al cliente).
- **Motores.** Tres cambios de motor van en TS (oráculo) y Java en el **mismo commit**, con sus goldens y la UI que los consume:
  - historial y desempates de Distance;
  - `revealSeconds` de Shiny;
  - `solutionCount` de Type Duel.

  Además, los sprites de Higher or Lower pasan por el proxy. **No hay cambios de esquema de BD:** `metrics` es `jsonb` (`V1__baseline.sql:260,586`).

**Tech Stack:** TypeScript ESM + Zod + Vitest (shared y frontend, sin jsdom: `renderToStaticMarkup` y funciones puras), Java 25 + Micronaut + JUnit, React 19 + Tailwind 3, Web Audio API y Playwright.

**Spec:** `/home/eru/Documents/Projects/PokemonUniverse/MINIJUEGOS_MEJORAS.md`. No está en git; se lee por ruta absoluta. Secciones de esta fase:
- §10 «Fase 2»;
- §1.4 y §1.8;
- §2.4 y §2.6;
- §3.4, §4.4, §5.4, §6.4 y §7.4;
- §8.1 (cómo se juega) y §8.6;
- §11.1.

**Rama:** `minijuegos-fase-2`, apilada sobre `minijuegos-fase-1` (`a26c6c1`). Este plan está en `.superpowers/`, que git ignora. Los ledgers de las fases anteriores están en `.superpowers/sdd/minijuegos-fase-{0,1}/progress.md`.

---

## Diferencias entre el documento y el repositorio actual

- `apps/web/src/...` ahora es `frontend/src/...`, y `apps/web/public/` es `frontend/public/`.
- **Node (`apps/server`) ya no se despliega.** La intro de partida vive solo en `RoomCoordinator` (Java).
  - `apps/server` sigue compilando y ejecutando sus Vitest en `npm test`.
  - Los tipos compartidos nuevos son aditivos (campos opcionales), así que Node no necesita cambios. Si `npm run typecheck` pide algo en `apps/server`, se añade lo mínimo para compilar y se anota en el informe.
- **El esquema es de Flyway, no de Prisma.** Las estadísticas nuevas de Distance no lo tocan: las métricas de perfil se guardan en `jsonb` y se agregan por manifiesto (`MetricsMerge.java`).
- `npm run test:e2e:java` ya no existe. `npm run test:e2e -- juegos` va contra Java.
- `playwright.config.ts:30` ya fija `reducedMotion: 'reduce'` para toda la suite. Las capturas salen sin animación. Para comprobar que las animaciones existen hay que pedir `page.emulateMedia({ reducedMotion: 'no-preference' })` de forma explícita.
- `frontend` no tiene jsdom ni Testing Library. Los Vitest de componentes usan `renderToStaticMarkup` (por ejemplo, `Lobby.test.tsx` y `HowToPlayCarousel.test.tsx`) o funciones puras.

## Verificación de las afirmaciones del documento (código actual, tras la Fase 1)

| Afirmación | ¿Sigue vigente? | Evidencia actual |
|---|---|---|
| `HowToPlayCarousel` existe y se reutiliza (§1.4, §8.1) | Existe, pero **solo** es la guía general de 4 diapositivas, escrita a mano | `frontend/src/components/HowToPlayCarousel.tsx:4-43`. Solo la usa `PlayPage.tsx:99`. Su test exige «Ver consejo 4» |
| Los pasos se muestran «en `GAME_STARTING`» (§8.1) | **No se puede hoy:** la fase no llega al cliente | `RoomCoordinator.java:741-742` (`createInitialState` y `engine.start` seguidos). `RoomPage.tsx:22` pintaría `ActiveGame` con el estado sin iniciar |
| No hay sonidos de interfaz (§1.4) | Sí | Solo el `<audio>` de Cry Quiz. `frontend/public/` solo tiene `avatars/`, `favicon.png` y `logoText.png` |
| La reducción de movimiento es una lista a mano (§8.6) | Sí | `styles.css:204-211`. No cubre las transiciones de tarjetas ni barras de los juegos ni `animate-spin` |
| Distance usa el `Results.tsx` genérico (§2.4) | Sí | `games/registry.ts:86` → `room/Results.tsx`, con solo aciertos exactos y distancia media |
| Distance no tiene datos para la gráfica por ronda | Sí | `PokedexDistancePublicState` (`types.ts`) solo publica `lastRound`. `eliminations` es privado. `buildResults` (`rules.ts`) da `exactHits`, `roundsSurvived`, `selections` y `averageDistance` |
| `bestDistance` como métrica MIN (§2.6) | **No sirve tal cual** | `MetricsMerge.java:28`: MIN ignora valores `<= 0`, así que un acierto exacto (0) se leería como «sin dato» |
| Shiny: revelación fija de 3 s (§3.4) | Sí | `shiny-vote/server.ts:20`, `ShinyVoteEngine.java:51` |
| Shiny: «antes/después» sin sprite normal | El estado no lo trae, pero no hace falta motor | `ShinyOption.pokemonId` es público. La ruta `GET /api/pokemon/{id}/sprite` (Fase 1) sirve el sprite normal |
| Type Duel: VS + contador de soluciones (§6.4) | El contador no es público | `type-duel/server.ts:36` (`validPokemonIds` en el estado). `TypeDuelPublicState` (`types.ts:22-27`) no lo publica. `TYPE_REVEAL_MS = 2_000` (`server.ts:7`) |
| Higher or Lower: barras al revelar (§5.4) | Datos disponibles | `HigherLowerRoundResult { previousValue, currentValue, … }` (`types.ts:10`). `REVEAL_MS = 3_000` (`server.ts:9`) |
| Higher or Lower: sprite con el id de PokéAPI (Decisión 14 de la Fase 1) | Sí | `higher-lower/server.ts:24` (`pokemonView`), `HigherLowerEngine.java:99` |
| Impostor: datos del cut-in de eliminación | Disponibles | `eliminationReveal` público. `ELIMINATION_MS = 4_000` (`server.ts:29`). Pantalla actual: `PokemonImpostorGame.tsx:77` |
| Learnset: marcador en vivo (L2) | No hay. La barra lateral no muestra puntos | `LearnsetGuessGame.tsx:39`. `scores` es público |
| Learnset: «✗ No acertó» a los desconectados (Fase 0) | Sí | `LearnsetGuessGame.tsx:48` |

**Pendientes heredados de los ledgers de las Fases 0 y 1, todos vigentes:**

| Pendiente | Evidencia | Tarea |
|---|---|---|
| Etiqueta de `ServerTimer` a 10 px | `ServerTimer.tsx:7` | 1 |
| `pokeddle-timer-urgent` anima `text-shadow` | `styles.css:196-197` | 1 |
| Pista del temporizador `bg-night` pesada en tema claro | `PokedexDistanceGame.tsx:30`, `ShinyGameHeader.tsx:29` | 1 |
| Iniciales de `Avatar xs` a 9 px | `Avatar.tsx:5`, 12 ficheros con `size="xs"` | 1 |
| Selector sin estados de carga o vacío con acción | `PokemonSelector.tsx:22` | 3 |
| Cabecera fija que tapa contenido por el autofoco | `e2e/README.md`, «Encaje» | 3 |
| Carrusel: puntos con `transition-[width,background-color]` y objetivos de 40 px | `HowToPlayCarousel.tsx:64` | 4 |
| Lobby en rotación a 17/24 | Ledger de la Fase 0 | 4 |
| `text-[.68rem]` en `ShinyOptionCard` | `ShinyOptionCard.tsx:76` | 8 |
| Sombra literal `rgba(240,191,84,.18)` en `ShinyOptionCard` | `ShinyOptionCard.tsx:75` | 8 |
| Fila `min-h-7` con avatares `sm` (h-8) en `ShinyOptionCard` | `ShinyOptionCard.tsx:26` | 8 |
| Copy «Racha 3 · +1 racha · +1 rapidez» | `HigherLowerGame.tsx:18`, `higher-lower-labels.ts:11` | 11 |
| Botones de respuesta de Higher or Lower bajo el pliegue a 390 | `HigherLowerGame.tsx:15` | 11 |
| Juego de Higher or Lower a 14/24 | Ledger de la Fase 0 | 11 |

**Ya hecho (no se repite):**
- Learnset L1/L5 (Fase 0).
- Textos en español de Higher or Lower (Fase 0).
- `roundsSurvived` de Distance (Fase 0).
- Catálogo reducido y proxy de sprites (Fase 1).

**Fuera de esta fase.** No están en el alcance de §10 Fase 2, o piden datos de motor que no compensan:
- **Distance:** minijuego de apuestas para eliminados (§2.4).
- **Shiny:** galería final, tiempo medio y voto más rápido (§3.4).
- **Impostor:** tarjeta de rol que gira, burbujas de pistas, flechas de votos, pantalla final con línea de tiempo y canal fantasma (§4.4).
- **Higher or Lower:** gráfica de racha en los resultados (§5.4).
- **Type Duel:**
  - etiqueta de formas regionales en el buscador;
  - barra de duelos por jugador;
  - tiempo del ganador;
  - cuadro de enfrentamientos (§6.4).
- **Learnset:**
  - silueta que se llena de color;
  - revelación final con el learnset completo;
  - medias de pistas en los resultados (§7.4).
- **§8:**
  - control de volumen (§8.6; §10 solo pide silencio);
  - presets por juego (§8.1);
  - duración estimada en `VOTE` (§8.2).
- **Pantallas de resultados propias de los otros 5 juegos.** §10 solo pide la de Distance.

## Decisiones

Se toman de las recomendaciones del propio documento. Si no hay ninguna, se elige la opción mínima que cumple el criterio de aceptación. Las marcadas **(más allá del documento)** o **(se desvía del documento)** las puede vetar el usuario.

1. **§11.1, DESIGN.md / «Arcade DS».** Sigue sin estar en el repo. Se aplica lo que el documento dice que existe (§1.8): tokens, Fredoka y Nunito, y las clases de `styles.css`. De la hipótesis «Arcade DS» solo se toma el **cut-in de cartucho**: una banda horizontal a todo el ancho, con borde grueso del color del momento, que entra con `translateX` + `opacity`. Es el único gesto llamativo. Todo lo demás entra con un `motion-enter-up` discreto. **(más allá del documento)**
   - Colores por momento:
     - `electric` = acierto o «wow»;
     - `berry` = eliminación o fallo;
     - `aqua` = información o inocente;
     - `leaf` = correcto.
   - El estado nunca se transmite solo con color: siempre va con ✓/✗, un icono o texto (`PRODUCT.md`).
2. **La intro de `GAME_STARTING` vive en la sala Java.** **(más allá del documento: el mecanismo)**
   - Activación:
     - Campo opcional del manifiesto `introMs`, con la constante `GAME_INTRO_MS = 10_000` en `contracts.ts`.
     - Solo lo llevan los 6 juegos.
   - Arranque:
     - `launchGame` crea el estado y lo deja en `GAME_STARTING`.
     - El motor arranca (`engine.start`) cuando vence el plazo o cuando **todos** los jugadores conectados pulsan «Saltar», lo que ocurra antes.
   - Se muestra **solo la primera vez** que se juega ese minijuego en la sesión de la sala (`introducedGameIds`, que se vacía al empezar sesión nueva). Así una rotación no repite 10 s de reglas en cada partida (lectura de «una vez» en §8.1).
   - Se descarta poner la intro solo en el cliente durante la ronda 1: le quitaría tiempo de respuesta a quien lee, y eso deshace la Fase 1.
3. **«Cómo se juega» en el lobby.** `lobby-game-option` es un `<button>`, así que el carrusel no cabe dentro.
   - Cada tarjeta de los 6 juegos lleva al lado un botón «Cómo se juega» que abre un `<dialog className="modal-dialog">` con el carrusel.
   - El botón está activo también para los invitados que no pueden elegir juego.
   - **(se desvía del documento: junto a la tarjeta, no dentro)**
4. **Texto de los pasos.** El título de cada paso es la frase del documento, tal cual. La descripción de una línea es nueva, y se ha comprobado contra el código (Task 4). **(más allá del documento: las descripciones)**
5. **Audio generado con Web Audio**, sin ficheros en `frontend/public/sfx/` y sin recursos con derechos. **(se desvía de §8.6)**
   - Desactivado por defecto. Se guarda en `localStorage` (`pokemon-universe-sfx`: `on`/`off`).
   - El `AudioContext` se crea o se reanuda en el clic que activa el sonido. Nunca suena antes de esa interacción.
   - Sin control de volumen: ganancia fija de 0,2. **(se desvía de §8.6)**
6. **Reducción de movimiento global.** Bajo `prefers-reduced-motion: reduce`, una única regla apaga **todas** las animaciones y transiciones (`*, *::before, *::after`). Sustituye a la lista de `styles.css:204-211` y a la `.motion-safe-anim` que propone §8.6. **(se desvía de §8.6: cumple lo mismo en un solo sitio, sin depender de que cada clase se registre)**
   - Ningún componente depende de `animationend`: los cierres van con temporizadores.
7. **Presupuesto de movimiento:** cada animación dura ≤400 ms (rúbrica, criterio g). Las pausas dramáticas, como el «…era» de Impostor tras 1 s, se hacen con `animation-delay`, nunca alargando la animación.
8. **Distance: historial y estadísticas** (§2.4 y §2.6).
   - Estado nuevo `roundHistory`, público solo en `GAME_RESULTS`.
   - Estadística nueva `tiebreaksWon`: SUM y métrica de perfil «Desempates superados».
   - **`bestDistance` no es métrica de perfil** porque `MetricsMerge` MIN descarta el 0. **(se desvía de §2.6)** La pantalla de resultados calcula la mejor distancia y la ronda de caída a partir de `roundHistory`.
   - No hay migración: `metrics` es `jsonb`.
9. **Shiny: revelación configurable** (§3.4). Clave nueva `revealSeconds`, entera de 3 a 6, con 4 por defecto, tras `voteVisibility`. Como es nueva, lo guardado toma el 4 sin migración.
   - El «antes/después» usa `/api/pokemon/{pokemonId}/sprite` (Fase 1), solo durante la revelación. No toca el motor.
   - Esqueleto hasta que cargan todas las cartas, con un límite de 4 s. Mientras dura, el voto del cliente está deshabilitado.
10. **Type Duel: `solutionCount` público** (§6.4, «contador de soluciones»).
    - Vale `validPokemonIds.length` en `TYPE_REVEAL` y `POKEMON_SEARCH`, y `null` en el resto.
    - Dice cuántos Pokémon cumplen la combinación, no cuáles. No da ventaja a ninguno de los dos duelistas.
11. **Higher or Lower: sprites por el proxy.** Cierra la Decisión 14 de la Fase 1.
    - Nuevo `pokemonSpritePath(id) = '/api/pokemon/' + encodeURIComponent(id) + '/sprite'` en shared, con su espejo Java.
    - Lo usa `pokemonView`.
    - El nombre sigue haciendo consultable el valor (§8.7, «Ojo»). Se acepta.
12. **Textos:**
    - «¡EXACT HIT!» pasa a «¡Acierto exacto!». **(más allá del documento)**
    - El desglose de Higher or Lower queda como «Racha 3 (+1) · +1 rapidez» (ledger de la Fase 1).
    - En la revelación de Learnset, a quien no acertó y está desconectado se le muestra «Sin conexión» (en `ink/60`) en vez de «✗ No acertó».
13. **`Avatar xs`** pasa a `h-6 w-6 text-xs` (12 px).

## Global Constraints

- **Plataforma y estilo:**
  - Node 22+ y Java 25.
  - TS ESM con dos espacios, comillas simples y punto y coma.
  - Comentarios Java en español.
  - Commits en español, de una línea, sin prefijos ni líneas de atribución.
- **Motores:**
  - **Mismo commit:** TS del motor, Java del motor, escenario dorado nuevo, fixtures regeneradas (`npm run build -w @pokemon-universe/shared && npm run golden:export`) y la UI que consume el cambio.
  - Se corrige el Java, nunca el TS ni las fixtures (`backend/.../engines/README.md`).
  - **Orden de claves:** cada campo nuevo va en la posición que indica la tarea, en el literal TS y en el record Java (con setter de `Builder` y `toBuilder()`). Un campo nuevo cambia **todas** las fixtures de ese motor. En el diff de las fixtures viejas solo pueden cambiar el campo nuevo y lo que sigue de él.
  - Escenarios dorados nuevos con seed nueva (distinta de las del fichero), `catalog: 'gen1-2'` y ≥3 rondas cuando el juego las tenga.
- **Configuración o manifiesto nuevos**, en la misma tarea:
  - `npm run registry:export`;
  - `configCases` válidos e inválidos;
  - snapshot `cd backend && ./gradlew test -Dupdate=true --tests '*ConfigMessagesSnapshotTest*'`;
  - casos en `backend/src/test/resources/gameconfigs/generate-migration-cases.ts` y `migration-cases.json` regenerado.
- **UI:**
  - Solo con las clases de `frontend/src/styles.css` y los tokens. Ningún color literal.
  - Texto de 12 px o más.
  - Animaciones solo de `transform` y `opacity`, de ≤400 ms, reutilizando las clases `motion-*` de la Task 1.
  - Objetivos táctiles de 44 px o más.
- Los textos nuevos de la UI salen de funciones puras en `frontend/src/room/*.ts` o `frontend/src/games/<id>/*.ts`, con su Vitest.
- **Capturas y rúbrica, en cada tarea que rediseña una pantalla:**
  - capturas a 1280×720, 1920×1080 y 390×844, más una en tema claro (`pinTheme(context, 'light')`) a 1280×720;
  - `layoutProblems(page, …, true)` vacío y sin scroll horizontal;
  - **mira las imágenes**;
  - puntúa con `docs/visual-review.md`: ≥19/24 y ningún 0;
  - la línea `Rúbrica <pantalla>: a,b,c,d,e,f,g,h = N/24` va en el mensaje del commit.
- **Los 13 PNG del usuario.** `e2e/screenshots/` tiene 13 PNG modificados que son del usuario. Nunca se commitean ni se pierden.
  - **Antes de la primera ejecución E2E de la fase** (Task 1; las demás tareas solo comprueban que la copia existe), desde la raíz:

    ```sh
    B=.superpowers/sdd/minijuegos-fase-2/png-usuario
    [ -f "$B/sha256" ] || { mkdir -p "$B" && git diff --name-only -- e2e/screenshots > "$B/lista" && test "$(wc -l < "$B/lista")" -eq 13 && xargs -a "$B/lista" -I{} cp --parents {} "$B" && (cd "$B" && sha256sum $(cat lista) > sha256); }
    ```

    Si la lista no tiene 13 líneas, **para** y avísalo.
  - **Después de cada ejecución E2E**, restaura y verifica byte a byte. Después devuelve a `HEAD` los demás PNG versionados que la ejecución haya reescrito y que no sean capturas de la tarea:

    ```sh
    xargs -a "$B/lista" -I{} cp "$B/{}" "{}" && sha256sum -c "$B/sha256"
    git diff --name-only -- e2e/screenshots | grep -vxF -f "$B/lista" | grep -vE '<regex de las capturas de la tarea>' | xargs -r git restore --
    ```
  - `git add` solo con las rutas que nombra la tarea. Nunca `git add -A`, `git add .` ni `git add e2e/screenshots`. Nunca `git restore e2e/screenshots` entero.
- **E2E:**
  - El `webServer` de `e2e/playwright.config.ts` reutiliza servidores: para cualquier backend en :8080 o web en :5173 arrancado desde otro checkout.
  - Hace falta `.env`, el catálogo sembrado y `npx playwright install chromium`.
- **Por tarea:**
  - el Vitest del workspace tocado;
  - si hay motor, `npm run golden:export` y `cd backend && ./gradlew test --tests '*GoldenReplayTest*' --tests '*<Juego>*'`;
  - `npm run lint && npm run typecheck`.
  - El `npm test` y el `./gradlew check` completos van en la Task 14.

## Review Focus

1. **Alguien se desconecta o se va durante la intro.** La partida tiene que arrancar igual, por plazo o porque ya han saltado todos los conectados que quedan, y nunca quedarse colgada. Un «Saltar» con un `gameInstanceId` viejo se rechaza. Tests: `introStartsWhenTheLastPendingPlayerDisconnects` y `introSkipWithAStaleInstanceIsRejected` (Task 5).
2. **Sprites de Shiny que no cargan nunca** (404, red caída): el esqueleto se rinde a los 4 s y el voto se habilita. Nunca bloquea la ronda. Test: `shinyCardsReadyAfterTimeoutEvenIfImagesFail` (Task 8).
3. **Navegador sin `localStorage` utilizable** (modo privado, `setItem` que lanza) **o sin `AudioContext`:** el sonido queda apagado, el botón sigue funcionando y nada lanza excepciones. Test: `sfx survives a throwing storage and a missing AudioContext` (Task 2).
4. **Resultados de Distance con un jugador que no respondió en la ronda 1** (`distance: null` en todas sus rondas) **o con la partida desierta** (`winnerId: null`): la pantalla no muestra `NaN`, `Infinity` ni «ronda 0». Test: `distanceResultsSummary handles no-response players and a deserted game` (Task 6).
5. **Barras de Higher or Lower con valores 0 o iguales:** no hay división por cero. Con iguales se ven dos barras llenas y el chip «=». Test: `higherLowerBars handles zero and equal values` (Task 11).

---

### Task 1: Vocabulario de movimiento, `RevealCutIn`, `ScorePop` y arreglos de temporizador y avatar

**Files:**
- Modify: `frontend/src/styles.css`. Sustituye las líneas 204-211 por la regla global y elimina la animación con `text-shadow` de las líneas 196-197.
- Create:
  - `frontend/src/components/RevealCutIn.tsx`, `frontend/src/components/RevealCutIn.test.tsx`;
  - `frontend/src/components/ScorePop.tsx`, `frontend/src/components/ScorePop.test.tsx`;
  - `frontend/src/hooks/usePrefersReducedMotion.ts`.
- Modify:
  - `frontend/src/components/ServerTimer.tsx:7`;
  - `frontend/src/components/Avatar.tsx:5`;
  - `frontend/src/room/PokedexDistanceGame.tsx:30` y `frontend/src/games/shiny-vote/ShinyGameHeader.tsx:29` (pista a `timer-track`).
- Modify: `e2e/src/helpers.ts`, para añadir `animacionDe` y `conMovimiento`.

**Interfaces:**
- Produces (CSS, dentro de `@layer components` o junto a las clases de juego; todas con `transform`/`opacity` y ≤400 ms):
  - `.reveal-cut-in`: capa fija `inset-x-0` centrada en vertical, con `pointer-events: none`, borde superior e inferior de 4 px y fondo `surface` al 97 %.
  - `.reveal-cut-in-enter`: `translateX(-8%)` + `opacity 0→1` en 280 ms.
  - `.reveal-cut-in-electric`, `-berry`, `-aqua` y `-leaf`: el color del borde y del título salen del token.
  - `.score-pop`: `translateY(0 → -0.75rem)` + `opacity 0→1→0` en 400 ms, con `text-sm font-black tabular-nums`.
  - `.motion-bump`: `scale 1→1.12→1` en 300 ms.
  - `.motion-enter-up`: `translateY(8px)` + `opacity` en 260 ms.
  - `.motion-enter-left` y `.motion-enter-right`: `translateX(∓1.5rem)` + `opacity` en 320 ms.
  - `.motion-grow-x`: `scaleX(0→1)` con `transform-origin: left` en 400 ms.
  - `.motion-flip`: `rotateY(90deg→0)` en 360 ms.
  - `.motion-delay-1s`: `animation-delay: 1s; animation-fill-mode: both`.
  - `.timer-track`: fondo `ink` al 12 % y borde `ink` al 15 %, correcta en los dos temas.
  - `pokeddle-timer-urgent` pasa a `scale(1.06)` en 400 ms, alternado.
  - `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } .shiny-option-interactive:hover { transform: none; } }`.
- Produces (TS):
  - `usePrefersReducedMotion(): boolean`: lee `matchMedia('(prefers-reduced-motion: reduce)')` y se suscribe a `change`. Devuelve `false` si no hay `window`.
  - `export type CutInTone = 'electric' | 'berry' | 'aqua' | 'leaf';`
  - `export function revealCutInClassName(tone: CutInTone, reducedMotion: boolean): string`.
  - `export function RevealCutIn(props: { tone: CutInTone; title: string; subtitle?: string; media?: ReactNode; delayedLine?: string; holdMs?: number; reducedMotion?: boolean; onDone?(): void }): JSX.Element | null`.
    - `holdMs` vale 1600 por defecto. Al pasar ese tiempo se oculta con un `setTimeout`, nunca con `animationend`.
    - Raíz: `role="status"`, `aria-live="assertive"` y `data-layer` (para que `measureLayout` no cuente solapes).
    - `delayedLine` se pinta con `motion-delay-1s`.
    - `reducedMotion` vale por defecto lo que diga el hook.
  - `export function scorePopLabel(points: number): string`: `+3`, `+0`.
  - `export function ScorePop(props: { points: number; tone?: CutInTone; reducedMotion?: boolean }): JSX.Element`, con `aria-hidden`. El cambio de puntos se anuncia en el texto de la pantalla, no aquí.
- Produces (e2e):
  - `export async function animacionDe(locator: Locator): Promise<string>`: devuelve `getComputedStyle(el).animationName` del elemento. Es determinista: no depende de que la animación siga en curso.
  - `export async function conMovimiento(page: Page): Promise<void>`: `page.emulateMedia({ reducedMotion: 'no-preference' })`.
  - **Patrón de comprobación** en las Tasks 7, 8, 9, 11, 12 y 13: sobre el elemento animado de la revelación, `animacionDe(el)` vale `'none'` con la reducción por defecto. Tras `conMovimiento(page)` vale el nombre del `@keyframes` (por ejemplo, `motion-grow-x`). No se usa `document.getAnimations()`, que pierde las animaciones ya terminadas.

- [ ] **Step 1: Tests que fallan.**
  - `RevealCutIn.test.tsx`:
    - `uses the enter animation only without reduced motion`: con `reducedMotion: false`, el markup contiene `reveal-cut-in-enter` y `reveal-cut-in-electric`. Con `true` **no** contiene `reveal-cut-in-enter` y sí `data-motion="reduced"`.
    - `is a non-blocking status layer`: el markup contiene `role="status"` y `data-layer`.
    - `renders the delayed line with the 1 s delay class`.
  - `ScorePop.test.tsx`:
    - `scorePopLabel(0) === '+0'` y `scorePopLabel(4) === '+4'`;
    - sin animación con `reducedMotion: true`, porque falta la clase `score-pop-anim`.
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- RevealCutIn ScorePop`. Debe fallar.
- [ ] **Step 3: Implementa** los componentes, el hook y el CSS.
  - `ServerTimer`: la etiqueta pasa de `text-[10px]` a `text-xs`.
  - `Avatar`: `xs: 'h-6 w-6 text-xs'`.
  - Las dos pistas `bg-night` pasan a `timer-track`.
  - Comprueba con `grep -n "text-\[9px\]\|text-\[10px\]" frontend/src -r` que no quedan en `components/`.
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: E2E de humo.**
  1. Copia de los PNG (Global Constraints).
  2. `npm run test:e2e -- juegos -g "pokedex-distance|shiny-vote"`. Debe pasar sin scroll horizontal.
  3. Restaura los PNG.
- [ ] **Step 6: Commit.** `Movimiento común: cut-in, puntos flotantes, reducción global y temporizadores legibles en tema claro`

---

### Task 2: Sonido desactivado por defecto: `sfx.ts`, `SoundToggle` y `useSfxCue`

**Files:**
- Create:
  - `frontend/src/lib/sfx.ts`, `frontend/src/lib/sfx.test.ts`;
  - `frontend/src/components/SoundToggle.tsx`;
  - `frontend/src/hooks/useSfxCue.ts`.
- Modify: `frontend/src/components/Layout.tsx:16`. `SoundToggle` va junto a `ThemeToggle`, en el mismo `span`.
- Modify: `e2e/tests/inicio.spec.ts`. Comprueba el botón de sonido.

**Interfaces:**
- `export type SfxName = 'tick' | 'hit' | 'miss' | 'reveal' | 'win' | 'clang';`
- `export interface AudioContextLike { currentTime: number; state: string; destination: unknown; resume(): Promise<void>; createOscillator(): OscillatorLike; createGain(): GainLike }`. Los tipos mínimos de `OscillatorLike` y `GainLike` se definen en el fichero.
- `export interface SfxDeps { createContext(): AudioContextLike | null; storage: Pick<Storage, 'getItem' | 'setItem'> | null }`
- `export function createSfx(deps: SfxDeps): { isEnabled(): boolean; setEnabled(on: boolean): void; play(name: SfxName): void; subscribe(listener: () => void): () => void }`
  - Clave `pokemon-universe-sfx`. Por defecto está apagado.
  - `setEnabled(true)` crea el contexto (una sola vez) y llama a `resume()`.
  - `play` sin activar no hace nada y **no** crea contexto.
  - Si está activado (también cuando el `'on'` viene de `storage` tras recargar) y aún no hay contexto, el primer `play` lo crea y llama a `resume()`. Si el navegador lo deja suspendido por falta de interacción, ese sonido se pierde sin error.
  - Toda lectura o escritura de `storage` va en `try/catch`.
- `export const sfx = createSfx(browserSfxDeps())`.
- `export function useSfxEnabled(): [boolean, (on: boolean) => void]`, con `useSyncExternalStore` sobre `subscribe`.
- `export function useSfxCue(cue: SfxName | null, key: string | number | null): void`. Suena una vez cada vez que cambia `key` y `cue` no es `null`. No suena en el primer render.
- Recetas, todas con envolvente de 0,2 a 0,001 exponencial:

| Sonido | Onda | Notas |
|---|---|---|
| `tick` | cuadrada | 1200 Hz, 30 ms |
| `hit` | senoidal | 660 y 880 Hz, 80 ms cada una |
| `miss` | triangular | 220 y 165 Hz, 120 ms cada una |
| `reveal` | senoidal | 523, 659 y 784 Hz, 60 ms cada una |
| `win` | senoidal | 523, 659, 784 y 1047 Hz, 100 ms cada una |
| `clang` | cuadrada | 180 y 270 Hz a la vez, 150 ms |

- `SoundToggle`:
  - `className="icon-button"`, con `aria-pressed`;
  - `aria-label` «Activar sonido» o «Silenciar sonido»;
  - iconos `VolumeX` y `Volume2`.

- [ ] **Step 1: Tests que fallan** (`sfx.test.ts`, con contexto y storage falsos):
  - `is muted by default and never creates a context while muted`: `play('hit')` ×3 deja `createContext` en 0 llamadas.
  - `enabling creates and resumes the context once and persists 'on'`.
  - `plays oscillators only when enabled`.
  - `reads a stored 'on'`.
  - `creates the context lazily on the first play when 'on' was stored`.
  - `sfx survives a throwing storage and a missing AudioContext`: `getItem`/`setItem` lanzan y `createContext` devuelve `null`. `isEnabled() === false` al empezar, `setEnabled(true)` no lanza y `play` no lanza.
  - `notifies subscribers`.
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- sfx`. Debe fallar.
- [ ] **Step 3: Implementa** `sfx.ts`, el hook y el botón.
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: E2E.** En `inicio.spec.ts`, el botón «Activar sonido» existe con `aria-pressed="false"`. Al pulsarlo cambia a «Silenciar sonido». Tras recargar la página sigue activado.
  - La cabecera cambia en todas las pantallas: captura `cabecera-sonido` a los tres tamaños con `layoutProblems` vacío.
  - No es una pantalla rediseñada, así que no lleva rúbrica.
  - Copia y restauración de los PNG.
- [ ] **Step 6: Commit.** `Sonidos de interfaz generados, apagados por defecto y con botón de silencio`

---

### Task 3: `PokemonSelector` con estados de carga, vacío y error con acción, y autofoco sin desplazar

**Files:**
- Modify:
  - `frontend/src/room/PokemonSelector.tsx`;
  - `frontend/src/hooks/usePokemonPool.ts`, que devuelve además `retry()`;
  - las llamadas de los 4 juegos que usan el selector: `PokedexDistanceGame.tsx`, `TypeDuelGame.tsx`, `PokemonImpostorGame.tsx` y `LearnsetGuessGame.tsx`.
- Create: `frontend/src/room/pokemon-selector-state.ts`, `pokemon-selector-state.test.ts`.

**Interfaces:**
- `PokemonSelector` acepta además estas props opcionales, que no cambian a los otros 14 juegos:
  - `loading?: boolean`;
  - `loadError?: string`;
  - `onRetry?(): void`.
- `usePokemonPool(...)` devuelve `{ pokemon, error, loading, retry }`.
- `export type SelectorView = 'loading' | 'error' | 'no-matches' | 'results' | 'prompt';`
- `export function selectorView(input: { loading: boolean; loadError: string; query: string; resultCount: number }): SelectorView`
  - El orden de prioridad es error > loading > no-matches > results/prompt.
- Vistas:
  - `loading`: 6 `.skeleton` de `h-16` con `aria-busy`.
  - `error`: `.status-error` con `role="alert"` y un `btn-ghost` «Reintentar».
  - `no-matches`: `.empty-state` con «No hay ningún Pokémon que coincida con “x”.» y un `btn-ghost` «Borrar búsqueda», que devuelve el foco al input.
- **Autofoco:** se quita `autoFocus` del `<input>` y se hace `inputRef.current?.focus({ preventScroll: true })` en un `useEffect` cuando `autoFocus` es verdadero. Así la cabecera fija deja de tapar contenido (README de e2e, «Encaje»).

- [ ] **Step 1: Tests que fallan:**
  - `selectorView` con los cinco casos;
  - `renderToStaticMarkup(<PokemonSelector pokemon={[]} loading … />)` contiene `aria-busy="true"` y `skeleton`;
  - con `loadError` contiene `role="alert"` y «Reintentar».
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- pokemon-selector`. Debe fallar.
- [ ] **Step 3: Implementa** y pasa `loading`, `error` y `retry` desde las 4 pantallas.
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: E2E.**
  - Nuevo test `pokedex-distance: buscador sin coincidencias`: escribe `zzzz`, comprueba que aparecen el estado vacío y «Borrar búsqueda», lo pulsa y el input queda vacío y con el foco.
  - Captura `juego-buscador-vacio` a los tres tamaños y en claro, con `layoutProblems` vacío.
  - **Rúbrica** «Juego · buscador» ≥19.
  - Copia y restauración de los PNG.
- [ ] **Step 6: Commit.** `Buscador de Pokémon con carga, error y búsqueda vacía con acción (Rúbrica Juego buscador: … = N/24)`

---

### Task 4: «Cómo se juega» de los 6 juegos en el lobby y carrusel accesible

**Files:**
- Modify: `frontend/src/components/HowToPlayCarousel.tsx`, `HowToPlayCarousel.test.tsx`
- Create:
  - `frontend/src/games/how-to-play.tsx`, `how-to-play.test.ts`;
  - `frontend/src/room/GameHowToPlayDialog.tsx`.
- Modify: `frontend/src/room/Lobby.tsx:208-227` (rejilla de juegos) y `frontend/src/styles.css` (`.lobby-game-cell`).
- Modify: `e2e/tests/juegos.spec.ts`

**Interfaces:**
- `export interface HowToPlaySlide { eyebrow: string; title: string; description: string; visual: ReactNode }`
- `export function HowToPlayCarousel(props: { slides?: readonly HowToPlaySlide[]; heading?: string; kicker?: string; footer?: ReactNode; idPrefix?: string }): JSX.Element`
  - Sin props hace lo mismo que ahora: el test de «Ver consejo 4» se conserva.
  - `idPrefix` evita ids duplicados si hay dos carruseles en la página.
  - Los puntos son botones de 44×44 (`min-h-11 min-w-11`) con un `span` interior.
  - El punto activo se marca con `scale-x-[2.6]` y `bg-aqua`, sin transición de anchura ni de color.
  - Las flechas tienen `min-h-11`.
  - Navegación con flechas ← → sobre la región.
- `export const gameHowToPlay: Readonly<Record<string, readonly [HowToPlaySlide, HowToPlaySlide, HowToPlaySlide]>>`, con las claves de los 6 ids.
  - `eyebrow`: `Paso N de 3`.
  - `visual`: icono de `lucide-react` a 56 px en un cuadrado `rounded-2xl` con el tinte del token.
  - `title` es **literal**; `description` también.

| Juego | Paso | `title` | `description` | Icono / token |
|---|---|---|---|---|
| `pokedex-distance` | 1 | Te damos un número de Pokédex | Cada ronda sale un objetivo, por ejemplo el #025. | `Target` / berry |
| | 2 | Elige el Pokémon cuyo número esté más cerca | Búscalo por su nombre: el buscador no muestra números. | `Search` / aqua |
| | 3 | El más lejano cae. El último en pie gana | Si empatáis en la peor distancia, hay desempate. | `UserX` / electric |
| `shiny-vote` | 1 | Uno de estos es el shiny oficial | Verás entre 3 y 6 cartas en cada ronda. | `Sparkles` / electric |
| | 2 | Los demás están recoloreados | Fíjate en los colores del shiny de verdad. | `Palette` / aqua |
| | 3 | Cuanto antes aciertes, más puntos (4/3/2/1) | Los tres primeros en acertar suman bonus. | `Timer` / leaf |
| `pokemon-impostor` | 1 | Todos menos el impostor ven el Pokémon | El impostor no lo sabe e intenta disimular. | `Eye` / aqua |
| | 2 | Da una pista corta sin decir el nombre | Por turnos y con 25 caracteres como máximo. | `MessageSquareText` / electric |
| | 3 | Votad al sospechoso; el impostor gana si adivina el Pokémon o iguala en número | Si no lo tienes claro, puedes votar «Saltar». | `Vote` / berry |
| `higher-lower` | 1 | Mira la stat del Pokémon de la izquierda | La categoría cambia en cada ronda. | `BarChart3` / aqua |
| | 2 | ¿El de la derecha la tiene mayor, menor o igual? | Responde antes de que se acabe el tiempo. | `ArrowUpDown` / electric |
| | 3 | Igual vale más puntos y las rachas dan bonus | Acertar en la primera mitad de la ronda suma +1. | `Flame` / berry |
| `type-duel` | 1 | Cada uno elige un tipo en secreto | Los dos tipos se revelan a la vez. | `LockKeyhole` / berry |
| | 2 | Juntos forman una combinación: encuentra un Pokémon que la tenga EXACTA | Si elegís el mismo tipo, vale un Pokémon de ese único tipo. | `Swords` / aqua |
| | 3 | El primero que acierte gana 5 puntos | Tras un fallo esperas un segundo antes de volver a probar. | `Trophy` / electric |
| `learnset-guess` | 1 | Ves los movimientos que aprende un Pokémon por nivel | Empiezas con unos pocos movimientos. | `BookOpen` / aqua |
| | 2 | Cada 7 s se revelan más | Cada pista nueva baja lo que vale acertar. | `Clock3` / electric |
| | 3 | Cuanto antes aciertes, más puntos | Los dos primeros en acertar suman bonus. | `Zap` / leaf |

  Antes de escribirlos, comprueba en el código:
  - Shiny `optionCount` 3–6 y bonus 3/2/1 (`shiny-vote/config.ts`, `rules.ts`);
  - `IMPOSTOR_CLUE_MAX_CODE_POINTS = 25` y el voto `IMPOSTOR_SKIP_TARGET`;
  - `HIGHER_LOWER_SPEED_BONUS` en la primera mitad;
  - `requiredTypeCombination` del mismo tipo y `TYPE_DUEL_ATTEMPT_COOLDOWN_MS = 1_000`;
  - `LEARNSET_HINT_INTERVAL_MS = 7_000` y `LEARNSET_ORDER_BONUSES = [2, 1]`.

  Si alguno no coincide, corrige la descripción, nunca el motor, y anótalo.
- `export function GameHowToPlayDialog(props: { gameId: string; gameName: string; open: boolean; onClose(): void }): JSX.Element | null`
  - `<dialog className="modal-dialog">` con `showModal()`, cierre con Esc y con el botón «Cerrar».
  - El foco vuelve al botón que lo abrió.
- **Lobby:** cada juego de `gameHowToPlay` se envuelve en `<div className="lobby-game-cell">`. El `<button className="lobby-game-option">` queda igual, así que `seleccionarJuego` sigue funcionando. Debajo va un `btn-ghost` «Cómo se juega», con `aria-label={`Cómo se juega a ${name}`}` y `min-h-11`. Ese botón **no** lleva la clase `lobby-game-option` y no se deshabilita para los invitados.

- [ ] **Step 1: Tests que fallan:**
  - `how-to-play.test.ts`: cada uno de los 6 ids tiene 3 pasos con `title` igual a la tabla.
  - `HowToPlayCarousel.test.tsx`, nuevo caso:
    - con `slides` de un juego, el markup contiene «Paso 3 de 3»;
    - los puntos llevan `min-h-11`;
    - **no** contiene `transition-[width`.
  - `Lobby.test.tsx`: con `pokedex-distance` en `availableGames`, el markup contiene «Cómo se juega a Pokédex Distance».
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- how-to-play HowToPlayCarousel Lobby`. Debe fallar.
- [ ] **Step 3: Implementa.**
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: E2E.**
  - Test `lobby: cómo se juega`: un invitado (no host) abre «Cómo se juega a Type Duel», avanza con «Siguiente» hasta «Paso 3 de 3», cierra con Esc y el foco vuelve al botón.
  - Captura con el diálogo abierto: `lobby-como-se-juega` a los tres tamaños y en claro.
  - Vuelve a capturar el lobby en rotación (`lobby-rotacion`, en la pestaña «Modo y sesión» con Aleatorio y varios juegos), a los tres tamaños y en claro.
  - **Rúbrica:** «Lobby · cómo se juega» y «Lobby · rotación» (hoy 17/24, ledger de la Fase 0). Las dos deben llegar a ≥19 sin ningún 0. Palancas:
    - `tabular-nums` en contadores;
    - `.status-error` con `role="alert"` en vez del aviso fijo propio de `Lobby.tsx:288`;
    - acción «Borrar búsqueda» en el `.empty-state` del buscador de juegos.
  - Copia y restauración de los PNG.
- [ ] **Step 6: Commit.** `Cómo se juega de los 6 minijuegos desde el lobby (Rúbrica Lobby cómo se juega: … = N/24; Lobby rotación: … = N/24)`

---

### Task 5: Intro de partida en `GAME_STARTING` con «Saltar» (sala Java + pantalla)

**Files:**
- Modify (shared):
  - `packages/shared/src/games/contracts.ts`: `introMs?: number` en `MiniGameManifest` y `export const GAME_INTRO_MS = 10_000`.
  - Los `manifest` de los 6 juegos, con `introMs: GAME_INTRO_MS`.
  - `packages/shared/src/room.ts`:
    - `export interface GameIntroView { gameInstanceId: string; endsAt: number; skippedIds: string[] }`;
    - `gameIntro?: GameIntroView | null` en `RoomView`, tras `gameSkipState`;
    - `export const skipGameIntroRequestSchema = z.object({ gameInstanceId: z.string().uuid() }).strict()`;
    - evento `'game:intro:skip': (payload: SkipGameIntroRequest, ack: SocketAck) => void`.
- Modify (Java):
  - `domain/game/GameManifest.java`: `@Nullable Long introMs`, en la posición del TS;
  - `application/rooms/RoomCoordinator.java`, `RoomView.java`, `RoomViews.java` y el estado de sala vivo (`LiveRoom`);
  - `adapters/in/ws/RoomWebSocket.java:199`, para el `case "game:intro:skip"`;
  - `backend/src/main/resources/games/registry.json` (con `npm run registry:export`).
- Create: `backend/src/test/java/es/pokemonuniverse/application/rooms/RoomIntroTest.java`, usando `RoomTestKit`.
- Modify (front):
  - `frontend/src/screens/RoomPage.tsx:22`, que en `GAME_STARTING` con `room.gameIntro` pinta `GameIntro`;
  - `frontend/src/room/RoomContext.tsx`, con `skipIntro(request)`.
- Create: `frontend/src/room/GameIntro.tsx` y `frontend/src/room/game-intro.ts` + `game-intro.test.ts`.
- Modify: `e2e/src/helpers.ts`, con `saltarIntro(pages)`, y `e2e/tests/juegos.spec.ts`, con `esperarPantallaDeJuego` y **todos** los tests de las Fases 0 y 1 que arrancan uno de los 6 juegos (recarga, empate forzado, resultado con tipos, votación con Saltar, revelado de Higher or Lower, votos de Shiny, último aviso de Learnset).
- Modify: cualquier otro spec que arranque partida. El juego por defecto del lobby es `pokedex-distance`, que tiene intro. Localízalos con `grep -n "iniciarPartida\|Empezar partida" e2e/tests/*.spec.ts` y añade `saltarIntro([...páginas])` justo después de cada arranque de uno de los 6 juegos. Anota en el informe qué ficheros cambian.

**Interfaces:**
- **Java, `RoomCoordinator`:**
  - `launchGame` deja el estado sin `start` cuando se cumplen las dos condiciones: `module.introMs() != null` y `!room.introducedGameIds.contains(gameId)`.
  - En ese caso guarda `room.intro = new GameIntro(resultId, now + introMs, new LinkedHashSet<>())`, fija `room.phase = GAME_STARTING` y programa `room.introTimer` con `schedulers.schedule`, igual que `presenceGraceTimer` (`:398-406`), con la comprobación `room.introTimer == timer`.
  - Siempre añade `gameId` a `introducedGameIds`.
  - `void beginIntroducedGame(LiveRoom room)`:
    - cancela el temporizador y pone `room.intro = null`;
    - crea un `context(room)` nuevo;
    - `state = engine.start(state, context)`;
    - fija la fase y llama a `schedule(room)` y a `syncAndBroadcast`.
  - `public void skipGameIntro(String playerId, @Nullable JsonNode payload)`:
    - rechaza con `"El minijuego ya ha cambiado."` si no hay intro o el `gameInstanceId` no coincide;
    - añade `playerId` a `skippedIds`;
    - si todos los miembros `CONNECTED` con rol `PLAYER` han saltado, llama a `beginIntroducedGame`.
  - La misma comprobación corre tras cada cambio de presencia durante la intro.
  - `introducedGameIds` se vacía donde la sesión vuelve a empezar (junto a `room.gamesPlayed = 0`, `RoomCoordinator.java:1131`).
  - `room.intro` y `room.introTimer` se limpian en **todos** los sitios donde termina `room.game`: saltar juego por voto, abandono, fin de sesión y cierre de sala (`:180`, `:850` y los demás que encuentres buscando `room.game = null`). El callback del temporizador comprueba `room.introTimer == timer` y `room.game` con el mismo `resultId`; si no coinciden, no hace nada.
  - `introMs` vive en `GameManifest` (`/api/games` y `registry.json`), pero **no** en `ManifestView` (el manifiesto que viaja en la vista de sala), igual que `presenceGraceMs` en la Decisión 9 de la Fase 1.
- **Vista:** `RoomView.gameIntro` (`GameIntroView`) existe solo mientras hay intro, y si no es `null`. No está en el OpenAPI (no cambia).
- **Front:**
  - `export function gameIntroProgress(intro: GameIntroView, members: RoomMemberView[]): { skipped: number; total: number; selfSkipped: boolean }`, que cuenta solo `PLAYER` y `CONNECTED`;
  - `GameIntro`:
    - `HowToPlayCarousel` con `gameHowToPlay[gameId]` y título `Cómo se juega a <nombre>`;
    - cuenta atrás con `useRemainingMs(intro.endsAt)` y `tabular-nums`;
    - `btn-primary` «Saltar» (`aria-busy` mientras envía; tras pulsarlo, «Esperando al resto»);
    - texto «2 de 3 listos».
- **E2E:** `export async function saltarIntro(pages: readonly Page[]): Promise<void>` pulsa «Saltar» en cada página que lo muestre, en un máximo de 15 s.

- [ ] **Step 1: Tests Java que fallan** (`RoomIntroTest`):
  - `introHoldsGameStartingUntilTheDeadline`: tras lanzar Distance, la vista tiene `phase = GAME_STARTING` y `gameIntro.endsAt = now + 10_000`. El motor no ha arrancado (`roundNumber = 0`). Al avanzar el reloj y disparar el temporizador pasa a `ROUND_ACTIVE`.
  - `introStartsWhenEveryConnectedPlayerSkips`.
  - `introStartsWhenTheLastPendingPlayerDisconnects`: con 3 jugadores, 2 saltan y el tercero se desconecta (aunque esté en gracia de presencia, no cuenta como `CONNECTED`). La partida arranca.
  - `introSkipWithAStaleInstanceIsRejected`.
  - `introOnlyOnceForTheSameGameInASession`: la segunda partida del mismo juego arranca directa. Tras empezar sesión nueva vuelve a haber intro.
  - `gamesWithoutIntroStartImmediately`, por ejemplo con `pokeddle-race`.
  - `introPublicStateOfTheSixGamesDoesNotThrow`: la vista de cada uno de los 6 se construye en `GAME_STARTING`.
  - `introTimerIsANoOpAfterTheGameEnds`: durante la intro, la sala vota saltar el juego (o el host termina la sesión). Al disparar después el temporizador, no arranca ningún motor ni cambia la fase.
- [ ] **Step 2:** `cd backend && ./gradlew test --tests '*RoomIntroTest*'`. Debe fallar.
- [ ] **Step 3: Implementa** shared, `npm run build -w @pokemon-universe/shared && npm run registry:export`, y después Java.
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `./gradlew test --tests '*Room*' --tests '*Registry*' --tests '*Golden*'`.
- [ ] **Step 5: Front con TDD.**
  - `game-intro.test.ts`: `gameIntroProgress` excluye espectadores y desconectados.
  - Implementa `GameIntro` y la ruta en `RoomPage`.
  - `npm test -w @pokemon-universe/web`, `npm run lint && npm run typecheck`.
- [ ] **Step 6: E2E.**
  - `esperarPantallaDeJuego` llama a `saltarIntro` cuando ve «Saltar».
  - Test nuevo `intro: los pasos antes de la primera ronda`, con Learnset y 3 jugadores:
    - se ven «Paso 1 de 3» y la cuenta atrás;
    - salta uno y se lee «1 de 3 listos»;
    - saltan los demás y aparece la ronda;
    - captura `juego-intro` a los tres tamaños y en claro, antes de saltar.
  - `npm run test:e2e -- juegos`. Pasan los 28 juegos y los tests de las Fases 0 y 1.
  - **Rúbrica** «Juego · intro» ≥19.
  - Copia y restauración de los PNG.
- [ ] **Step 7: Commit.** `Intro de 10 s con los pasos del minijuego al empezar, saltable entre todos (Rúbrica Juego intro: … = N/24)`

---

### Task 6: Pokédex Distance: historial de rondas, desempates superados y pantalla de resultados propia

**Files:**
- Modify: `packages/shared/src/games/pokedex-distance/{types,rules,server}.ts`, `server.test.ts`
- Modify: `backend/.../engines/pokedexdistance/*` (estado, stats, vista pública y reglas) y su test.
- Modify: `packages/shared/golden/scenarios/pokedex-distance.ts`, `backend/src/test/resources/golden/pokedex-distance/*`, `registry.json`
- Create:
  - `frontend/src/room/PokedexDistanceResults.tsx`;
  - `frontend/src/room/pokedex-distance-results.ts`, `pokedex-distance-results.test.ts`.
- Modify: `frontend/src/games/registry.ts:86`, que pasa a usar `PokedexDistanceResults`.
- Delete: `frontend/src/room/Results.tsx`, si nadie más lo importa (compruébalo con `grep`).

**Interfaces:**
- **TS, `types.ts`:**
  - `export interface DistanceRoundRecord { roundNumber: number; tiebreakDepth: number; targetDexNumber: number; distances: Record<string, number | null>; eliminatedIds: string[] }`.
    - Las claves de `distances` son los `eligibleIds` de la ronda. `null` significa sin respuesta.
    - `eliminatedIds` va vacío si hubo empate.
  - `PlayerRoundStats` gana `tiebreaksWon: number` tras `roundsSurvived`.
  - `PokedexDistanceState` gana `roundHistory: DistanceRoundRecord[]` tras `eliminations`.
  - `PokedexDistancePublicState` gana `roundHistory: DistanceRoundRecord[]` tras `lastRound`: la lista completa en `GAME_RESULTS` y `[]` en el resto de fases.
- **TS, `rules.ts`:** `buildResults` añade `tiebreaksWon` tras `averageDistance`. `emptyPlayerStats` lo inicia a 0.
- **Regla de `tiebreaksWon`:** cuando se resuelve una ronda con `tiebreakDepth > 0` y alguien cae, cada elegible de esa ronda que **no** cae suma 1. Un desempate que vuelve a empatar no suma.
- **Manifiesto:** métrica nueva `{ key: 'tiebreaksWon', label: 'Desempates superados', aggregation: 'SUM' }` tras `selections`.
- **Java:** espejo con los mismos nombres y posiciones.
- **Front, `pokedex-distance-results.ts`:**
  - `export interface DistancePlayerSummary { playerId: string; distances: Array<number | null>; bestDistance: number | null; eliminatedInRound: number | null }`
  - `export function distanceResultsSummary(history: readonly DistanceRoundRecord[], playerIds: readonly string[]): { players: DistancePlayerSummary[]; best: { playerId: string; distance: number; roundNumber: number } | null }`
    - `distances` tiene una columna por registro y `null` donde el jugador no era elegible.
    - `best` es la distancia mínima no nula. En caso de empate gana la ronda anterior.
  - `export function distanceRoundLabel(record: DistanceRoundRecord): string`: `R3` o `R3 · D1`.
- **Pantalla `PokedexDistanceResults`** (dentro de `ResultsShell`):
  1. Clasificación con `ranking-row`, en la que cada fila dice «Cayó en la ronda N» o «Ganador».
  2. Tarjeta «Mejor acierto» (`electric`) con jugador, distancia y ronda.
  3. Tabla «Distancia por ronda»:
     - filas = jugadores, columnas = rondas, con `overflow-x-auto` en la tabla y nunca en la página;
     - celdas `tabular-nums`: `leaf` y ✓ si es 0, `aqua` si es ≤10, `ink` en el resto y «—» si es `null`;
     - la columna de caída lleva `berry` y ✗.
  4. Botones del host iguales que hoy.

- [ ] **Step 1: Tests que fallan** (`server.test.ts`):
  - `records every resolved round in roundHistory`: una ronda normal, un empate y su desempate dan 3 registros con las distancias y `eliminatedIds` correctos.
  - `tiebreak survivors earn tiebreaksWon`: el superviviente del desempate tiene 1 y el que cae tiene 0.
  - `roundHistory is only public in GAME_RESULTS`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- pokedex-distance`. Debe fallar.
- [ ] **Step 3: Implementa** en TS.
- [ ] **Step 4:** Repite el Step 2. Debe pasar.
- [ ] **Step 5: Golden.**
  - Escenario nuevo `round-history-tiebreak` (seed nueva, 3 jugadores): empate en la ronda 1, desempate resuelto y fin.
  - `golden:export` y `registry:export`.
  - Diff esperado en las fixtures viejas: solo `roundHistory`, `tiebreaksWon` y el manifiesto.
- [ ] **Step 6: Port Java.** `./gradlew test --tests '*GoldenReplayTest*' --tests '*PokedexDistance*' --tests '*Registry*'`.
- [ ] **Step 7: Front con TDD** (`pokedex-distance-results.test.ts`):
  - `summarises distances, best hit and elimination round`;
  - `distanceResultsSummary handles no-response players and a deserted game`: un jugador con `null` en todas sus rondas da `bestDistance: null`; con `winnerId: null` no hay `NaN` y `eliminatedInRound` es la ronda real.
  - Implementa la pantalla y regístrala.
- [ ] **Step 8: E2E.**
  - Amplía el test `pokedex-distance: empate forzado tras tres desempates` (o el de recarga, el que acabe la partida) hasta `GAME_RESULTS`.
  - Captura `juego-pokedex-distance-resultados` a los tres tamaños y en claro.
  - La tabla no provoca scroll horizontal de la página a 390.
  - **Rúbrica** «Distance · resultados» ≥19.
  - Copia y restauración de los PNG.
- [ ] **Step 9:** `npm run lint && npm run typecheck`.
- [ ] **Step 10: Commit.** `Pokédex Distance: resultados propios con distancia por ronda, mejor acierto y desempates superados (Rúbrica Distance resultados: … = N/24)`

---

### Task 7: Pokédex Distance: regla numérica al revelar, cut-in de acierto exacto y contador de elecciones

**Files:**
- Create:
  - `frontend/src/room/DistanceRuler.tsx`;
  - `frontend/src/room/distance-ruler.ts`, `distance-ruler.test.ts`.
- Modify: `frontend/src/room/PokedexDistanceGame.tsx`, `pokedex-distance-selection.ts` y su test.

**Interfaces:**
- `export interface RulerMarker { playerId: string; dexNumber: number | null; distance: number | null; offsetPercent: number; lane: number; eliminated: boolean; exact: boolean }`
- `export function rulerLayout(lastRound: PublicRoundResult): { window: number; markers: RulerMarker[] }`
  - El objetivo está en el 50 %.
  - `window = max(10, ceil(maxDistance × 1.15))`.
  - `offsetPercent = 50 + (dex − target) / window × 50`, limitado a 2–98.
  - Los marcadores a menos de 8 puntos de otro suben de carril (`lane` 0–2).
  - Los que no respondieron quedan fuera de la regla, con `dexNumber: null`.
- `export function distancePickedCountText(selected: number, eligible: number): string`: `2 de 3 han elegido`, `1 de 2 ha elegido`.
- **Revelación (`ROUND_RESULTS`):**
  - Regla horizontal con marcas, el objetivo en el centro (sprite y `#025`) y un sprite por jugador en su posición, con un chip de distancia.
  - Los marcadores entran con `motion-enter-up` (los eliminados en `berry` con ✗ y los exactos en `leaf` con ✓).
  - Debajo siguen las tarjetas actuales.
  - Con reducción de movimiento se ve estática (regla global).
- **Durante la ronda:**
  - El chip `distancePickedCountText` va junto a «Ronda N», con `tabular-nums`.
  - Al confirmar el acierto exacto propio (`playerState.exactHit` pasa a `true`) aparece `RevealCutIn` en `electric`: título «¡Acierto exacto!», subtítulo `#025` y `useSfxCue('hit', …)`.
  - El texto «¡EXACT HIT!» de la tarjeta pasa a «¡Acierto exacto!».
  - Con `ROUND_RESULTS`, `useSfxCue('reveal', roundNumber)`.

- [ ] **Step 1: Tests que fallan:**
  - `rulerLayout`: objetivo centrado, simetría, límite 2–98, carriles con dos casi iguales y sin respuesta fuera.
  - `distancePickedCountText` en singular y plural.
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- distance-ruler pokedex-distance-selection`. Debe fallar.
- [ ] **Step 3: Implementa.**
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: E2E** (amplía `pokedex-distance: recarga a mitad de ronda`):
  - Tras la revelación, captura `juego-pokedex-distance-revelacion` a los tres tamaños y en claro.
  - Con la reducción por defecto, `animacionDe(<elemento animado>) === 'none'` mientras se ve la regla.
  - Con `conMovimiento(page)`, `animacionDe` de un marcador de la regla es `motion-enter-up`.
  - El cut-in de acierto exacto no se puede forzar sin conocer la respuesta: queda cubierto por Vitest (`RevealCutIn`), igual que en la Fase 1.
  - **Rúbrica** «Distance · revelación» ≥19.
  - Copia y restauración de los PNG.
- [ ] **Step 6: Commit.** `Pokédex Distance: regla numérica al revelar, acierto exacto destacado y contador de elecciones (Rúbrica Distance revelación: … = N/24)`

---

### Task 8: Shiny Quiz: revelación configurable, carta que gira, antes/después y esqueleto de carga

**Files:**
- Modify: `packages/shared/src/games/shiny-vote/{config,server}.ts`, `server.test.ts`. `REVEAL_DURATION_MS` pasa a `config.revealSeconds × 1000`.
- Modify: `backend/.../engines/shinyvote/{ShinyVoteConfig,ShinyVoteEngine}.java` y su test.
- Modify:
  - `packages/shared/golden/scenarios/shiny-vote.ts` y las fixtures;
  - `registry.json`, `config-messages.json`, `generate-migration-cases.ts` y `migration-cases.json`.
- Modify:
  - `frontend/src/games/shiny-vote/{ConfigPanel,ShinyOptionCard,ShinyGameSidebar}.tsx`;
  - `frontend/src/room/ShinyVoteGame.tsx`.
- Create: `frontend/src/games/shiny-vote/reveal.ts`, `reveal.test.ts`.
- Create: `packages/shared/src/pokemon/sprite-path.ts`, `sprite-path.test.ts` (exportado desde `public.ts` e `index.ts`).

**Interfaces:**
- **TS:** `revealSeconds: z.number().int().min(3).max(6)` tras `voteVisibility`, con valor por defecto `4`. `export const SHINY_REVEAL_SECONDS_RANGE = { min: 3, max: 6 } as const`.
- **Java:** componente `int revealSeconds` en la misma posición, con `defaults()` = 4.
- **Front, `reveal.ts`:**
  - `export function shinyCardsReady(loaded: number, total: number, elapsedMs: number, timeoutMs = 4_000): boolean`;
  - `export function shinyRoundFeedback(roundResult: { correct: boolean; points: number } | null, voted: boolean): { tone: 'leaf' | 'berry'; label: string } | null`:
    - `+N` en `leaf` si acierta;
    - `+0` en `berry` si falla o no vota;
    - `null` antes de revelar;
  - Produces (shared): `packages/shared/src/pokemon/sprite-path.ts` con `export function pokemonSpritePath(id: string): string` = `` `/api/pokemon/${encodeURIComponent(id)}/sprite` ``, exportada desde `public.ts` e `index.ts`, con su test (`sprite-path.test.ts`: `pokemonSpritePath('raichu-alola') === '/api/pokemon/raichu-alola/sprite'`). La Task 10 la reutiliza.
  - El «antes/después» usa `apiAsset(pokemonSpritePath(correct.pokemonId))`, con el mismo envoltorio que `imageSource` de `ShinyOptionCard.tsx:7`.
- **Revelación:**
  - La carta correcta usa `motion-flip` y un destello ✨ con `motion-enter-up`.
  - Las incorrectas llevan `grayscale opacity-60`, **sin** transición.
  - La propia se marca con ✓ o ✗ y `ScorePop` con los puntos.
  - Bajo la rejilla, la franja «Antes / después» muestra el sprite normal (`pokemonSpritePath(correct.pokemonId)`, con texto «Normal») y la carta correcta («Shiny»), en `motion-enter-up`.
  - `useSfxCue(correct ? 'hit' : 'miss', roundNumber)`.
- **Carga:**
  - Mientras `!shinyCardsReady`, cada carta muestra `.skeleton` y está `disabled`.
  - El contenedor lleva `aria-busy="true"` y el texto «Cargando cartas…».
- **Arreglos de `ShinyOptionCard`:**
  - `text-[.68rem]` pasa a `text-xs`;
  - `min-h-7` pasa a `min-h-9`;
  - se elimina `shadow-[0_2px_10px_rgba(240,191,84,.18)]`;
  - en `animate-spin` ya no hace falta nada, porque lo cubre la regla global;
  - se elimina `transition` de `box-shadow` y `background-color` en `.shiny-option-card` (`styles.css`).
- **ConfigPanel:** `ConfigRange` «Duración de la revelación», de 3 a 6 s.

- [ ] **Step 1: Tests que fallan:**
  - `server.test.ts`: `reveal lasts revealSeconds` (`revealSeconds: 6` → `nextTransitionAt = now + 6000`) y `parses revealSeconds out of range as invalid` (2 y 7).
  - `reveal.test.ts`:
    - `shinyCardsReadyAfterTimeoutEvenIfImagesFail`: `(0, 4, 4000)` → `true`;
    - `(3, 4, 100)` → `false`;
    - `(4, 4, 0)` → `true`;
    - `shinyRoundFeedback` en sus tres casos.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- shiny-vote` y `npm test -w @pokemon-universe/web -- shiny`. Deben fallar.
- [ ] **Step 3: Implementa** en TS.
- [ ] **Step 4: Golden y configuración.**
  - Escenario `reveal-seconds-six` (seed nueva, 2 jugadores, 3 rondas).
  - `configCases` con 2 y 7 como inválidos.
  - `golden:export` y `registry:export`.
  - Migración: `add('shiny-vote: sin revealSeconds toma 4', 'shiny-vote', { ...def('shiny-vote'), revealSeconds: undefined })`. Si el generador no admite `undefined`, borra la clave del objeto antes de `add`.
  - Diff esperado en las fixtures viejas: `revealSeconds` en la configuración y `nextTransitionAt` de la revelación (+1000).
- [ ] **Step 5: Port Java.**
  - `./gradlew test --tests '*GoldenReplayTest*' --tests '*ShinyVote*'`.
  - Snapshot de mensajes: revisa que en el diff solo cambia `revealSeconds`.
- [ ] **Step 6: Front.** Implementa la pantalla y el panel. `npm test -w @pokemon-universe/web`, `npm run lint && npm run typecheck`.
- [ ] **Step 7: E2E** (amplía `shiny-vote: votos al revelar`):
  - En la revelación, captura `juego-shiny-vote-revelacion` a los tres tamaños y en claro.
  - Se ven «Normal» y «Shiny». La imagen normal responde 200 en `/api/pokemon/…/sprite`.
  - `animacionDe(<elemento animado>) === 'none'` con la reducción. Con `conMovimiento`, `animacionDe` de la carta correcta es `motion-flip`.
  - **Rúbrica** «Shiny · revelación» ≥19.
  - Copia y restauración de los PNG.
- [ ] **Step 8: Commit.** `Shiny Quiz: revelación de 3 a 6 s con carta que gira, antes y después y cartas que esperan a cargar (Rúbrica Shiny revelación: … = N/24)`

---

### Task 9: Type Duel: VS al revelar los tipos y contador de soluciones

**Files:**
- Modify: `packages/shared/src/games/type-duel/{types,server}.ts`, `server.test.ts`
- Modify: `backend/.../engines/typeduel/*` (vista pública) y su test.
- Modify: `packages/shared/golden/scenarios/type-duel.ts` y las fixtures.
- Modify: `frontend/src/room/TypeDuelGame.tsx:23`, `frontend/src/room/type-duel-result.ts` y su test.

**Interfaces:**
- `TypeDuelPublicState` gana `solutionCount: number | null` tras `requiredTypes`: `validPokemonIds.length` en `TYPE_REVEAL` y `POKEMON_SEARCH`, y `null` en el resto.
- Java: el mismo campo, en la misma posición.
- `export function typeDuelSolutionsText(count: number): string`: `1 Pokémon tiene esta combinación` o `N Pokémon tienen esta combinación`.
- **`TYPE_REVEAL` y `POKEMON_SEARCH`:**
  - Bloque VS: nombre y `TypeBadge` del primer duelista con `motion-enter-left`, «VS» en `font-display text-4xl` con `motion-bump` y el segundo con `motion-enter-right`.
  - Debajo va el texto del contador.
  - `useSfxCue('clang', roundNumber)` al entrar en `TYPE_REVEAL`.
  - `useSfxCue('win', …)` cuando gana el duelo uno mismo.
  - `INVALID_COMBINATION` conserva su aviso.

- [ ] **Step 1: Tests que fallan:**
  - `exposes the number of valid Pokémon during the reveal and the search`;
  - `null outside them`;
  - `typeDuelSolutionsText` en singular y plural.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- type-duel`. Debe fallar.
- [ ] **Step 3: Implementa** en TS.
- [ ] **Step 4: Golden.**
  - Escenario `solution-count` (seed nueva, 3 jugadores, 3 rondas).
  - `golden:export`.
  - Diff esperado en las fixtures viejas: solo `solutionCount`.
- [ ] **Step 5: Port Java.** `./gradlew test --tests '*GoldenReplayTest*' --tests '*TypeDuel*'`.
- [ ] **Step 6: Front.** Implementa el bloque VS. `npm test -w @pokemon-universe/web`, `npm run lint && npm run typecheck`.
- [ ] **Step 7: E2E** (amplía `type-duel: resultado con tipos`):
  - Durante los 2 s de `TYPE_REVEAL` o ya en `POKEMON_SEARCH`, se ven «VS» y «… tienen esta combinación».
  - Captura `juego-type-duel-vs` a los tres tamaños y en claro.
  - `animacionDe(<elemento animado>) === 'none'` con la reducción.
  - **Rúbrica** «Type Duel · VS» ≥19.
  - Copia y restauración de los PNG.
- [ ] **Step 8: Commit.** `Type Duel: enfrentamiento VS al revelar los tipos con el número de soluciones (Rúbrica Type Duel VS: … = N/24)`

---

### Task 10: Higher or Lower: sprites por el proxy

**Files:**
- Consumes: `pokemonSpritePath` de `packages/shared/src/pokemon/sprite-path.ts` (Task 8).
- Modify: `packages/shared/src/games/higher-lower/server.ts:24`, `server.test.ts`
- Create: Java `domain/pokemon/PokemonSpritePaths.java` (o junto al catálogo, donde viva `Pokemon`).
- Modify: `frontend/src/room/HigherLowerGame.tsx`. Los `<img>` de `previousPokemon` y `currentPokemon` pasan por `apiAsset(sprite)` cuando el sprite empieza por `/api/`, igual que `imageSource` en `ShinyOptionCard.tsx:7`. Así siguen funcionando si `VITE_API_URL` apunta a otro origen.
- Modify:
  - `HigherLowerEngine.java:99`;
  - `PokemonController.java`, para que el selector use el mismo helper y no un literal duplicado.
- Modify: fixtures de `higher-lower` (con `golden:export`).

**Interfaces:**
- TS: `pokemonView` usa `pokemonSpritePath(pokemon.id)` (Task 8).
- Java: `static String of(String id)`, con `URLEncoder.encode(id, UTF_8).replace("+", "%20")`. Para slugs da lo mismo que en TS.

- [ ] **Step 1: Test que falla:** `public pokemon sprites never carry the PokéAPI path`. En `ROUND_ACTIVE` y `ROUND_RESULTS`, `previousPokemon.sprite` y `currentPokemon.sprite` cumplen `^/api/pokemon/[^/]+/sprite$`.
- [ ] **Step 2:** `npm run build -w @pokemon-universe/shared && npm test -w @pokemon-universe/shared -- higher-lower`. Debe fallar.
- [ ] **Step 3: Implementa.** Ejecuta `golden:export`. En el diff solo cambian los `sprite`.
- [ ] **Step 4:** `./gradlew test --tests '*GoldenReplayTest*' --tests '*HigherLower*' --tests '*PokemonController*'`.
- [ ] **Step 5:** `npm run lint && npm run typecheck`.
- [ ] **Step 6: Commit.** `Higher or Lower: sprites por el proxy para no delatar el número de Pokédex`

---

### Task 11: Higher or Lower: barras al revelar, racha que salta, textos y botones a la vista en móvil

**Files:**
- Create: `frontend/src/room/HigherLowerBars.tsx`
- Modify:
  - `frontend/src/room/higher-lower-labels.ts`, `higher-lower-labels.test.ts`;
  - `frontend/src/room/HigherLowerGame.tsx`;
  - `frontend/src/styles.css` (`.answer-dock`).

**Interfaces:**
- `export function higherLowerBars(previous: number, current: number): { previousScale: number; currentScale: number; leader: 'previous' | 'current' | 'tie'; diffLabel: string }`
  - Las escalas van de 0 a 1 sobre `max(previous, current)`. Si el máximo es 0, las dos escalas valen 0.
  - `diffLabel`: `+23` si el actual es mayor, `−23` (con signo menos U+2212) si es menor, `=` si son iguales.
- `export function higherLowerOutcomeLine(outcome: HigherLowerOutcome): string`:
  - `Racha 3 (+1) · +1 rapidez`;
  - `Racha 1`;
  - `Racha 2 · +1 rapidez`.

  Sustituye a `higherLowerOutcomeDetail` (borra la función y sus tests).
- `export function higherLowerStreakMilestone(outcome: HigherLowerOutcome): { title: string; subtitle: string } | null`: con `correct` y `streak ∈ {3, 5, 10}`, devuelve `{ title: '¡Racha ×5!', subtitle: '+2' }`. El subtítulo es `+${streakBonus}`, u omite el número si es 0 (`'¡Sigue así!'`).
- **Pantalla:**
  - En la revelación, `HigherLowerBars`: dos filas (anterior y actual) con nombre, valor `tabular-nums` y barra `motion-grow-x` con `scaleX(...)`.
    - La líder va en `leaf`, la otra en `ink/30`.
    - Con empate, las dos en `electric`.
    - El chip `diffLabel` va junto a la actual.
  - La racha 🔥 de la barra lateral usa `motion-bump` con `key` igual al valor.
  - El hito de racha propio lanza `RevealCutIn` en `electric`.
  - Sonidos:
    - `useSfxCue('tick', …)` al bloquear la respuesta;
    - `'hit'` o `'miss'` al revelar.
- **390×844:**
  - Por debajo de `sm`, las dos tarjetas van en `grid-cols-2`, con sprites `h-24 w-24` y título `text-lg`.
  - Los botones de respuesta van en `<div className="answer-dock">`: `position: sticky; bottom: .5rem` y fondo `surface` al 97 %, con borde. Es el mismo patrón que `.connections-submit`.
  - Los botones tienen `min-h-11`.

- [ ] **Step 1: Tests que fallan:**
  - `higherLowerBars handles zero and equal values`: `(0, 0)` da escalas 0 y `tie` con `=`; `(50, 50)` da 1 y 1; `(40, 63)` da `+23` y `current`; `(63, 40)` da `−23`.
  - `higherLowerOutcomeLine` en sus tres casos.
  - `higherLowerStreakMilestone` con racha 3, 4 y 5 y con fallo.
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- higher-lower`. Debe fallar.
- [ ] **Step 3: Implementa.**
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: E2E** (amplía `higher-lower: revelado y clasificación`):
  - A 390×844, durante `ROUND_ACTIVE` y sin desplazar, los tres botones están `toBeInViewport()`.
  - Captura `juego-higher-lower` (ronda activa) y `juego-higher-lower-revelacion` a los tres tamaños y en claro.
  - `animacionDe(<elemento animado>) === 'none'` con la reducción. Con `conMovimiento`, `animacionDe` de una barra es `motion-grow-x`.
  - **Rúbrica:** «Higher or Lower · juego» (hoy 14/24) y «Higher or Lower · revelación», las dos ≥19 sin ningún 0.
  - Copia y restauración de los PNG.
- [ ] **Step 6: Commit.** `Higher or Lower: barras comparadas al revelar, rachas destacadas y respuestas a la vista en móvil (Rúbrica Higher or Lower juego: … = N/24; Higher or Lower revelación: … = N/24)`

---

### Task 12: Pokémon Impostor: cut-in de eliminación

**Files:**
- Modify:
  - `frontend/src/room/PokemonImpostorGame.tsx:77`;
  - `frontend/src/room/pokemon-impostor-texts.ts`, `pokemon-impostor-texts.test.ts`.

**Interfaces:**
- `export function impostorEliminationCutIn(reveal: { playerId: string; role: 'IMPOSTOR' | 'INNOCENT' }, name: string): { tone: 'berry' | 'aqua'; title: string; delayedLine: string }`
  - `title` es el nombre.
  - `delayedLine` es `…era el impostor` o `…era inocente`.
  - `tone` es `berry` para el impostor y `aqua` para un inocente.
  - El tipo de rol es `ImpostorRole = 'INNOCENT' | 'IMPOSTOR'` (`pokemon-impostor/types.ts:5`).
- Al entrar en `ELIMINATION` se monta `RevealCutIn`:
  - `holdMs = 3_200`, dentro de los 4 s de la fase;
  - `media`: avatar `lg` del eliminado;
  - `useSfxCue('reveal', votingRound)`.
- La tarjeta actual de la línea 77 se queda debajo, sin `reveal-pop`, con `motion-enter-up`.

- [ ] **Step 1: Test que falla:** `impostorEliminationCutIn` para un impostor y para un inocente.
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- pokemon-impostor-texts`. Debe fallar.
- [ ] **Step 3: Implementa.**
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: E2E** (test nuevo `pokemon-impostor: eliminación con cut-in`, 4 jugadores):
  - Todos votan al mismo jugador (el primero de `voteCandidateIds` que no sea uno mismo; el votado vota a otro).
  - En `ELIMINATION` el `role="status"` del cut-in muestra el nombre y «…era».
  - Captura `juego-pokemon-impostor-eliminacion` a los tres tamaños y en claro **mientras** el cut-in está visible.
  - Con la reducción, el cut-in desaparece antes de que acabe la fase, se pueden pulsar elementos de debajo (la capa no intercepta) y `animacionDe(<elemento animado>) === 'none'`.
  - **Rúbrica** «Impostor · eliminación» ≥19.
  - Copia y restauración de los PNG.
- [ ] **Step 6: Commit.** `Impostor: cut-in a pantalla completa al eliminar con el rol tras una pausa (Rúbrica Impostor eliminación: … = N/24)`

---

### Task 13: Learnset Guess: marcador en vivo, pista que entra, puntos en juego y desconectados

**Files:**
- Modify:
  - `frontend/src/room/LearnsetGuessGame.tsx:32-39` (pistas y barra lateral) y `:48` (revelación);
  - `frontend/src/room/learnset-texts.ts`, `learnset-texts.test.ts`.

**Interfaces:**
- `export function learnsetStakeText(visibleGroups: readonly { stage: number }[], solvedCount: number): string`: `Ahora vale ${learnsetPoints(stage, solvedCount + 1)} pts`, con `stage = max(0, …stages)`.
  - Antes de escribirlo, comprueba en `learnset-guess/server.ts:166` que `revealStage` coincide con la etapa más alta de `visibleGroups`. Si no, usa la relación correcta y anótalo.
- `export function learnsetRevealStatus(solved: boolean, connected: boolean): 'solved' | 'missed' | 'offline'`. Con `offline` se pinta «Sin conexión» en `ink/60`, sin ✗.
- `export function learnsetSolvedAnnouncement(name: string): string`: `${name} ha acertado`.
- **Barra lateral «Marcador»:**
  - `ranking-row` por jugador (no espectador), ordenada por `game.scores` y después por nombre;
  - posición, avatar `sm`, nombre truncado con `title`, chip `1.º` si ya acertó y puntos `tabular-nums` con `motion-bump` (`key` = puntos).
- **Pistas:**
  - El grupo nuevo entra con `motion-enter-up`; ya no usa `reveal-pop`.
  - `useSfxCue('tick', stage)`.
- **Puntos en juego:** chip `learnsetStakeText` junto a «Pistas reveladas». Solo lo ve quien aún puede acertar.
- **Aciertos ajenos:** cuando crece `solvedPlayers`, los demás ven durante 2 s un aviso `role="status"` con el avatar y `learnsetSolvedAnnouncement`, en `motion-bump`.
- **Acierto propio:** `ScorePop` con `player.roundPoints` y `useSfxCue('hit', …)`.

- [ ] **Step 1: Tests que fallan:**
  - `learnsetStakeText`: etapa 0 sin aciertos da `Ahora vale 7 pts` (`learnsetPoints(0, 1)` = 5 + bonus 2); con 2 aciertos y la etapa 4 da `Ahora vale 1 pt` (singular con 1).
  - `learnsetRevealStatus` en sus tres casos.
- [ ] **Step 2:** `npm test -w @pokemon-universe/web -- learnset-texts`. Debe fallar.
- [ ] **Step 3: Implementa.**
- [ ] **Step 4:** Repite el Step 2. Debe pasar. Después, `npm run lint && npm run typecheck`.
- [ ] **Step 5: E2E** (amplía `learnset-guess: último aviso a 390` o crea `learnset-guess: marcador en vivo`):
  - Se ven el marcador con una fila por jugador y el chip «Ahora vale».
  - Captura `juego-learnset-guess` a los tres tamaños y en claro.
  - `animacionDe(<elemento animado>) === 'none'` con la reducción.
  - **Rúbrica** «Learnset · ronda activa» ≥19.
  - Copia y restauración de los PNG.
- [ ] **Step 6: Commit.** `Learnset: marcador en vivo, pistas que entran, puntos en juego y desconectados sin «No acertó» (Rúbrica Learnset ronda activa: … = N/24)`

---

### Task 14: Pasada estricta de encaje en los 6 juegos y verificación completa

**Files:**
- Modify (solo si la pasada lo pide): las pantallas de los 6 juegos, `frontend/src/styles.css` y `e2e/README.md` (el párrafo de «Encaje», con el estado nuevo de la pasada estricta).
- Modify: `docs/visual-review.md`, «Seguimientos». Actualiza las notas que ha cambiado esta fase: Juego (g) `timer-pulse`, Entrar en partida (g) puntos del carrusel, etc.

- [ ] **Step 1: Pasada estricta.**
  1. Copia de los PNG.
  2. `PU_LAYOUT_STRICT=1 npm run test:e2e -- juegos -g "pokedex-distance|shiny-vote|pokemon-impostor|higher-lower|type-duel|learnset-guess"`.
  3. Para cada problema de `measureLayout` en esos 6 juegos, corrige la causa:
     - texto <12 px;
     - solapes de la cabecera;
     - recortes sin `title`.

     Nunca con `[data-layout-ignore]`, salvo un falso positivo del medidor documentado en `docs/visual-review.md`.
  4. Repite hasta tenerlo limpio. Restaura los PNG.
- [ ] **Step 2: Suite E2E completa.** `npm run test:e2e`. Todo en verde, incluidos los 28 juegos. Restaura los PNG.
- [ ] **Step 3: Revisión de movimiento.**
  - `grep -nE "transition-\[(width|height|background|color|box-shadow)|text-shadow|animation:.*(width|height|color)" frontend/src -r` no encuentra nada nuevo.
  - Cada `@keyframes` de `styles.css` anima solo `transform`/`opacity`, con duración ≤400 ms (las infinitas alternadas cuentan por ciclo).
- [ ] **Step 4: Verificación completa.** `npm test`, `npm run typecheck`, `npm run lint` y `cd backend && ./gradlew check`. Todo en verde.
- [ ] **Step 5: Revisión de los PNG.**
  - `git status --short e2e/screenshots`: solo aparecen los 13 del usuario como modificados (`sha256sum -c` en verde).
  - Ninguna captura de esta fase queda sin commitear.
- [ ] **Step 6: Commit.** `Pasada estricta de encaje en los 6 minijuegos y notas de la rúbrica actualizadas`

---

## Criterios de aceptación (§10, Fase 2)

- **Rúbrica ≥19/24 sin ningún 0 en cada pantalla rediseñada.**
  - Buscador (Task 3).
  - Lobby: cómo se juega y rotación (Task 4).
  - Intro (Task 5).
  - Distance: resultados (Task 6) y revelación (Task 7).
  - Shiny (Task 8).
  - Type Duel (Task 9).
  - Higher or Lower: juego y revelación (Task 11).
  - Impostor (Task 12).
  - Learnset (Task 13).
  - La nota va en el commit de cada tarea.
- **Texto ≥12 px.**
  - Task 1: `ServerTimer`, `Avatar xs`.
  - Task 8: `ShinyOptionCard`.
  - Task 14: pasada estricta con `PU_LAYOUT_STRICT=1` en los 6 juegos.
- **Solo animaciones de `transform` y `opacity`.**
  - Task 1: vocabulario `motion-*` y fin del `text-shadow`.
  - Task 4: puntos del carrusel.
  - Task 8: transiciones de la tarjeta de Shiny.
  - Task 14: grep.
- **Con `prefers-reduced-motion`, ninguna animación.**
  - Task 1: regla global y test de `RevealCutIn`.
  - Tasks 7, 8, 9, 11, 12 y 13: `animacionDe(...)` vale `'none'` con la reducción y el nombre del `@keyframes` con `no-preference`.
- **El audio está desactivado por defecto y se puede activar.**
  - Task 2: `is muted by default and never creates a context while muted` y E2E del botón con persistencia.
- **`HowToPlayCarousel` de 3 pasos en el lobby y en `GAME_STARTING` para los 6 juegos.** Tasks 4 y 5.
- **`RevealCutIn` y `ScorePop`.** Task 1, usados en las Tasks 7, 8, 11, 12 y 13.
- **Resultados propios de Distance con las estadísticas nuevas.** Task 6.

## Decisiones del coordinador (2026-11-03, usuario dormido; revisables)
- Se aceptan todas las decisiones marcadas «más allá» o «se desvía». La intro de la Task 5 se limita a los 6 juegos de este documento (`introMs` solo en sus manifiestos; el resto arranca como hoy), se puede saltar y solo aparece la primera vez por sesión.
