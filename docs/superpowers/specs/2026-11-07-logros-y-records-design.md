# Logros y récords

Fecha: 2026-11-07. Estado: **para revisión**. La escribió el controlador con las respuestas del usuario del 2026-11-06 y
se completó después contra el código real. El catálogo concreto es una **propuesta para revisar**. Cada elección que no
dictó el usuario está marcada como «Decisión tomada (revisable)». Origen: `MINIJUEGOS_MEJORAS.md` §8.8 y §10 «Fase 4».

## Objetivo

Las cuentas registradas desbloquean logros jugando y los ven en su perfil. Al acabar una partida, la pantalla de
resultados avisa de los logros recién conseguidos. Además se guarda, y se muestra en el perfil, el récord personal de la
Racha infinita de Higher or Lower.

**Criterio de éxito:**
1. Un jugador registrado termina una partida y ve «¡Logro desbloqueado!» en los resultados.
2. El logro aparece en su perfil con la fecha.
3. Volver a jugar no lo duplica ni lo vuelve a anunciar.

## Decisiones del usuario (vinculantes)

- Solo cuentas registradas. Los invitados ni acumulan logros ni los ven.
- Tres familias: **hitos generales**, **uno o dos por minijuego** y **secretos**, que están ocultos hasta conseguirlos.
  No hay logros sociales.
- El aviso sale **en la pantalla de resultados al acabar la partida**, nunca a mitad de partida.
- El récord de la Racha infinita de Higher or Lower (modo `ENDLESS`, rama `modos`) va en esta pieza.

## Punto de partida en el código

- `RoomCoordinator`, al pasar a `GAME_RESULTS`, llama a `GameResultsPersister.persist(...)` en segundo plano, encadenado
  tras `auditReady`. Le pasa `ResultRoomSnapshot` (las identidades `AuthUser` de los miembros), `GameResults`, el
  `resultId`, el `gameId` y la config como `JsonNode`. La config ya lleva `mode` en los seis juegos con modos.
- `JpaGameResultsPersister.persistNow` llama a `RoomHistoryWriter.persistResults`. Es una transacción `SERIALIZABLE`
  con hasta 3 intentos ante `40001`, `40P01` y `23505`, e idempotente por `resultId`: si la partida ya está
  `COMPLETED`, vuelve sin hacer nada.
  - Por cada clasificación guarda `PlayerGameResult` (`metrics` = `standing.stats()` completo).
  - Si la cuenta es `USER`, actualiza `UserStats` (`gamesPlayed`, `gamesWon`, `totalPoints` y `xp`) y
    `UserGameStats`. Este último fusiona con `MetricsMerge` **solo las métricas declaradas** en
    `profileStats.metrics` de `registry.json`; una clave no declarada se pierde.
  - Victoria: `won = standing.won() != null ? standing.won() : playerId.equals(results.winnerId())`.
    - 24 motores clasifican con `Scoring.buildRankedResults`, que fija `won = (position == 1)`. Así, los empatados en
      cabeza ganan todos, aunque `winnerId` sea `null`.
    - Pokémon Impostor fija `won` por bando, con posición 1 para el bando ganador y 2 para el perdedor.
    - Bingo, Pokédle Race y Type Chain fijan `won` con su propia regla.
    - En Type Duel `COOP`, `won` queda en `null` y `winnerId` también, así que nadie gana.
- Nivel: `Experience.levelFor(xp)`. El nivel L empieza en `25 (L − 1) (L + 2)` XP: el 5 en 700, el 10 en 2700 y el
  20 en 10 450.
- `UserConnections.send(userId, event, payload)` (`application/friends`, implementado por `WsUserConnections`) envía a
  todas las pestañas abiertas de la cuenta, sin bloquear.
- Los 28 `*Results.tsx` pintan con `ResultsShell`. `RoomPage` los monta cuando `room.phase === 'GAME_RESULTS'`.
- El perfil (`ProfilePage`, `GET /api/auth/profile`) pinta las métricas de cada juego a partir de
  `profileStats.metrics`. Una métrica nueva en el manifiesto aparece sola.
