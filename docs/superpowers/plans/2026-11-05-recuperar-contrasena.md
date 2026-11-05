# Recuperar la contraseña por email: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que una cuenta registrada pueda poner una contraseña nueva con un enlace de un solo uso enviado a su email.

**Architecture:** tabla `PasswordResetToken` (Flyway V6) con el hash del token; `PasswordResetService` en `application/auth` usa un puerto `MailSender` (adaptador SMTP con Jakarta Mail, o de log si no hay SMTP); dos rutas nuevas en `AuthController`; dos pantallas nuevas en el frontend; Mailpit como buzón en local y E2E.

**Tech Stack:** Java 25, Micronaut 5, Micronaut Data JPA, Flyway, Jakarta Mail (`org.eclipse.angus:angus-mail`), React + Vite, Vitest, Playwright, Mailpit.

**Spec:** `docs/superpowers/specs/2026-11-05-recuperar-contrasena-design.md`

## Global Constraints

- Token: 32 bytes de `SecureRandom`, base64url sin relleno; en BD solo `SHA-256` en hex. Validez 30 min. Un solo uso.
- Pedir un enlace nuevo invalida los anteriores sin usar de esa cuenta. Como mucho un correo por cuenta cada 60 s.
- `POST /api/auth/password/forgot` responde `204` exista o no la cuenta, y el correo sale en segundo plano.
- Error de enlace: backend `"Invalid or expired reset link"`, frontend *«Este enlace no es válido o ha caducado.»*.
- Mensaje tras pedir el enlace: *«Si existe una cuenta, te hemos enviado un enlace a su email. Caduca en 30 minutos.»*
- Política de límite `passwordReset`: 5 peticiones por IP cada 15 min a `forgot` (además de la `auth` existente).
- Variables: `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` (`Pokémon Universe <no-responder@matadoreru.com>`). Enlace: `<WEB_ORIGIN>/auth/nueva-contrasena?token=<token>`.
- Reglas de `AGENTS.md`: comentarios Java en español, capa hexagonal (application no depende de adapters/in), migración nueva sin tocar las aplicadas, OpenAPI regenerado, UI solo con componentes de `frontend/src/ui/`, texto ≥ 13 px, Playwright a 1280×720, 1920×1080 y 390×844 y nota de la rúbrica (≥ 19/24) en el commit de UI.
- Fuera de alcance: cerrar otras sesiones, cambiar la contraseña desde el perfil.

## Review Focus

1. **Enlace con basura al final** (algunos clientes de correo añaden `.` o espacios al copiar): el token se recorta y, si no tiene 43 caracteres base64url, es «no válido» sin consultar la BD → test en Task 3.
2. **Doble envío del formulario de contraseña nueva** (doble clic o dos pestañas con el mismo enlace): solo uno cambia la contraseña; el otro recibe el error de enlace → test en Task 3.
3. **`WEB_ORIGIN` con barra final** (`https://x.com/`): el enlace no lleva `//auth` → test en Task 2.
4. **Abrir el enlace con otra sesión abierta** (otra cuenta o invitado): tras guardar, la cookie pasa a ser la de la cuenta restablecida → test en Task 4.
5. **Mailpit no está arrancado al correr el E2E**: el spec falla en `beforeAll` con un mensaje que dice cómo arrancarlo, en vez de esperar el correo hasta el timeout → paso en Task 6.

---

### Task 1: Tabla y repositorio de tokens

**Files:**
- Create: `backend/src/main/resources/db/migration/V6__recuperar_contrasena.sql`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/PasswordResetTokenEntity.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/PasswordResetTokenRepository.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/UserEntity.java` (método `changePassword`)
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/out/persistence/PasswordResetTokenRepositoryTest.java`

