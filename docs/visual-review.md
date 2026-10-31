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

- Cada nivel exige el anterior. Si el "además" del 3 no tiene a qué aplicarse en esa pantalla (por
  ejemplo, no hay ningún estado nuevo ni ningún diálogo), un 2 cumplido por completo cuenta como 3.
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
