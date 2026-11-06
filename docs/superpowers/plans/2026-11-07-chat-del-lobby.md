# Chat del lobby: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** en el lobby, todos los jugadores de la sala (cuentas e invitados) se escriben mensajes cortos. El Host y el Co-host borran mensajes y silencian a jugadores, y un filtro básico tapa las palabrotas.

**Architecture:**
- El chat es estado de la sala, no del motor. `RoomChat` vive en `LiveRoom`, con el historial, los silenciados y el límite, y se toca solo con el lock de la sala.
- `RoomCoordinator` expone `sendChat`, `deleteChatMessage` y `setChatMute`, y envía el historial al unirse y al restaurar. `ChatFilter`, cargado de un fichero de recursos, filtra los mensajes.
- Por el `/ws` existente: las órdenes `room:chat:send`, `room:chat:delete` y `room:chat:mute`, todas con `current()`, y los eventos `room:chat:history`, `room:chat:message` y `room:chat:deleted`. Los mensajes no van en `RoomView`: solo `MemberView.chatMuted`.
- Frontend:
  - el estado del chat va en `RoomContext`, con un reductor puro mezclado por `seq`;
  - componentes `ChatLog` y `ChatComposer` en `ui/`;
  - `LobbyChat`, en la columna lateral desde 1024 px y como pestaña «Chat» por debajo;
  - una sola región viva en el lobby.

**Tech Stack:** Java 25, Micronaut 5, WebSocket nativo; React + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-chat-del-lobby-design.md`

## Global Constraints

- **Solo en la fase `LOBBY`.** Las tres órdenes fuera del lobby fallan con `"Chat is only available in the lobby"`. No se usa `assertLobby`.
- **Las tres órdenes pasan por `current()`** en `RoomWebSocket`: solo la conexión enganchada a la sala puede escribir o moderar.
- Escribe cualquier miembro, cuenta `USER` o `GUEST`.
- **Mensaje:** se normaliza así: cada `\p{Cc}` pasa a espacio, los espacios seguidos se juntan en uno y se recortan los extremos. Máximo **200** unidades UTF-16 tras normalizar (`String.length()` y `maxLength={200}`), contadas antes de filtrar.
- **Historial:** los **50** últimos mensajes en memoria (`RoomChat.HISTORY_LIMIT = 50`). Nunca en la BD. `seq` empieza en 1 y nunca se reutiliza.
- **Límite:** **45** envíos aceptados por jugador en cualquier ventana de **60 000 ms** (deslizante), con el `Clock` del coordinador. Un rechazo no cuenta. Va por id de jugador: dos conexiones de la misma cuenta comparten el cupo. `WsRateLimiter` no se toca.
- **Moderar (decisión del usuario, 2026-11-06):** permiso nuevo `MODERATE_CHAT`, del `HOST` y del `CO_HOST` (Java: `EnumSet.allOf` del Host y se añade al `EnumSet.of(...)` del Co-host; en shared, `HOST: ROOM_PERMISSIONS` y se añade a la lista de `CO_HOST`; no en `MEMBER`). Reglas que aplica el coordinador, además del permiso: nadie puede silenciar al Host; un Co-host no puede silenciar a otro Co-host (solo el Host); nadie se silencia a sí mismo (`"Cannot mute yourself"`); un Co-host puede borrar cualquier mensaje salvo los del Host (el autor es el Host en el momento de borrar). Los casos prohibidos nuevos responden `"No tienes permiso para realizar esta acción."`, el error de permisos que ya existe en el coordinador.
- **Silencio:** dura la sala y sobrevive a salir y volver a entrar. El Host nunca está silenciado: al pasar a Host, por traspaso manual o automático, se le quita. Silenciar no borra sus mensajes.
- **Filtro:** la lista está en `backend/src/main/resources/chat/palabras-filtradas.txt`, una palabra normalizada por línea, con `#` como comentario. La lista inicial es: `cabron`, `cabrona`, `cabronazo`, `capullo`, `coño`, `follar`, `gilipollas`, `hijoputa`, `imbecil`, `joder`, `jodido`, `jodida`, `mamon`, `maricon`, `mierda`, `pendejo`, `polla`, `puta`, `puto`, `subnormal`, `zorra`.
  - Busca palabras enteras con `[\p{L}\p{N}]+` sobre el texto original.
  - Normaliza cada palabra aparte: `toLowerCase(Locale.ROOT)` y `á é í ó ú ü` → `a e i o u`. **La `ñ` se conserva.**
  - Hay coincidencia con la palabra de la lista, o con la palabra más `s` o `es`.
  - Cada coincidencia se cambia por exactamente `***`.
- **Eventos de servidor:** `room:chat:history {roomInstanceId, messages}`, `room:chat:message {roomInstanceId, message}` y `room:chat:deleted {roomInstanceId, seq}`.
- **Órdenes:** `room:chat:send {text}`, `room:chat:delete {seq}` y `room:chat:mute {playerId, muted}`.
- **`ChatMessage`:** `{seq, authorId, authorName, text, sentAt}`.
- **Errores** y su traducción (en `ROOM_ERROR_TRANSLATIONS`):
  - `"Chat is only available in the lobby"`: «El chat solo está disponible en el lobby.»
  - `"Message is empty"`: «Escribe algo antes de enviarlo.»
  - `"Message is too long"`: «El mensaje no puede pasar de 200 caracteres.»
  - `"You are muted in this chat"`: «Un moderador te ha silenciado en el chat de esta sala.»
  - `"Too many chat messages"`: «Estás enviando mensajes muy rápido; espera unos segundos.»
  - `"Message not found"`: «Ese mensaje ya no está en el chat.»
  - `"Cannot mute yourself"`: «No puedes silenciarte a ti mismo.»
  - Además: un `muted` no booleano responde `"Invalid chat command"`, sin traducción; un `seq` no entero, `"Message not found"`; un jugador ausente, `"Player not found"` (ya existe).
