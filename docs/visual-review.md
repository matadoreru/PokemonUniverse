# Rúbrica de revisión visual ("papeleta")

## Propósito y cuándo se aplica

La rúbrica puntúa cada pantalla **nueva o rediseñada** antes de integrarla. Mide lo que el usuario ve
(jerarquía, legibilidad, encaje, relieve y color, movimiento) y lo que no se ve en una captura fija
(interacción con teclado y estados de datos). Se replica la metodología de InazumaElevenManager
(DESIGN.md §11) y su sistema «Arcade DS», adaptado a una web multijugador que también se juega en el móvil
(`docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md`, §10 para esta rúbrica).

- Las capturas de la pantalla se toman a **1280×720, 1920×1080 y 390×844** con `capture()` y quedan
  en `e2e/screenshots/<pantalla>-<ancho>x<alto>.png`.
- La nota va en el mensaje del commit o en la descripción del PR, una línea por pantalla:

  ```
  Rúbrica <pantalla>: a, b, c, d, e, f, g, h = N/24
  ```

  Las letras siguen el orden de la tabla: a Jerarquía, b Legibilidad, c Solo componentes del
  sistema, d Relieve y color, e Encaje, f Interacción, g Movimiento, h Estados de datos.

## Regla de integración

**≥ 19 y ningún criterio a 0; un 0 en "Solo componentes del sistema" o en "Encaje" bloquea aunque el total llegue.**

Una pantalla que no llega se integra solo si el cambio no es suyo (por ejemplo, se puntúa una
pantalla existente como línea base); en ese caso la nota se anota igual y lo pendiente queda como
tarea de seguimiento.
Una pantalla nueva o rediseñada nunca es línea base, y un 0 en "Solo componentes del sistema" o en
"Encaje" en una pantalla que toca el cambio bloquea siempre.

## Criterios (0–3)

| Criterio | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Jerarquía | no se sabe qué hacer primero | la acción principal existe pero compite | una acción principal clara, resto ordenado | la mirada va sola: acción principal, dato clave, resto en calma |
| Legibilidad | texto < 13 px, cortado o sin `title` al truncar | 13 px pero abreviaturas improvisadas | 13 px o más con la escala `text-13`…`text-68`, truncado con `title`, numerales tabulares donde hay cifras | además, abreviaturas del sistema («pts», `#025`) y contorno `.ol`/`.ol2` donde toca |
| Solo componentes del sistema | botones, cartas o campos propios en vez de los de `frontend/src/ui/` (`Pill`, `Panel`, `Card`, `Field`…) | un componente del catálogo retocado desde fuera o un estado que no está en la galería | todo con el catálogo y los tokens; un estado nuevo, añadido al componente | además, la galería `/dev/ui` muestra ese estado y se reutiliza donde toca |
| Relieve y color | colores literales, sin contorno azul noche o relieve de píldora en algo que no se pulsa | tokens pero relieve incompleto (falta contorno, sombra dura o el hundido al pulsar) | contorno y sombra dura del escalón que toca, paleta del sistema (amarillo para la acción principal, rojo solo para el cambio de fase, tipos con su tinta) y contraste AA de `tokens.test.ts` | además, el color del jugador en su franja, su marcador y sus puntos donde el sistema lo pide |
| Encaje | scroll horizontal o desborde en algún tamaño | cabe a 1280 pero no se ha mirado a 390 ni a 1920 | sin scroll de página en escritorio y encaje a 390, 1280 y 1920 sin desbordes ni solapes (`capture()` limpio) | además, el espacio sobrante a 1920 se aprovecha o se deja limpio a propósito |
| Interacción | falta algún estado (hover, foco, deshabilitado, cargando) | estados presentes pero el teclado no llega a todo | hover, foco visible, deshabilitado, `aria-busy`/cargando; teclado completo; objetivos ≥ 44 px | además, foco inicial y retorno de foco correctos (diálogos, errores con `role="alert"`) |
| Movimiento | animaciones que no sean transform/opacity o sin `prefers-reduced-motion` | solo transform/opacity pero sin reducción | dentro del presupuesto (≤ 400 ms, nunca más de dos a la vez) y con reducción | además, una animación firma usada con intención (cut-in, giro de carta, vuelta del marcador) |
| Estados de datos | falta vacío, carga o error | existen pero sin acción | los tres con texto claro y acción (`StateBox`: vacío, esqueleto y error con «Reintentar») | además, el estado vacío enseña a jugar |

