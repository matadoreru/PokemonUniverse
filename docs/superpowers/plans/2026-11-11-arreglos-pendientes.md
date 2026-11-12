# Arreglos pendientes (2026-11-11)

Encargo del usuario: «Corrige todo» sobre la lista de pendientes. Decisiones del usuario: notas de parche **0.8.0**;
**intentar** la imagen nativa; **borrar** `_prisma_migrations`. Fuera: Ability Hunt (cancelado por el usuario), el
commit vacío de la rúbrica (reescribir main publicado) y la pregunta de Tailwind (decisión del usuario). El correo en PRO
ya está arreglado.

Proceso: cada parte en su rama y worktree, un implementador y una revisión, y después fusionar en main y hacer push.
Solo tests de lo tocado, y un trabajo pesado cada vez.

Ruling: producción ya ha pasado el corte 2D. La recuperación de contraseña solo existe en Java, es posterior a 2D y
funciona en PRO. Si es incorrecto, un rollback a través del corte dejaría de estar soportado.

## Partes

- [x] **A. Deuda pequeña del backend:**
  - las subclases de `Error` devuelven el 500 en JSON;
  - validación de `nbf` del JWT (mirar antes si Micronaut Security trae un validador que baste con activar);
  - login sin diferencia de tiempo entre un usuario desconocido y una contraseña errónea (test: el hasher también corre
    con un usuario desconocido);
  - `POST /api/feedback` comprueba la autenticación antes de validar el cuerpo;
  - consulta ligera para `/api/pokemon/selector`.
- [x] **B. OpenAPI más estricto:**
  - `email`/`role` no anulables y los enumerados como `enum`, comprobando antes los caminos de invitado y de cada DTO;
  - quitar `ProfileResponse`/`GamesResponse` si nadie los usa;
  - `verifyOpenApi`, después `api:types` y typecheck.
- [x] **C. Limpieza del corte y Prisma:**
  - en `scripts/deploy.sh`, quitar `legacy_server_container`, `rollback_across_cutover` y `PU_CUTOVER_ROLLBACK_JAVA`;
  - en `compose.yaml`, los interruptores a `true` fijo;
  - quitar los escenarios del corte de `scripts/test-deploy-rollback.sh`;
  - migración que borra `_prisma_migrations`, revisando antes el baseline de Flyway y `FlywayMigrationsTest`;
  - ejecutar `test-deploy-rollback.sh` y shellcheck.
- [x] **D. Detalles menores de los juegos nuevos** (comprobar cada uno contra main antes de tocarlo):
  - **Traductor Unown:**
    - en el móvil, ajustar el tamaño mínimo del glifo a la palabra más larga real del mazo;
    - `md` en el móvil con letra de 22 px;
    - `.stage > div` depende del DOM de `GuessClue`;
    - resultados finales sin los aciertos de la última ronda;
    - test débil de «sin letra visible»;
    - 28 px sin token en `--unown-chrome`;
    - `cqi`/`cqb` dependen de un contenedor de tamaño.
  - **¿Quién soy?:**
    - la captura desplazada, con `capture()`;
    - el orden del DOM en el móvil, en el JSX y no con `order`;
    - cartas ajenas sin Pokémon que dicen «Tu Pokémon»;
    - doble toque en `GUESS_SELF`;
    - la rama de observador muestra «Turno de <yo>»;
    - el texto de la pregunta se pierde al abrir «Adivinar».
  - **Pokédex Absurda:**
    - `aliasesFor`/`aliasPattern` privados y el patrón precompilado;
    - tests que faltan (CLASSIC vacío, graciosa a la oficial, REAL sin votos);
    - `aria-pressed` sin test;
    - nombres de test con números viejos (`listsFortyEight…`, `loadsTwentyEight…`);
    - la 4.ª tarjeta cortada en la revelación REAL a 1280;
    - el récord vacío «Mejor ojo».
  - Hecha el 2026-11-12. Ya resueltos por el rediseño de Unown (letras por ronda) o por los borradores: el tamaño mínimo
    del glifo, el `md` de 22 px, el test de «sin letra visible» y el texto de la pregunta al abrir «Adivinar». La
    «graciosa a la oficial» y el `aria-pressed` ya tenían test. El resto, arreglado: el mensaje de Unown con su propio
    contenedor de tamaño (sin `.stage > div` ni los 28 px), quién descifró el último mensaje en los resultados, la
    captura con `capture()`, la placa de ¿Quién soy? en su sitio del DOM en el móvil (al cruzar 1024 px el buscador se
    monta de nuevo), «Pokémon oculto», un intento por turno, la placa en segunda persona, los tests de CLASSIC vacío y
    REAL sin votos, los nombres de test, las cuatro tarjetas en una fila a 1280 y los récords sin dueño ocultos.
- [x] **E. Documentación:** «Qué queda», «Riesgos» y «Deuda» de `docs/migracion-java-pendientes.md` al día. Hay que
  comprobar la CI con `gh run list`; el oráculo Node ya está retirado.
- [x] **F. Notas de parche 0.8.0 (V16 o la siguiente libre):** los tres juegos nuevos y los arreglos visibles, con el
  patrón idempotente `NOT EXISTS` de V14/V15.
- [x] **H. Tailwind sin forma ni decoración** (decisión del 2026-11-11, ya en `AGENTS.md`):
  - Tailwind vale para maquetación y para peso, mayúsculas, `tracking-*` y `leading-*`;
  - `rounded*`, `border*` y `shadow*` pasan a los componentes de `ui/` o a CSS Modules con los tokens (unas 30 clases en
    unas 15 pantallas);
  - el lint `no-arbitrary-style` empieza a rechazarlas fuera de `ui/`;
  - Playwright solo de las pantallas tocadas, sin cambios visibles salvo radios que pasen a los del sistema.
  - Hecha en el paquete 8 del pulido (regla `no-tailwind-shape` en `eslint.config.mjs`).
- [ ] **G. Imagen nativa:** intentar que arranque, con compilaciones nativas de una en una y avisando al usuario.
  - Intentado el 2026-11-13 en la rama `backend/imagen-nativa`: **no se ha visto arrancar**. El binario completo no
    se pudo compilar en la máquina de desarrollo: tres compilaciones, las tres paradas por memoria (`-J-Xmx4g` y
    `-J-Xmx5g` en GC continuo durante el análisis; `-J-Xmx6g` con el contenedor a 7 GB, muerto por memoria).
  - Queda en la rama todo lo que se pudo preparar y comprobar sin él: metadatos del agente de trazas, Hibernate sin
    ByteBuddy, migraciones de Flyway en el binario, `Dockerfile.native` con las bibliotecas de AWT y WebP y el
    `HEALTHCHECK` (`--healthcheck`), y el humo `scripts/backend-native-smoke.mjs`. Un binario nativo de prueba con
    ImageIO, TwelveMonkeys, WebP por JNI, ICU4J y el listado de migraciones sí funciona en UBI-micro.
  - Siguiente paso: compilar donde haya 8 GB libres o más y pasar el humo. Detalle y receta en
    `docs/migracion-java-pendientes.md`, «Qué queda», punto 1.
