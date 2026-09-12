# Revisión técnica de Pokémon Universe

Fecha: 12 de septiembre de 2026.

El proyecto tiene una base arquitectónica aprovechable, pero todavía no está preparado para crecer en minijuegos y salas sin multiplicar excepciones y costes. La prioridad es corregir integridad multiplayer y privacidad; después, formalizar el contrato de ejecución y extraer infraestructura por familias de juegos. No recomiendo una reescritura ni un motor universal configurable mediante decenas de indicadores.

## Alcance y límites

Revisión estática transversal del repositorio: contratos, registro y flujos de acciones de los 28 motores, coordinación de salas, persistencia, sincronización, transporte, componentes y hooks de cliente, esquema Prisma, tests y configuración operativa. Se profundizó especialmente en los recorridos que cruzan esas capas. El inventario de `src` contiene 479 archivos TypeScript/TSX y 31.862 líneas, incluidos 106 archivos de tests: 35 shared, 29 server y 42 web. Estas cifras describen el inventario, no una afirmación de verificación exhaustiva de cada línea o de cada combinación de estados.

Se intentaron `npm test`, `npm run typecheck` y `npm run lint`. Los tres terminaron con código 127: `npm: command not found`. Tampoco se encontró `node` en PATH. Por tanto, no hay resultados de ejecución, cobertura medida, benchmark ni reproducción en navegador. Los defectos descritos como confirmados se deducen de rutas concretas del código; los escenarios indicados deben convertirse en regresiones ejecutables. No se evaluaron vulnerabilidades actuales de dependencias ni servicios desplegados.

Esta revisión describe el estado anterior a las correcciones. Su implementación y las verificaciones posteriores se registran en [el seguimiento de cambios](implementacion-revision-2026-09-12.md). Las propuestas de jugabilidad de la tabla son hipótesis, no requisitos de cambio automático para los 28 juegos.

## Decisiones que conviene conservar

- Motores con reloj y aleatoriedad inyectados mediante `GameContext`; separación respecto de React, Express, Socket.IO y Prisma. No se encontraron imports de esos frameworks en la implementación de shared.
- Acciones síncronas antes de los efectos de persistencia: evita muchas carreras dentro de un único proceso.
- `getPublicState` y `getPlayerState`, catálogo local y resolución de recursos con tokens opacos.
- Identidad de instancia, reclamación del final y guardas de callbacks de timers en el coordinador.
- Infraestructura existente de tiempos, cooldowns, votaciones y clasificación. Debe ampliarse, no duplicarse con otra biblioteca paralela.
- Validación de configuraciones persistidas, transacciones serializables para estadísticas y registro aditivo de juegos.
- Tests específicos de presencia y privacidad; CI con migraciones, typecheck, lint, tests y build. No falta una base de pruebas: faltan ciertos recorridos entre capas y casos de fallo.

## Hallazgos prioritarios

Severidad: **P1** afecta integridad, privacidad o disponibilidad en un escenario concreto; **P2** es deuda estructural o un fallo de alcance menor; **P3** es limpieza. La prioridad no implica que el fallo se haya observado en producción.

### 1. P1 — Zoomed Pokémon entrega información visual que debería seguir oculta

Referencias: `packages/shared/src/games/zoomed-pokemon/server.ts:190`, `apps/server/src/http/game-image-cache.ts:91`, `apps/web/src/room/ZoomedPokemonGame.tsx:21`.

`resolveAsset` sirve `FOCUSED_NORMALIZED`. La transformación normaliza la imagen a 512×512 y desplaza su contenido hacia el foco; no aplica el recorte correspondiente al nivel de zoom. El recorte visible lo implementan `overflow-hidden` y `transform: scale(...)` en el navegador.

**Consecuencia:** abrir directamente el recurso o quitar el escalado permite ver píxeles que aún no deberían estar disponibles. El desplazamiento puede eliminar parte del original, pero sigue entregando más imagen que el recorte autorizado. Que la URL no revele el nombre del Pokémon no resuelve esta fuga.

**Corrección:** producir el recorte real en servidor para cada etapa, con URL/versionado de etapa y comprobación del máximo nivel revelado. Cachear por recurso, foco y etapa. No aceptar una etapa futura solo porque el cliente conozca su identificador.

**Regresión:** verificar los píxeles del recurso de primera etapa; pedir directamente una etapa futura; conservar el bloqueo después de reconectar. Un test que solo comprueba ausencia del ID/nombre no detecta este problema.

### 2. P1 — Hay acciones que se aceptan después del deadline

Referencias: `packages/shared/src/games/pokemon-bluff-auction/server.ts:173`, `packages/shared/src/games/pokemon-connections/server.ts:177`, `packages/shared/src/games/one-of-us-is-fake/server.ts:167`.

Estos handlers no comprueban el deadline antes de aceptar, respectivamente, demostraciones, grupos y selecciones/votos. `handleTimeout` sí lo comprueba, pero depende de que su callback se ejecute primero. El timer común incorpora además una tolerancia de 5 ms.

