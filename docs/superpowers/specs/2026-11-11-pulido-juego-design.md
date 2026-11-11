# Pulido del juego (2026-11-11)

Diagnóstico completo, con las 32 mejoras (fichero:línea, impacto, esfuerzo): artifact
https://claude.ai/artifact/52j3VRuPVufK3wojMpqBwM, sobre el commit adfb36c2. El usuario aprobó implementarlo todo
(«Implementalo todo»); esta spec fija las decisiones que el diagnóstico dejaba abiertas, las reglas comunes y los paquetes.

## Decisiones

| | Decisión | Motivo |
|---|---|---|
| E1 | **Intro de partida.** Antes de la primera ronda la sala muestra el nombre del juego, su icono y 3 reglas cortas (`howTo` en cada manifiesto de `registry.json`, servido a la web). Dura 8 s y termina antes cuando todos los jugadores conectados pulsan «¡Listo!». El reloj de la ronda 1 empieza al terminar la intro. Los espectadores la ven pero no cuentan. El reto diario también la tiene. Restricciones: el orden de extracciones aleatorias de `createInitialState` y `start` no cambia (doradas y reto diario deterministas); `start` recibe un contexto con el `now` de fin de la intro; reconexión, salida del anfitrión, saltar partida y margen de presencia funcionan durante la intro; `howTo` viaja manifiesto → OpenAPI → `api:types`, y los textos (31 × 3) los reviso yo antes de fusionar. | Hoy el reloj de la ronda 1 corre mientras se lee la pantalla por primera vez. Hacerlo en la sala (coordinador) evita tocar los 31 motores. |
| E2 | **Revelados que se pueden saltar.** En los revelados entre rondas aparece «Siguiente»; cuando todos los jugadores requeridos y conectados lo han pulsado, el revelado termina 1 s después. Además, Connections pasa de 30 a 15 s de revelado y Type Duel de 10 a 7 s. Mecanismo: **reloj de sala**. La sala lleva un desfase propio (`skipOffsetMs`); todo `context.now()` y `serverNow` de esa sala es la hora real más el desfase. Cuando todos marcan «Siguiente» en una fase de revelado (`ROUND_RESULTS`, `VOTE_RESULTS`, `TYPE_REVEAL`, `CHOICE_REVEAL`… según el `getLifecycle` de cada motor), el desfase crece hasta dejar el plazo pendiente a 1 s. Los motores calculan sus plazos desde `context.now()` y la web desde `serverNow`, así que ningún motor cambia y sus doradas tampoco; solo se regraban Connections y Type Duel por las nuevas duraciones. La auditoría guarda la hora real. | Revelados largos y fijos son el tiempo muerto más grande que queda. |
| E3 | **Seguir sin anfitrión.** En los resultados de una partida, si queda sesión, la sala sigue sola a los 20 s, con la cuenta atrás visible. El anfitrión puede seguir antes, como hoy. | Un anfitrión conectado pero distraído bloquea a todos. |
| E4 | **Margen de reconexión para todos.** `presenceGraceMs: 8000` en los 31 manifiestos. | Hoy solo 7 juegos lo tienen; en el resto un corte de red es un abandono. |
| E5 | **Remontada opcional.** Opción de sesión «La última partida vale doble» (solo en modo número de partidas), apagada por defecto. | Da emoción al final sin cambiar nada a quien no la active. |
| E6 | **Rachas opcionales en los juegos de adivinar.** Opción «Rachas» (apagada por defecto) en los juegos que puntúan con `SpeedPodiumScore` (Who's That, Cry Quiz, Palette): cada acierto consecutivo a partir del segundo suma +1, con un máximo de +3; la racha se rompe al no acertar una ronda. Se muestra en la ayuda de puntos (web-contracts) y en la ronda («Racha ×3»). Ninguno está en el reto diario. Se regraban las doradas afectadas. | El diagnóstico la proponía opcional; hoy solo Higher Lower y TCG premian la constancia. |
| E7 | **Presets de ritmo.** En los paneles con rondas o tiempo, un control «Ritmo»: Rápido, Clásico (= valores por defecto) y Experto. Por defecto, Who is Who baja de 25 a 15 rondas y One of Us Is Fake de 180 a 120 s de discusión. Las configuraciones guardadas no se migran. | Los anfitriones no tienen por qué ajustar cinco números para una partida corta. |
| E8 | **Ajustes.** El diálogo de sonido pasa a «Ajustes»: Sonido, Movimiento (Sistema, Reducido, Completo) y Texto (Normal, Grande, Muy grande = 100 %, 112,5 %, 125 % de la letra raíz). Los tokens `--fs-*` pasan a `rem` con el mismo valor a 16 px. Una sola clave en `localStorage`, validada. El movimiento se aplica con `data-motion="reduce"` en `<html>` (Reducido, o Sistema con el SO en reducido): todas las reglas `@media (prefers-reduced-motion)` de CSS y la comprobación JS pasan a ese atributo y un test prohíbe las reglas sueltas. Criterio de aceptación: con Muy grande, sala, un juego de cada kit y resultados sin scroll horizontal a 1280 y 390 (el scroll vertical de `main` sí se permite en Grande y Muy grande), con capturas. | Hoy solo se puede bajar el movimiento desde el sistema operativo y la letra solo con el zoom. |
| E9 | **Entrar por enlace.** `/play?sala=CÓDIGO` rellena el código y entra si hay sesión; el botón de copiar copia la URL y en táctil usa el menú de compartir. | Compartir el código a mano es el primer obstáculo para jugar. |
| E10 | **Celebración.** Confeti solo para quien gana (nunca con movimiento reducido), trofeo con rebote, `game.podium` para 2.º y 3.º, y un único dueño del sonido de victoria. | Hoy la victoria pasa casi desapercibida y el sonido puede sonar dos veces. |
| E11 | **Colores de jugador.** El verde y el rojo de acierto y fallo, y uno de los tres azules parecidos, se sustituyen por otros tokens bien distintos (la paleta sigue con 8; las salas admiten hasta 100 jugadores y se repite en ciclo). | Con daltonismo se confunden con el estado de la respuesta. |

Detalles menores aceptados sin decisión aparte: confirmación de «Terminar sesión»; pantalla de error con «Reintentar» para las cargas perezosas; transiciones entre fases y rondas; sonido y movimiento al fallar; «¡Empieza!» (la intro de E1) y «¡Te toca!»; puntos que saltan en todos los marcadores; títulos en dos líneas en móvil; marcas además del color; teclado virtual; borradores en `sessionStorage`; atajos visibles con «?»; sala vacía con «Invitar»; «Saltar al contenido»; tonos, estados vacíos y avisos unificados; tokens en vez de literales; parte H (Tailwind sin forma fuera de `ui/`); las 9 cabeceras propias al marco común.

## Reglas comunes

- Cada paquete en su rama y worktree, con revisión, y se fusiona en main con push al terminar.
- Todo componente o estado nuevo va primero a la galería `/dev/ui`. Animaciones solo con transform/opacity, desde los tokens, y respetando movimiento reducido (y el ajuste de E8 cuando exista).
- Una sola región viva por pantalla de juego: los cut-ins nuevos usan `live={false}`.
- Cambio de UI: `npm run ui:check` de los specs tocados a los tres tamaños, mirar las capturas, rúbrica ≥19/24 en el commit.
- Las doradas solo se regraban en los paquetes 9 (duraciones de E2 y E6) y 11 (valores por defecto de E7), en el mismo commit que el cambio, revisando el diff; junto con `registry.json`, los `default*Config` de shared y `config-cases.json` que toquen.
- E1 y E3 afectan a todos los specs e2e: «¡Listo!» va en el helper común de inicio, las capturas de resultados se hacen antes de los 20 s, y la suite e2e completa pasa antes de fusionar los paquetes 3 y 7.
- Tests acotados a lo tocado, más typecheck y lint; `./gradlew check` en los paquetes con Java. Antes de fusionar, suites completas de web y shared.

## Paquetes y orden

1 robustez y sala (error, confirmación, enlace, sala vacía, saltar al contenido, detalles de legibilidad) ·
2 núcleo de movimiento (transición de fases y rondas, celebración, fallo, ritmo y tokens de duración, `ScoreValue`, `useOutcomeCue`, `MomentCutin`) ·
3 sala en Java (E3, E4, E5) · 4 móvil y accesibilidad (teclado, títulos, marcas, E11) ·
5 momentos («¡Te toca!», juegos sociales, marcadores) · 6 ajustes (E8, atajos visibles, borradores) ·
7 intro y ayuda (E1 y «Cómo se juega») · 8 coherencia visual (tonos, estados vacíos, `Notice`, literales, parte H) ·
9 motores (E2, E6) · 10 cabeceras al marco común · 11 presets (E7).

Dependencias. Web: 1 → 2 → 6 → 5 → 10 (`RoomPage`, `GameScreen`, el ajuste de movimiento antes de las animaciones nuevas, los `*Parts` de los juegos); 2 → 4; 8 → 10. Java (Gradle de uno en uno): 3 → 7 → 9 → 11. El paquete 3 añade la cuenta atrás a `ResultsShell`, que también toca el 2: el que fusione segundo hace rebase.