### Cómo leer la tabla

- Cada nivel exige el anterior. Un 3 exige cumplir el "además": si no tiene a qué aplicarse en esa
  pantalla (por ejemplo, no hay ningún estado nuevo ni ningún diálogo), la nota se queda en 2.
- **Colores literales**: cuentan los que se pintan en la pantalla, estén en el componente o en su CSS Module (por
  ejemplo, un `background: #…` en vez de un token de `frontend/src/styles/tokens.css`). En los `.tsx` ya los
  rechaza `npm run lint` (`arcade/no-arbitrary-style`).
- **Animaciones**: cualquier `animation` o `transition` que mueva o cambie tamaño, color o sombra
  de forma visible. Las transiciones de hover/foco/pulsado de `Pill`, `Field`, etc. (≤ 200 ms, respuesta a una
  acción) son estado, no animación. Una animación sin su regla de `prefers-reduced-motion` (ni la reducción global
  de `styles.css`) es "sin reducción".
- Sin captura a 390 ni a 1920, el Encaje no pasa de 1.

## Procedimiento

1. Ejecuta los E2E: `npm run test:e2e` (todo) o solo el spec de la pantalla, desde `e2e/`:
   `npx playwright test tests/<spec>.spec.ts`. `capture()` falla si hay scroll horizontal, scroll de página
   (en escritorio, tampoco del `main`) o si `measureLayout` encuentra texto < 13 px, solapes, recortes sin `title` o
   controles fuera de su caja.
2. Abre las capturas de `e2e/screenshots/` de la pantalla en los tres tamaños y míralas antes de
   dar la tarea por hecha.
3. Puntúa los ocho criterios con la tabla. Movimiento e Interacción se juzgan también leyendo los CSS Modules y
   el código del componente (no se ven en una captura fija).
4. Escribe la línea `Rúbrica <pantalla>: …` en el commit o PR. Si no llega a la regla de
   integración, arréglalo antes de integrar o, si la pantalla no es parte del cambio, anota la nota
   y deja lo pendiente como seguimiento.

### Capturas en git

Cada ejecución reescribe los PNG de `e2e/screenshots/`, y los que llevan nombres de invitado,
códigos de sala o el temporizador del juego cambian siempre. **Solo se vuelven a commitear al
revisar un cambio de UI** (las capturas de esa pantalla); en cualquier otro caso se descartan con:

```sh
git restore e2e/screenshots
```

## Excepciones conocidas del medidor

`[data-layout-ignore]` excluye un elemento de `measureLayout` (`e2e/src/layout.ts`); solo para falsos
positivos del medidor, nunca para esconder un problema real. Cada uso se apunta aquí con su motivo.
Lo mismo vale para `ALLOWED_CONSOLE_ERRORS` en `e2e/src/helpers.ts` (mensajes de herramientas, no de
la app) y para las opciones de `capture()` que relajan un valor por defecto (`allowPageScroll`, `minFontPx`), que
además llevan un comentario en el spec.

- `data-layout-ignore` y `ALLOWED_CONSOLE_ERRORS`: ninguna por ahora.
- `allowPageScroll`: la galería `/dev/ui` (`galeria.spec.ts`, capturas `galeria` y `galeria-aviso-sobre-dialogo`),
  que va fuera del armazón de 100dvh y es una página larga a propósito. Ninguna captura baja de 13 px.

## Seguimientos

**Cerrado con el rediseño Arcade DS (F0–F9, 2026-11-04).** Cada pantalla se volvió a puntuar con esta rúbrica en
su fase y la nota está en su commit. Lo de abajo es la línea base histórica: las clases que cita (`.btn-*`,
`.experimental-badge`, `.empty-state`, `.status-error`, `.lobby-tab`…) se borraron en F9.