En Bluff Auction el efecto es especialmente claro: con una demostración vencida, un acierto suma cinco segundos al deadline antiguo y puede volver a situarlo en el futuro; si completa la apuesta, concede la victoria antes de comprobar el tiempo restante.

**Corrección:** validar la ventana temporal antes de cualquier mutación de juego. Añadir una operación común de avance temporal previo y un contrato explícito de acciones permitidas durante cada fase; no prohibir indiscriminadamente acciones de control como continuar resultados.

**Regresión:** acción en `deadline - 1`, `deadline` y `deadline + 1`, sin ejecutar antes el callback; en Bluff, un acierto que completaría la apuesta y uno que solo ampliaría el reloj. Ejecutar después el timeout y comprobar que no hay puntuación duplicada.

### 3. P1 — Una sala antigua puede desasociar a un jugador de su nueva sala

Referencias: `apps/server/src/rooms/store.ts:15`, `apps/server/src/rooms/manager.ts:199`, `apps/server/src/rooms/manager.ts:616`.

`detachPlayer(playerId)` borra el índice sin comprobar qué sala lo posee. Durante una partida se conservan miembros `LEFT` para los resultados, aunque su asociación activa se elimina y pueden entrar en otra sala. Cuando la sala anterior vuelve al lobby, `resetToLobby` vuelve a ejecutar `detachPlayer(id)`. `store.delete(code)` presenta el mismo problema al borrar todos los IDs de sus miembros.

**Reproducción:** A abandona la partida de X; A entra en Y; X termina y vuelve al lobby o se elimina. La limpieza de X elimina el índice A→Y. A continúa en `Y.members`, pero sus siguientes comandos y reconexión ya no localizan Y.

**Corrección:** `detachPlayer(playerId, expectedRoomCode)` con comparación de propietario, también en `delete`. Separar la membresía activa del roster histórico.

**Regresión:** salida durante partida → entrada a segunda sala → lobby/cierre de la primera → acción y reconexión en la segunda.

### 4. P1 — Expulsar no cancela la reserva de desconexión

Referencia: `apps/server/src/rooms/manager.ts:285`.

`kick` elimina al miembro y su índice, pero no cancela `disconnectTimer`. Si el expulsado estaba temporalmente desconectado y vuelve a entrar antes de que venza el timer anterior, el callback antiguo busca por ID y encuentra al miembro nuevo. Puede afectar a una nueva desconexión de ese miembro y acortar su gracia. Tampoco se retira explícitamente el socket de la sala Socket.IO.

**Corrección:** centralizar la retirada de membresía, cancelar timer, limpiar canales efímeros y retirar socket; cada callback de gracia debe comprobar el objeto o la generación de membresía que lo creó. Un veto temporal a la reentrada es una decisión de producto separada: hoy expulsar no equivale a vetar.

**Regresión:** desconectar → expulsar → reentrar → desconectar otra vez → disparar el callback antiguo. La nueva reserva debe permanecer intacta.

### 5. P1 — La identidad de instancia no protege rondas, turnos ni revotaciones

Referencias: `packages/shared/src/room.ts:92`, `apps/server/src/rooms/manager.ts:65`, esquemas de acciones de Trivia, Higher/Lower y juegos de votación.

El sobre contiene `gameInstanceId` y `action`, pero no identifica el contexto interno al que responde. Una respuesta A/B/C/D retrasada puede aceptarse en la siguiente pregunta del mismo juego. También pueden cruzarse votos entre votación y revotación, o una acción de un turno anterior alcanzar un turno posterior del mismo jugador.

**Corrección:** exponer un `actionEpoch` o identificador de fase/turno emitido por el motor y exigirlo en las acciones asociadas a esa ventana. Añadir `requestId` para operaciones que necesiten repetición segura. No usar el timestamp del cliente como autoridad ni invalidar todas las acciones al cambiar cualquier campo del snapshot.

**Regresión:** retener un paquete, avanzar por timeout y entregarlo en la siguiente ronda/turno/revotación. Debe rechazarse aunque el tipo y los IDs de opción sigan siendo válidos.

### 6. P1 — Las peticiones Socket.IO pueden quedar pendientes indefinidamente

Referencias: `apps/web/src/room/RoomContext.tsx:61`, `apps/web/src/room/RoomContext.tsx:96`, `apps/server/src/index.ts:125`, `apps/web/src/room/SketchmonCanvas.tsx:146`.

El emisor general verifica que exista socket, pero no que esté conectado, ni impone timeout al ACK. Solo el voto para saltar tiene ese tratamiento. Una desconexión, un paquete descartado por el middleware de rate limit o un ACK perdido deja sin resolver la promesa. `continueSession` conserva esa promesa en su referencia y la cola de dibujo espera a la anterior, propagando el bloqueo.

**Corrección:** un único emisor tipado con comprobación de conexión, timeout y limpieza de peticiones al cambiar socket/identidad. Distinguir rechazo confirmado de resultado desconocido: un timeout no demuestra que la acción no se aplicara. Resolver mediante snapshot y request ID antes de reintentar acciones no idempotentes.

**Regresión:** ACK perdido tras aplicación, desconexión antes de envío, rechazo por rate limit y recuperación de `continueSession`/dibujo sin recargar la página.

