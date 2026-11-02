# Etapa 2C · Datos y administración en Java · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el backend Java tenga todo lo que hoy solo hace Node fuera de las salas: sincronización de datos (PokéAPI y TCGdex), catálogo TCG y `/api/tcg/*`, API de administración, categorías y dilemas personales, avatares con escritura, configuraciones de juego por usuario y `/api/health`, conectado a las salas Java. Al terminar, lo único que queda para retirar Node es el corte 2D.

**Architecture:** Cada módulo Node se porta a la capa hexagonal que le corresponde (`domain` puro, `application` con puertos, `adapters/in/rest`, `adapters/out/persistence|http`). Mientras Node siga sirviendo salas en producción, las rutas nuevas solo se alcanzan en dev/E2E con `VITE_REALTIME=java` (proxy de Vite) y los procesos con efectos compartidos (scheduler de data-sync) arrancan apagados en Java; el corte 2D los enciende y mueve nginx.

**Tech Stack:** Java 25 · Micronaut 5.1.5 (HTTP, Data JPA, Serde, `java.net.http`) · ICU4J · TwelveMonkeys `imageio-webp` (lectura) + codificador WebP (ver Tarea 6) · JUnit 5 + Testcontainers · Vitest · Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md` (fila 2C de «Etapa 2: subproyectos»: «tests de integración con Testcontainers; paridad de respuestas con Node»). Especificación de comportamiento de cada módulo: `docs/migracion-java-inventario-node.md` (secciones 1–5, 7 y 9); ante una duda manda el código Node que cita. Pendientes que este plan cierra: `docs/migracion-java-pendientes.md` §«2C: lo que necesita».

## Global Constraints

Se mantienen las de las etapas 1, 2A y 2B (Java 25, Micronaut 5.1.x, sin dependencias no usadas, tablas Prisma entre comillas, errores `{error}` y `{error, issues}` para validación, comentarios Java en español, commits en español **sin líneas de atribución**, **sin `V2__` de Flyway**: el esquema sigue siendo de Prisma). Se añaden:

1. **Paridad HTTP con Node**: misma ruta, método, código, cuerpo JSON (claves y orden), cabeceras relevantes y literales de error que el router Node citado en cada tarea. Un 400 de validación es `{error: <primer mensaje>, issues: [...]}` como el manejador global de Node.
2. **Coexistencia hasta 2D**: `infra/nginx.conf` solo gana `location = /api/health` en esta etapa. Las demás rutas nuevas se añaden a `proxyFor('java')` en `apps/web/vite.config.ts` (dev/E2E con `VITE_REALTIME=java`), no al modo Node, porque Node mantiene cachés en memoria (categorías, dilemas, configuraciones, catálogo TCG) que quedarían obsoletas si Java escribiera en producción.
3. **Un solo dueño de los efectos compartidos**: `pu.data-sync.enabled: ${DATA_SYNC_ENABLED:false}` en Java. Con `false` no corre el scheduler, ni `ensureInitialPokemon`, ni el TCG inicial; las rutas admin de data-sync responden como Node con el servicio ausente (503 `{error:'La sincronización de datos no está disponible'}`).
4. **Paletas**: el data-sync las calcula con `POKEMON_PALETTE_VERSION=3`, `POKEMON_PALETTE_SIZE=8`, `MIN_PLAYABLE_POKEMON_PALETTES=100` y el algoritmo del inventario §1 «pokemon-palette-sync.ts»; el catálogo de salas las sigue leyendo como `catalog.ts` (`CatalogPalette`, sin cambios).
5. **Cliente HTTP de sincronización**: `attempts=4`, `baseDelayMs=500`, jitter 0..149 ms, `timeoutMs=30000`, `maxBytes=16 MiB`, `Retry-After` (segundos o fecha HTTP) con tope 60 s, reintento en error de red, timeout, 429 y 5xx; `User-Agent: PokemonUniverse-DataSync/1.0`; literales `${label} returned HTTP ${status}` y `La respuesta supera el límite permitido.`. Reloj y sueño inyectados (tests sin esperas reales).
6. **Red en tests**: ningún test toca PokéAPI ni TCGdex; se sirven respuestas grabadas desde un servidor HTTP embebido con fixtures JSON en `backend/src/test/resources/datasync/`.
7. **Normalización de contenido** (categorías y dilemas): NFD, quitar `\p{Diacritic}` (ICU `UProperty.DIACRITIC`), `toLowerCase(Locale.forLanguageTag("es"))`, sustituir rachas de no letra/número por un espacio, `JsStrings.trim`, colapsar espacios. `localeCompare('es', {sensitivity:'base'})` → `Collator` ICU `es` con fuerza PRIMARY.
8. **Avatares**: `MAX_AVATAR_UPLOAD_BYTES = 5 MiB`, lado 64..4096, salida 256×256 `cover` centrado, WebP calidad 84, nombre `<uuid>.webp`, escritura exclusiva (`CREATE_NEW`) con permisos 0600 en `pu.avatar-storage-dir`, literales del inventario §7. El limitador de avatares (12/15 min por IP, compartido por las cuatro rutas de escritura) **ignora** `RATE_LIMIT_DISABLED`, como en Node.
9. **Configuraciones por usuario**: `migrateStoredGameConfig` con hasta 24 intentos, debounce 250 ms por (usuario, juego), escrituras encadenadas por clave, `flush()` en el apagado; lectura solo en `create()` de sala para identidades USER.
10. **Admin**: `ADMIN_PAGE_SIZE = 20`; 401 `{error:'Registered account required'}` sin sesión o invitado; el rol se relee de la BD en cada petición y un no-ADMIN recibe 403 `{error:'Administrator access required'}`.
11. **Helpers de configuración** (deuda de 2B): antes de tocar cualquier `*Config`, las 28 copias de `integer`/`required`/`invalid`/`enumValue`/`strict`/generaciones se sustituyen por un lector común sin cambiar ningún mensaje (las fixtures doradas y `config-cases.json` lo garantizan).

## Review Focus

1. **Dos procesos sincronizando la misma BD** (Java con `DATA_SYNC_ENABLED=true` por error mientras Node también sincroniza): con `false` el arranque Java no programa nada ni llama a PokéAPI (test de arranque en la Tarea 8).
2. **PokéAPI devuelve 429 con `Retry-After` o se corta a mitad**: el cliente espera lo indicado (tope 60 s), reintenta y al cuarto fallo la ejecución queda `FAILED` con el mensaje, nunca `RUNNING` (Tareas 7 y 8).
3. **Imagen de avatar maliciosa** (bomba de descompresión, formato que no coincide con el `Content-Type`, 5 MiB + 1 byte): rechazo con el literal exacto sin decodificarla entera (Tarea 6).
4. **Edición concurrente de dilemas del mismo usuario** (dos `PATCH` que convergen en la misma pareja normalizada): uno gana y el otro recibe 409 `Ya tienes una pareja igual o equivalente.` (Tarea 4).
5. **Configuración guardada antigua o corrupta** (claves que ya no existen, tipos cambiados, JSON no objeto): `migrateStoredGameConfig` la repara o cae al valor por defecto sin lanzar (Tarea 5).

---

### Task 1: Lector común de configuración en `engine/infra`

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/game/engine/infra/ConfigReader.java`, test `ConfigReaderTest.java`
- Modify: las 28 clases `domain/game/engines/*/*Config.java` (y los `parse` de acciones que repitan los mismos helpers)

