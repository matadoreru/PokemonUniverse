package es.pokemonuniverse.domain.game.engines.absurdpokedex;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexAction;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexEntry;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexPlayerState;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexPlayerStats;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexState;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokedexEntryText;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Fases, rechazos, privacidad y presencia del motor, con el catálogo dorado, un azar fijo y un reloj controlado. */
class AbsurdPokedexEngineTest {

  private static final InMemoryPokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");
  /** El mapper del cable ({@code NON_NULL}, como {@code application.yml}). */
  private static final ObjectMapper WIRE =
      ObjectMapper.create(Map.of("micronaut.serde.serialization.inclusion", "NON_NULL"));

  private final AbsurdPokedexEngine engine = new AbsurdPokedexEngine(GoldenManifests.of(AbsurdPokedexEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static String wire(Object value) {
    try {
      return WIRE.writeValueAsString(value);
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  private static List<GamePlayer> players(int count) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= count; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return list;
  }

  private static GameContext context(int players, long seed) {
    return GameContext.builder(CATALOG, new Mulberry32(seed)).players(players(players)).now(1_000).build();
  }

  private static AbsurdPokedexConfig config(AbsurdPokedexMode mode, int rounds) {
    return config(mode, rounds, List.of(1, 2));
  }

  private static AbsurdPokedexConfig config(AbsurdPokedexMode mode, int rounds, List<Integer> generations) {
    return AbsurdPokedexConfig.builder().generations(generations).rounds(rounds).writeSeconds(30).voteSeconds(15)
        .mode(mode).build();
  }

  /** Partida empezada a {@code now = 1000}: la escritura acaba a 31000. */
  private AbsurdPokedexState started(AbsurdPokedexConfig config, GameContext context) {
    return engine.start(engine.createInitialState(config, context), context);
  }

  private static AbsurdPokedexAction draft(String text) {
    return new AbsurdPokedexAction.UpdateDraft(text);
  }

  private static AbsurdPokedexAction submit(String text) {
    return new AbsurdPokedexAction.SubmitEntry(text);
  }

  private static AbsurdPokedexAction vote(String entryId) {
    return new AbsurdPokedexAction.Vote(entryId, null);
  }

  private static AbsurdPokedexAction vote(String entryId, String funnyEntryId) {
    return new AbsurdPokedexAction.Vote(entryId, funnyEntryId);
  }

  private AbsurdPokedexState accept(AbsurdPokedexState state, String playerId, AbsurdPokedexAction action,
      GameContext context) {
    var result = engine.handleAction(state, playerId, action, context);
    assertTrue(result.accepted(), () -> playerId + " " + action + ": " + result.error());
    return result.state();
  }

  /** Rechaza con {@code error} y deja el estado intacto. */
  private void rejects(AbsurdPokedexState state, String playerId, AbsurdPokedexAction action, GameContext context,
      String error) {
    GameActionResult<AbsurdPokedexState> result = engine.handleAction(state, playerId, action, context);
    assertFalse(result.accepted(), () -> playerId + " " + action);
    assertEquals(error, result.error());
    assertEquals(state, result.state());
  }

  private static AbsurdPokedexEntry entryOf(AbsurdPokedexState state, String authorId) {
    return state.entries().stream().filter(entry -> authorId.equals(entry.authorId())).findFirst().orElseThrow();
  }

  private static AbsurdPokedexEntry officialOf(AbsurdPokedexState state) {
    return state.entries().stream().filter(AbsurdPokedexEntry::isReal).findFirst().orElseThrow();
  }

  /** Escriben todos los jugadores ({@code "Entrada de pN"}) y se pasa a votar. */
  private AbsurdPokedexState everyoneWrites(AbsurdPokedexState state, GameContext context) {
    for (var playerId : state.playerIds()) {
      state = accept(state, playerId, submit("Entrada de " + playerId + " en la ronda " + state.roundNumber()), context);
    }
    assertEquals(GamePhase.VOTING, state.phase());
    return state;
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("absurd-pokedex", engine.manifest().id());
    assertEquals("Pokédex Absurda", engine.manifest().name());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
    assertThrows(IllegalArgumentException.class, () -> new AbsurdPokedexEngine(GoldenManifests.of("higher-lower")));
  }

  @Test
  void needsThreePlayers() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(engine.defaultConfig(), context(2, 1)));
    assertEquals("Se necesitan al menos 3 jugadores.", error.getMessage());
    // Disponibilidad: el catálogo dorado solo trae las generaciones 1 y 2.
    var classic = config(AbsurdPokedexMode.CLASSIC, 3, List.of(9));
    assertEquals("Solo hay 0 Pokémon disponibles en estas generaciones: baja las rondas a 0 o añade generaciones.",
        engine.checkAvailability(classic, context(3, 1)).orElseThrow());
    var real = config(AbsurdPokedexMode.REAL_ENTRY, 3, List.of(9));
    assertEquals("No hay Pokémon con entradas de Pokédex en las generaciones seleccionadas.",
        engine.checkAvailability(real, context(3, 1)).orElseThrow());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(real, context(3, 1)));
    assertEquals("No hay Pokémon con entradas de Pokédex en las generaciones seleccionadas.", error.getMessage());
    assertTrue(engine.checkAvailability(config(AbsurdPokedexMode.REAL_ENTRY, 10), context(3, 1)).isEmpty());
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    var submit = engine.parseAction(json("{\"type\":\"SUBMIT_ABSURD_ENTRY\",\"text\":\"\\u00a0 Come rocas \\u3000\"}"));
    assertEquals("Come rocas", assertInstanceOf(AbsurdPokedexAction.SubmitEntry.class, submit).text());
    var error = assertThrows(ConfigValidationException.class,
        () -> engine.parseAction(json("{\"type\":\"SUBMIT_ABSURD_ENTRY\",\"text\":\"  \"}")));
    assertEquals("Escribe una entrada antes de enviarla.", error.getMessage());
    error = assertThrows(ConfigValidationException.class,
        () -> engine.parseAction(json("{\"type\":\"SUBMIT_ABSURD_ENTRY\",\"text\":\"" + "x".repeat(151) + "\"}")));
    assertEquals("La entrada no puede superar 150 caracteres.", error.getMessage());
    error = assertThrows(ConfigValidationException.class, () -> engine.parseAction(json("{\"type\":\"VOTE_ABSURD\"}")));
    assertEquals("Acción de Pokédex Absurda no válida.", error.getMessage());
  }