- **Textos de la interfaz:**
  - panel «Chat» y campo «Escribe un mensaje»;
  - botón «Enviar» y botón de cada mensaje «Moderar el mensaje de X»;
  - diálogo «Mensaje de X», con «Eliminar mensaje», «Silenciar a X en el chat», «Quitar el silencio a X» y «Cancelar»;
  - en el menú de jugador, «Silenciar en el chat» y «Quitar el silencio del chat»;
  - chip «Silenciado» (nombre accesible «Silenciado en el chat»);
  - «Ver mensajes nuevos»;
  - para el silenciado: «Un moderador te ha silenciado en el chat de esta sala.»;
  - estado vacío: «Todavía no hay mensajes. Hablando es mejor: si podéis, usad también una llamada de voz (Discord, Zoom…)».
  - Pestañas en móvil: «Juegos», «Ajustes», «Modo» y «Chat». Sus nombres accesibles son «Minijuegos», «Configuración», «Modo y sesión» y «Chat».
- **Disposición:** desde 1024 px (`useMediaQuery('(min-width: 1024px)')`), el chat va en la columna lateral bajo «Jugadores», y los dos se reparten el alto con `flex: 1 1 0`. Por debajo, va en la cuarta pestaña «Chat», con un `Badge` de no leídos (tope «99+»). El panel se monta una sola vez.
- **Accesibilidad:**
  - una sola región viva en el lobby, `role="status"` `sr-only` siempre montada, dentro del contenedor principal y fuera de los `TabPanel`;
  - anuncia solo los mensajes de otros, nunca el historial ni los propios;
  - agrupa los que llegan en menos de 1 500 ms («N mensajes nuevos. El último, de X: …»);
  - el aviso «El host está reconectando» pierde su `role="status"`;
  - `ChatLog` no es región viva (sin `role="log"`).
- Las reglas de `AGENTS.md`:
  - comentarios en Java en español y capa hexagonal (`domain` sin Micronaut salvo `@Serdeable`, como `SessionGameSummary`);
  - UI solo con `frontend/src/ui/`; los componentes nuevos, primero en la galería `/dev/ui`;
  - texto ≥ 13 px y objetivos táctiles ≥ 44 px;
  - un solo dueño por error: todo fallo de orden va al aviso global de `RoomContext`, y la pantalla solo captura con `ignoreFailure`;
  - Playwright a tres tamaños y rúbrica ≥ 19/24 en el commit de UI.
- **Nada de suites completas; solo los tests de lo tocado.** Cada paso ejecuta solo los tests que nombra:
  - Java: `./gradlew test --tests '*X*'`;
  - web: `npx vitest run <ruta>`;
  - e2e: `npm run ui:check -- <spec>`.
  - `npm run typecheck` y `npm run lint` sí se ejecutan: no son suites de tests.
- No hay migración Flyway ni rutas REST nuevas, así que no se regenera el OpenAPI.

## Review Focus

1. **El historial no depende del orden de llegada.** `room:chat:history` puede llegar antes o después del ack de `room:join`, o mezclado con un `room:chat:message`: el cliente mezcla por `seq` sin repetir ni perder mensajes. Un evento de otra `roomInstanceId` se ignora. Test `historyBeforeAckAndDuplicatesMerge` en la Task 5.
2. **El límite es por jugador, no por conexión.** Recargar o cambiar de pestaña (otra conexión se engancha con `session:attach`) no reinicia el cupo: el 46.º mensaje en 60 s falla también desde la conexión nueva, y a los 60 s vuelve a entrar. La conexión que no está enganchada recibe el error de dos pestañas, por `current()`. Tests `twoConnectionsShareTheQuota` en la Task 3 y `rateWindowSlides` en la Task 2.
3. **El filtro no tapa palabras inocentes.** «año», «computadora», «disputa» y «Putalandia» se quedan; «PUTA», «Cabrón» y «cabrones» se tapan. Las posiciones se conservan con varias coincidencias seguidas. Test `ChatFilterTest` en la Task 1.
4. **El silencio no se esquiva y no bloquea al Host.** Salir y volver no lo quita, y al pasar a Host, por traspaso manual o automático, se quita. Tests `muteSurvivesLeaveAndRejoin` y `becomingHostClearsMute` en la Task 3.
5. **El Co-host modera, pero no al Host ni a otro Co-host.** Puede borrar y silenciar a miembros; no puede silenciar al Host ni a otro Co-host (solo el Host silencia a un Co-host), ni borrar mensajes del Host; nadie se silencia a sí mismo. Tests `coHostCanDeleteAndMuteMembers`, `coHostCannotMuteHostOrCoHost` y `coHostCannotDeleteHostMessages` en la Task 3.
6. **Una sola región viva y el historial que no se anuncia.** El lobby tiene exactamente un `[role="status"]` o `[aria-live]`. Cargar el historial no anuncia nada; un mensaje ajeno sí, y el propio no. Tests `announcer ignores history and own messages` en la Task 5 y `lobby has one live region` en la Task 7.

---