**Interfaces:**
- Produces: `final class ConfigReader` sobre `(JsonNode raw, ZodIssues issues)` con `int integer(String key, int min, int max)`, `long safeInteger(String key, long min, long max)`, `boolean bool(String key)`, `String text(String key, int minLen, int maxLen)`, `<E extends Enum<E>> E enumValue(String key, Class<E> type)`, `List<Integer> generations(String key)` (dedup + orden ascendente, 1..9) y `void strict(Set<String> allowed)`; cada fallo añade el mismo issue que hoy (mismo `code`, `path` y mensaje) y devuelve un centinela; el `*Config.parse` lanza `issues.toException()` al final como hoy. Usa `JsNumbers.isSafeInteger`. Si alguna variante de un motor no encaja, se deja su helper local y se anota por qué.

- [ ] **Step 1:** `ConfigReaderTest` con un caso por método: válido en el borde, inválido justo fuera, tipo erróneo, ausente, `10.0` aceptado, `10.5` rechazado, `2^53` rechazado, clave desconocida con `strict`; mensajes copiados de los `config-cases.json` existentes.
- [ ] **Step 2:** Ver fallar: `cd backend && ./gradlew test --tests '*ConfigReaderTest*'`.
- [ ] **Step 3:** Implementar `ConfigReader`.
- [ ] **Step 4:** Migrar los `*Config` en lotes; tras cada lote `./gradlew test --tests '*GoldenReplayTest*' --tests '*EngineTest*'` en verde (ningún mensaje ni orden de issues cambia).
- [ ] **Step 5:** `./gradlew check` y `npm test`; actualizar la deuda en `docs/migracion-java-pendientes.md` y el README de motores. Commit: `Lector común de configuración para los 28 motores`.