**Interfaces:**
- Produces:
  - `PasswordResetTokenEntity.create(String id, String userId, String tokenHash, Instant expiresAt, Instant now)`, getters `getId()`, `getUserId()`, `getTokenHash()`, `getExpiresAt()`, `getUsedAt()`, `getCreatedAt()`, y `markUsed(Instant now)`.
  - `PasswordResetTokenRepository extends CrudRepository<PasswordResetTokenEntity, String>` con:
    - `Optional<PasswordResetTokenEntity> findByTokenHashForUpdate(String tokenHash)`: `@Query` nativa con `SELECT … FOR UPDATE`;
    - `int invalidateUnused(String userId, Instant now)`: pone `usedAt = now` donde `userId` y `usedAt IS NULL`;
    - `Optional<Instant> findLatestCreatedAt(String userId)`.
  - `UserEntity.changePassword(String passwordHash, Instant now)`: cambia el hash y `updatedAt`.

- [ ] **Step 1: Escribir `V6__recuperar_contrasena.sql`.** Tabla `public."PasswordResetToken"` con las columnas de la tabla de la spec (§Datos). Añadir `PRIMARY KEY (id)`, `UNIQUE ("tokenHash")`, índice `"PasswordResetToken_userId_idx"` y FK `"PasswordResetToken_userId_fkey"` a `public."User"(id)` `ON DELETE CASCADE ON UPDATE CASCADE`.
- [ ] **Step 2: Escribir los tests que fallan** en `PasswordResetTokenRepositoryTest` (`@MicronautTest(transactional = false)`; crea un usuario con `UserRepository` y lo borra en `@AfterEach`):
  - `savesAndFindsByHash`: tras `save`, `findByTokenHashForUpdate(hash)` está presente (dentro de una transacción) y conserva `expiresAt`.
  - `invalidateUnusedMarksOnlyThatUsersOpenTokens`: dos tokens del usuario A (uno ya usado) y uno de B. `invalidateUnused(A, now)` devuelve `1`. El de B sigue con `usedAt == null`.
  - `deletingTheUserDeletesItsTokens`: tras borrar el usuario, `count()` de sus tokens es 0.
  - `latestCreatedAtIsTheNewest`: con dos tokens, devuelve el `createdAt` mayor. Sin tokens, `Optional.empty()`.
- [ ] **Step 3: Ejecutar** `cd backend && ./gradlew test --tests '*PasswordResetTokenRepositoryTest*'`. Esperado: FAIL de compilación (no existen las clases).
- [ ] **Step 4: Implementar** la entidad (`@Table(name = "PasswordResetToken")`, columnas citadas como en `UserEntity`), el repositorio y `UserEntity.changePassword`.
- [ ] **Step 5: Ejecutar** el test de este task y `--tests '*FlywayMigrationsTest*' --tests '*SchemaBaselineTest*'`. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Tabla de tokens para recuperar la contraseña`.

### Task 2: Puerto de correo, adaptadores SMTP y de log, y Mailpit

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/mail/MailSender.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/mail/MailMessage.java`
- Create: `backend/src/main/java/es/pokemonuniverse/config/MailConfig.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/mail/SmtpMailSender.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/mail/LoggingMailSender.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/auth/PasswordResetMail.java` (texto del correo)
- Modify: `backend/build.gradle.kts` (dependencia `org.eclipse.angus:angus-mail`, versión estable con más de dos semanas)
- Modify: `backend/src/main/resources/application.yml` (bloque `pu.mail`), `.env.example`, `compose.yaml` (variables `SMTP_*` y `MAIL_FROM` en el servicio del backend), `compose.local.yaml` (servicio `mailpit`)
- Test: `backend/src/test/java/es/pokemonuniverse/application/auth/PasswordResetMailTest.java`, `backend/src/test/java/es/pokemonuniverse/adapters/out/mail/MailSenderSelectionTest.java`

**Interfaces:**
- Produces:
  - `record MailMessage(String to, String subject, String text, String html)`.
  - `interface MailSender { void send(MailMessage message); }`.
  - `MailConfig` (`@ConfigurationProperties("pu.mail")`): `host()` (opcional), `port()` (465), `user()`, `password()`, `from()`.
  - `PasswordResetMail.build(String to, String username, String webOrigin, String token): MailMessage`.
