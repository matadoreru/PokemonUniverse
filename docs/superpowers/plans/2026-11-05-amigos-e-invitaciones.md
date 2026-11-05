# Amigos e invitaciones: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** las cuentas registradas se añaden como amigas por nombre de usuario, ven el estado de sus amigos en vivo e invitan a un amigo conectado a su sala desde el lobby.

**Architecture:**
- Tabla `Friendship` (Flyway V7), `FriendService` con las reglas y rutas REST `/api/friends`.
- La presencia la calcula `FriendPresence` con un puerto `UserConnections`, implementado sobre `WsSessions`, y un puerto `RoomActivity`, que `RoomCoordinator` avisa. Se empuja por el `/ws` existente como `friends:presence` y `friends:changed`.
- Invitaciones con el comando `room:invite` y el evento `friends:invite`.
- Frontend: `FriendsProvider`, placa y `Drawer` en la cabecera, «Invitar» en el lobby y `ActionToast` para la invitación.

**Tech Stack:** Java 25, Micronaut 5, Micronaut Data JPA, Flyway, WebSocket nativo; React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-amigos-e-invitaciones-design.md`

## Global Constraints

- Solo cuentas `USER`. Un invitado recibe `401 {"error":"Registered account required"}` en `/api/friends*`, no ve la placa y no se le puede invitar.
- Una sola fila por pareja: índice único sobre `(LEAST(requesterId, addresseeId), GREATEST(requesterId, addresseeId))` y `CHECK (requesterId <> addresseeId)`. `status` vale `PENDING` o `ACCEPTED`. Rechazar, cancelar o quitar borra la fila.
- Errores de solicitud, idénticos para no revelar cuentas: `"Cannot send a friend request to this user"`. Otros errores: `"Friend limit reached"` (200 aceptados) y `"Too many pending requests"` (50 enviadas pendientes). Fila ajena o inexistente: `404 "Friend request not found"`.
- Búsqueda del destinatario: nombre de usuario exacto o, sin distinguir mayúsculas, si solo hay una coincidencia. Sin email.
- Presencia: `OFFLINE`, `ONLINE`, `IN_ROOM`, `PLAYING`. Textos: «Desconectado», «Conectado», «En una sala», «Jugando». Orden de la lista: Jugando, En una sala, Conectado, Desconectado, y alfabético dentro de cada estado.
- Eventos de servidor nuevos: `friends:presence {userId, status}`, `friends:changed {}` y `friends:invite {inviteId, from:{id, username, avatar}, roomCode, gameName|null, expiresAt}`. Comando nuevo: `room:invite {userId}`.
- Errores de `room:invite`: `"You are not in a room"`, `"Not a friend"`, `"Friend is offline"`, `"Already in this room"`, `"Room is full"` y `"Invitation already sent"` (30 s por pareja). Además, 10 por minuto por anfitrión. La invitación caduca a los 10 min y no se guarda.
- Límite REST `friendRequests`: 20 `POST /api/friends/requests` por IP cada 15 min.
- Las reglas de `AGENTS.md`: comentarios en Java en español, capa hexagonal, migración nueva, OpenAPI y tipos regenerados, UI solo con `frontend/src/ui/` (los componentes nuevos, primero en la galería `/dev/ui`), texto ≥ 13 px, objetivos táctiles ≥ 44 px, un solo dueño por error, Playwright a tres tamaños y rúbrica ≥ 19/24 en el commit de UI.
- Los avisos de presencia nunca se envían con el lock de una sala tomado: van a un ejecutor.

## Review Focus

1. **Una cuenta con varias pestañas:** cerrar una de ellas no la pone `OFFLINE`; solo la última. La invitación llega a todas sus pestañas. Test en la Task 4.
2. **Solicitud cruzada simultánea** (A→B y B→A a la vez): queda una sola fila `ACCEPTED`, sin error 500 por el índice único. Test en la Task 2.
3. **Borrar una cuenta con amistades:** las filas caen en cascada y el amigo deja de verla, sin errores al pedir la lista. Test en la Task 2.
4. **Invitar a un amigo que se desconecta justo entonces:** el error es `"Friend is offline"`, no una excepción, y no se envía nada. Test en la Task 5.
5. **«Unirse» con una invitación caducada o de una sala ya cerrada:** sale el error normal de `room:join`, traducido, en el aviso de la sala, y la invitación desaparece. Test en la Task 7.

---

### Task 1: Tabla y repositorio de amistades

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__amigos.sql`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/FriendshipEntity.java`
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/out/persistence/FriendshipRepository.java`
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/out/persistence/FriendshipRepositoryTest.java`

**Interfaces:**
- Produces:
  - `FriendshipEntity.create(String id, String requesterId, String addresseeId, Instant now)`: queda `PENDING`.
  - Getters `getId()`, `getRequesterId()`, `getAddresseeId()`, `getStatus()` (un `String`), `getCreatedAt()`, `getAcceptedAt()`.
  - `accept(Instant now)`.
  - `FriendshipRepository extends CrudRepository<FriendshipEntity, String>`, con estos métodos:
    - `Optional<FriendshipEntity> findPair(String a, String b)` busca en los dos sentidos;
    - `List<FriendshipEntity> findAllInvolving(String userId)`;
    - `long countAccepted(String userId)`;
    - `long countPendingSentBy(String userId)`.

- [ ] **Step 1: Escribir la migración** con la tabla, las FK `ON DELETE CASCADE`, el `CHECK` de estado y el de pareja, el índice único de la pareja (Global Constraints) e índices en `requesterId` y `addresseeId`.
- [ ] **Step 2: Tests que fallan:**
  - `pairIsFoundInBothDirections`;
  - `secondRowForSamePairViolatesUniqueIndex`: insertar B→A cuando existe A→B lanza `DataAccessException`;
  - `selfFriendshipViolatesCheck`;
  - `deletingAUserDeletesTheirFriendships`;
  - `countsAcceptedAndPendingSent`.
- [ ] **Step 3: Ejecutar** `cd backend && ./gradlew test --tests '*FriendshipRepositoryTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 4: Implementar** la entidad y el repositorio, siguiendo `PasswordResetTokenEntity` y su repositorio.
- [ ] **Step 5: Ejecutar** el test del Step 3 y `--tests '*FlywayMigrationsTest*' --tests '*SchemaBaselineTest*'`. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Tabla de amistades`.

### Task 2: Reglas de amistad

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/friends/FriendService.java`, `FriendView.java`, `FriendRequestView.java`, `FriendsOverview.java`, `FriendStatus.java` (enum)
- Create: `backend/src/main/java/es/pokemonuniverse/application/friends/FriendRequestException.java` (400) y `FriendNotFoundException.java` (404), registradas en el manejador de errores de aplicación como `InvalidResetLinkException`
- Test: `backend/src/test/java/es/pokemonuniverse/application/friends/FriendServiceTest.java`