- Las métricas de partida que usa el catálogo ya existen en los resultados:

  | Juego | Métrica | Qué es |
  |---|---|---|
  | Pokédex Distance | `exactHits` | Distancias 0 |
  | Higher or Lower | `bestStreak` | En `ENDLESS`, la racha final |
  | Shiny Quiz | `correctVotes` | En `SURVIVAL`, las rondas superadas |
  | Learnset Guess | `initialSolves` | En `MANUAL_REVEAL`, aciertos con un solo grupo visible (`revealStage` 0) |
  | Type Duel | `groupTotal` | En `COOP`, Pokémon que encontró el grupo en la partida |
  | Pokémon Impostor | `wonAsImpostor` | Ganar como impostor |

## Datos (Flyway `V8__logros.sql`)

Las migraciones existentes llegan hasta `V7__amigos.sql`, y la rama `modos` no añade ninguna.

```sql
CREATE TABLE public."UserAchievement" (
    "userId" text NOT NULL,
    "achievementId" text NOT NULL,
    "unlockedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userId", "achievementId"),
    CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);
```

- La fila se inserta con `INSERT … VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING "achievementId"`, una sentencia
  nativa por id (como mucho 48), y no con `persist`. Un duplicado no lanza `23505`, que provocaría un reintento, y
  `RETURNING` da exactamente los logros nuevos.
- **Bloqueos de la transacción `SERIALIZABLE`:** las lecturas nuevas usan índices que ya existen, así que la V8 no
  añade ninguno.
  - `PlayerGameResult_userId_idx` sirve para «Fiel».
  - `GameHistory_pkey` sirve para el `JOIN`.
  - `UserGameStats_userId_gameId_key` sirve para `winsByGame`.

  Sin estos índices, un recorrido secuencial bloquearía la tabla entera y haría fallar con `40001` los resultados de
  otras salas.
- **Reloj:** `RoomHistoryWriter` recibe el `Clock` de `config/ClockBeans`. La hora de fin es `Instant.now(clock)`, así
  que los tests de «Búho nocturno» no dependen de la hora a la que se ejecutan.
- **Récord de Racha infinita:**
  - El motor de Higher or Lower emite en `ENDLESS` la estadística `endlessBestStreak` (= `bestStreak`).
  - En `CLASSIC` no la emite, así que las fixtures doradas del Clásico no cambian.
  - `registry.json` declara `{"key": "endlessBestStreak", "label": "Récord en Racha infinita", "aggregation": "MAX"}`
    en `profileStats.metrics` de `higher-lower`, así que `MetricsMerge` la conserva como máximo histórico.
  - Una partida Clásica no la toca: un valor ausente cuenta como 0 y `MAX` deja el anterior.
  - El perfil la muestra sin código nuevo.
- **Decisión tomada (revisable):** sin relleno SQL de logros antiguos. Las condiciones acumuladas (partidas, victorias,
  nivel y «Gana una partida de X») se evalúan contra **todas** las estadísticas de la cuenta en cada partida. Una cuenta
  con historial las recibe todas al terminar su siguiente partida, y el aviso las agrupa («y N más»). Así la regla está
  en un solo sitio (Java) y no se repite en SQL.

## Catálogo (propuesta para revisar)

Es declarativo, en Java: `domain/achievements/AchievementCatalog`, construido a partir de los manifiestos de
`GameRegistry`. Cada logro tiene:
- `id` estable;
- `family` (`GENERAL`, `GAME` o `SECRET`);
- `gameId`, o `null`;
- nombre y descripción en español;
- una condición pura sobre `AchievementFacts` (ver «Evaluación»).

**Decisión tomada (revisable):** sin icono propio por logro. El frontend pinta:
- en los `GAME`, el `GameArt` del juego;
- en los `GENERAL`, `Medal`;
- en los `SECRET`, `Sparkles`;
- en un bloqueado, `Lock` sobre gris.

Así no hace falta un mapa de nombres de iconos.

**Decisión tomada (revisable):** las victorias se cuentan como hoy cuenta «Victorias» el perfil, partidas de un solo
jugador incluidas. Así los números del logro y del perfil coinciden. No hay rankings, así que no compensa añadir otro
contador.

