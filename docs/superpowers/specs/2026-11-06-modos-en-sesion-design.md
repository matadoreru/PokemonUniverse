# Modos en la carta y en la elección de la sesión

Fecha: 2026-11-06. Decisiones del usuario tomadas en conversación.

## Objetivo
1. La carta de cada minijuego en el lobby dice cuántos modos tiene, si tiene más de uno («2 modos»).
2. Cuando la sesión elige el siguiente minijuego **al azar o por votación**, el host puede decidir qué modos de cada juego pueden salir: uno, varios o todos.

## Decisiones del usuario
- **Cada modo es una opción:** en la votación salen «Higher or Lower · Clásico» y «Higher or Lower · Racha infinita» como opciones distintas; al azar, cada par juego+modo tiene la misma probabilidad.
- **Dónde se marcan:** en los ajustes del juego. Con la sesión al azar o por votación, el selector «Modo» pasa a admitir varios (casillas «Modos que pueden salir»; al menos uno). Con el host eligiendo, sigue siendo un solo modo, como ahora.

## Diseño
- **Datos:** el `mode` de la configuración de cada juego no cambia (los motores siguen recibiendo un solo modo). Los modos permitidos son estado de la sala en el lobby, por juego: `allowedModes: { [gameId]: Mode[] }`, por defecto el `mode` actual de su configuración. Se guarda donde la sala guarda hoy la selección de minijuegos y el modo de sesión, y viaja en la vista de la sala que ya ve el lobby. No hace falta migración si las preferencias del usuario no lo guardan (si la selección de juegos se guarda en preferencias, guardarlo igual).
- **Al elegir el siguiente juego (al azar o por votación):** las candidatas son pares (juego, modo) con el modo en `allowedModes` del juego; un juego de un solo modo es un par. La votación muestra cada par como opción («Juego · Modo», solo «Juego» si es Clásico y único). Al empezar, la configuración del juego se usa con `mode` = el modo elegido (sin tocar el resto de ajustes). Los filtros que ya existen (p. ej. número de jugadores) siguen aplicando a cada par.
- **Lobby:**
  - carta del juego: `Chip`/insignia «N modos» si el juego tiene más de un modo (y el chip del modo actual sigue saliendo como hoy cuando no es Clásico; con varios permitidos en sesión al azar/votación, el chip dice «2 modos en juego» o lista corta).
  - panel de ajustes: con sesión al azar o por votación, el `Segmented` «Modo» se sustituye por casillas «Modos que pueden salir» con el texto de cada modo; no se puede desmarcar el último. Los ajustes propios de un modo se muestran si ese modo está marcado.
- **Servidor autoritativo:** el sorteo y la votación de pares se hacen en el backend (RoomCoordinator / donde se construyen hoy las opciones de voto y el sorteo), validando que cada modo exista para su juego.

## Pruebas
- Java: candidatos con pares por modo; sorteo y votación devuelven par válido; empezar aplica el modo elegido; un modo no válido se rechaza; juegos de un solo modo sin cambios.
- Vitest: carta con «N modos»; panel con casillas en sesión al azar/votación y `Segmented` con host eligiendo; no se desmarca el último.
- Playwright: el spec del lobby/sesión que ya cubre la votación (filtrado), con capturas a 1280×720, 1920×1080 y 390×844 del panel con casillas y de la votación con pares; rúbrica ≥ 19/24.
- Solo tests de lo tocado.

## Ampliación (2026-11-06): varios modos en la sesión por orden
Pedido del usuario: «los modos de juego de un minijuego también se pueden elegir si van por orden». Decisión: **varios modos en la cola**.
- **Panel:** las casillas sustituyen al `Segmented` «Modo» en las tres formas de sesión, con un solo texto, **«Modos que se juegan»** (se retira «Modos que pueden salir»). La línea de ayuda cambia según la forma: por orden, «Cada modo marcado ocupa su propio turno en la cola, seguidos y en este orden»; al azar o por votación, la de antes. Con un solo modo marcado (por defecto, el `mode` de la configuración) todo queda como antes.
- **Cola por orden:** cada juego se expande en sus modos marcados, seguidos y en el orden del catálogo (Clásico primero), respetando el orden de los juegos. El servidor (`RoomCoordinator.playablePicks` y `nextPicks`) avanza por esa lista de pares juego+modo: el siguiente al par jugado (si su modo ya no está marcado, tras el último par de su juego), vuelve al principio y aplica `selectedMode` al lanzar como al azar o por votación. Los filtros de jugadores se aplican a cada par. Un juego **saltado** queda fuera con todos sus modos: sigue el siguiente juego del orden, no otro modo del mismo juego.
- **Carta y textos de orden:** el chip es «N modos en juego» en las tres formas de sesión (o el nombre del único modo marcado si no es Clásico). El número de cada carta y el de la lista de ajustes cuentan turnos de la cola por orden: un juego con dos modos marcados enseña «1–2» (lector: «n.º 1 y 2 de la sesión»); al azar o por votación, un número por juego. La pista de «Modo y sesión» por orden con varios modos dice «Se juegan las N partidas de minijuego y modo en el orden de la cola y se vuelve a empezar.»
- La configuración guardada del jugador y el `mode` de la configuración del lobby no cambian. El reto diario sigue rechazando `room:update-allowed-modes`.
- **Pruebas:** `RoomCoordinatorTest` (cola con dos modos, un solo modo sin cambios, salto y filtro de jugadores), Vitest (`GameModeField`, `GameSelection`, `Lobby`) y Playwright (`sesion.spec.ts`, recorrido por orden con dos modos, capturas `sesion-orden-modos-ajustes` y `sesion-orden-modos-carta` a los tres tamaños).