---

### Task 2: `/api/health` en Java

**Files:**
- Create: `adapters/in/rest/health/HealthController.java`, `HealthResponse.java`, test
- Modify: `infra/nginx.conf` (`location = /api/health` hacia el backend, como `/api/games`), `apps/web/vite.config.ts` (regla en todos los modos), `apps/web/vite.config.test.ts`, OpenAPI y `apps/web/src/lib/api-types.ts` regenerados

**Interfaces:**
- Produces: `GET /api/health` → 200 `{status:'ok', database:'ready', schemaVersion, uptimeSeconds, commit, timestamp}` en ese orden (`apps/server/src/http/routes.ts:29-41`): `schemaVersion` = último `migration_name` con `finished_at` de `_prisma_migrations` o `'unknown'`; `commit` = `pu.commit-sha` o `'development'`; `timestamp` ISO con milisegundos. Fallo de BD → 500 como el manejador global.

- [ ] **Step 1:** Test con Testcontainers: 200 con las seis claves en orden, `schemaVersion` igual a la última migración del esquema de test, `commit` `development`; con la consulta fallando (repositorio sustituido) → 500 `{error:'Internal server error'}`.
- [ ] **Step 2–4:** Ver fallar, implementar, ver pasar.
- [ ] **Step 5:** Vite, nginx, tipos; `./gradlew check`, `npm test`. Commit: `/api/health en Java`.

---

### Task 3: Categorías personalizadas y contenido del host

**Files:**
- Create: `domain/content/ContentNormalizer.java`; `application/categories/{CustomCategoryService,CustomCategoryView}.java`; `adapters/out/persistence/{CustomCategoryEntity,CustomCategoryRepository}.java`; `adapters/in/rest/categories/CustomCategoryController.java`; tests
- Modify: `config/RoomBeans.java` (`HostContentProvider` real), `RoomCoordinator.updateHostCategories(String userId)` (reemite `room:state` si ese usuario es host de su sala), `apps/web/vite.config.ts` (`^/api/categories` en `proxyFor('java')`)

**Interfaces:**
- Produces: `ContentNormalizer.normalize(String)` (constraint 7); `CustomCategoryService` con `load()`, `list(userId)`, `create(userId, JsonNode)`, `update(userId, id, JsonNode)`, `delete(userId, id)`, `enabled(userId) : List<SubjectiveCategory>`, `onChanged(Consumer<String>)`; caché de todos los usuarios cargada al arrancar (inventario §3).
- Rutas: `GET/POST /api/categories`, `PATCH/DELETE /api/categories/{id}` con los literales y códigos del inventario §3 «Categories». `HostContentProvider.customCategoriesForUser` delega en `enabled`.

- [ ] **Step 1:** `ContentNormalizerTest` con valores obtenidos una vez de `normalizeContent` de Node (`npx tsx -e`): `'  Ñandú—Pikachu!! '`, `'ÉLÉCTRICO  tipo'`, `'İstanbul'`.
- [ ] **Step 2:** Tests de servicio: crear recorta; duplicado equivalente (`'Pikachú'` vs `'pikachu'`) → 409 `Ya tienes una categoría igual o equivalente.`; 3 caracteres → 400 `Escribe al menos 4 caracteres.`; 161 → 400 `La categoría no puede superar 160 caracteres.`; `PATCH {}` → 400 `No hay cambios que guardar.`; id ajeno → 404 `Categoría no encontrada.`; `enabled` excluye desactivadas y conserva el orden; `onChanged` recibe el userId tras cada mutación.
- [ ] **Step 3:** Tests de controlador: invitado → 401; `POST` 201 `{category}` con `{id,text,enabled,createdAt,updatedAt}`; `DELETE` 204; clave desconocida → 400.
- [ ] **Step 4:** Test de coordinador: sala cuyo host es U, `onChanged(U)` emite `room:state` con `hostCustomCategoryCount` nuevo; si U no es host no se emite nada.
- [ ] **Step 5:** Implementar, ver pasar, `./gradlew check`. Commit: `Categorías personalizadas en Java conectadas a las salas`.

---

### Task 4: Dilemas personales de Would You Rather