Total: **48 logros**: 10 generales, 34 de minijuego y 4 secretos.

### Generales (10)

| id | Nombre | Descripción | Condición |
|---|---|---|---|
| `general.first-game` | Primera partida | Termina tu primera partida. | `gamesPlayed ≥ 1` |
| `general.games-10` | Habitual | Termina 10 partidas. | `gamesPlayed ≥ 10` |
| `general.games-50` | Veterano | Termina 50 partidas. | `gamesPlayed ≥ 50` |
| `general.games-100` | Leyenda de la sala | Termina 100 partidas. | `gamesPlayed ≥ 100` |
| `general.first-win` | Primera victoria | Gana una partida. | `gamesWon ≥ 1` |
| `general.wins-10` | Ganador nato | Gana 10 partidas. | `gamesWon ≥ 10` |
| `general.wins-50` | Campeón | Gana 50 partidas. | `gamesWon ≥ 50` |
| `general.level-5` | Nivel 5 | Llega al nivel 5. | `level ≥ 5` |
| `general.level-10` | Nivel 10 | Llega al nivel 10. | `level ≥ 10` |
| `general.level-20` | Nivel 20 | Llega al nivel 20. | `level ≥ 20` |

`gamesPlayed`, `gamesWon` y `level` son los de `UserStats`, ya actualizados con esta partida.

### Por minijuego (34)

**Victoria en cada juego (28):** id `game.<gameId>.win`, nombre «Gana en <nombre del manifiesto>» y descripción «Gana
una partida de <nombre del manifiesto>.». Condición: `UserGameStats.gamesWon ≥ 1` de ese juego. Se evalúa contra
todas las filas de la cuenta, no solo contra la del juego que acaba de terminar.

Los 28 `gameId` de `registry.json`, en su orden:

`pokedex-distance`, `shiny-vote`, `pokemon-impostor`, `higher-lower`, `type-duel`, `learnset-guess`, `pokeddle-race`,
`pokemon-bingo`, `whos-that-pokemon`, `pokedex-entry-guess`, `type-chain`, `guess-from-stats`, `zoomed-pokemon`,
`poke-taboo`, `one-of-us-is-fake`, `pokemon-bluff-auction`, `sketchmon`, `pokemon-connections`,
`pokemon-team-auction`, `secret-ranking`, `most-likely-to`, `would-you-rather`, `pokemon-red-flag`,
`tcg-higher-lower`, `pokemon-cry-quiz`, `pokemon-trivia`, `pokemon-palette-guess` y `who-is-who-pokemon`.

**Uno específico en cada juego con modos (6).** Solo se evalúan cuando termina una partida de ese juego, con las
métricas de **esta** partida (`standing.stats()`) y el `mode` de su config. Si la config no trae `mode`, cuenta como
`CLASSIC`.

| id | Nombre | Descripción | Condición |
|---|---|---|---|
| `game.pokedex-distance.bullseye` | Diana | Clava la distancia en una ronda de Pokédex Distance. | `exactHits ≥ 1`, en cualquier modo |
| `game.higher-lower.endless-10` | Imparable | Encadena 10 aciertos en Racha infinita. | `mode = ENDLESS` y `endlessBestStreak ≥ 10` |
| `game.shiny-vote.survival-10` | Ojo de halcón | Supera 10 rondas en Supervivencia de Shiny Quiz. | `mode = SURVIVAL` y `correctVotes ≥ 10` |
| `game.learnset-guess.first-group` | A la primera | Acierta en Revelación manual viendo un solo grupo de movimientos. | `mode = MANUAL_REVEAL` y `initialSolves ≥ 1` |
| `game.type-duel.coop-20` | Trabajo en equipo | En Cooperativo, encontrad entre todos 20 Pokémon en una partida. | `mode = COOP` y `groupTotal ≥ 20` |
| `game.pokemon-impostor.disguise` | Maestro del disfraz | Gana una partida de Pokémon Impostor siendo el impostor. | `wonAsImpostor ≥ 1`, en cualquier modo |

