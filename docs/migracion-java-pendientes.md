# Migración a Java: pendientes tras la etapa 1

Estado: etapa 1 implementada el 2026-10-31 en la rama `backend-java-etapa-1` (fusionada en `main` en local); 2A
fusionada en `main`; 2B implementada el 2026-11-02 en la rama `etapa-2b-motores` (pendiente de la decisión de
integración). Diseño en
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
2. Los 28 motores de juego, cada uno con pruebas golden contra el comportamiento de los motores TypeScript (hecho en
   2A + 2B).
3. `data-sync` (PokéAPI y TCGdex) y su planificador.
4. Administración.
5. Escrituras de categorías personalizadas, pares de Would You Rather y avatares (subida) (hechas en 2C; solo se enrutan a
   Java con `VITE_REALTIME=java` hasta 2D).
   Cambio de comportamiento de 2B: con TwelveMonkeys en el classpath, el proxy de assets (`ImageTransforms.decode`) y el
   catálogo de artworks decodifican fuentes WebP (antes «Unsupported»), más cerca de sharp; el lector WebP nativo de
   `webp-imageio` se retira del registro al arrancar (`config/ImageIoReaders`) y la libwebp solo codifica avatares.
6. `/api/tcg/*`. Desviación consciente de la especificación (§0 lo situaba en la etapa 1): el plan lo aplazó porque depende del ciclo de vida de la caché del catálogo TCG que refresca data-sync; mientras tanto lo sigue sirviendo Node.
7. Proxy de assets de las rondas (hecho en 2B; producción lo sigue sirviendo Node hasta 2D).
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

### 2B: motores y assets (hecho el 2026-11-02)

