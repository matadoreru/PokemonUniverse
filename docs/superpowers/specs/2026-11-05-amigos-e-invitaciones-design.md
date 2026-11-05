# Amigos e invitaciones desde el lobby

Fecha: 2026-11-05. Estado: aprobado en conversación, pendiente de revisión escrita.

## Objetivo

Las cuentas registradas pueden hacerse amigas y, desde el lobby, invitar a un amigo conectado a su sala. El amigo
recibe la invitación al momento, esté en la pantalla que esté, y entra con un clic.

**Criterio de éxito:** dos jugadores registrados se añaden como amigos en menos de un minuto. Después, el anfitrión
invita desde el lobby y el amigo entra en la sala con «Unirse», sin escribir el código.

## Decisiones tomadas

- **Solo cuentas registradas.** Los invitados no ven la placa «Amigos» y no se les puede invitar.
- **Solicitud por nombre de usuario**, que el otro acepta o rechaza. No hay código de amigo ni búsqueda parcial.
- **La lista vive en un panel lateral** que abre la placa «Amigos» de la cabecera, con un contador de solicitudes
  pendientes. En el lobby, el mismo panel añade «Invitar» junto a cada amigo conectado.
- **Si el amigo está ocupado, la invitación le llega igual.** Si está en otra sala, «Unirse» le pide antes confirmar
  que sale de ella. Si está jugando una partida, el aviso es discreto (sin sonido) y no interrumpe.
- **Arquitectura:** las amistades viven en Postgres con rutas REST. La presencia y las invitaciones viajan por el
  `/ws` existente, que la web ya abre para toda sesión (`RoomProvider`). No hay canales nuevos ni consultas
  periódicas.
- **Fuera de alcance:** bloquear usuarios, chat entre amigos, invitaciones a amigos desconectados (no se guardan) y
  avisos por email.

## Datos (Flyway `V7__amigos.sql`)

Tabla `Friendship`, una fila por par de cuentas:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | UUID |
| `requesterId` | text NOT NULL | FK `"User"(id)` `ON DELETE CASCADE` |
| `addresseeId` | text NOT NULL | FK `"User"(id)` `ON DELETE CASCADE`, con índice |
| `status` | text NOT NULL | `PENDING` o `ACCEPTED` (`CHECK`) |
| `createdAt` | timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| `acceptedAt` | timestamp(3) NULL | |

- Índice único sobre el par sin orden (`LEAST(requesterId, addresseeId)`, `GREATEST(…)`): solo hay una fila por
  pareja, la pida quien la pida.
- `CHECK (requesterId <> addresseeId)`.
- Rechazar, cancelar o quitar a un amigo **borra** la fila. No hay historial y se puede volver a pedir.

## Reglas de amistad (`application/friends/FriendService`)

1. **Enviar solicitud** por nombre de usuario: exacto, o sin distinguir mayúsculas si solo hay una coincidencia (la
   misma búsqueda que el login, sin email).
   - Fallan con el **mismo** error `"Cannot send a friend request to this user"`: el usuario no existe, eres tú, o ya
     sois amigos o ya hay una solicitud tuya pendiente. Así no se puede averiguar qué cuentas existen.
   - Si ya hay una solicitud pendiente **del otro hacia ti**, enviar la tuya la acepta: quedáis como amigos.
   - Límite: 200 amigos aceptados por cuenta (`"Friend limit reached"`) y 50 solicitudes enviadas pendientes.
2. **Aceptar o rechazar** solo lo puede hacer el destinatario de una solicitud pendiente.
3. **Cancelar** una solicitud enviada solo lo puede hacer quien la envió.
4. **Quitar amigo**: cualquiera de los dos.
5. Toda operación sobre otra fila, o sobre una que ya no existe, responde `404` con `"Friend request not found"`.

### Rutas REST (`/api/friends`, solo `USER`; un invitado recibe `403` como las demás rutas de cuenta)

| Ruta | Respuesta |
|---|---|
| `GET /api/friends` | `{friends: [{id, username, avatar, level, status}], incoming: [{id, from: {id, username, avatar}, createdAt}], outgoing: [{id, to: {…}, createdAt}]}`. `status` es la presencia (ver abajo). |
| `POST /api/friends/requests` con `{username}` | `201 {request}` o, si se aceptó una cruzada, `200 {friend}` |
| `POST /api/friends/requests/{id}/accept` | `200 {friend}` |
| `DELETE /api/friends/requests/{id}` | `204` (rechazar si eres destinatario, cancelar si eres remitente) |
| `DELETE /api/friends/{userId}` | `204` |

- Política de límite `friendRequests`: 20 `POST /api/friends/requests` por IP cada 15 min.
- OpenAPI y `frontend/src/lib/api-types.ts` se regeneran.

## Presencia

`application/friends/FriendPresence` calcula el estado de una cuenta en el momento:

- `OFFLINE`: no tiene ninguna conexión `/ws` abierta.
- `ONLINE`: conectada y fuera de una sala.
- `IN_ROOM`: en una sala sin partida en curso.
- `PLAYING`: en una sala con partida en curso.

Necesita dos fuentes:

- las conexiones abiertas por usuario, que salen de `WsSessions` detrás de un puerto nuevo `UserConnections`
  (`isOnline(userId)`, `send(userId, event, payload)` a todas sus conexiones);
- la sala de cada jugador, que sale de `RoomCoordinator` y su `store.roomForPlayer`.