### 7. P1 — La importación de dilemas no es atómica y puede divergir de la caché

Referencia: `apps/server/src/would-you-rather-prompts/service.ts:88`.

El servicio valida el lote, crea cada fila con un `await` independiente y solo actualiza la caché después de completar todas. Si falla la tercera creación, las dos primeras ya están en PostgreSQL, pero no en el servicio. Reintentar puede encontrar duplicados que la propia caché desconoce.

**Corrección:** operación de repositorio `createBatch` con transacción; actualizar caché/notificar solo tras commit. La validación previa y el índice único actual siguen siendo útiles, pero no sustituyen la atomicidad.

**Regresión:** fallo en la segunda inserción, conflicto concurrente de unicidad y reintento del mismo lote. Comprobar tanto filas como caché y número de notificaciones.

### 8. P1 — Actualizaciones concurrentes de dilemas pueden romper su clave normalizada

Referencia: `apps/server/src/would-you-rather-prompts/service.ts:68` y su `prisma-repository.ts`.

El servicio calcula la pareja completa y `normalizedKey` desde la caché, pero manda al repositorio solo las opciones modificadas. Dos peticiones simultáneas que cambian A y B parten de la misma pareja antigua. La fila puede terminar con A nueva + B nueva y una clave calculada con una opción antigua. Incluso puede terminar con dos opciones equivalentes que ninguna validación aislada detectó.

**Corrección:** leer, combinar, validar y escribir la pareja completa dentro de una transacción con control de versión/reintento; mantener el índice único. Publicar en caché la versión confirmada y evitar que una respuesta antigua sobrescriba otra nueva.

**Regresión:** editar A y B concurrentemente; comprobar que la clave corresponde siempre a las opciones almacenadas y que ambas son distintas.

### 9. P1 — Sketchmon multiplica dibujo e historial en memoria y en la red

Referencias: `packages/shared/src/games/sketchmon/server.ts:196`, `packages/shared/src/games/sketchmon/types.ts:130`, `apps/server/src/rooms/manager.ts:771`.

Cada lote clona los trazos, todos los snapshots de undo y los de redo. Cada inicio de trazo guarda otro dibujo completo. Los límites del esquema se aplican a un paquete, no al número acumulado de trazos, puntos o snapshots. El coste del historial puede crecer aproximadamente de forma cuadrática con los trazos; la duración limita el turno, pero no establece un presupuesto de memoria seguro. La galería conserva dibujos de rondas anteriores.

Además, cada lote aceptado provoca un snapshot completo por jugador, incluida la reconstrucción de la proyección pública. El límite global de eventos no sustituye límites de recursos acumulados.

**Corrección:** undo/redo mediante operaciones o estructuras compartidas, límite de pasos/puntos/bytes por dibujo y presupuesto de galería. Transmitir operaciones de dibujo con secuencia y snapshots periódicos para recuperar; las operaciones deben seguir validadas en servidor. Medir antes de ampliar la frecuencia de envío.

**Regresión:** muchos trazos cortos, append al máximo, alternancia clear/undo/redo, reconexión a dibujo grande y límite de memoria con varias salas.

### 10. P2 — Una acción rechazada puede cambiar el motor sin sincronizar la sala

Referencia: `apps/server/src/rooms/manager.ts:402`.

El coordinador asigna `game.state = result.state`, y si `accepted` es falso lanza antes de `syncAndBroadcast`. Varios motores devuelven precisamente un estado resuelto junto con un rechazo por tiempo agotado. Hasta que otra ruta sincronice, `room.phase`, espectadores, puntuación aplicada y snapshot pueden representar estados distintos. El timer pendiente suele reconciliarlo, pero no debe ser la reparación implícita del contrato.

**Corrección:** procesar todo cambio de estado aceptado por el motor antes del ACK, aunque la intención del usuario se rechace. Preferiblemente separar `advanceTime` de la aceptación de la acción para que la semántica sea inequívoca.

**Regresión:** acción tardía en Bingo y Quién es Quién que produce resultados o cambio de turno; comprobar inmediatamente fase, timer y una única publicación final coherente.

## Arquitectura y escalabilidad

### 11. P2 — El estado opaco no es realmente opaco

Referencias: `packages/shared/src/games/registry.ts:31`, `apps/server/src/rooms/types.ts:25`, `apps/server/src/rooms/manager.ts:543`, `apps/server/src/rooms/manager.ts:585`, `apps/server/src/rooms/manager.ts:665`.

`RegisteredGame` usa cuatro `any` y el runtime almacena `state: any`. El coordinador lee `phase`, `roundNumber`, `spectatorIds`, `roundEndsAt`, `nextTransitionAt`, `teams` y `board`. Los cursores de Quién es Quién están implementados en el propio coordinador. Un minijuego nuevo con otra forma de estado puede compilar y quedarse sin timer.

Propuesta: encapsular estado y módulo en un runtime tipado creado por una factoría; exponer `phase`, `nextDeadline`, `actionEpoch`, cambios de elegibilidad y proyecciones mediante contrato. Llevar el canal de cursores a un adaptador del juego con autorización de destinatarios. Mantener `unknown` en las fronteras y estrechar una vez; no sustituirlo por casts dispersos.