**Files:**
- Create: `application/wouldyourather/{WouldYouRatherPromptService,WouldYouRatherPromptView}.java`; `adapters/out/persistence/{CustomWouldYouRatherPromptEntity,CustomWouldYouRatherPromptRepository}.java`; `adapters/in/rest/wouldyourather/WouldYouRatherPromptController.java`; tests
- Modify: `config/RoomBeans.java`, `RoomCoordinator.updateHostWouldYouRatherPrompts(String userId)`, `apps/web/vite.config.ts` (`^/api/would-you-rather-prompts` en `proxyFor('java')`)

**Interfaces:**
- Produces: servicio con `load`, `list`, `create`, `importPrompts(userId, JsonNode)`, `update`, `delete`, `enabled(userId) : List<WouldYouRatherPromptPair>`, `onChanged`; clave `sort([norm(A), norm(B)]).join('::')`; mutaciones serializadas por usuario (un fallo no bloquea la siguiente); `update` en transacción `SERIALIZABLE` con hasta 3 intentos ante `40001`, `23505` → 409 de duplicado (patrón de `JpaGameResultsPersister`).
- Rutas: `GET/POST /api/would-you-rather-prompts`, `POST /import`, `PATCH/DELETE /{id}` con los literales del inventario §3 «Would-You-Rather» (con `issues` completo y rutas `['prompts', i, 'optionB']`).

- [ ] **Step 1:** Tests de servicio: opciones iguales por comparación base (`'Pikachu'` / `'pikachú'`) → 400 `Las dos opciones deben ser diferentes.` con ruta `['optionB']`; pareja invertida duplicada → 409; import con 0 → `Incluye al menos un dilema.`, con 101 → `Puedes importar hasta 100 dilemas cada vez.`, duplicados internos → 409 `El JSON contiene dilemas duplicados o invertidos.`; todo o nada.
- [ ] **Step 2:** Test de concurrencia (Review Focus 4): dos `update` simultáneos que convergen → uno 200 y otro 409 `Ya tienes una pareja igual o equivalente.`, una sola fila con esa clave.
- [ ] **Step 3:** Tests de controlador y de coordinador (como la Tarea 3).
- [ ] **Step 4:** Implementar, ver pasar, `./gradlew check`. Commit: `Dilemas personales en Java conectados a las salas`.

---

### Task 5: Configuraciones de juego por usuario

**Files:**
- Create: `application/gameconfigs/{UserGameConfigService,StoredGameConfigMigration}.java`; `adapters/out/persistence/{UserGameConfigEntity,UserGameConfigRepository}.java`; tests
- Modify: `config/RoomBeans.java` (sustituye `UserGameConfigPreferences.NO_OP`), apagado ordenado que llama a `flush()`

**Interfaces:**
- Consumes: `GameRegistry` y `GameEngine.parseConfig/defaultConfig` (los motores son los validadores).
- Produces: `UserGameConfigService implements UserGameConfigPreferences` con `load()`, `forUser(userId)`, `save(userId, gameId, JsonNode)`, `flush()`; `StoredGameConfigMigration.migrate(GameEngine<?,?,?,?> engine, JsonNode stored) : JsonNode` con el algoritmo del inventario §4 (rutas de issue tomadas de `ConfigValidationException`).

- [ ] **Step 1:** `StoredGameConfigMigrationTest` con motores reales (`higher-lower`, `pokemon-bingo`): clave obsoleta eliminada, tipo erróneo sustituido por el defecto, array con un elemento inválido sustituido entero, JSON no objeto → defecto, configuración válida sin cambios; esperados obtenidos una vez de `migrateStoredGameConfig` de Node con `npx tsx -e` (Review Focus 5).
- [ ] **Step 2:** Test de servicio: tres `save` en 100 ms → una escritura (reloj y planificador inyectados); `flush()` persiste lo pendiente; juego desconocido ignorado; configuración inválida lanza.
- [ ] **Step 3:** Test de coordinador: un USER crea sala y recibe sus configuraciones; un invitado los defectos; `room:update-game-config` de un co-host guarda en sus propias preferencias.
- [ ] **Step 4:** Implementar, ver pasar, `./gradlew check`. Commit: `Configuraciones de juego por usuario en Java`.

---

### Task 6: Avatares con escritura

