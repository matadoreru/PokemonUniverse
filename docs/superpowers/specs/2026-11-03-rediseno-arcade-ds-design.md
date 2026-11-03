# Sistema de diseño «Arcade DS» — Pokémon Universe

Estado: **borrador para revisión del usuario** (2026-11-03). Plan de fases aprobado:
`/home/eru/.claude/plans/quiero-que-me-hagas-wild-iverson.md`. Cuando el usuario lo apruebe, este documento manda
sobre toda la interfaz. Lo que no diga, se decide, se apunta aquí y después se construye.

Referencia: `InazumaElevenManager/docs/DESIGN.md` («Arcade DS», aprobado allí el 19-10-2026). Este documento lo
adapta a una web multijugador que se juega también en el móvil. Las diferencias con Inazuma se marcan con **≠**.

Idea en una frase: **una consola portátil de minijuegos Pokémon para jugar en grupo**. Píldoras con relieve que se
hunden, paneles azules con rayas, cartas y diálogos crema, contorno azul noche en todo, placas de HUD, cut-ins para
los momentos clave, tipografía redondeada y gruesa, sonidos chiptune y los colores de los tipos Pokémon como semántica.

---

## 1. Principios

1. **Videojuego, no página web.** En escritorio cada pantalla cabe entera, sin scroll de página: solo se desplazan
   las listas dentro de su panel. Nada de formularios corporativos ni tablas interminables.
2. **Todo lo que se toca tiene relieve.** Píldora con degradado, brillo arriba, contorno azul noche y sombra dura que
   se hunde al pulsar. Si no tiene relieve, no se pulsa. Y al revés: lo que no se pulsa no lleva relieve de píldora.
3. **Franjas, cartas y placas.** Jugadores, rankings y resultados se presentan en franjas; los Pokémon, en cartas con
   sprite; el estado de la sala, en placas de HUD.
4. **Arriba se mira, abajo se actúa** (≠ Inazuma: es la idea de la doble pantalla de la DS). En el móvil la
   pantalla superior lleva el estado (pista, temporizador, marcador) y la inferior la acción (buscador, opciones,
   botones). En escritorio, la misma división pasa a columna principal y columna lateral.
5. **Una acción principal por pantalla.** Va en amarillo; solo la acción que cambia de fase (empezar la partida)
   va en el rojo «Poké Ball».
6. **El jugador tiñe su franja** (≠ «el club tiñe el cromo»). El color de avatar de cada jugador marca su franja, su
   marcador y sus puntos flotantes.
7. **Legible antes que pequeño.** Mínimo 13 px. Si no cabe, se abrevia; nunca se reduce.
8. **Una cosa se mueve cada vez.** El movimiento confirma una acción o anuncia un momento (revelación, acierto,
   eliminación). Nunca decora y nunca es continuo.
9. **Ningún sonido es imprescindible.** Todo lo que suena tiene también su señal visual.

## 2. Disposición híbrida (≠ escenario 16:9 de Inazuma)

Decisión del usuario del 2026-11-03: el aspecto Arcade DS, pero sin escenario escalado. El móvil (390×844) sigue
siendo un objetivo de primera.

- **Armazón.** `Layout` y `RoomSessionLayout` son una rejilla de `100dvh`: placas de HUD arriba y contenido debajo.
  Todo hijo flex o grid lleva `min-h-0` (sin él aparece el scroll de página). `body` con el fondo `--band` y la
  escena (§3.6).
- **Escritorio (≥1024 px, `lg`).**
  - Sin scroll de página a 1280×720 ni a 1920×1080. Lo comprueba el E2E (`scrollHeight ≤ innerHeight`).
  - Las listas largas se desplazan dentro de su `Panel`, con la barra de desplazamiento del sistema (§3.7).
  - El contenido se limita a 1600 px de ancho. A 1920 el espacio extra se usa para una columna lateral (jugadores,
    marcador en vivo, chat futuro) o queda limpio a propósito; nada se amplía.
- **Móvil (<1024 px).**
  - `ScreenSplit`: pantalla superior arriba y pantalla inferior pegada al fondo, separadas por la «bisagra» (una
    franja azul noche de 8 px).
  - Se permite scroll de página solo si lo obliga el teclado virtual o una pantalla de configuración. El resto se
    desplaza dentro de los paneles.
  - La pantalla inferior respeta `env(safe-area-inset-bottom)`.