`GamePhase` también crece con fases particulares de todos los juegos. Conviene diferenciar fases de sesión de la fase interna discriminada de cada motor, en lugar de obligar al coordinador a conocer cada término nuevo.

### 12. P2 — Añadir un juego requiere más cambios centrales de los que promete el registro

Referencias: `packages/shared/src/games/config-readiness.ts:53`, `apps/web/src/games/registry.ts`, `apps/web/src/room/game-config-summary.ts`, `apps/web/src/room/RoomSessionLayout.tsx:15`.

La disponibilidad usa condicionales por ID, comprobaciones no tipadas y conocimiento de Bingo/Pokédle/preguntas personales. La capacidad real del catálogo no forma parte del contrato general; por ejemplo, TCG puede cumplir el número de jugadores y fallar al arrancar por no disponer de cartas comparables. El layout contiene una excepción de feedback para Shiny Vote.

Propuesta: `validateConfig`/`checkAvailability` por módulo, con resultado estructurado y capacidades del catálogo; metadatos de presentación en el registro del cliente. Distinguir validación estática de configuración de disponibilidad dependiente del dataset. Las rotaciones solo deberían ofrecer juegos lanzables con el snapshot de catálogo seleccionado.

### 13. P2 — Publicación completa y trabajo repetido por destinatario

Referencias: `apps/server/src/rooms/manager.ts:732`, `apps/server/src/rooms/manager.ts:771`.

`view` reconstruye contexto, manifiestos, configuraciones, diferencias frente a defaults, clasificación e incluso `getPublicState` para cada socket y cada acción. Aumentar el número de juegos agranda todos los mensajes; aumentar jugadores multiplica el trabajo. Si la proyección recorre a todos los jugadores, su repetición puede resultar cuadrática en tamaño del roster.

Propuesta incremental: calcular una vez la base pública por revisión de sala y adjuntar solo lo privado por destinatario; separar metadatos y configuración de actualizaciones de partida; versionar snapshots. Reservar deltas para canales que lo justifican, como dibujo y cursores. No emitir un objeto que mezcle secretos de varios jugadores en un broadcast común.

### 14. P2 — Redis no es un reemplazo directo del store actual

Referencias: `apps/server/src/rooms/store.ts`, `apps/server/src/rooms/types.ts`, `apps/server/src/admin/audit.ts`, `apps/server/src/data-sync/service.ts` y `docs/architecture.md`.

Los datos contienen módulos ejecutables, Maps/Sets, handles de Node y promesas; la API es síncrona y se basa en referencias mutables. Además, auditoría y sincronización tienen coordinación local. `interruptStaleActivity` y `recoverInterrupted` actualizan registros activos globalmente: arrancar un segundo servidor podría marcar como interrumpido trabajo del primero.

Propuesta: conservar explícitamente el despliegue de un propietario por sala hasta diseñar snapshots serializables, versión de motor/configuración, ownership con lease, temporizadores durables y comandos serializados por sala. El adaptador Socket.IO distribuye mensajes; no decide quién muta el estado. Añadir propiedad/latido a auditoría y sync antes de múltiples instancias. Las caches de categorías y preferencias también necesitarían invalidación entre procesos.

### 15. P2 — Persistencia final y cierre ordenado no comparten un ciclo de vida

Referencias: `apps/server/src/rooms/manager.ts:554`, `apps/server/src/stats/service.ts:32`, `apps/server/src/admin/audit.ts:21`, `apps/server/src/index.ts:141`.

La puntuación de sesión se publica antes de completar su persistencia. Los fallos finales se registran en consola; no hay recuperación durable del resultado pendiente. El shutdown espera preferencias, pero no drena explícitamente tareas de resultados/auditoría ni espera el cierre completo del transporte antes de desconectar Prisma y salir. La cola del audit sink serializa además trabajo de todas las salas.

Propuesta: registro de tareas pendientes con `flush` y plazo de cierre; para garantizar resultados tras caída, evento durable/outbox idempotente por `resultId`. Separar persistencia de resultados de `LiveRoom`: entregar una estructura inmutable con identidades del roster. Mantener transacciones serializables actuales. No interpretar cualquier `P2002` como éxito: comprobar que el resultado concreto quedó completado.

### 16. P2 — Puntuación del minijuego y puntuación de sesión comparten significado

Referencias: `packages/shared/src/games/pokemon-team-auction/rules.ts:15`, `packages/shared/src/scoring.ts:49`, `apps/server/src/rooms/manager.ts:559`.

`GameStanding.points` se suma directamente a la sesión. En Team Auction son BST del equipo; en otros juegos son puntos por posición o aciertos. Un equipo de seis Pokémon puede aportar miles, frente a unidades o decenas en otros juegos. La duración configurada también altera lo que pesa cada juego en la rotación y cuándo se alcanza una sesión por puntos.

