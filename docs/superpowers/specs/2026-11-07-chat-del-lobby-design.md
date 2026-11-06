# Chat del lobby

Fecha: 2026-11-07. Estado: decisiones del usuario cerradas en conversación; el resto, tomado por defecto y marcado
«Decisión tomada (revisable)»; las que el usuario ha cambiado al revisar, «Decisión del usuario (2026-11-06)». Pendiente de revisión escrita.

## Objetivo

Mientras esperan en el lobby, los jugadores de una sala pueden escribirse mensajes cortos. El anfitrión y el Co-host pueden borrar un
mensaje y silenciar a un jugador en el chat de su sala. Un filtro básico tapa las palabrotas más comunes.

**Criterio de éxito:** dos jugadores, uno registrado y otro invitado, se escriben en el lobby y cada uno ve el mensaje
del otro en menos de un segundo. Quien entra después, o recarga la página, ve los últimos 50 mensajes. El anfitrión borra
un mensaje y desaparece para todos. Silencia a un jugador y este ya no puede escribir; los demás lo ven marcado como
silenciado.

## Decisiones tomadas

Las del usuario (vinculantes):

- **Solo en el lobby.** No hay chat durante la partida ni en las pantallas de resultados.
- **Escribe todo el que está en la sala**, cuenta registrada o invitado.
- **Límites:** 200 caracteres por mensaje; historial de los últimos 50 mensajes **en memoria** mientras viva la sala (no se
  guarda en la BD); límite de mensajes por minuto y por jugador.
- **Sin reacciones con emoji.**
- **Moderación:** el Host y el Co-host borran un mensaje concreto y silencian a un jugador en el chat de esa sala. Un filtro básico
  cambia por `***` las palabras de una lista corta.

Las tomadas aquí:

- **Decisión del usuario (2026-11-06): moderan el Host y el Co-host.** Se crea el permiso `MODERATE_CHAT`, que tienen el
  `HOST` y el `CO_HOST` (el `MEMBER` no). Reglas, que son decisiones y se comprueban en el servidor:
  - nadie puede silenciar al Host;
  - un Co-host no puede silenciar a otro Co-host: solo el Host silencia a un Co-host;
  - un moderador no puede silenciarse a sí mismo;
  - un Co-host puede borrar cualquier mensaje salvo los del Host; el Host puede borrar cualquiera.
  «Mensaje del Host» es el de quien es Host en el momento de borrar. Los casos prohibidos nuevos (silenciar al Host o a
  otro Co-host siendo Co-host, y borrar un mensaje del Host siendo Co-host) responden con el error de permisos que ya
  existe, «No tienes permiso para realizar esta acción.». Silenciarse a uno mismo sigue con su error propio («No puedes
  silenciarte a ti mismo.»), igual que silenciar a un jugador desconocido.
- **Decisión del usuario (2026-11-06): límite de 45 mensajes por jugador en cualquier ventana de 60 s** (ventana deslizante). El
  límite se cuenta por jugador dentro de la sala, no por conexión: dos pestañas de la misma cuenta comparten el cupo. El
  límite general del `/ws` (50 eventos cada 10 s por conexión, `WsRateLimiter`) sigue igual.
- **Decisión tomada (revisable): el silencio dura lo que la sala** y se guarda por id de jugador. Si el jugador silenciado
  sale y vuelve a entrar, sigue silenciado. Solo se quita con «Quitar el silencio» o al cerrarse la sala.
- **Decisión tomada (revisable): el Host nunca está silenciado.** Si un jugador silenciado pasa a ser Host, por traspaso
  manual o automático (el Host anterior se desconecta), se le quita el silencio.
- **Decisión tomada (revisable): los mensajes de un jugador silenciado se quedan** en el historial. El anfitrión los borra
  uno a uno si quiere.
- **Decisión tomada (revisable): borrar quita el mensaje del todo**, en el servidor y en todas las pantallas, sin dejar un
  hueco «Mensaje eliminado».
- **Decisión tomada (revisable): sin mensajes de sistema** («Ana ha entrado»). El chat solo tiene lo que escriben los
  jugadores; las entradas y salidas ya se ven en la lista de jugadores.
- **Decisión tomada (revisable): sin eco optimista.** El mensaje propio aparece cuando vuelve del servidor, ya filtrado.
  Así todos ven el mismo texto, en el mismo orden.