  @Test
  void writingEndsWhenEveryoneSubmitted() {
    var context = context(3, 7);
    var state = started(config(AbsurdPokedexMode.CLASSIC, 2), context);
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    assertEquals(31_000L, state.roundEndsAt());
    state = accept(state, "p1", submit("Uno"), context.withNow(2_000));
    state = accept(state, "p2", submit("Dos"), context.withNow(3_000));
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    state = accept(state, "p3", submit("Tres"), context.withNow(4_000));
    assertEquals(GamePhase.VOTING, state.phase());
    assertEquals(19_000L, state.roundEndsAt());
    assertEquals(List.of("entry-1", "entry-2", "entry-3"), state.entries().stream().map(AbsurdPokedexEntry::id).toList());
    var view = engine.getPublicState(state, context);
    assertEquals(List.of("p1", "p2", "p3"), view.submittedPlayerIds());
    assertEquals(3, view.entries().size());
    assertNull(view.lastRound());
  }

  @Test
  void writingTimeoutGoesToVotingWithTheEntriesSoFar() {
    var context = context(3, 7);
    var state = started(config(AbsurdPokedexMode.CLASSIC, 2), context);
    state = accept(state, "p1", submit("Enviada"), context.withNow(2_000));
    state = accept(state, "p2", draft("  Borrador sin enviar  "), context.withNow(3_000));
    state = accept(state, "p3", draft("   "), context.withNow(3_000));
    assertEquals(state, engine.handleTimeout(state, context.withNow(30_999)));
    state = engine.handleTimeout(state, context.withNow(31_000));
    assertEquals(GamePhase.VOTING, state.phase());
    // Como en La Frase, el borrador pendiente cuenta como entrada, recortado; uno en blanco no.
    assertEquals("Borrador sin enviar", entryOf(state, "p2").text());
    assertEquals(2, state.entries().size());
    assertEquals(List.of("p1", "p2"), engine.getPublicState(state, context).submittedPlayerIds());
    state = engine.handleTimeout(state, context.withNow(46_000));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(List.of("p3"), state.lastRound().missingPlayerIds());
    assertEquals(54_000L, state.nextTransitionAt());
    state = engine.handleTimeout(state, context.withNow(54_000));
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    assertEquals(2, state.roundNumber());
    assertNull(state.lastRound());
    assertTrue(state.drafts().isEmpty() && state.submissions().isEmpty() && state.entries().isEmpty());
  }