### Task 1: Filtro de palabras

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/room/ChatFilter.java`
- Create: `backend/src/main/resources/chat/palabras-filtradas.txt`
- Create: `backend/src/main/java/es/pokemonuniverse/config/ChatBeans.java`
- Test: `backend/src/test/java/es/pokemonuniverse/domain/room/ChatFilterTest.java` y `backend/src/test/java/es/pokemonuniverse/config/ChatBeansTest.java`

**Interfaces:**
- Produces:
  - `public final class ChatFilter`:
    - `public static final ChatFilter NONE`: lista vacía, que devuelve el texto igual;
    - `public ChatFilter(Collection<String> words)`;
    - `public static ChatFilter fromList(String content)`: parsea el fichero. Lanza `IllegalArgumentException` con el número de línea si una línea no es una sola palabra `[\p{L}\p{N}]+` ya normalizada;
    - `public String apply(String text)`;
    - `static String normalizeWord(String word)`.
  - `@Factory public class ChatBeans` con `@Singleton ChatFilter chatFilter()`, que lee `classpath:chat/palabras-filtradas.txt` en UTF-8. Si falta el fichero, falla el arranque.

- [ ] **Step 1: Tests que fallan** en `ChatFilterTest`:
  - `replacesWholeWordsWithThreeAsterisks`: «eres un capullo» da «eres un ***»;
  - `ignoresCaseAndAccents`: «PUTA», «Cabrón» y «JODÍDO»;
  - `matchesPluralsWithSOrEs`: «putas» y «cabrones»;
  - `keepsInnocentWords` (Review Focus 3): «año», «computadora», «disputa», «Putalandia» y «cono» se quedan; «COÑO» se tapa;
  - `keepsPositionsWithSeveralMatches`: «mierda,mierda y joder!» da «***,*** y ***!»;
  - `noneLeavesTextUntouched`;
  - `fromListSkipsCommentsAndBlankLines`;
  - `fromListRejectsTwoWordsOrAccentsWithLineNumber`.
- [ ] **Step 2: Test que falla** en `ChatBeansTest`, una prueba unitaria simple con `new ChatBeans().chatFilter()`, sin contexto de Micronaut: `loadsTheRealListAndFiltersOneOfItsWords`.
- [ ] **Step 3: Ejecutar** `cd backend && ./gradlew test --tests '*ChatFilterTest*' --tests '*ChatBeansTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 4: Implementar.**
  - `apply` usa un `Matcher` de `[\p{L}\p{N}]+` sobre el texto original y un `StringBuilder` con `appendReplacement` / `appendTail`, con `Matcher.quoteReplacement("***")`.
  - `normalizeWord` cambia carácter a carácter `á é í ó ú ü` y no usa `Normalizer.NFD`, porque rompería la `ñ`.
  - El fichero lleva una cabecera `#` en español que explica el formato y la lista de las Global Constraints.
- [ ] **Step 5: Ejecutar** el comando del Step 3. Esperado: PASS.
- [ ] **Step 6: Commit** con el mensaje `Chat del lobby: filtro de palabras`.

### Task 2: Estado del chat de la sala

**Files:**
- Create: `backend/src/main/java/es/pokemonuniverse/domain/room/ChatMessage.java`
- Create: `backend/src/main/java/es/pokemonuniverse/domain/room/RoomChat.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/room/LiveRoom.java`, para añadir `public final RoomChat chat = new RoomChat();`
- Modify: `backend/src/main/java/es/pokemonuniverse/domain/room/RoomPermission.java`, para añadir `MODERATE_CHAT` (en `HOST` por `allOf` y en `CO_HOST`; no en `MEMBER`)
- Test: `backend/src/test/java/es/pokemonuniverse/domain/room/RoomChatTest.java`

**Interfaces:**
- Consumes: la Task 1 (`ChatFilter`).
- Produces:
  - `@Serdeable public record ChatMessage(long seq, String authorId, String authorName, String text, long sentAt)`.
  - `public final class RoomChat`:
    - constantes: `HISTORY_LIMIT = 50`, `MAX_LENGTH = 200`, `RATE_LIMIT = 45` y `RATE_WINDOW_MS = 60_000L`;
    - constantes de error `EMPTY`, `TOO_LONG`, `MUTED`, `RATE_LIMITED`, `NOT_FOUND` y `CANNOT_MUTE_SELF`, con los textos en inglés de las Global Constraints;
    - `public ChatMessage post(String authorId, String authorName, @Nullable String rawText, boolean authorIsHost, long now, ChatFilter filter)`;
    - `public void delete(long seq)`;
    - `public @Nullable ChatMessage find(long seq)`, para que el coordinador sepa quién escribió el mensaje antes de borrarlo;
    - `public boolean isMuted(String playerId)`;
    - `public void setMuted(String playerId, boolean muted)`;
    - `public List<ChatMessage> history()`, una copia inmutable de más antiguo a más nuevo;
    - `static String normalize(String raw)`.
  - `public static final class Rejected extends RuntimeException` (dentro de `RoomChat`), con el texto como mensaje.

- [ ] **Step 1: Tests que fallan** en `RoomChatTest`:
  - `normalizesControlCharsAndSpaces`: «  hola\n\tque  tal » da «hola que tal»;
  - `rejectsEmptyAndNull`;
  - `acceptsExactly200AndRejects201`, contados tras normalizar;
  - `appliesFilterAfterLengthCheck`;
  - `keepsLast50AndSeqKeepsGrowing`: tras 55 envíos, `history()` tiene `seq` del 6 al 55;
  - `rateWindowSlides` (Review Focus 2): 45 envíos en `t`, el 46.º en `t + 59_999` falla, en `t + 60_000` entra, y un rechazo no ocupa hueco;
  - `mutedAuthorIsRejectedUnlessHost`;
  - `checkOrderEmptyBeforeMuted`;
  - `deleteRemovesAndUnknownSeqFails`;
  - `setMutedTogglesAndIsIdempotent`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*RoomChatTest*' --tests '*PresenceTest*'`. Esperado: FAIL de compilación.
- [ ] **Step 3: Implementar.**
  - El historial es un `ArrayDeque<ChatMessage>`.
  - El límite es un `Map<String, ArrayDeque<Long>>` por autor: antes de comprobar, se quitan las horas de `now - RATE_WINDOW_MS` o anteriores.
  - Los silenciados son un `LinkedHashSet<String>` y el contador es `long nextSeq = 1`.
  - Javadoc en español: la clase solo se usa con el lock de la sala.
