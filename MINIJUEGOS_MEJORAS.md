# Mejoras para los 6 primeros minijuegos de Pokémon Universe

> **Nota (2026-11-05):** el servidor Node y los motores TS se quitaron en `e40b70c` («Quitar el servidor Node y los motores TS»). Las referencias `fichero:línea` a `packages/shared/src/games/<id>/server.ts` y `apps/server/` apuntan al historial de git, y donde este documento dice «TS y Java en el mismo commit», `golden:export` o `registry:export`, el flujo actual es solo Java: ver `backend/src/main/java/es/pokemonuniverse/domain/game/engines/README.md`.

> Análisis hecho sobre el código real a fecha 2026-11-02, en la rama `etapa-2c-datos-administracion`. Revisado el 2026-11-03 sobre `90c2e07`. No se ha modificado código.
>
> Entre las dos versiones, los commits no tocan los motores TS, las pantallas ni el servidor Node (`git diff 8657ad6 90c2e07` está vacío en `packages/shared`, `apps/web/src/room`, `apps/web/src/games` y `apps/server/src`). Los bugs y las referencias `fichero:línea` de TS siguen vigentes.
>
> Nota sobre las referencias: algunos `.tsx` de `apps/web/src/room/` están escritos en muy pocas líneas, muy largas. En esos ficheros, la referencia `fichero:línea` apunta a la línea larga que contiene el código citado.
>
> Fuentes:
> - motores TS en `packages/shared/src/games/<id>/`;
> - pantallas en `apps/web/src/room/` y `apps/web/src/games/<id>/`;
> - salas y temporizadores en `apps/server/src/rooms/manager.ts`;
> - ports Java en `backend/src/main/java/es/pokemonuniverse/domain/game/engines/`, con sus fixtures golden en `backend/src/test/resources/golden/<id>/`.

### Cambios respecto a la versión del 2026-11-02

- **La fuga del catálogo está en Java.** En producción, `/api/pokemon` lo sirve el backend Java (`infra/nginx.conf:52`, proxy de Vite en `apps/web/vite.config.ts:16`), y `PublicPokemon.java` envía los mismos campos sensibles que Node. Se actualizan D1, S4, H8, T6 y §8.7.
- **§8.7 corregido.** Hay 18 pantallas que usan el catálogo, no 4. Ninguna lee del catálogo nada más que `id`, `name` y `sprite`, Bingo y Bluff Auction incluidos. Además, la URL del sprite contiene el número de Pokédex.
- **Valores por defecto y configuración guardada.** El funcionamiento de `migrateStoredGameConfig` (Node y Java) responde a §11.2: cambiar un valor por defecto no llega a quien ya guardó su configuración, y renombrar la clave sí. Ver §3.7, §5.7 y §11.2.
- **La precarga de Shiny (S2) falla también en Java.** Se añade la evidencia (`ShinyVoteEngine.java:133-134`, `GameAssetService.preload`).
- **Recarga del catálogo tras la sincronización** (`f1a190d`). Afecta a la caché del selector (§8.7) y al determinismo de los retos diarios (§8.8).
- **Sincronización PokéAPI en Java** (§1.6). Es el sitio natural para los datos nuevos que piden los juegos: habilidad oculta y rareza de movimientos.
- **Métricas de base con la API de administración** (`/api/admin/games`) para medir la Fase 0 (§10).
- **Secciones reparadas:** §9 tenía una sola fila incompleta; ahora tiene 5 juegos, incluido el Type Matchup Quiz que citaba la Fase 4. La fila «Tema secreto» de §4.5 está completa.
- **§11.7 resuelta:** nadie fuera de los juegos usa `/api/pokemon`.

## Índice