  @Test
  void lateDraftNeverOverwritesTheEntry() {
    var context = context(3, 7);
    var state = started(config(AbsurdPokedexMode.CLASSIC, 2), context);
    state = accept(state, "p1", submit("La de verdad"), context.withNow(2_000));
    rejects(state, "p1", draft("Un borrador tardío"), context.withNow(2_500), "Ya has enviado tu entrada.");
    rejects(state, "p1", submit("Otra"), context.withNow(2_500), "Ya has enviado tu entrada.");
    state = accept(state, "p2", submit("Dos"), context.withNow(3_000));
    state = accept(state, "p3", submit("Tres"), context.withNow(3_000));
    assertEquals(GamePhase.VOTING, state.phase());
    rejects(state, "p1", draft("Después de escribir"), context.withNow(4_000), "La escritura ya ha terminado.");
    rejects(state, "p1", submit("Después de escribir"), context.withNow(4_000), "La escritura ya ha terminado.");
    assertEquals("La de verdad", entryOf(state, "p1").text());
    // Pasado el plazo y antes del timeout tampoco se escribe.
    var late = started(config(AbsurdPokedexMode.CLASSIC, 2), context);
    rejects(late, "p1", draft("tarde"), context.withNow(31_000), "La escritura ya ha terminado.");
  }

  @Test
  void skipsTheRoundWithTooFewEntries() {
    // Clásico: una sola entrada no se vota.
    var context = context(3, 11);
    var state = started(config(AbsurdPokedexMode.CLASSIC, 2), context);
    state = accept(state, "p1", submit("Solitaria"), context.withNow(2_000));
    state = engine.handleTimeout(state, context.withNow(31_000));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertTrue(state.lastRound().skipped());
    assertTrue(state.lastRound().pointsAwarded().isEmpty());
    assertEquals(List.of("p2", "p3"), state.lastRound().missingPlayerIds());
    assertEquals(39_000L, state.nextTransitionAt());
    assertEquals(Map.of("p1", 0, "p2", 0, "p3", 0), state.scores());
    assertEquals(1, state.playerStats().get("p1").roundsPlayed());
    assertEquals(1, state.playerStats().get("p1").entriesSubmitted());

    // ¿Cuál es la real?: sin inventadas se salta; con una basta, porque la oficial también cuenta.
    var real = config(AbsurdPokedexMode.REAL_ENTRY, 2);
    var empty = engine.handleTimeout(started(real, context(3, 11)), context(3, 11).withNow(31_000));
    assertEquals(GamePhase.ROUND_RESULTS, empty.phase());
    assertTrue(empty.lastRound().skipped());
    assertEquals(List.of("p1", "p2", "p3"), empty.lastRound().missingPlayerIds());
    var realContext = context(3, 11);
    var one = accept(started(real, realContext), "p2", submit("Inventada"), realContext.withNow(2_000));
    one = engine.handleTimeout(one, realContext.withNow(31_000));
    assertEquals(GamePhase.VOTING, one.phase());
    assertEquals(2, one.entries().size());
    assertTrue(one.entries().stream().anyMatch(AbsurdPokedexEntry::isReal));
  }