- [ ] **Step 4: Ejecutar** el comando del Step 2. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Chat del lobby: historial, límite y silencio de la sala`.

### Task 3: Órdenes del chat en el coordinador

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomCoordinator.java`
- Modify: `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomView.java`: `MemberView` gana `boolean chatMuted`, como último campo
- Modify: `backend/src/main/java/es/pokemonuniverse/application/rooms/RoomViews.java`: `room.chat.isMuted(id)`
- Test: `backend/src/test/java/es/pokemonuniverse/application/rooms/RoomChatCoordinatorTest.java`

**Interfaces:**
- Consumes: las Tasks 1 y 2, y `RoomTestKit` (`manager`, `events`, `time`, `room(...)`, `guest(...)`).
- Produces, en `RoomCoordinator`:
  - `@Inject void useChatFilter(ChatFilter filter)`: inyección por método, como `useExperience`. Por defecto vale `ChatFilter.NONE`.
  - `public void sendChat(String playerId, @Nullable JsonNode text)`: si `text` no es una cadena, cuenta como `null`. Envía `room:chat:message` con `ChatEvents.Message(roomInstanceId, message)` a cada miembro con `connectionId` y presencia distinta de `LEFT`.
  - `public void deleteChatMessage(String actorId, @Nullable JsonNode seq)`: exige `MODERATE_CHAT`, rechaza con «No tienes permiso para realizar esta acción.» que un Co-host borre un mensaje del Host (`room.chat.find(seq)` y el Host actual) y envía `room:chat:deleted`.
  - `public void setChatMute(String actorId, @Nullable String playerId, @Nullable JsonNode muted)`: exige `MODERATE_CHAT`; rechaza con «No tienes permiso para realizar esta acción.» silenciar al Host, o a otro Co-host siendo Co-host (solo el Host silencia a un Co-host); `"Cannot mute yourself"` al silenciarse a uno mismo; y después hace `broadcast(room)`.
  - Records `@Serdeable` en `application/rooms/ChatEvents.java`:
    - `ChatEvents.History(String roomInstanceId, List<ChatMessage> messages)`;
    - `ChatEvents.Message(String roomInstanceId, ChatMessage message)`;
    - `ChatEvents.Deleted(String roomInstanceId, long seq)`.
    - `roomInstanceId` es `room.historyId`, el mismo valor que `RoomView.roomInstanceId`.
  - `room:chat:history` se envía a la conexión del jugador:
    - en `join`, tras añadirlo o recuperarlo, dentro del lock;
    - en `restore`, justo después de `session:restored`.
  - En las dos ramas de traspaso (`transferHost(LiveRoom)` y `transferHost(String, String)`), `room.chat.setMuted(nuevoHost, false)`.
  - Las tres órdenes van con `inRequiredRoom`. Comprueban `room.phase == LOBBY` (si no, `RoomException("Chat is only available in the lobby")`) y convierten `RoomChat.Rejected` en `RoomException` con el mismo mensaje.