- **Decisión tomada (revisable):** «A la primera» solo cuenta en Revelación manual. En Clásico, `initialSolves` cuenta
  los aciertos antes de la primera pista por tiempo, que es otra cosa.
- **Decisión tomada (revisable):** Type Duel usa `groupTotal`, que suma toda la partida, en vez de exigir «20 en una
  ronda». Así el motor no se toca: lo está cambiando otra tarea, y una combinación doble puede tener menos de 20
  Pokémon.

### Secretos (4)

**Decisión tomada (revisable):** los ids de los secretos son neutros (`secret.1` … `secret.4`). Así ni el id revela el
logro mientras está bloqueado.

| id | Nombre | Descripción | Condición (de esta partida) |
|---|---|---|---|
| `secret.1` | Foto finish | Termina empatado en el primer puesto. | Ver abajo |
| `secret.2` | Fiel | Juega 10 partidas seguidas del mismo minijuego. | Las 10 últimas partidas `COMPLETED` de la cuenta, esta incluida, son del mismo `gameId` |
| `secret.3` | Búho nocturno | Termina una partida entre las 3:00 y las 5:00. | La hora de fin, en `Europe/Madrid`, está en [03:00, 05:00) |
| `secret.4` | Lo importante es participar | Queda último con 0 puntos en una partida de 4 o más jugadores. | Ver abajo |

- **Foto finish:** `position = 1`, al menos otro jugador con `position = 1` y `playerCount ≥ 2`.
- **Lo importante es participar:** `points = 0`, `position` igual a la mayor `position` de la partida y mayor que 1, y
  `playerCount ≥ 4`.
- **Juegos excluidos de Foto finish y de Lo importante es participar:** Pokémon Impostor, porque su posición es el
  bando y no un ranking, y Type Duel en `COOP`, donde no hay ganador individual.
- **Fiel:** se calcula con una consulta en la misma transacción, después de guardar el `PlayerGameResult` de esta
  partida:

  ```sql
  SELECT h."gameId" FROM "PlayerGameResult" p JOIN "GameHistory" h ON h.id = p."historyId"
  WHERE p."userId" = ? AND h.status = 'COMPLETED' ORDER BY h."endedAt" DESC LIMIT 10
  ```

  Se cumple si devuelve 10 filas, todas del `gameId` actual.

## Evaluación

`AchievementFacts` es un record de dominio, puro. Se construye por jugador registrado:

```java
record AchievementFacts(
    String gameId, String mode, GameStanding standing, List<GameStanding> standings, boolean won,
    int gamesPlayed, int gamesWon, int level, Map<String, Integer> winsByGame,
    List<String> recentGameIds, ZonedDateTime endedAt)
```

`playerCount` es `standings.size()`.

- `AchievementCatalog.met(facts)` devuelve los ids cuya condición se cumple. Evalúa:
  - los `GENERAL`;
  - las 28 victorias, con `winsByGame`;
  - el específico del juego actual;
  - los `SECRET`.
- `AchievementFacts` calcula la parte derivada y se prueba sin base de datos:
  - `playerCount`;
  - la mayor posición;
  - si comparte el primer puesto;
  - `individualRanking`: no es Impostor ni Type Duel `COOP`.

## Flujo

1. **En la transacción de resultados** (`RoomHistoryWriter.persistResults`), justo después de actualizar `UserStats` y
   `UserGameStats` de cada jugador `USER`:
   - se leen todas sus `UserGameStats` (`winsByGame`) y, para «Fiel», sus 10 últimas partidas;
   - se construye `AchievementFacts` y se evalúa el catálogo;
   - se insertan los cumplidos con `ON CONFLICT DO NOTHING RETURNING`.

   Lo que devuelve `RETURNING` son los logros nuevos.
2. **Récord:**
   - Solo en `higher-lower` con `mode = ENDLESS`.
   - Se compara `endlessBestStreak` antes y después de `MetricsMerge`. Si sube, se anota
     `PersonalRecord("higher-lower", "endlessBestStreak", "Récord en Racha infinita", value, previous)`.