- **Páginas largas** (Administración, Novedades, Perfil, Feedback): un panel de lista y un panel de detalle, cada
  uno con su propio scroll. En móvil se apilan y se navega de la lista al detalle con «Volver».
- **Capas.** Diálogos con el `<dialog>` nativo (capa superior del navegador). Los avisos van en un `popover`, por
  encima de un diálogo abierto. El cut-in va en `position: fixed` (aquí no hay escenario con `transform` que lo
  rompa). Ningún componente define su propio `z-index`: todos salen de los tokens (§3.5).

## 3. Tokens

CSS custom properties en `frontend/src/styles/tokens.css`, en `:root` (≠ `.ds`: aquí hay un solo tema y se sustituye
el anterior). Se espejan en `tokens.ts` con `contrast()` y `bestInk()`. `tokens.test.ts` comprueba el espejo y los
contrastes. Ningún componente usa un valor literal que exista como token.

### 3.1 Color

**Base** (los valores de Inazuma, sin cambios): `--navy #13235C` (contorno y tinta), `--navy-2 #0B1640` (sombra
dura y placas del HUD), `--navy-3 #1B2F78` (cabeceras de panel), `--blue #2F6BE0`, `--blue-d #1E4FB8`, `--blue-l
#6FA2FF`, `--sky #8FD0FF`, `--sky-2 #CFEBFF`, `--cream #FFF8E1`, `--cream-2 #F3E6BE`, `--ink #1E2238`, `--ink-2
#4A4F6A`, `--white`, `--band #060B22`.

**Acentos y acción.**

| Token | Valor | Uso |
|---|---|---|
| `--yellow` / `--yellow-d` / `--yellow-l` | `#FFD23F` / `#E0A900` / `#FFF0A8` | acción principal, foco, fila propia, temporizador |
| `--red` / `--red-d` / `--red-l` | `#EF3B4A` / `#B91E2C` / `#FF8B95` | «Poké Ball»: solo la acción que cambia de fase, con texto ≥24 px |
| `--red-text` | `#D22F3E` | rojo con texto blanco de 13–18 px (salir, expulsar, borrar) |
| `--orange` | `#FF8A2B` | avisos pendientes (reconectando, último aviso) |
| `--ok` / `--warn` / `--bad` / `--info` | `#39B54A` / `#FFC247` / `#FF5A5A` / `#37B6FF` | acierto, aviso, fallo, información; texto azul noche encima |

**Semántica del juego: los 18 tipos Pokémon** (≠ puestos y elementos). Se conservan los colores actuales, ahora
en hex, cada uno con su tinta `--type-<t>-ink` elegida por contraste (calculado el 2026-11-03; ≥4,5:1 en todos):

| Tinta azul noche | Tinta blanca |
|---|---|
| normal `#A8A77A` (6,0) · fire `#EE8130` (5,5) · water `#6390F0` (4,8) · electric `#F7D02C` (9,9) · grass `#7AC74C` (7,1) · ice `#96D9D6` (9,3) · ground `#E2BF65` (8,3) · flying `#A98FF3` (5,6) · psychic `#F95587` (4,7) · bug `#A6B91A` (6,7) · rock `#B6A136` (5,7) · steel `#B7B7CE` (7,5) · fairy `#D685AD` (5,5) | fighting `#C22E28` (5,7) · poison `#A33EA1` (5,6) · ghost `#735797` (5,9) · dragon `#6F35FC` (5,8) · dark `#705746` (6,7) |

Las cinco de tinta blanca quedan por debajo de 3:1 frente a `--navy-2`. Sobre un fondo azul noche, la insignia de
tipo lleva un anillo blanco de 2 px por fuera del contorno.

**Color del jugador.** `--player` (y su `--player-ink`) se fija por franja a partir del color de avatar, con la
regla de Inazuma: si la luminancia relativa es ≥0,30, la tinta es azul noche; si no, blanco. Los colores de avatar
se ajustan para que la regla dé ≥4,5:1.

**Contorno de texto.** Todo texto blanco sobre degradado, sprite o color de jugador lleva `.ol` (1,5 px azul noche).
Los títulos grandes llevan `.ol2` (2,5 px más una sombra dura de 5 px). El contraste de la tabla se cumple sin
contar el contorno.