- [ ] **Step 1: Tests que fallan** en `RoomChatCoordinatorTest`:
  - `sendReachesEveryConnectedMemberFiltered`: el host y dos invitados reciben el mismo `ChatEvents.Message`, con `seq` 1 y el texto filtrado (con `useChatFilter(new ChatFilter(List.of("caca")))`);
  - `chatOutsideLobbyIsRejected`: en partida, las tres órdenes fallan con `"Chat is only available in the lobby"`;
  - `deleteReachesEveryone` (todos los miembros reciben `room:chat:deleted`);
  - `coHostCanDeleteAndMuteMembers` (Review Focus 5): un Co-host borra el mensaje de un miembro y silencia y quita el silencio a un miembro; un miembro sin rol recibe «No tienes permiso para realizar esta acción.» al borrar y al silenciar;
  - `coHostCannotMuteHostOrCoHost` (Review Focus 5): un Co-host recibe «No tienes permiso para realizar esta acción.» al silenciar al Host y a otro Co-host; el Host sí silencia a un Co-host; nadie se silencia a sí mismo;
  - `coHostCannotDeleteHostMessages` (Review Focus 5): un Co-host recibe «No tienes permiso para realizar esta acción.» al borrar un mensaje del Host, y borra el de otro Co-host o el de un miembro; el Host borra cualquiera;
  - `muteBroadcastsChatMutedAndBlocksSending`: `room:state` con `chatMuted: true`, y el silenciado recibe `"You are muted in this chat"`;
  - `cannotMuteYourselfAndUnknownPlayer` (el Host tampoco se silencia a sí mismo);
  - `muteSurvivesLeaveAndRejoin` (Review Focus 4);
  - `becomingHostClearsMute` (Review Focus 4), con traspaso manual y con el automático, cuando el host se desconecta y vence la gracia;
  - `historyOnJoinAndOnRestore`: el que entra recibe `room:chat:history` con los mensajes previos; tras `disconnect` y `attach` con otra conexión, lo vuelve a recibir;
  - `twoConnectionsShareTheQuota` (Review Focus 2): el mismo jugador envía 25 mensajes, hace `attach` con otra conexión, envía 20 más, y el 46.º falla; a los 60 s, entra;
  - `invalidMutedAndSeqPayloads`.
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*RoomChatCoordinatorTest*'`. Esperado: FAIL.
- [ ] **Step 3: Implementar** según las Interfaces. Los envíos usan `events.sendToMember` dentro del lock, que no bloquea.
- [ ] **Step 4: Ejecutar** `./gradlew test --tests '*RoomChatCoordinatorTest*' --tests '*RoomExperienceTest*' --tests '*RoomCoordinatorTest*'`. El último porque cambian `join`, `restore` y el traspaso del Host, y porque `MemberView` tiene un campo más: `RoomCoordinatorTest` comprueba las claves de los miembros (`sessionPoints`, `level`), así que se añade `chatMuted` donde las enumera. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Chat del lobby: enviar, borrar y silenciar en la sala`.

### Task 4: Transporte `/ws` y contrato compartido

**Files:**
- Modify: `backend/src/main/java/es/pokemonuniverse/adapters/in/ws/RoomWebSocket.java`: tres `case` con `current()`
- Modify: `packages/shared/src/room.ts`:
  - `MODERATE_CHAT` en `ROOM_PERMISSIONS` y en la lista de `CO_HOST` de `ROOM_ROLE_PERMISSIONS`;
  - `RoomMemberView.chatMuted?: boolean`;
  - el tipo `ChatMessage`;
  - las tres órdenes en `ClientToServerEvents` y los tres eventos en `ServerToClientEvents`.
- Modify: `packages/shared/src/room.test.ts`
- Modify: `frontend/src/room/roomCode.ts`: las traducciones y `chat: 'backend/src/main/java/es/pokemonuniverse/domain/room/RoomChat.java'` en `SERVER_MESSAGE_SOURCES`; el comentario de `ROOM_ERROR_TRANSLATIONS` lista los textos nuevos
- Modify: `frontend/src/room/roomCode.test.ts`
- Modify: `docs/architecture.md`, con un párrafo «Chat del lobby» junto a «Conexión abierta frente a asiento»: eventos, historial al unirse y al restaurar, nada en BD
- Test: `backend/src/test/java/es/pokemonuniverse/adapters/in/ws/RoomChatWebSocketTest.java`

**Interfaces:**
- Consumes: la Task 3.
- Produces:
  - En `RoomWebSocket.dispatch`:
    - `case "room:chat:send" -> current(connection, () -> coordinator.sendChat(playerId, field(payload, "text")))`;
    - `case "room:chat:delete" -> current(connection, () -> coordinator.deleteChatMessage(playerId, field(payload, "seq")))`;
    - `case "room:chat:mute" -> current(connection, () -> coordinator.setChatMute(playerId, text(payload, "playerId"), field(payload, "muted")))`.
  - En `room.ts`:
    - `export interface ChatMessage { seq: number; authorId: string; authorName: string; text: string; sentAt: number }`;
    - `'room:chat:send': (payload: { text: string }, ack: SocketAck) => void`;
    - `'room:chat:delete': (payload: { seq: number }, ack: SocketAck) => void`;
    - `'room:chat:mute': (payload: { playerId: string; muted: boolean }, ack: SocketAck) => void`;
    - `'room:chat:history': (payload: { roomInstanceId: string; messages: ChatMessage[] }) => void`;
    - `'room:chat:message': (payload: { roomInstanceId: string; message: ChatMessage }) => void`;
    - `'room:chat:deleted': (payload: { roomInstanceId: string; seq: number }) => void`.
  - `export const CHAT_MESSAGE_MAX_LENGTH = 200` en `room.ts`, para el cliente.

- [ ] **Step 1: Tests que fallan:**
  - `RoomChatWebSocketTest`, con un servidor real y clientes como en `FriendsWebSocketTest`:
    - `sendAckAndMessageReachBothSockets`;
    - `joinerReceivesHistory`;
    - `hostDeletesAndMutesOverWs`;
    - `notAttachedConnectionGetsTwoTabsError`: una segunda conexión de la misma cuenta, sin `session:attach`, recibe «Estás jugando en dos pestañas…».
  - En `room.test.ts`: `MODERATE_CHAT` es del Host y del Co-host, y no del miembro.
  - En `roomCode.test.ts`: las siete traducciones, y que cada texto aparece en `RoomChat.java` (el test ya lee `SERVER_MESSAGE_SOURCES`).
- [ ] **Step 2: Ejecutar** `./gradlew test --tests '*RoomChatWebSocketTest*'` y `npx vitest run packages/shared/src/room.test.ts frontend/src/room/roomCode.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Tras cambiar `packages/shared`, ejecutar `npm run build -w @pokemon-universe/shared`: el frontend importa `@pokemon-universe/shared/public`, que apunta a `dist/` (`public.ts` ya reexporta `room.ts`).
- [ ] **Step 4: Ejecutar** los comandos del Step 2, `./gradlew test --tests '*RoomWebSocketTest*'` y `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Chat del lobby: órdenes y eventos por el /ws`.

### Task 5: Estado del chat en el cliente

**Files:**
- Create: `frontend/src/room/chat/chat-state.ts` y `chat-state.test.ts`
- Create: `frontend/src/room/chat/chat-announcer.ts` y `chat-announcer.test.ts`
- Create: `frontend/src/hooks/useMediaQuery.ts` y `useMediaQuery.test.ts`
- Modify: `frontend/src/room/RoomContext.tsx`