**Interfaces:**
- Consumes: la Task 1, `UserRepository` y `UserExperienceReader` para el nivel. Para la búsqueda por usuario se reutiliza la parte de usuario de `AccountLookup`: hay que exponerla como `AccountLookup.findByUsername(String)` sin cambiar `find`.
- Produces:
  - `enum FriendStatus { OFFLINE, ONLINE, IN_ROOM, PLAYING }`.
  - `interface FriendStatusSource { FriendStatus statusOf(String userId); }`. La implementa la Task 4. Mientras tanto, los tests usan un falso.
  - Records:
    - `record FriendView(String id, String username, AvatarRef avatar, @Nullable Integer level, FriendStatus status)`;
    - `record FriendRequestView(String id, FriendView user, Instant createdAt)`;
    - `record FriendsOverview(List<FriendView> friends, List<FriendRequestView> incoming, List<FriendRequestView> outgoing)`.
  - En `FriendService`:
    - `overview(String userId): FriendsOverview`, con los amigos ordenados según las Global Constraints;
    - `sendRequest(String userId, String username): SendResult`. `SendResult` es un sealed con dos casos: `Requested(FriendRequestView)` y `BecameFriends(FriendView)`;
    - `accept(String userId, String requestId): FriendView`;
    - `decline(String userId, String requestId)`, que rechaza o cancela según quién lo pida;
    - `remove(String userId, String friendId)`;
    - `List<String> acceptedFriendIds(String userId)`;
    - `boolean areFriends(String a, String b)`.
  - Cada operación que cambia una amistad publica `FriendshipChanged(String a, String b)` mediante el puerto `FriendEvents { void changed(String a, String b); }`. La Task 4 lo implementa y, mientras tanto, un `@Secondary` sin efecto lo cubre.