**Files:**
- Create: `application/avatar/{AvatarService,AvatarValidationException}.java`; procesador de imagen en `adapters/out/storage/AvatarImageProcessor.java`; rutas nuevas en `adapters/in/rest/auth/`; tests
- Modify: `adapters/out/storage/FilesystemAvatarStorage.java` (escritura exclusiva 0600), `adapters/in/rest/ratelimit/RateLimitPolicy.java` (política `avatars` que ignora `rate-limit-disabled`), `RoomCoordinator.updateIdentityAvatar(String userId, AvatarRef avatar)`, `backend/gradle/libs.versions.toml` y `build.gradle.kts`, `apps/web/vite.config.ts` (`^/api/auth/(guest/custom-avatar|profile/avatar)` en `proxyFor('java')`)

**Interfaces:**
- Rutas (inventario §7): `POST /api/auth/guest/custom-avatar?displayName=…` → 201 `{user}`; `PUT /api/auth/profile/avatar/preset` → 200 `{user}`; `DELETE /api/auth/profile/avatar` → 200 `{user}`; `PUT /api/auth/profile/avatar/custom` → 200 `{user}`; cuerpo binario hasta 5 MiB (413 `La imagen supera el límite de 5 MB.`; otro tipo → 415 `{error:'Usa una imagen JPEG, PNG o WEBP.'}`); cookie re-firmada; fichero anterior borrado en segundo plano; tras aplicar el avatar, `updateIdentityAvatar` reemite `room:state`.
- `AvatarService.processAndStore(byte[] body, String declaredContentType) : AvatarRef` con la constraint 8.

- [ ] **Step 1 (codificador WebP, antes del código):** lectura con `com.twelvemonkeys.imageio:imageio-webp` (Java puro); escritura con `com.github.usefulness:webp-imageio` (libwebp nativa empaquetada). Probar la escritura dentro de `eclipse-temurin:25-jre-alpine` con un programa de una clase; si la nativa no carga en musl, cambiar la base del backend a `eclipse-temurin:25-jre` (glibc) en `backend/Dockerfile` y anotarlo en `DEPLOY.md`. Registrar el resultado. Leer dimensiones con `ImageReader` antes de decodificar (Review Focus 3).
- [ ] **Step 2:** Tests de `AvatarService`: PNG 64×64 → WebP 256×256; 63×63 → `La imagen debe medir entre 64 y 4096 píxeles por lado.`; PNG declarado `image/jpeg` → `El archivo no es una imagen JPEG, PNG o WEBP válida.`; cabecera PNG de 20000×20000 → rechazo sin asignar el ráster; JPEG con orientación EXIF 6 → salida rotada (píxel de esquina); 5 MiB + 1 → `La imagen supera el límite de 5 MB.`.
- [ ] **Step 3:** Tests de controlador: cada ruta con su código y cuerpo; 415 con `text/plain`; invitado en rutas de perfil → 401; el decimotercer intento en 15 min → 429 aunque `RATE_LIMIT_DISABLED=true`; el fichero anterior desaparece; `avatarVersion` sube en 1.
- [ ] **Step 4:** Implementar, ver pasar, `./gradlew check`. Commit: `Avatares con escritura en Java`.

---

### Task 7: Núcleo de sincronización de datos

**Files:**
- Create: `application/datasync/{DataSyncService,DataSyncAdapter,SyncResult,DataSyncSource,DataSyncMode,DataSyncStatus,SyncOverviewItem,SyncAlreadyRunningException,DataSyncScheduler,NextScheduledSync}.java`; `adapters/out/http/SyncHttpClient.java`; `adapters/out/persistence/{DataSyncRunEntity,DataSyncRunRepository,DataSyncStateEntity,DataSyncStateRepository}.java`; tests
- Modify: `config/PuConfig.java` y `application.yml` (`pu.data-sync.enabled: ${DATA_SYNC_ENABLED:false}`, `hour: ${DATA_SYNC_HOUR:6}`, `minute: ${DATA_SYNC_MINUTE:0}`, `time-zone: ${DATA_SYNC_TIMEZONE:Europe/Madrid}`)