- Selección de bean: `SmtpMailSender` con `@Requires(property = "pu.mail.host")`. `LoggingMailSender` con `@Requires(missingProperty = "pu.mail.host")`. Este último registra en el log el destinatario y el enlace, y al arrancar avisa una vez de que el correo no está configurado.
- `SmtpMailSender`: con el puerto 465 usa `mail.smtp.ssl.enable=true`; con otro puerto, `mail.smtp.starttls.enable=true` si hay usuario. Se autentica solo si `user` no está vacío (Mailpit no lo pide). Envía un `MimeMultipart("alternative")` con el texto y el HTML.

- [ ] **Step 1: Tests que fallan** en `PasswordResetMailTest`:
  - `linkUsesOriginAndToken`: con `build("a@x.com", "Ana", "https://pu.test", "TOK")`, `text()` contiene `https://pu.test/auth/nueva-contrasena?token=TOK`.
  - `trailingSlashOriginHasNoDoubleSlash` (Review Focus 3): con el origen `https://pu.test/`, el enlace es `https://pu.test/auth/nueva-contrasena?token=TOK`.
  - `copyIsSpanish`: el asunto es `Pon una contraseña nueva en Pokémon Universe`. `text()` contiene `Ana`, `30 minutos` y `Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.`. `html()` contiene el mismo enlace dentro de un `href`, con el nombre de usuario escapado para HTML.
- [ ] **Step 2: Test que falla** en `MailSenderSelectionTest`: sin `pu.mail.host`, el bean `MailSender` es un `LoggingMailSender`. Con `pu.mail.host=localhost` (en un `ApplicationContext.run(Map)`), es un `SmtpMailSender`.
- [ ] **Step 3: Ejecutar** `./gradlew test --tests '*PasswordResetMailTest*' --tests '*MailSenderSelectionTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 4: Implementar** las clases de este task, `application.yml` (`pu.mail.host: ${SMTP_HOST:}`; un valor vacío cuenta como ausente: usar `@Requires(property = "pu.mail.host", pattern = ".+")`), las variables en `.env.example` y `compose.yaml`, y Mailpit en `compose.local.yaml` (`docker.io/axllent/mailpit` con una etiqueta de versión fija, puertos `127.0.0.1:1025:1025` y `127.0.0.1:8025:8025`). En `.env.example`, comentario con los valores de Mailpit (`SMTP_HOST=localhost`, `SMTP_PORT=1025`) y con los de Resend para PRO (los de la spec, §Puesta en producción).
- [ ] **Step 5: Ejecutar** los tests de este task. Esperado: PASS. Después, `npm run db:up` y comprobar que Mailpit responde en `http://127.0.0.1:8025/api/v1/messages`.
- [ ] **Step 6: Commit** con el mensaje `Envío de correo por SMTP (Resend en PRO, Mailpit en local)`.