- [ ] **Step 1: Tests que fallan** (Testcontainers, `FriendStatusSource` y `FriendEvents` falsos):
  - `requestThenAccept`: tras aceptar, los dos se ven en `friends`, `incoming` y `outgoing` quedan vacíos y `FriendEvents` recibe la pareja en las dos operaciones;
  - `sameErrorForUnknownSelfAlreadyFriendsAndDuplicate`: los cuatro casos lanzan `FriendRequestException` con el mismo mensaje;
  - `crossedRequestBecomesFriends`;
  - `concurrentCrossedRequestsEndAsOneAcceptedRow` (Review Focus 2): dos hilos y un `CyclicBarrier`; queda una fila `ACCEPTED` y ningún hilo lanza algo distinto de `BecameFriends` o `Requested`;
  - `usernameLookupIgnoresCaseWhenUnique`;
  - `onlyAddresseeAccepts`, `requesterCancelsAddresseeDeclines` y `strangerGets404`;
  - `removeWorksFromEitherSide`;
  - `limits`: 200 aceptados y 50 pendientes enviadas. Se crean con el repositorio directamente;
  - `overviewOrdersByStatusThenName`;
  - `deletedUserDisappearsFromOverview` (Review Focus 3).
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*FriendServiceTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** `sendRequest` es `@Transactional`:
  1. Bloquea con `PESSIMISTIC_WRITE` las dos filas de `User` en orden de id. Así se serializan las solicitudes cruzadas.
  2. Busca la pareja.
  3. Si hay una solicitud `PENDING` del otro hacia ti, la acepta.
  4. Si no, comprueba los límites e inserta.
  5. Si salta el índice único (`23505`), vuelve a leer la pareja y la trata como el caso que corresponda.
- [ ] **Step 4: Ejecutar** el test del Step 2 y `--tests '*AuthControllerTest*'`, por el cambio en `AccountLookup`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Reglas de amistad: solicitudes, aceptar, rechazar y quitar`.

### Task 3: Rutas REST de amigos

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/friends/FriendsController.java`, `SendFriendRequest.java`, y las respuestas `FriendsResponse`, `FriendRequestResponse` y `FriendResponse`
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/in/rest/ratelimit/RateLimitPolicy.java`
- Modify: `backend/src/test/java/es/pokemonuniverse/OpenApiSpecTest.java`, `backend/openapi/pokemon-universe.yml`, `frontend/src/lib/api-types.ts`, `frontend/src/lib/api-types.test.ts`, `frontend/src/lib/api-contract.ts`
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/in/rest/friends/FriendsControllerTest.java`, `RateLimitFilterTest.java`

**Interfaces:**
- Consumes: la Task 2.
- Produces: el contrato HTTP de la tabla «Rutas REST» de la spec, con exactamente esos códigos. `SendFriendRequest {username}` usa `@NotBlank` («Escribe el nombre de usuario»), `@Size(max = 24)` y `normalized()`, que recorta. `avatar` usa la misma forma que `UserResponse`. Los tipos de `api-contract.ts` se llaman `FriendsResponse`, `FriendRequestResponse` y `FriendResponse`.

- [ ] **Step 1: Tests que fallan:**
  - `guestGets401OnEveryRoute`;
  - `fullFlowOverHttp`: registrar A y B; A envía (`201`); B lista y ve `incoming`; B acepta (`200`); los dos listan; A quita (`204`); y la lista queda vacía;
  - `crossedRequestReturns200WithFriend`;
  - `unknownUserIs400WithGenericMessage`;
  - `foreignRequestIs404`;
  - `friendRequestsRateLimitIs20PerIp`, en `RateLimitFilterTest`.