3. `persistResults` pasa de `void` a devolver `Map<String, AchievementsUnlocked>`: solo las cuentas que tienen algo
   nuevo. Si la partida ya estaba `COMPLETED` (una reproducción), devuelve un mapa vacío. Un intento revertido no deja
   filas, y el reintento vuelve a calcularlo todo.
4. **Tras el commit**, `JpaGameResultsPersister.persistNow` entrega cada entrada al puerto nuevo `AchievementEvents`
   (`application/achievements`).
   - Su implementación usa `UserConnections.send(userId, "achievements:unlocked", payload)`.
   - Un fallo al enviar se registra en el log y no afecta a los resultados.
   - Si el último intento falla, no se envía nada.
5. **Evento** `achievements:unlocked`:

   ```ts
   {
     achievements: { id, family, gameId: string | null, name, description }[];
     records: { gameId, key, label, value, previous }[];
   }
   ```

   - Lleva el nombre y la descripción reales, también de los secretos, porque el cliente no puede sacarlos del
     catálogo público.
   - Va a todas las pestañas de la cuenta.
6. **Cliente:** `AchievementsProvider`, dentro de `RoomProvider`, se suscribe al evento y guarda una cola en memoria
   (`achievements-state.ts`, reductor puro). Solo enseña la cola cuando **no hay partida en juego**: `room` es `null` o
   `room.phase ∈ {GAME_RESULTS, SESSION_RESULTS, LOBBY}`. El caso típico, que el evento llegue con los resultados ya en
   pantalla, sale al instante.

   Si el anfitrión ya ha lanzado la siguiente partida (`continueSession` va directo al siguiente juego, sin lobby), la
   cola espera a los siguientes resultados. Así nunca sale nada a mitad de partida.
7. **Dónde se ve:**
   - En `GAME_RESULTS`, `ResultsShell` pinta el recuadro «¡Logro desbloqueado!». `ResultsShell` es común a los 28
     juegos, así que hay un solo punto de montaje.
     - Muestra hasta 3 logros con su arte, nombre y descripción, y «y N más» si hay más.
     - Debajo, si hay récord: «Nuevo récord personal en Racha infinita: N (antes M)».
     - Incluye un enlace «Ver mis logros» a `/profile?tab=logros`.
   - En `LOBBY`, en `SESSION_RESULTS` y sin sala, sale un `ActionToast` con `live="status"` (región viva educada) con
     «Ver mis logros» y «Cerrar». Si solo hay récords, su texto es la línea del récord. Va en la misma pila que las
     invitaciones de amigos (una sola pila en `Layout`).
   - La cola se vacía al pasar a una fase distinta de aquella en la que se mostró (una transición del reductor) o al
     cerrar el aviso. Nunca se vacía al desmontar un componente, porque `StrictMode` desmonta y vuelve a montar en
     desarrollo, y eso perdería el aviso.
8. **Perfil:** el panel derecho pasa a tener `Tabs` «Estadísticas» y «Logros», con la insignia «N/48». El parámetro
   `?tab=logros` abre la segunda pestaña.
   - «Logros» pide `GET /api/achievements` al montar el perfil.
   - Pinta tres grupos: «Generales», «Minijuegos» y «Secretos», en una rejilla con su propio scroll dentro del panel.
   - Desbloqueado: en color, con «Conseguido el 7 nov 2026».
   - Bloqueado: en gris, con su descripción.
   - Secreto bloqueado: «Logro secreto» y «Sigue jugando para descubrirlo.».

## Accesibilidad y UI

- **Componente nuevo `AchievementTile`** en `frontend/src/ui/`, que pasa primero por la galería `/dev/ui`:
  - props `name`, `description`, `state: 'unlocked' | 'locked' | 'secret'`, `art: ReactNode`, `date?: string` y
    `fresh?: boolean`;
  - estados en la galería: desbloqueado, bloqueado, secreto y recién conseguido (`fresh`);
  - `fresh` anima una sola vez la entrada, solo con `transform` y `opacity`, y nada con `prefers-reduced-motion`;
  - el recuadro de resultados y el perfil lo reutilizan.