`tokens.test.ts` comprueba como mínimo estas parejas: blanco sobre `--navy`, `--navy-2`, `--navy-3`, `--blue` y
`--blue-d`; `--ink` y `--ink-2` sobre `--cream`; `--navy` sobre `--yellow`, `--cream` y los cuatro semánticos;
blanco sobre `--red-text`; blanco sobre `--red` (≥3:1, texto grande); las 18 tintas de tipo; `--yellow` y `--sky-2`
sobre `--navy-2`.

### 3.2 Tipografía

- Display: **Baloo 2** (700 y 800) para títulos, cabeceras de panel, números grandes (puntos, temporizador,
  marcador) y texto de las píldoras. Texto: **Nunito** (700, 800 y 900) para todo lo demás.
- Las dos se autoalojan en `frontend/public/fonts/` (woff2 latino, copiados de `InazumaElevenManager/assets/own/fonts`
  con su licencia OFL), con `font-display: block` y precarga en `index.html`. Se retiran Fredoka y Google Fonts.
- **Escala cerrada** de 8 tamaños: 13 · 15 · 18 · 22 · 26 · 34 · 44 · 68 (`--fs-13` … `--fs-68`, y los mismos
  nombres en Tailwind: `text-13` … `text-68`). Usos: 13 para metadatos, insignias y chips; 15 para texto, franjas,
  diálogos y pestañas; 18 para la píldora estándar y las cabeceras de panel; 22 para el título de diálogo y los
  nombres del marcador; 26 para la acción principal y los valores del HUD; 34 para el título de pantalla y el
  marcador; 44 para el nombre del cut-in; 68 para el logotipo.
- **Mínimo 13 px** (≠ los 12 px de hoy en `AGENTS.md`). Durante la migración se exige pantalla a pantalla y en F9
  pasa a ser el mínimo de `measureLayout` para todo.
- **Abreviar, no reducir.** Nombres de jugador largos con elipsis y `title`; «puntos» → «pts»; números de Pokédex
  con `#` y tres cifras.
- Interlineado 1,3 en texto y 1,0 en display. Numerales tabulares en todo lo numérico. Sin mayúsculas sostenidas
  salvo el logotipo y las siglas.

### 3.3 Espaciado, radios, contornos y sombras

- Los de Inazuma tal cual: `--sp-1..6` (4–32 px); radios `--r-pill`, `--r-dialog` 20, `--r-panel` 18, `--r-hud` 16,
  `--r-card` 14, `--r-franja` 12, `--r-badge` 7. Radio 0 prohibido salvo en separadores y en el interior de las
  barras.
- Contorno azul noche: 3 px en paneles, píldoras, cartas y diálogos; 2,5 px en franjas; 2 px en insignias, chips y
  barras. Un elemento dentro de otro puede bajar un escalón, nunca subir.
- Solo dos sombras, y ninguna se anima. Dura: `0 5px 0 var(--navy-2)` en paneles y píldoras grandes, `0 4px 0` en
  cartas y `0 3px 0` en píldoras pequeñas y franjas. Ambiental: `--sh-panel` y `--sh-dialog`.
- Degradados verticales de tres paradas en las píldoras. Rayas diagonales de 10 px (`--stripes-blue` al 4 % de
  blanco, para que el texto blanco sobre `--blue` con rayas siga en 4,55:1, y `--stripes-cream` al 4 % de azul noche;
  sobre crema con rayas el texto de error va en `--red-d`, 5,57:1, porque `--red-text` se queda en 4,34:1). Prohibidos los degradados en el texto y los brillos animados.
- **Objetivos táctiles de 44 px como mínimo** (≠ los 32 de Inazuma). La píldora pequeña (34 px) solo se usa en
  escritorio y con relleno que lleve el área pulsable a 44.

### 3.4 Movimiento

Los tokens de Inazuma: `--t-press` 90 ms, `--t-focus` 120, `--t-screen` 220, `--t-bounce` 220 (sobreimpulso),
`--t-reveal` 360 y `--t-cutin` 1400. Curvas `--ease` y `--ease-bounce`.

- Solo se animan `transform` y `opacity`. Interacción ≤400 ms; la única animación firma más larga es el cut-in.
- Bucles: solo el esqueleto de carga y el pulso de urgencia del temporizador en sus 5 últimos segundos.
- Con `prefers-reduced-motion: reduce`, todas las duraciones pasan a 0 salvo los fundidos de opacidad de 120 ms.
  El cut-in se sustituye por la línea de resultado resaltada. La clase `static` del `body` (E2E) lo apaga todo.
- Sustituyen a los `motion-*`, `reveal-pop`, `timer-pulse` y demás `@keyframes` de hoy.