- **Decisión tomada (revisable): los mensajes, fuera de `RoomView`.** Viajan en eventos propios (`room:chat:*`). Si
  fueran en `RoomView`, cada mensaje provocaría un `room:state` completo (revisión nueva, configuraciones y manifiestos)
  a cada miembro. En `RoomView` solo va si cada miembro está silenciado (`chatMuted`), porque la lista de jugadores lo
  enseña.
- **Arquitectura:** el chat es de la sala y no del motor (`MINIJUEGOS_MEJORAS.md` §8.4). Vive en `LiveRoom`, bajo el lock
  de la sala, y lo gestiona `RoomCoordinator`, como el resto de órdenes del lobby. No hay tablas ni migraciones nuevas.
- **Fuera de alcance:** chat durante la partida, canal «fantasma» de espectadores, reacciones, mensajes privados,
  menciones, enlaces clicables, editar mensajes, guardar el historial y denunciar mensajes.

## Modelo (`domain/room`)

`ChatMessage` (record, `@Serdeable`):

| Campo | Tipo | Nota |
|---|---|---|
| `seq` | `long` | Número de orden dentro de la sala: 1, 2, 3… Nunca se reutiliza. Es también el id del mensaje. |
| `authorId` | `String` | Id del jugador (cuenta o invitado). |
| `authorName` | `String` | `displayName` en el momento de enviar. Se conserva aunque el autor salga de la sala. |
| `text` | `String` | Ya normalizado y filtrado. |
| `sentAt` | `long` | Milisegundos del reloj del servidor (`Clock`). |

`RoomChat` (clase mutable, solo se toca con el lock de la sala; `LiveRoom` tiene `public final RoomChat chat`):

- historial: los últimos 50 `ChatMessage`; al entrar el 51.º sale el más antiguo;
- `mutedIds`: un conjunto de ids de jugador;
- por autor, las horas de sus envíos aceptados del último minuto (para el límite);
- el siguiente `seq`.

Sus reglas, que lanzan `RoomChat.Rejected` con el mensaje de error (el coordinador la convierte en `RoomException`):

1. **Normalizar** el texto recibido: cambiar cada carácter de control (`\p{Cc}`, incluidos los saltos de línea y los
   tabuladores) por un espacio, juntar los espacios seguidos en uno y recortar los extremos.
2. **Vacío** tras normalizar (o `text` que no es una cadena): `"Message is empty"`.
3. **Más de 200 caracteres** tras normalizar: `"Message is too long"`. Se cuentan unidades UTF-16 (`String.length()` en
   Java, `.length` y `maxLength` en el navegador), así el campo del cliente y el servidor miden igual. **Decisión tomada
   (revisable):** un emoji puede contar 2.
4. **Silenciado** (y no es el Host): `"You are muted in this chat"`.
5. **Límite**: si el autor ya tiene 45 envíos aceptados en los últimos 60 000 ms, `"Too many chat messages"`. Un envío
   rechazado no cuenta.
6. **Filtrar** (ver abajo) y guardar.

El orden de las comprobaciones es ese: un mensaje vacío de un silenciado responde «vacío».

## Filtro de palabras (`domain/room/ChatFilter`)

- **La lista** está en `backend/src/main/resources/chat/palabras-filtradas.txt`: una palabra por línea, UTF-8, con
  comentarios `#` y líneas vacías ignoradas. La lee `config/ChatBeans` al arrancar y crea un único `ChatFilter`.
  `RoomCoordinator` lo recibe por inyección por método (`useChatFilter`), como la experiencia y la presencia. Sin él usa
  `ChatFilter.NONE`, que no cambia nada: así los constructores de las pruebas no cambian.
- **Cómo compara:**
  - recorre el texto **original** con `[\p{L}\p{N}]+`: cada coincidencia es una palabra entera;
  - normaliza cada palabra por separado: minúsculas (`Locale.ROOT`) y sin tildes ni diéresis (`á é í ó ú ü` → `a e i o u`);
  - **la `ñ` se conserva**: si se quitara como una tilde más, «año» pasaría a «ano» y «coño» a «cono»;
  - hay coincidencia si la palabra normalizada es una de la lista, o una de la lista más `s` o `es` (plurales: «putas»,
    «cabrones»);
  - cada palabra que coincide se sustituye, en su posición del texto original, por exactamente `***`.
  - Como cada palabra se normaliza aparte, las posiciones del texto original no se mueven.