Esto es una decisión de producto con impacto arquitectónico. Si se busca una sesión equilibrada, separar `rawScore` de `sessionPoints`, conservar estadísticas propias y aplicar una política común por posición/empate/participación. No cambiar silenciosamente estadísticas históricas: versionar la política y decidir cómo presentar periodos anteriores.

## Reutilización y mantenibilidad

### 17. P2 — Duplicación clara, pero con límites de extracción distintos

| Patrón observado | Ejemplos | Extracción propuesta |
| --- | --- | --- |
| Fisher–Yates repetido | `guess-from-stats/server.ts:29`, `pokemon-team-auction/server.ts:27`, `secret-ranking/server.ts:34`, `tcg-higher-lower/server.ts:21`; al menos 15 implementaciones locales | `games/infrastructure/random.ts`: shuffle y sample con RNG explícito y contrato `[0,1)` |
| Deck sin repetición y fallback al agotarse | Entradas Pokédex, prompts sociales, Red Flag, TCG, adivinación | `content-deck.ts`, con políticas explícitas de reposición y repetición adyacente |
| Registro de intento, cooldown, solve order, tiempos y métricas | Who's That Pokémon, Zoomed, Entry Guess, Stats, Palette, Cry | `guessing-round.ts`: operaciones pequeñas parametrizadas por validador y puntuación; extender `timing.ts` |
| Escribir/elegir → votar → desempatar → revelar | Most Likely To, Red Flag, One of Us Is Fake | Extender `runoff-voting.ts` con política de empate. Mantener aparte identidad anónima, categorías secretas y reglas de victoria |
| Condiciones objetivas Pokémon | Bluff importa tipos, generador, reglas y defaults de Bingo | `pokemon/conditions/`: AST, matcher, descripción y generación; Bingo conserva matching de tableros y Bluff su subasta |
| Normalización de texto idéntica | `categories/service.ts:23` y `would-you-rather-prompts/service.ts:23` | Normalizador de contenido del servidor, probado para tildes/puntuación; no fusionar sin análisis la búsqueda de Pokémon y la detección de palabras prohibidas |
| Resumen Pokémon y diccionarios de presentación | Múltiples engines y pantallas | Tipos/proyectores públicos con campos mínimos; no devolver `Pokemon` completo y borrar campos secretos después |
| Formularios de configuración y validadores envoltorio | `games/*/ConfigPanel.tsx`, `guess-from-stats/validation.ts` | Controles tipados y adaptador de `safeParse`; layouts especiales permanecen locales |

No conviene crear un `utils.ts` general que absorba reglas sin cohesión. El lugar de una función depende de quién posee su significado: un empate es dominio, una suscripción es cliente, una transacción es servidor.

### 18. P2 — Frontend tipado superficialmente y con lógica asíncrona dispersa

Referencias: `apps/web/src/room/RoomContext.tsx`, `apps/web/src/games/registry.ts:11`, `apps/web/src/hooks/useRunoffVote.ts`, `apps/web/src/hooks/usePokemonPool.ts`, `apps/web/src/auth/AuthContext.tsx:26`.

Acciones y configuraciones viajan como `unknown`, se fuerzan con casts en las pantallas y el emisor usa `any[]`, aunque existen contratos compartidos. Muchos juegos repiten busy/error/reset por ronda. `useRunoffVote` no invalida el resultado de una promesa antigua cuando cambia la ronda. `usePokemonPool` ignora respuestas obsoletas, pero su comentario de query «cancellable» no corresponde a una cancelación HTTP real; tampoco deduplica consultas. La carga inicial de autenticación tiene `finally` sin `catch`, por lo que un error de red no se convierte en un estado recuperable de autenticación.

Propuesta: props genéricas de módulo, emisor inferido desde `ClientToServerEvents`, hook de acción con contexto de ronda y invalidación de resultados tardíos, consultas cancelables y caché por filtros/versionado del catálogo. Separar suscripción a sala, transporte de comandos y proyección optimista, que ya existe como módulo útil.

`Lobby.tsx` concentra selección, permisos, readiness, rotación y formularios; separar paneles funcionales. `SketchmonCanvas` mezcla dibujo, optimismo y cola de transporte: extraer cola y reconciliación. La prioridad de legibilidad no son solo líneas: `WhoIsWhoPokemonGame.tsx` y varios motores contienen muchas operaciones o JSX en una misma línea. Formatear y nombrar transiciones antes de crear más abstracciones.

### 19. P2 — Contratos públicos y motores comparten un único punto de exportación

Referencias: `packages/shared/src/index.ts`, `packages/shared/package.json`, `apps/web/vite.config.ts`.

El único export del paquete agrega tipos, esquemas, utilidades y registro que importa todos los motores. Hay carga diferida de componentes, pero el límite de paquete no protege frente a importar código de motor en cliente. El chunk manual `vendor-shared` tampoco ofrece esa garantía. Sin build no puede afirmarse cuántos bytes de motores llegan realmente al navegador.

Propuesta: subpaths `shared/contracts`, `shared/catalog`, `shared/games/<id>/public` y `shared/server`; regla de imports que impida motores/registro servidor desde web. Generar o definir manifiestos sin registrar motores como efecto colateral. Mantener tipos compartidos no implica distribuir implementación privada; tampoco debe considerarse secreto un algoritmo por no enviarlo al cliente.