### 3.5 Capas

`--z-content` 1 · `--z-hud` 5 · `--z-sticky` 10 (pantalla inferior en móvil) · `--z-cutin` 25 · `--z-toast` 40. Los
diálogos usan la capa superior nativa. `tokens.test.ts` falla ante cualquier `z-index` literal en CSS y ante
cualquier `z-[…]` o `z-<n>` en los `.tsx`.

### 3.6 Escena de fondo

Un SVG propio y fijo detrás de todo: un cielo azul con un degradado suave hacia `--navy-2` abajo, un patrón tenue de
Poké Ball y estrellas. No varía por pantalla. Sobre él, los paneles son opacos, así que el contraste nunca depende
de la escena. `aria-hidden`, sin animación.

### 3.7 Barra de desplazamiento y foco

- Barra de desplazamiento amarilla sobre azul noche (`scrollbar-color`), como en Inazuma.
- Foco visible siempre: anillo `--yellow` de 3 px con 2 px de separación; sobre amarillo, blanco. Sobre crema
  (diálogo, panel crema, cuerpo de pestañas, campos y cartas) el amarillo no se ve (1,36:1): esas superficies fijan
  `--focus-ring` y `--focus-ring-on-yellow` en `--navy`.

## 4. Catálogo de componentes (`frontend/src/ui/`)

Cada uno con CSS Modules que solo usan tokens, sin lógica de juego, y presente en la galería `/dev/ui` en todos sus
estados. Los interactivos tienen normal, hover, foco, pulsado y deshabilitado. Los que cargan datos tienen vacío,
carga y error. Ningún componente nuevo ni estado nuevo entra en una pantalla sin pasar antes por la galería.

| Componente | Qué es | Origen |
|---|---|---|
| `Pill` | Botón. Tonos `blue`, `yellow` (principal), `red` (cambio de fase), `danger`, `ghost`, `cream`. Tamaños `std`, `small` (solo escritorio), `main`, `round` (icono de 44 px). Estado `loading`. Al pulsar baja 4 px y la sombra pasa a 1 px. Suena (§8). | Inazuma `Pill`, sin las insignias de teclas |
| `Panel` | Contenedor con cabecera `--navy-3`. Tonos `blue` (rayas), `cream` (rayas crema, tinta oscura) y `dark` (`--navy-2`). Con `StateBox` dentro. | Inazuma `Panel` |
| `HudPlate` | Placa azul noche de las esquinas: logo, sala, jugadores, sonido, perfil. | Inazuma `Hud` |
| `Row` | Franja de jugador o de ranking: posición, avatar, nombre, valor grande, color del jugador a la izquierda. Variantes propia (amarillo) y desconectado. | Inazuma `Row`, reescrita sin dominio |
| `Card` | Carta crema con sprite de Pokémon, nombre y tipos. Estados seleccionable, seleccionada, correcta, incorrecta, revelándose (gira). | nueva, con el estilo de Inazuma `Card` |
| `Dialog` | Sobre `<dialog>.showModal()`: foco inicial, foco atrapado y devuelto al cerrar, Esc, rebote de entrada. Crema. Sustituye a los 3 `modal-dialog`. | Inazuma `Dialog`, sin su store |
| `Toast` | Aviso de éxito, error o información en un `popover`, abajo en el centro. | Inazuma `Toast` |
| `Tabs`, `Segmented` | Pestañas con `role="tablist"` y flechas; segmentos para opciones cortas. | Inazuma |
| `Badge`, `TypeBadge`, `Chip` | Insignias numéricas y de estado; insignia de tipo con su tinta; chip de filtro. | Inazuma `Badge`, con tipos Pokémon |
| `Bar` | Barra de progreso o de valor con relleno por `scaleX` (Higher or Lower, puntos, tiempo). | Inazuma `Bar` |
| `Timer` | Temporizador de servidor como placa con número grande y barra; urgencia a los 5 s. Sustituye a `ServerTimer`. | nuevo |
| `Field`, `SelectField`, `Slider` | Campos de formulario crema con contorno, etiqueta y error. `Slider` sustituye a `ConfigRange`. | Inazuma `Form`, `Slider` |
| `StateBox` | Vacío, carga (esqueleto) y error con acción («Reintentar»). | Inazuma |
| `Icon` | Envoltorio de `lucide-react`: tamaños 18, 22, 24 y 32, trazo 2,5 y color por token. Prohibido importar lucide fuera de él (lint en F9). | nuevo |
| `ScreenSplit` | Pantalla superior e inferior en móvil; columnas principal y lateral en escritorio. | nuevo |
| `Cutin` | Losa azul noche con bordes del tono, que entra desde la izquierda (200 ms), se para y sale por la derecha. Título en Baloo 2 de 44 px y sprite opcional. Se salta con clic o Espacio; si llega otro, sustituye al actual. `RevealCutIn` queda como envoltorio con su API actual. | Inazuma `Cutin` |
| `ScorePop` | «+N» que sube y se desvanece sobre una franja, con el color del jugador. | el de la Fase 2, retocado |

