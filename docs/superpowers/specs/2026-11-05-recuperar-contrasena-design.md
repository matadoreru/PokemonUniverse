# Recuperar la contraseña por email

Fecha: 2026-11-05. Estado: aprobado en conversación, pendiente de revisión escrita.

## Objetivo

Una cuenta registrada que ha olvidado su contraseña puede poner una nueva sin ayuda del administrador, a través de un
enlace enviado a su email. Hoy no existe ninguna vía: el proyecto no envía correos.

**Criterio de éxito:** desde «¿Has olvidado la contraseña?», con el email o el nombre de usuario, el jugador recibe un
correo, abre el enlace, pone una contraseña nueva y entra en la web, en menos de un minuto y sin que nadie pueda
averiguar por esta vía qué cuentas existen.

## Decisiones tomadas

- **Envío por SMTP genérico** (Jakarta Mail), configurado por variables de entorno. Proveedor en producción: **Resend**,
  remitente `no-responder@matadoreru.com` (dominio en Cloudflare). Cambiar de proveedor solo cambia el `.env`.
- **En desarrollo y E2E, Mailpit**: buzón falso en `compose.local.yaml` con interfaz web y API HTTP.
- **Fuera de alcance:** cerrar las sesiones abiertas al cambiar la contraseña (el JWT de 7 días no se consulta contra la
  BD; hacerlo toca toda la autenticación) y cambiar la contraseña desde el perfil.

## Experiencia del jugador

1. En la pestaña «Entrar» de `/auth`, bajo el campo de contraseña, un enlace «¿Has olvidado la contraseña?» lleva a
   `/auth/recuperar`.
2. `/auth/recuperar`: un campo **«Email o usuario»** (el mismo criterio que el login: con `@` es email) y el botón
   «Enviar enlace». Al enviar, siempre el mismo estado de éxito: *«Si existe una cuenta, te hemos enviado un enlace a su
   email. Caduca en 30 minutos.»*, con un enlace para volver a «Entrar».
3. El correo (texto plano + HTML sencillo, en español): saludo con el nombre de usuario, botón «Poner contraseña nueva»
   que abre `<WEB_ORIGIN>/auth/nueva-contrasena?token=<token>`, aviso de caducidad (30 min) y la frase «Si no lo has
   pedido tú, ignora este correo: tu contraseña no cambia».
4. `/auth/nueva-contrasena`: campos «Contraseña nueva» (mínimo 10, `autoComplete="new-password"`) y «Repite la
   contraseña». Al guardar, la sesión queda abierta y va a `/play`.
5. Enlace usado, caducado, sustituido por uno más reciente o con token ausente o malformado: *«Este enlace no es válido o
   ha caducado.»* con el botón «Pedir otro enlace» (a `/auth/recuperar`).
6. Los invitados no tienen contraseña: el flujo no les afecta.

Las dos pantallas siguen Arcade DS con los componentes de `frontend/src/ui/` (mismo `Panel` crema que `/auth`), con
foco inicial en el primer campo, foco al error y un único dueño por error, como `AuthPage`.

## Backend

### Datos (Flyway `V6__recuperar_contrasena.sql`)

Tabla `PasswordResetToken`:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | UUID |
| `userId` | text NOT NULL | FK a `"User"(id)` `ON DELETE CASCADE`, con índice |
| `tokenHash` | text NOT NULL UNIQUE | SHA-256 en hex del token; el token nunca se guarda |
| `expiresAt` | timestamp(3) NOT NULL | creación + 30 min |
| `usedAt` | timestamp(3) NULL | marca de un solo uso |
| `createdAt` | timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### Token

- 32 bytes de `SecureRandom`, en base64url sin relleno (43 caracteres). Solo viaja en el enlace del correo.
- Válido si existe su hash, `usedAt` es nulo y `expiresAt` es futuro.
- Al crear uno nuevo para una cuenta, sus tokens anteriores sin usar se marcan como usados (solo vale el último enlace).
- Al restablecer, el token se marca usado en la misma transacción que el cambio de contraseña (con bloqueo de la fila,
  para que dos envíos a la vez no lo usen dos veces).

### Casos de uso (`application/auth/PasswordResetService`)

- `requestReset(identifier)`: resuelve la cuenta con la misma búsqueda que `AuthService.login` (email, usuario exacto o
  usuario sin mayúsculas si solo hay uno; se extrae a un método común). Si no hay cuenta, no hace nada. Si la cuenta ya
  pidió un enlace hace menos de 60 s, no hace nada (como mucho un correo por minuto y cuenta). Si no, crea el token y
  encarga el correo **en segundo plano**: la respuesta tarda lo mismo exista o no la cuenta.