  @Test
  void rejectsOwnVotesAndInvalidFunnyVotes() {
    var context = context(3, 5);
    var classic = started(config(AbsurdPokedexMode.CLASSIC, 2), context);
    rejects(classic, "p1", vote("entry-1"), context, "La votación no está activa.");
    classic = everyoneWrites(classic, context);
    var own = entryOf(classic, "p1").id();
    var other = entryOf(classic, "p2").id();
    rejects(classic, "p1", vote(own), context, "No puedes votar tu propia entrada.");
    rejects(classic, "p1", vote(other, entryOf(classic, "p3").id()), context,
        "La más graciosa solo se vota en «¿Cuál es la real?».");
    rejects(classic, "p1", vote("entry-9"), context, "Esa entrada no existe.");
    var voted = accept(classic, "p1", vote(other), context);
    rejects(voted, "p1", vote(entryOf(classic, "p3").id()), context, "Ya has votado.");
    rejects(voted, "p1", vote(other), context, "Ya has votado.");
    assertEquals(Map.of("p1", other), voted.votes());
    // Pasado el plazo y antes del timeout, la votación ya no está activa.
    rejects(classic, "p1", vote(other), context.withNow(classic.roundEndsAt()), "La votación no está activa.");

    var real = everyoneWrites(started(config(AbsurdPokedexMode.REAL_ENTRY, 2), context(3, 5)), context);
    var official = officialOf(real).id();
    var mine = entryOf(real, "p1").id();
    var theirs = entryOf(real, "p2").id();
    rejects(real, "p1", vote(official, mine), context,
        "La más graciosa tiene que ser una entrada inventada por otro jugador.");
    rejects(real, "p1", vote(official, "entry-9"), context, "Esa entrada no existe.");
    rejects(real, "p1", vote(mine), context, "No puedes votar tu propia entrada.");
    var ok = accept(real, "p1", vote(official, theirs), context);
    assertEquals(Map.of("p1", official), ok.votes());
    assertEquals(Map.of("p1", theirs), ok.funnyVotes());
    // La graciosa puede coincidir con la que se cree real.
    ok = accept(ok, "p2", vote(entryOf(real, "p3").id(), entryOf(real, "p3").id()), context);
    assertEquals(entryOf(real, "p3").id(), ok.funnyVotes().get("p2"));
  }

  @Test
  void funnyVoteOnTheOfficialIsDroppedSilently() {
    var context = context(3, 5);
    var real = everyoneWrites(started(config(AbsurdPokedexMode.REAL_ENTRY, 2), context), context);
    var official = officialOf(real).id();
    var theirs = entryOf(real, "p2").id();
    // Rechazarla delataría la oficial: se acepta, el voto cuenta y la graciosa no se guarda como voto.
    var dropped = accept(real, "p1", vote(theirs, official), context);
    assertEquals(Map.of("p1", theirs), dropped.votes());
    assertEquals(Map.of(), dropped.funnyVotes());
    // Las proyecciones son las mismas que con una graciosa válida: solo cambia el id que el jugador marcó.
    var counted = accept(real, "p1", vote(theirs, entryOf(real, "p3").id()), context);
    assertEquals(wire(engine.getPublicState(counted, context)), wire(engine.getPublicState(dropped, context)));
    for (var playerId : List.of("p2", "p3")) {
      assertEquals(wire(engine.getPlayerState(counted, playerId, context)),
          wire(engine.getPlayerState(dropped, playerId, context)));
    }
    assertEquals(official, engine.getPlayerState(dropped, "p1", context).ownFunnyEntryId());
    assertEquals(wire(engine.getPlayerState(counted, "p1", context)).replace(entryOf(real, "p3").id(), official),
        wire(engine.getPlayerState(dropped, "p1", context)));
    // Al puntuar, la oficial no recibe graciosas ni nadie suma por ella.
    var done = accept(accept(dropped, "p2", vote(official), context), "p3", vote(official), context);
    assertEquals(GamePhase.ROUND_RESULTS, done.phase());
    var officialResult = done.lastRound().entries().stream().filter(entry -> entry.isReal()).findFirst().orElseThrow();
    assertEquals(0, officialResult.funnyVotesReceived());
    assertEquals(0, done.playerStats().values().stream().mapToInt(stats -> stats.funnyVotesReceived()).sum());
  }

  @Test
  void realEntryModeMasksTheNameInEveryEntry() {
    var context = context(3, 21);
    var state = started(config(AbsurdPokedexMode.REAL_ENTRY, 2), context);
    var name = state.currentPokemon().name();
    var pokemon = CATALOG.byId(state.currentPokemon().id()).orElseThrow();
    state = accept(state, "p1", submit(name + " come piedras y " + name.toUpperCase() + " las escupe."), context);
    state = accept(state, "p2", submit("Duerme   en los\nvolcanes."), context);
    state = accept(state, "p3", submit("Nada que tapar"), context);
    assertEquals("??? come piedras y ??? las escupe.", entryOf(state, "p1").text());
    assertEquals(PokedexEntryText.sanitize("Duerme   en los\nvolcanes.", pokemon), entryOf(state, "p2").text());
    var official = officialOf(state);
    assertFalse(official.text().contains(name));
    assertTrue(official.text().length() <= AbsurdPokedexRules.MAX_ENTRY_LENGTH);
    var view = wire(engine.getPublicState(state, context));
    assertFalse(view.contains(name + " come"));
    assertTrue(view.contains("??? come piedras"));
    // El jugador ve su entrada como la ven los demás.
    var own = (AbsurdPokedexPlayerState) engine.getPlayerState(state, "p1", context);
    assertEquals("??? come piedras y ??? las escupe.", own.ownEntry().text());
    assertEquals(entryOf(state, "p1").id(), own.ownEntry().id());
    // En Clásico no se tapa nada.
    var classic = started(config(AbsurdPokedexMode.CLASSIC, 2), context(3, 21));
    var classicName = classic.currentPokemon().name();
    classic = accept(classic, "p1", submit(classicName + " come piedras"), context);
    classic = accept(classic, "p2", submit("Dos"), context);
    classic = accept(classic, "p3", submit("Tres"), context);
    assertEquals(classicName + " come piedras", entryOf(classic, "p1").text());
  }

