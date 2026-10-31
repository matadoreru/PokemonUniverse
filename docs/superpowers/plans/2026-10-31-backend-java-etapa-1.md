# Backend Java Etapa 1 (REST sin salas) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poner en producción un servicio Micronaut 5 (Java 25, Gradle) que asume los endpoints REST que no tocan el estado en memoria de las salas, conviviendo con el servidor Node detrás de nginx, con Docker, CI separada por rutas y tipos TS generados desde OpenAPI en el frontend.

**Architecture:** Estrangulamiento: nginx (y el proxy de Vite en dev) envían a Java `/api/auth/{register,login,guest,logout,me,profile}`, `/api/auth/avatars/*`, `/api/changelog`, `/api/feedback`, `/api/games` y `/api/pokemon`; todo lo demás sigue en Node. Los dos procesos firman y verifican la misma cookie `pu_session` (HS256, mismas claims) y comparten PostgreSQL y el volumen de avatares. Flyway solo hace baseline + validate mientras Node ejecute `prisma migrate deploy`. El backend sigue arquitectura hexagonal (`domain` / `application` / `adapters`).

**Tech Stack:** Java 25 · Micronaut 5.1.x (http-server-netty, serde-jackson, data-hibernate-jpa con Hibernate 7, flyway, validation, management, micrometer-prometheus, openapi, test-resources) · PostgreSQL 17 · Gradle 9.x Kotlin DSL · nimbus-jose-jwt · at.favre.lib:bcrypt · logstash-logback-encoder · Docker Buildx · GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md` (§0 etapa 1, §1.5, §2, §3.3, §3.4; la etapa 2 tendrá su propio plan).

## Global Constraints

- Java 25 (toolchain Gradle), Micronaut **5.1.x última patch** disponible al implementar (5.1.3 el 2026-08-31; comprobar en Maven Central antes de fijar), Gradle wrapper **≥ 9.1** (`./gradlew` siempre, nunca el Gradle del sistema).
- Ninguna dependencia que no se use en el código (restricción del encargo). Jackson 3 no entra: serialización con Micronaut Serialization (`@Serdeable`).
- PostgreSQL 17. Esquema propiedad de Prisma hasta la etapa 2: Flyway `baseline-on-migrate=true`, `baseline-version=1`, **ninguna `V2__`**. Hibernate: `hibernate.globally_quoted_identifiers=true`, `hibernate.globally_quoted_identifiers_skip_column_definitions=true`, `hibernate.physical_naming_strategy=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl`, `hibernate.jdbc.time_zone=UTC`, `hibernate.hbm2ddl.auto=none`.
- Nombres de tablas y columnas **exactamente** los de `apps/server/prisma/schema.prisma` (`"User"`, `"passwordHash"`, …). Ids en texto; los nuevos se generan con `UUID.randomUUID().toString()`.
- Cookie `pu_session`: HttpOnly, SameSite=Lax, Path=/, Max-Age 30 días, `Secure` = `COOKIE_SECURE`. JWT HS256 con el secreto en bytes UTF-8 de `JWT_SECRET` (≥ 32 caracteres); claims `sub, displayName, kind, avatar, email?, role?, iat, exp`; caducidad 7 d para `USER`, 30 d para `GUEST`.
- Errores JSON: `{ "error": "<mensaje>" }`; en validación además `"issues": [{ "path": "...", "message": "..." }]`, código 400. Mensajes en español donde Node los tiene en español (copiados literalmente en cada tarea).
- Variables de entorno con los mismos nombres que Node: `PORT`, `JWT_SECRET`, `WEB_ORIGIN`, `COOKIE_SECURE`, `RATE_LIMIT_DISABLED`, `AVATAR_STORAGE_DIR`, `PU_COMMIT_SHA`; nuevas para la BD: `JDBC_URL`, `DB_USER`, `DB_PASSWORD`; entorno activo con `MICRONAUT_ENVIRONMENTS`. Ningún secreto en código ni en imágenes.
- Hilos: controladores y servicios bloqueantes con `@ExecuteOn(TaskExecutors.BLOCKING)` (hilos virtuales).
- Commits pequeños, una línea en español, terminados con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Antes de cada commit: `./gradlew check` en verde (backend) y `npm run typecheck && npm run lint && npm test` cuando se toque el monorepo Node.
- Durante toda la etapa el servidor Node sigue funcionando sin cambios de comportamiento; cada tarea deja la aplicación completa operativa.

## Review Focus

1. **Token emitido por Node con `avatar` o `role` malformados**: Node los sustituye por `DEFAULT` / `USER` sin rechazar el token; Java debe hacer lo mismo (test en Tarea 4).
2. **`DATABASE_URL` de Compose con contraseña hexadecimal pero `JDBC_URL` mal compuesto**: el arranque debe fallar con un mensaje claro en lugar de un stack trace de Hikari a los 30 s (test de configuración en Tarea 3).
3. **Peticiones con `X-Forwarded-For` falsificado desde fuera del proxy**: el rate limit solo debe fiarse del primer salto como hace Node con `trust proxy 1` (test en Tarea 12).
4. **Nombre de fichero de avatar con `..` o sin `.webp`**: 404 sin tocar el disco (test en Tarea 6).
5. **Email con mayúsculas o espacios en login/registro**: Node normaliza con `trim().toLowerCase()`; Java debe aceptar `" Ana@Mail.com "` como `ana@mail.com` (test en Tarea 5).

---

### Task 1: Esqueleto del backend Micronaut con Gradle y health

**Files:**
- Create: `backend/settings.gradle.kts`, `backend/build.gradle.kts`, `backend/gradle.properties`, `backend/gradle/libs.versions.toml`, `backend/gradlew`, `backend/gradlew.bat`, `backend/gradle/wrapper/*`, `backend/.gitignore`
- Create: `backend/src/main/java/es/pokemonuniverse/Application.java`
- Create: `backend/src/main/resources/application.yml`, `application-dev.yml`, `application-test.yml`, `application-prod.yml`, `logback.xml`
- Test: `backend/src/test/java/es/pokemonuniverse/HealthEndpointTest.java`
- Modify: `.gitignore` (añadir `backend/build/`, `backend/.gradle/`)

**Interfaces:**
- Produces: aplicación en `:8080` con `GET /health` → `{"status":"UP"}`; `./gradlew check` ejecuta JUnit 5; `./gradlew run -t` arranca en caliente con el entorno `dev`.

- [ ] **Step 1: Fijar versiones.** Consultar Maven Central para la última `io.micronaut.platform:micronaut-platform` 5.1.x y la última `io.micronaut.application` en plugins.gradle.org; anotar ambas en `gradle/libs.versions.toml` (`micronaut`, `micronautPlugin`). Generar el wrapper con `gradle wrapper --gradle-version <última ≥ 9.1>` desde `backend/`.

- [ ] **Step 2: Escribir el test que falla.**

```java
@MicronautTest
class HealthEndpointTest {
  @Inject @Client("/") HttpClient client;
  @Test void healthIsUp() {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/health"), Map.class);
    assertEquals("UP", body.get("status"));
  }
}
```

- [ ] **Step 3: Ejecutar y ver fallar.** `cd backend && ./gradlew test --tests es.pokemonuniverse.HealthEndpointTest` → FAIL (no compila: no existe `Application`).

- [ ] **Step 4: Crear el build.** `build.gradle.kts` con plugins `io.micronaut.application` y `io.micronaut.test-resources`, `java { toolchain { languageVersion = JavaLanguageVersion.of(25) } }`, `micronaut { runtime("netty"); testRuntime("junit5"); processing { incremental(true); annotations("es.pokemonuniverse.*") } }`, dependencias: `micronaut-http-server-netty`, `micronaut-serde-jackson`, `micronaut-management`, `micronaut-http-client` (test), `logback-classic`. `gradle.properties`: `org.gradle.caching=true`, `org.gradle.configuration-cache=true`, `org.gradle.parallel=true`. `Application.main` con `Micronaut.run(Application.class, args)`. `application.yml`: `micronaut.application.name: pokemon-universe-backend`, `micronaut.server.port: ${PORT:8080}`, `endpoints.health.enabled: true`, `endpoints.health.sensitive: false`, `endpoints.health.details-visible: ANONYMOUS`. `logback.xml` con patrón de texto.

- [ ] **Step 5: Ver pasar.** `./gradlew test --tests es.pokemonuniverse.HealthEndpointTest` → PASS. `./gradlew run` arranca y `curl -s localhost:8080/health` devuelve `{"status":"UP"}`.

- [ ] **Step 6: Commit.** `git add backend .gitignore && git commit -m "Backend Java: esqueleto Micronaut con Gradle y health"`.

---

### Task 2: Flyway baseline del esquema Prisma y Hibernate configurado para ese esquema

**Files:**
- Create: `backend/src/main/resources/db/migration/V1__baseline.sql`
- Create: `scripts/export-schema-baseline.sh`
- Modify: `backend/build.gradle.kts`, `backend/src/main/resources/application.yml`, `application-dev.yml`, `application-test.yml`
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/out/persistence/SchemaBaselineTest.java`

**Interfaces:**
- Produces: `datasources.default` (HikariCP, driver PostgreSQL), Flyway activo con `baseline-on-migrate`, `jpa.default` con los `properties.hibernate.*` de Global Constraints. En `test`, Test Resources levanta PostgreSQL 17 y Flyway aplica `V1`. En `dev`, datasource fijo `jdbc:postgresql://localhost:5432/pokemon_universe` (`pokemon`/`pokemon`, el de `compose.local.yaml`) y Test Resources desactivado.

- [ ] **Step 1: Generar el baseline.** `scripts/export-schema-baseline.sh`: con la BD local migrada por Prisma, ejecuta `pg_dump --schema-only --no-owner --no-acl --exclude-table=_prisma_migrations` contra `DATABASE_URL` (o el contenedor de `compose.local.yaml`) y escribe `backend/src/main/resources/db/migration/V1__baseline.sql` quitando las líneas `SET`/`SELECT pg_catalog.set_config` y el comentario de versión. Ejecutarlo y revisar que el fichero contiene `CREATE TYPE "FeedbackReference"` y `CREATE TABLE "User"`.

- [ ] **Step 2: Test que falla.**

```java
@MicronautTest
class SchemaBaselineTest {
  @Inject DataSource dataSource;
  @Test void baselineCreatesPrismaTables() throws SQLException {
    try (var c = dataSource.getConnection(); var rs = c.createStatement().executeQuery(
      "select count(*) from information_schema.tables where table_schema='public' and table_name in ('User','Feedback','Changelog','Pokemon','UserGameStats')")) {
      rs.next(); assertEquals(5, rs.getInt(1));
    }
  }
  @Test void baselineRegistersFlywayVersionOne() throws SQLException { /* select version from flyway_schema_history where success → contiene "1" */ }
}
// JdbcUrlCheckTest: ApplicationContext.run con datasources.default.url="postgresql://pokemon:x@postgres:5432/db" → falla al arrancar con mensaje que contiene "JDBC_URL debe empezar por jdbc:postgresql://"
```

- [ ] **Step 3: Ver fallar.** `./gradlew test --tests '*SchemaBaselineTest'` → FAIL (no hay DataSource).

- [ ] **Step 4: Configurar.** Añadir `micronaut-data-hibernate-jpa`, `micronaut-data-processor` (annotationProcessor), `micronaut-jdbc-hikari`, `micronaut-flyway`, `org.postgresql:postgresql`, `flyway-database-postgresql`; `testResourcesService("org.postgresql:postgresql")`. `application.yml`: `datasources.default.url: ${JDBC_URL}`, `username: ${DB_USER}`, `password: ${DB_PASSWORD}`, `driver-class-name: org.postgresql.Driver`, `dialect: POSTGRES`; `flyway.datasources.default.enabled: true`, `baseline-on-migrate: true`, `baseline-version: 1`, `validate-on-migrate: true`; `jpa.default.properties.hibernate.*` según Global Constraints y `jpa.default.entity-scan.packages: es.pokemonuniverse.adapters.out.persistence`. `application-dev.yml`: url/usuario/contraseña locales y `test-resources.enabled: false`. `application-test.yml`: sin url (Test Resources la inyecta). `JdbcUrlCheck` (`@Context @Singleton`, en `adapters/out/persistence`): en `@PostConstruct` lee `datasources.default.url` y lanza `ConfigurationException("JDBC_URL debe empezar por jdbc:postgresql:// (recibido: <prefijo hasta ':'>)")` si no empieza por `jdbc:postgresql://`, para fallar en el arranque y no tras el timeout de Hikari.

