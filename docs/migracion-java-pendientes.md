# Migración a Java: pendientes tras la etapa 1

Estado: etapa 1 implementada el 2026-10-31 en la rama `backend-java-etapa-1` (pendiente de fusión). Diseño en
[`superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md`](superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md);
estructura vigente en [`architecture.md`](architecture.md#backend-java-etapa-1).

## Qué hace la etapa 1

Java atiende 11 rutas (`POST /api/auth/{register,login,guest,logout}`, `GET /api/auth/{me,profile}`,
`GET /api/auth/avatars/*`, `GET /api/changelog`, `POST /api/feedback`, `GET /api/games`, `GET /api/pokemon`) con la misma
cookie `pu_session` que Node. Hay unas 120 pruebas (`cd backend && ./gradlew check`), OpenAPI generado y tipos de la web
derivados de él, métricas, logs JSON, límites de peticiones, imagen JVM en Compose y CI separado por rutas.

## Verificación hecha y verificación pendiente

- Hecho: `npm run typecheck`, `npm run lint`, `npm test`, `./gradlew check`; pila Compose local con las rutas Java y la
  cookie aceptada por Node (informe de la tarea 15); E2E 12/12 en verde con el backend arrancado por Playwright (tarea 16).
- **Sin ejecución real de CI.** Los workflows solo se han validado con actionlint. La primera subida a `main` los
  ejercita y construye las tres imágenes (aún no hay Main verde). Hasta entonces los tiempos «después» de
  [`DEPLOY.md`](../DEPLOY.md) son estimaciones y hay que sustituirlos por los medidos.
- Local: `e2e/playwright.config.ts` usa `reuseExistingServer`; si otro proceso ocupa el puerto 5173 (en esta máquina, el Vite
  de otro proyecto) Playwright lo reutiliza y las pruebas fallan o prueban otra aplicación. Se ejecutaron en el 5174.

## Etapa 2: alcance

1. Salas, estado de sala y reconexión en Java.
2. Los 28 motores de juego, cada uno con pruebas golden contra el comportamiento de los motores TypeScript.
3. `data-sync` (PokéAPI y TCGdex) y su planificador.
4. Administración.
5. Escrituras de categorías personalizadas, pares de Would You Rather y avatares (subida).
6. `/api/tcg/*`. Desviación consciente de la especificación (§0 lo situaba en la etapa 1): el plan lo aplazó porque depende del ciclo de vida de la caché del catálogo TCG que refresca data-sync; mientras tanto lo sigue sirviendo Node.
7. Proxy de assets de las rondas.
8. WebSocket: el transporte `/ws` de Java existe desde 2A (mismos 21 eventos cliente→servidor y 7 servidor→cliente que
   Socket.IO); 2D lo convierte en el transporte por defecto y retira Socket.IO.
9. Mover `apps/web` a `frontend/` e incluir dentro `shared/public`.
10. Retirar Node y `prisma migrate deploy`; Flyway pasa a ser el único dueño del esquema (entonces se permiten `V2__` y
    posteriores) y se elimina la tabla `_prisma_migrations`.

### 2A: núcleo de salas (hecho el 2026-10-31)

Implementado en la rama `etapa-2a-nucleo-salas`: arnés dorado (exportador TS + replayer Java, `npm run check:golden`),
SPI `GameEngine`, `RoomCoordinator`, transporte `/ws` con sobre, acks, latido y límites, motores `higher-lower` y
`pokedex-distance`, adaptador WebSocket en la web bajo `VITE_REALTIME=java`, `location = /ws` en nginx e interruptor `pu.rooms.enabled`
(`ROOMS_ENABLED`, apagado en producción: `/ws` cierra con 4403). Detalle en
[`architecture.md`](architecture.md#salas-en-java-etapa-2a). E2E: `npm run test:e2e` (Node) y `npm run test:e2e:java`
(mismos specs contra el `/ws` de Java), 12/12 en ambos. El transporte por defecto sigue siendo Node.

### 2B: lo que necesita

- Los 26 motores restantes, por lotes, cada uno con sus fixtures doradas y su E2E.
- Proxy de imágenes y audio de ronda (las transformaciones de `sharp` de Node).
- Canal de cursores de Quién es Quién (`who-is-who:cursor*`, fuera del límite de eventos).
- Comparación sensible al orden de claves de `Record<string,…>` en el arnés dorado (constraint 3 frente a 6): hoy
  `JsonTree.firstDifference` compara los objetos clave a clave sin mirar el orden, así que un `LinkedHashMap` con otro
  orden de inserción que el de TS pasaría el arnés y cambiaría el orden en el cable.
- Catálogo en memoria: `levelUpMoves`, `evolutionInfo` y `pokedexEntries` (los motores que los usan no están portados).
- `Collator` para los `localeCompare` sobre nombres visibles (los ids de jugador se ordenan igual con `compareTo`).

### Corte 2D: Java dueño de las salas

- `VITE_REALTIME=java` por defecto en la imagen web y quitar `/socket.io/` de nginx.
- `PU_ROOMS_ENABLED=true` en el `.env` de compose (`ROOMS_ENABLED` del backend; hoy `false`, y `/ws` cierra con 4403).
- Activar `pu.interrupt-stale-rooms=true` (`INTERRUPT_STALE_ROOMS=true`) en el backend Java. Al arrancar marca como
  `INTERRUPTED`/`SERVER_STOPPED` las filas `RoomHistory` `ACTIVE` y `GameHistory` `IN_PROGRESS` que dejó el proceso
  anterior (`interruptStaleActivity` de Node). Está desactivado por defecto porque, mientras Node sirva salas sobre la
  misma base de datos, cada arranque de Java interrumpiría las salas vivas de Node y su `roomClosed` posterior ya no
  encontraría la fila `ACTIVE`. Al activarlo en Java hay que dejar de servir salas desde Node.

## Riesgos abiertos

| Riesgo | Detalle |
| --- | --- |
| Imagen nativa | Compila (UBI-micro) pero **falla al arrancar**: faltan metadatos de reflexión de Hibernate/ByteBuddy. El job `backend-native` de `main.yml` es no bloqueante y está fuera de la cadena de `deploy-pre`; nunca se ha comprobado su healthcheck. Se despliega la imagen JVM. |
| E2E fuera de CI | Playwright necesita un catálogo sembrado (`npm run db:seed`, descarga de PokéAPI); ningún workflow lo ejecuta. |
| Micronaut 5.1 | Versión reciente (5.1.5); hay que vigilar versiones de parche y la compatibilidad de Micronaut Data/Serialization. |
| Imagen base | `eclipse-temurin:25-jre-alpine` ha de ser multiarquitectura (amd64/arm64); se comprueba al construir en CI, no está verificado de antemano. |
| Primer despliegue | La imagen `pokemon-universe-backend` debe existir en GHCR antes de `docker compose pull`; la primera ejecución de `main.yml` la crea. |
| Contadores de límite | Los límites de peticiones viven en memoria: válidos con una sola instancia del backend. |
| Observabilidad expuesta | `/health` y `/prometheus` no tienen autenticación; es seguro solo mientras nginx no los enrute. |

## Deuda técnica conocida

- **OpenAPI más laxo que `shared`**: `email` y `role` aparecen anulables y los enumerados como `string`; los tipos
  generados no son asignables a los de `shared`. Hay que afinar las anotaciones Java (y quitar los alias sin uso
  `ProfileResponse`, `GamesResponse`, `PokemonResponse` si siguen sin usarse).
- Las subclases de `Error` no pasan por el manejador de 500 JSON y devuelven el cuerpo por defecto de Micronaut.
- El login distingue por tiempo entre correo desconocido y contraseña errónea (igual que Node).
- Un cuerpo mal formado de un anónimo en `POST /api/feedback` da 400 antes que 401 (Node comprueba la autenticación primero).
- No se valida `nbf` del JWT (la comprobación de `jose` en Node sí).
- Sin ejecución concurrente probada del caché del catálogo Pokémon (sin protección de carga única).
- El procesamiento incremental de anotaciones está desactivado para que el OpenAPI sea determinista; ralentiza la compilación.
- CI: los pushes en cola esperan a un build nativo en curso (concurrencia serie); un push solo de documentación
  redespliega PRE con imágenes idénticas; volver a lanzar un Main antiguo reetiqueta el `:pre` actual; las listas de rutas de
  los filtros están duplicadas entre workflows.

## Métricas de CI

Pendientes. Antes (medido, `docker.yml`): ≈ 8:15 por push. Después: solo estimaciones en `DEPLOY.md`; completar con la
primera ejecución real de `main.yml` (frontend, node-server, backend, retag, deploy-pre y job nativo por separado).