**Interfaces:**
- Consumes: la Task 4 (los tipos de `room.ts`).
- Produces:
  - En `chat-state.ts`:
    - `interface ChatState { roomInstanceId: string | null; messages: ChatMessage[] }`;
    - `EMPTY_CHAT: ChatState`;
    - `syncInstance(state, roomInstanceId: string | null): ChatState`: vacía el estado si cambia la instancia, y lo deja igual (misma referencia) si no;
    - `applyHistory(state, payload): ChatState`: si el estado no tiene instancia, la toma del payload. Si la tiene y es otra, ignora el payload. Mezcla por `seq`, ordena y se queda con los 50 mayores;
    - `applyMessage(state, payload): ChatState`, con las mismas reglas y sin repetir `seq`;
    - `applyDeleted(state, payload): ChatState`.
  - En `chat-announcer.ts`:
    - `const ANNOUNCE_GROUP_MS = 1500`;
    - `announcement(pending: ChatMessage[]): string`, que da «Ana: hola» con uno y «3 mensajes nuevos. El último, de Ana: hola» con varios;
    - `class ChatAnnouncer { constructor(selfId: string, onText: (text: string) => void, schedule = window.setTimeout); seen(messages: ChatMessage[], fromHistory: boolean): void; dispose(): void }`. Con `fromHistory`, solo marca los mensajes como vistos. Los propios no se anuncian. Agrupa durante `ANNOUNCE_GROUP_MS`.
  - `useMediaQuery(query: string): boolean`: con `useSyncExternalStore`, así el primer render ya lee el valor real (el escritorio no pinta primero cuatro pestañas para luego mover el chat). Da `false` sin `window.matchMedia` (SSR y jsdom). Se suscribe a `change`.
  - `useRoom()` gana:
    - `chat: ChatMessage[]`;
    - `chatHistoryVersion: number`, que sube con cada `room:chat:history` aplicado, para que el anunciador distinga historial de mensajes en vivo;
    - `sendChat(text: string): Promise<void>`;
    - `deleteChatMessage(seq: number): Promise<void>`;
    - `setChatMute(playerId: string, muted: boolean): Promise<void>`.
    - Las tres órdenes van con `emit` y aviso global.
  - `RoomContext` llama a `syncInstance` **de forma síncrona en los mismos manejadores que fijan la sala**: `room:state`, `session:restored`, los acks de `createRoom` y `joinRoom`, `leaveRoom`, `room:kicked` y el cierre por cambio de cuenta. Nunca desde un `useEffect`: si el historial de la sala B llegara mientras el estado aún dice A, se descartaría. También escucha los tres eventos del socket.

- [ ] **Step 1: Tests que fallan:**
  - `chat-state.test.ts`:
    - `historyBeforeAckAndDuplicatesMerge` (Review Focus 1): el historial llega antes de la sala; después llega un mensaje repetido y otro nuevo; queda un `seq` de cada;
    - `otherInstanceIsIgnored`;
    - `capsAt50`;
    - `deletedRemoves`;
    - `syncToNullEmpties`;
    - `historyOfNewRoomAfterSyncIsKept`: `syncInstance(B)` y después el historial de B, en ese orden o en el contrario, deja los mensajes de B;
    - `phaseChangeKeepsChat`: la misma `roomInstanceId` de `LOBBY` a partida y de vuelta a `LOBBY` conserva los mensajes (el estado vive en `RoomContext`, por encima del `Lobby`).
  - `chat-announcer.test.ts` (con temporizadores falsos):
    - `announcer ignores history and own messages` (Review Focus 5);
    - uno solo se anuncia como «Ana: hola»;
    - tres en menos de 1,5 s salen en un solo anuncio;
    - `remount marks existing messages as seen`: un `ChatAnnouncer` nuevo cuyo primer `seen` trae mensajes ya existentes (el `Lobby` se vuelve a montar tras una partida) no anuncia nada.
  - `useMediaQuery.test.ts`: `false` sin `matchMedia`, y sigue al evento `change`.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/room/chat frontend/src/hooks/useMediaQuery.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** En `RoomContext`, el chat es un `useState<ChatState>` y cada evento hace `setChat((state) => applyX(state, payload))`. Se vacía en los mismos sitios que la sala: `room:kicked`, `leaveRoom` y el cierre del socket por cambio de cuenta.
- [ ] **Step 4: Ejecutar** el comando del Step 2, `npx vitest run frontend/src/room/session-attachment.test.ts frontend/src/room/optimistic-room.test.ts` y `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Chat del lobby: estado del chat en el cliente`.

### Task 6: Componentes `ChatLog` y `ChatComposer`

**Files:**
- Create: `frontend/src/ui/ChatLog.tsx`, `ChatLog.module.css` y `ChatLog.test.tsx`
- Create: `frontend/src/ui/ChatComposer.tsx`, `ChatComposer.module.css` y `ChatComposer.test.tsx`
- Modify: `frontend/src/ui/index.ts` y `frontend/src/ui/dev/Gallery.tsx`

**Interfaces:**
- Produces:
  - `interface ChatLogItem { id: string; author: string; authorTone?: string; time: string; text: string; own: boolean }`. `authorTone` es el color de jugador, un token.
  - `ChatLog({ items, label, empty, onModerate?: (id: string) => void, moderateLabel?: (item: ChatLogItem) => string, newMessagesLabel = 'Ver mensajes nuevos', className? })`:
    - es una `ol` con `aria-label={label}`, sin `role="log"` ni `aria-live`;
    - el autor se trunca con `title`, y el texto usa `overflow-wrap: anywhere`;
    - el botón de moderar es una `Pill` de icono de 44 × 44 px, con `aria-label={moderateLabel(item)}`;
    - baja solo al final si estaba a ≤ 48 px; si no, muestra la `Pill` «Ver mensajes nuevos»;
    - el desplazamiento es suave solo sin `prefers-reduced-motion`.
  - `ChatComposer({ value, onChange, onSubmit, label, maxLength, busy?, disabledReason?: string | null, counterFrom = 160 })`:
    - es un `form` con `Field` (`maxLength`, `enterKeyHint="send"`, `autoComplete="off"`) y una `Pill` de icono «Enviar», con `type="submit"` y 44 px;
    - `onSubmit` solo se llama si `value.trim()` no está vacío y no está `busy`;
    - el contador «n/max» aparece desde `counterFrom`, con `aria-describedby`;
    - con `disabledReason`, muestra el motivo en `text-15` en lugar del campo y del botón.
  - Exporta los dos componentes y sus `…Props` desde `ui/index.ts`.