- `reset(token, password)`: valida el token, guarda el hash de la contraseña nueva con el `PasswordHasher` existente,
  marca el token y devuelve la identidad para abrir sesión.

### Puerto de correo

- `application/mail/MailSender` (puerto): `send(MailMessage)` con destinatario, asunto, texto y HTML.
- `adapters/out/mail/SmtpMailSender`: Jakarta Mail (`micronaut-email-javamail` o `jakarta.mail` directo), TLS implícito
  en el puerto 465 y STARTTLS en el 587.
- Sin `SMTP_HOST` configurado (desarrollo sin Mailpit, tests unitarios): `LoggingMailSender` que escribe en el log el
  destinatario y el enlace. En producción `SMTP_HOST` es obligatorio si se quiere el flujo; sin él, el log avisa al
  arrancar.
- Un fallo de envío se registra en el log y no se propaga al cliente (ya respondió).

### Endpoints (`AuthController`)

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/auth/password/forgot` | `{identifier}` (mismas validaciones que el login) | `204` siempre que el cuerpo sea válido |
| `POST /api/auth/password/reset` | `{token, password}` (password 10–128, mensajes en español del registro) | `200 {user}` con la cookie de sesión; `400 {"error": "Invalid or expired reset link"}` |

Ambas rutas caen ya en la política `auth` (30 por IP cada 15 min). Se añade la política `passwordReset`: 5 peticiones
por IP cada 15 min a `forgot`. Se regeneran `backend/openapi/pokemon-universe.yml` y `frontend/src/lib/api-types.ts`.

### Configuración

Nuevas variables (con su entrada en `.env.example`, `compose.yaml` y `application.yml`):

- `SMTP_HOST`, `SMTP_PORT` (465 por defecto), `SMTP_USER`, `SMTP_PASSWORD`;
- `MAIL_FROM` (por defecto `Pokémon Universe <no-responder@matadoreru.com>`).

El enlace usa `WEB_ORIGIN`, que ya existe (`pu.web-origin`).

`compose.local.yaml` añade `mailpit` (`docker.io/axllent/mailpit`, SMTP en `127.0.0.1:1025`, web en `127.0.0.1:8025`);
el `.env` local de ejemplo apunta `SMTP_HOST=localhost`, `SMTP_PORT=1025`, sin TLS.

## Frontend

- Rutas `/auth/recuperar` y `/auth/nueva-contrasena` en `main.tsx`, pantallas en `frontend/src/screens/`.
- `authErrors.ts`: traduce `Invalid or expired reset link` y valida que las dos contraseñas coincidan en el cliente
  antes de enviar (error en el campo «Repite la contraseña»).
- `AuthContext`: `requestPasswordReset(identifier)` y `resetPassword(token, password)` (este último deja al usuario
  dentro, como `login`).
- El token se lee de la URL y se quita de la barra con `history.replaceState` al cargar, para que no quede en el
  historial ni se comparta por error.

## Pruebas

- **Java:** servicio y controlador con Testcontainers: token válido; caducado; usado dos veces; sustituido por uno nuevo;
  respuesta `204` idéntica para cuenta existente e inexistente; un correo por minuto y cuenta; búsqueda por usuario; la
  contraseña antigua deja de valer y la nueva entra; política `passwordReset`; migración en `FlywayMigrationsTest`. El
  correo se comprueba con un `MailSender` falso inyectado en los tests.
- **Vitest:** traducción de errores y validación de las contraseñas repetidas.
- **Playwright** (`e2e/tests/recuperar-contrasena.spec.ts`, con Mailpit): registrar por API, pedir el enlace, leer el
  correo por la API de Mailpit, poner la contraseña nueva, acabar en `/play` y entrar con ella; enlace reutilizado
  muestra el error. Capturas de las dos pantallas y sus estados a 1280×720, 1920×1080 y 390×844, `capture()` con sus
  valores por defecto y nota de la rúbrica de `docs/visual-review.md` (mínimo 19/24) en el commit.

## Puesta en producción (pasos del administrador)

1. Crear la cuenta en resend.com y añadir el dominio `matadoreru.com`; aceptar la configuración automática de los
   registros DNS en Cloudflare (SPF, DKIM y MX del subdominio de envío) y esperar a que figure como verificado.
2. Crear una API key con permiso de envío.
3. En el `.env` de producción: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`,
   `SMTP_PASSWORD=<API key>`, `MAIL_FROM="Pokémon Universe <no-responder@matadoreru.com>"`.
4. Desplegar (Flyway aplica V6) y probar el flujo con una cuenta propia.