## 5. Teclado

- Todo se puede usar con teclado. Tab sigue el orden visual y las listas de opciones usan flechas (foco itinerante).
- Atajos globales: `M` silencia el sonido y `Esc` cierra el diálogo. En los juegos de opciones, `1`–`4` eligen
  opción, y la píldora muestra su número como insignia. Sin barra inferior de teclas.

## 6. Pantallas

Cada pantalla se rediseña en su fase (F3–F9, ver el plan) con este patrón:

- **Cabecera** (F3): `HudPlate` a la izquierda con el logotipo y, en la sala, el código; a la derecha, sonido,
  novedades, administración y perfil. En móvil, una sola placa con el logotipo corto y un menú.
- **Inicio, Acceso y Jugar**: pantalla de título con el logotipo grande en `.ol2` y una pila de píldoras («Crear
  sala», «Unirse», «Entrar»).
- **Lobby**: arriba (o en la columna lateral), los jugadores en franjas; abajo (o en la columna principal), la
  rotación de juegos en cartas y la configuración en pestañas. «¡Empezar partida!» en rojo, siempre visible.
- **Intro, votación del siguiente juego y resultados de sesión**: cut-in de entrada, cartas de voto y podio en
  franjas con el `ScorePop` de los puntos.
- **Juegos**: la pantalla superior lleva la pista, el temporizador y el marcador; la inferior, el buscador o las
  opciones en cartas y la acción. Las revelaciones usan `Cutin`, `Bar` y `Card` en estado revelándose.

## 7. Animaciones firma

1. **Hundir la píldora**: 4 px abajo y sombra a 1 px en 90 ms.
2. **Cut-in de revelación**: 1,4 s; solo en los momentos clave (acierto exacto, eliminación, VS, ganador de ronda).
3. **Giro de carta**: `rotateY(90deg) → 0` en 360 ms al revelar.
4. **Vuelta del marcador**: el dígito gira sobre X (400 ms) y la franja destella una vez.
5. **Entrada de pantalla**: opacidad y `translateY(8px)` en 220 ms.

Presupuesto: nunca más de dos animaciones a la vez; `will-change` solo durante el cut-in. Nada parpadea más de tres
veces por segundo.

## 8. Audio

Se porta el motor de Inazuma (`engine`, `mixer`, `synth`, `voices`, `variation`, `chiptune/tracker`, `music`) a
`frontend/src/audio/`. Todo es sintetizado con WebAudio y no hay ficheros de sonido. Los parámetros viven en
`frontend/src/data/sfx.json`, validado con Zod; un test exige que el fichero defina exactamente el catálogo.

- **Canales y mezcla**: música 0,55, efectos 0,90 e interfaz 0,50. Variación determinista de tono (±35 cents) y de
  ganancia (±12 %), con un máximo de 10 voces y enfriamiento por efecto.
- **Política**:
  - Apagado por defecto en la primera visita.
  - El `AudioContext` se crea solo dentro de un gesto del usuario. Si el sonido quedó activado en una visita
    anterior, se espera al primer clic y no se pierde la música pendiente.
  - `M` silencia. Si la pestaña se oculta, el audio se suspende.
  - Al migrar se respeta la clave antigua `pokemon-universe-sfx`.
- **Ajustes** (`AudioSettingsDialog`, abierto desde la placa del HUD): silencio, volumen general, música, efectos e
  interfaz, con deslizadores de 0 a 100 en pasos de 5 (decisión del usuario del 2026-11-04; sin botón de prueba).
- **Catálogo**:

| Id | Cuándo | Dónde se dispara |
|---|---|---|
| `ui.confirm` / `ui.tap` | píldora de acción / ghost o crema | `Pill` |
| `ui.tab` / `ui.tick` | pestaña / segmento o deslizador | `Tabs`, `Segmented`, `Slider` |
| `ui.open` / `ui.close` | abrir o cerrar un diálogo | `Dialog` |
| `ui.error` | aviso de error | `Toast` |
| `room.join` / `room.leave` | alguien entra o sale de la sala | `PlayerList` |
| `game.start` | empieza un juego (intro) | `GameIntro` |
| `game.countdown` | cada uno de los 3 últimos segundos | `Timer` |
| `game.reveal` | la ronda pasa a resultados | `RoomSessionLayout`, por cambio de fase |
| `game.hit` / `game.miss` / `game.score` | acierto, fallo o puntos propios | `useSfxCue`, ahora un adaptador |
| `game.cutin` | aparece un cut-in | `Cutin` |
| `game.flip` | gira una carta | `Card` |
| `game.clang` / `game.eliminate` / `game.bid` | VS de Type Duel, expulsión en Impostor, puja en las subastas | el juego |
| `game.win` / `game.podium` | ganador del juego / podio de la sesión | `ResultsShell`, `SessionResults` |

- **Música chiptune original**, compuesta en código con el tracker: `lobby`, `game` y `results`. Cambia según la fase
  de la sala, con fundido (salida 0,4 s y entrada 0,7 s). Baja mientras suena el grito de Cry Quiz.

## 9. Accesibilidad

- Contraste AA comprobado en `tokens.test.ts` (§3.1), con iconos y bordes ≥3:1.
- Mínimo 13 px y objetivos de 44 px.
- Foco siempre visible, atrapado en los diálogos y devuelto al cerrarlos. Roles ARIA en pestañas y listas.
  Resultados con `aria-live="polite"`.
- El color nunca va solo: tipo con nombre, acierto con ✓ y texto, jugador con nombre.
- Sprites con `alt`; escena y adornos con `aria-hidden`.
- `prefers-reduced-motion` respetado (§3.4). Con `prefers-contrast: more`, contornos de 4 px y sin rayas.

## 10. Rúbrica de revisión visual

Sustituye a la de `docs/visual-review.md` en F9; mientras tanto se aplica a cada pantalla migrada. Cada criterio va
de 0 a 3, con un máximo de 24. Para integrar: **≥19 y ningún 0**. Capturas a 1280×720, 1920×1080 y 390×844.

| Criterio | 3 |
|---|---|
| Jerarquía | la mirada va sola: acción principal, dato clave, resto en calma |
| Legibilidad | ≥13 px, abreviaturas del sistema, numerales tabulares, contorno donde toca |
| Solo componentes del sistema | todo del catálogo y la galería al día |
| Relieve y color | tokens, contorno y sombra correctos, y el color del jugador donde el sistema lo pide |
| Encaje | sin scroll de página en escritorio, encaje a los tres tamaños y espacio sobrante aprovechado o limpio |
| Interacción | todos los estados, teclado completo, objetivos de 44 px, foco inicial y retorno correctos |
| Movimiento | dentro del presupuesto, con reducción y una animación firma usada con intención |
| Estados de datos | vacío, carga y error con texto y acción; el vacío enseña a jugar |

## 11. Decisiones y límites

- 2026-11-03, del usuario: disposición híbrida, un solo tema, efectos y música, el rediseño antes de las Fases 3 y
  4 de `MINIJUEGOS_MEJORAS.md` y toda la web en el alcance.
- Se mantienen Tailwind (solo para maquetación), `lucide-react` (dentro de `Icon`) y los textos en español.
- Durante la migración, Tailwind reasigna los colores actuales por papel (`cream` → `--navy-2`, `ink` → blanco,
  `surface` → `--navy`, `surface-raised` → `--navy-3`, `berry` → `--red-l` (texto legible sobre azul noche; `.btn-primary` va en `--red-text` con texto blanco), `electric` → `--yellow`, `aqua` →
  `--info`, `leaf` → `--ok`) y `.on-cream` devuelve la tinta oscura dentro del crema (`ink` → `--ink`, `surface` → `--cream`, `surface-raised` →
  `--cream-2`, `berry` → `--red-d`, `aqua` → `--blue-d`, anillo de foco `--navy`); `Dialog` la lleva siempre. Los alias y las clases antiguas
  se borran en F9.
- Nada de assets de Inazuma ni de LEVEL-5 (emblemas, retratos, fondos ni OST). Solo fuentes OFL y música propia.
- Sprites de Pokémon: los de siempre, por el proxy del backend, enmarcados en `Card` o en el avatar.