- [ ] **Step 1: Tests que fallan:**
  - `ChatLog`:
    - renderiza el estado vacío sin mensajes;
    - no tiene `role="log"` ni `aria-live`;
    - el botón de moderar aparece solo con `onModerate` y con su nombre accesible;
    - «Tú» en el propio.
  - `ChatComposer`:
    - Intro envía;
    - con texto en blanco no envía;
    - el contador aparece en 160 y no antes;
    - `disabledReason` sustituye al campo;
    - `busy` bloquea el segundo envío.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/ui/ChatLog.test.tsx frontend/src/ui/ChatComposer.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar** con los tokens de `frontend/src/styles/tokens.css` y el estilo de `Row` y `Field`. Después, añadir a la galería los estados de la spec («Componentes nuevos»):
  - `ChatLog` vacío, con mensajes variados, con moderar y con «Ver mensajes nuevos»;
  - `ChatComposer` normal, cerca del límite, `busy` y silenciado.
- [ ] **Step 4: Ejecutar** los tests del Step 2, `npx vitest run frontend/src/ui/dev/Gallery.test.tsx frontend/src/styles/global-classes.test.ts`, `npm run typecheck`, `npm run lint` y `npm run ui:check -- galeria`. Esperado: PASS, y las capturas de la galería revisadas.
- [ ] **Step 5: Commit** con el mensaje `Componentes ChatLog y ChatComposer en Arcade DS`.

### Task 7: Chat en el lobby

**Files:**
- Create: `frontend/src/room/chat/LobbyChat.tsx`, `LobbyChat.module.css` y `LobbyChat.test.tsx`
- Modify: `frontend/src/room/Lobby.tsx` y `Lobby.module.css`, para la columna, la pestaña, la región viva y quitar la nota de la columna
- Modify: `frontend/src/room/Lobby.test.tsx`
- Modify: `frontend/src/room/PlayerList.tsx` y `PlayerList.test.tsx`, para el chip «Silenciado» y la acción del `MemberMenu`
- Modify: `frontend/src/room/RoomPlayersPanel.tsx`, para pasar `onSetChatMute`
- Modify: `frontend/src/screens/RoomPage.tsx`, para pasar el chat y sus órdenes desde `useRoom()`

**Interfaces:**
- Consumes: las Tasks 5 y 6, `player-color.ts`, `Dialog`, `Panel`, `StateBox`, `Chip`, `Badge`, `Tabs` y `TabPanel`.
- Produces:
  - `LobbyChat({ messages, members, selfId, selfRole (el rol decide con `hasRoomPermission(selfRole, 'MODERATE_CHAT')` y con las reglas del Co-host), onSend(text): Promise<void>, onDelete(seq): Promise<void>, onSetMute(playerId, muted): Promise<void>, titleRef?, className? })`:
    - el `Panel` «Chat» con `ChatLog` y `ChatComposer`;
    - el borrador es local;
    - `ignoreFailure` en los tres `catch`;
    - un `Dialog` «Mensaje de X»;
    - tras eliminar, el foco va al título del panel con `window.setTimeout(…, 0)`.
  - Props nuevas de `Lobby`: `chat: ChatMessage[]`, `chatHistoryVersion: number`, `onSendChat`, `onDeleteChatMessage` y `onSetChatMute`.
  - `Lobby`:
    - `LobbyTab` pasa a `'games' | 'config' | 'session' | 'chat'`;
    - `const wide = useMediaQuery('(min-width: 1024px)')`;
    - con `wide`, `LobbyChat` va en `side`, bajo `RoomPlayersPanel`, y no hay pestaña «Chat»;
    - sin `wide`, hay una cuarta pestaña con `badge` de no leídos;
    - si `wide` pasa a `true` con `activeTab === 'chat'`, vuelve a `'games'`.
  - Etiquetas de pestaña, con el mismo corte que la pestaña «Chat» (1024 px), para que las cuatro quepan en todo el tramo de 390 a 1023 px: `<><span className="lg:hidden" aria-hidden="true">Juegos</span><span className="max-lg:sr-only">Minijuegos</span></>`, lo mismo con «Ajustes» / «Configuración», y «Modo» / «Modo y sesión» pasa de `max-sm:sr-only` a `max-lg:sr-only`.
  - **Al montarse el `Lobby`** (también al volver de una partida, porque el `Lobby` se desmonta mientras se juega), todo lo que ya hay en `chat` cuenta como visto: no se anuncia ni suma no leídos. Un `room:chat:history` tampoco suma nunca no leídos: solo los `room:chat:message` de otros que llegan con el `Lobby` montado y la pestaña «Chat» cerrada.
  - Región viva: `<p className="sr-only" role="status" aria-live="polite">{announcement}</p>`:
    - dentro de `.main`, que es `position: relative`;
    - la alimenta un `ChatAnnouncer` y el aviso de reconexión del host, que pierde su `role="status"` y su `aria-live`.
  - `PlayerList`:
    - `onSetChatMute?(id: string, muted: boolean): void`;
    - el chip `MessageSquareOff` «Silenciado» se ve si `member.chatMuted`;
    - en `MemberMenu`, con la nueva prop `canMuteChat: boolean` (el actor tiene `MODERATE_CHAT` y esa persona no es el Host, ni él mismo, ni un Co-host si el actor es Co-host), va «Silenciar en el chat» o «Quitar el silencio del chat». No depende de `hostActions`: un Co-host la ve en los miembros sin rol.

