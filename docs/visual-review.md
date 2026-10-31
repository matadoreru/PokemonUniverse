# Rúbrica de revisión visual ("papeleta")

## Propósito y cuándo se aplica

La rúbrica puntúa cada pantalla **nueva o rediseñada** antes de integrarla. Mide lo que el usuario ve
(jerarquía, legibilidad, encaje, temas, movimiento) y lo que no se ve en una captura fija
(interacción con teclado y estados de datos). Se replica la metodología de InazumaElevenManager
(DESIGN.md §11), no su aspecto: Pokémon Universe mantiene su diseño propio.

- Las capturas de la pantalla se toman a **1280×720, 1920×1080 y 390×844** con `capture()` y quedan
  en `e2e/screenshots/<pantalla>-<ancho>x<alto>.png`.
- La nota va en el mensaje del commit o en la descripción del PR, una línea por pantalla:

  ```
  Rúbrica <pantalla>: a, b, c, d, e, f, g, h = N/24
  ```

  Las letras siguen el orden de la tabla: a Jerarquía, b Legibilidad, c Solo componentes del
  sistema, d Tokens y temas, e Encaje, f Interacción, g Movimiento, h Estados de datos.

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
| Legibilidad | texto < 12 px, cortado o sin `title` al truncar | 12 px pero abreviaturas improvisadas | 12 px, truncado con `title`, numerales tabulares donde hay cifras | además, nombres y cifras alineados y contraste AA en ambos temas |
| Solo componentes del sistema | botones, tarjetas o campos propios en vez de `.btn-*`, `.card`, `.field`, `.chip`… | una clase adaptada sin añadirla a `styles.css` | todo con las clases de `@layer components`, un estado nuevo documentado | además, el estado nuevo está en `styles.css` y reutilizado donde toca |
| Tokens y temas | colores literales o solo probado en un tema | tokens pero sin revisar el tema claro | tokens (`ink`, `surface`, `berry`…) y correcto en oscuro y claro | además, los overrides de `[data-theme='light']` se usan donde el contraste lo pide |
| Encaje | scroll horizontal o desborde en algún tamaño | cabe a 1280 pero no se ha mirado a 390 ni a 1920 | cabe en 390, 1280 y 1920 sin desbordes ni solapes (`measureLayout` limpio) | además, el espacio sobrante a 1920 se aprovecha o se deja limpio a propósito |
| Interacción | falta algún estado (hover, foco, deshabilitado, cargando) | estados presentes pero el teclado no llega a todo | hover, foco visible, deshabilitado, `aria-busy`/cargando; teclado completo; objetivos ≥ 44 px | además, foco inicial y retorno de foco correctos (diálogos, errores con `role="alert"`) |
| Movimiento | animaciones que no sean transform/opacity o sin `prefers-reduced-motion` | solo transform/opacity pero sin reducción | dentro del presupuesto (≤ 400 ms) y con reducción en `styles.css` | además, una animación con intención (revelado, acierto) |
| Estados de datos | falta vacío, carga o error | existen pero sin acción | los tres con texto claro y acción (`.empty-state`, `.skeleton`, `.status-error`) | además, el estado vacío enseña a jugar |

### Cómo leer la tabla

- Cada nivel exige el anterior. Un 3 exige cumplir el "además": si no tiene a qué aplicarse en esa
  pantalla (por ejemplo, no hay ningún estado nuevo ni ningún diálogo), la nota se queda en 2.
- **Colores literales**: cuentan los que se pintan en la pantalla, estén en el componente o dentro
  de una clase de `styles.css` (por ejemplo, un `background: #…` en una clase de `@layer components`).
- **Animaciones**: cualquier `animation` o `transition` que mueva o cambie tamaño, color o sombra
  de forma visible. Las transiciones de color de hover/foco/pulsado de `.btn`, `.field`, etc.
  (≤ 200 ms, respuesta a una acción) son estado, no animación. Un `animate-spin` sin
  `motion-reduce:animate-none` (ni regla en `styles.css`) es "sin reducción".
