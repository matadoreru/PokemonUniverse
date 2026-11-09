# Pokédex Absurda — diseño

Fecha: 2026-11-09. Primer juego de los tres pedidos (Pokédex Absurda, Traductor Unown, ¿Quién soy?); cada uno tiene su
propia spec, plan e implementación.

## Idea

En cada ronda sale un Pokémon real (nombre y sprite) y cada jugador escribe en secreto una entrada de Pokédex inventada.
Luego se vota de forma anónima. Hay dos modos:

- **Clásico, «La más absurda»**: gana la entrada más absurda.
- **«¿Cuál es la real?»** (`REAL_ENTRY`): entre las inventadas aparece la entrada oficial, y hay que descubrirla y colar
  la propia.

## Reglas

- Jugadores: de 3 a 8. Los espectadores ven todo lo público, pero no escriben ni votan.
- Configuración (`absurdPokedexConfigSchema`, `.strict()`):

  | Clave | Valores | Por defecto |
  |---|---|---|
  | `generations` | `pokemonGenerationsSchema` | todas |
  | `rounds` | entero 1–10 | 5 |
  | `writeSeconds` | entero 30–120 | 60 |
  | `voteSeconds` | entero 15–60 | 30 |
  | `mode` | `CLASSIC` \| `REAL_ENTRY` (`.default('CLASSIC')`) | `CLASSIC` |

- Fases de cada ronda:
  1. **`WRITING`.** Cada jugador escribe una entrada de 1 a 150 caracteres, contados tras quitar espacios al principio y
     al final, con borrador guardado como en La Frase. La fase termina cuando han enviado todos o se agota
     `writeSeconds`.
  2. **`VOTING`.** Se muestran las entradas barajadas y sin autor. Termina cuando han votado todos los que pueden votar
     o se agota `voteSeconds`.
  3. **Resultados de ronda**, con el ciclo temporizado habitual (`Timing.advanceTimedRound`), y después la ronda
     siguiente o el final.
- Quien no envía entrada vota igual. Nadie puede votar su propia entrada.
- Si al cerrar `WRITING` hay menos de 2 entradas para votar, la ronda se salta sin puntos y se va directa a resultados
  con un aviso. En `REAL_ENTRY` la oficial cuenta como entrada, así que basta 1 inventada.

### Modo Clásico

- El voto es obligatorio para terminar antes de tiempo: uno a la entrada más absurda, `entryId`.
- Puntos: +1 por cada voto recibido y +2 a la más votada. Si hay empate, los +2 son para todas las empatadas, siempre
  que tengan al menos 1 voto.

### Modo `REAL_ENTRY`

- El servidor añade la entrada oficial: una elegida al azar entre las del Pokémon con 150 caracteres o menos tras
  tapar el nombre, para que la longitud no la delate. El mazo de este modo solo incluye Pokémon con alguna entrada así.
- Tapado del nombre: el nombre y sus alias se cambian por `???`, también en las entradas inventadas, para que `???` no
  delate a la oficial. Se usa `sanitizePokedexEntry` de Pokédex Entry Guess, que se mueve a una utilidad compartida en
  `domain/pokemon/` sin cambiar su comportamiento.
- Votos:
  - `entryId`, obligatorio: cuál crees que es la oficial;
  - `funnyEntryId`, opcional: la inventada más graciosa, que no puede ser la tuya. Si apunta a la oficial, el voto se
    acepta y la graciosa no cuenta (rechazarla delataría cuál es la oficial); el jugador la sigue viendo marcada.
- Puntos: +2 por acertar la oficial, +1 al autor por cada jugador que vote su inventada como oficial y +1 por cada voto
  de graciosa recibido.
- En resultados se ve la oficial con el juego del que sale (`versionLabel`) y, debajo de cada inventada, a quién
  engañó.

## Privacidad

- Hasta los resultados de ronda, ninguna proyección expone los autores, cuál es la oficial ni los votos ajenos. Solo se
  publican los ids de quién ha enviado o votado.
- Los ids de las entradas se generan barajados en cada ronda con `context.random()`, y el orden en que se muestran no
  depende del autor ni de si es la oficial.
- El borrador y la entrada propia solo aparecen en la proyección de su jugador.

## Contrato compartido (`packages/shared/src/games/absurd-pokedex/`)

- `config.ts`: el esquema, `defaultAbsurdPokedexConfig` y `ABSURD_POKEDEX_MODES = ['CLASSIC', 'REAL_ENTRY']`. Se
  registra en `games/modes.ts` con las etiquetas «La más absurda» y «¿Cuál es la real?» y el texto del modo nuevo.