- **No hace más**, a propósito: no detecta letras repetidas («puuuta»), números en vez de letras ni palabras pegadas.
  Es básico, como pidió el usuario.
- **Lista inicial. Decisión tomada (revisable):** `cabron`, `cabrona`, `cabronazo`, `capullo`, `coño`, `follar`,
  `gilipollas`, `hijoputa`, `imbecil`, `joder`, `jodido`, `jodida`, `mamon`, `maricon`, `mierda`, `pendejo`, `polla`,
  `puta`, `puto`, `subnormal`, `zorra`. En el fichero se escriben ya normalizadas (sin tildes, con `ñ`). El cargador
  rechaza al arrancar una línea que no sea una sola palabra normalizada, así no entra una entrada que nunca coincidiría.

## Protocolo (`/ws`)

Órdenes nuevas del cliente. Todas pasan por `current()` en `RoomWebSocket`: solo la conexión enganchada a la sala puede
escribir y moderar, igual que el resto de órdenes del lobby (a diferencia de `room:invite`). Todas exigen la fase
`LOBBY`.

| Orden | Payload | Quién | Efecto |
|---|---|---|---|
| `room:chat:send` | `{text}` | cualquier miembro | `room:chat:message` a todos |
| `room:chat:delete` | `{seq}` | `MODERATE_CHAT` (el Co-host no borra los del Host) | `room:chat:deleted` a todos |
| `room:chat:mute` | `{playerId, muted}` | `MODERATE_CHAT` (no al Host, ni a uno mismo; el Co-host tampoco a otro Co-host) | `room:state` a todos (cambia `chatMuted`) |

Eventos nuevos del servidor (en `ServerToClientEvents`). Cada uno lleva el `roomInstanceId` de la sala, para que el
cliente descarte uno de una sala anterior:

| Evento | Payload | Cuándo |
|---|---|---|
| `room:chat:history` | `{roomInstanceId, messages}` | A una conexión: al unirse (`room:join`) y al engancharse con un asiento ya existente (`restore`, justo después de `session:restored`). Al crear la sala no se envía: el historial está vacío. |
| `room:chat:message` | `{roomInstanceId, message}` | A todos los miembros con conexión, al aceptar un envío. |
| `room:chat:deleted` | `{roomInstanceId, seq}` | A todos los miembros con conexión, al borrar. |

- Los eventos se envían con `RoomEvents.sendToMember`, dentro del lock de la sala, como `room:state`. No bloquean.
- **El historial no depende del orden de llegada:** el cliente mezcla por `seq`, ignora los repetidos y se queda con los
  50 mayores. Da igual que el historial llegue antes o después del ack de `room:join` o de un mensaje en vivo.
- Mensajes recibidos fuera del lobby: no puede haberlos, porque enviar exige `LOBBY`. El historial se envía en cualquier
  fase (alguien que entra a mitad de partida lo verá al volver al lobby).

**Errores** (en inglés en el servidor; el cliente los traduce en `ROOM_ERROR_TRANSLATIONS` de `roomCode.ts`, y
`domain/room/RoomChat.java` se añade a `SERVER_MESSAGE_SOURCES` para que `roomCode.test.ts` vigile los textos):

| Servidor | Español |
|---|---|
| `"Chat is only available in the lobby"` | «El chat solo está disponible en el lobby.» |
| `"Message is empty"` | «Escribe algo antes de enviarlo.» |
| `"Message is too long"` | «El mensaje no puede pasar de 200 caracteres.» |
| `"You are muted in this chat"` | «Un moderador te ha silenciado en el chat de esta sala.» |
| `"Too many chat messages"` | «Estás enviando mensajes muy rápido; espera unos segundos.» |
| `"Message not found"` | «Ese mensaje ya no está en el chat.» |
| `"Cannot mute yourself"` | «No puedes silenciarte a ti mismo.» |
| `"Player not found"` (ya existe) | «Ese jugador ya no está en la sala.» |

- Sin permiso, el error es el de siempre: «No tienes permiso para realizar esta acción.».
- No se usa `assertLobby`: su texto («Este ajuste solo se puede cambiar en el lobby») no encaja con un chat.
- `room:chat:mute` sobre un jugador que no está en la sala (o ya salió) responde `"Player not found"`.
- `seq` que no es un entero responde `"Message not found"`. `muted` que no es booleano responde
  `"Invalid chat command"`, sin traducción: el cliente enseña su texto genérico, como con otras órdenes mal formadas (el
  cliente propio nunca lo envía).