**Interfaces:**
- Produces: `interface DataSyncAdapter { DataSyncSource source(); SyncResult run(DataSyncMode mode); long recordsAvailable(); }`; `DataSyncService` con `recoverInterrupted()`, `start(source, mode)` (síncrono; `SyncAlreadyRunningException` 409 `<SRC> ya se está sincronizando`), `startAll(mode)` (asíncrono; `Ya hay una sincronización activa`; TCGDEX+INCREMENTAL → PRICE_REFRESH), `onCompleted(Consumer<DataSyncSource>) : Runnable`, `ensureInitialPokemon()`, `startInitialTcgInBackground()`, `overview() : List<SyncOverviewItem>`, `stop()`; `NextScheduledSync.after(Instant now, int hour, int minute, ZoneId zone) : Instant` (huecos de DST: la siguiente hora válida); `SyncHttpClient` con `json(URI, String label) : JsonNode` y `bytes(URI, String label) : byte[]` (constraint 5). Ejecución en hilos virtuales; registro de ejecuciones y estados como el inventario §1 «execute».

- [ ] **Step 1:** `SyncHttpClientTest` con servidor embebido: 503, 503, 200 → 3 llamadas y esperas `500+j`, `1000+j` (sueño inyectado); 429 con `Retry-After: 120` → espera 60 000; 404 → falla sin reintento con `Pokémon returned HTTP 404`; cuerpo de 17 MiB → `La respuesta supera el límite permitido.`; cuerpo que se cuelga → timeout y reintento (Review Focus 2).
- [ ] **Step 2:** `NextScheduledSyncTest`: 05:59 → hoy 06:00; 06:00 exacto → mañana; cambio de hora de primavera en `Europe/Madrid` con 02:30 → 03:00 del mismo día.
- [ ] **Step 3:** `DataSyncServiceTest` (Testcontainers + adaptadores falsos): ejecución completa RUNNING → COMPLETED con contadores y `durationMs`; fallo → FAILED con mensaje y `state.lastError`; `start` mientras corre → 409; `startAll` mientras corre otro → `Ya hay una sincronización activa`; `recoverInterrupted` con `Servidor reiniciado durante la sincronización`; `overview` [POKEAPI, TCGDEX] con el estado derivado; listeners en orden y sus errores tragados.
- [ ] **Step 4:** Implementar, ver pasar, `./gradlew check`. Commit: `Núcleo de sincronización de datos en Java`.

---

### Task 8: Sincronización de Pokémon (PokéAPI)

**Files:**
- Create: `application/datasync/pokemon/{PokemonCatalogSeeder,PokemonDataSync,PokemonRelationReconciler,PokemonPaletteSync,PaletteExtractor,LearnsetExtractor,PokedexEntryExtractor,AbilityNameExtractor,SeederLimits}.java`; entidades y repositorios JPA que falten (`PokemonGeneration`, `PokemonSpecies`, `PokemonPokedexNumber`, `PokemonStat`, `PokemonType`, `PokemonTypeAssignment`, `Ability`, `PokemonAbility`, `PokemonEvolution`, `PokemonCatalogSync`; escritura de `PokemonAssetReference`, `Move`, `PokemonLevelUpMove`, `PokedexEntry`); fixtures grabadas en `backend/src/test/resources/datasync/pokeapi/` (3 especies por defecto con una cadena evolutiva, 1 forma regional, sus habilidades y 4 movimientos)
- Modify: cableado del adaptador; arranque (`ensureInitialPokemon` solo con `pu.data-sync.enabled`)

**Interfaces:**
- Consumes: `SyncHttpClient`, `DataSyncAdapter`.
- Produces: `PokemonCatalogSeeder.sync(boolean force, SeederLimits limits)`, port de `apps/server/prisma/seed.ts` `syncPokemonData` con las fases y versiones `PokemonCatalogSync` (`canonical-level-up-learnsets` 1, `evolution-positions` 2, `pokeddle-species-metadata` 3, `spanish-pokedex-entries` 1); `SeederLimits` hace configurables los totales (1025 especies, 58 formas, 500 movimientos, 5000 learnsets, 500 entradas) para que los tests usen el subconjunto grabado; `PaletteExtractor.extract(byte[] png) : Palette(colors, weights)`; `PokemonDataSync implements DataSyncAdapter` con el `run(mode)` del inventario (incluido el atajo INCREMENTAL con su defecto conocido, portado igual y anotado en pendientes).