  @Test
  void projectionsHideAuthorsAndTheRealEntryUntilResults() {
    var context = context(3, 33);
    var state = started(config(AbsurdPokedexMode.REAL_ENTRY, 2), context);
    for (int round = 1; round <= 2; round++) {
      assertEquals(round, state.roundNumber());
      var texts = Map.of("p1", "Secreto uno r" + round, "p2", "Secreto dos r" + round, "p3", "Secreto tres r" + round);
      state = accept(state, "p1", draft("Borrador de p1 r" + round), context);
      state = accept(state, "p2", submit(texts.get("p2")), context);
      state = accept(state, "p3", submit(texts.get("p3")), context);
      assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
      assertNoLeak(state, context, texts, round, true);
      state = accept(state, "p1", submit(texts.get("p1")), context);
      assertEquals(GamePhase.VOTING, state.phase());
      assertNoLeak(state, context, texts, round, false);
      var official = officialOf(state).id();
      state = accept(state, "p1", vote(official, entryOf(state, "p2").id()), context);
      assertNoLeak(state, context, texts, round, false);
      state = accept(state, "p2", vote(entryOf(state, "p1").id()), context);
      state = accept(state, "p3", vote(official), context);
      assertEquals(GamePhase.ROUND_RESULTS, state.phase());
      // En los resultados sí salen autores y la oficial.
      var results = wire(engine.getPublicState(state, context));
      assertTrue(results.contains("\"authorId\":\"p1\""));
      assertTrue(results.contains("\"versionLabel\""));
      state = engine.handleTimeout(state, context.withNow(state.nextTransitionAt()));
    }
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
  }

  private void assertNoLeak(AbsurdPokedexState state, GameContext context, Map<String, String> texts, int round,
      boolean writing) {
    var views = new ArrayList<Map.Entry<String, String>>();
    views.add(Map.entry("public", wire(engine.getPublicState(state, context))));
    for (var playerId : state.playerIds()) {
      views.add(Map.entry(playerId, wire(engine.getPlayerState(state, playerId, context))));
    }
    for (var view : views) {
      var json = view.getValue();
      for (var key : List.of("authorId", "isReal", "versionLabel")) {
        assertFalse(json.contains("\"" + key + "\""), () -> view.getKey() + " ronda " + round + " expone " + key);
      }
      if (!"p1".equals(view.getKey())) {
        assertFalse(json.contains("Borrador de p1"), () -> view.getKey() + " ve el borrador de p1");
      }
      if (writing) {
        texts.forEach((author, text) -> {
          if (!author.equals(view.getKey())) {
            assertFalse(json.contains(text), () -> view.getKey() + " ve el texto de " + author + " antes de votar");
          }
        });
      }
    }
  }