- [ ] **Step 2: Ejecutar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** el controlador (`@ExecuteOn(BLOCKING)`; identidad obligatoria como `ProfileController`) y la política `friendRequests`.
- [ ] **Step 4: Regenerar el contrato:** `./gradlew syncOpenApi` y `npm run api:types -w @pokemon-universe/web`. Después, actualizar la lista de rutas de `OpenApiSpecTest` y de `api-types.test.ts`.
- [ ] **Step 5: Ejecutar** `./gradlew check`, `npm run typecheck` y `npx vitest run frontend/src/lib`. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Rutas de amigos`.

### Task 4: Presencia en vivo

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/friends/UserConnections.java` (puerto)
- Create: `backend/src/main/java/es/pokemonuniverse/adapters/in/ws/WsUserConnections.java`
- Create: `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomActivity.java` (puerto)
- Create: `backend/src/main/java/es/pokemonuniverse/application/friends/FriendPresence.java`: implementa `FriendStatusSource`, `FriendEvents` y `RoomActivity`
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/in/ws/WsSessions.java`: avisa al registrar y quitar conexiones
- Modify: `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java`: llama a `RoomActivity` en `broadcast(room)` con los ids de los miembros, y al quitar miembros o borrar salas con los ids que salen
- Modify: `packages/shared/src/room.ts`: `FriendStatus` y los eventos `friends:presence` y `friends:changed` en `ServerToClientEvents`
- Test: `backend/src/test/java/es/pokemonuniverse/application/friends/FriendPresenceTest.java` y `backend/src/test/java/es/pokemonuniverse/adapters/in/ws/FriendsWebSocketTest.java`

**Interfaces:**
- Consumes: la Task 2 (`acceptedFriendIds`, `FriendStatus`) y `RoomStore.roomForPlayer`, con `room.game` para distinguir `IN_ROOM` de `PLAYING`.
- Produces:
  - `UserConnections`: `boolean isOnline(String userId)` y `void send(String userId, String event, Object payload)`, que envía a todas las conexiones del usuario.
  - `RoomActivity`: `void changed(Collection<String> userIds)`, que no bloquea.
  - `FriendPresence`:
    - `statusOf(String userId)`;
    - `changed(String a, String b)`, que envía `friends:changed {}` a los dos;
    - `changed(Collection<String>)`, que recalcula el estado de esos usuarios en el ejecutor `BLOCKING`. Guarda el último estado conocido de cada uno y solo envía `friends:presence` a sus amigos conectados si el estado cambió;
    - `connectionOpened(String userId)` y `connectionClosed(String userId)`, que llama `WsSessions`.

- [ ] **Step 1: Tests que fallan** en `FriendPresenceTest` (con `UserConnections` falso y ejecutor síncrono):
  - `statusFollowsConnectionsAndRooms`: `OFFLINE` → `ONLINE` → `IN_ROOM` → `PLAYING` → `IN_ROOM` → `ONLINE` → `OFFLINE`;
  - `pushesOnlyOnChangeAndOnlyToConnectedFriends`;
  - `friendshipChangeNotifiesBoth`.
- [ ] **Step 2: Tests que fallan** en `FriendsWebSocketTest` (servidor real, dos usuarios amigos y clientes WebSocket como en `RoomWebSocketTest`):
  - `friendSeesOnlineThenInRoom`;
  - `closingOneOfTwoTabsKeepsOnline` (Review Focus 1);
  - `strangerReceivesNothing`.
- [ ] **Step 3: Ejecutar.** Esperado: FAIL.
- [ ] **Step 4: Implementar.** `WsUserConnections` usa el mapa de conexiones de `WsSessions`; hay que añadir `connectionsOf(String userId)`. Las llamadas a `RoomActivity` desde `RoomCoordinator` solo encolan trabajo (Global Constraints). Los tipos y eventos van en `packages/shared`.
- [ ] **Step 5: Ejecutar** los tests de este task, `--tests '*RoomCoordinatorTest*' --tests '*RoomWebSocketTest*'` y `npm run typecheck`. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Presencia de amigos en vivo`.