### 20. P2 — Cachés y sincronización necesitan política explícita de actualización

Referencias: `apps/server/src/index.ts:108`, `apps/server/src/pokemon/catalog.ts:8`, `apps/server/src/categories/service.ts:32`, `apps/server/src/game-configs/service.ts:101`.

Tras sincronizar PokéAPI se actualiza el catálogo de audio, pero no el catálogo principal ni el visual cargados al arrancar. Cambios de estadísticas, entradas, paletas o nuevas especies no llegan a esos consumidores hasta reinicio. Las caches por usuario cargan todas las filas y permanecen sin política de expulsión. El catálogo se denomina inmutable, pero devuelve objetos `Pokemon` mutables por referencia; `readonly Pokemon[]` no hace inmutables los elementos.

Propuesta: snapshots versionados del dataset, fijados por partida y renovados para partidas nuevas; distinguir «sincronizado en DB» de «activo en juego». Cargar preferencias/contenido por usuario antes de aceptar sus comandos, con límites e invalidación. Tipos profundamente readonly y pruebas de no mutación del catálogo por motores.

### 21. P2 — El cliente HTTP de sincronización no cumple su política de reintentos

Referencia: `apps/server/src/data-sync/http-client.ts:30`; recurso remoto de imágenes en `apps/server/src/http/game-image-cache.ts:86`.

`Number(response.headers.get('retry-after'))` convierte la ausencia del header en cero: los errores transitorios sin header esperan cero milisegundos. Los errores 4xx distintos de 429 se lanzan dentro del `try` y el `catch` los vuelve a reintentar. No hay timeout explícito de solicitud; el fetch de imágenes tampoco lo tiene ni limita explícitamente los bytes descargados. Una fuente lenta puede retener trabajos y peticiones mucho tiempo.

Propuesta: clasificar respuesta/reintento fuera del catch de transporte, parsear ausencia/segundos/fecha de Retry-After y limitar esperas; timeout y cancelación que cubran consumo del cuerpo. Presupuesto de bytes/concurrencia para recursos. La caché de imágenes ya limita entradas a 256: añadir presupuesto de memoria, no describirla como ilimitada.

**Regresión:** 404 sin reintento, 503 sin header con backoff, 429 con segundos/fecha, cuerpo que no termina y recurso excesivo.

### 22. P2 — Hay fases que un participante conectado puede bloquear indefinidamente

Referencias: `packages/shared/src/games/pokemon-team-auction/server.ts` (`handleTimeout` devuelve siempre el estado), `pokemon-bluff-auction/server.ts:73`, `who-is-who-pokemon/server.ts:31`.

La puja de Team Auction y la fase de subasta de Bluff no tienen deadline de turno. La selección manual del secreto en Quién es Quién empieza sin deadline hasta que ambos equipos eligen. Si un jugador sigue conectado pero no actúa, no opera la política de desconexión. El salto unánime tampoco garantiza desbloquearlo porque requiere su voto.

Propuesta de producto: tiempos de turno opcionales con defaults para partida pública, autopase en subastas y asignación aleatoria de secreto al agotar selección. Hacer explícito el modo sin reloj para grupos que lo prefieran. Testear ausencia de input con conexión viva.

### 23. P3 — Código residual, redundancias y documentación contradictoria

- `avatarSeed` solo se escribe en registro y permanece en Prisma/migración inicial; no se encontró consumidor en el repositorio. Candidato a retirar con migración nueva tras comprobar consumidores externos. No editar la migración histórica.
- En `who-is-who-pokemon/server.ts`, `pokemonId: state.phase === 'GAME_RESULTS' ? guess.pokemonId : guess.pokemonId` tiene ramas idénticas. `state.results` se inicializa/restablece a null y `getResults` lo usa como caché inexistente: simplificar o implementarla.
- `connected` y `presence`, `hostId` y `roomRole`, y puntos en miembro/participante son representaciones redundantes. Algunas tienen utilidad de proyección/historial; establecer un propietario y derivar las demás, en vez de mantenerlas independientemente.
- `docs/architecture.md` dice que cambiar ajustes limpia readiness; `manager.test.ts:420` comprueba expresamente que se conserva. Decidir/documentar el contrato vigente, no cambiar comportamiento solo para cumplir prosa antigua. La afirmación de que ningún juego depende de TCG también ha quedado obsoleta.
- `eslint.config.mjs` desactiva `no-explicit-any` globalmente y no configura reglas de hooks ni promesas tipadas. Habilitar controles por capas, con excepciones locales para adaptadores y migración gradual.

No se demuestra que un archivo entero esté muerto únicamente porque falten imports directos: existen exports públicos, carga dinámica, scripts y assets. No se propone borrar archivos o dependencias sin confirmar su grafo y los artefactos de build. Tampoco se declara limpio el conjunto de imports, ya que lint no pudo ejecutarse.

## Revisión de los 28 minijuegos y propuestas de jugabilidad