  @Test
  void disconnectDuringVotingClosesTheVoteWhenTheRestVoted() {
    var context = context(4, 44);
    var state = everyoneWrites(started(config(AbsurdPokedexMode.CLASSIC, 2), context), context);
    state = accept(state, "p1", vote(entryOf(state, "p2").id()), context);
    state = accept(state, "p2", vote(entryOf(state, "p1").id()), context);
    state = accept(state, "p3", vote(entryOf(state, "p1").id()), context);
    assertEquals(GamePhase.VOTING, state.phase());
    assertEquals(state, engine.handlePresenceChange(state, context));
    var players = players(4);
    players.set(3, new GamePlayer("p4", "Player 4", false, null));
    var away = context.withPlayers(players).withNow(5_000);
    state = engine.handlePresenceChange(state, away);
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(13_000L, state.nextTransitionAt());
    // p1: 2 votos + 2 de la más votada; p2: 1 voto; p4 sigue en el marcador con 0.
    assertEquals(Map.of("p1", 4, "p2", 1), state.lastRound().pointsAwarded());
    assertEquals(List.of("p1"), state.lastRound().winnerPlayerIds());
    assertEquals(Map.of("p1", 4, "p2", 1, "p3", 0, "p4", 0), state.scores());
    // Mientras escriben, la desconexión del último que falta también cierra la escritura.
    var writing = started(config(AbsurdPokedexMode.CLASSIC, 2), context(4, 44));
    for (var playerId : List.of("p1", "p2", "p3")) writing = accept(writing, playerId, submit("Hola " + playerId), context);
    assertEquals(GamePhase.ROUND_ACTIVE, writing.phase());
    assertEquals(GamePhase.VOTING, engine.handlePresenceChange(writing, away).phase());
  }

  @Test
  void spectatorCannotWriteNorVote() {
    var players = players(4);
    players.set(3, new GamePlayer("p4", "Player 4", null, false));
    var context = GameContext.builder(CATALOG, new Mulberry32(9)).players(players).now(1_000).build();
    var state = started(config(AbsurdPokedexMode.CLASSIC, 2), context);
    rejects(state, "p4", draft("hola"), context, "No puedes participar en esta ronda.");
    rejects(state, "p4", submit("hola"), context, "No puedes participar en esta ronda.");
    rejects(state, "p9", submit("hola"), context, "No puedes participar en esta ronda.");
    for (var playerId : List.of("p1", "p2", "p3")) state = accept(state, playerId, submit("Hola " + playerId), context);
    assertEquals(GamePhase.VOTING, state.phase());
    rejects(state, "p4", vote("entry-1"), context, "No puedes participar en esta ronda.");
    assertEquals(AbsurdPokedexPlayerState.SPECTATOR, engine.getPlayerState(state, "p4", context));
    assertEquals(AbsurdPokedexPlayerState.SPECTATOR, engine.getPlayerState(state, "p9", context));
    var player = (AbsurdPokedexPlayerState) engine.getPlayerState(state, "p1", context);
    assertEquals("PLAYER", player.role());
    assertTrue(player.canVote());
    assertFalse(player.canSubmit());
  }

  @Test
  void finalResultsRankByPointsThenRoundWins() {
    var context = context(3, 55);
    var state = everyoneWrites(started(config(AbsurdPokedexMode.CLASSIC, 1), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(engine.createInitialState(
        config(AbsurdPokedexMode.CLASSIC, 1), context)));
    assertEquals("Results are unavailable before Pokédex Absurda finishes", error.getMessage());
    state = accept(state, "p1", vote(entryOf(state, "p2").id()), context);
    state = accept(state, "p2", vote(entryOf(state, "p1").id()), context);
    state = accept(state, "p3", vote(entryOf(state, "p2").id()), context);
    assertFalse(engine.isFinished(state));
    state = engine.handleTimeout(state, context.withNow(state.nextTransitionAt()));
    assertTrue(engine.isFinished(state));
    var results = engine.getResults(state);
    assertEquals(List.of("p2", "p1", "p3"), results.standings().stream().map(GameStanding::playerId).toList());
    assertEquals("p2", results.winnerId());
    var stats = state.playerStats().get("p2");
    assertEquals(AbsurdPokedexPlayerStats.ZERO.toBuilder().roundsPlayed(1).entriesSubmitted(1).votesReceived(2)
        .roundWins(1).pointsFromRounds(4).build(), stats);
    assertNotNull(engine.getPublicState(state, context).results());
    // Empate a puntos: decide quién ganó más rondas.
    var tied = state.toBuilder().scores(Map.of("p1", 4, "p2", 4, "p3", 1)).playerStats(Map.of(
        "p1", AbsurdPokedexPlayerStats.ZERO.toBuilder().roundWins(2).build(),
        "p2", AbsurdPokedexPlayerStats.ZERO.toBuilder().roundWins(1).build())).build();
    assertEquals(List.of("p1", "p2", "p3"),
        engine.getResults(tied).standings().stream().map(GameStanding::playerId).toList());
  }
}