### Task 5: Invitar a la sala

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/application/friends/RoomInvitations.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/in/ws/RoomWebSocket.java`: `case "room:invite"`
- Modify: `packages/shared/src/room.ts`: `'room:invite'` en `ClientToServerEvents` y `friends:invite` en `ServerToClientEvents`
- Modify: `frontend/src/room/roomCode.ts`: traducciones en `ROOM_ERROR_TRANSLATIONS`
- Test: `backend/src/test/java/es/pokemonuniverse/application/friends/RoomInvitationsTest.java`, el `RoomWebSocketTest` ampliado y `frontend/src/room/roomCode.test.ts`

**Interfaces:**
- Consumes: la Task 2 (`areFriends`), la Task 4 (`UserConnections`, `statusOf`) y, de `RoomCoordinator`, un método nuevo de solo lectura `Optional<RoomSummary> roomOf(String playerId)`. `RoomSummary(code, memberIds, maxPlayers, gameName)` se lee dentro del lock de la sala.
- Produces:
  - `RoomInvitations.invite(AuthUser from, String userId): void`, que lanza `RoomException` con los mensajes de las Global Constraints;
  - el evento `friends:invite` con `inviteId` (UUID) y `expiresAt` (ahora + 10 min, en ISO).
- Traducciones:
  - «No estás en ninguna sala.»
  - «Solo puedes invitar a tus amigos.»
  - «Tu amigo no está conectado.»
  - «Ya está en tu sala.»
  - «La sala está llena.»
  - «Ya le has invitado; espera unos segundos.»

- [ ] **Step 1: Tests que fallan:**
  - `invitesConnectedFriendOnAllTabs` (Review Focus 1);
  - un test por cada error;
  - `offlineAtInviteTimeSendsNothing` (Review Focus 4);
  - `secondInviteWithin30sRejectedAfter30sAllowed`, con el reloj del test;
  - `tenPerMinutePerHost`;
  - en el WebSocket: `roomInviteAckAndEventOverWs`;
  - en Vitest: las seis traducciones.
- [ ] **Step 2: Ejecutar.** Esperado: FAIL.
- [ ] **Step 3: Implementar.** Los límites van en memoria, en mapas con caducidad, como `WsRateLimiter`.
- [ ] **Step 4: Ejecutar** los tests, `./gradlew check` y `npx vitest run frontend/src/room/roomCode.test.ts`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Invitar a un amigo a la sala`.

### Task 6: Componentes `Drawer` y `ActionToast`

**Files:**
- Create: `frontend/src/ui/Drawer.tsx`, `Drawer.module.css` y `Drawer.test.tsx`
- Create: `frontend/src/ui/ActionToast.tsx`, `ActionToast.module.css` y `ActionToast.test.tsx`
- Modify: `frontend/src/ui/index.ts` y `frontend/src/ui/dev/Gallery.tsx`

**Interfaces:**
- Produces:
  - `Drawer({ open, title, onClose, children, side?: 'right' })`:
    - usa `role="dialog"`, `aria-modal` y `aria-labelledby`;
    - lleva el foco al título al abrir, lo atrapa dentro, se cierra con Escape y devuelve el foco a quien lo abrió;
    - por debajo de `sm` ocupa toda la pantalla;
    - al entrar anima solo `transform` y `opacity`, y nada con `prefers-reduced-motion`.
  - `ActionToast({ title, text?, primary: { label, onClick }, secondary: { label, onClick }, quiet?: boolean, onExpire?, expiresAt? })`:
    - usa `role="alert"`, salvo con `quiet`, que usa `role="status"`;
    - las acciones son `Pill` de ≥ 44 px;
    - llama a `onExpire` al llegar `expiresAt`.

- [ ] **Step 1: Tests que fallan:**
  - `Drawer`: muestra el título, el botón de cerrar tiene nombre accesible y renderiza `role="dialog"`;
  - `ActionToast`: los dos botones, `role` según `quiet` y que no renderiza nada si `expiresAt` ya pasó.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/ui/Drawer.test.tsx frontend/src/ui/ActionToast.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar** con los tokens de `frontend/src/styles/tokens.css` y el estilo de `Dialog` y `Toast`. Después, añadir a la galería los estados: drawer abierto con contenido largo, toast normal y toast `quiet`.
- [ ] **Step 4: Ejecutar** los tests, `npm run typecheck` y `npm run lint`. Después, `npm run ui:check -- galeria`, si existe ese spec de la galería; si no, capturar `/dev/ui` con el spec que cubra la galería. Esperado: PASS y capturas revisadas.
- [ ] **Step 5: Commit** con el mensaje `Componentes Drawer y ActionToast en Arcade DS`.

### Task 7: Pantallas de amigos e invitación

**Files:**
- Create: `frontend/src/friends/FriendsContext.tsx` (`FriendsProvider` y `useFriends`), `frontend/src/friends/friends-state.ts` (reductor puro) y `friends-state.test.ts`
- Create: `frontend/src/friends/FriendsDrawer.tsx`, `FriendsButton.tsx` e `InviteToasts.tsx`
- Modify:
  - `frontend/src/room/RoomContext.tsx`: expone el socket a `FriendsProvider` mediante `useRoom().realtime`, o una función `subscribe`;
  - `frontend/src/components/Layout.tsx`: la placa para `USER`;
  - `frontend/src/room/Lobby.tsx`: «Invitar»;
  - `frontend/src/main.tsx` o `RoomSessionLayout.tsx`: monta el provider y los avisos.