Las mejoras siguientes son hipótesis de diseño a validar con sesiones de juego; no son defectos por ser juegos sencillos. El objetivo es variedad de decisiones y tiempos razonables. Las referencias a motores apuntan a `packages/shared/src/games/<id>/server.ts` y a su `rules.ts`.

| Minijuego | Prioridad técnica o infraestructura | Propuesta de jugabilidad |
| --- | --- | --- |
| Pokédex Distance | Presencia validada también dentro del motor; selección del pool canónico coherente; revisar estados de eliminación y empates | Variante por rondas con puntuación acumulada para reducir espera de eliminados; contrastar cuánto pesa rapidez frente a conocimiento |
| Shiny Vote | Mantener recursos opacos y votos privados; reutilizar ciclo de rondas | Ajustar dificultad de señuelos y evitar variantes visualmente indistinguibles; medir acierto y saltos por Pokémon |
| Pokémon Impostor | Separar turnos, pistas y resolución de votos; tests con último jugador requerido desconectado | Límites de discusión y reparto equilibrado de roles entre partidas; modalidad de pistas con restricciones temáticas |
| Higher/Lower | Base de comparación compartida con TCG, conservando reglas de igualdad propias | Rachas o apuesta limitada de confianza; evitar que mostrar respuestas en tiempo real premie copiar |
| Type Duel | Política de cancelación y reelección explícita; acciones con epoch | Acotar ciclos de combinaciones inválidas y ofrecer alternativa tras varios intentos; equilibrar número de duelos por jugador |
| Learnset Guess | Infraestructura de adivinación y reloj de revelación; puntuar con etapa temporal autoritativa | Dificultad por rareza de movimientos; pistas que discriminen, evitando largas secuencias equivalentes |
| Pokédle Race | Revisión de ronda y roster histórico; tests con pool menor que jugadores | Secretos distintos pueden tener dificultad desigual: alternativa con objetivo común o rotación compensada |
| Pokémon Bingo | Conservar matching perfecto; presupuesto de generación y publicación | Medir dificultad por cantidad de candidatos, no solo solvencia; modo por líneas para partidas cortas |
| Who's That Pokémon | Compartir intentos/solves sin degradar transformación real de silueta | Variantes de silueta/pose y dificultad; balancear bonus de velocidad en redes con distinta latencia |
| Pokédex Entry Guess | Compartir deck/intentos; mantener saneamiento del nombre y localización | Pistas graduales con coste y exclusión de textos poco informativos; dificultad por ambigüedad |
| Type Chain | Reutilizar turno/eligibilidad y política de empate, conservando regla de exactamente un tipo común | Reloj decreciente, comodín escaso o rondas cortas para que eliminados regresen antes |
| Guess From Stats | Conservar conjunto de respuestas equivalentes; infraestructura de adivinación | Revelado progresivo de estadísticas o presupuesto de pistas; evitar penalizar equivalencias válidas |
| Zoomed Pokémon | Corregir recorte servidor antes de balancear | Calibrar foco para que sea reconocible por etapas; evitar grandes áreas neutras que conviertan el inicio en azar |
| Poké Taboo | Turnos de descriptor e intentos compartibles con Sketchmon | Lista de palabras prohibidas además del nombre, elegida según dificultad; mejores incentivos para describir |
| One of Us Is Fake | Deadline y epoch de votación; política de selección reemplazable documentada | Pares de categorías calibrados por cercanía; límite de revotaciones y discusión |
| Pokémon Bluff Auction | Deadline de demostración, timer de puja y condiciones fuera de Bingo | Techo de duración acumulada de demostración; equilibrar recompensa de apostar frente a pasar siempre |
| Sketchmon | Presupuestos de memoria, historial por operaciones y sincronización incremental | Ventana corta para más aciertos después del primero o modo cooperativo; premiar dibujos comprensibles para varios |
| Pokémon Connections | Rechazar acciones vencidas; mantener validación de grupos/ambigüedad | Dificultad por solapamiento real de categorías; pistas limitadas tras near-miss y puzzles de duración comparable |
| Pokémon Team Auction | Timer, puntuación de sesión independiente del BST, turnos verificables | BST como único objetivo favorece valor numérico obvio: bonus de cobertura de tipos, roles o metas secretas; conservar un modo simple |
| Secret Ranking | Deck de prompts y agregación/votos reutilizable; tests de un único envío | Distintos temas y predicción del consenso; mostrar por qué un orden se acerca al grupo |
| Most Likely To | Infraestructura de elecciones y revoto, sin mezclar con autoría anónima | Variante anónima para reducir voto por autor; alternancia de consignas y recompensa por originalidad |
| Would You Rather | Atomicidad/concurrencia de catálogo y ronda identificada | Recompensar preferencia mayoritaria incentiva elegir lo popular: considerar puntuar solo predicción si se quiere opinión sincera |
| Pokémon Red Flag | Borrador como estado privado y resolución al deadline; no publicar sala completa por edición | Ronda de exposición anónima con voto rápido; alternar restricciones para evitar respuestas repetitivas |
| Who Is Who Pokémon | Canal de cursores fuera del manager, epoch de turno y timer de selección | Secretos nuevos por enfrentamiento, salida explícita al empate y rotación del equipo inicial; aclarar que `rounds` limita ciclos de turnos |
| TCG Higher/Lower | Disponibilidad real de cartas y deck común; fecha de snapshot de precios | Dificultad por proximidad de precios y contexto de rareza; igualdad con tolerancia definida claramente |
| Pokémon Cry Quiz | Compartir adivinación y recursos opacos; comprobar error de carga/reproducción | Repeticiones controladas y niveles por similitud del grito; no penalizar silenciosamente un audio que falla |
| Pokémon Trivia | Epoch de pregunta y disponibilidad por categorías; generación con presupuesto | Distractores cercanos y explicación final; evitar categorías triviales o imposibles con filtros estrechos |
| Pokémon Palette Guess | Compartir solves y conservar exclusión de paleta del endpoint público | Dificultad por similitud de paletas y pistas progresivas; presentar porcentajes o patrones además de color para accesibilidad |