- [ ] **Step 1: Tests que fallan:**
  - `LobbyChat.test.tsx`:
    - el silenciado ve el motivo y no el campo;
    - el Host y el Co-host ven «Moderar el mensaje de X» y un miembro no; el Co-host no lo ve en los mensajes del Host;
    - el diálogo del Co-host no ofrece silenciar al Host ni a otro Co-host (el del Host sí ofrece silenciar al Co-host);
    - el diálogo no ofrece silenciar en el mensaje propio;
    - el estado vacío lleva «Hablando es mejor».
  - `Lobby.test.tsx`:
    - sin `matchMedia` hay cuatro pestañas y la cuarta es «Chat»;
    - los nombres accesibles «Minijuegos» y «Configuración» se mantienen;
    - `lobby has one live region` (Review Focus 5): exactamente un `[role="status"], [aria-live]`, también con el host reconectando;
    - la nota «Hablando es mejor» sigue en el marcado, ahora en el estado vacío;
    - `remount with existing messages shows no unread`: montar el `Lobby` con mensajes ya en `chat` deja el `Badge` de «Chat» sin número y la región viva vacía.
  - `PlayerList.test.tsx`: el chip con `chatMuted`, y la acción del menú solo para el host.
- [ ] **Step 2: Ejecutar** `npx vitest run frontend/src/room/chat/LobbyChat.test.tsx frontend/src/room/Lobby.test.tsx frontend/src/room/PlayerList.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - En `Lobby.module.css`, desde `lg`: `.side` es una columna flexible y los dos paneles llevan `flex: 1 1 0; min-height: 0`. Se borran `.tip`, `.tipIcon` y `.tipTitle` si quedan sin uso.
  - El color del autor sale de `player-color.ts` por id de miembro. Si el autor ya salió de la sala, va en neutro.
  - Los no leídos cuentan los mensajes de otros con `seq` mayor que el último visto mientras la pestaña «Chat» no está activa.
- [ ] **Step 4: Ejecutar** el comando del Step 2, `npx vitest run frontend/src/room/RoomSessionLayout.test.tsx frontend/src/room/SessionExperience.test.tsx`, `npm run typecheck` y `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit** con el mensaje `Chat en el lobby: panel, pestaña en el móvil y moderación del Host y del Co-host`.

### Task 8: Flujo completo en Playwright, capturas y rúbrica

**Files:**
- Create: `e2e/tests/chat.spec.ts`
- Modify: `e2e/src/helpers.ts`, si hace falta un helper (por ejemplo, `abrirChat(page)`, que pulsa la pestaña «Chat» solo por debajo de 1024 px, y `escribirEnChat(page, texto)`)

**Interfaces:**
- Consumes: todo lo anterior, y de `e2e/src/helpers.ts`: `SIZES`, `capture`, `collectErrors`, `loginAsGuest`, `uniqueName`, `createRoom`, `joinRoom`, `comprobarBdE2E`, `nuevaCuenta`, `registrarPorApi` y `borrarCuentas`.

- [ ] **Step 1: Escribir el spec.** `comprobarBdE2E()` al principio. Para cada tamaño de `SIZES`, el host es una **cuenta registrada** (`nuevaCuenta` y `registrarPorApi`, como `amigos.spec.ts`), así la columna lateral lleva también «Invitar amigos», que es su caso más alto a 1280×720. El otro jugador es un invitado (`loginAsGuest`). El host crea la sala con `createRoom` y el invitado entra con `joinRoom`. En `afterAll`, `borrarCuentas`:
  1. Los dos se escriben y cada uno ve el mensaje del otro. Captura `chat-lobby` a 1280 y 1920, y `chat-pestana` a 390, con la pestaña abierta. A 390, antes de abrir la pestaña, el `Badge` cuenta 1.
  2. Un tercer jugador entra y ve los mensajes anteriores.
  3. «eres un capullo» se ve como «eres un ***».
  4. El host abre «Moderar el mensaje de X» (captura `chat-moderar`), elimina, y el mensaje desaparece en las dos páginas.
  5. El host silencia al jugador desde el diálogo. El jugador ve «Un moderador te ha silenciado en el chat de esta sala.» (captura `chat-silenciado`) y el chip «Silenciado» en «Jugadores». El host quita el silencio desde «Gestionar a X».
  6. Solo a 1280×720: el jugador recarga la página en el lobby y vuelve a ver el historial (`session:attach` → `restore` → `room:chat:history`).
  7. Solo a 1280×720: 46 mensajes seguidos. El 46.º muestra en el aviso de la sala «Estás enviando mensajes muy rápido; espera unos segundos.».
  - Todas las capturas usan `capture()` con sus valores por defecto: sin scroll horizontal, sin scroll de documento, sin scroll del `main` en escritorio y `measureLayout` vacío a 13 px.
  - `collectErrors` vacío al final.
- [ ] **Step 2: Ejecutar** `npm run ui:check -- chat`, y después `npm run ui:check -- sala`, porque la columna y las pestañas del lobby cambian. Esperado: PASS, con las capturas a tres tamaños y sin avisos de tamaños que falten.
- [ ] **Step 3: Revisar las capturas** en `e2e/test-results/revision.html` y puntuar con `docs/visual-review.md` el lobby con chat (escritorio y móvil) y el diálogo de moderar. Mínimo 19/24 cada uno y ningún criterio a 0.
- [ ] **Step 4: Verificación final, solo de lo tocado:**
  - `cd backend && ./gradlew test --tests '*ChatFilterTest*' --tests '*ChatBeansTest*' --tests '*RoomChatTest*' --tests '*RoomChatCoordinatorTest*' --tests '*RoomChatWebSocketTest*' --tests '*RoomCoordinatorTest*' --tests '*RoomWebSocketTest*'`;
  - `npx vitest run frontend/src/room/chat frontend/src/ui/ChatLog.test.tsx frontend/src/ui/ChatComposer.test.tsx frontend/src/room/Lobby.test.tsx frontend/src/room/PlayerList.test.tsx frontend/src/room/roomCode.test.ts packages/shared/src/room.test.ts`;
  - `npm run typecheck` y `npm run lint`.
  - Esperado: todo en verde.
- [ ] **Step 5: Commit** con el mensaje `Chat del lobby: flujo en Playwright y capturas (rúbrica: lobby N/24, móvil N/24, moderar N/24)`.