**Línea base Arcade DS F0 (2026-11-03).** Tokens del sistema Arcade DS, tema único azul noche con escena de Poké
Balls, Baloo 2 y Nunito autoalojadas y capas por token
(`docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md`). Ninguna pantalla se ha rediseñado todavía, así
que las notas de abajo no se han vuelto a puntuar; cada pantalla se puntúa con la rúbrica nueva en su fase (F3–F9).
Capturas de `inicio`, `acceso`, `sala` y `contenido-y-admin`, y de Distance, Shiny y Type Duel, regeneradas en verde.

Pendientes de la línea base (ninguna pantalla llega a 19; no son cambios de esta rama).

Notas actuales (a Jerarquía, b Legibilidad, c Componentes, d Relieve/color, e Encaje, f Interacción, g Movimiento, h Estados):

- Portada: 3, 2, 2, 1, 3, 2, 2, 2 = 17/24
- Acceso: 3, 2, 1, 2, 3, 1, 1, 2 = 15/24
- Entrar en partida: 2, 2, 1, 1, 2, 1, 0, 2 = 11/24
- Lobby: 1, 1, 2, 0, 3, 2, 2, 1 = 12/24
- Juego: 2, 1, 1, 0, 1, 1, 0, 1 = 7/24

Cambios pendientes, por pantalla y criterio:

- Portada (h): el estado vacío sin acción propia que enseñe a jugar.
- Juego (e): capturas a 390 y 1920 (bucle `SIZES` en `sala.spec.ts`).
- Lobby (d): `.experimental-badge` usa el literal `#c92a42`; pasarlo a `--red-text` con texto blanco (`berry` ahora es el rosa claro `--red-l`, no sirve de fondo con texto blanco).
- Acceso (f, c): pestañas de 40 px (`min-h-10`); subir a 44 px con flechas, `aria-controls` y tabpanel (reutilizar `.lobby-tab`).
- Entrar en partida (f): `aria-describedby="room-code-help"` apunta a un id inexistente (quitarlo o crear `#room-code-help`); `aria-busy` al entrar.
- Juego (f, h): indicador y `aria-busy` al enviar la selección; estado vacío del buscador que explique la ronda; `.empty-state` para «No hay coincidencias»; `title` en nombres truncados.
- Lobby (a, b, c, h): «Empezar partida» visible sin scroll a 1280×720; antetítulo coherente con el estado; `tabular-nums` en puntos y contador (también en el juego); error con `.status-error` en vez del toast propio; acción para limpiar la búsqueda vacía.
- Acceso (b): traducir el error del servidor de login («Invalid email or password»); el de sala inexistente («Room not found») también llega en inglés.
- Entrar en partida (e): evitar el hueco de la tarjeta izquierda a 1280/1920.

Resueltos en la Fase 2 de minijuegos (las notas de arriba no se han vuelto a puntuar):

- Juego (g): `timer-pulse` y los pulsos de urgencia de Shiny y Pokédle animan solo `transform` (≤ 400 ms por ciclo),
  sin el literal `#ef476f` ni el brillo `rgba(77,210,140,.35)`; las barras de tiempo usan `scaleX`; la de Shiny y las
  casillas de Pokédle ya no hacen transición de color.
- Acceso, entrar en partida y juego (g): `animate-spin` y `animate-pulse` (`tailwind.config.js`) duran 400 ms por
  ciclo y solo cambian `transform`/`opacity`; la regla global de `prefers-reduced-motion` de `styles.css` los apaga.
- Entrar en partida (g, f): puntos del carrusel (`HowToPlayCarousel`) con `scale-x` en vez de `transition-[width]` y
  puntos y flechas de 44 px.
- Juego (b): `ServerTimer`, `Avatar` `xs`, las cartas de Shiny, la insignia de jugador de Pokédle Race
  (`PokeddleRaceGame.tsx:56`) y las insignias de los resultados de Learnset ya no bajan de 12 px.
  Siguen a `text-[9px]`–`text-[11px]` partes de juegos fuera de la Fase 2: Pokédle Race (cabecera, tableros y
  marcador), el tablero de Pokédle, Who's That, Guess from Stats, Pokédex Entry, Type Chain, Team/Bluff Auction,
  Most Likely To, One of Us Is Fake y Quién es Quién.