- [ ] **Step 1:** `PaletteExtractorTest`: PNG sintético con tres bloques de color → exactamente los colores, orden y pesos que da `extractPokemonPaletteData` de Node sobre el mismo PNG (ejecutado una vez con `npx tsx -e`); dos colores a distancia < 42 se funden; un solo color → `El sprite no contiene una paleta suficientemente variada.`.
- [ ] **Step 2:** Tests de extractores con entradas de las fixtures y salidas obtenidas una vez de las funciones Node correspondientes.
- [ ] **Step 3:** `PokemonCatalogSeederTest` (Testcontainers + servidor embebido): BD vacía → inserta especies, forma, nombres, tipos, estadísticas, `metadata` (gritos, artwork, shiny, `abilityRelations`), learnsets, evolución (`evolutionStage`/`evolutionStages` y aristas `chainId:fromId:toId`), especies normalizadas y entradas de Pokédex; segunda pasada sin `force` no hace peticiones; `force` repite con el mismo contenido. Comparar las filas con un JSON esperado generado una vez ejecutando el `seed.ts` de Node contra las mismas respuestas grabadas y commiteado.
- [ ] **Step 4:** `PokemonDataSyncTest`: INCREMENTAL con ≥ 100 paletas y recuento remoto ≤ local → `skipped` sin descargas; FULL → `processed`, `inserted`, `details.palettes`; sprite de host no confiable cuenta como `failed` sin abortar.
- [ ] **Step 5:** Test de arranque (Review Focus 1): con `pu.data-sync.enabled=false` el contexto arranca, el servidor embebido no recibe peticiones y no hay temporizador armado.
- [ ] **Step 6:** Implementar, ver pasar, `./gradlew check`. Commits por fase: `Sincronización de Pokémon en Java: …`.

---

### Task 9: Catálogo TCG, sincronización TCGdex y `/api/tcg/*`

**Files:**
- Create: `adapters/out/persistence/{TcgSetEntity,TcgCardEntity,TcgCardPokemonEntity,TcgCardPriceEntity,…Repository,JpaTcgCardRepository}.java`; `application/tcg/{CachedTcgCardCatalog,TcgPrices}.java`; `application/datasync/tcg/TcgDataSync.java`; `adapters/in/rest/tcg/TcgController.java`; fixtures `backend/src/test/resources/datasync/tcgdex/`; tests
- Modify: `RoomCoordinator` (pasar `tcgCards` real en el contexto), `apps/web/vite.config.ts` (`^/api/tcg/` en `proxyFor('java')`), OpenAPI y `api-types.ts`

**Interfaces:**
- Produces: `CachedTcgCardCatalog implements TcgCardCatalog` con `refresh()`, `cardsFor(Filters)` y `options()` según el inventario §5 (prioridad literal de carriles, `observedAt` más reciente, decimales canónicos sin flotantes, ≥ 2 cartas por carril o `[]`); `TcgDataSync implements DataSyncAdapter` (inventario §1 «TcgDataSync»); `GET /api/tcg/options` y `POST /api/tcg/eligibility` (cuerpo validado con `TcgHigherLowerConfig.parse`; 200 `{cardCount}`). `onCompleted(TCGDEX)` → `refresh()`.

- [ ] **Step 1:** `CachedTcgCardCatalogTest` con datos sembrados: filtro por generación (sin Pokémon vinculado → fuera), set y rareza; EUR cardmarket standard antes que USD tcgplayer normal; carril con una carta descartado; min/max inclusivos con `'1.10'` vs `'1.1'`; ningún carril válido → `[]`; `options()` con recuentos y orden ICU.
- [ ] **Step 2:** `TcgDataSyncTest` con TCGdex grabado: INITIAL inserta sets, cartas, vínculos y precios; PRICE_REFRESH no pide `/sets` y solo actualiza precios; carta sin `set.id` → `skipped`.
- [ ] **Step 3:** Tests de controlador: forma de `options`; `eligibility` con `maxPrice < minPrice` → 400 `El precio máximo debe ser igual o mayor que el mínimo.`.
- [ ] **Step 4:** Test de sala: con cartas sembradas, `tcg-higher-lower` arranca en una sala Java.
- [ ] **Step 5:** Implementar, ver pasar, `./gradlew check`, `npm test`. Commit: `Catálogo TCG y sincronización TCGdex en Java`.

---

### Task 10: Recarga del catálogo tras la sincronización

**Files:**
- Modify: `application/pokemon/PokemonCatalogService.java`, `RoomCoordinator.replaceCatalog(GameCatalogs)` (nueva `catalogVersion` aleatoria), cableado de `onCompleted(POKEAPI)`; tests

**Interfaces:**
- Consumes: `DataSyncService.onCompleted`, `CatalogSnapshotCache.invalidate()`, `FilesystemArtworkCatalog`, `JpaPokemonAudioCatalog`.
- Produces: al completar POKEAPI se recargan en paralelo catálogo y audio, luego visuales, y se llama a `replaceCatalog`; las partidas en curso conservan su catálogo (como Node).