Implementado en la rama `etapa-2b-motores` (plan `superpowers/plans/2026-10-31-etapa-2b-motores.md`): los 26 motores
restantes, 28/28 registrados en `portedEngines` con sus fixtures; arnés dorado con comparación sensible al orden de
claves, fixtures de contexto (host, visuales, audio, TCG, `catalogPatch`) y pasos `asset`; catálogo en memoria con
learnsets, evolución, entradas de Pokédex y paletas; `Collations` sobre ICU4J; proxy de imágenes y gritos de ronda
(`GameAssetController`, caché, catálogos visual y de audio, límite propio de 5000/min) y regla de Vite `^/api/rooms/`
con `VITE_REALTIME=java`. Canal de cursores de Quién es Quién sobre el `CursorRelay` de 2A. E2E `juegos.spec.ts`:
26 pasados y 2 saltados con el literal del servidor en cada transporte. Detalle en
[`architecture.md`](architecture.md#motores-y-assets-en-java-etapa-2b).

Deuda de UI que destapa `juegos.spec.ts` (no es de 2B; seguimiento del responsable de la UI): la pasada estricta
(`PU_LAYOUT_STRICT=1`) falla en la mayoría de juegos, en Node y en Java, por etiquetas de `ServerTimer` a
`text-[10px]`, iniciales de `Avatar` `xs` a `text-[9px]` y la cabecera fija que tapa contenido cuando el autofoco del
buscador desplaza la página (Bingo); además, 8 juegos no muestran el título del manifest en pantalla.

### 2C: lo que necesita

- Catálogo TCG real (`TcgCardCatalog` JPA, port de `comparable-price.ts` y `CachedTcgCardCatalog`): hasta entonces
  las salas Java pasan `tcgCards = null` y `tcg-higher-lower` no se puede lanzar. El filtro por generaciones lo cubren
  sus tests (el `cardsFor` del arnés lo ignora en los dos lados).
- Paletas calculadas por el data-sync: la BD local no tiene `metadata.palette` y `pokemon-palette-guess` no se puede
  lanzar (en las fixtures llegan por `catalogPatch`).
- `PokemonAssetReference` lo escribe el data-sync (gritos y referencias que lee `JpaPokemonAudioCatalog`).
- `replaceCatalog` tras el sync debe recargar también visuales y audio (`GameCatalogs`), no solo el catálogo Pokémon;
  hoy nadie lo llama en producción.
- `HostContentProvider` respaldado por tablas: las categorías personalizadas ya salen de `CustomCategoryService`
  y los pares de Would You Rather de `WouldYouRatherPromptService` (2C, `/api/categories` y
  `/api/would-you-rather-prompts` en Java solo con `VITE_REALTIME=java`).
- `/api/categories` y `/api/would-you-rather-prompts` a Java en nginx en el corte 2D: mientras Node siga escribiendo
  las tablas, las cachés Java solo ven las filas escritas por Java (se cargan al arrancar).

### Corte 2D: Java dueño de las salas

- `VITE_REALTIME=java` por defecto en la imagen web y quitar `/socket.io/` de nginx.
- `location` de `/api/rooms/` en `infra/nginx.conf` hacia el backend Java (imágenes y gritos de ronda; en dev ya lo
  hace el proxy de Vite con `VITE_REALTIME=java`).
- Directorio de artworks en el backend: compose define `POKEMON_ARTWORK_DIR` (`/data/pokemon-artworks`) pero no monta
  nada; copiar los PNG a la imagen o compartir un volumen con Node (que los lleva dentro de la suya).
- Imagen nativa: AWT (ImageIO) e ICU4J necesitan su `resource-config`/metadatos; ver el riesgo «Imagen nativa».
- `PU_ROOMS_ENABLED=true` en el `.env` de compose (`ROOMS_ENABLED` del backend; hoy `false`, y `/ws` cierra con 4403).
- Activar `pu.interrupt-stale-rooms=true` (`INTERRUPT_STALE_ROOMS=true`) en el backend Java. Al arrancar marca como
  `INTERRUPTED`/`SERVER_STOPPED` las filas `RoomHistory` `ACTIVE` y `GameHistory` `IN_PROGRESS` que dejó el proceso
  anterior (`interruptStaleActivity` de Node). Está desactivado por defecto porque, mientras Node sirva salas sobre la
  misma base de datos, cada arranque de Java interrumpiría las salas vivas de Node y su `roomClosed` posterior ya no
  encontraría la fila `ACTIVE`. Al activarlo en Java hay que dejar de servir salas desde Node.

## Riesgos abiertos

| Riesgo | Detalle |
| --- | --- |
| Imagen nativa | Compila (UBI-micro) pero **falla al arrancar**: faltan metadatos de reflexión de Hibernate/ByteBuddy. El job `backend-native` de `main.yml` es no bloqueante y está fuera de la cadena de `deploy-pre`; nunca se ha comprobado su healthcheck. Se despliega la imagen JVM. Desde 2B, además, AWT (ImageIO) e ICU4J necesitan su `resource-config`/metadatos en la imagen nativa; sin verificar. Desde 2C, los SPI de ImageIO de TwelveMonkeys y `webp-imageio` (JNI con `System.load` de su `.so` y Kotlin stdlib) también. |
| E2E fuera de CI | Playwright necesita un catálogo sembrado (`npm run db:seed`, descarga de PokéAPI); ningún workflow lo ejecuta. |
| Micronaut 5.1 | Versión reciente (5.1.5); hay que vigilar versiones de parche y la compatibilidad de Micronaut Data/Serialization. |
| Imagen base | `eclipse-temurin:25-jre-alpine` ha de ser multiarquitectura (amd64/arm64); se comprueba al construir en CI, no está verificado de antemano. La libwebp de `webp-imageio` 0.11.0 está enlazada contra glibc, pero solo pide símbolos que musl exporta: en amd64 se comprobó codificando en la imagen Alpine (también con `/tmp` `noexec`); en arm64 solo se revisaron los símbolos, falta ejecutarla. |
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
- Caché del catálogo Pokémon: desde 2B la recarga horaria también carga movimientos, todas las filas de learnset y
  todas las entradas de Pokédex por JPA, y Java ya sirve `/api/pokemon` en producción. La recarga es de un solo vuelo
  (`CatalogSnapshotCache`, probado con lectores concurrentes en `PokemonCatalogServiceCacheTest`). Mejora opcional:
  una proyección ligera solo para `/api/pokemon` que no cargue learnsets ni Pokédex.
- El procesamiento incremental de anotaciones está desactivado para que el OpenAPI sea determinista; ralentiza la compilación.
- CI: los pushes en cola esperan a un build nativo en curso (concurrencia serie); un push solo de documentación
  redespliega PRE con imágenes idénticas; volver a lanzar un Main antiguo reetiqueta el `:pre` actual; las listas de rutas de
  los filtros están duplicadas entre workflows.
- Deuda de 2B (aplazada en las revisiones):
  - Resuelto en 2C: los helpers de lectura de configuración de las 28 clases `<Juego>Config` están en
    `engine/infra/ConfigReader` (de 2 830 a 1 678 líneas), y `ConfigMessagesSnapshotTest` fija sus mensajes en
    `config-messages.json`. Quedan locales, por su mensaje propio: el enum de Zoomed Pokémon («no admite ese valor»),
    las familias de Pokémon Bingo (una ausente da `families.<clave> debe ser booleano`) y su `maxConditionsPerCell`
    (`1.5` da «debe ser 1 o 2»), las pistas de Pokédle Race (`clues.<clave> debe ser booleano`), el `refine` de
    `roundSeconds` de PokéTaboo y las listas de texto y precios de TCG Higher or Lower. PokéTaboo lee `roundSeconds`
    como entero entre `Integer.MIN_VALUE` y `MAX_VALUE` antes del `refine`; con `option(...)` y el literal de Node
    igualaría el primer mensaje de Node para valores fuera de `int` (divergencia anterior a 2C, sin cambiar). Los
    `parse` de acciones de `<Juego>Types` siguen con su `strict`/`invalid()` propios (un único mensaje
    «Acción de … no válida.»).
  - 2C (configuraciones por usuario): `ConfigValidationException.path()` lleva la ruta Zod del primer issue y
    `GameEngine.configIssues` (modo «recoger todo» de `ConfigReader`) da todos los issues con su ruta para
    `StoredGameConfigMigration`. Los helpers locales anteriores informan su ruta (`reject`/`invalidAt`), así que ningún
    motor cae a la raíz. Como Zod 4, los issues de rango, lista vacía, clave desconocida y `refine` de campo son
    continuables (el `parse` sigue con el valor real y los `superRefine` cuentan) y los de tipo, enum y unión abortan.
    Diferencias con Zod: una ruta guarda solo su primer issue; los elementos de listas que recorre el motor (no
    `generations`) llevan la ruta de la lista sin índice; y un precio TCG no canónico frente a otro precio hace lanzar
    a `safeParse` en Node (y al arranque), mientras Java lo repara al defecto. Contrastado con el
    `migrateStoredGameConfig` de Node en `backend/src/test/resources/gameconfigs/migration-cases.json` (2 245 casos).
  - Helpers pequeños repetidos entre motores (`takeRandom`, `formatEs`, comprobaciones de sprite, `choosePrompt` y el
    pool de prompts); `isUsableWhoPokemonSprite` duplica `isUsableZoomedSprite`, `GuessFromStatsPlayerStats` duplica
    `PokemonPaletteStats` y los recuentos de lotes ganados y sin dueño están duplicados entre
    `PokemonTeamAuctionEngine` y `PokemonTeamAuctionRules`.
  - Records posicionales anteriores a la regla del builder, que siguen como deuda documentada (los de Pokémon
    Connections y Sketchmon ya usan builder): `PokeTabooPublicState`, `WhoIsWhoPublicState`, las copias `ZERO`/`afterX()`
    de `MostLikelyToStats`, `OneOfUsIsFakeStats`, `PokeTabooPlayerStats` y `TypeChainPlayerStats`,
    `PokemonTriviaOptionDetails`, `PokeTabooSecretPokemon`, `GuessFromStatsPokemonReveal`, `TcgCardPublicView`, los
    records posicionales que quedan en Bluff Auction y `PuzzleOptions`.
  - Auditoría de `.int()` (revisión final): todos los campos enteros anteriores a la regla están acotados por el
    `min`/`max` de Zod; no hay diferencia observable.
  - Arnés dorado: el paso `asset` nunca comprueba la forma del resultado esperado. El literal de catálogo TCG nulo de
    `tcg-higher-lower` solo tiene test unitario (el runner no puede grabar `checkAvailability`).
  - Persistencia: `MoveEntity.names` no se defiende de un JSON que no sea objeto, y `PokemonEntity.setEvolution` es un
    setter público que solo usan los tests.
  - Cargador de assets: el test de 9 MiB no comprueba que se corte pronto, el test del límite de pendientes no detecta
    más de 8 cargas a la vez, y el ejecutor estático del watchdog no se cierra nunca (es daemon; inofensivo).
  - `/api/pokemon` omite también `paletteWeights` (Node solo omite `palette`): divergencia defendible.
  - `domain/pokemon/conditions` importa `EngineException` del paquete de motores.
  - Pokémon Connections: la vuelta del respaldo curado no tiene test y `PuzzleOptions` es posicional. En Pokémon
    Impostor, la media rama «no es candidato» es inalcanzable. `SketchmonTypes` es largo (856 líneas con
    los builders; candidato a partirse).
  - E2E: `esperarCambio` pasa con un tic del temporizador, y las capturas cambian entre ejecuciones.
  - Formato de dobles enteros: Java emite `1.0` donde Node emite `1` (Sketchmon); igual por valor, distinto en texto. Los
    `configCases` con `x.0` se serializan como enteros, así que no prueban que Java acepte `20.0`.
  - El `cardsFor` del arnés no aplica la regla de producción «al menos 2 cartas o ninguna».
  - El lookbehind de Java mide unidades UTF-16: una letra fuera del BMP antes de un alias enmascara de más frente a JS
    (Learnset/Pokédex Entry).
  - `application-test.yml` apunta `pu.artwork-dir` a `java.io.tmpdir` (escanea `/tmp`; mejor una carpeta de `build/`).
  - `TrustedAssetSourceLoader` sigue redirecciones sin volver a comprobar el host; la decodificación de imágenes no
    limita el número de píxeles (riesgo de memoria, bajo).
  - `PokemonCatalogService` depende de clases adaptador (`FilesystemArtworkCatalog`, `JpaPokemonAudioCatalog`) en vez
    de puertos, como la concesión de la etapa 1.
  - El script de exportación dorada no fija `LANG=en_US.UTF-8`; si CI difiere en una comparación de textos, fijarlo
    ahí. La imagen `node:22-alpine` sin versión fija puede cambiar de ICU respecto a `icu4j` 78.3.

- Sincronización de Pokémon en Java (2C, `application/datasync/pokemon`; apagada con `pu.data-sync.enabled=false`):
  - Interruptor propio `BACKEND_DATA_SYNC_ENABLED` (no el `DATA_SYNC_ENABLED` de Node, que vale `true` en `.env`); en
    el corte 2D se pone a `true` y Node deja de sincronizar. `POKEAPI_BASE_URL` y `POKEAPI_SPRITE_BASE_URL` solo
    existen para las pruebas y exigen https (http solo hacia loopback).
  - Sprites: se rechaza por la cabecera una imagen de más de 4096² píxeles (sharp admite 16383² por defecto) con el
    literal `Input image exceeds pixel limit`; cuenta como paleta fallida.
  - Atajo INCREMENTAL portado con su defecto: con ≥ 100 paletas se compara `pokemon-species?limit=1`.count con el
    total de filas de `Pokemon` (formas incluidas), que ya lo supera en cuanto hay formas; una especie nueva no se
    detecta hasta un FULL (o hasta que falten paletas). Corregirlo en los dos lados a la vez.
  - El sembrador usa `SyncHttpClient` (backoff `500·2^(n-1)` + jitter, timeout 30 s, 16 MiB) en lugar del `fetchJson`
    propio de `seed.ts` (`intento·400` ms, sin timeout); conserva el literal `PokéAPI returned <status> for <label>`.
    Las transacciones no fijan los timeouts de 30 s/120 s de Prisma.
  - Prisma guarda los `float` de un `Json` con ~16 cifras (`paletteWeights` `0.14191852825229961` →
    `0.1419185282522996`); Java guarda el `double` exacto. Diferencia en la 17.ª cifra, sin efecto en el juego.
  - `PaletteExtractor` lee con ImageIO/`getRGB`: idéntico a sharp en los sprites de PokéAPI (PNG de 8 bits) y en las
    reducciones fijadas; un PNG de 16 bits o en gris podría diferir de los bytes crudos de sharp.
  - `seed.ts` sigue siendo también un CLI de Node (`POKEMON_SYNC=true`); Java solo tiene el adaptador.

## Métricas de CI

Pendientes. Antes (medido, `docker.yml`): ≈ 8:15 por push. Después: solo estimaciones en `DEPLOY.md`; completar con la
primera ejecución real de `main.yml` (frontend, node-server, backend, retag, deploy-pre y job nativo por separado).