**Avisos en vivo** (eventos de servidor nuevos en `packages/shared`, tipados en `ServerToClientEvents`):

- `friends:presence` `{userId, status}`: se envía a los amigos conectados cuando cambia el estado de una cuenta, al
  abrir o cerrar su última conexión, entrar o salir de una sala, o empezar o terminar una partida.
- `friends:changed` `{}`: se envía a los dos implicados al crear, aceptar, rechazar, cancelar o quitar. El cliente
  vuelve a pedir `GET /api/friends`.

Los avisos se envían fuera del lock de la sala, en segundo plano, igual que la persistencia de la sala.

## Invitaciones

- Comando WebSocket nuevo `room:invite` `{userId}` (ack como los demás).
- Requisitos:
  - el que invita está en una sala;
  - el invitado es amigo aceptado y está conectado;
  - la sala no está llena;
  - el invitado no está ya en esa sala.
- Errores (en inglés en el servidor; el cliente los traduce en `roomCode.ts`):
  - `"You are not in a room"`
  - `"Not a friend"`
  - `"Friend is offline"`
  - `"Already in this room"`
  - `"Room is full"`
- Límite: una invitación por pareja cada 30 s (`"Invitation already sent"`) y 10 por minuto por anfitrión.
- Evento al invitado, en todas sus conexiones: `friends:invite` `{inviteId, from: {id, username, avatar}, roomCode,
  gameName | null, expiresAt}`. Caduca a los 10 min. No se guarda en BD: si el invitado no está conectado, no se
  envía.
- **«Unirse»** usa el `room:join` existente con el código. Si la sala se cerró o se llenó, se muestra el error de
  siempre. Si el invitado está en otra sala, antes un `Dialog` pregunta *«Saldrás de tu sala actual. ¿Unirte a la
  sala de X?»*, y al confirmar hace `room:leave` y después `room:join`.
- El cliente descarta las invitaciones caducadas. Una invitación nueva del mismo amigo sustituye a la anterior.

## Interfaz

Componentes nuevos en `frontend/src/ui/` (antes, en la galería `/dev/ui`):

- `Drawer`: panel lateral con título, botón de cerrar y foco atrapado. A pantalla completa en móvil. Se cierra con
  Escape.
- `ActionToast`: variante del `Toast` existente con dos acciones (primaria y secundaria) y una variante `quiet` sin
  sonido. Mantiene el foco y el anuncio accesible.

Pantallas:

- **Placa «Amigos» en la cabecera** (`Layout.tsx`), solo para `USER`, con un `Badge` que cuenta las solicitudes
  recibidas. Abre el `Drawer` con estas secciones:
  1. «Añadir amigo»: `Field` «Nombre de usuario» y «Enviar solicitud». El éxito y el error se muestran en línea.
  2. «Solicitudes» recibidas, con «Aceptar» y «Rechazar».
  3. «Amigos», con su avatar, su nivel y su estado:
     - el orden es Jugando, En una sala, Conectado, Desconectado, y alfabético dentro de cada estado;
     - el menú de cada fila tiene «Quitar», que pide confirmación.
  4. «Enviadas», con «Cancelar».
- **En el lobby** (`RoomPage`, fase de lobby), cada amigo `ONLINE` o `IN_ROOM` que no esté ya en la sala muestra
  «Invitar». Al pulsarlo pasa a «Invitado» durante 30 s. Los errores van al aviso de la sala (un solo dueño por
  error).
- **Invitación recibida:** un `ActionToast` *«X te invita a su sala»* (más el minijuego si hay uno elegido), con
  «Unirse» y «Ahora no». Si estás jugando una partida usa la variante `quiet`.
- **Estado de la lista:** lo lleva un `FriendsProvider` (dentro de `RoomProvider`, que ya tiene el socket). Carga
  `GET /api/friends` al abrir la sesión y con cada `friends:changed`, y aplica cada `friends:presence` a la lista sin
  volver a pedirla.

Textos de estado: «Jugando», «En una sala», «Conectado», «Desconectado».

## Pruebas

- **Java (Testcontainers):**
  - todas las reglas de `FriendService`: solicitud cruzada, mismo error para los casos que no deben distinguirse,
    límites, permisos de aceptar, rechazar y cancelar, quitar, y borrado en cascada al borrar una cuenta;
  - las rutas y el `403` de un invitado;
  - el cálculo de presencia;
  - `room:invite`, con cada error, los límites y el evento recibido en todas las conexiones del invitado;
  - los avisos `friends:presence` al conectar y desconectar, entrar en una sala y empezar una partida;
  - la migración, en `FlywayMigrationsTest`.
- **Vitest:** `Drawer`, `ActionToast`, `FriendsProvider` (aplicar la presencia, descartar invitaciones caducadas,
  sustituir la del mismo amigo) y la traducción de errores.
- **Playwright** (`e2e/tests/amigos.spec.ts`), con dos cuentas registradas en dos contextos:
  1. A envía una solicitud a B; B ve el contador y la acepta; A ve a B «Conectado».
  2. A crea una sala e invita a B; B recibe el aviso en `/play`, pulsa «Unirse» y entra en la sala de A.
  3. Variante: B está en otra sala, confirma salir y entra.
  - Capturas del panel (vacío, con solicitudes, con amigos), del lobby con «Invitar» y del aviso, a los tres tamaños.
  - Nota de la rúbrica (≥ 19/24) para el panel y el aviso.