- [ ] **Step 5: Ver pasar.** `./gradlew test --tests '*SchemaBaselineTest'` → PASS.

- [ ] **Step 6: Comprobar baseline sobre BD existente.** Con `compose.local.yaml` arriba y la BD ya migrada por Prisma: `./gradlew run` arranca sin error y `select version, description from flyway_schema_history` muestra una fila `1 | << Flyway Baseline >>`. Documentar el comando en el script.

- [ ] **Step 7: Commit.** `git commit -m "Backend Java: baseline Flyway del esquema Prisma y Hibernate con identificadores entrecomillados"`.

---

### Task 3: Configuración tipada `pu.*` y formato de errores de la API

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/config/PuConfig.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/ApiError.java`, `ApiException.java`, `ApiExceptionHandler.java`, `ValidationExceptionHandler.java`
- Modify: `application.yml`
- Test: `backend/src/test/java/es/pokemonuniverse/config/PuConfigTest.java`, `.../adapters/in/rest/ErrorFormatTest.java`

**Interfaces:**
- Produces: `PuConfig` (`@ConfigurationProperties("pu")`, `@Context`) con `record Auth(@NotBlank @Size(min=32) String secret, boolean cookieSecure)`, `@NotBlank String webOrigin`, `boolean rateLimitDisabled`, `@NotBlank String avatarStorageDir`, `String commitSha`, método `boolean rateLimitActive(Environment env)` = `!(rateLimitDisabled && !env.getActiveNames().contains("prod"))`.
- `ApiException(HttpStatus status, String message)` → cuerpo `ApiError(String error, @Nullable List<Issue> issues)`; `ConstraintViolationException` → 400 con `issues` (`path` = propiedad sin el prefijo del método, `message`); cualquier otra excepción → 500 `{"error":"Internal server error"}` en `prod`, mensaje real en otros entornos.

- [ ] **Step 1: Tests que fallan.**

```java
// PuConfigTest
@Test void rejectsShortSecret() {
  var ex = assertThrows(Exception.class, () -> ApplicationContext.run(Map.of("pu.auth.secret", "corto", "pu.web-origin", "http://x", "pu.avatar-storage-dir", "/tmp/a"), "test"));
  assertTrue(ex.getMessage().contains("pu.auth.secret"));
}
@Test void rateLimitDisabledIsIgnoredInProd() { /* rateLimitDisabled=true + env prod → rateLimitActive()==true */ }
// ErrorFormatTest: un @Controller de prueba en src/test lanza ApiException(409,"Email or username already in use")
@Test void apiExceptionBody() { /* status 409, body {"error":"Email or username already in use"} sin clave issues */ }
@Test void validationBody() { /* POST body inválido → 400, body.error == primer issue.message, issues[0].path=="username" */ }
```

- [ ] **Step 2: Ver fallar.** `./gradlew test --tests '*PuConfigTest' --tests '*ErrorFormatTest'` → FAIL.

- [ ] **Step 3: Implementar.** `PuConfig` con `@ConfigurationProperties("pu") @Context` y Bean Validation (`micronaut-validation` + `micronaut-validation-processor`). `application.yml`: `pu.auth.secret: ${JWT_SECRET}`, `pu.auth.cookie-secure: ${COOKIE_SECURE:false}`, `pu.web-origin: ${WEB_ORIGIN:http://localhost:5173}`, `pu.rate-limit-disabled: ${RATE_LIMIT_DISABLED:false}`, `pu.avatar-storage-dir: ${AVATAR_STORAGE_DIR:.data/avatars}`, `pu.commit-sha: ${PU_COMMIT_SHA:}`. `application-test.yml` fija un secreto de 32+ caracteres. Handlers con `@Produces @Singleton @Requires(classes = …)` implementando `ExceptionHandler<X, HttpResponse<ApiError>>`.

- [ ] **Step 4: Ver pasar.** Mismo comando → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: configuración validada y formato de errores de la API"`.

---

### Task 4: Identidad compartida con Node: JWT HS256 en cookie `pu_session`

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/identity/AuthUser.java`, `AvatarRef.java`, `UserRole.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/auth/IdentityTokens.java`, `InvalidTokenException.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/identity/IdentityFilter.java`, `Identity.java` (anotación), `IdentityArgumentBinder.java`, `SessionCookies.java`
- Create: `backend/src/test/resources/fixtures/node-session-token.txt`, `scripts/export-node-session-fixture.mjs`
- Test: `.../application/auth/IdentityTokensTest.java`, `.../adapters/in/rest/identity/IdentityFilterTest.java`

**Interfaces:**
- `record AuthUser(String id, String displayName, Kind kind, @Nullable String email, @Nullable UserRole role, AvatarRef avatar)` con `enum Kind { USER, GUEST }`; serializada con `@Serdeable` omitiendo `email`/`role` nulos (`@JsonInclude(NON_NULL)` de Serde).
- `AvatarRef` sealed: `Default()`, `Preset(String value)`, `Custom(String value, long version)`; JSON `{"type":"DEFAULT"}`, `{"type":"PRESET","value":"trainer-aqua"}`, `{"type":"CUSTOM","value":"<uuid>.webp","version":123}`. Presets válidos: `trainer-berry, trainer-aqua, trainer-electric, trainer-violet`; custom válido: regex `^[0-9a-f-]{36}\.webp$`.
- `IdentityTokens.sign(AuthUser, Instant now) : String`; `verify(String) : AuthUser` (lanza `InvalidTokenException` si firma/exp/`sub`/`displayName`/`kind` inválidos; `avatar` inválido → `Default()`, `role` inválido o ausente con kind USER → `USER`, kind GUEST → role null).
- `IdentityFilter` (`@ServerFilter("/**")`): lee la cookie `pu_session`; si verifica, `request.setAttribute("pu.identity", authUser)`; si no, nada (igual que `optionalAuth`).
- `@Identity` sobre parámetro `Optional<AuthUser>` o `AuthUser`; `SessionCookies.establish(MutableHttpResponse<?>, String token)` y `clear(...)` con los atributos de Global Constraints.

- [ ] **Step 1: Fixture desde Node.** `scripts/export-node-session-fixture.mjs`: con `jose` firma, con el secreto `test-secret-test-secret-test-secret-1234` y `exp` = 2099-01-01, la identidad `{ sub: "user_fixture", displayName: "Ana", kind: "USER", role: "ADMIN", email: "ana@example.com", avatar: { type: "PRESET", value: "trainer-aqua" } }` y escribe `backend/src/test/resources/fixtures/node-session-token.txt`. Ejecutarlo una vez y commitear el fichero.

- [ ] **Step 2: Tests que fallan.**

```java
@Test void verifiesTokenIssuedByNode() { var user = tokens.verify(fixture()); assertEquals("user_fixture", user.id()); assertEquals(UserRole.ADMIN, user.role()); assertEquals(new AvatarRef.Preset("trainer-aqua"), user.avatar()); }
@Test void roundTripGuestHasThirtyDayExpiry() { /* sign guest → parse con Nimbus → exp-iat == 30 días; user → 7 días; claims presentes: sub, displayName, kind, avatar */ }
@Test void invalidAvatarFallsBackToDefault() { /* token firmado con avatar {"type":"PRESET","value":"nope"} → avatar == Default(), no excepción */ }
@Test void tamperedSignatureIsRejected() { assertThrows(InvalidTokenException.class, () -> tokens.verify(fixture() + "x")); }
// IdentityFilterTest: controlador de prueba devuelve la identidad; con cookie válida → 200 con id; sin cookie → identidad vacía; cookie corrupta → identidad vacía (no 401).
```

- [ ] **Step 3: Ver fallar.** `./gradlew test --tests '*IdentityTokensTest' --tests '*IdentityFilterTest'` → FAIL.

- [ ] **Step 4: Implementar** con `com.nimbusds:nimbus-jose-jwt` (`MACSigner`/`MACVerifier` sobre `secret.getBytes(UTF_8)`, `JWSAlgorithm.HS256`). `IdentityArgumentBinder implements AnnotatedRequestArgumentBinder<Identity, Object>`.

- [ ] **Step 5: Ver pasar.** → PASS.

- [ ] **Step 6: Commit.** `git commit -m "Backend Java: identidad JWT compatible con la cookie pu_session de Node"`.

---

### Task 5: Cuentas: registro, login, invitado, logout y `/me`

**Files:**
- Create: `.../adapters/out/persistence/UserEntity.java`, `UserStatsEntity.java`, `UserRepository.java`
- Create: `.../application/auth/AuthService.java`, `RegisterCommand.java`, `LoginCommand.java`, `GuestCommand.java`, `PasswordHasher.java`
- Create: `.../adapters/in/rest/auth/AuthController.java`, `RegisterRequest.java`, `LoginRequest.java`, `GuestRequest.java`, `UserResponse.java`
- Test: `.../adapters/in/rest/auth/AuthControllerTest.java`, `.../application/auth/PasswordHasherTest.java`

**Interfaces:**
- `UserEntity` → tabla `"User"`: `id, username, email, passwordHash, avatarSeed, avatarType, avatarValue, avatarVersion, role (NAMED_ENUM "UserRole"), createdAt, updatedAt` (`Instant`); `UserStatsEntity` → `"UserStats"` (`userId` PK, `gamesPlayed, gamesWon, totalPoints`). `UserRepository extends CrudRepository<UserEntity,String>`: `Optional<UserEntity> findByEmail(String)`, `boolean existsByEmailOrUsername(String, String)`.
- `AuthService.register(RegisterCommand) : AuthUser` (409 `Email or username already in use`), `login(LoginCommand) : AuthUser` (401 `Invalid email or password`), `guest(GuestCommand) : AuthUser` (id `guest_` + UUID, avatar Preset o Default). `PasswordHasher.hash(String)` (bcrypt coste 12, prefijo `$2b$`) y `matches(String raw, String hash)`.
- Rutas: `POST /api/auth/register` 201 `{user}` + cookie; `POST /api/auth/login` 200; `POST /api/auth/guest` 201; `POST /api/auth/logout` 204 + `Set-Cookie` expirada; `GET /api/auth/me` 200 `{user: AuthUser|null}`.
- Validación (mismos límites que Zod): username `trim`, 3–24, `^[a-zA-Z0-9_]+$`; email `trim().toLowerCase()`, formato email, ≤ 254; password 10–128 (login: 1–128); displayName `trim`, 2–24, `^[\p{L}\p{N}_ -]+$`; `avatarPresetId` opcional entre los 4 presets.

- [ ] **Step 1: Tests que fallan.**

```java
@Test void registerSetsCookieAndReturnsIdentity() { /* POST register {username:"ana_01",email:" Ana@Mail.com ",password:"0123456789"} → 201, body.user.email=="ana@mail.com", kind USER, role USER, avatar DEFAULT; Set-Cookie contiene pu_session, HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000 */ }
@Test void duplicateEmailIs409() { /* segundo registro mismo email → 409 {"error":"Email or username already in use"} */ }
@Test void shortPasswordIs400WithIssuePath() { /* password "corta" → 400, issues[0].path=="password" */ }
@Test void loginWrongPasswordIs401() { /* → 401 {"error":"Invalid email or password"} */ }
@Test void loginNormalizesEmail() { /* registra "ana@mail.com"; login con " ANA@mail.com " → 200 */ }
@Test void guestIdentity() { /* POST guest {displayName:"Ana 2",avatarPresetId:"trainer-berry"} → 201, id startsWith "guest_", avatar PRESET */ }
@Test void meWithoutCookieIsNullUser() { /* GET me → 200 {"user":null} */ }
@Test void meWithCookieReturnsIdentity() { /* registra, reenvía cookie → user.id igual */ }
@Test void logoutClearsCookie() { /* 204 y Set-Cookie con Max-Age=0 */ }
@Test void verifiesBcryptJsHash() { /* hash producido por bcryptjs 3 ("$2b$12$...") de "0123456789" → matches true */ }
```

- [ ] **Step 2: Ver fallar.** `./gradlew test --tests '*AuthControllerTest' --tests '*PasswordHasherTest'` → FAIL.

- [ ] **Step 3: Implementar.** Dependencia `at.favre.lib:bcrypt`. `UserRole` como enum JPA con `@JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(columnDefinition = "\"UserRole\"")`. Registro en `@Transactional`: crea `User` + `UserStats` vacío (como Prisma `stats: { create: {} }`). Normalización de email/username en los `record` de request (métodos `normalized()`), validación con anotaciones Bean Validation; mensajes de issue en español libre salvo los literales indicados.

- [ ] **Step 4: Ver pasar.** → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: registro, login, invitado, logout y sesión actual"`.

---

### Task 6: Avatares: lectura desde el volumen compartido y limpieza del avatar de invitado

**Files:**
- Create: `.../application/ports/AvatarStorage.java`, `.../adapters/out/storage/FilesystemAvatarStorage.java`
- Modify: `AuthController.java`, `AuthService.java`
- Test: `.../adapters/out/storage/FilesystemAvatarStorageTest.java`, añadir casos a `AuthControllerTest`

**Interfaces:**
- `AvatarStorage { Optional<byte[]> read(String filename); void remove(String filename); }` — `filename` debe cumplir `^[0-9a-f-]{36}\.webp$`, si no lanza `IllegalArgumentException` sin tocar disco.
- `GET /api/auth/avatars/{filename}` → 200 `image/webp` con `Cache-Control: public, max-age=31536000, immutable`, o 404 vacío (también para nombres inválidos).
- `POST /api/auth/guest` y `POST /api/auth/logout`: si la identidad entrante es `GUEST` con avatar `Custom`, se borra ese fichero (en `guest`, salvo que sea el mismo que el nuevo).

- [ ] **Step 1: Tests que fallan.** `readsExistingWebp` (directorio temporal con fichero → bytes), `missingIsEmpty`, `rejectsTraversalName("../x.webp")` → `IllegalArgumentException`; en `AuthControllerTest`: `avatarRouteServesWebp`, `avatarRouteInvalidNameIs404`, `logoutRemovesGuestCustomAvatar` (crea fichero, cookie de invitado con avatar Custom, logout → fichero desaparece).

- [ ] **Step 2: Ver fallar.** `./gradlew test --tests '*Avatar*' --tests '*AuthControllerTest'` → FAIL.

- [ ] **Step 3: Implementar** con `java.nio.file.Files`; directorio desde `PuConfig.avatarStorageDir()`.

- [ ] **Step 4: Ver pasar.** → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: lectura de avatares y limpieza del avatar de invitado"`.

---

### Task 7: Registro de minijuegos exportado desde TypeScript y `GET /api/games`

**Files:**
- Create: `scripts/export-game-registry.mjs`
- Create: `backend/src/main/resources/games/registry.json`
- Create: `.../domain/game/GameManifest.java`, `GameRegistry.java`; `.../adapters/in/rest/games/GamesController.java`
- Modify: `package.json` (scripts `registry:export`, `check:registry`), `.github` (en Tarea 17)
- Test: `.../domain/game/GameRegistryTest.java`, `.../adapters/in/rest/games/GamesControllerTest.java`

**Interfaces:**
- `scripts/export-game-registry.mjs`: importa `../packages/shared/dist/index.js`, escribe `[{ ...manifest, defaultConfig }]` en el orden de `gameRegistry.list()` con `JSON.stringify(..., null, 2) + '\n'`. `npm run registry:export` lo ejecuta; `npm run check:registry` falla si el resultado difiere del fichero commiteado (mensaje: `Ejecuta npm run registry:export`).
- `record GameManifest(String id, String name, String icon, String description, @Nullable Boolean experimental, @Nullable Boolean recommended, int minPlayers, @Nullable Integer maxPlayers, ProfileStatsDefinition profileStats, Map<String,Object> defaultConfig)`; `ProfileStatsDefinition(List<MetricDefinition> metrics, @Nullable List<DerivedMetricDefinition> derivedMetrics)` con los campos de `contracts.ts`.
- `GameRegistry` (`@Singleton`): `List<GameManifest> list()` (orden del fichero), `Optional<GameManifest> get(String id)`, `List<GameManifest> manifests()` = ordenados por `recommended` desc (estable), igual que `GameRegistry.manifests()` TS.
- `GET /api/games` → `{ games: [ manifest + defaultConfig ] }`, mismo orden y claves que Node (`defaultConfig` al final no importa: comparar como JSON).

- [ ] **Step 1: Script y fichero.** Escribir el script, `npm run build -w @pokemon-universe/shared && npm run registry:export`; comprobar que `registry.json` tiene 28 entradas.

- [ ] **Step 2: Tests que fallan.** `GameRegistryTest.loadsTwentyEightGames`, `manifestsPutRecommendedFirst`, `getUnknownIsEmpty`; `GamesControllerTest.listsGamesWithDefaultConfig` (200, `games.length == 28`, primera entrada tiene `defaultConfig` y `profileStats.metrics`).

- [ ] **Step 3: Ver fallar.** → FAIL.

- [ ] **Step 4: Implementar.** Cargar el recurso con `ObjectMapper` de Serde en `@PostConstruct`.

- [ ] **Step 5: Paridad con Node.** Con Node en `:3001` y Java en `:8080`: `diff <(curl -s :3001/api/games | jq -S .) <(curl -s :8080/api/games | jq -S .)` → sin diferencias. Añadir `check:registry` al script `test` raíz de `package.json` (`npm run check:boundaries && npm run check:registry && …`).

- [ ] **Step 6: Ver pasar y commit.** `./gradlew check` y `npm test` en verde. `git commit -m "Backend Java: registro de minijuegos exportado desde shared y GET /api/games"`.

---

### Task 8: Perfil del usuario registrado `GET /api/auth/profile`

**Files:**
- Create: `.../adapters/out/persistence/UserGameStatsEntity.java`, `UserGameStatsRepository.java`
- Create: `.../application/profile/ProfileService.java`, `.../adapters/in/rest/auth/ProfileResponse.java`
- Modify: `AuthController.java`, `UserRepository.java`
- Test: `.../adapters/in/rest/auth/ProfileControllerTest.java`

**Interfaces:**
- `UserGameStatsEntity` → `"UserGameStats"` (`id, userId, gameId, gamesPlayed, gamesWon, points, metrics jsonb` como `Map<String,Object>` con `@JdbcTypeCode(SqlTypes.JSON)`); `UserGameStatsRepository.findByUserId(String)`.
- `GET /api/auth/profile`: requiere kind USER (401 `Registered account required`); 200 `{ profile: { user: {id, username, email, avatar, createdAt ISO}, globalStats: {gamesPlayed, gamesWon, totalPoints}, games: [ manifest + stats: {gameId, gamesPlayed, gamesWon, points, metrics<String,Number>} ] } }` recorriendo `GameRegistry.manifests()` (todas, con ceros si no hay fila). `avatar` se reconstruye desde `avatarType/avatarValue/avatarVersion` con las mismas reglas que `avatarFromUser` (PRESET válido, CUSTOM con regex, si no DEFAULT).

- [ ] **Step 1: Tests que fallan.** `profileRequiresUser` (invitado → 401 con el literal), `profileListsAllGamesWithZeros` (28 juegos, `stats.gamesPlayed==0`), `profileMergesStoredStats` (inserta fila `UserGameStats` con `metrics {"correct": 3, "text": "x"}` → en la respuesta solo `correct`), `customAvatarIsExposedWithVersion`.

- [ ] **Step 2: Ver fallar.** → FAIL.

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Ver pasar.** → PASS. Paridad manual: `diff` de `/api/auth/profile` entre Node y Java con la misma cookie de un usuario registrado en la BD local.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: perfil del usuario con estadísticas por minijuego"`.

---

### Task 9: Changelog público `GET /api/changelog`

**Files:**
- Create: `.../adapters/out/persistence/ChangelogEntity.java`, `ChangelogRepository.java`
- Create: `.../application/changelog/ChangelogService.java`, `.../adapters/in/rest/changelog/ChangelogController.java`, `ChangelogEntryResponse.java`
- Test: `.../adapters/in/rest/changelog/ChangelogControllerTest.java`

**Interfaces:**
- `ChangelogEntity` → `"Changelog"` (`id, version, title, date, published, content jsonb, createdAt, updatedAt`). `ChangelogRepository.findByPublishedTrueOrderByDateDescCreatedAtDesc()`.
- `GET /api/changelog` → 200 `{ entries: [{ id, version, title, date ISO, published, content: [{type, text}], createdAt, updatedAt }] }`, header `Cache-Control: public, max-age=0, must-revalidate`. `content` se valida al leer: cada elemento con `type` ∈ `NEW, MINIGAMES, BALANCE, INTERFACE, IMPROVEMENTS, BUGS, TECHNICAL` y `text` 3–500; una fila inválida produce 500 (igual que `changelogContentSchema.parse`).

- [ ] **Step 1: Tests que fallan.** `listsOnlyPublishedNewestFirst` (3 filas: 2 publicadas con fechas distintas, 1 borrador → 2 entradas, la más reciente primero), `setsCacheControlHeader`, `emptyIsEmptyArray`.

- [ ] **Step 2: Ver fallar.** → FAIL.

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Ver pasar.** → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: changelog público"`.

---

### Task 10: Envío de feedback `POST /api/feedback`

**Files:**
- Create: `.../adapters/out/persistence/FeedbackEntity.java`, `FeedbackRepository.java`, `FeedbackType.java`, `FeedbackStatus.java`, `FeedbackReference.java`
- Create: `.../application/feedback/FeedbackService.java`, `SubmitFeedbackCommand.java`; `.../adapters/in/rest/feedback/FeedbackController.java`, `CreateFeedbackRequest.java`, `FeedbackItemResponse.java`
- Test: `.../adapters/in/rest/feedback/FeedbackControllerTest.java`

**Interfaces:**
- `FeedbackEntity` → `"Feedback"` con los tres enums como `NAMED_ENUM` (`"FeedbackType"`, `"FeedbackStatus"`, `"FeedbackReference"`), `gameId`, `roomCode`, `description`, `authorUserId`, `authorDisplayName`, `authorKind`, `createdAt`, `updatedAt`.
- `POST /api/feedback` requiere identidad (USER o GUEST; sin cookie → 401 `Authentication required`). Body estricto `{ reference?, gameId?, roomCode?, type, description }`: `description` trim 10–2000 (mensajes `Describe el feedback con al menos 10 caracteres.` / `El feedback no puede superar los 2.000 caracteres.`), `roomCode` trim upper `^[A-Z2-9]{6}$` (`El código de sala no es válido.`), `gameId` 1–64 (`Selecciona un minijuego.`); `reference` por defecto `MINIGAME` si hay `gameId`, si no `GENERAL`; `MINIGAME` sin `gameId` → issue en `gameId` `Selecciona un minijuego.`; `gameId` con referencia ≠ `MINIGAME` → issue `El minijuego solo se incluye cuando el feedback hace referencia a uno.`; `gameId` desconocido en `GameRegistry` → 400 `El minijuego seleccionado no existe.`. Claves desconocidas → 400.
- Respuesta 201 `{ feedback: { id, reference, gameId, gameName (nombre del manifest o null), roomCode, type, status: "NEW", description, author: { userId|null, displayName, kind }, createdAt, updatedAt } }`.
- Rate limit 10 peticiones / 15 min por IP (filtro de Tarea 12; aquí solo se anota la ruta).

- [ ] **Step 1: Tests que fallan.** `anonymousIs401`, `guestCanSubmitGeneral` (author.userId null, reference GENERAL), `userSubmitMinigameInfersReference`, `unknownGameIs400WithLiteral`, `gameIdWithoutMinigameReferenceIs400`, `unknownKeyIs400`, `roomCodeIsUppercased`.

- [ ] **Step 2: Ver fallar.** → FAIL.

- [ ] **Step 3: Implementar.** Las reglas cruzadas se implementan en `CreateFeedbackRequest.validate()` que devuelve `List<Issue>` y el controlador lanza la excepción de validación de la Tarea 3 si no está vacía.

- [ ] **Step 4: Ver pasar.** → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: envío de feedback"`.

---

### Task 11: Catálogo Pokémon público `GET /api/pokemon`

**Files:**
- Create: `.../adapters/out/persistence/PokemonEntity.java`, `PokemonRepository.java`
- Create: `.../domain/pokemon/Pokemon.java`, `RegionalForms.java`; `.../application/pokemon/PokemonCatalogService.java`, `PokemonSearchQuery.java`; `.../adapters/in/rest/pokemon/PokemonController.java`
- Test: `.../domain/pokemon/RegionalFormsTest.java`, `.../adapters/in/rest/pokemon/PokemonControllerTest.java`

**Interfaces:**
- `PokemonEntity` → `"Pokemon"`: columnas de `schema.prisma` que usa `loadPokemonCatalog` (`id, nationalDexNumber, name, generation, isDefault, sprite, hp, attack, defense, specialAttack, specialDefense, speed, baseStatTotal, heightDecimeters, weightHectograms, legendaryStatus, color, abilities text[] (String[] con @JdbcTypeCode(SqlTypes.ARRAY)), names jsonb, types text[], evolutionStage, evolutionStages, metadata jsonb, updatedAt`).
- `record Pokemon(...)` con **exactamente** las claves JSON de `Pokemon` en `packages/shared/src/pokemon/types.ts` salvo `palette`/`paletteWeights` (se omiten), opcionales ausentes cuando son null (`shinySprite`, `evolutionStage`, `evolutionStageCount`, `names`).
- `RegionalForms.isSupported(String id)`: traducción literal de `isSupportedRegionalFormId`.
- `PokemonCatalogService.search(PokemonSearchQuery(List<Integer> generations, boolean includeForms))`: carga todas las filas ordenadas por `nationalDexNumber asc, isDefault desc, name asc, updatedAt desc, id asc`, aplica el filtro de `InMemoryPokemonCatalog` (formas no soportadas fuera; un solo default por número), filtra por generaciones (vacío = todas) y `includeForms`, ordena como `CatalogPokemonRepository.search`. Caché en memoria de la lista base durante 1 h (`@Singleton` con `AtomicReference` + `Instant`).
- `GET /api/pokemon?generations=1,2&includeForms=true` → `{ pokemon: [...] }`, `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`. `generations` admite solo enteros 1–9; valores inválidos se ignoran.

- [ ] **Step 1: Tests que fallan.** `RegionalFormsTest` con los casos `raichu-alola` ✓, `tauros-paldea-blaze-breed` ✓, `darmanitan-galar-standard` ✓, `pikachu-totem-x` ✗, `charizard-mega-x` ✗. `PokemonControllerTest`: inserta 4 filas (bulbasaur gen1 default, ivysaur gen1, `raichu-alola` gen7 no default, `pikachu-cosplay` no default) → `listsDefaultsOnly` (3 ids, sin cosplay ni alola), `includeFormsAddsSupportedForms` (4 → incluye alola, no cosplay), `filtersByGenerations("1")`, `omitsPaletteAndKeepsKeys` (claves `palette` ausentes; `heightDecimeters` presente), `setsCacheHeader`.

- [ ] **Step 2: Ver fallar.** → FAIL.

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Ver pasar.** → PASS. Paridad: `diff <(curl -s ':3001/api/pokemon?generations=1' | jq -S .) <(curl -s ':8080/api/pokemon?generations=1' | jq -S .)` sin diferencias con la BD local sembrada.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: catálogo Pokémon público con caché de una hora"`.

---

### Task 12: Rate limiting, CORS en dev y cabeceras de proxy

**Files:**
- Create: `.../adapters/in/rest/ratelimit/RateLimitFilter.java`, `RateLimitPolicy.java`, `FixedWindowCounter.java`, `ClientAddress.java`
- Modify: `application.yml`, `application-dev.yml`
- Test: `.../adapters/in/rest/ratelimit/RateLimitFilterTest.java`, `ClientAddressTest.java`

**Interfaces:**
- `ClientAddress.of(HttpRequest<?>)`: si hay `X-Forwarded-For`, el **último** valor añadido por el proxy inmediato (equivalente a `trust proxy 1`: la IP que puso nginx, es decir, el último elemento de la lista); si no, la IP remota.
- `RateLimitPolicy(String name, Predicate<String> pathMatcher, int limit, Duration window)`; políticas: `global` (`/api/**`, 120 / 60 s), `auth` (`/api/auth/**` salvo `/api/auth/avatars/**`, 30 / 15 min), `feedback` (`POST /api/feedback`, 10 / 15 min). Respuesta al exceder: 429 `{"error":"Too many requests"}` con `RateLimit-*` (draft-7: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`). Desactivado cuando `PuConfig.rateLimitActive(env)` es falso.
- `micronaut.server.cors.enabled: true` solo en `dev` con `configurations.web.allowed-origins: [${WEB_ORIGIN}]`, `allow-credentials: true`. `micronaut.server.netty.use-forwarded-headers`: no se activa; la IP de cliente solo se usa para el rate limit vía `ClientAddress`.

- [ ] **Step 1: Tests que fallan.** `ClientAddressTest.usesLastForwardedHop("1.1.1.1, 2.2.2.2" → "2.2.2.2")`, `fallsBackToRemote`; `RateLimitFilterTest.authLimitIs30` (31 POST login → la 31ª es 429 con cabeceras), `avatarsAreExemptFromAuthLimit`, `disabledFlagSkipsInTest` (contexto con `pu.rate-limit-disabled=true` → 200 siempre).

- [ ] **Step 2: Ver fallar.** → FAIL.

- [ ] **Step 3: Implementar** con `ConcurrentHashMap<String, FixedWindowCounter>` y limpieza perezosa de ventanas vencidas.

- [ ] **Step 4: Ver pasar.** → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: límites de peticiones, CORS en desarrollo y dirección de cliente tras proxy"`.

---

### Task 13: OpenAPI generado en compilación y Swagger UI en dev/test

**Files:**
- Modify: `backend/build.gradle.kts`, `application.yml`, `application-dev.yml`, `application-test.yml`, controladores (anotaciones `@Operation`/`@Tag` mínimas), `backend/.gitignore`
- Create: `backend/openapi/pokemon-universe.yml` (copia commiteada del generado)
- Test: `.../OpenApiSpecTest.java`

**Interfaces:**
- `./gradlew assemble` genera `build/classes/java/main/META-INF/swagger/pokemon-universe-0.1.yml`; una tarea Gradle `syncOpenApi` lo copia a `backend/openapi/pokemon-universe.yml` y `check` depende de una tarea `verifyOpenApi` que falla si la copia commiteada difiere (mensaje `Ejecuta ./gradlew syncOpenApi`).
- `GET /swagger/pokemon-universe-0.1.yml` y `GET /swagger-ui` disponibles en `dev` y `test`, deshabilitados en `prod` (`micronaut.router.static-resources.swagger.enabled: false`).

- [ ] **Step 1: Test que falla.** `OpenApiSpecTest.specListsEtapaOnePaths`: lee `build/.../pokemon-universe-0.1.yml` desde el classpath (`META-INF/swagger/...`) y comprueba que `paths` contiene exactamente las 11 rutas: `/api/auth/register, /api/auth/login, /api/auth/guest, /api/auth/logout, /api/auth/me, /api/auth/profile, /api/auth/avatars/{filename}, /api/changelog, /api/feedback, /api/games, /api/pokemon`.

- [ ] **Step 2: Ver fallar.** → FAIL (no hay recurso).

- [ ] **Step 3: Implementar.** `annotationProcessor("io.micronaut.openapi:micronaut-openapi")`, `compileOnly("io.micronaut.openapi:micronaut-openapi-annotations")`, `@OpenAPIDefinition(info = @Info(title = "Pokémon Universe API", version = "0.1"))` en `Application`. Tareas Gradle `syncOpenApi`/`verifyOpenApi`.

- [ ] **Step 4: Ver pasar.** `./gradlew check` → PASS; `./gradlew syncOpenApi` crea la copia.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: especificación OpenAPI generada y Swagger UI en desarrollo"`.

---

### Task 14: Observabilidad: métricas Prometheus y logs JSON en producción

**Files:**
- Modify: `backend/build.gradle.kts`, `application.yml`, `application-prod.yml`, `logback.xml`
- Create: `backend/src/main/resources/logback-prod.xml` (seleccionado en la imagen Docker con `-Dlogback.configurationFile=logback-prod.xml` en `JAVA_TOOL_OPTIONS`; Logback lo resuelve como recurso del classpath)
- Test: `.../ObservabilityEndpointsTest.java`

**Interfaces:**
- `GET /prometheus` → 200 texto con `http_server_requests_seconds` y `jvm_memory_used_bytes`; `GET /health/liveness` y `/health/readiness` → 200 (readiness incluye el indicador de BD).
- En `prod`: Logback con `net.logstash.logback.encoder.LogstashEncoder` (una línea JSON por evento, campos `@timestamp, level, logger_name, message, mdc`). En `dev`/`test`: patrón de texto.

- [ ] **Step 1: Test que falla.** `prometheusExposesHttpMetrics`, `readinessIncludesDatabase` (body `details.jdbc` presente).

- [ ] **Step 2: Ver fallar.** → FAIL.

- [ ] **Step 3: Implementar.** `micronaut-micrometer-core`, `micronaut-micrometer-registry-prometheus`, `logstash-logback-encoder`. `endpoints.prometheus.sensitive: false`, `endpoints.health.disk-space.enabled: false`.

- [ ] **Step 4: Ver pasar.** → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Backend Java: métricas Prometheus y logs JSON en producción"`.

---

### Task 15: Dockerfile del backend, Compose y nginx como *strangler*

**Files:**
- Create: `backend/Dockerfile`, `backend/Dockerfile.native`, `backend/.dockerignore`
- Modify: `compose.yaml`, `compose.dev.yaml`, `infra/nginx.conf`, `scripts/deploy.sh`, `.env.example`, `.env.pre.example`, `.env.pro.example`
- Test: verificación manual con Compose (abajo)

**Interfaces:**
- `backend/Dockerfile`: etapa `build` en `eclipse-temurin:25-jdk` (con `--platform=$BUILDPLATFORM`, `./gradlew --no-daemon assemble -x test`), etapa final `eclipse-temurin:25-jre-alpine` (comprobar con `docker manifest inspect eclipse-temurin:25-jre-alpine` que existe para amd64 y arm64; si no, `25-jre` sobre Noble), `USER 10001:10001`, `WORKDIR /app`, copia del jar `build/libs/*-all.jar` como `app.jar`, `ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC"`, `EXPOSE 8080`, `HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/health/readiness || exit 1`, `ENTRYPOINT ["java","-jar","/app/app.jar"]`. Imagen `ghcr.io/matadoreru/pokemon-universe-backend`.
- `backend/Dockerfile.native`: build con `ghcr.io/graalvm/native-image-community:25` ejecutando `./gradlew nativeCompile`, runtime `registry.access.redhat.com/ubi9/ubi-micro`, `USER 10001`, `ENTRYPOINT ["/app/backend"]`. UBI-micro no trae `wget` ni `curl`, así que la imagen nativa **no define HEALTHCHECK**. Decisión: en la etapa 1 Compose despliega la imagen JVM; la nativa se publica con sufijo `-native` para medir arranque y memoria, y se adopta en la etapa 2 añadiendo al binario un modo `--healthcheck` que haga la petición a `/health/readiness` y salga con 0/1.
- `compose.yaml`: servicio `backend` con `image: ${PU_BACKEND_IMAGE:-ghcr.io/matadoreru/pokemon-universe-backend}:${PU_IMAGE_TAG:-latest}`, `environment`: `MICRONAUT_ENVIRONMENTS=prod`, `PORT=8080`, `JDBC_URL=jdbc:postgresql://postgres:5432/${PU_POSTGRES_DB:-pokemon_universe}`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `WEB_ORIGIN`, `COOKIE_SECURE`, `AVATAR_STORAGE_DIR=/data/avatars`, `PU_COMMIT_SHA`; volumen `pokemon_universe_avatar_data:/data/avatars`; `depends_on: postgres: service_healthy` **y** `server: service_healthy` (Node aplica las migraciones Prisma antes de que Flyway haga baseline); `read_only: true`, `tmpfs: /tmp`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit: 150`, healthcheck `wget -qO- http://127.0.0.1:8080/health/readiness`, `start_period: 60s`. `web` pasa a `depends_on` también `backend: service_healthy`. `compose.dev.yaml`: `backend.build.context: ./backend`.
- `infra/nginx.conf`: antes de `location /api/`, añadir `location ~ ^/api/auth/(register|login|guest|logout|me|profile)$ { proxy_pass http://backend:8080; <mismas cabeceras> }`, `location ^~ /api/auth/avatars/ { proxy_pass http://backend:8080; }`, `location = /api/changelog`, `location = /api/feedback`, `location = /api/games`, `location = /api/pokemon` → `backend:8080`. `/api/health` y el resto siguen en `server:3001`.
- `scripts/deploy.sh`: `docker compose pull server web backend` y `up -d --wait … server backend web`; el snapshot de rollback incluye la imagen de `backend`.
- `.env*.example`: añadir `PU_BACKEND_IMAGE=ghcr.io/matadoreru/pokemon-universe-backend`.

- [ ] **Step 1: Escribir ficheros.** Según Interfaces.

- [ ] **Step 2: Verificar local con contenedores.** `cp .env.example .env` (bloque Compose con secretos de prueba), `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait`; comprobar: `curl -s localhost:8080/api/health` (Node vía nginx) → `status ok`; `curl -s localhost:8080/api/games | jq '.games|length'` → 28 (Java vía nginx; confirmar en `docker compose logs backend` que la petición llegó a Java); `curl -s -X POST localhost:8080/api/auth/guest -H 'content-type: application/json' -d '{"displayName":"Ana"}' -c c.txt` → 201, y con `-b c.txt` `curl localhost:8080/api/auth/me` (Java) y `curl localhost:8080/api/categories` (Node, debe responder 401 "Registered account required" y no "Authentication required": la cookie firmada por Java la acepta Node). `docker compose exec postgres psql -U pokemon -d pokemon_universe -c 'select version from flyway_schema_history'` → `1`.

- [ ] **Step 3: Verificar `deploy.sh` en local.** `PU_IMAGE_TAG=dev ./scripts/deploy.sh dev` contra el stack anterior → termina con `Despliegue correcto`.

- [ ] **Step 4: Commit.** `git commit -m "Docker y Compose: servicio backend Java detrás de nginx"`.

---

### Task 16: Node y Vite conviven con Java: fixture inversa, proxy de Vite y arranque local

**Files:**
- Create: `apps/server/src/auth/java-session-fixture.test.ts`, `apps/server/src/auth/fixtures/java-session-token.txt`
- Create: `backend/src/test/java/es/pokemonuniverse/fixtures/ExportJavaSessionFixture.java` (test con `@EnabledIfSystemProperty` que escribe el fichero)
- Modify: `apps/web/vite.config.ts`, `package.json` (script `dev`), `README.md`

**Interfaces:**
- `java-session-fixture.test.ts`: con `JWT_SECRET=test-secret-test-secret-test-secret-1234`, `verifyIdentity(fixture)` devuelve `{ id: "user_fixture_java", displayName: "Ana", kind: "USER", role: "USER", avatar: { type: "DEFAULT" } }`. La fixture la genera `./gradlew test -Dpu.exportFixture=true --tests '*ExportJavaSessionFixture'` con `exp` 2099-01-01.
- `vite.config.ts` `server.proxy`: claves regex `'^/api/auth/(register|login|guest|logout|me|profile)$'`, `'^/api/auth/avatars/'`, `'^/api/(changelog|feedback|games|pokemon)$'` → `http://localhost:8080`; `'/api'` y `'/socket.io'` siguen a `:3001`.
- `npm run dev` arranca tres procesos con `concurrently -n server,backend,web`: Node, `npm run dev:backend` (= `cd backend && ./gradlew run -t --quiet` con `MICRONAUT_ENVIRONMENTS=dev` y `JWT_SECRET`, `COOKIE_SECURE`, `WEB_ORIGIN` del entorno) y Vite.

- [ ] **Step 1: Test Node que falla.** Escribir `java-session-fixture.test.ts` sin fixture → FAIL (fichero ausente).

- [ ] **Step 2: Generar fixture desde Java** y ejecutar `npm test -w @pokemon-universe/server -- java-session` → PASS.

- [ ] **Step 3: Proxy y scripts.** Editar `vite.config.ts` y `package.json`. Verificar: `npm run dev`; en el navegador `http://localhost:5173`, entrar como invitado (pasa por Java: verlo en el log de `backend`), crear una sala (Socket.IO en Node acepta la cookie), abrir perfil de un usuario registrado (Java), enviar feedback (Java), ver novedades (Java).

- [ ] **Step 4: Playwright.** `npm run test:e2e` completo en verde con los tres procesos (la configuración de Playwright arranca servidor y web; añadir el arranque de `backend` como tercer `webServer` con `url: http://localhost:8080/health`).

- [ ] **Step 5: README.** Sección "Puesta en marcha": requisitos (Node 22, Java 25, podman/Docker), el `.env` añade `JDBC_URL`, `DB_USER`, `DB_PASSWORD`; `npm run dev` levanta los tres; un solo comando con contenedores: `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait`. Tabla de comandos con `npm run dev:backend`, `cd backend && ./gradlew check`.

- [ ] **Step 6: Commit.** `git commit -m "Desarrollo local con Node, backend Java y Vite; fixture cruzada de sesión"`.

---

### Task 17: GitHub Actions separados por rutas con caché y retag del SHA

**Files:**
- Create: `.github/actions/deploy-ssh/action.yml` (composite: Tailscale + SSH + `deploy.sh`)
- Create: `.github/workflows/frontend.yml`, `.github/workflows/backend.yml`, `.github/workflows/node-server.yml`, `.github/workflows/main.yml`
- Modify: `.github/workflows/promote-production.yml`; Delete: `.github/workflows/docker.yml`
- Modify: `Dockerfile` (raíz) sin cambios funcionales; `DEPLOY.md`, `docs/pre-production.md`

**Interfaces:**
- `frontend.yml`: `on: pull_request (paths: apps/web/**, packages/shared/**, e2e/**, package.json, package-lock.json, scripts/export-game-registry.mjs)` y `workflow_call (inputs: publish: boolean)`. Jobs: `install` (setup-node 22 `cache: npm`, `npm ci`, sube `node_modules` **no**: cada job hace `npm ci` con caché), `lint`, `typecheck`, `test` (incluye `check:boundaries` y `check:registry`) **en paralelo** tras `install`; `build` (Vite) → `image` (si `publish`: Buildx target `web` del `Dockerfile` raíz, `linux/amd64,linux/arm64`, cache `type=gha,scope=web` con `cache-to`, tags `:pre` y `:<sha>`).
- `node-server.yml` (transitorio hasta la etapa 2): paths `apps/server/**`, `packages/shared/**`, `Dockerfile`, `scripts/start-server.sh`; jobs `check` (postgres service, migraciones, typecheck, lint, test) y `image` (target `server`, scope `server`). `npm audit --omit=dev --audit-level=high` en un job `audit` paralelo **no bloqueante** (`continue-on-error: true`) que publica el resumen.
- `backend.yml`: paths `backend/**`; jobs `check` (setup-java 25 temurin, `gradle/actions/setup-gradle` con `cache-read-only: ${{ github.ref != 'refs/heads/main' }}`, `./gradlew check --no-daemon`), `image` (Buildx, `backend/Dockerfile`, `linux/amd64,linux/arm64`, scope `backend`, tags `:pre`, `:<sha>`), `native` (solo `publish`, `continue-on-error: true`, `backend/Dockerfile.native`, `linux/amd64`, tag `:<sha>-native`).
- `main.yml`: `on: push: branches: [main]`, `workflow_dispatch`. Job `changes` con `dorny/paths-filter` (salidas `frontend`, `node`, `backend`); jobs `frontend`/`node`/`backend` que llaman a los reusables con `publish: true` si cambió; job `retag` que, para cada imagen **no** reconstruida, ejecuta `docker buildx imagetools create --tag ghcr.io/<owner>/<imagen>:<sha> ghcr.io/<owner>/<imagen>:pre` (así cada SHA de `main` tiene las tres imágenes); `deploy-pre` (`needs: [frontend, node, backend, retag]`, `if: always() && !failure() && !cancelled() && vars.PRE_DEPLOY_ENABLED == 'true'`) usa la *composite action*.
- `promote-production.yml`: añade `pokemon-universe-backend` al retag de `:latest`.
- Tags de versión: `main.yml` también se dispara con `on: push: tags: ['v*']`; en ese caso los jobs de imagen añaden el tag `:<nombre del tag git>` (por ejemplo `:v0.9.0`) a las tres imágenes además de `:<sha>`, sin desplegar a PRE.
- `permissions: contents: read, packages: write` y `concurrency` como hoy. Documentar en `DEPLOY.md` las tres imágenes y en `docs/pre-production.md` el nuevo nombre del workflow.

- [ ] **Step 1: Escribir los workflows** según Interfaces. `actionlint` local si está disponible (`npx -y @rhysd/actionlint` no existe; usar `docker run --rm -v "$PWD:/repo" rhysd/actionlint:latest -color`).

- [ ] **Step 2: Probar en una rama.** Crear rama `ci/etapa-1`, abrir PR; comprobar que un cambio solo en `backend/` dispara `backend.yml` y no `frontend.yml`. Fusionar en `main` y comprobar en `main.yml`: tres imágenes con tag `<sha>` en GHCR (`gh api /user/packages/container/pokemon-universe-backend/versions`) y `deploy-pre` en verde (o saltado si `PRE_DEPLOY_ENABLED` no está).

- [ ] **Step 3: Tiempos.** Anotar en `DEPLOY.md` una tabla "antes/después": antes `validate 2:43 + publish 4:13 + deploy 1:11 ≈ 8:15` en cada push; después (estimado, medir en la primera ejecución y corregir): frontend ≈ 2:00 (install 45 s, lint/typecheck/test en paralelo ≈ 30 s, build 25 s) + imagen web ≈ 1:00; node-server ≈ 2:30 + imagen ≈ 2:30; backend check ≈ 2:30 (Gradle cacheado; Testcontainers ≈ 40 s) + imagen JVM ≈ 2:00; nativo ≈ 10–15 min solo en `main` y no bloqueante; un cambio solo de frontend: ≈ 3:00 + deploy 1:10.

- [ ] **Step 4: Commit.** `git commit -m "CI: workflows separados por rutas para frontend, servidor Node y backend Java"`.

---

### Task 18: Frontend: tipos REST generados desde OpenAPI

**Files:**
- Modify: `apps/web/package.json` (devDependency `openapi-typescript`, script `api:types`), `package.json` raíz (`check:api-types`)
- Create: `apps/web/src/lib/api-types.ts` (generado, commiteado)
- Modify: `apps/web/src/auth/AuthContext.tsx`, `apps/web/src/screens/ProfilePage.tsx`, la pantalla de feedback y la de changelog para tipar las respuestas con `paths[...]['get'|'post']['responses'][200|201]['content']['application/json']`
- Test: `apps/web/src/lib/api-types.test.ts`

**Interfaces:**
- `npm run api:types -w @pokemon-universe/web` = `openapi-typescript ../../backend/openapi/pokemon-universe.yml -o src/lib/api-types.ts`. `npm run check:api-types` regenera a un temporal y hace `diff` (mensaje `Ejecuta npm run api:types -w @pokemon-universe/web`), incluido en el script `test` raíz y en `frontend.yml` (paths añade `backend/openapi/**`).
- `api-types.test.ts`: comprueba en tiempo de tipos (`expectTypeOf`) que `paths['/api/auth/me']['get']['responses'][200]['content']['application/json']['user']` es asignable a `AuthUser | null` de `@pokemon-universe/shared/public`; falla la compilación si el contrato Java se separa del TS.

- [ ] **Step 1: Test que falla.** Escribir `api-types.test.ts` → `npm run typecheck` FAIL (no existe `api-types.ts`).

- [ ] **Step 2: Generar e integrar.** Instalar `openapi-typescript`, generar, tipar las 4 llamadas.

- [ ] **Step 3: Ver pasar.** `npm run typecheck && npm run lint && npm test` → PASS. Playwright: `npm run test:e2e` en verde; capturas en `e2e/screenshots/` sin cambios visuales (no hay cambio de UI; no requiere rúbrica).

- [ ] **Step 4: Commit.** `git commit -m "Web: tipos de la API REST generados desde OpenAPI del backend"`.

---

### Task 19: Documentación final de la etapa 1 y pendientes

**Files:**
- Modify: `README.md`, `DEPLOY.md`, `docs/architecture.md` (sección "Backend Java (etapa 1)"), `AGENTS.md` (estructura y comandos del backend), `docs/superpowers/specs/2026-10-31-separacion-frontend-backend-java-design.md` (estado: etapa 1 implementada)
- Create: `docs/migracion-java-pendientes.md`

**Interfaces:**
- `docs/migracion-java-pendientes.md`: lista de tareas de la etapa 2 (salas, 28 motores con golden tests, data-sync, admin, categorías/WYR/avatares con escritura, `/api/tcg/*`, proxy de assets, WebSocket, mover `apps/web` a `frontend/` y `shared/public` dentro, retirar Node y `prisma migrate deploy`, Flyway como único dueño, `_prisma_migrations`), riesgos abiertos (E2E en CI sin catálogo sembrado, imagen nativa sin healthcheck, Micronaut 5 reciente, versión de `eclipse-temurin:25-jre-alpine`), y métricas medidas de CI.

- [ ] **Step 1: Escribir la documentación.** Comandos para levantar (`npm run dev`, Compose) y testear (`npm test`, `cd backend && ./gradlew check`, `npm run test:e2e`).

- [ ] **Step 2: Verificación completa.** `npm run typecheck && npm run lint && npm test`, `cd backend && ./gradlew check`, `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait` + las comprobaciones de la Tarea 15, `npm run test:e2e`.

- [ ] **Step 3: Commit.** `git commit -m "Documentación de la etapa 1 del backend Java y lista de pendientes"`.