**`RoomView`:** `MemberView` gana `chatMuted` (booleano). En `packages/shared`, `RoomMemberView.chatMuted?: boolean`,
opcional para no tocar los datos de prueba que ya construyen miembros. Si falta, vale `false`.

**Permisos:** `RoomPermission.MODERATE_CHAT` en Java (el Host lo recibe por `EnumSet.allOf`; se añade a
`EnumSet.of(...)` del `CO_HOST`) y en `ROOM_PERMISSIONS` de `packages/shared/src/room.ts` (el `HOST` ya usa la lista
entera; se añade a la lista del `CO_HOST`), fuera de `MEMBER`. Las reglas de arriba (no silenciar al Host, ni a otro
Co-host salvo el Host, ni a uno mismo; no borrar los mensajes del Host siendo Co-host) las aplica el coordinador, no la
tabla de permisos. Para saber de quién es un mensaje, `ChatMessage` ya lleva el id del autor.

## Interfaz

### Dónde está el chat

El panel se monta **una sola vez**, en un sitio u otro según el ancho. Se usa el mismo corte que `SessionScreen` y
`ScreenSplit`, 1024 px, con un hook nuevo `useMediaQuery('(min-width: 1024px)')`. Si hubiera dos copias ocultas con CSS,
se repetirían ids, campos y regiones vivas.

- **Escritorio (1280×720 y 1920×1080):** en la columna lateral, debajo de «Jugadores».
  - La columna queda así: «Invitar amigos» (si es una cuenta registrada), «Jugadores» y «Chat».
  - «Jugadores» y «Chat» se reparten el alto sobrante a partes iguales (`flex: 1 1 0`, `min-height: 0`). Cada uno se
    desplaza por dentro, y el campo de escribir del chat siempre se ve.
  - **Decisión tomada (revisable):** la nota «Hablando es mejor» sale de la columna, para dejar sitio, y pasa a ser el
    estado vacío del chat: «Todavía no hay mensajes. Hablando es mejor: si podéis, usad también una llamada de voz
    (Discord, Zoom…)».
- **Móvil (390×844, y todo lo que mide menos de 1024 px):** una cuarta pestaña del lobby, «Chat» (icono `MessageCircle`),
  con un `Badge` que cuenta los mensajes de otros que han llegado mientras la pestaña no estaba abierta (máximo «99+»).
  - Al abrir la pestaña, el contador vuelve a cero.
  - Para que quepan cuatro pestañas sin scroll horizontal, por debajo de 1024 px (el mismo corte que la pestaña «Chat») se ven las etiquetas cortas
    «Juegos», «Ajustes», «Modo» y «Chat». El nombre accesible sigue siendo el largo, con el patrón que ya usa «Modo y
    sesión»: el texto corto lleva `aria-hidden` y el largo es `sr-only` por debajo de 1024 px. Los tests que buscan
    `getByRole('tab', { name: 'Minijuegos' })` siguen valiendo.
  - Si se pasa a escritorio con la pestaña «Chat» abierta, el lobby vuelve a «Minijuegos».
  - Los paneles de pestaña siguen montados: el borrador del mensaje no se pierde al cambiar de pestaña.

### Componentes nuevos en `frontend/src/ui/` (antes, en la galería `/dev/ui`)

- **`ChatLog`**: la lista de mensajes de un chat. No es una región viva.
  - Es una `ol` con `aria-label` y se desplaza por dentro.
  - Cada mensaje muestra el autor (en negrita, con el color de jugador de `player-color.ts`), la hora `HH:mm` en
    `text-13` y el texto (`text-15`, con saltos de palabra largos). El mensaje propio lleva el fondo del jugador propio y
    la etiqueta «Tú».
  - Con `onModerate`, cada mensaje tiene un botón de icono de 44 × 44 px, «Moderar el mensaje de X».
  - Baja solo al último mensaje si ya estaba abajo (a menos de 48 px del final). Si el jugador había subido para leer,
    no se mueve y aparece una `Pill` «Ver mensajes nuevos» que baja al final.
  - El desplazamiento usa `scroll-behavior: smooth` solo sin `prefers-reduced-motion`.
  - Estado vacío: lo que pase el llamador (un `StateBox`).
