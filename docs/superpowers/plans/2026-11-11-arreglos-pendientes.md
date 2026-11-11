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

- [ ] **A. Deuda pequeña del backend:**
  - las subclases de `Error` devuelven el 500 en JSON;
  - validación de `nbf` del JWT (mirar antes si Micronaut Security trae un validador que baste con activar);
  - login sin diferencia de tiempo entre un usuario desconocido y una contraseña errónea (test: el hasher también corre
    con un usuario desconocido);
  - `POST /api/feedback` comprueba la autenticación antes de validar el cuerpo;
  - consulta ligera para `/api/pokemon/selector`.
- [ ] **B. OpenAPI más estricto:**
  - `email`/`role` no anulables y los enumerados como `enum`, comprobando antes los caminos de invitado y de cada DTO;
  - quitar `ProfileResponse`/`GamesResponse` si nadie los usa;
  - `verifyOpenApi`, después `api:types` y typecheck.
- [ ] **C. Limpieza del corte y Prisma:**
  - en `scripts/deploy.sh`, quitar `legacy_server_container`, `rollback_across_cutover` y `PU_CUTOVER_ROLLBACK_JAVA`;
  - en `compose.yaml`, los interruptores a `true` fijo;
  - quitar los escenarios del corte de `scripts/test-deploy-rollback.sh`;
  - migración que borra `_prisma_migrations`, revisando antes el baseline de Flyway y `FlywayMigrationsTest`;
  - ejecutar `test-deploy-rollback.sh` y shellcheck.
- [ ] **D. Detalles menores de los juegos nuevos** (comprobar cada uno contra main antes de tocarlo):
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
- [ ] **E. Documentación:** «Qué queda», «Riesgos» y «Deuda» de `docs/migracion-java-pendientes.md` al día. Hay que
  comprobar la CI con `gh run list`; el oráculo Node ya está retirado.
- [ ] **F. Notas de parche 0.8.0 (V16 o la siguiente libre):** los tres juegos nuevos y los arreglos visibles, con el
  patrón idempotente `NOT EXISTS` de V14/V15.
- [ ] **G. Imagen nativa:** intentar que arranque, con compilaciones nativas de una en una y avisando al usuario.