## Tests que aportan más valor

### Contrato de motor común

Crear una suite parametrizada por registro con fixtures/catálogos específicos de cada juego, sin forzar un único guion de acciones para todos:

1. Misma semilla, catálogo y tiempos producen el mismo estado/resultados.
2. Acciones inválidas, ajenas al roster, obsoletas y vencidas no puntúan.
3. Timeout antes/en/después del deadline; repetición del callback no duplica resultados.
4. Desconexión temporal y definitiva en cada barrera; ningún jugador no requerido bloquea una espera salvo política explícita.
5. Proyección pública y de otro jugador no contienen secretos; comprobar valores y recursos, no solo nombres de claves.
6. Un estado terminado no vuelve a jugar ni cambia resultados al recibir presencia/timeout.
7. Las acciones no mutan catálogo ni estados anteriores si se declara un motor inmutable.

### Integración multiplayer

Tests con transporte real o un adaptador de comandos público, reloj controlado y dos o tres clientes: entrada a nueva sala tras salida, expulsión con timer pendiente, reemplazo de socket, paquetes retrasados entre rondas, ACK perdido después de mutación, presencia mientras se resuelve el juego y shutdown con resultados pendientes. Los tests actuales de `RoomManager` acceden extensamente a métodos privados mediante `as any`; son útiles, pero no sustituyen la prueba del límite del transporte.

### Persistencia y cliente

- PostgreSQL real para importación atómica, edición concurrente de parejas, conflictos de estadísticas e idempotencia por resultId. Mocks de repositorio no prueban aislamiento o rollback.
- Tests de interacción montados en DOM para hooks, canvas, borradores y reconexión. Muchos tests web usan `renderToStaticMarkup`: verifican contenido, no ejecución de efectos, clicks ni orden de respuestas.
- Tests de recursos visuales por etapa para Zoomed; audio ausente/lento; respuestas HTTP con timeout.
- Presupuestos medidos de tamaño de snapshot, tiempo de proyección, generación de Bingo/Connections y memoria de Sketchmon. No fijar cifras arbitrarias sin una línea base reproducible.
- Conservar los tests actuales de privacidad y reconexión al extraer cada familia. No reemplazarlos por tests que solo comprueben que se invocó el helper nuevo.

## Secuencia de trabajo propuesta

| Orden | Entrega acotada | Criterio de aceptación |
| --- | --- | --- |
| 1 | Corregir recursos de Zoomed, deadlines y sincronización de acciones rechazadas | Recursos futuros inaccesibles; todas las acciones vencidas rechazadas sin estados de sala divergentes |
| 2 | Ownership de membresía, timers de expulsión, epoch y emisor con ACK acotado | Traslados/reconexiones y paquetes antiguos no afectan otra membresía o ronda; UI recuperable |
| 3 | Importación transaccional y actualización concurrente de dilemas | Caché y DB coinciden tras éxito/fallo; invariantes de pareja verificadas en concurrencia |
| 4 | Contrato runtime explícito y separación de cursores | Manager no inspecciona `teams`, `board` ni campos temporales arbitrarios del estado |
| 5 | Extraer random/decks/condiciones y una familia de adivinación | Dos juegos migrados con los mismos tests funcionales; coste de añadir un tercero reducido |
| 6 | Publicación por revisión y presupuesto de Sketchmon | Benchmark antes/después con varias salas, historial y reconexión grandes |
| 7 | Persistencia drenable, catálogo versionado y fallos HTTP consistentes | Cierre reproducible sin pérdida de tareas aceptadas y nuevas partidas con dataset correcto |
| 8 | Política de puntos de sesión y mejoras jugables seleccionadas | Reglas documentadas/versionadas y sesiones mixtas que no dependan de la escala de un juego |
| 9 | Separar exports públicos, limpieza de residuos y pruebas de interacción | Web no importa motores; typecheck/lint/tests/build completos en Node 22+ |

Preparar multinstancia solo después de estabilizar ownership, comandos y snapshots. La limpieza de nombres y formato puede acompañar cada extracción, pero conviene evitar un cambio masivo que mezcle balance, transporte, persistencia y presentación: impediría comprobar qué comportamiento se conserva y cuál cambia deliberadamente.