- **`ChatComposer`**: el campo de escribir.
  - Un `Field` de una línea («Escribe un mensaje», `maxLength` 200, `enterKeyHint="send"`) y una `Pill` de icono
    «Enviar» de 44 px.
  - Intro envía. No se puede enviar si el texto, recortado, está vacío.
  - Desde 160 caracteres aparece un contador «183/200» (`text-13`, unido con `aria-describedby`, no es región viva).
  - Estado `busy` mientras espera el ack. Si falla, el texto se queda. Si sale bien, se vacía y el foco sigue en el campo.
  - Estado `disabled` con un motivo visible en línea, que sustituye al campo. Es un estado, no un error, así que no
    choca con la regla de un solo dueño por error.
- Galería: `ChatLog` vacío, con mensajes (propio, ajeno, nombre largo truncado con `title`, palabra larga sin espacios,
  texto con `***`), con botones de moderar y con «Ver mensajes nuevos». `ChatComposer` normal, cerca del límite, `busy`
  y silenciado.

### Pantalla (`frontend/src/room/chat/LobbyChat.tsx`)

- `Panel` «Chat» con `ChatLog` y `ChatComposer`.
- **Silenciado:** el propio jugador silenciado ve el `ChatComposer` deshabilitado con «Un moderador te ha silenciado en
  el chat de esta sala.». En «Jugadores», cada silenciado muestra un `Chip` con el icono `MessageSquareOff` y el texto
  «Silenciado» (se lee «Silenciado en el chat»), visible para todos.
- **Moderar (Host y Co-host):**
  - El botón de cada mensaje (también en los suyos) abre un `Dialog` «Mensaje de X». El diálogo cita el texto y ofrece
    «Eliminar mensaje» (`danger`), «Silenciar a X en el chat» o «Quitar el silencio a X», y «Cancelar». Se oculta lo que el servidor rechazaría: no hay «Eliminar mensaje» en los mensajes del Host si quien modera es Co-host, ni silenciar en los mensajes propios, del Host ni (siendo Co-host) de otro Co-host.
  - Tras eliminar, el foco pasa al título del panel «Chat»: el diálogo lo devolvería a un botón que ya no existe. Es el
    mismo patrón que «Jugadores» tras expulsar.
  - En «Gestionar a X» (el `MemberMenu` de `PlayerList`) se añade la misma acción, «Silenciar en el chat» o «Quitar el
    silencio del chat», solo si esa persona se puede silenciar según las reglas. El Co-host ve este menú para los miembros sin rol, aunque no tenga las acciones de gestión de personas. No pide confirmación: se deshace con un clic.
- **Errores:** todo fallo de una orden de chat sale, traducido, en el aviso global de la sala (`emit` de `RoomContext`).
  `LobbyChat` solo captura (`ignoreFailure`) para soltar su estado `busy`. En línea solo se ve lo que valida el propio
  campo (el contador).

### Estado en el cliente

- Lo lleva `RoomContext`, por encima del `Lobby`. Así el historial sigue al volver de una partida al lobby, sin pedirlo
  otra vez.
- El estado del chat se guarda junto a su `roomInstanceId`. Si la sala cambia (otra instancia, `null` al salir o al ser
  expulsado), se vacía. Si llega un evento con otro `roomInstanceId`, se ignora.
- El cambio de instancia se aplica en los mismos manejadores que fijan la sala (`room:state`, `session:restored`, los
  acks de crear y unirse, salir y `room:kicked`), nunca en un efecto posterior. Si no, el historial de la sala nueva
  podría llegar mientras el estado aún es de la anterior, y se descartaría.
- **Al montarse el lobby**, también al volver de una partida (el `Lobby` se desmonta mientras se juega), todo lo que ya
  hay en el chat cuenta como visto: no se anuncia ni suma no leídos. Un `room:chat:history` nunca suma no leídos.
- `useRoom()` expone `chat: ChatMessage[]` (ordenado por `seq`), `sendChat(text)`, `deleteChatMessage(seq)` y
  `setChatMute(playerId, muted)`.
- La lógica es pura, en `room/chat/chat-state.ts`, para poder probarla sin React:
  - `syncInstance`, para vaciar el estado al cambiar de sala;
  - `applyHistory`, que mezcla por `seq`;
  - `applyMessage`, que ignora repetidos y se queda con los 50 últimos;
  - `applyDeleted`.