- Test: `frontend/src/friends/friends-state.test.ts`

**Interfaces:**
- Consumes: las Tasks 3 a 6.
- Produces:
  - Estado puro en `friends-state.ts`:
    - `applyPresence(state, {userId, status})`;
    - `addInvite(state, invite, now)`, que sustituye la del mismo `from.id`;
    - `pruneInvites(state, now)`;
    - `sortFriends(list)`.
  - `useFriends()` devuelve `{ overview, pendingCount, invites, send(username), accept(id), decline(id), remove(userId), invite(userId), dismissInvite(inviteId) }`.

- [ ] **Step 1: Tests que fallan** en `friends-state.test.ts`:
  - la presencia actualiza y reordena;
  - una invitación nueva del mismo amigo sustituye a la anterior;
  - las caducadas se descartan;
  - `pendingCount` cuenta solo las recibidas.
- [ ] **Step 2: Ejecutar.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - `FriendsProvider` carga `GET /api/friends` al haber un `USER`, vuelve a cargar con `friends:changed` y aplica `friends:presence`.
  - `FriendsDrawer` lleva las cuatro secciones de la spec, con sus textos. «Quitar» pide confirmación con `Dialog`.
  - En el `Lobby`, cada amigo `ONLINE` o `IN_ROOM` que no esté ya en la sala muestra «Invitar», que pasa a «Invitado» durante 30 s. Los errores van a `roomActionErrorMessage` (un solo dueño).
  - `InviteToasts`:
    - muestra un `ActionToast` por invitación, con «Unirse» y «Ahora no», y `quiet` si la sala propia está en partida;
    - «Unirse» sin sala hace `joinRoom(code)` y navega a `/room`;
    - con sala, abre un `Dialog` («Saldrás de tu sala actual. ¿Unirte a la sala de X?») y, al confirmar, hace `leaveRoom` y después `joinRoom`;
    - un fallo de `joinRoom` lo muestra el aviso de la sala y quita la invitación (Review Focus 5).
- [ ] **Step 4: Ejecutar** `npm test`, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Lista de amigos en la cabecera e invitaciones desde el lobby`.

### Task 8: Flujo completo en Playwright, capturas y rúbrica

**Files:**
- Create: `e2e/tests/amigos.spec.ts`
- Modify: `e2e/src/helpers.ts`, si hace falta un helper (por ejemplo, `abrirAmigos(page)`)

**Interfaces:**
- Consumes: todo lo anterior, y de `e2e/src/helpers.ts`: `nuevaCuenta`, `registrarPorApi`, `borrarCuentas`, `comprobarBdE2E`, `capture`, `SIZES`, `createRoom` y `collectErrors`.

- [ ] **Step 1: Escribir el spec**, con dos contextos de navegador y dos cuentas por tamaño:
  1. A abre «Amigos» (captura `amigos-vacio`) y envía una solicitud a B por su nombre en mayúsculas.
  2. B ve el contador en la placa, abre el panel (captura `amigos-solicitud`) y acepta.
  3. A ve a B «Conectado» (captura `amigos-lista`).
  4. A crea una sala; en el lobby, B aparece con «Invitar» (captura `lobby-invitar`). A invita.
  5. B, en `/play`, ve el aviso (captura `invitacion`), pulsa «Unirse» y llega a `/room` con el mismo código que A.
  6. Variante: B en otra sala recibe la invitación, confirma salir y entra.
  7. Review Focus 5: A cierra su sala antes de que B pulse «Unirse», y B ve el error traducido.
  - En `afterAll`, `borrarCuentas`.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- amigos`. Esperado: PASS, con las capturas a tres tamaños y sin avisos de tamaños que falten.
- [ ] **Step 3: Revisar las capturas** y puntuar con `docs/visual-review.md` el panel de amigos, el lobby con «Invitar» y el aviso. Mínimo 19/24 cada uno y ningún criterio a 0.
- [ ] **Step 4: Verificación final:** `npm test`, `npm run typecheck`, `npm run lint` y `cd backend && ./gradlew check`. Esperado: todo en verde.
- [ ] **Step 5: Commit** con el mensaje `Amigos: flujo en Playwright y capturas (rúbrica: panel N/24, lobby N/24, aviso N/24)`.