- `types.ts`:
  - Acciones (`.strict()`):
    - `UPDATE_ABSURD_DRAFT { text ≤150 }`;
    - `SUBMIT_ABSURD_ENTRY { text trim 1–150 }`;
    - `VOTE_ABSURD { entryId, funnyEntryId? }`.
  - Estado público:
    - `gameId`, `phase`, `roundNumber` y `totalRounds`;
    - `pokemon` (id, nombre, sprite, número y tipos);
    - `mode`;
    - `submittedPlayerIds` y `votedPlayerIds`;
    - `entries` (`{ id, text }[]`, solo en `VOTING`);
    - `scores`, `roundEndsAt` y `nextTransitionAt`;
    - `lastRound` y `results`.
  - Estado por jugador: `role`, `canSubmit`, `ownDraft`, `ownEntry`, `ownEntryId`, `canVote`, `ownVoteEntryId` y
    `ownFunnyEntryId`.
  - `lastRound` incluye:
    - las entradas con `authorId` (nulo en la oficial), `isReal`, `votesReceived`, `funnyVotesReceived` y `votedBy`;
    - la oficial con `versionLabel`;
    - `winnerEntryIds`, `pointsAwarded`, `skipped` y `missingPlayerIds`.
- Se exporta en `public.ts`.

## Motor Java (`domain/game/engines/absurdpokedex/`)

- `AbsurdPokedexConfig`, `AbsurdPokedexTypes`, `AbsurdPokedexRules` y `AbsurdPokedexEngine`, con las convenciones de
  `engines/README.md` (builder, inmutabilidad, orden de claves, PRNG y errores literales).
- Referencias:
  - La Frase (`pokemonredflag/`) para las fases con tiempo, los borradores y la votación anónima, sin su segunda vuelta
    de desempate;
  - Pokédex Entry Guess para `PokedexEntryPokemonCatalog` y el tapado.
- Estadísticas de perfil:
  - `roundsPlayed`, `entriesSubmitted`, `votesReceived`, `roundWins` y `pointsFromRounds`;
  - en `REAL_ENTRY`, además, `realGuessed` y `playersFooled`.
  - Derivada: `answerRate` (`entriesSubmitted` / `roundsPlayed`).
- Registro:
  - entrada en `backend/src/main/resources/games/registry.json`;
  - `portedEngines` en `ClasspathGameRegistryLoader`;
  - fixtures doradas en `src/test/resources/golden/absurd-pokedex/`.

## Frontend

- `frontend/src/room/AbsurdPokedexGame.tsx` y `AbsurdPokedexResults.tsx`, registrados en `games/registry.ts` y
  `game-icons.ts`, y en las listas que enumeran juegos (`game-skip-slot.ts` si aplica).
- **Escribir:**
  - ficha de Pokédex con sprite, nombre, número y tipos;
  - área de texto con un contador de 150 y el botón Enviar;
  - quién ha enviado y el temporizador.
- **Votar:**
  - tarjetas con aspecto de entrada de Pokédex; la propia, marcada «Tu entrada» y sin botones;
  - en `REAL_ENTRY`, «Es la real» y «😂 La más graciosa» (opcional).
- **Resultados:**
  - entradas ordenadas por votos, con autor y votantes;
  - en `REAL_ENTRY`, la oficial destacada con su juego y a quién engañó cada inventada.
- Solo componentes de `frontend/src/ui/`. Si hace falta una tarjeta de entrada nueva, primero entra en `/dev/ui`.
- Una región `aria-live` siempre montada. Los errores van al aviso de la sala (`ignoreFailure`). Texto ≥13 px y botones
  ≥44 px.

## Pruebas (solo de lo tocado)

- **Java:**
  - Tests del motor:
    - las fases;
    - los rechazos: votar la propia, votar fuera de fase, `funnyEntryId` en Clásico o apuntando a la propia, texto
      vacío o largo; la graciosa sobre la oficial se acepta sin contar y sin delatar nada;
    - el tiempo agotado con y sin entradas y el salto con menos de 2;
    - los puntos de los dos modos con empates;
    - la privacidad antes de los resultados.
  - Test de la utilidad de tapado ya movida. Las fixtures doradas de Pokédex Entry Guess siguen pasando sin regrabarse.
  - Fixtures doradas nuevas y `verifyOpenApi`, si cambia algo del contrato.
- **Shared:** `config-cases.test.ts` (con su `config-cases.json`), `registry-defaults.test.ts` y `modes.test.ts`.
- **Frontend:** `AbsurdPokedexGame.test.tsx` para escribir, votar, no poder votar la propia y los resultados de los dos
  modos.
- **e2e:** el caso del juego en `e2e/tests/juegos.spec.ts`, con `npm run ui:check -- juegos` a 1280×720, 1920×1080 y
  390×844, y la nota de la rúbrica de `docs/visual-review.md` (mínimo 19/24) en el commit.

## Fuera de alcance

- Moderar el texto de las entradas, más allá del límite de longitud.
- Una tercera modalidad mixta.
- El reto diario de este juego.