### Task 3: Servicio de recuperación

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/auth/PasswordResetService.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/auth/AccountLookup.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/application/auth/AuthService.java` (usa `AccountLookup`)
- Test: `backend/src/test/java/es/pokemonuniverse/application/auth/PasswordResetServiceTest.java`

**Interfaces:**
- Consumes: Task 1 (repositorio, `changePassword`), Task 2 (`MailSender`, `PasswordResetMail.build`), `PasswordHasher`, `PuConfig.webOrigin()`.
- Produces:
  - `AccountLookup.find(String identifier): Optional<UserEntity>`: la lógica de `AuthService.account()` (commit `8422a3a`), movida aquí sin cambios. `AuthService.login` la usa.
  - `PasswordResetService.requestReset(String identifier): void`.
  - `PasswordResetService.reset(String token, String password): AuthUser`. Lanza `InvalidResetLinkException` (nueva, en `application/errors`, con el mensaje `"Invalid or expired reset link"`, mapeada a `400` como las otras excepciones de aplicación).
- El reloj se inyecta como `java.time.Clock` para poder probar la caducidad. El envío va a un `ExecutorService` inyectado (`@Named(TaskExecutors.BLOCKING)`): en el test se sustituye por uno que ejecuta en el mismo hilo.

- [ ] **Step 1: Tests que fallan** en `PasswordResetServiceTest` (`@MicronautTest(transactional = false)`, con un `MailSender` falso por `@Replaces` que guarda los mensajes, el ejecutor síncrono y `Clock` fijo y avanzable):
  - `requestSendsOneMailWithAWorkingToken`: con el email, sale un mensaje a ese email. Con el token del enlace, `reset(token, "nueva-contrasena-1")` devuelve la identidad de la cuenta.
  - `requestByUsernameSendsToTheAccountEmail`.
  - `unknownAccountSendsNothingAndDoesNotThrow`.
  - `secondRequestWithinAMinuteSendsNothing`, y `secondRequestAfterAMinuteInvalidatesTheFirstLink`: el primer token da `InvalidResetLinkException` y el segundo funciona.
  - `expiredAfterThirtyMinutes`: con el reloj 30 min + 1 s después, el token da la excepción.
  - `tokenIsSingleUse`: el segundo `reset` con el mismo token da la excepción.
  - `concurrentResetsChangeThePasswordOnce` (Review Focus 2): dos hilos con el mismo token. Exactamente uno devuelve la identidad y el otro lanza la excepción.
  - `newPasswordWorksAndOldOneDoesNot`: `AuthService.login` con la nueva funciona y con la antigua lanza `UnauthorizedException`.
  - `malformedTokenIsInvalid` (Review Focus 1): `"abc"`, la cadena vacía y un token válido con `"."` al final dan la excepción. Un token válido con espacios alrededor funciona.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*PasswordResetServiceTest*' --tests '*AuthControllerTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar** `AccountLookup` (y que `AuthService` la use), `InvalidResetLinkException` y `PasswordResetService`. `reset` es `@Transactional`: recorta el token, comprueba el formato `^[A-Za-z0-9_-]{43}$`, calcula el hash, usa `findByTokenHashForUpdate`, comprueba `usedAt == null` y `expiresAt` posterior al reloj, llama a `markUsed` y `changePassword` con `hasher.hash(password)`, y devuelve `UserIdentityMapper.identityFromUser(user)`.
- [ ] **Step 4: Ejecutar** los dos tests del Step 2. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Servicio para recuperar la contraseña con enlace de un solo uso`.

### Task 4: Rutas, límite de peticiones y contrato

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/auth/ForgotPasswordRequest.java`, `ResetPasswordRequest.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/auth/AuthController.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/ratelimit/RateLimitPolicy.java`
- Modify: `backend/openapi/pokemon-universe.yml`, `frontend/src/lib/api-types.ts` (regenerados)
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/in/rest/auth/PasswordResetControllerTest.java`, `backend/src/test/java/es/pokemonuniverse/adapters/in/rest/ratelimit/RateLimitFilterTest.java`

**Interfaces:**
- Consumes: Task 3.
- Produces (contrato HTTP del que depende Task 5):
  - `POST /api/auth/password/forgot` con `{identifier}`. Mismas anotaciones y mensajes que `LoginRequest.identifier`, y el mismo `normalized()`. Responde `204`.
  - `POST /api/auth/password/reset` con `{token, password}`. `token`: `@NotBlank`, máx. 128. `password`: los mensajes de `RegisterRequest`, 10–128. Responde `200 {user}` y abre sesión con `session(...)`.