- **Tema claro**: "revisado" significa que existe una captura en claro de esa pantalla
  (`pinTheme(context, 'light')`) y se ha mirado.
- Sin captura a 390 ni a 1920, el Encaje no pasa de 1.

## Procedimiento

1. Ejecuta los E2E: `npm run test:e2e` (todo) o solo el spec de la pantalla, desde `e2e/`:
   `npx playwright test tests/<spec>.spec.ts`. `capture()` falla si hay scroll horizontal o si
   `measureLayout` encuentra texto < 12 px, solapes, recortes sin `title` o controles fuera de su caja.
2. Abre las capturas de `e2e/screenshots/` de la pantalla en los tres tamaños (y en claro si la
   pantalla cambia colores) y míralas antes de dar la tarea por hecha.
3. Puntúa los ocho criterios con la tabla. Movimiento e Interacción se juzgan también leyendo
   `apps/web/src/styles.css` y el código del componente (no se ven en una captura fija).
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
la app).

- Ninguna por ahora. En la línea base se corrigieron en vez de excluirse: la etiqueta "Tu foto" de
  `AuthPage` y las insignias `.experimental-badge` y `.recommended-badge`, que pasaron a `text-xs`.

## Seguimientos

Pendientes de la línea base (ninguna pantalla llega a 19; no son cambios de esta rama).

Notas actuales (a Jerarquía, b Legibilidad, c Componentes, d Tokens/temas, e Encaje, f Interacción, g Movimiento, h Estados):

- Portada: 3, 2, 2, 1, 3, 2, 2, 2 = 17/24
- Acceso: 3, 2, 1, 2, 3, 1, 1, 2 = 15/24
- Entrar en partida: 2, 2, 1, 1, 2, 1, 0, 2 = 11/24
- Lobby: 1, 1, 2, 0, 3, 2, 2, 1 = 12/24
- Juego: 2, 1, 1, 0, 1, 1, 0, 1 = 7/24

Cambios pendientes, por pantalla y criterio:

- Portada (d, h): captura en tema claro; el estado vacío sin acción propia que enseñe a jugar.
- Portada, entrar en partida, lobby y juego (d): capturas en tema claro.
- Juego (e): capturas a 390 y 1920 (bucle `SIZES` en `sala.spec.ts`).
- Acceso y entrar en partida (g): `motion-reduce:animate-none` en los `animate-spin` de `AuthPage` y `PlayPage`.
- Entrar en partida (g): puntos del carrusel con transform en vez de `transition-[width]`.
- Juego (g): `timer-pulse` solo con transform (hoy anima `color`) y barra del temporizador con `scaleX` o reducida.
- Lobby (d): `.experimental-badge` usa el literal `#c92a42`; pasarlo a un token (p. ej. `bg-berry`).
- Juego (d): quitar el literal `#ef476f` de `timer-pulse` y el `rgba(77,210,140,.35)` del brillo de acierto.
- Acceso (f, c): pestañas de 40 px (`min-h-10`); subir a 44 px con flechas, `aria-controls` y tabpanel (reutilizar `.lobby-tab`).
- Entrar en partida (f): puntos (`h-2.5`) y flechas (`!min-h-10`) del carrusel a 44 px; `aria-describedby="room-code-help"` apunta a un id inexistente (quitarlo o crear `#room-code-help`); `aria-busy` al entrar.
- Juego (f, h): indicador y `aria-busy` al enviar la selección; estado vacío del buscador que explique la ronda; `.empty-state` para «No hay coincidencias»; `title` en nombres truncados.
- Lobby (a, b, c, h): «Empezar partida» visible sin scroll a 1280×720; antetítulo coherente con el estado; `tabular-nums` en puntos y contador (también en el juego); error con `.status-error` en vez del toast propio; acción para limpiar la búsqueda vacía.
- Acceso (b): traducir el error del servidor de login («Invalid email or password»); el de sala inexistente («Room not found») también llega en inglés.
- Entrar en partida (e): evitar el hueco de la tarjeta izquierda a 1280/1920.