- [ ] **Step 1:** Test: tras un `onCompleted(POKEAPI)` con un Pokémon nuevo en la BD, `/api/pokemon` lo devuelve, `RoomView.gameCatalogVersion` cambia y una partida ya iniciada conserva su pool.
- [ ] **Step 2:** Test: con ≥ 100 paletas sembradas por el data-sync, `pokemon-palette-guess` deja de declararse no disponible.
- [ ] **Step 3:** Implementar, ver pasar. Commit: `Recarga del catálogo de salas tras la sincronización de Pokémon`.

---

### Task 11: API de administración

**Files:**
- Create: `adapters/in/rest/admin/{AdminGate,AdminSummaryController,AdminRoomsController,AdminGamesController,AdminUsersController,AdminDataSyncController,AdminChangelogController,AdminFeedbackController,PaginatedResponse}.java`; servicios de aplicación correspondientes; tests
- Modify: `application/changelog/ChangelogService.java`, `application/feedback/FeedbackService.java` (operaciones admin), `apps/web/vite.config.ts` (`^/api/admin/` en `proxyFor('java')`), OpenAPI y `api-types.ts`

**Interfaces:**
- Rutas (inventario §2 y `apps/server/src/admin/routes.ts`, `apps/server/src/changelog/routes.ts`, `apps/server/src/feedback/routes.ts`): `GET /api/admin/summary`, `/active-rooms` (de `RoomCoordinator.adminRooms()`, búsqueda insensible a mayúsculas con locale `es`), `/rooms`, `/games`, `/users`, `GET /data-sync`, `POST /data-sync/{source}` (incluido el 202 que traga el conflicto en `all`, como Node) y los CRUD admin de novedades y la lista/estado de feedback. Paginación `{items, page, pageSize:20, total, totalPages}`.

- [ ] **Step 1:** Puerta: sin sesión → 401; invitado → 401; USER → 403; un USER ascendido a ADMIN en la BD pasa sin volver a iniciar sesión.
- [ ] **Step 2:** Un test por ruta con datos sembrados que fije forma y orden; `page=0` → 400 con `issues`; página fuera de rango → `items: []` con la página devuelta; `search` de 81 caracteres → 400; `POST /data-sync/pokemon {full:true}` sin `confirmFull` → 400 `El Full Sync requiere confirmación explícita`; con data-sync apagado → 503.
- [ ] **Step 3:** Implementar, ver pasar, `./gradlew check`, `npm test`. Commit: `API de administración en Java`.

---

### Task 12: Verificación en modo Java, documentación y cierre de 2C

**Files:**
- Create: `e2e/tests/contenido-y-admin.spec.ts` (un USER crea, edita y borra una categoría y un dilema, sube un avatar PNG y lo ve en la sala; un ADMIN abre el panel y ve la sala activa)
- Modify: `e2e/src/helpers.ts` si hace falta un ADMIN sembrado, `e2e/README.md`, `docs/architecture.md` (sección 2C), `docs/migracion-java-pendientes.md` (2C hecho; 2D actualizado: mover a nginx `/api/categories`, `/api/would-you-rather-prompts`, `/api/admin/`, `/api/tcg/`, `/api/auth/(guest/custom-avatar|profile/avatar)`, `/api/rooms/`; `DATA_SYNC_ENABLED=true` en Java), especificación (bloque Estado y fila 2C), `AGENTS.md`, `README.md`, `DEPLOY.md` (variables nuevas y base de imagen si cambió en la Tarea 6)

- [ ] **Step 1:** Escribir el spec y ejecutarlo en ambos modos: `npm run test:e2e:java -- contenido-y-admin` y `npm run test:e2e -- contenido-y-admin`.
- [ ] **Step 2:** `npm run test:e2e:java -- juegos`: con cartas y paletas en la BD local tras una sincronización manual (`DATA_SYNC_ENABLED=true` en el backend de desarrollo y `POST /api/admin/data-sync/all` con un ADMIN), `tcg-higher-lower` y `pokemon-palette-guess` dejan de saltarse; si la red no lo permite, se documenta el resultado.
- [ ] **Step 3:** Documentación listada arriba.
- [ ] **Step 4:** Verificación final con tiempos: `cd backend && ./gradlew check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e:java`, `npm run test:e2e`.
- [ ] **Step 5:** Commit: `Documentación de 2C: datos y administración en Java`.