- [ ] **Step 1: Tests que fallan** en `PasswordResetControllerTest` (con el `MailSender` falso de Task 3):
  - `forgotIs204ForExistingAndUnknownAccounts`: el mismo estado y el cuerpo vacío en los dos casos.
  - `forgotWithoutIdentifierIs400InSpanish`.
  - `resetLogsInWithCookie`: `200`, `user.displayName` es el de la cuenta y llega la cookie `pu_session`.
  - `resetWithBadTokenIs400`: el cuerpo es `{"error":"Invalid or expired reset link"}`.
  - `resetWithShortPasswordIs400OnPasswordField`.
  - `resetReplacesAnotherSession` (Review Focus 4): con la cookie de un invitado, `reset` devuelve una cookie nueva y `/api/auth/me` con ella devuelve la cuenta restablecida.
- [ ] **Step 2: Test que falla** en `RateLimitFilterTest`: `passwordResetForgotAllowsFivePerIpThenReturns429`, con la sexta petición desde la misma IP.
- [ ] **Step 3: Ejecutar** los dos tests. Esperado: FAIL.
- [ ] **Step 4: Implementar** los records, las dos rutas (con `@Operation` y `@ApiResponse` como las demás) y la política `new RateLimitPolicy("passwordReset", r -> r.getMethod() == HttpMethod.POST && r.getPath().equals("/api/auth/password/forgot"), 5, Duration.ofMinutes(15))`.
- [ ] **Step 5: Regenerar el contrato:** `cd backend && ./gradlew syncOpenApi` y `npm run api:types -w @pokemon-universe/web`.
- [ ] **Step 6: Ejecutar** `cd backend && ./gradlew check`. Esperado: todo en verde, también `verifyOpenApi`.
- [ ] **Step 7: Commit** con el mensaje `Rutas para pedir el enlace y poner la contraseña nueva`.

### Task 5: Pantallas del frontend

**Files:**
- Create: `frontend/src/screens/ForgotPasswordPage.tsx`, `frontend/src/screens/ResetPasswordPage.tsx`
- Modify: `frontend/src/main.tsx` (rutas `/auth/recuperar` y `/auth/nueva-contrasena`, públicas como `/auth`)
- Modify: `frontend/src/auth/AuthContext.tsx`, `frontend/src/auth/authErrors.ts`, `frontend/src/lib/api-contract.ts`
- Modify: `frontend/src/screens/AuthPage.tsx` (enlace «¿Has olvidado la contraseña?» solo en la pestaña Entrar, bajo la contraseña)
- Test: `frontend/src/auth/authErrors.test.ts`, `frontend/src/screens/ResetPasswordPage.test.tsx`

**Interfaces:**
- Consumes: el contrato de Task 4.
- Produces:
  - `AuthContext.requestPasswordReset(identifier: string): Promise<void>`;
  - `AuthContext.resetPassword(token: string, password: string): Promise<void>`, que hace `setUser` como `login`;
  - `AuthField` incluye `'passwordRepeat'`;
  - `export function passwordsMatch(password: string, repeat: string): AuthError | null` en `authErrors.ts`. Si no coinciden, devuelve `{ field: 'passwordRepeat', message: 'Las contraseñas no coinciden.' }`.

- [ ] **Step 1: Tests que fallan:**
  - en `authErrors.test.ts`, `Invalid or expired reset link` se traduce a `Este enlace no es válido o ha caducado.`;
  - en `authErrors.test.ts`, `passwordsMatch('a', 'b')` da el error del campo `passwordRepeat` y `passwordsMatch('a', 'a')` da `null`;
  - en `ResetPasswordPage.test.tsx`, sin `token` en la URL se muestra el estado de enlace no válido con el enlace «Pedir otro enlace» a `/auth/recuperar`;
  - en `ResetPasswordPage.test.tsx`, con `?token=x` el token desaparece de `window.location.search` tras montar, y el formulario sigue usándolo.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/auth frontend/src/screens/ResetPasswordPage.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar** las dos pantallas con la misma estructura que `AuthPage`: `Screen width="narrow"`, `Panel variant="cream"`, `Field`, `Pill`, `StateBox` y `LegalLine`, con foco inicial en el primer campo, foco al error y un solo dueño por error.
  - `ForgotPasswordPage` cambia el formulario por el `StateBox` de éxito con el texto de las Global Constraints y un enlace para volver a «Entrar».
  - `ResetPasswordPage` lee `token` con `useSearchParams` una sola vez, lo guarda en una ref y lo quita con `window.history.replaceState`. Al guardar, navega a `/play`. Con el error del enlace muestra el `StateBox` de error y la `Pill` «Pedir otro enlace».
  - No hace falta ningún componente nuevo en `ui/`. Si hiciera falta, primero se añade a la galería.
