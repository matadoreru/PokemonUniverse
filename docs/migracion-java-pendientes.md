# Migración a Java: estado y pendientes

Estado: **migración completada y desplegada**. Etapa 1 implementada el 2026-10-31; 2A, 2B y 2C fusionadas en `main`; el
corte 2D (Java único backend) implementado el 2026-11-03 y en producción. Todo está en `main` con push, la CI se
ejecuta en cada push desde el 2026-10-31 y el oráculo Node está retirado. Lo que queda está en
[«Qué queda»](#qué-queda). Diseño en
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
- CI real: el primer Main verde es del 2026-10-31 y desde entonces corre en cada push a `main` (dos imágenes, web y
  backend). Los tiempos medidos del despliegue a PRE están en [`DEPLOY.md`](../DEPLOY.md) («Tiempos del despliegue a
  PRE»).
- Local: `e2e/playwright.config.ts` usa `reuseExistingServer`; si otro proceso ocupa el puerto 5173 (en esta máquina, el Vite
  de otro proyecto) Playwright lo reutiliza y las pruebas fallan o prueban otra aplicación. Se ejecutaron en el 5174.

## Etapa 2: alcance

1. Salas, estado de sala y reconexión en Java.
2. Los 28 motores de juego, cada uno con pruebas golden contra el comportamiento de los motores TypeScript (hecho en
   2A + 2B).
3. `data-sync` (PokéAPI y TCGdex) y su planificador (hecho en 2C; encendido en compose desde 2D).
4. Administración (hecho en 2C; enrutada a Java en producción desde 2D).
5. Escrituras de categorías personalizadas, pares de Would You Rather y avatares (subida) (hechas en 2C; enrutadas a Java
   en producción desde 2D).
   Cambio de comportamiento de 2B: con TwelveMonkeys en el classpath, el proxy de assets (`ImageTransforms.decode`) y el
   catálogo de artworks decodifican fuentes WebP (antes «Unsupported»), más cerca de sharp; el lector WebP nativo de
   `webp-imageio` se retira del registro al arrancar (`config/ImageIoReaders`) y la libwebp solo codifica avatares.
6. `/api/tcg/*` (hecho en 2C con el catálogo TCG y el adaptador TCGdex; enrutado a Java en producción desde 2D).
   Desviación consciente de la especificación (§0 lo situaba en la etapa 1): dependía del
   ciclo de vida de la caché del catálogo TCG que refresca data-sync.
7. Proxy de assets de las rondas (hecho en 2B; en producción desde 2D).
8. WebSocket: el transporte `/ws` de Java existe desde 2A (mismos 21 eventos cliente→servidor y 7 servidor→cliente que
   Socket.IO); desde 2D es el único y Socket.IO está retirado de la web y de nginx.
9. Mover la web a `frontend/` e incluir dentro `shared/public` (hecho en 2D).
10. Retirar Node y `prisma migrate deploy`; Flyway pasa a ser el único dueño del esquema y se permiten `V2__` y
    posteriores (hecho en 2D). La tabla `_prisma_migrations` se conservó tras el corte y la borra
    `V16__borrar_prisma_migrations.sql`; `schemaVersion` en `/api/health` ya no la usa de respaldo. Ver «Historiales de
    esquema» en [`DEPLOY.md`](../DEPLOY.md#4-backups).

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

### 2C: datos y administración (hecho el 2026-11-03)

Implementado en la rama `etapa-2c-datos-administracion` (plan
`superpowers/plans/2026-11-02-etapa-2c-datos-administracion.md`; detalle en
[`architecture.md`](architecture.md#datos-y-administración-en-java-etapa-2c)):

- `ConfigReader` común para las 28 `<Juego>Config` (deuda de 2B) con modo «recoger todo» para la migración de
  configuraciones guardadas.
- `GET /api/health` de Java, ya enrutado por nginx (`location = /api/health`): única ruta nueva en producción.
- Categorías personalizadas (`/api/categories`) y dilemas de Would You Rather (`/api/would-you-rather-prompts`, con
  importación), respaldando el `HostContentProvider` de las salas Java y reemitiendo `room:state` al host.
- Configuraciones por usuario (`UserGameConfigService`: `migrateStoredGameConfig`, debounce y `flush()` al apagar).
- Escritura de avatares (`POST /api/auth/guest/custom-avatar`, `PUT /api/auth/profile/avatar/custom`,
  `DELETE /api/auth/profile/avatar`) con WebP nativo de `webp-imageio`. Un avatar es `DEFAULT` (la inicial) o `CUSTOM`
  (imagen subida); los predefinidos se retiraron en F7 (`V2__avatares_sin_predefinidos.sql`).
- Data-sync: `DataSyncService`, planificador, `SyncHttpClient`, adaptadores PokéAPI (sembrador, normalización y
  paletas) y TCGdex, catálogo TCG (`CachedTcgCardCatalog`) y `/api/tcg/{options,eligibility}`; recarga de los catálogos
  de sala tras cada sincronización.
- Administración: `/api/admin/**` (resumen, salas activas e historial, partidas, usuarios, data-sync, novedades y
  feedback).

E2E: `contenido-y-admin.spec.ts` (un USER crea, edita y borra una categoría y un dilema y ve su avatar PNG en la sala; un
ADMIN ve la sala activa) pasa con Node y con Java. Sin cambios de esquema (ninguna `V2__`). Suites completas el
2026-11-03: `npm run test:e2e` 41/41; `npm run test:e2e:java` 40/41. Falla `acceso a 1280×720`, el primer test de la
pasada: la captura de «Entrar en partida» coincide con el aviso «Conectando con la sala» (`RoomSessionLayout`) y el
medidor lo cuenta como solape con la cabecera. Es la primera apertura de `/ws` tras arrancar Java en frío (en 2C,
≈ 0,7 s frente a 5 ms en caliente); con el backend ya caliente el spec pasa. **Es previo a 2C:** en un worktree de
`main` (3d0ef85) sin ningún servidor levantado, `npm run test:e2e:java -- acceso` falla igual (1 fallo y 3 pasados;
mismo solape «Pokémon Universe» ⟷ «Conectando con la sala», 903 px²; en esa pasada no se midió la latencia de `/ws`).
Resuelto en la Tarea 2 de 2D: el aviso vive ahora en un hueco de la cabecera fija, bajo la fila de marca, y
«Conectando» solo aparece tras 400 ms sin conexión (una conexión perdida se avisa al momento). `sala.spec.ts` fija los
estados con un `/ws` simulado y comprueba que una entrada normal no muestra el aviso.

#### Convivencia con Node hasta 2D (histórico)

Así convivieron los dos servidores hasta el corte; desde 2D Node no se despliega y estas restricciones ya no aplican a
producción, pero explican decisiones que siguen en el código (interruptores separados, cargas condicionadas a las salas).

- **Rutas solo en Vite.** `infra/nginx.conf` solo ganó `/api/health`. Las demás rutas de 2C van a Java en desarrollo y
  E2E: desde la Tarea 2 de 2D, `proxyFor()` de `frontend/vite.config.ts` manda todo `/api` y `/ws` a `:8080` (ya no hay
  bandera `VITE_REALTIME` ni modo `node`). En producción siguen en Node hasta que nginx pase a Java en el corte: Node
  guarda en memoria categorías, dilemas, configuraciones y el catálogo TCG, que quedarían obsoletos si Java escribiera.
- **Cachés Java también en memoria.** Las de categorías, dilemas y configuraciones se cargan al arrancar y solo ven lo
  que escribe Java; el catálogo TCG se recarga al arrancar y tras cada TCGDEX completada **por Java**. Con Node
  escribiendo (producción), el estado de Java queda viejo hasta reiniciarlo; por eso no se enrutan en nginx.
- **Un solo sincronizador.** Java usa su propio interruptor, `BACKEND_DATA_SYNC_ENABLED` (`pu.data-sync.enabled`, por
  defecto `false`), y no el `DATA_SYNC_ENABLED` de Node (que `.env.example` pone a `true`): un `.env` o un shell
  compartido no puede arrancar dos sincronizadores sobre la misma BD. Apagado, Java no programa nada, no hace la
  sincronización inicial ni la de TCG, y las rutas admin de data-sync responden 503
  `La sincronización de datos no está disponible`.
- **`recoverInterrupted` también depende del interruptor** (en Node corre siempre): con Node sincronizando, Java
  marcaría `FAILED` una ejecución viva de Node. Coste: una fila `RUNNING` que deje un Java caído solo se repara cuando
  Java vuelva a arrancar con el data-sync encendido (apagado no sincroniza, así que no puede dejarla).
- **Cargas de arranque solo con las salas encendidas.** `UserGameConfigLoader` (migra y reescribe filas de
  `UserGameConfig`), la carga de las cachés de categorías y dilemas (`HostContentWiring.CacheLoader`) y el
  `refresh()` del catálogo TCG (`TcgCatalogStartup`) llevan `@Requires(property = "pu.rooms.enabled", value = "true")`.
  Con las salas apagadas (producción) Java no lee ni escribe esas tablas al arrancar: antes migraba y reescribía
  `UserGameConfig` en cada arranque de producción, sin ningún lector (el `create()` de sala es inalcanzable) y con
  una ventana de escrituras perdidas frente a Node. Sin cargar, `GET /api/categories` y
  `GET /api/would-you-rather-prompts` devuelven solo lo que Java haya escrito desde que arrancó (normalmente `[]`), las
  mutaciones escriben en la BD (la unicidad sigue dando 409) y `/api/tcg/*` responde 500 «El catálogo TCG todavía no
  está disponible.»; nginx no enruta ninguna hasta 2D.
- **Avatares.** Node y Java escriben en el mismo directorio (`apps/server/.data/avatars` en dev, volumen compartido en
  Compose); el limitador de 12 escrituras por 15 min y IP es por proceso.

#### Diferencias de Java con Node (decididas)

- **Límite de cuerpo: 10 MB en Java, 32 kB en Node** (decisión deliberada; se mantiene). `express.json` de Node corta a
  32 kB con 413 `{"error":"request entity too large"}` (el `PayloadTooLargeError` tiene `status` numérico y cae en la
  rama genérica del manejador global, no en la del literal del avatar). Java deja el máximo por defecto de Micronaut
  (10 MB), que necesita la subida de avatares (5 MiB en crudo); los cuerpos JSON los acotan los esquemas (textos de
  160/180 caracteres, importación de 1 a 100 dilemas). Si se quisiera paridad exacta, haría falta un filtro de
  tamaño por ruta, no un límite global.
- **Avatar corrupto: 400 en Java, 500 en Node** (sharp lanza un error sin estado). Java responde 400
  `El archivo no es una imagen JPEG, PNG o WEBP válida.`; además, un PNG con CRC erróneo o la orientación EXIF de
  un formato que no sea JPEG se toleran donde sharp es más estricto.
- **JSON mal formado de un anónimo: 401 en Java, 400 en Node** en las rutas admin: `express.json` de Node falla antes
  que su guardia y `AdminGate` de Java rechaza antes de leer el cuerpo. (En `POST /api/feedback`, desde la etapa 1, es
  al revés: 400 en Java y 401 en Node.)
- **Precio TCG no canónico** junto a otro precio en una configuración guardada: el `safeParse` de Node lanza (su
  migración y su arranque fallarían); Java repara ese precio al valor por defecto.
- **Hueco del cambio de hora (DST)** al calcular la próxima sincronización: Java resuelve `02:30` de la noche de
  primavera al instante de la transición (`03:00`); Node lanza. En otoño Java toma la primera de las dos `02:30`
  (solo afecta a `DATA_SYNC_HOUR=2`).
- **Cliente de sincronización**: una URI inválida no se reintenta ni se traduce, y un fallo de JSON tiene otro tipo y
  mensaje que en Node.
- **Cuerpos JSON `null`, mal formados o que no son objeto** (`/api/categories`, `/api/would-you-rather-prompts` y
  demás rutas que leen el cuerpo como árbol): `express.json` de Node (modo `strict`) los rechaza antes de la ruta con
  un 400 `{"error": <mensaje de body-parser>}`. Java responde también 400, con otro cuerpo: `null` se enlaza como
  cuerpo ausente (`{}`, el mismo error de Zod que un objeto vacío), el JSON roto da `{"error":"Invalid JSON"}` y un
  valor que no es objeto pasa por Zod (`Invalid input: expected object, received string`, con `issues`). Fijado en
  `CustomCategoryControllerTest.missingBodyIsAnEmptyObjectLikeExpress`.
- **Orden de claves del usuario** en las respuestas de avatar: distinto del de Node (herencia de la etapa 1; mismo
  contenido).
- **Cabeceras `RateLimit`** en borrador 6 frente al borrador 7 de Node (todos los limitadores, desde la etapa 1).

#### Comprobación con datos reales (2026-11-03)

Sincronización real contra la BD local de desarrollo con el backend Java (`BACKEND_DATA_SYNC_ENABLED=true`, Node con
`DATA_SYNC_ENABLED=false`): al arrancar, POKEAPI INITIAL completó en 48 s (1 025 paletas, antes 0; el catálogo ya
estaba sembrado) y la TCGDEX INITIAL automática falló a los 21 s con `TCGdex set bw6 returned HTTP 503` tras los cuatro
intentos (un 503 transitorio de TCGdex: la misma URL respondía 200 un minuto después). Relanzada desde
`POST /api/admin/data-sync/tcg` con un ADMIN, la ejecución (`PRICE_REFRESH` sin cartas, que recorre los sets) completó
en 7 min 29 s: 220 sets y 23 771 cartas, 18 986 con imagen y precio de mercado en `CachedTcgCardCatalog`, recargado al
terminar. Con esos datos, `npm run test:e2e:java -- juegos` (hoy `npm run test:e2e -- juegos`) pasa 28/28: `tcg-higher-lower` y `pokemon-palette-guess`
dejan de saltarse.

### Corte 2D: Java dueño de las salas y de los datos (hecho el 2026-11-03)

Implementado en la rama `etapa-2d-corte` (plan `superpowers/plans/2026-11-03-etapa-2d-corte.md`; resumen en
[`architecture.md`](architecture.md#corte-2d-java-único-servidor)): la web habla solo con Java y se movió a `frontend/`;
Flyway es el único dueño del esquema; compose sin Node, con salas, interrupción de salas y data-sync encendidos en el
backend y los artworks en su imagen; nginx manda `/api/` y `/ws` a Java; CI sin imagen de Node (el oráculo corría en el
job `oracle`, retirado después junto con el servidor Node); `deploy.sh` paraba Node antes de arrancar Java en el primer
despliegue y tenía un rollback que nunca dejaba a los dos con salas o sincronización. Ese código solo del corte se
retiró cuando producción pasó el corte (ver «Qué queda», punto 3).

Lista de comprobación (todo junto, en un mismo despliegue):

- [x] La web habla solo con Java (Tarea 2 de 2D): fuera el adaptador Socket.IO, `socket.io-client` y la bandera
  `VITE_REALTIME`; Vite manda todo `/api` y `/ws` a `:8080` y los E2E corren solo contra Java.
- [x] Quitar `/socket.io/` de nginx. (Tarea 5 de 2D.)
- [x] Nuevos `location` hacia `backend:8080` en `infra/nginx.conf`, antes de `location /api/`: `/api/categories`,
  `/api/would-you-rather-prompts`, `/api/admin/`, `/api/tcg/`,
  `/api/auth/(guest/custom-avatar|profile/avatar)` (con `/custom` y el `DELETE`; `/preset` se retiró en F7) y `/api/rooms/`
  (imágenes y gritos de ronda); `location = /ws` ya existe. La excepción de `proxyFor('java')` ya no existe
  (Tarea 2 de 2D: un único modo). (Tarea 5 de 2D: en su lugar, una sola `location ^~ /api/` y `location = /ws` hacia
  `backend:8080`.)
- [x] `BACKEND_DATA_SYNC_ENABLED=true` en el servicio `backend` de compose (con `DATA_SYNC_HOUR`, `DATA_SYNC_MINUTE`,
  `DATA_SYNC_TIMEZONE`) y `PU_DATA_SYNC_ENABLED=false` en Node, o Node retirado. Nunca los dos a la vez. (Tarea 4 de
  2D: Node fuera de compose; el valor es fijo, sin variable `PU_…`.)
- [x] `PU_ROOMS_ENABLED=true` (`ROOMS_ENABLED` del backend; hoy `false`, y `/ws` cierra con 4403). Encenderlo
  enciende también las cargas de arranque de `UserGameConfigLoader` (que **reescribe** las filas de `UserGameConfig`
  cuya migración cambia algo), de las cachés de categorías y dilemas y del catálogo TCG: Node tiene que haber dejado de
  escribir esas tablas en el mismo despliegue. (Tarea 4 de 2D: `ROOMS_ENABLED: "true"` fijo en compose, para que un
  `.env` antiguo con `PU_ROOMS_ENABLED=false` no lo apague; Node ya no está en compose.)
- [x] Antes de añadir `location /api/admin/` en nginx, sondear la normalización de rutas del `AdminGate` a través de
  nginx y de Micronaut: barra final (`/api/admin/`, `/api/admin/users/`), dobles barras (`//api/admin/users`,
  `/api//admin/users`), escapes (`/api/%61dmin/users`) y mayúsculas (`/api/ADMIN/users`). Cada variante debe acabar en
  401/403 o en 404, nunca en un 200 sin guardia ni en Node. (Tarea 5 de 2D: nginx reenvía la ruta sin normalizar,
  comprobado con un backend de eco y con el stack completo; `AdminGateTest` envía las variantes por socket: 401/403 las
  que Micronaut enruta al filtro, 404 `%61dmin`, `ADMIN`, `/./` y `admin%2F`.)
- [x] Arranque con el data-sync encendido y el catálogo vacío (`ensureInitialPokemon` sincroniza PokéAPI antes de
  aceptar peticiones y la TCG inicial corre en segundo plano): sin probar de punta a punta en Java, y en 2D pasa a ser
  el camino de producción (healthcheck y `--wait-timeout` del despliegue incluidos). (Tarea 4 de 2D:
  `config/ComposeStartupTest` con el entorno de compose y PokéAPI/TCGdex grabados; medida real de 107 s hasta la
  readiness y `start_period: 5m` en `DEPLOY.md`; `--wait-timeout` ≥ 450 s, hoy 600 s.)
- [x] `ClientAddress` toma el último salto de `X-Forwarded-For`: solo es fiable detrás de nginx, que lo fija. Exponer el
  backend directamente, o añadir otro proxy a la cadena, lo invalida para los limitadores. (Se cumple: el backend no
  publica puertos y nginx es el único salto; queda como restricción permanente, también en «Riesgos abiertos».)
- [x] La ruta de humo de Node de `scripts/deploy.sh` (`/api/tcg/options`) pasa a Java: elegir otra ruta de Node o
  quitar la comprobación si Node se retira. (Tarea 5 de 2D: `scripts/smoke-check.sh` comprueba `/api/health`,
  `/api/games`, `/api/tcg/options` y el handshake de `/ws`, todo Java.)
- [x] `INTERRUPT_STALE_ROOMS=true` (`pu.interrupt-stale-rooms`): al arrancar marca `INTERRUPTED`/`SERVER_STOPPED` las
  filas `RoomHistory` `ACTIVE` y `GameHistory` `IN_PROGRESS` que dejó el proceso anterior (`interruptStaleActivity` de
  Node). Apagado por defecto porque, mientras Node sirva salas sobre la misma BD, cada arranque de Java interrumpiría
  las salas vivas de Node. Al activarlo hay que dejar de servir salas desde Node. (Tarea 4 de 2D: fijo en compose;
  `ComposeStartupTest` siembra filas abiertas y comprueba que un arranque las interrumpe.)
- [x] Artworks: compose define `POKEMON_ARTWORK_DIR` (`/data/pokemon-artworks`) pero no monta nada; copiar los PNG a la
  imagen del backend o compartir un volumen con Node (que los lleva dentro de la suya). (Tarea 4 de 2D:
  `backend/assets/pokemon-artworks` → `/app/pokemon-artworks` en la imagen.)
- [x] Prueba de humo arm64 del codificador WebP: ejecutar una subida de avatar en la imagen `linux/arm64` (QEMU en CI o
  máquina arm64); hoy solo se comprobó en amd64. (Tarea 5 de 2D: job `webp-arm64` de `backend.yml`, que codifica con
  `WebpEncoderSmoke` en la imagen `linux/arm64` con `--read-only` y `/tmp` `noexec`. En verde en la ejecución
  41657262671 del 2026-11-03; desde entonces solo corre en PRs y cuando se publica arm64, con tags `v*` o a mano.)
- [ ] Imagen nativa: AWT (ImageIO), ICU4J, los SPI de TwelveMonkeys y `webp-imageio` (JNI con `System.load` y Kotlin
  stdlib) necesitan metadatos; ver el riesgo «Imagen nativa». Sigue desplegándose la imagen JVM. (No bloquea el corte:
  pasa a «Qué queda».)
- [x] Repetir `contenido-y-admin.spec.ts` y `juegos.spec.ts` solo contra Java. (Tarea 6 de 2D: `npm run test:e2e`
  completo y `juegos` 28/28 sobre el catálogo sincronizado de la BD local; ver «Verificación final».)

#### Verificación final (2026-11-03)

Rama `etapa-2d-corte`, sin servidores previos en 5173/8080 y con el catálogo ya sincronizado de la BD local:
`cd backend && ./gradlew check` en verde (96 s); `npm run typecheck` (13 s), `npm run lint` (9 s) y `npm test`
(13 s; 185 + 195 + 439 pruebas) en verde; `npm run test:e2e` 50/50 en 160 s, solo contra Java, con `juegos` 28/28 sin
saltos (`tcg-higher-lower` y `pokemon-palette-guess` incluidos). `scripts/test-deploy-rollback.sh` (nueve escenarios)
y `shellcheck` de los scripts de despliegue, limpios. Los `ws proxy socket error: ECONNRESET` del log de Vite son
cierres de `/ws` al cerrar las páginas, sin fallos.

## Qué queda

1. **Imagen nativa (parte G, pendiente: el usuario la retoma).** Compila pero falla al arrancar (metadatos de
   Hibernate/ByteBuddy, AWT, ICU4J, TwelveMonkeys y `webp-imageio`); se construye solo a mano
   (`backend-native.yml`). Se despliega la imagen JVM.
2. **CI: hecho.** Primer push y primera ejecución real de `main.yml` el 2026-10-31; desde entonces corre en cada push
   y despliega a PRE. `webp-arm64` y el job `oracle` (ya retirado) pasaron en la ejecución 41657262671. El 2026-11-11
   Main falló dos veces porque `JpaGameResultsPersisterTest.sendsOnePushPerUserAfterCommit` usaba la hora real: entre
   las 03:00 y las 05:00 de Madrid el perdedor también desbloqueaba «Búho nocturno». El test fija ahora el `Clock`
   inyectado a mediodía UTC, como `RoomHistoryWriterAchievementsTest`.
3. **Despliegue a PRE y a producción, a cargo del usuario.** Producción ya pasó el corte 2D (la recuperación de
   contraseña, solo en Java y posterior a 2D, funciona en PRO). El código solo del corte está retirado de
   `scripts/deploy.sh`: ya no se busca ni se para el contenedor Node (`legacy_server_container`), no existen
   `rollback_across_cutover` ni `PU_CUTOVER_ROLLBACK_JAVA` y los tres interruptores de `compose.yaml` valen `true` fijo.
   Un rollback a través del corte deja de estar soportado; un despliegue fallido vuelve a las imágenes exactas
   anteriores (`DEPLOY.md` §5). `scripts/test-deploy-rollback.sh` lo simula y se ejecuta en CI
   (`.github/workflows/deploy-scripts.yml`, con shellcheck) cuando cambian `scripts/**` o `compose.yaml`. Programar
   cada despliegue entre sesiones.
4. **Esquema: hecho.** `V16__borrar_prisma_migrations.sql` borra `_prisma_migrations` y `/api/health` lee solo
   `flyway_schema_history`.
5. **Deuda técnica.** La de «Deuda técnica conocida» más abajo.

## Riesgos abiertos

| Riesgo | Detalle |
| --- | --- |
| Imagen nativa | Compila (UBI-micro) pero **falla al arrancar**: faltan metadatos de reflexión de Hibernate/ByteBuddy. Se construye solo a mano (`backend-native.yml`), fuera de la cadena de `deploy-pre`; nunca se ha comprobado su healthcheck. Se despliega la imagen JVM. Desde 2B, además, AWT (ImageIO) e ICU4J necesitan su `resource-config`/metadatos en la imagen nativa; sin verificar. Desde 2C, los SPI de ImageIO de TwelveMonkeys y `webp-imageio` (JNI con `System.load` de su `.so` y Kotlin stdlib) también. |
| E2E fuera de CI | Playwright necesita un catálogo sembrado (`npm run db:seed`, descarga de PokéAPI); ningún workflow lo ejecuta. |
| Micronaut 5.1 | Versión reciente (5.1.5); hay que vigilar versiones de parche y la compatibilidad de Micronaut Data/Serialization. |
| Imagen base | `eclipse-temurin:25-jre-alpine` (amd64/arm64). La libwebp de `webp-imageio` 0.11.0 está enlazada contra glibc, pero solo pide símbolos que musl exporta: se comprobó codificando en la imagen Alpine en amd64 y, con `webp-arm64`, en arm64 (ejecución 41657262671). Un push normal publica solo amd64; arm64 sale con los tags `v*`. |
| Contadores de límite | Los límites de peticiones viven en memoria: válidos con una sola instancia del backend. |
| Observabilidad expuesta | `/health` y `/prometheus` no tienen autenticación; es seguro solo mientras nginx no los enrute. |

## Deuda técnica conocida

- El procesamiento incremental de anotaciones está desactivado para que el OpenAPI sea determinista; ralentiza la compilación.
- CI: un push solo de documentación
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
  - `/api/pokemon` ya no existe en Java (Fase 1 de minijuegos): el buscador usa `/api/pokemon/selector`, que solo
    envía `id`, `name` y sprite opaco; la divergencia de `paletteWeights` con Node desaparece.
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
  - Interruptor propio `BACKEND_DATA_SYNC_ENABLED` (no el `DATA_SYNC_ENABLED` de Node); el corte 2D lo puso a `true`
    en compose y Node dejó de sincronizar. `POKEAPI_BASE_URL` y `POKEAPI_SPRITE_BASE_URL` solo
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
  - Las marcas de tiempo del JDBC crudo (`JpaPokemonCatalogStore`, `JpaTcgCardRepository`) se enlazan como
    `LocalDateTime` en UTC: `Timestamp.from` las guardaba en la zona de la JVM (`hibernate.jdbc.time_zone` no se aplica
    a los `PreparedStatement` crudos). Los parámetros de Hibernate (`JpaDataSyncRecords`, `JpaUserGameConfigStore`) ya
    guardaban UTC; `UtcTimestampsTest` y `JpaUserGameConfigStoreTest` lo comprueban con la JVM en Europe/Madrid.
    Las filas escritas antes de la corrección con la JVM fuera de UTC conservan el desfase (solo marcas de auditoría).

- Catálogo TCG y sincronización con TCGdex en Java (2C, `application/tcg`, `application/datasync/tcg`):
  - `TCGDEX_BASE_URL` (`pu.data-sync.tcgdex-base-url`) solo existe para las pruebas y exige https (http solo hacia
    loopback), como PokéAPI.
  - `validImage` usa `java.net.URI` (esquema `https` sin distinguir mayúsculas y con host) en lugar del `new URL` de
    WHATWG: difieren en casos límite (`https:foo`, espacios sin escapar), que TCGdex no produce.
  - `loadComparableCards` ordena por id (Node no ordena: el orden del mazo no era determinista).
  - Una carta con un campo de tipo inesperado (`localId` numérico, `hp` decimal, fecha inválida) hace fallar la
    ejecución como el upsert de Prisma, pero con otro mensaje. Los precios de una carta se escriben en una sola
    transacción (Node hace un upsert por precio).
  - Las peticiones de un lote de 20 cartas son concurrentes (como `Promise.all`): su orden de llegada no es fijo.

- Deuda de 2C (aplazada en las revisiones):
  - Persistencia del data-sync con un puerto y SQL nativo (`JpaPokemonCatalogStore`, `JpaTcgCardRepository`, sin una
    entidad JPA por tabla Prisma): cada migración `V2__…` que toque esas tablas obliga a revisar esas sentencias.
  - `ImageIoReaders` retira el lector WebP nativo de `webp-imageio`; una llamada a `ImageIO.scanForPlugins()` lo
    volvería a registrar (no la hay en `src/main`).
  - Configuración: `ConfigMessagesSnapshotTest` no detecta entradas de motores que ya no existen y su propiedad de
    reescritura tiene un nombre genérico (`-Dupdate`); el generador de casos de migración vive en
    `src/test/resources`, sin lint y con ruta relativa.
  - Contenido: `HostContentProvider` depende de los almacenes con `DataSource` (un contexto de test sin BD no puede
    crear el coordinador); `updateHostWouldYouRatherPrompts` duplica el cuerpo de `updateHostCategories`; mezcla de
    `@Transactional` de jakarta y de Micronaut; la intersección con `additionalProperties` de `ZodIssue` debilita el
    tipado TS generado (las divergencias del body-parser están en «Diferencias de Java con Node»).
  - Avatares: cuerpos multipart o mal formados sobre `@Body byte[]` sin test; el cargador nativo prueba primero
    `/tmp`; `ClientAddress` confía en el último salto de `X-Forwarded-For` (correcto solo detrás de nginx; en la lista
    del corte 2D).
  - Data-sync: `stop()` puede invocarse hasta tres veces (idempotente); `PokeApiPayloads` usa valores por defecto
    donde Node lanzaría `TypeError` con una respuesta mal formada; `PokeApiUrls` deja pasar hosts ajenos a PokéAPI
    (como Node); `dexIds` descarta elementos no enteros (Prisma fallaría); las fechas sin zona se rechazan; matiz de
    salto de línea en la regex `IMAGE`; `loadComparableCards` hace dos consultas en READ COMMITTED (la misma ventana
    que Node).
  - Recarga tras el sync: `cache.replace` va antes de `rooms.replaceCatalog` (Node hace primero las salas; no es
    atómico si `rooms.get()` lanza); sin test del arranque con data-sync encendido y catálogo vacío (en la lista del
    corte 2D) ni del fallo de la recarga; el listener depende del `PokemonCatalogService` concreto.
  - Administración: la carrera de orden entre `remove` e inserción de `RoomStore` solo afecta al orden del listado
    admin; la sonda de normalización de rutas de `AdminGate` no tiene test (en la lista del corte 2D).
  - Tests: cuentas admin y una sala del test de resumen quedan en la BD y el contexto de test compartidos;
    `CatalogTables.clear` y `TcgTables` vacían con `CASCADE` tablas de las que dependen otras clases de la BD de test
    compartida y `NonUtcZone` cambia la zona por defecto de toda la JVM: hoy las clases corren en serie, pero si se
    activa el paralelismo de pruebas ambos pasan a ser de arreglo obligatorio (zona por prueba, datos aislados por
    clase); el generador de paridad puede dejar `pu_parity_pokeapi` en un
    `DATABASE_URL` que no sea el contenedor.

## Métricas de CI

Antes (medido, `docker.yml`): ≈ 8:15 por push. Después (medido, ejecución 41665973669 con las dos imágenes
reconstruidas): **3:16 de push a PRE**; desglose en `DEPLOY.md` («Tiempos del despliegue a PRE»). Los Main recientes
con cambios de backend tardan unos 5–6 min (Gradle check ≈ 3:40).