### Accesibilidad

- **Una sola región viva en el lobby:** un `role="status"` (`aria-live="polite"`, `sr-only`) siempre montado.
  - Está dentro del contenedor principal del lobby (`position: relative`), fuera de los paneles de pestaña: así se oye
    también con la pestaña «Chat» cerrada en el móvil.
  - No está al final del documento: `RoomNotice` explica que una región de 1 px allí añadía scroll de página.
- **Qué se anuncia:**
  - solo los mensajes de **otros**, como «Ana: hola»;
  - nunca el historial al cargarse, ni el mensaje propio;
  - si llegan varios en menos de 1,5 s, se agrupan en uno: «3 mensajes nuevos. El último, de Ana: hola».
  - La lógica es pura, en `room/chat/chat-announcer.ts`.
- **El aviso «El host está reconectando»** conserva su caja visible pero pierde su `role="status"`, que se monta y
  desmonta. Su texto se anuncia por la misma región del lobby. Así hay una única región viva.
- `ChatLog` no lleva `role="log"`: ese rol es una región viva implícita.
- Botones de icono con nombre accesible, objetivos de 44 px, texto de 13 px o más, y movimiento solo con `transform` y
  `opacity` y respetando `prefers-reduced-motion`.

## Pruebas

- **Java:**
  - `ChatFilterTest`: palabra entera; mayúsculas y tildes; plurales; «año», «computadora», «disputa» y «Putalandia»
    intactas; «COÑO» se tapa y «cono» se queda; posiciones conservadas con varias coincidencias.
  - `ChatFilterTest` también: `fromList` rechaza una línea con dos palabras o con tilde. `ChatBeansTest` (unitaria, sin
    contexto): el fichero real carga y filtra.
  - `RoomChatTest`: normalización; vacío; 200 y 201 caracteres; tope de 50 con `seq` que sigue creciendo; límite de 45
    en 60 s (el 46.º falla, a los 60 s vuelve a entrar, un rechazo no cuenta); silenciado y Host.
  - `RoomChatCoordinatorTest` (con `RoomTestKit`):
    - enviar, borrar y silenciar, con los eventos de cada miembro;
    - fuera del lobby, todo se rechaza;
    - permisos: un miembro no modera; `coHostCanDeleteAndMuteMembers`, `coHostCannotMuteHostOrCoHost` (ni el Host ni otro Co-host; sí lo hace el Host con un Co-host), `coHostCannotDeleteHostMessages`, y nadie se silencia a sí mismo;
    - el historial llega al unirse y al restaurar;
    - el silencio sigue tras salir y volver;
    - al pasar a Host se quita el silencio;
    - dos conexiones del mismo jugador comparten el límite.
  - `RoomChatWebSocketTest`: las tres órdenes por el `/ws` real, y una conexión no enganchada recibe el error de dos
    pestañas.
- **Vitest:**
  - `chat-state`, `chat-announcer`, `useMediaQuery`, `ChatLog` y `ChatComposer`;
  - las traducciones de `roomCode.test.ts` y el permiso en `room.test.ts`;
  - en `Lobby.test.tsx`, la pestaña «Chat» y la nota en el estado vacío;
  - en `PlayerList.test.tsx`, el chip «Silenciado» y la acción del menú.
- **Playwright** (`e2e/tests/chat.spec.ts`), a los tres tamaños, con un anfitrión con cuenta registrada (así la columna
  lleva también «Invitar amigos», el caso más alto a 1280×720) y otro jugador invitado:
  1. Los dos se escriben y se ven. Capturas `chat-lobby` (escritorio) y `chat-pestana` (móvil).
  2. Un tercero entra y ve el historial.
  3. El filtro tapa una palabra.
  4. El Host borra un mensaje. Captura `chat-moderar` del diálogo.
  5. El Host silencia al jugador. Captura `chat-silenciado` de la vista del silenciado.
  6. El jugador recarga la página en el lobby y vuelve a ver el historial. Que el historial siga al volver de una partida
     lo cubre `chat-state.test.ts` (el estado vive en `RoomContext`, con la misma `roomInstanceId`).
  7. El 46.º mensaje en un minuto muestra el aviso del límite.
  - `capture()` con sus valores por defecto.
  - Nota de la rúbrica (≥ 19/24) del lobby con chat y del diálogo de moderar.