0. [Resumen ejecutivo](#0-resumen-ejecutivo)
1. [Contexto técnico común](#1-contexto-técnico-común)
2. [Pokédex Distance](#2-pokédex-distance-pokedex-distance)
3. [Shiny Quiz](#3-shiny-quiz-shiny-vote)
4. [Pokémon Impostor](#4-pokémon-impostor-pokemon-impostor)
5. [Higher or Lower](#5-higher-or-lower-higher-lower)
6. [Type Duel](#6-type-duel-type-duel)
7. [Learnset Guess](#7-learnset-guess-learnset-guess)
8. [Mejoras transversales](#8-mejoras-transversales)
9. [Minijuegos nuevos](#9-minijuegos-nuevos)
10. [Plan de ejecución por fases](#10-plan-de-ejecución-por-fases)
11. [Preguntas abiertas globales](#11-preguntas-abiertas-globales)

---

## 0. Resumen ejecutivo

Los cinco problemas más graves que aparecen en el código:

1. **Partidas que pueden no terminar nunca.**
   - **Type Duel:** `TYPE_TIMEOUT`, `DISCONNECTED` e `INVALID_COMBINATION` no suman a `completedRounds`. Con dos jugadores ausentes pero conectados, la partida repite «Ronda N» sin fin.
   - **Pokémon Impostor:** un empate en la votación (también el 0–0 cuando nadie vota) vuelve a abrir `VOTING` indefinidamente.
2. **Fuga de respuestas por la API.** `/api/pokemon` envía al cliente el objeto `Pokemon` casi completo, ordenado por número de Pokédex: número, tipos, stats y `shinySprite`. Desde la pestaña de red del navegador se resuelven Pokédex Distance, Type Duel y Higher or Lower, y se facilita Shiny Quiz.
   - En producción responde Java: `PokemonController.java` y `PublicPokemon.java`, que solo quita `palette`. El equivalente Node, `apps/server/src/http/routes.ts:47-53`, ya no recibe esa ruta (nginx y Vite la mandan al backend).
   - La URL del `sprite` (`…/sprites/pokemon/<id PokéAPI>.png`) contiene el número de Pokédex en las formas por defecto.
3. **Copiar sale gratis.** Por defecto, Higher or Lower (`answerVisibility: REALTIME`) y Shiny Quiz (`showVotes: true`) muestran a quién ha votado cada jugador mientras la ronda sigue abierta. Pokédex Distance muestra en vivo el Pokémon que ha elegido cada rival.
4. **La desconexión es a la vez castigo y truco.** La presencia se aplica en el acto (`manager.ts`, `applyPresenceChange`), sin esperar la gracia de 30 s:
   - en Pokédex Distance, un microcorte elimina al jugador;
   - en Type Duel, desconectarse anula el duelo que vas perdiendo.
5. **Pistas sin filtrar en Impostor.** Un inocente puede escribir el nombre del Pokémon y regalar la partida a los impostores.

Tres mejoras de alto impacto y poco esfuerzo:
- poner tope a los desempates y a las rondas de Type Duel e Impostor;
- ocultar los votos hasta la revelación por defecto;
- crear un endpoint de catálogo «para el selector» que devuelva solo id, nombre y sprite por proxy.

---

## 1. Contexto técnico común

### 1.1 Contrato de los motores

Cada juego implementa `MiniGameModule` (`packages/shared/src/games/contracts.ts`):
- `createInitialState`, `start` y `handleAction(state, playerId, action, ctx)`;
- `handleTimeout` y, opcionalmente, `handlePresenceChange`;
- `getPublicState` y `getPlayerState` (proyección pública y privada);
- `getLifecycle`, `isFinished` y `getResults`.

`GamePhase` es una unión cerrada (`GAME_STARTING`, `ROUND_ACTIVE`, `ROUND_RESULTS`, `TIEBREAKER_ACTIVE`, `ROLE_REVEAL`, `CLUE_PHASE`, `VOTING`, …). Añadir una fase nueva obliga a ampliar la unión y su equivalente en Java.

Infraestructura que se puede reutilizar:
- `infrastructure/timing.ts`: `advanceTimedRound`, `resolveWhenRequiredPlayersComplete`, `setPlayerCooldown`;
- `infrastructure/random.ts`: `shuffled`, `contentDeck`;
- `infrastructure/runoff-voting.ts`;
- `infrastructure/guessing-round.ts`: `recordGuessSolve`.

Puntos de sesión (`packages/shared/src/scoring.ts`):
- `pointsForPosition(n, pos)`: base `n − pos + 1`, multiplicada ×2, ×1,5 y ×1,2 en el podio.
- `sessionPointsForResults`: quien termina con 0 puntos de juego recibe 0 de sesión. Los puntos internos de cada juego **no** cuentan para la sesión, solo la posición.

### 1.2 Transporte

- Cliente → servidor: solo `game:action {gameInstanceId, actionEpoch, action}`. `actionEpoch` es el JSON de `[phase, roundNumber, roundStartedAt, turnIndex, voteRoundNumber…]` (`infrastructure/lifecycle.ts`).
- Servidor → cliente: `room:state` (vista pública más `gamePlayerState` privado) y `session:restored` al reconectar.
- **Ninguno de los 6 juegos tiene eventos de socket propios.**
- `manager.ts:450-472`: si el plazo ya ha vencido, ejecuta `handleTimeout` antes de la acción. El estado resultante **se guarda aunque la acción se rechace**.
- Hay un único `setTimeout` por sala, programado en `lifecycle.nextDeadline + 5 ms`.

### 1.3 Presencia y reconexión

- Al desconectarse un jugador se llama a `applyPresenceChange` en el momento. El motor deja de contar con él enseguida.
- `RECONNECT_GRACE_MS` (30 s por defecto, configurable de 5 a 300 s) solo decide cuándo pasa a `LEFT`.
- Un jugador cuenta como «requerido» si `connected !== false && active !== false` (`contracts.ts:34-37`).
- `allConnectedRequiredCompleted` sobre una lista vacía devuelve `true`: si todos se desconectan, la ronda se resuelve al instante.

### 1.4 Lo que ya existe y lo que no

| Existe | No existe |
|---|---|
| Espectadores (`MemberRole = PLAYER \| SPECTATOR`) | Chat de sala |
| Saltar juego por voto unánime (`game:skip-vote:set`) | Logros, rankings, leaderboard |
| Revancha o continuar (`room:continue-session`) | Sonidos de interfaz (solo hay `<audio>` en Cry Quiz) |
| Votación del siguiente juego (15 s + 3 s) | i18n (los textos en español están escritos directamente en el código) |
| Persistencia: `GameHistory`, `PlayerGameResult`, `UserStats`, `UserGameStats` (métricas de `manifest.profileStats`) | Librería de animación (solo keyframes CSS) |
| `HowToPlayCarousel`, `ServerTimer`, `PokemonSelector`, `PokemonTypeBadge`, `GenerationSelector` | Modo diario o en solitario persistente |

### 1.5 Datos disponibles para filtros

El catálogo y la BD ya tienen:
- generación, `isDefault` (formas regionales), tipos, las 6 stats y el BST;
- altura, peso, color, habilidades y etapa evolutiva;
- legendario o mítico, cadena evolutiva y entradas de Pokédex;
- learnsets por nivel y generación, `shinySprite`, `cries` y `palette`.

`packages/shared/src/pokemon/conditions/` ya implementa condiciones por generación, rango de Pokédex, tipo, combinación y número de tipos, stat, BST, altura, peso, etapa, legendario, color y habilidad. Las usan Bingo y Bluff Auction.

**Hoy ninguno de los 6 juegos ofrece filtro por tipo.** Todos se limitan a `generations`.

### 1.6 Migración a Java: qué implica cada propuesta

- Los 28 motores están portados a Java como **traducción literal** y el TS está congelado (`backend/.../engines/README.md`).
- Hasta la etapa 2D, **cualquier cambio de motor** va en el mismo commit en TS y en Java, con:
  - el escenario golden actualizado (`packages/shared/golden/scenarios/<id>.ts`);
  - `npm run golden:export`;
  - el test Java.
- Un juego nuevo necesita además:
  - registrarse en `portedEngines` de `ClasspathGameRegistryLoader`;
  - subir el recuento que comprueban `GoldenRegistryConsistencyTest` y `ClasspathGameRegistryLoaderTest`;
  - ejecutar `npm run registry:export`.
- **Qué debería vivir ya en Java:**
  - Las rutas REST nuevas (catálogo reducido, logros, ranking, reto diario) conviene crearlas directamente en Java (`adapters/in/rest`), actualizando `infra/nginx.conf`, el proxy de Vite y `npm run api:types`.
  - Los cambios de esquema siguen pasando por Prisma hasta la etapa 2. No se puede añadir una `V2__` en Flyway (`AGENTS.md`).
- Las salas en Java (`/ws`) solo están activas con `VITE_REALTIME=java`. Por eso la lógica nueva de sala (gracia por juego, chat) hay que escribirla en `manager.ts` **y** en `RoomCoordinator`.
- **Datos nuevos del catálogo.** La sincronización con PokéAPI ya existe en Java (etapa 2C, apagada por defecto con `BACKEND_DATA_SYNC_ENABLED`). Después de sincronizar, `PokemonCatalogService.reloadGameCatalogs` recarga el catálogo: las partidas nuevas usan los datos nuevos y las que están en curso conservan los suyos. Los datos derivados que piden las propuestas se calculan en esa sincronización (Java), no en el `seed.ts` de Node:
  - la rareza de cada movimiento, para «Movimiento firma» (§7.9).
- **Configuración guardada.** `migrateStoredGameConfig` (`apps/server/src/game-configs/service.ts:64`; espejo en `StoredGameConfigMigration.java`) reconstruye la configuración recorriendo las claves del valor por defecto (`mergeKnown`). Conserva cualquier valor guardado que siga siendo válido y descarta las claves que ya no existen. `manager.ts:286` guarda la configuración completa cada vez que un usuario registrado la cambia. En la práctica:
  - cambiar **solo el valor por defecto** de un campo no llega a quien ya guardó una configuración de ese juego;
  - **renombrar la clave** (o cambiar su tipo o enumerado) sí llega: la clave vieja se descarta y la nueva toma el valor por defecto nuevo.

### 1.7 Inconsistencias entre el panel y el esquema

| Juego | Campo | Panel web | Esquema Zod |
|---|---|---|---|
| Higher or Lower | `rounds` | 1–30 (`games/higher-lower/ConfigPanel.tsx:98`) | 1–50 |
| Type Duel | `rounds` | 1–20 (`games/type-duel/ConfigPanel.tsx:13`) | 1–50 |
| Shiny Quiz | `rounds` | 1–20 (`games/shiny-vote/ConfigPanel.tsx:23`) | 1–50 |
| Impostor | `impostorCount` | 1–3 | 1–10 |
| Impostor | `clueSeconds` | hasta 45 | 10–120 |
| Impostor | texto de pista | `maxLength=50` en el input | 200 en el esquema, 25 code points en el motor |

### 1.8 Estilo visual de referencia

**No hay `DESIGN.md` en el repo** (comprobado de nuevo el 2026-11-03). El prompt lo cita como adjunto, pero no está (ver §11). «Arcade DS» solo aparece en `docs/superpowers/plans/2026-10-31-playwright-e2e.md:269`, como «Rediseño al look "Arcade DS" de Inazuma», y marcado como fuera de alcance.

Las propuestas de UI de este documento se basan en lo que sí existe:
- tokens: `ink`, `cream`, `surface`, `surface-raised`, `night`, `berry`, `electric`, `aqua`, `leaf`, `focus`;
- fuentes: Fredoka para títulos y Nunito para texto;
- clases de `apps/web/src/styles.css`: `card`, `panel`, `btn-*`, `chip`, `ranking-row`, `modal-dialog`, `reveal-pop`, `timer-pulse`, `shiny-*`;
- reglas de `AGENTS.md`: texto de al menos 12 px, animar solo `transform` y `opacity`, y respetar `prefers-reduced-motion`;
- rúbrica de `docs/visual-review.md`: mínimo 19/24. La línea base actual es 7/24 en Juego y 12/24 en Lobby.

Cuando el documento dice «estilo Arcade DS» es una hipótesis de trabajo que hay que confirmar con el DESIGN.md real:
- doble pantalla, con la información arriba y la acción abajo;
- marcos de borde grueso;
- cut-ins al estilo de un cartucho.

**Resuelto (2026-11-04):** la hipótesis «Arcade DS» se confirmó con `InazumaElevenManager/docs/DESIGN.md` y el rediseño se hizo en las fases F0–F9 (toda la web, incluidos los 28 minijuegos). La referencia de UI es ahora `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md`: los tokens, clases y reglas de esta sección (12 px, `btn-*`, `card`, Fredoka…) ya no existen y las reglas vigentes están en `AGENTS.md`.

---

## 2. Pokédex Distance (`pokedex-distance`)

### 2.1 Cómo funciona hoy

**Ficheros**
- Motor: `packages/shared/src/games/pokedex-distance/{config,rules,types,server}.ts`.
- Interfaz:
  - pantalla de juego: `apps/web/src/room/PokedexDistanceGame.tsx`;
  - resultados genéricos: `apps/web/src/room/Results.tsx`;
  - lista de jugadores: `apps/web/src/room/PlayerList.tsx`;
  - configuración: `apps/web/src/games/pokedex-distance/ConfigPanel.tsx`.
- Java: `engines/pokedexdistance/`.

**Configuración** (`config.ts:5-15`)
- `generations`: por defecto todas.
- `roundSeconds`: entre 10 y 60 s, 20 por defecto.
- Al arrancar se exigen 2 jugadores o más y un pool con al menos tantos Pokémon como jugadores (`server.ts:125-137`).

**Flujo**

`GAME_STARTING` → `ROUND_ACTIVE` (o `TIEBREAKER_ACTIVE`) → `ROUND_RESULTS` (6 s, `RESULTS_DURATION_MS`, `server.ts:22`) → siguiente ronda o `GAME_RESULTS`.

1. Se elige al azar un número de Pokédex objetivo del pool (`selectTarget`) y se muestra como `#025`.
2. Cada jugador elegible lanza `SELECT_POKEMON {pokemonId}`. Cada Pokémon solo puede elegirlo un jugador por ronda (`lockedPokemonIds`, rechazo «Ese Pokémon ya ha sido elegido.»).
3. La ronda se cierra cuando han respondido todos los conectados o cuando se agota `roundEndsAt`.
4. La resolución (`resolveRound`, `server.ts:87-116`) sigue este orden:
   1. Si alguien no ha respondido, se eliminan **todos** los que no respondieron (`NO_RESPONSE`) y nadie más.
   2. Si varios empatan en la peor distancia, se juega un desempate solo entre ellos, con objetivo nuevo y `tiebreakDepth + 1`, sin avanzar `roundNumber`.
   3. En otro caso se elimina al único más lejano (`FARTHEST`).
5. La partida termina cuando quedan 1 o 0 supervivientes. Si no queda ninguno, `winnerId = null` («Partida desierta»).

**Puntuación** (`rules.ts:15-41`)
```ts
const position = elimination.remainingAfter + 1; // los que caen a la vez comparten posición
points: !state.winnerId && position === 1 ? 0 : pointsForPosition(total, position)
```

**Estadísticas:** `exactHits`, `roundsSurvived`, `selections` y `averageDistance`.

**Visibilidad**
- Pública:
  - `targetDexNumber`, `eligibleIds`, `survivorIds` y `lockedPokemonIds`;
  - `selections` en vivo (nombre y sprite, sin número de Pokédex);
  - `lastRound`, con números y distancias, solo durante los resultados.
- Privada: `{canSelect, selection, exactHit}`.

**Pantalla**
- Objetivo grande con el icono `Target`.
- Barra de tiempo con `timer-pulse` cuando quedan 5 s o menos.
- `PokemonSelector`, que oculta el número de Pokédex.
- Barra lateral `PlayerList` con «→ Pokémon» por jugador.
- Mensajes «¡EXACT HIT!» y «Estás observando».
- En `ROUND_RESULTS`, una tarjeta por jugador con color según el resultado: berry si queda eliminado, electric si empata, leaf si acierta exacto.

**Sockets:** solo `game:action` y `room:state`.

### 2.2 Problemas detectados

| # | Problema | Evidencia |
|---|---|---|
| D1 | **Fuga del número de Pokédex.** El selector lo oculta, pero `/pokemon` envía el `nationalDexNumber` de todos los Pokémon, ordenado por número. Anula el reto principal del juego. Aunque se quite el campo, la URL del `sprite` (`…/sprites/pokemon/<id PokéAPI>.png`) lo sigue llevando en las formas por defecto. | `backend/.../adapters/in/rest/pokemon/PublicPokemon.java` (la ruta la sirve Java), `apps/server/prisma/seed.ts:166`; antes `apps/server/src/http/routes.ts:47-53` |
| D2 | **Ventaja por esperar.** Las `selections` públicas muestran nombre y sprite de lo que ha elegido cada uno. Quien elige el último sabe contra qué compite y puede apostar justo a no ser el más lejano. | `PlayerList.tsx:57,64` |
| D3 | **Quien llega primero bloquea Pokémon a los demás.** Además de la ventaja de esperar, el más rápido se queda los Pokémon «exactos» obvios (por ejemplo, el #001). | `lockedPokemonIds` |
| D4 | **`roundsSurvived` se suma al seleccionar, no al sobrevivir.** El eliminado por `FARTHEST` también lo suma, y cada desempate añade uno más. El bug también está en Java (`afterSelection`). | `server.ts:160` |
| D5 | **Un microcorte elimina.** Si el resto ya ha respondido, la ronda se resuelve en el acto y el desconectado cae por `NO_RESPONSE`. No se tiene en cuenta la gracia de reconexión. | test `server.test.ts:193-202` |
| D6 | **Desempates sin límite.** Un empate tras otro mantiene la partida activa. | `server.test.ts:128` |
| D7 | **Formas regionales.** `byId` acepta formas (`isDefault: false`) y el motor solo comprueba la generación. Una acción hecha a mano podría elegir otra forma con el mismo número de Pokédex que un Pokémon ya bloqueado. | `server.ts:152`, `catalog.ts:35,58` |
| D8 | **Sin filtros salvo generación, ni modo de puntos.** Es pura eliminación: el primero en caer se pasa el resto de la partida mirando. | `config.ts` |
| D9 | **Nombre de test desactualizado:** se llama «four-second result» pero comprueba 6 s. | `server.test.ts:179-186` |
| D10 | **Pista privada que no aporta.** El jugador ve «EXACT HIT» en el acto, pero no la distancia hasta que se revela la ronda. | `PokedexDistanceGame.tsx` |

### 2.3 Mejoras de jugabilidad

- **Selección a ciegas (por defecto).**
  - Durante `ROUND_ACTIVE` solo se publica `selectedIds` (quién ha elegido), no qué.
  - El bloqueo de duplicados pasa a resolverse al revelar: si dos jugadores eligen el mismo Pokémon, los dos reciben la misma distancia.
  - Así desaparecen D2 y D3.
- **Gracia por desconexión.** Antes de resolver con `NO_RESPONSE`, se espera a `min(roundEndsAt, desconexión + 10 s)` (ver §8.3). Si el jugador vuelve y responde, no cae.
- **Límite de desempates.**
  - Si `tiebreakDepth >= 3`, se desempata por quién respondió antes (`selectedAt`), o caen todos los empatados.
  - Hace falta decidir cuál de las dos; queda como pregunta abierta.
- **Tolerancia exacta como recompensa.** Un `EXACT HIT` da un «escudo» que salva de una eliminación futura. Hace la partida más tensa y permite remontar.
- **Objetivo con pista.**
  - Opción `targetHint`, que muestra la generación del objetivo o su tipo, para jugadores novatos.
  - O lo contrario, para expertos: ocultar el número y mostrar solo la región («Pokédex de Johto, posición 152–251»).
- **Filtros.** Reutilizar `pokemon/conditions` para limitar el pool por tipo y por legendario. Con un pool limitado, el reto pasa a ser «¿qué Pokémon de tipo Fuego tiene un número cercano al 300?».
- **Ritmo.** Bajar `RESULTS_DURATION_MS` de 6 s a 4 s cuando no hay desempate, y que el host pueda pulsar «Siguiente».

### 2.4 Mejoras de UX/UI

- **Onboarding en 3 pasos** con `HowToPlayCarousel`:
  1. «Te damos un número de Pokédex».
  2. «Elige el Pokémon cuyo número esté más cerca».
  3. «El más lejano cae. El último en pie gana».
- **Feedback:**
  - Al revelar la ronda, una **regla numérica horizontal**: el objetivo en el centro y los sprites de los jugadores colocados según su número, con la distancia en un chip.
  - El eliminado se marca con `berry` y una animación `transform: translateY` + `opacity`.
  - Con `prefers-reduced-motion`, la regla se muestra estática.
- **Momento «wow».** En un EXACT HIT, cut-in a pantalla completa (`reveal-pop` sobre `electric`) con el sprite del jugador y el número. Si hay sonido (ver §8.6), un «ding» corto.
- **Tensión.** Los últimos 5 s ya pulsan con `timer-pulse`. Falta un contador de «X de Y han elegido» bien visible arriba.
- **Resultados:**
  - Gráfica de la distancia por ronda de cada jugador.
  - Mejor acierto de la partida.
  - Ronda en la que cayó cada uno.
  - Hoy `Results.tsx` es genérico y solo muestra aciertos exactos y distancia media.
- **Eliminados:** cambiar el panel «Estás observando» por un **minijuego paralelo** en el que apuestan (sin puntos de sesión) quién caerá en la siguiente ronda.

### 2.5 Nuevos modos de juego

| Modo | Jugadores | Reglas | Por qué es divertido |
|---|---|---|---|
| **Por puntos (Clásico+)** | 2–12 | Nadie queda eliminado. N rondas fijas; cada ronda da `max(0, 100 − distancia)` puntos, y +50 por acierto exacto. | Nadie se pasa la partida mirando. Premia la precisión de forma continua. |
| **Reto diario** | 1 | Cinco objetivos iguales para todo el mundo ese día (semilla = fecha). La puntuación es la suma de distancias. Se puede compartir el resultado («🎯 0·3·12·1·7»). | Engancha y da un motivo para volver cada día. Encaja con el `random` inyectado del motor. |
| **Contrarreloj de rachas** | 1+ | 60 s en total; cada objetivo hay que dejarlo a distancia ≤ 10. El objetivo cambia en cuanto se cumple. Gana quien encadena más. | Ritmo frenético, ideal para practicar. |
| **Por equipos** | 4–12 (2 equipos) | Cuenta la media de distancias de cada equipo. El peor equipo pierde un «corazón» (3 por equipo). | Cooperación: hay que repartirse rangos («yo el 1–150, tú el 151–300»). |
| **Pokédex regional** | 2+ | El objetivo usa el número de una Pokédex regional (`PokemonPokedexNumber`) en vez del nacional. | Rejugabilidad para veteranos. Los datos ya existen en la BD. |

### 2.6 Progresión y meta

- **Logros:**
  - «Francotirador»: 3 aciertos exactos en una partida.
  - «Superviviente»: ganar sin haber estado nunca en un desempate.
  - «Enciclopedia»: acertar exacto un número mayor que 900.
- **Rachas:** días seguidos jugando el reto diario.
- **Estadísticas de perfil.** Corregir `roundsSurvived` (D4) y añadir:
  - `bestDistance` (MIN);
  - `tiebreaksWon` (SUM).
- **Cosméticos:** marco de avatar «Pokédex» al llegar a 50 aciertos exactos acumulados.

### 2.7 Impacto técnico

- **shared:**
  - Nueva opción `selectionVisibility: 'HIDDEN' | 'LIVE'`, con `HIDDEN` por defecto.
  - Desempate con `maxTiebreaks`.
  - Corregir `roundsSurvived`.
  - Validar `isDefault` en `SELECT_POKEMON`.
  - Nuevo campo `mode: 'ELIMINATION' | 'POINTS'`.
  - Escenario golden nuevo: selección oculta y tope de desempates.
- **front:**
  - `PlayerList` sin el Pokémon elegido en modo HIDDEN.
  - Regla numérica en los resultados de ronda.
  - Resultados propios, sustituyendo el `Results.tsx` genérico.
- **sockets:** no cambian.
- **API:** catálogo reducido (§8.7).
- **Java:**
  - Port espejo de `PokedexDistanceEngine`, `PokedexDistanceRules` y `PokedexDistanceConfig`, con las fixtures regeneradas.
  - El reto diario necesita un endpoint REST que **debería nacer en Java** (`GET /api/daily/pokedex-distance`) y persistir los resultados (tabla nueva vía Prisma hasta la 2D).

### 2.8 Priorización

| Propuesta | Impacto | Esfuerzo | Orden |
|---|---|---|---|
| Catálogo reducido sin número de Pokédex (D1) | Alto | M | 1 |
| Selección oculta por defecto (D2, D3) | Alto | S | 2 |
| Corregir `roundsSurvived` y validar `isDefault` (D4, D7) | Medio | S | 3 |
| Gracia por desconexión (D5) | Alto | M | 4 |
| Tope de desempates (D6) | Medio | S | 5 |
| Regla numérica al revelar y onboarding | Medio | M | 6 |
| Modo por puntos | Alto | M | 7 |
| Reto diario | Medio | L | 8 |
| Equipos y Pokédex regional | Bajo | M | 9 |

### 2.9 Preguntas abiertas

- Al llegar al tope de desempates, ¿se desempata por velocidad o caen todos los empatados?
- ¿El bloqueo de Pokémon único por ronda es una regla deseada (estrategia) o un efecto secundario? Si se quiere mantener, ¿basta con que sea a ciegas?
- ¿Se cuentan las formas regionales como elegibles, con el mismo número que su forma base?

---

## 3. Shiny Quiz (`shiny-vote`)

### 3.1 Cómo funciona hoy

**Ficheros**

- Motor: `packages/shared/src/games/shiny-vote/{config,filters,rules,types,server}.ts`
- Pantalla: `apps/web/src/room/ShinyVoteGame.tsx`
- Componentes:
  - `ShinyGameHeader`
  - `ShinyOptionCard`
  - `ShinyVoteStatus`
  - `ShinyGameSidebar`
  - `VoterSummary`
- Atajos de teclado: `interaction.ts`
- Resultados: `ShinyVoteResults.tsx`
- Java: `engines/shinyvote/`

**Configuración** (`config.ts:8-26`)

| Opción | Valores | Por defecto |
|---|---|---|
| `generations` | — | — |
| `roundSeconds` | 10–60 | 20 |
| `rounds` | 1–50 (el panel solo llega a 20) | 10 |
| `candidateMode` | `SAME_POKEMON` o `DIFFERENT_POKEMON` | `SAME_POKEMON` |
| `optionCount` | 3–6 | 4 |
| `showVotes` | sí / no | `true` |

El juego admite partidas de 1 jugador o más y está marcado como recomendado.

**Opciones de cada ronda** (`createOptions`, `server.ts:52-75`)

- Una opción es el shiny real: `shinySprite ?? sprite`, sin recolorear.
- Las demás son falsas. Cada una parte del sprite shiny oficial (con probabilidad 0,35) o del normal, y se le aplica una de 6 paletas en orden fijo (`fakePaletteIndex++`): matiz +28°, +76°, … (`filters.ts:6-13`).
- El servidor genera cada imagen con `PALETTE_RECOLOR` o `PIXEL_ART` mediante `resolveAsset`, y la sirve por la URL de proxy `/api/rooms/:code/games/:token/rounds/:n/options/:id/sprite`.

**Flujo**

`GAME_STARTING` → `ROUND_ACTIVE` → `ROUND_RESULTS` (3 s, `REVEAL_DURATION_MS`) → siguiente ronda, o `GAME_RESULTS` cuando `roundNumber >= rounds`.

- Acción: `VOTE {optionId: 'A'..'F'}`.
- El voto no se puede cambiar y solo vota quien esté conectado.
- La ronda se cierra cuando han votado todos los conectados o se acaba el tiempo.

**Puntuación** (`rules.ts:7-15`)

```ts
const SHINY_ORDER_BONUSES = [3, 2, 1];
shinyPointsForOrder(order) = 1 + (SHINY_ORDER_BONUSES[order - 1] ?? 0); // 4, 3, 2, 1, 1…
```

- Fallar o no votar da 0 puntos.
- El orden se decide por `votedAt` del servidor.
- Estadísticas: `correctVotes`, `votes`, `incorrectVotes`, `unanswered` y `accuracy`.

**Visibilidad**

- Pública:
  - `options` (id, nombre y sprite por proxy);
  - `votes` (solo si `showVotes`);
  - `votedPlayerIds`, `pendingPlayerIds` y `scores`;
  - `correctOptionId`, solo durante la revelación.
- Privada: `{canVote, vote, roundResult}`.

**Interfaz**

- Temporizador en píldora; en los últimos 3 s cambia a `shiny-timer-critical`, con barra `shiny-timer-bar`.
- Chips de permisos.
- Cartas `shiny-option-card` con los estados `-selected` y `-correct`.
- Primero se selecciona y después se confirma. Atajos: A–F o 1–6, y Enter para confirmar.
- Barra lateral con pendientes y clasificación en vivo.

### 3.2 Problemas detectados

| # | Problema | Evidencia |
|---|---|---|
| S1 | **Se puede copiar el voto de otros.** Con `showVotes = true`, que es el valor por defecto, `VoterSummary` muestra avatares y recuento de votos **mientras la ronda sigue abierta**. Esperar y copiar asegura al menos +1. | `games/shiny-vote/ShinyOptionCard.tsx:23,80` |
| S2 | **La precarga no sirve.** `preloadImage(option.sprite)` guarda en caché la versión `ORIGINAL`, pero las peticiones reales usan `PIXEL_ART` o `PALETTE_RECOLOR` con otra clave. Cada sprite transformado se vuelve a descargar de GitHub la primera vez y se ve un spinner al empezar la ronda. Java tiene el mismo bug: `GameAssetService.preload(source)` precarga la fuente original y `cacheKey` incluye la transformación. | `server.ts:80`, `apps/server/src/http/game-image-cache.ts:146-160`; Java: `ShinyVoteEngine.java:133-134`, `application/assets/GameAssetService.java:42,53` |
| S3 | **Un «shiny» que no lo es.** El pool no excluye Pokémon sin `shinySprite`, y en ese caso el sprite «correcto» es el normal. | `server.ts:49` |
| S4 | **Se puede resolver desde el cliente.** `pokemonId` es público y `/api/pokemon` expone `shinySprite`. | `backend/.../adapters/in/rest/pokemon/PublicPokemon.java` (la ruta la sirve Java); antes `routes.ts:47-53` |
| S5 | **Las falsas son predecibles.** Las paletas se aplican siempre en el mismo orden empezando por el índice 0, así que un jugador habitual aprende a reconocer el «+28°». | `filters.ts:6-13` |
| S6 | **Revelación corta y sin feedback del fallo.** Dura 3 s y quien falla no ve «+0» ni qué opción eligieron los demás si `showVotes = false`. | `REVEAL_DURATION_MS` |
| S7 | **La dificultad no se puede ajustar.** Solo cambia el número de opciones. No hay forma de elegir falsas más o menos parecidas al real. | `filters.ts` |
| S8 | **El panel no llega al máximo de rondas** del esquema (20 frente a 50). | `games/shiny-vote/ConfigPanel.tsx:23` |

### 3.3 Mejoras de jugabilidad

- **Votos ocultos hasta la revelación por defecto.** `showVotes` pasaría a significar «mostrar quién votó qué al revelar». Si se mantiene el modo en vivo, se llamaría `showVotesLive` y se avisaría en el lobby de que permite copiar.
- **Filtrar el pool por `shinySprite`.** Si un Pokémon no lo tiene, no se puede elegir (corrige S3).
- **Dificultad por distancia de color**:
  - **Fácil:** paletas lejanas (±120°).
  - **Normal:** las 6 paletas actuales, barajadas con `shuffled`.
  - **Difícil:** paletas cercanas (±15–30°), más una falsa construida sobre el shiny oficial con un pequeño desplazamiento de matiz.
  - **Experto:** las falsas son los shinies de otros Pokémon de la misma línea evolutiva.
- **Barajar las paletas** con `shuffled` en cada ronda (corrige S5).
- **Bonus por racha** de aciertos consecutivos, igual que en Higher or Lower, para premiar la constancia y no solo la rapidez.
- **Filtros** por tipo y por legendario o mítico, reutilizando `pokemon/conditions`.

### 3.4 Mejoras de UX/UI

- **Onboarding**:
  1. «Uno de estos es el shiny oficial».
  2. «Los demás están recoloreados».
  3. «Cuanto antes aciertes, más puntos (4/3/2/1)».
- **Precarga corregida.** Precargar la URL transformada (S2) y mostrar `skeleton` hasta que estén todas las cartas, para que nadie arranque con ventaja.
- **Revelación «wow»:**
  - La carta correcta gira (`transform: rotateY`) y muestra un destello ✨ animado con `opacity`.
  - Las falsas se desaturan.
  - Después, «antes/después»: el sprite normal junto al shiny real.
  - Con reduced-motion, cambio sin animación.
- **Feedback del fallo.** Chip `berry` con «+0» y, al revelar, la opción propia marcada con ✗ y la correcta con ✓.
- **Duración de la revelación** configurable entre 3 y 6 s. Por defecto 4 s, para que dé tiempo a ver el antes/después.
- **Resultados finales:**
  - Galería de los shinies de la partida con ✓/✗ por jugador.
  - Tiempo medio de voto.
  - El voto más rápido acertado.

### 3.5 Nuevos modos de juego

| Modo | Jugadores | Reglas | Por qué es divertido |
|---|---|---|---|
| **Shiny diario** | 1 | Diez rondas fijas por fecha, dificultad creciente y resultado para compartir (`✨✨❌✨…`). | Hábito diario, comparable entre amigos. |
| **Supervivencia** | 1+ | Un fallo y quedas fuera. Las falsas se parecen cada vez más al real. Gana quien llegue más lejos. | La tensión crece en cada ronda; partidas cortas o épicas. |
| **Contrarreloj** | 1+ | 60 s de bolsa común. Cada acierto suma +3 s y cada fallo resta −5 s. Las rondas pasan sin revelación larga. | Ritmo arcade y puntuaciones altas para comparar. |
| **Cazador inverso** | 2+ | Hay que encontrar la **falsa** entre varios shinies reales de distintos Pokémon (`DIFFERENT_POKEMON`). | Le da la vuelta a lo que ya sabes; reutiliza el mismo motor de assets. |
| **Por equipos** | 4+ | El equipo vota en conjunto: gana la opción con mayoría dentro del equipo, con votos visibles solo para los compañeros. | Debate rápido y cooperación. |

### 3.6 Progresión y meta

- **Logros**:
  - «Ojo de halcón»: 10 aciertos seguidos.
  - «Relámpago»: acertar en menos de 2 s.
  - «Coleccionista»: haber visto 100 shinies distintos.
- **Shinydex personal.** Registro de los shinies acertados alguna vez, mostrado en el perfil como álbum. Requiere persistir los ids acertados (`UserGameStats.metrics` como conjunto, o una tabla nueva).
- **Cosméticos**: brillo ✨ en el avatar durante la sesión para quien quede primero.

### 3.7 Impacto técnico

- **shared**:
  - `showVotes` se renombra (por ejemplo, `voteVisibility: 'REVEAL' | 'LIVE'`, con `REVEAL` por defecto). Solo cambiar el valor por defecto no llegaría a los usuarios que ya tienen guardado `showVotes: true` (§1.6).
  - Nuevo campo `difficulty`, y paletas generadas a partir de la dificultad.
  - `shuffled` para el orden de las paletas.
  - Filtrar el pool por `shinySprite`.
  - Nuevo campo `mode`.
  - Escenarios golden nuevos.
- **server**: precargar la URL transformada y cachear `sourceBuffer` en `game-image-cache.ts`. En Java, `preloadImage` debe recibir la `AssetResolution` completa (o la clave de caché), no solo `option.sprite()`.
- **front**:
  - `VoterSummary` solo al revelar.
  - Animación de revelación.
  - Galería en los resultados.
- **API**: catálogo reducido sin `shinySprite` (§8.7).
- **Java**:
  - Hacer espejo de `ShinyVoteEngine` y de los filtros de paleta.
  - El caché de imágenes del proxy de assets en Java (`GameAssetController`) necesita el mismo arreglo de precarga.

### 3.8 Priorización

| Propuesta | Impacto | Esfuerzo | Orden |
|---|---|---|---|
| Votos ocultos hasta la revelación (S1) | Alto | S | 1 |
| Corregir la precarga (S2), en Node y Java | Alto | M | 2 |
| Filtrar sin `shinySprite` y barajar paletas (S3, S5) | Medio | S | 3 |
| Feedback del fallo y revelación 4 s (S6) | Medio | S | 4 |
| Dificultad por distancia de color (S7) | Alto | M | 5 |
| Revelación animada y galería final | Medio | M | 6 |
| Modo Supervivencia y Contrarreloj | Medio | M | 7 |
| Shiny diario y Shinydex | Medio | L | 8 |

### 3.9 Preguntas abiertas

- ¿Hay que mantener los votos en vivo como opción (para partidas «sociales») o eliminarlos del todo?
- ¿El «shiny oficial» de las formas especiales (Gigamax, megas) entra en el pool? Hoy `forGenerations` no incluye formas.

---

## 4. Pokémon Impostor (`pokemon-impostor`)

### 4.1 Cómo funciona hoy

**Ficheros**
- Motor: `packages/shared/src/games/pokemon-impostor/{config,rules,types,server}.ts`.
- Pantalla: `apps/web/src/room/PokemonImpostorGame.tsx`, con `RoleCard`.
- Resultados: `PokemonImpostorResults.tsx`.
- Port Java: `engines/pokemonimpostor/`.

**Configuración** (`config.ts:5-19`)
- `generations`.
- `impostorCount`: de 1 a 10, por defecto 1.
- `clueSeconds`: de 10 a 120 s, por defecto 15.
- `voteSeconds`: de 10 a 90 s, por defecto 20.
- Al arrancar se exige `impostorCount * 2 < jugadores` (`server.ts:182`). Esta regla no está en `config-readiness.ts`.

**Flujo**
1. `ROLE_REVEAL` (5 s).
   - Los inocentes ven el sprite y el nombre del Pokémon secreto.
   - El impostor ve «No conoces el Pokémon. Intenta disimular.».
   - Los impostores **no se conocen entre sí**.
2. `CLUE_PHASE`.
   - Los vivos y conectados hablan por turnos en orden aleatorio. Si el orden sale igual que el anterior, se rota.
   - Acción `SUBMIT_CLUE {text}`: `trim` + NFC, como máximo 25 code points y una por ronda.
   - Si se agota el tiempo, el turno queda como `TIMEOUT`. Si el jugador está desconectado, queda como `DISCONNECTED`.
3. `VOTING`.
   - Acción `VOTE {targetId}`: no se puede votar a uno mismo ni cambiar el voto.
   - La ronda se cierra cuando votan todos los requeridos o se acaba el tiempo.
4. `VOTE_RESULTS` (3 s): recuentos abiertos.
   - Si hay empate, se repite `VOTING` solo entre los empatados (`server.ts:130-144`).
   - Si no, pasa a `ELIMINATION`.
5. `ELIMINATION` (4 s): se revela el rol del eliminado.
   - Si hay ganador, termina la partida.
   - Si no, empieza otra ronda de pistas **con el mismo Pokémon**.

**Adivinar el Pokémon**
- Acción `GUESS_POKEMON {pokemonId}`.
- Solo pueden usarla impostores vivos, durante `CLUE_PHASE`, una vez por partida.
- Si aciertan, ganan los impostores (`server.ts:211-219`). Si fallan, no se avisa a nadie.

**Condición de victoria** (`rules.ts:4-10`)
```ts
if (impostors === 0) return 'INNOCENTS';
if (impostors >= innocents) return 'IMPOSTORS';
```

**Puntuación**
- Ganadores: posición 1 y 1 punto. Perdedores: posición 2 y 0 puntos.
- Puntos de sesión: `2N` para cada ganador.
- Estadísticas: `cluesSubmitted`, `votesCast`, `wasImpostor`, `survived`, `playedAs*`, `wonAs*` y `pokemonGuessed`.

**Visibilidad**
- Pública:
  - todas las pistas de todas las rondas, `clueOrder` y `currentCluePlayerId`;
  - `voteCompletedIds`: quién ha votado, sin decir a quién;
  - `lastVoteResult`, solo en los resultados;
  - `eliminationReveal`.
- Privada:
  - `secretPokemon`, para inocentes y eliminados;
  - `revealedRoles`, solo para eliminados y en el final;
  - flags de acción.

### 4.2 Problemas detectados

| # | Problema | Evidencia |
|---|---|---|
| I1 | **Pistas sin filtrar.** Solo se aplica `trim`: no se comprueba si la pista contiene el nombre del Pokémon ni si repite otra pista. | `server.ts:168-170` |
| I2 | **La votación puede no terminar nunca.** Si nadie vota, todos empatan a 0 y se repite la votación entre todos. Con 4 vivos y dos empatados que se votan entre sí, el empate se repite sin fin. No existe la opción de abstenerse o saltar. | `server.ts:132-141,261`, test l.234 |
| I3 | **No se explica la victoria por adivinanza.** El estado público no incluye el motivo del final y la pantalla de resultados solo dice «Ganan los impostores». | `PokemonImpostorResults.tsx` |
| I4 | **La adivinanza choca con el cambio de turno.** `actionEpoch` incluye `turnIndex`, así que un `GUESS_POKEMON` enviado justo cuando cambia el turno se rechaza con «turno ya ha cambiado». | `infrastructure/lifecycle.ts` |
| I5 | **Partidas de 3 jugadores muy frágiles.** Con 1 impostor, un solo voto erróneo deja 1 contra 1 y ganan los impostores. | `rules.ts:4-10` |
| I6 | **Un rechazo puede avanzar el estado.** Una adivinanza fuera de plazo devuelve el turno ya avanzado con `accepted: false`; Java lo replica. | `server.ts:207` |
| I7 | **Límites incoherentes** entre el input (50), el motor (25) y el esquema (200). Lo mismo con `impostorCount` y `clueSeconds`. | §1.7 |
| I8 | **Impostores ausentes.** Un impostor desconectado sigue vivo y cuenta para la paridad, así que hay que expulsarlo por votación. Si todos se desconectan en la fase de pistas, la partida se queda esperando sin plazo (`roundEndsAt = null`). | `server.ts:271-281` |
| I9 | **Error tardío.** La regla `impostorCount*2 < jugadores` no se valida en el lobby: el host descubre el error al pulsar «Empezar». | `config-readiness.ts` |
| I10 | **La adivinanza fallida no tiene coste.** No hay penalización y la partida continúa igual. | `server.ts:211-219` |
| I11 | **El Pokémon secreto no cambia.** Toda la partida usa el mismo Pokémon y, a partir de la ronda 3, las pistas se agotan o acaban siendo obvias. | — |

### 4.3 Mejoras de jugabilidad

**Filtro de pistas**
- Normalizar la pista: minúsculas, sin acentos (NFD sin diacríticos) y sin espacios.
- Rechazarla con un mensaje claro si contiene el nombre del Pokémon en cualquier idioma de `names`, o su número de Pokédex.
- Opcional: rechazar pistas idénticas a otra ya dada en la partida.

**Votación con salida garantizada**
- Añadir la opción **«Saltar»**, que cuenta como candidato.
- Si «Saltar» gana o empata con el máximo, no se elimina a nadie y se pasa a la siguiente ronda de pistas.
- Limitar la revotación a una sola vez. Si se repite el empate, nadie es eliminado.
- Así se cierra I2 y se evita la eliminación al azar, que el diseño actual rechaza a propósito (test l.234).

**Ronda de acusación final**
- Si tras N rondas (configurable, por defecto 3) no hay ganador, se hace una votación final obligatoria: quien más votos tenga es eliminado. Si hay empate, ganan los impostores.
- Pone un límite a la duración de la partida.

**Adivinanza con riesgo**
- Si el impostor falla, su rol se revela a todos. Esto convierte la adivinanza en una apuesta.
- Mover la adivinanza fuera del `actionEpoch` de turno. Por ejemplo, que el epoch de `GUESS_POKEMON` solo compruebe fase y ronda (I4).

**Equilibrio para 3–4 jugadores**
- Variante «Impostor con pista débil»: el impostor recibe la categoría del Pokémon, como su tipo principal.
- Con 3 jugadores, la paridad solo se comprueba después de la segunda ronda.

**Rejugabilidad**
- Opción `pokemonPerRound`: Pokémon nuevo en cada ronda de pistas, con impostores que siguen siendo los mismos.
- Filtros por tipo, por etapa evolutiva o «solo iniciales».

**Impostores que se conocen**
- Si hay 2 o más impostores, opción `impostorsKnowEachOther` (ver pregunta abierta).

**Desconexión**
- Si un impostor desconectado pasa a `LEFT`, se le elimina automáticamente revelando su rol.
- Si todos se desconectan en la fase de pistas, se fija un plazo de espera.

### 4.4 Mejoras de UX/UI

**Onboarding**
1. «Todos menos el impostor ven el Pokémon».
2. «Da una pista corta sin decir el nombre».
3. «Votad al sospechoso; el impostor gana si adivina el Pokémon o iguala en número».

**Revelación de rol (`ROLE_REVEAL`)**
- Tarjeta que se gira: dorso de Poké Ball y anverso con el rol, animada con `transform: rotateY`.
- Tarjeta del impostor en `berry` con silueta «?».
- Tarjeta del inocente en `aqua` con el sprite del Pokémon.

**Pistas**
- Burbujas de diálogo por jugador, en vez de una rejilla, con un contador de caracteres que se pone en `berry` al pasar de 20.
- Si el filtro rechaza la pista, aviso inline con «Tu pista revela el Pokémon».

**Votación**
- Al revelar, flechas votante → objetivo dibujadas sobre los avatares, con la suma animada.
- Momento «wow» en `ELIMINATION`: cut-in a pantalla completa con el nombre, seguido de «…era» y el rol, con una pausa de 1 s para generar tensión.

**Final**
- Pantalla de resultados que explica **por qué** se ganó: «X adivinó a Pikachu en la ronda 2» o «Paridad alcanzada».
- Línea de tiempo con pistas y votos por ronda.

**Eliminados**
- Ahora ven el Pokémon y los roles.
- Mejor añadir un canal «fantasma» (ver chat, §8.4) en el que solo hablan entre ellos, para que no rompan el juego desde fuera.

### 4.5 Nuevos modos de juego

| Modo | Jugadores | Reglas | Por qué es divertido |
|---|---|---|---|
| **Detective** | 5+ | Un jugador más, el «detective», ve el Pokémon. Si al final los impostores lo identifican, roban la victoria. | Añade una capa de engaño: los inocentes deben proteger al detective sin delatarlo. |
| **Una palabra** | 3+ | Las pistas son de una sola palabra (sin espacios) y hay 2 rondas fijas antes de la votación. | Más rápido y más tenso: cada palabra cuenta. |
| **Tema secreto** | 4+ | En vez de un Pokémon, los inocentes conocen un **tema**: un tipo, una generación, una región, un movimiento, una habilidad o un objeto. Se dan pistas igual que ahora y el impostor gana si adivina el tema (`GUESS_TOPIC`, con una lista cerrada de opciones). | Las pistas pueden ser más amplias y variadas, y cada partida es distinta aunque se repita el tema. Con tipos y generaciones se reutilizan datos que ya existen. |

### 4.6 Progresión y meta

- **Logros**:
  - «Maestro del disfraz»: ganar como impostor sin recibir ningún voto.
  - «Sabueso»: votar al impostor 5 partidas seguidas.
  - «Lectura en frío»: adivinar el Pokémon en la ronda 1.
- **Estadísticas de perfil**:
  - `winRate` como impostor y como inocente, calculado a partir de `playedAs*` y `wonAs*`, que ya existen;
  - `accurateVotes`, votos al impostor, que es una métrica nueva.
- **Cosméticos**: marco de avatar «sombra» para quien gane 10 veces como impostor.

### 4.7 Impacto técnico

**shared**
- Utilidad `clueRevealsSecret(text, pokemon)` en `pokemon/`.
- Candidato `SKIP` en la votación y tope de revotación.
- Campos de configuración `maxRounds` e `impostorsKnowEachOther`.
- `finishReason` en el estado público.
- Regla de paridad en `config-readiness.ts`.
- Epoch específico para la adivinanza.

**Socket / manager**
- Ningún evento nuevo.
- El epoch propio de la adivinanza requiere que `actionEpoch` admita un epoch por acción, o que el motor ignore `turnIndex` para `GUESS_POKEMON`. Afecta a `lifecycle.ts` y a su espejo en Java.

**front**
- Burbujas de pistas, cut-in de eliminación y pantalla de resultados con la línea de tiempo.
- Alinear `maxLength` con 25.

**Java**
- Espejo de `PokemonImpostorEngine`, que tiene 536 líneas.
- Fixtures golden nuevas: skip, filtro de pistas y tope de revotación.
- La normalización de texto debe coincidir exactamente entre `String.prototype.normalize('NFD')` en TS y `java.text.Normalizer` en Java. Hay que cubrirlo con un caso golden que incluya acentos y emojis.

### 4.8 Priorización

| Propuesta | Impacto | Esfuerzo | Orden |
|---|---|---|---|
| Votación con «Saltar» y tope de revotación (I2) | Alto | M | 1 |
| Filtro de pistas (I1) | Alto | M | 2 |
| `finishReason` y resultados explicativos (I3) | Medio | S | 3 |
| Regla de paridad en el lobby y límites coherentes (I7, I9) | Medio | S | 4 |
| Adivinanza fuera del epoch de turno (I4) | Medio | M | 5 |
| Expulsión automática de impostores ausentes (I8) | Medio | M | 6 |
| Revelación de rol y cut-in de eliminación | Medio | M | 7 |
| Modo Rápido para 3 jugadores (I5) | Alto | M | 8 |
| `pokemonPerRound`, Tema secreto y Detective | Medio | L | 9 |

### 4.9 Preguntas abiertas

- Que los impostores no se conozcan cuando hay más de uno, ¿es intencionado (más caos) o un descuido?
- ¿La adivinanza fallida debe tener coste (revelar al impostor) o es preferible mantenerla gratis?
- Si la ronda de pistas termina con todos desconectados, ¿se aborta la partida o se espera indefinidamente?

---

## 5. Higher or Lower (`higher-lower`)

### 5.1 Cómo funciona hoy

**Ficheros**
- Motor: `packages/shared/src/games/higher-lower/{config,rules,server,types}.ts`.
- Pantalla: `apps/web/src/room/HigherLowerGame.tsx`.
- Resultados: `HigherLowerResults.tsx`.
- Configuración: `apps/web/src/games/higher-lower/ConfigPanel.tsx`.
- Java: `engines/higherlower/`.

**Configuración** (`config.ts:12-26`)

| Opción | Valores | Por defecto |
|---|---|---|
| `generations` | lista de generaciones | — |
| `categories` | `DEX_NUMBER`, `HP`, `ATTACK`, `DEFENSE`, `SPECIAL_ATTACK`, `SPECIAL_DEFENSE`, `SPEED`, `BASE_STAT_TOTAL` | todas |
| `showPreviousValue` | sí / no | `true` |
| `answerVisibility` | `REALTIME` \| `REVEAL` | `REALTIME` |
| `difficulty` | `VERY_EASY` … `VERY_HARD` | `NORMAL` |
| `roundSeconds` | 10–60 | 20 |
| `rounds` | 1–50 | 10 |

Admite 1 jugador o más.

**Flujo**

`GAME_STARTING` → `ROUND_ACTIVE` → `ROUND_RESULTS` (3 s) → siguiente ronda o `GAME_RESULTS`.

1. En cada ronda se elige una categoría al azar y un Pokémon «actual», que se compara con el «anterior».
2. El actual de esta ronda pasa a ser el anterior de la siguiente (`server.ts:26-51`).
3. Con la dificultad (`selectPokemonByDifficulty`, `rules.ts:23-43`):
   - se ordenan los candidatos por `|valor − anterior|`;
   - se toma `targetIndex = round((n−1)·p)`, con p = 1 / 0,75 / 0,5 / 0,25 / 0 según la dificultad;
   - se elige al azar dentro de una franja del 20 % alrededor de ese índice.
4. Acción: `ANSWER {choice: HIGHER|SAME|LOWER}`, una por ronda.
5. La ronda se resuelve al acabar el tiempo o cuando han respondido todos los conectados.

**Puntuación** (`rules.ts:7-8,44`; `server.ts:42-44`)

```ts
HIGHER_LOWER_POINTS = { HIGHER: 1, SAME: 3, LOWER: 1 }
STREAK_BONUSES = [{10,4},{5,2},{3,1}]   // por umbral, no acumulativo
scores[id] += (correct ? POINTS[correctAnswer] : 0) + (correct ? streakBonus(streak) : 0);
```

- Fallar o no responder pone la racha a 0.
- Estadísticas: `correct`, `incorrect`, `sameCorrect`, `answered`, `bestStreak`, `accuracy`.

**Visibilidad**
- Pública:
  - `category`;
  - el `previousPokemon` con su valor, si `showPreviousValue`;
  - el `currentPokemon` sin valor hasta la revelación;
  - `answers`, en tiempo real si está en `REALTIME`;
  - `answeredIds`, `scores`, `streaks`, `lastRound`.
- Privada: `{canAnswer, answer}`.

**Pantalla**
- Dos `card`: «Pokémon anterior» y «¿Su valor es…?».
- Botones `HIGHER`, `SAME` y `LOWER` con bordes `leaf`, `electric` y `berry`.
- Al revelar, un banner `reveal-pop` y, por jugador, «✓ +N» o «✗» con la racha.
- Barra lateral con la clasificación (🔥) y las respuestas agrupadas.

### 5.2 Problemas detectados

| # | Problema | Evidencia |
|---|---|---|
| H1 | **Se puede copiar.** El modo por defecto es `REALTIME`, que muestra las elecciones en vivo, y no hay bonus por rapidez (`answeredAt` no se usa al puntuar). Esperar y seguir al líder es la estrategia óptima. | `server.ts:77,80`; `config.ts:25` |
| H2 | **No responder cuenta como fallo.** Baja la `accuracy` del perfil aunque el jugador se haya desconectado. | `server.ts:45` |
| H3 | **SAME desequilibra.** En `VERY_HARD` la franja del 20 % más cercano incluye todos los empates de valor, y SAME vale 3 puntos. En categorías con valores repetidos (HP, ATK) sale a menudo. En `DEX_NUMBER` es imposible. | `rules.ts:23-43` |
| H4 | **Textos en inglés en la interfaz:** «Respuesta: HIGHER» y los botones `HIGHER`/`SAME`/`LOWER`. | `HigherLowerGame.tsx:6,12,14` |
| H5 | **La revelación no compara visualmente.** No marca qué tarjeta es mayor ni muestra la diferencia. | `HigherLowerGame.tsx:12-17` |
| H6 | **`canAnswer` no comprueba `isPlayerRequired`**, aunque el motor sí rechaza la acción. La interfaz puede mostrar botones activos a un espectador o a un jugador desconectado. | `server.ts:82` |
| H7 | **El panel limita `rounds` a 30** y el esquema admite 50. | `games/higher-lower/ConfigPanel.tsx:98` |
| H8 | **Stats accesibles desde el cliente.** `/pokemon` las expone. Es inherente al juego, porque los valores son datos públicos, pero facilita trampas en partidas competitivas. | `backend/.../adapters/in/rest/pokemon/PublicPokemon.java` (la ruta la sirve Java); antes `routes.ts:47-53` |
| H9 | **Partida de 1 jugador sin objetivo.** Con 10 rondas fijas no hay récord ni comparación. | — |

### 5.3 Mejoras de jugabilidad

- **`REVEAL` por defecto y bonus por rapidez:** +1 si se acierta en la primera mitad del tiempo. Se elimina el incentivo de esperar y se premia la seguridad.
- **SAME equilibrado:**
  - limitar su probabilidad, con un máximo del 15 % de rondas con SAME;
  - o bajar su valor a 2;
  - y no ofrecer el botón SAME en `DEX_NUMBER`.
- **«No respondió» como estado aparte.** No sumar `incorrect` cuando el jugador no ha respondido. `answered` ya existe para calcular la tasa de respuesta.
- **Cadena estilo «más o menos» clásica**, como opción: el Pokémon «actual» siempre se compara con el último, con una sola categoría por partida, para recordar los valores con más facilidad.
- **Filtros:**
  - por tipo, con `pokemon/conditions`;
  - «solo totalmente evolucionados»;
  - excluir legendarios, que desvían el BST.
- **Remontadas:** las 3 últimas rondas valen el doble, anunciado con un cut-in de «¡Ronda final x2!».
- **Comodín 50/50** (uno por partida): muestra el valor redondeado a la decena. Introduce una pequeña decisión estratégica.

### 5.4 Mejoras de UX/UI

- **Onboarding:**
  1. «Mira la stat del Pokémon de la izquierda».
  2. «¿El de la derecha la tiene mayor, menor o igual?».
  3. «Igual vale más puntos y las rachas dan bonus».
- **Traducir los textos:** «Mayor», «Igual», «Menor» y «Respuesta: Mayor».
- **Revelación comparativa:**
  - una barra horizontal por Pokémon con su valor;
  - la mayor se ilumina en `leaf` y se muestra la diferencia («+23»);
  - las barras crecen con `transform: scaleX`.
- **Feedback de racha:**
  - contador 🔥 que «salta» (`scale`) al subir;
  - al llegar a 3, 5 y 10, cut-in breve de «¡Racha ×5! +2».
  - Con reduced-motion, solo cambia el texto.
- **Sonido:** «tic» al bloquear la respuesta, acorde ascendente al acertar y grave al fallar (§8.6).
- **Resultados:** gráfica de la racha a lo largo de la partida, la categoría con mejor precisión y la mejor racha destacada.

### 5.5 Nuevos modos de juego

| Modo | Jugadores | Reglas | Por qué es divertido |
|---|---|---|---|
| **Racha infinita (solitario)** | 1 | Sin límite de rondas: se acaba al primer fallo. Récord personal persistente. | El clásico «una más». Partidas de 30 s a 10 min. |
| **Diario** | 1 | Diez comparaciones fijas por fecha con dificultad creciente; resultado compartible (`⬆️⬇️✅…`). | Hábito diario y comparación social. |
| **Eliminación** | 3+ | Quien falla pierde una vida (3 vidas). La última persona en pie gana. Si todos fallan la misma ronda, nadie pierde vida. | Tensión creciente; el empate colectivo evita finales injustos. |
| **Contrarreloj** | 1+ | 60 s en total; cada acierto pasa al siguiente sin revelación. Gana quien más aciertos tenga. | Ritmo arcade muy rápido. |

### 5.6 Progresión y meta

- **Logros:**
  - «Calculadora»: racha de 20.
  - «Gemelos»: acertar 5 SAME en una partida.
  - «Especialista en Velocidad»: 90 % de precisión en SPEED en 50 rondas.
- **Récord** de racha infinita en el perfil, mediante una nueva métrica `MAX` en `profileStats`. Ranking global de racha (§8.8).
- **Precisión por categoría:** métricas `correct_<cat>`/`answered_<cat>` en `UserGameStats` para mostrar el punto fuerte de cada jugador.

### 5.7 Impacto técnico
- **shared:**
  - cambiar el valor por defecto de `answerVisibility`. Para que llegue a las configuraciones guardadas hay que renombrar la clave o el enumerado (por ejemplo, `REALTIME` → `LIVE`), porque `migrateStoredGameConfig` respeta cualquier valor guardado válido (§1.6);
  - bonus de rapidez en `rules.ts`;
  - nuevo estado `unanswered`;
  - límite de SAME en la selección;
  - nuevas opciones `mode` (`CLASSIC`|`ENDLESS`|`ELIMINATION`) y `finalRoundsMultiplier`;
  - escenarios golden: rapidez, SAME limitado y endless.
- **front:** barras comparativas, textos en español, cut-in de racha y `canAnswer` con `isPlayerRequired`.
- **API / Java:**
  - motor espejo `HigherLowerEngine`/`HigherLowerRules`;
  - el récord de racha y el modo diario requieren persistencia y un endpoint, que **debería nacer en Java**.
  - Ojo: el desempate de orden usa `String.compareTo` en Java y `localeCompare` en TS. Cualquier orden nuevo debe usar la misma regla (`Collations.names()`).

### 5.8 Priorización

| Propuesta | Impacto | Esfuerzo | Orden |
|---|---|---|---|
| `REVEAL` por defecto y bonus por rapidez (H1) | Alto | S | 1 |
| Textos en español (H4) y `canAnswer` (H6) | Medio | S | 2 |
| «No respondió» separado de fallo (H2) | Medio | S | 3 |
| Equilibrio de SAME (H3) | Medio | S | 4 |
| Revelación comparativa con barras (H5) | Alto | M | 5 |
| Modo Racha infinita (H9) | Alto | M | 6 |
| Modo Eliminación | Medio | M | 7 |
| Diario y récords persistentes | Medio | L | 8 |
| Duelo de stats y comodín 50/50 | Bajo | M | 9 |

### 5.9 Preguntas abiertas

- ¿Se quiere mantener `REALTIME` como opción social? Si se mantiene, ¿hay que avisar en el lobby?
- ¿Las formas regionales deben entrar en el pool? Hoy `forGenerations` no las incluye.

---

## 6. Type Duel (`type-duel`)

### 6.1 Cómo funciona hoy

**Ficheros**
- Motor: `packages/shared/src/games/type-duel/{config,rules,server,types}.ts`.
- Pantalla: `apps/web/src/room/TypeDuelGame.tsx`, con `AttemptHistory`.
- Resultados: `TypeDuelResults.tsx`.
- Port a Java: `engines/typeduel/`.

**Configuración** (`config.ts:4-9`)

| Opción | Rango | Por defecto |
|---|---|---|
| `generations` | — | — |
| `typeSelectSeconds` | 5–60 | 15 |
| `searchSeconds` | 10–60 | 20 |
| `rounds` | 1–50 | 10 |

`rounds` cuenta **duelos completados**, no rondas por jugador.

**Constantes**
- `TYPE_DUEL_WIN_POINTS = 5`.
- 1 s de espera tras un fallo.
- `MAX_SOLUTIONS = 8`.
- Duración de las pantallas: revelación 2 s, combinación inválida 3 s, resultado 10 s.

**Flujo**
1. **Pareja.** `chooseBalancedPair` elige, entre los conectados, la pareja con menos participaciones y evita repetir la anterior. Si quedan menos de 2 conectados, la partida termina.
2. **`SELECTING_TYPES`.** Cada duelista lanza `SELECT_TYPE {pokemonType}` en secreto.
3. **Revelación.**
   - `TYPE_REVEAL` (2 s) si existe algún Pokémon con exactamente esos dos tipos. Si los dos eligen el mismo tipo, cuenta como monotipo exacto. Se incluyen formas regionales.
   - `INVALID_COMBINATION` (3 s) si no existe. En ese caso vuelve a `SELECTING_TYPES` con la misma pareja y sin consumir ronda.
4. **`POKEMON_SEARCH`.** `ATTEMPT_POKEMON {pokemonId}` con intentos ilimitados y 1 s de espera tras cada fallo. El primer intento correcto gana y cierra la ronda.
5. **`ROUND_RESULTS`** (10 s). El host puede adelantar con `CONTINUE`.

**Resultado de la ronda** (`server.ts:38-47`)

| Motivo | Puntos | ¿Cuenta como ronda? |
|---|---|---|
| `WINNER` | +5 | Sí |
| `TIMEOUT` (nadie acierta) | 0 | Sí |
| `TYPE_FORFEIT` (solo uno eligió tipo) | +5 al que eligió, sin buscar | Sí |
| `TYPE_TIMEOUT` (nadie eligió) | 0 | **No** |
| `DISCONNECTED` | 0 | **No** |

**Estadísticas:** `duelsPlayed`, `duelsWon`, `correctAttempts`, `incorrectAttempts`, `correctTimeTotalMs`, `winRate` y `averageCorrectTimeMs`.

**Visibilidad**
- Pública: `participants`, `participationCounts`, los tipos (solo tras la revelación), `attempts` en vivo, `scores` y `lastRound`.
- Privada: `{participant, ownType, canSelectType, canAttempt, cooldownUntil}`.
- `validPokemonIds` no se publica nunca.

**Pantalla**
- Cabecera «A VS B».
- Rejilla de 18 tipos.
- «Tipo bloqueado ✓».
- `PokemonSelector` con formas.
- Historial de intentos en verde y rojo.
- Resultado con trofeo y «También podíais haber elegido».

### 6.2 Problemas detectados

| # | Problema | Evidencia |
|---|---|---|
| T1 | **La partida puede no terminar.** `TYPE_TIMEOUT`, `DISCONNECTED` e `INVALID_COMBINATION` no suman a `completedRounds`. Con dos jugadores ausentes pero conectados, se repite sin fin y la interfaz muestra el mismo número de ronda. | `server.ts:39-40,92` |
| T2 | **Desconectarse anula el duelo.** El que va perdiendo puede recargar la página y quitarle los 5 puntos al rival. | `server.ts:97-101` |
| T3 | **Incentivos incoherentes.** Un rival ausente pero conectado regala +5 por `TYPE_FORFEIT`; uno desconectado anula el duelo. | `server.ts:85-89` vs `97-101` |
| T4 | **Participación desigual.** Con 3 jugadores y 10 duelos, las apariciones quedan 7/7/6, y los puntos solo se ganan en duelos. El ranking no lo compensa. | `rules.ts:14-22` |
| T5 | **El resultado no recuerda los tipos.** `ROUND_RESULTS` no muestra `requiredTypes`, y «Selección cancelada» no dice si fue por tiempo o por desconexión. | `TypeDuelGame.tsx:21` |
| T6 | **Los tipos se ven en el cliente.** `/pokemon` incluye `types`: con la consola se filtra la lista y se gana al instante. | `backend/.../adapters/in/rest/pokemon/PublicPokemon.java` (la ruta la sirve Java), `TypeDuelGame.tsx:10` |
| T7 | **Se cuentan intentos repetidos.** Volver a probar el mismo Pokémon fallido suma `incorrectAttempts` y no avisa. | `server.ts:75-82` |
| T8 | **No se informa del número de soluciones.** En `TYPE_REVEAL` no se dice si hay 1 o 40 Pokémon válidos, así que la dificultad varía mucho sin que nadie lo sepa. | — |
| T9 | **Espectadores pasivos.** Con 4 o más jugadores, la mayoría solo mira. | — |
| T10 | **El panel limita `rounds` a 20**, mientras el esquema permite 50. | `games/type-duel/ConfigPanel.tsx:13` |

### 6.3 Mejoras de jugabilidad

- **Toda ronda consume duelo.** Cualquier resolución avanza el contador:
  - `TYPE_TIMEOUT`: sin puntos.
  - `INVALID_COMBINATION`: tras 2 reintentos, la ronda termina sin puntos.
  - Además, un tope duro: si `intentos de ronda > rounds × 2`, la partida termina.
- **Gracia por desconexión** (§8.3).
  - Si el desconectado no vuelve antes de 10 s, el rival gana por `FORFEIT` con +5, igual que con un jugador ausente.
  - Si vuelve, el duelo sigue con el tiempo restante.
  - Así se cierran T2 y T3.
- **Ranking justo:**
  - `rounds` pasa a ser «duelos por jugador». La partida termina cuando todos han jugado N duelos.
  - Otra opción: normalizar por duelos jugados (`winRate`) en la clasificación.
- **Visibilidad del número de soluciones.** En `TYPE_REVEAL` se muestra «Hay 3 Pokémon válidos». Opcionalmente, la puntuación escala con la rareza: 5 puntos si hay más de 5 soluciones y 8 si hay solo 1.
- **Penalizar la fuerza bruta.** La espera crece: 1 s, 2 s, 3 s… El mismo Pokémon no se puede repetir; se rechaza con «Ya lo probaste».
- **Espectadores activos.** Pueden apostar quién ganará el duelo y, si aciertan, reciben +1. Así nadie se pasa la partida mirando.
- **Filtros:** generaciones, y excluir legendarios y formas regionales (`includeForms` configurable).

### 6.4 Mejoras de UX/UI

- **Onboarding:**
  1. «Cada uno elige un tipo en secreto».
  2. «Juntos forman una combinación: encuentra un Pokémon que la tenga EXACTA».
  3. «El primero que acierte gana 5 puntos».
- **Revelación de tipos con cut-in de enfrentamiento:**
  - Cada badge de tipo entra desde su lado (`translateX`) y chocan en el centro con «VS».
  - Debajo aparece el contador de soluciones.
  - Con reduced-motion, aparición sin desplazamiento.
- **Búsqueda.** El selector, filtrado por generaciones, resalta las formas regionales con una etiqueta para evitar confusiones.
- **Resultado:**
  - Muestra siempre los dos tipos.
  - Muestra el motivo exacto: «X se desconectó», «Ninguno eligió tipo» o «Tiempo agotado».
  - Muestra el Pokémon ganador con el tiempo que tardó («2,4 s»).
- **Barra de progreso de la partida** con duelos por jugador (`participationCounts`), para entender por qué alguien juega más.
- **Sonido:** «clang» en el VS y fanfarria corta al ganar el duelo.
- **Resultados finales:** cuadro de enfrentamientos (quién ganó a quién), mejor tiempo y combinación más rara resuelta.

### 6.5 Nuevos modos de juego

| Modo | Jugadores | Reglas | Por qué es divertido |
|---|---|---|---|
| **Torneo** | 4, 8 o 16 (con *byes*) | Cuadro de eliminación directa al mejor de 3 duelos. Los eliminados apuestan. | Narrativa de torneo con final épica. Usa `chooseBalancedPair` como base, pero con un *bracket* fijo. |
| **Todos contra todos (battle royale)** | 3–8 | Todos eligen tipo. Se forman parejas al azar y se juegan todos los duelos a la vez. Cada acierto cuenta para tu pareja. | Ningún espectador; caos controlado. |
| **Cooperativo** | 2–6 | La sala recibe una combinación aleatoria y tiene 60 s para encontrar el máximo de soluciones distintas. | Pasa de la competición al «¿cuántos sabemos entre todos?». Va bien en grupos mixtos. |
| **Solitario contra el reloj** | 1 | Combinación aleatoria. Se ganan puntos por cada solución en 30 s y la rareza bonifica. | Practicar tablas de tipos sin rival. |

### 6.6 Progresión y meta

- **Logros:**
  - «Purista»: ganar con un monotipo.
  - «Exótico»: ganar una combinación con una sola solución.
  - «Rayo»: acertar en menos de 3 s.
- **Matriz de tipos dominados:** una cuadrícula de 18×18 en el perfil que marca las combinaciones resueltas alguna vez. Hay que persistir pares de tipos.
- **Ranking:** victorias y `averageCorrectTimeMs` (que ya existe) por temporada.

### 6.7 Impacto técnico

- **shared:**
  - `completedRounds` en todas las resoluciones, tope duro y gracia de presencia en el motor (un nuevo campo `disconnectedSince`);
  - rechazar intentos repetidos y espera creciente;
  - `solutionCount` en el estado público;
  - `rounds` por jugador;
  - escenarios golden nuevos (bucle, gracia, repetidos).
- **Sockets:** las apuestas de espectadores son una acción nueva del motor (`PREDICT_WINNER`), sin eventos nuevos. Exige permitir acciones a no participantes en `handleAction`.
- **front:** cut-in VS, resultados con tipos y motivo, y modo torneo con *bracket*, que necesita un componente nuevo.
- **API:** catálogo reducido sin `types` (§8.7), **imprescindible** para que el juego sea competitivo.
- **Java:** espejo de `TypeDuelEngine`. El bug del bucle también está en Java, así que la corrección debe aplicarse a la vez en los dos lados.

### 6.8 Priorización

| Propuesta | Impacto | Esfuerzo | Orden |
|---|---|---|---|
| Toda ronda consume duelo y tope duro (T1) | Alto | S | 1 |
| Forfeit con gracia en la desconexión (T2, T3) | Alto | M | 2 |
| Resultado con tipos y motivo (T5) | Medio | S | 3 |
| Catálogo sin tipos (T6) | Alto | M | 4 (compartido con §8.7) |
| Contador de soluciones y rechazo de repetidos (T7, T8) | Medio | S | 5 |
| Duelos por jugador (T4) | Medio | M | 6 |
| Cut-in VS y onboarding | Medio | M | 7 |
| Apuestas de espectadores (T9) | Medio | M | 8 |
| Modos Cooperativo y Torneo | Alto | L | 9 |

### 6.9 Preguntas abiertas

- ¿Las formas regionales deben contar como soluciones válidas? Hoy sí (`includeForms: true`).
- ¿Debe premiarse la rareza de la combinación, o los 5 puntos fijos son parte de la gracia del juego?

---

## 7. Learnset Guess (`learnset-guess`)

### 7.1 Cómo funciona hoy

**Ficheros**
- Motor: `packages/shared/src/games/learnset-guess/{config,rules,server,types}.ts`
- Pantalla: `apps/web/src/room/LearnsetGuessGame.tsx` (con `MoveHint` y `RoundReveal`)
- Resultados: `LearnsetGuessResults.tsx`
- Java: `engines/learnsetguess/`

**Configuración** (`.strict()`, `config.ts:5-16`)

| Opción | Rango | Por defecto |
|---|---|---|
| `generations` | — | — |
| `showLevels` | sí / no | `true` |
| `showEvolution` | sí / no | `true` |
| `roundSeconds` | 15–120 | 60 |
| `rounds` | 1–20 | 10 |

El mínimo de jugadores es 2.

**Constantes** (`server.ts:9-12`)
- Movimientos visibles al empezar: hasta nivel 15.
- Pista nueva cada 7 s.
- Espera tras un fallo: 1 s.
- Duración de los resultados: 4 s.

**Learnset de referencia:** el de la generación `max(generations)`.

**Candidatos** (`server.ts:73-83`). Un Pokémon puede salir si cumple todo esto:
- es la forma por defecto;
- su generación es ≤ la de referencia;
- tiene ≥2 movimientos;
- tiene algún movimiento a nivel ≤15;
- tiene información evolutiva, si `showEvolution` está activo.

No se repite ningún Pokémon hasta agotar el pool.

**Flujo:** `ROUND_ACTIVE` → `ROUND_RESULTS` (4 s) → siguiente ronda o `GAME_RESULTS`.
- `tickActive` revela otro grupo de nivel cada 7 s.
- Acción: `GUESS_POKEMON {pokemonId}`. Si fallas, el intento se publica y esperas 1 s.

**Puntuación** (`rules.ts:5-10`)
```ts
learnsetPoints(revealStage) = Math.max(1, 5 - revealStage)   // 5, 4, 3, 2, 1, 1…
```
- El orden de acierto **no** suma puntos.
- La ronda termina cuando aciertan todos los conectados o se acaba el tiempo.
- Estadísticas: `correct`, `missed`, `initialSolves`, `incorrectGuesses`, `pointsFromSolves` y `bestRoundPoints`.

**Visibilidad**
- Pública:
  - `visibleGroups`: nombre, tipo, categoría y nivel de cada movimiento;
  - `evolutionHint`, como texto;
  - `attempts`, solo los fallos;
  - `solvedPlayers`, sin el Pokémon;
  - `lastRound`, solo al revelar;
  - `scores`.
- Privada: `{canGuess, solved, solveOrder, cooldownUntil, roundPoints}`.

**Pantalla**
- Rejilla de grupos por nivel. El último grupo revelado se marca con `reveal-pop border-aqua` y la etiqueta «Nueva pista».
- Chip «Nueva pista en Ns».
- Selector con espera.
- Barra lateral con quién ha acertado y los intentos públicos.
- `RoundReveal` muestra 🥇🥈🥉 y el learnset completo, con los movimientos no vistos atenuados.

### 7.2 Problemas detectados

| # | Problema | Evidencia |
|---|---|---|
| L1 | **Rama muerta.** El texto «No aprende movimientos hasta nivel 15» nunca puede mostrarse, porque el pool exige al menos un movimiento ≤15. | `LearnsetGuessGame.tsx:30`, `server.ts:79` |
| L2 | **No hay marcador en vivo.** `scores` se publica, pero la pantalla de juego no lo muestra. | `LearnsetGuessGame.tsx` |
| L3 | **La puntuación se aplana.** Desde los 28 s solo queda 1 punto durante más de la mitad de la ronda, y la velocidad dentro de una misma fase no cuenta. Las medallas 🥇🥈🥉 se ven, pero no puntúan. | `rules.ts:5-10` |
| L4 | **Espera muerta.** Si alguien no acierta, los que ya acertaron esperan hasta `roundSeconds` (máx. 120 s). | `server.ts:158,181` |
| L5 | **Claves React duplicadas.** Con `showLevels=false`, la clave `${moveId}-${level}` pasa a ser `id-null`. Si un movimiento se aprende a dos niveles, la clave choca y el `Set` de revelados de `RoundReveal` mezcla los dos. | `LearnsetGuessGame.tsx:30,45` |
| L6 | **`missed` cuenta para desconectados.** Baja su precisión en el perfil. | `server.ts:110-112` |
| L7 | **Exclusiones silenciosas.** Los Pokémon sin learnset en la generación de referencia no pueden salir, pero siguen en el selector como respuesta posible. Ejemplo: Gen 9 activa, con muchos Pokémon sin learnset en SV. | `server.ts:73-83` |
| L8 | **`minPlayers: 2` sin necesidad.** El motor funciona perfectamente en solitario. | `server.ts:16,131` |
| L9 | **Sin dificultad.** La primera pista revela todo hasta nivel 15, lo que en Pokémon de primera etapa suele bastar. | — |

### 7.3 Mejoras de jugabilidad

- **Puntos por orden de acierto**, como en Shiny Quiz:
  - fórmula: `max(1, 5 − stage) + bonusOrden(1.º +2, 2.º +1)`;
  - o, como alternativa, escalar por tiempo dentro de la fase.
- **Cerrar la ronda cuando quede uno.** Si todos menos uno han acertado, el último recibe 10 s de «último aviso» (`roundEndsAt = min(actual, now + 10 s)`).
- **Dificultad configurable** (`initialLevel`):
  - Fácil: hasta nivel 20.
  - Normal: hasta nivel 15.
  - Difícil: solo los movimientos de nivel 1.
  - Experto: orden inverso, empezando por los movimientos de más nivel.
- **Pistas extra con coste**, por jugador: «Revelar el tipo del Pokémon» por −1 punto. Así cada uno decide cuánto riesgo asume.
- **Selector coherente.** Limitar `PokemonSelector` a los candidatos del pool, o avisar cuando el learnset excluye Pokémon (L7).
- **Permitir solitario** (`minPlayers: 1`).
- **No sumar `missed`** a quien estaba desconectado al resolverse la ronda (L6).
- **Filtros:** tipo, etapa evolutiva y excluir legendarios.

### 7.4 Mejoras de UX/UI

- **Onboarding:**
  1. «Ves los movimientos que aprende un Pokémon por nivel».
  2. «Cada 7 s se revelan más».
  3. «Cuanto antes aciertes, más puntos».
- **Marcador en vivo** en la barra lateral, usando `ranking-row` (L2).
- **Pista nueva:**
  - la tarjeta entra con `translateY` + `opacity`, en vez de solo `reveal-pop`;
  - un chip con los puntos en juego («Ahora vale 3 pts»), para que se note la tensión de la cuenta atrás.
- **Al acertar:**
  - silueta del Pokémon que se llena de color, solo visible para quien acierta;
  - el resto ve «X acertó» con su avatar y una animación de `scale`.
- **Revelación final:** el sprite del Pokémon en grande, con el learnset completo y los movimientos que se vieron destacados en `aqua`.
- **Resultados:** número medio de pistas que necesitó cada jugador y el «acierto más rápido» de la partida.
- **Corregir L1 y L5.** Eliminar la rama muerta y usar como clave `${moveId}-${level ?? index}`.

### 7.5 Nuevos modos de juego

| Modo | Jugadores | Reglas | Por qué es divertido |
|---|---|---|---|
| **Diario** | 1 | Un Pokémon al día. La puntuación es el número de pistas necesarias, y el resultado se puede compartir (`🟩🟩⬛⬛`). | Formato «-dle» muy reconocible. Reutiliza `tickActive`, pero con revelación manual. |
| **Revelación manual (Wordle-like)** | 1+ | No hay temporizador de pistas. Cada intento fallido revela un grupo nuevo y gana quien necesite menos intentos. | Pensado y sin prisas. Encaja con el `cooldown` y los `attempts` actuales. |
| **Eliminación** | 3+ | En cada ronda queda fuera quien no acierta o quien acierta el último. | Tensión creciente. Usa el `solveOrder` que ya existe. |
| **Por equipos** | 4+ | Cada equipo comparte un único intento cada 3 s. La puntuación es del equipo. | Hay que coordinarse («¡no lo pruebes, ya falló Charmander!»). |
| **Movimiento firma** | 2+ | Solo se muestran movimientos exclusivos o raros. Pocas pistas y muy jugosas. | Para veteranos. Necesita calcular la rareza de cada movimiento en el catálogo (pregunta abierta). |

### 7.6 Progresión y meta

- **Logros:**
  - «Profesor Oak»: acertar con solo las pistas iniciales 5 veces.
  - «Entrenador de MT»: 50 aciertos.
  - «Sin fallos»: una partida entera sin intentos incorrectos.
- **Estadísticas:** el `initialSolves` actual se mostraría como «aciertos a la primera pista». Además, una nueva media de `revealStage` por acierto.
- **Racha diaria** en el modo Diario.

### 7.7 Impacto técnico

- **shared:**
  - Bonus por orden.
  - Cierre por último aviso.
  - `initialLevel` y modo manual.
  - `minPlayers: 1`.
  - `missed` solo para requeridos.
  - Lista pública `candidatePokemonIds`, o un flag por id, para el selector.
  - Escenarios golden nuevos.
- **front:**
  - Marcador.
  - Claves corregidas.
  - Eliminar la rama muerta.
  - Selector filtrado.
  - Animación de pista.
- **API:** el modo Diario necesita un endpoint, que **debería nacer en Java**.
- **Java:**
  - Hacer espejo de `LearnsetGuessEngine`.
  - Ojo: la ordenación de movimientos usa `Collations.names()` en Java y `localeCompare` en TS. Si se añade algún orden nuevo, hay que usar el mismo comparador en los dos lados.

### 7.8 Priorización

| Propuesta | Impacto | Esfuerzo | Orden |
|---|---|---|---|
| Marcador en vivo (L2) y corrección de L1/L5 | Medio | S | 1 |
| Último aviso de 10 s (L4) | Alto | S | 2 |
| Bonus por orden (L3) | Alto | S | 3 |
| `missed` solo para requeridos (L6) y `minPlayers: 1` (L8) | Medio | S | 4 |
| Selector coherente con el pool (L7) | Medio | M | 5 |
| Dificultad `initialLevel` (L9) | Medio | M | 6 |
| Animaciones de pista y acierto | Medio | M | 7 |
| Modo Revelación manual y Diario | Alto | L | 8 |
| Equipos y Movimiento firma | Bajo | L | 9 |

### 7.9 Preguntas abiertas

- ¿Interesa permitir elegir la generación de referencia de forma independiente de las generaciones del pool? Por ejemplo, Pokémon de Gen 1 con su learnset de Gen 1.
- ¿Existe en la BD alguna forma de calcular la «rareza» de un movimiento? Haría falta para el modo «Movimiento firma».
  - Propuesta: contar en `PokemonLevelUpMove`, para la generación de referencia, cuántos Pokémon por defecto aprenden cada movimiento. Si son 3 o menos, el movimiento es «raro». El cálculo va en la sincronización Java (§1.6) y no necesita tablas nuevas si el conteo se hace al cargar el catálogo en memoria.

---

## 8. Mejoras transversales

### 8.1 Lobby y selección

- **Validar la configuración antes de jugar.**
  - Mover a `config-readiness.ts` las reglas que hoy solo fallan al pulsar `start`, como la paridad de Impostor.
  - Mostrar el error junto al campo del `ConfigPanel`.
- **Alinear los rangos de los paneles con los esquemas Zod** (§1.7).
  - Lo ideal es que el panel lea `min`/`max` del esquema exportado, en lugar de duplicarlos en cada `ConfigPanel`.
- **«Cómo se juega» en la tarjeta de cada juego del lobby.**
  - `HowToPlayCarousel` ya existe; se reutiliza con los 3 pasos de cada sección de este documento.
  - Los 3 pasos se muestran también una vez al empezar la partida, en `GAME_STARTING`, y se pueden saltar.
- **Presets por juego** («Rápido», «Clásico», «Experto») además de la configuración libre, que se guarda por usuario (`UserGameConfig`).

### 8.2 Selección de juego

- En el modo `VOTE`, mostrar junto a cada opción el número de jugadores que admite y la duración estimada.
- La duración se puede calcular a partir de la configuración: `rounds × roundSeconds`.

### 8.3 Reconexión: gracia por juego

Hoy `applyPresenceChange` se aplica al instante (§1.3). La propuesta:

- **Nuevo campo opcional en el manifest:** `presenceGraceMs`, por ejemplo 10 000.
  - Durante la gracia, el jugador cuenta como `connected: true` para el motor, pero la interfaz muestra «reconectando…».
  - Al vencer la gracia, se notifica al motor.
- **Implementación en el manager:**
  - un temporizador de presencia diferido en `manager.ts`;
  - el mismo en `RoomCoordinator` de Java.
- **Ventaja:** ningún motor tiene que cambiar. Corrige D5, T2 y parte de I8.
- **Riesgo:** la ronda espera hasta 10 s más por un desconectado.
  - Mitigación: la gracia nunca extiende `roundEndsAt`; solo evita que la ronda se cierre antes de tiempo.

### 8.4 Chat de sala

No existe. Propuesta:

- **Eventos nuevos:**
  - `room:chat:send {text}` (cliente → servidor);
  - `room:chat:message` (servidor → cliente).
- **Límites:**
  - 200 caracteres;
  - un límite de mensajes por usuario (Java ya limita a 50 eventos cada 10 s);
  - historial en memoria de 50 mensajes.
- **Canales:**
  - `ALL`;
  - `GHOST`, para eliminados o espectadores en juegos con información secreta (Impostor).
  - Durante `CLUE_PHASE`, el chat `ALL` se bloquea para evitar pistas extra.
- **Reacciones rápidas** con emoji (👏😱🔥), como alternativa ligera al chat.
- **Arquitectura:** el chat pertenece a la sala y no al motor. Debe implementarse **en Java primero**, porque es transporte nuevo y en 2D Java pasa a ser la fuente de verdad, y replicarse en Node solo si la 2D se retrasa.

### 8.5 Revancha rápida y espectadores

- **Revancha rápida.** `room:continue-session` ya hace de revancha, pero solo la puede lanzar el host.
  - Propuesta: botón «Revancha» para todos.
  - La revancha se lanza cuando la pide la mayoría, con cuenta atrás de 10 s, y reutiliza `skipVoterIds`.
- **Espectadores.** Ya existen.
  - Mostrar un contador de espectadores.
  - Dejarles participar en las apuestas (Type Duel), el chat `GHOST` y las reacciones.

### 8.6 Audio y animación comunes

- **Utilidad de sonido** `apps/web/src/lib/sfx.ts`:
  - sonidos cortos para acierto, fallo, tic, reveal y victoria, en `apps/web/public/sfx/`;
  - control de volumen y botón de silencio persistente (en `localStorage`), apagado por defecto en la primera visita;
  - sin reproducción automática antes de que el usuario interactúe.
- **Componentes comunes:**
  - `RevealCutIn`: cut-in a pantalla completa hecho solo con `transform` y `opacity`;
  - `ScorePop`: el «+N» que flota sobre un elemento.
  - Así los 6 juegos comparten el mismo lenguaje visual.
- **`prefers-reduced-motion`:** en vez de listar clases a mano al final de `styles.css`, crear una clase base `.motion-safe-anim` que se desactive en un único sitio.

### 8.7 Catálogo reducido (anti-trampas)

Hoy `/api/pokemon` lo sirve Java (`PokemonController.java`, con `PublicPokemon.java` como forma de la respuesta; nginx `infra/nginx.conf:52` y Vite `apps/web/vite.config.ts:16`). La respuesta incluye número de Pokédex, tipos, las 6 stats, BST, `shinySprite`, altura, peso, color y habilidades. Solo se quita `palette`. La ruta de Node (`apps/server/src/http/routes.ts:47-53`) ya no recibe tráfico.

**Quién lo consume.** `usePokemonPool` (`apps/web/src/hooks/usePokemonPool.ts`) lo usan 18 pantallas de `apps/web/src/room/`:
- 4 de los 6 juegos de este documento: Distance, Impostor, Type Duel y Learnset. Shiny Quiz y Higher or Lower no lo cargan, pero cualquiera puede pedir la ruta a mano (S4, H8);
- Bingo, Bluff Auction y Guess From Stats;
- Who's That, Zoomed, Cry Quiz, Palette Guess, Pokédex Entry, Pokeddle Race, Sketchmon, Poké Taboo, Type Chain, One of Us Is Fake y Most Likely To.

En todas, el catálogo solo alimenta `PokemonSelector` (`apps/web/src/room/PokemonSelector.tsx`), que usa `id`, `name` y `sprite`. Los demás campos que pintan esas pantallas (tipos, stats, generación, número) salen del estado de la partida o de los resultados, no del catálogo. Bingo y Bluff Auction tampoco evalúan condiciones en el cliente: las valida el motor. Por tanto, **el selector reducido puede sustituir a `/api/pokemon` en toda la web**. En los juegos de adivinar, el catálogo completo es tan útil como en los 6, sobre todo en Guess From Stats (las stats mostradas se buscan en la respuesta) y en Pokeddle Race.

**Propuesta**
- `GET /api/pokemon/selector?generations=…&includeForms=…` → `[{id, name, sprite}]`, **sin** número de Pokédex, generación (en Distance delimita el rango del número), tipos, stats, shiny ni habilidades.
- **El sprite también filtra.** La URL es `…/sprites/pokemon/<id PokéAPI>.png` (`apps/server/prisma/seed.ts:166`), y en las formas por defecto ese id coincide con el número de Pokédex. El selector debe servir el sprite por un proxy opaco, por ejemplo `/api/pokemon/<id>/sprite`, reutilizando `GameAssetService` (caché y lista blanca de orígenes). Sin esto, Pokédex Distance se sigue resolviendo leyendo las URLs.
- Migrar `usePokemonPool` entero al endpoint nuevo y dejar `/api/pokemon` para uso interno o de administración, o retirarlo.
- **Nace solo en Java:** `PokemonController`, `backend/openapi/pokemon-universe.yml`, `infra/nginx.conf`, el proxy de Vite y `npm run api:types`. No hace falta replicarlo en Node.
- **Caché y recarga.** `PokemonController` envía `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`. Desde `f1a190d`, el catálogo se recarga tras una sincronización, así que un navegador puede quedarse hasta unas 25 h con un selector que no coincide con las partidas nuevas (Pokémon que faltan o que sobran). Mejor un `ETag` derivado de la versión del catálogo cargado, o un parámetro `?v=<versión>` que se publique en el estado de la sala, en vez de copiar esa cabecera.
- **Ojo:** Higher or Lower muestra el nombre del Pokémon actual, así que sus stats siempre se pueden consultar fuera (en una wiki). Este cambio solo evita la trampa trivial, la de mirar la respuesta de la API.

### 8.8 Estadísticas, logros y ranking comunes

- **Ya existe:** `UserGameStats` agrega las métricas de `manifest.profileStats`.
- **Logros.**
  - Definición declarativa en `packages/shared/src/achievements/`: `{id, gameId?, metric, threshold, scope: GAME|LIFETIME}`. Se evalúan en `persistGameResults`.
  - Tabla `UserAchievement(userId, achievementId, unlockedAt)`, creada con migración Prisma mientras Prisma sea dueño del esquema y la etapa 2 no haya terminado.
  - El servicio de lectura `GET /api/me/achievements` **en Java**.
- **Ranking por juego y temporada:** a partir de `PlayerGameResult`, con la vista `GET /api/rankings/:gameId?season=` en Java.
- **Cosméticos:**
  - marcos de avatar desbloqueables por logro;
  - los avatares ya tienen ruta en Java (2C, tarea 6), así que conviene encajarlos ahí.
- **Retos diarios.**
  - Un único servicio `DailyChallengeService` en Java con semilla = fecha + `gameId`.
  - El motor TS/Java recibe `random` sembrado.
  - Los resultados se guardan en `DailyResult`.
  - **La semilla sola no basta.** El catálogo se recarga tras cada sincronización (`f1a190d`), así que la misma semilla con otro catálogo da otro contenido, y dos jugadores del mismo día podrían ver retos distintos. Hay dos opciones:
    - generar el reto una vez al día y guardar su contenido (ids de Pokémon y objetivos) en `DailyChallenge(date, gameId, content)`; es lo más simple y robusto;
    - o guardar junto a la semilla una huella del catálogo y regenerarlo solo si coincide.

---

## 9. Minijuegos nuevos

Los cuatro reutilizan infraestructura que ya existe (`pokemon/conditions`, `advanceTimedRound`, `recordGuessSolve`, `runoff-voting`, `contentDeck`) y los datos del catálogo. Ninguno repite un juego que ya existe: Type Chain encadena por tipo compartido, Guess From Stats adivina por stats y Pokeddle Race usa pistas comparativas.

| Juego | Jugadores | Reglas | Encaja con | Infraestructura reutilizada |
|---|---|---|---|---|
| **Type Matchup Quiz** | 1+ | Se muestra un tipo de ataque y un Pokémon defensor con sus tipos. Hay que elegir la efectividad: ×0, ×¼, ×½, ×1, ×2 o ×4. Puntos por acierto y por orden (4/3/2/1, como Shiny Quiz). | Aprender la tabla de tipos; va bien en solitario y como reto diario. | `advanceTimedRound`, `shuffled`, `PokemonTypeBadge`. |
| **Evolución Express** | 1+ | Se muestran desordenados los miembros de una cadena evolutiva (o una cadena con un hueco) y hay que ordenarlos o completarlos. Puntos por acierto y por rapidez. | Partidas cortas y visuales, accesibles para novatos. | `contentDeck` sobre cadenas evolutivas, `recordGuessSolve`, `PokemonSelector` para el hueco. |
| **Pokémon Shiritori** | 2–8 | Por turnos, cada jugador nombra un Pokémon que empiece por la última letra del anterior. No se repiten Pokémon. Quien se queda sin respuesta o sin tiempo pierde una vida (3 vidas). | Ritmo de turnos como Type Chain, con otra regla de encadenado. | Estructura de turnos de `type-chain`, `setPlayerCooldown`, `names` del catálogo. |
| **Peso Pluma** | 2+ | Se muestra un Pokémon y cada jugador estima su peso o su altura en secreto. Puntúa quien más se acerque sin pasarse; si todos se pasan, el más cercano. | Estimación tipo «el precio justo»: tensión sin necesidad de memorizar. | `advanceTimedRound`, revelación al cierre como en Pokédex Distance, `heightDecimeters`/`weightHectograms`. |

**Notas técnicas**
- **Type Matchup Quiz.** En `packages/shared` no hay tabla de efectividad de tipos. Es una tabla 18×18 nueva en `pokemon/`, con su espejo en Java y un fixture golden que la recorra entera, para que TS y Java no se desalineen.
- **Pokémon Shiritori.** La comparación de letras usa la misma normalización (NFD sin diacríticos) que el filtro de pistas de Impostor (§4.3), así que conviene una sola utilidad compartida. Hay que decidir qué hacer con los nombres que terminan en símbolo (Nidoran♀/♂, Porygon-Z, Mr. Mime): ignorar los caracteres que no son letras.
- **Peso Pluma.** El selector reducido (§8.7) no debe incluir altura ni peso.
- Los cuatro necesitan su `portedEngines` en `ClasspathGameRegistryLoader`, fixtures golden, `npm run registry:export` y subir los recuentos de los tests de registro (§1.6).

---

## 10. Plan de ejecución por fases

> Pensado para lanzarse fase a fase como prompt:
>
> «Ejecuta la Fase N de `MINIJUEGOS_MEJORAS.md` §10 siguiendo `AGENTS.md`».
>
> Reglas que aplican a todas las fases:
> - Cada cambio de motor va en TS y Java en el mismo commit, con escenario golden, `npm run golden:export` y test Java.
> - Antes de cerrar una fase hay que pasar `npm test`, `npm run typecheck`, `npm run lint` y `cd backend && ./gradlew check`.
> - Si hay cambios de interfaz, además: `npm run test:e2e -- juegos` y `npm run test:e2e:java -- juegos`, capturas a 1280×720, 1920×1080 y 390×844 en `e2e/screenshots/`, sin scroll horizontal, `measureLayout` limpio y nota de la rúbrica ≥19/24 en el commit.

### Fase 0: Bugs y bucles infinitos (S, máxima prioridad)

**Alcance:**
- **Type Duel:**
  - toda resolución consume duelo y hay un tope duro;
  - rechazo de intentos repetidos;
  - el resultado muestra los tipos y el motivo.
- **Impostor:**
  - opción «Saltar» y tope de revotación;
  - `finishReason`;
  - paridad en `config-readiness`;
  - `maxLength` igual a 25.
- **Pokédex Distance:**
  - `roundsSurvived` correcto;
  - `isDefault` en `SELECT_POKEMON`;
  - renombrar el test «four-second».
- **Learnset:**
  - eliminar la rama muerta;
  - claves sin colisiones;
  - `missed` solo cuenta a los requeridos.
- **Higher or Lower:**
  - textos en español;
  - `canAnswer` con `isPlayerRequired`.
- **Rangos de los paneles** alineados con los esquemas.

**Criterios de aceptación:**
- Una partida de Type Duel con dos jugadores ausentes termina en `rounds × 2` ciclos como máximo.
- En Impostor, si nadie vota dos veces seguidas, se pasa a la siguiente ronda de pistas sin eliminar a nadie.
- Ninguna regla de configuración falla solo al pulsar `start`.
- **Métrica de base.** Antes de empezar, anotar cuántas partidas de `type-duel` y `pokemon-impostor` quedan sin terminar: `GET /api/admin/games?status=ABANDONED&gameId=<id>` e `INTERRUPTED` (`AdminGamesController.java:46`; hace falta una cuenta de administrador). Repetir la consulta unas semanas después de desplegar. La proporción de partidas sin terminar de esos dos juegos debe bajar.

**Tests:**
- **Vitest** en cada `server.test.ts`:
  - `type-duel`: TYPE_TIMEOUT consume ronda; tope duro; intento repetido rechazado.
  - `pokemon-impostor`: votación con skip; empate repetido sin eliminación; `finishReason` en GUESS.
  - `pokedex-distance`: el eliminado por FARTHEST no suma `roundsSurvived`; una forma no por defecto se rechaza.
  - `learnset-guess`: un desconectado no suma `missed`.
- **`config-readiness.test.ts`:** caso de la paridad de Impostor.
- **Golden:** escenarios nuevos y fixtures regeneradas; `GoldenReplayTest` en verde.
- **Playwright:** `juegos.spec.ts` para los 6 juegos, con capturas de Type Duel (resultado con tipos) y de Impostor (votación con «Saltar»).

### Fase 1: Equidad y anti-copia (S/M)

**Alcance:**
- `REVEAL` como opción por defecto en Higher or Lower, más el bonus por rapidez.
- Votos ocultos hasta revelar en Shiny Quiz, más pool solo con `shinySprite` y paletas barajadas.
- Selección oculta en Pokédex Distance.
- Bonus por orden y último aviso de 10 s en Learnset.
- Gracia de presencia por manifest (§8.3), en `manager.ts` y en `RoomCoordinator`.
- Forfeit con gracia en Type Duel.
- Catálogo reducido `/api/pokemon/selector` en Java (§8.7), con sprite por proxy opaco y `usePokemonPool` migrado entero.
- Arreglo de la precarga de Shiny en Node y Java.

**Criterios de aceptación:**
- Ningún estado público de `ROUND_ACTIVE` revela la elección de otro jugador con la configuración por defecto.
- Un corte de menos de 10 s no elimina ni anula.
- La respuesta del selector no contiene `nationalDexNumber`, `generation`, `types`, `stats`, `shinySprite` ni URLs de sprite con el id de PokéAPI.

**Tests:**
- **Vitest:**
  - proyecciones públicas en `ROUND_ACTIVE` para cada juego, sin `answers`, `votes` ni `selections`;
  - test de presencia con gracia en el manager (`apps/server/src/rooms/*.test.ts`);
  - bonus de rapidez y de orden.
- **Java:**
  - test del controlador del selector;
  - prueba de `RoomCoordinator` con gracia;
  - `verifyOpenApi`.
- **Playwright:**
  - partida con 3 invitados en la que uno recarga la página a mitad de ronda y sigue en juego;
  - en la pestaña de red, la petición del selector no incluye esos campos.

### Fase 2: UX, onboarding y feedback (M)

**Alcance:**
- `HowToPlayCarousel` de 3 pasos en el lobby y en `GAME_STARTING` para los 6 juegos.
- Componentes `RevealCutIn` y `ScorePop`.
- Utilidad `sfx.ts` con silencio.
- Revelaciones específicas:
  - regla numérica (Distance);
  - giro de carta (Shiny);
  - VS (Type Duel);
  - barras (Higher or Lower);
  - cut-in de eliminación (Impostor);
  - marcador en vivo y animación de pista (Learnset).
- Pantallas de resultados propias para Distance, más las estadísticas nuevas.

**Criterios de aceptación:**
- Rúbrica ≥19/24 sin ningún 0 en cada pantalla rediseñada.
- Texto ≥12 px.
- Solo animaciones de `transform` y `opacity`.
- Con `prefers-reduced-motion`, ninguna animación.
- El audio está desactivado por defecto y se puede activar.

**Tests:**
- **Vitest** de componentes: `RevealCutIn` respeta reduced-motion; `sfx` no suena si está en silencio.
- **Playwright:**
  - capturas de cada revelación a 3 tamaños;
  - `emulateMedia({reducedMotion: 'reduce'})`;
  - `measureLayout` limpio con `PU_LAYOUT_STRICT=1` para los 6 juegos.

### Fase 3: Modos de juego (M/L)

**Alcance:** campo `mode` en la configuración de cada juego e implementación de un modo por juego, el de mayor impacto según las tablas:
- Distance: Por puntos.
- Higher or Lower: Racha infinita.
- Shiny: Supervivencia.
- Learnset: Revelación manual.
- Type Duel: Cooperativo.
- Impostor: Rápido para 3 jugadores.

**Criterios de aceptación:**
- Cada modo tiene escenario golden, test Java y onboarding propio.
- El lobby muestra el modo elegido y el número de jugadores que admite.

**Tests:**
- **Vitest** por modo: flujo completo, fin de partida, empates, desconexión y `getResults`.
- **Golden** por modo.
- **Playwright:** `juegos.spec.ts` parametrizado por modo.

### Fase 4: Meta y progresión (L)

**Alcance:**
- Logros declarativos y tabla `UserAchievement` (Prisma).
- Lectura de logros y rankings en Java.
- Reto diario (`DailyChallengeService` en Java) para Distance, Shiny, Higher or Lower y Learnset.
- Cosméticos de avatar.
- Chat de sala y reacciones (§8.4), primero en Java.
- Juegos nuevos (§9), empezando por Type Matchup Quiz.

**Criterios de aceptación:**
- Los logros se desbloquean de forma idempotente al persistir los resultados.
- El reto diario es determinista por fecha (misma semilla, mismo contenido en TS y Java).
- El chat respeta el límite de frecuencia y el bloqueo de `CLUE_PHASE`.

**Tests:**
- **Vitest** de la evaluación de logros.
- **Java** con Testcontainers para persistencia y endpoints.
- **Golden** de semilla diaria (TS = Java).
- **Playwright:**
  - perfil con logros;
  - flujo del reto diario;
  - chat con 2 invitados.

---

## 11. Preguntas abiertas globales

1. ~~**DESIGN.md / «Arcade DS».**~~ **Resuelta (2026-11-04):** sí, es el «Arcade DS» de `InazumaElevenManager/docs/DESIGN.md`. Se adaptó en `docs/superpowers/specs/2026-11-03-rediseno-arcade-ds-design.md` y el rediseño se hizo en las fases F0–F9; las propuestas visuales de este documento se leen con esa spec (ver §1.8).
   - ~~No está en el repo. ¿Dónde está el documento adjunto?~~
   - ~~Las propuestas visuales de este documento se basan en los tokens actuales y habrá que ajustarlas cuando se tenga.~~
   - ~~¿«Arcade DS» es el DESIGN.md §11 de InazumaElevenManager citado en `docs/visual-review.md`?~~
2. **Valores por defecto anti-copia.** ¿Se aprueba cambiar `showVotes` (Shiny) y `answerVisibility` (Higher or Lower) a «solo al revelar»? Afecta a la configuración guardada de los usuarios (`UserGameConfig`). ¿Se migra o se respeta lo guardado?
   - **Cómo funciona hoy** (§1.6): `migrateStoredGameConfig` respeta lo guardado si sigue siendo válido, y se guarda la configuración completa en cada cambio. Cambiar solo el valor por defecto deja fuera a casi todos los usuarios registrados que ya jugaron a esos juegos.
   - **Recomendación:** renombrar la clave o el enumerado (`voteVisibility`, `LIVE`), de modo que todo el mundo pase al valor nuevo sin escribir una migración de datos. Quien quiera el modo en vivo lo vuelve a elegir. Falta decidir si se acepta este reinicio de la preferencia.
3. **Impostores.** ¿Deben conocerse entre sí cuando hay más de uno?
4. **Logros persistentes.** ¿Se quieren antes de la etapa 2D? Implican una migración Prisma ahora y su equivalente en Flyway después.
5. **Gracia de presencia.** ¿10 s es razonable? ¿Debe ser configurable por sala?
6. **Retos diarios.** ¿Requieren cuenta registrada o también se permiten invitados? Los invitados no tienen estadísticas persistentes.
7. ~~**Catálogo reducido.** ¿Hay algún consumidor de `/pokemon` fuera de los juegos (por ejemplo, administración) que dependa de los campos completos?~~ **Resuelta (2026-11-03):** no. Solo lo consume `usePokemonPool`, y las 18 pantallas que lo usan leen `id`, `name` y `sprite` (§8.7). La API de administración de Java (`/api/admin/*`) no lo usa; `apps/web/src/lib/api-contract.ts:28` solo declara el tipo de la respuesta.