- [ ] **Step 4: Ejecutar** el Step 2, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Pantallas para recuperar la contraseña`.

### Task 6: Flujo completo en Playwright, capturas y rúbrica

**Files:**
- Create: `e2e/tests/recuperar-contrasena.spec.ts`
- Modify: `e2e/src/helpers.ts`: añadir `ultimoCorreoDe(email: string): Promise<{ subject: string; text: string }>`, que lee la API de Mailpit (`GET http://127.0.0.1:8025/api/v1/search?query=to:<email>` y luego `GET /api/v1/message/<ID>`) y reintenta durante 10 s como mucho.
- Modify: `e2e/playwright.config.ts`: añadir `SMTP_HOST: 'localhost'` y `SMTP_PORT: '1025'` al `env` del backend.
- Modify: `e2e/README.md` (Mailpit), `scripts/ui-check.mjs` si arranca servicios de `compose.local.yaml` por nombre.

**Interfaces:**
- Consumes: Tasks 2–5, y `nuevaCuenta`, `registrarPorApi`, `borrarCuentas` y `capture` de `e2e/src/helpers.ts`.

- [ ] **Step 1: Escribir el spec.**
  - `beforeAll` (Review Focus 5): `comprobarBdE2E()` y un `GET http://127.0.0.1:8025/api/v1/messages`. Si falla, lanzar `Mailpit no responde en :8025: arráncalo con npm run db:up`.
  - Por cada tamaño de `SIZES`:
    1. registrar por API;
    2. ir a `/auth` y pulsar «¿Has olvidado la contraseña?», que lleva a `/auth/recuperar`; captura `recuperar`;
    3. escribir el nombre de usuario y enviar; esperar el texto de éxito; captura `recuperar-enviado`;
    4. leer el correo con `ultimoCorreoDe` y sacar el enlace con `/\/auth\/nueva-contrasena\?token=[A-Za-z0-9_-]{43}/`;
    5. abrir el enlace y comprobar que la URL ya no contiene `token=`; captura `nueva-contrasena`;
    6. probar contraseñas distintas: el error va en «Repite la contraseña»;
    7. guardar la correcta: lleva a `/play`;
    8. cerrar sesión y entrar con la nueva;
    9. volver a abrir el mismo enlace y guardar: sale `Este enlace no es válido o ha caducado.`; captura `nueva-contrasena-caducado`.
  - `afterAll` llama a `borrarCuentas`.
  - Se descuenta exactamente un 400 de consola, como hace `acceso.spec.ts` con su 401.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- recuperar-contrasena acceso`. Esperado: todo PASS, las capturas a los tres tamaños y ningún aviso de tamaño que falte.
- [ ] **Step 3: Revisar las capturas** de `e2e/screenshots/recuperar*.png` y `nueva-contrasena*.png`. Puntuar las dos pantallas con `docs/visual-review.md`: mínimo 19/24 y ningún criterio a 0.
- [ ] **Step 4: Verificación final:** `npm test`, `npm run typecheck`, `npm run lint` y `cd backend && ./gradlew check`. Esperado: todo en verde.
- [ ] **Step 5: Commit** con el mensaje `Recuperar la contraseña: flujo en Playwright y capturas (rúbrica: recuperar N/24, nueva contraseña N/24)`.