- **Una sola región viva:**
  - `ResultsShell` monta siempre un `<p className="sr-only" role="status" aria-live="polite">`, que anuncia «Logro
    desbloqueado: <nombres>». El recuadro visible no es región viva.
  - Las pantallas de resultados no tienen hoy ninguna región viva, así que queda una.
  - Fuera de partida, el `ActionToast` de logros usa `live="status"`: `role="status"` y `aria-live="polite"`. Nunca sale
    a mitad de partida, así que no compite con la región viva de la pantalla de juego.
- Texto ≥ 13 px, objetivos táctiles ≥ 44 px y nada de scroll de documento en las capturas.

## Rutas REST

`GET /api/achievements` (`adapters/in/rest/achievements/AchievementsController`, `@ExecuteOn(BLOCKING)`):

- Un invitado o sin sesión recibe `401 {"error":"Registered account required"}`.
- `200`:

  ```json
  { "achievements": [AchievementResponse], "unlocked": 3, "total": 48 }
  ```

  `AchievementResponse` es
  `{id, family, gameId|null, name, description, unlockedAt|null}`, y `unlockedAt` va en ISO.
  - Orden: `GENERAL`, `GAME` (en el orden del registro, con la victoria antes que el específico) y `SECRET`.
  - Un secreto bloqueado sale con `name` «Logro secreto», `description` «Sigue jugando para descubrirlo.» y su id
    neutro.

Hay que regenerar el contrato (`./gradlew syncOpenApi` y `npm run api:types -w @pokemon-universe/web`) y añadir la ruta
a `OpenApiSpecTest` y `api-types.test.ts`. Ya pasa por los proxys de Vite y nginx, porque cuelga de `/api`.

## Pruebas

- **Dominio** (`AchievementCatalogTest`, `AchievementFactsTest`):
  - cada condición, con un caso que la cumple y otro que no;
  - 48 logros con ids únicos y 28 victorias, una por manifiesto;
  - los modos de los seis específicos.
- **Persistencia** (`UserAchievementRepositoryTest` y `JpaGameResultsPersisterTest` ampliado):
  - insertar dos veces deja una fila y `RETURNING` vacío la segunda vez;
  - borrar la cuenta borra sus logros;
  - un invitado no recibe nada;
  - reproducir el mismo `resultId` no envía otro evento;
  - un intento revertido no envía nada;
  - el récord solo sube, y una partida Clásica no lo toca;
  - «Fiel» con 9 y con 10 partidas.
- **Migración:** `FlywayMigrationsTest` y `SchemaBaselineTest` con la V8.
- **Motor:** `HigherLowerEngineTest` (`endlessBestStreak` solo en `ENDLESS`) y la fixture `endless-mode.json`
  regrabada.
- **REST** (`AchievementsControllerTest`): 401 al invitado, el orden, y que el JSON de un secreto bloqueado no contiene
  su nombre.
- **Vitest:**
  - `achievements-state.test.ts`: la cola se retiene en partida y se muestra en resultados o en el lobby;
  - `AchievementTile.test.tsx`;
  - `AchievementNotice.test.tsx`: hasta 3 y «y N más», y el récord;
  - `ProfilePage.test.tsx`: la pestaña Logros y los secretos ocultos.
- **Playwright** (`e2e/tests/logros.spec.ts`):
  - una cuenta nueva juega Higher or Lower sola, con 1 ronda;
  - ve «Primera partida» en los resultados y en la pestaña Logros del perfil;
  - capturas a 1280×720, 1920×1080 y 390×844, y rúbrica ≥ 19/24.

## Requisito previo

La rama `modos` tiene que estar terminada, con los seis modos, y fusionada antes de empezar. Hay dos motivos:
- `groupTotal` de Type Duel `COOP` y el `mode` de Impostor tienen que existir;
- el motor de Higher or Lower está cambiado allí.

Si Pokémon Impostor `ONE_WORD` aún no está, no bloquea: su logro no depende del modo.

## Fuera de alcance

- Logros sociales, cosméticos como recompensa y rankings globales.
- Avisos a mitad de partida.
- Rellenar con SQL los logros de partidas antiguas.
- Récords personales de otros juegos: el mecanismo `PersonalRecord` admite más, pero esta pieza solo cubre la Racha
  infinita.
