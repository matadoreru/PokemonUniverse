package es.pokemonuniverse.domain.game.engines.unowntranslator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownAlphabetEntry;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownToken;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorAction;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorAttemptOutcome;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPlayerState;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPlayerStats;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorPublicState;
import es.pokemonuniverse.domain.game.engines.unowntranslator.UnownTranslatorTypes.UnownTranslatorState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.LearnsetEntry;
import es.pokemonuniverse.domain.pokemon.Move;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * Pistas, bloqueo, aciertos, presencia y privacidad del motor, con el catálogo dorado, un azar fijo y un reloj
 * controlado.
 */
class UnownTranslatorEngineTest {

  private static final InMemoryPokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");
  /** El mapper del cable ({@code NON_NULL}, como {@code application.yml}). */
  private static final ObjectMapper WIRE =
      ObjectMapper.create(Map.of("micronaut.serde.serialization.inclusion", "NON_NULL"));

  private final UnownTranslatorEngine engine = new UnownTranslatorEngine(GoldenManifests.of(UnownTranslatorEngine.ID));

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

  private static UnownTranslatorConfig config(UnownTranslatorMode mode, int rounds, int roundSeconds, int hintSeconds) {
    return new UnownTranslatorConfig(List.of(1, 2), rounds, roundSeconds, hintSeconds, mode);
  }

  /** Partida empezada a {@code now = 1000}. */
  private UnownTranslatorState started(UnownTranslatorConfig config, GameContext context) {
    return engine.start(engine.createInitialState(config, context), context);
  }

  private static UnownTranslatorAction guess(String text) {
    return new UnownTranslatorAction.Guess(text);
  }

  private GameActionResult<UnownTranslatorState> act(UnownTranslatorState state, String playerId, String text,
      GameContext context, long now) {
    return engine.handleAction(state, playerId, guess(text), context.withNow(now));
  }

  private static String answer(UnownTranslatorState state) {
    return state.messages().get(state.roundNumber() - 1).text();
  }

  private static String normalized(UnownTranslatorState state) {
    return state.messages().get(state.roundNumber() - 1).normalized();
  }

  private UnownTranslatorPublicState view(UnownTranslatorState state, GameContext context) {
    return engine.getPublicState(state, context);
  }

  private UnownTranslatorPlayerState player(UnownTranslatorState state, String playerId, GameContext context) {
    return (UnownTranslatorPlayerState) engine.getPlayerState(state, playerId, context);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("unown-translator", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
    assertThrows(IllegalArgumentException.class, () -> new UnownTranslatorEngine(GoldenManifests.of("higher-lower")));
  }

  @Test
  void soloGameIsAllowed() {
    assertEquals(1, engine.manifest().minPlayers());
    var context = context(1, 7);
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context);
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    assertEquals(1, state.roundNumber());
    assertEquals(26, new HashSet<>(state.key()).size());
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context(0, 7)));
    assertEquals("Se necesitan al menos 1 jugadores.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.start(state, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
  }

  @Test
  void parsesTheStrictGuessActionWithTheServerLiterals() throws IOException {
    assertEquals(guess("Mr. Mime"), engine.parseAction(json("{\"type\":\"GUESS_UNOWN\",\"text\":\"  Mr. Mime \"}")));
    var error = assertThrows(ConfigValidationException.class,
        () -> engine.parseAction(json("{\"type\":\"GUESS_UNOWN\",\"text\":\"   \"}")));
    assertEquals("Escribe una respuesta antes de enviarla.", error.getMessage());
    error = assertThrows(ConfigValidationException.class,
        () -> engine.parseAction(json("{\"type\":\"GUESS_UNOWN\",\"text\":\"" + "a".repeat(41) + "\"}")));
    assertEquals("La respuesta no puede superar 40 caracteres.", error.getMessage());
    error = assertThrows(ConfigValidationException.class, () -> engine.parseAction(json("{\"type\":\"GUESS_UNOWN\"}")));
    assertEquals("Acción de Traductor Unown no válida.", error.getMessage());
  }

  @Test
  void availabilityUsesTheServerLiterals() {
    var context = context(1, 7);
    var classic = new UnownTranslatorConfig(List.of(9), 3, 60, 6, UnownTranslatorMode.CLASSIC);
    assertEquals(Optional.of("Solo hay 0 Pokémon en esas generaciones."), engine.checkAvailability(classic, context));
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(classic, context));
    assertEquals("Solo hay 0 Pokémon en esas generaciones.", error.getMessage());
    PokemonCatalog plain = new PokemonCatalog() {
      @Override public List<Pokemon> all() { return CATALOG.all(); }

      @Override public Optional<Pokemon> byId(String id) { return CATALOG.byId(id); }

      @Override public Optional<Pokemon> byDexNumber(int number) { return CATALOG.byDexNumber(number); }

      @Override public List<Pokemon> forGenerations(List<Integer> generations, boolean includeForms) {
        return CATALOG.forGenerations(generations, includeForms);
      }
    };
    var plainContext = GameContext.builder(plain, new Mulberry32(7)).players(players(1)).now(1_000).build();
    var moves = config(UnownTranslatorMode.MOVES, 3, 60, 6);
    assertEquals(Optional.of("No hay movimientos disponibles en esas generaciones."),
        engine.checkAvailability(moves, plainContext));
    assertEquals(Optional.empty(), engine.checkAvailability(moves, context));
    assertEquals(Optional.empty(), engine.checkAvailability(config(UnownTranslatorMode.CLASSIC, 10, 60, 6), context));
  }

  @Test
  void hintsArriveOnScheduleAndStopWhenNothingIsHidden() {
    var context = context(1, 11);
    // 60 s con pistas cada 3 s: caben 19 pistas (la 20.ª caería justo en roundEndsAt).
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 60, 3), context);
    assertEquals(4_000L, state.nextTransitionAt());
    assertEquals(4_000L, view(state, context).nextHintAt());
    assertEquals(4_000L, engine.getLifecycle(state).nextDeadline());
    assertSame(state, engine.handleTimeout(state, context.withNow(3_999)));
    var distinct = UnownTranslatorRules.hiddenDistinctLetters(normalized(state), List.of());
    long now = 4_000;
    for (int hint = 1; hint <= distinct.size(); hint++) {
      state = engine.handleTimeout(state, context.withNow(now));
      assertEquals(hint, state.alphabet().size());
      assertTrue(distinct.contains(state.alphabet().getLast()));
      now += 3_000;
    }
    assertEquals(new HashSet<>(distinct), new HashSet<>(state.alphabet()));
    assertNull(state.nextTransitionAt());
    assertNull(view(state, context).nextHintAt());
    // Sin pistas pendientes, el plazo del ciclo es el final de la ronda.
    assertEquals(61_000L, engine.getLifecycle(state).nextDeadline());
    assertSame(state, engine.handleTimeout(state, context.withNow(now)));

    // Con pistas cada 15 s en 30 s, la segunda caería en roundEndsAt: no se anuncia.
    var short_ = started(config(UnownTranslatorMode.CLASSIC, 3, 30, 15), context(1, 11));
    assertEquals(16_000L, view(short_, context).nextHintAt());
    short_ = engine.handleTimeout(short_, context.withNow(16_000));
    assertEquals(1, short_.alphabet().size());
    assertNull(view(short_, context).nextHintAt());
    assertEquals(31_000L, engine.getLifecycle(short_).nextDeadline());
    var resolved = engine.handleTimeout(short_, context.withNow(31_000));
    assertEquals(GamePhase.ROUND_RESULTS, resolved.phase());
    assertEquals(1, resolved.alphabet().size());
  }

  @Test
  void lateTickRevealsEveryDueHint() {
    var context = context(1, 11);
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 60, 3), context);
    var distinct = UnownTranslatorRules.hiddenDistinctLetters(normalized(state), List.of());
    assertTrue(distinct.size() >= 4, "el mensaje del azar fijo tiene al menos 4 letras distintas");
    // Vencen las pistas de 4000, 7000 y 10000.
    state = engine.handleTimeout(state, context.withNow(10_500));
    assertEquals(3, state.alphabet().size());
    assertEquals(3, new HashSet<>(state.alphabet()).size());
    assertTrue(distinct.containsAll(state.alphabet()));
    assertEquals(13_000L, state.nextTransitionAt());
    assertEquals(13_000L, view(state, context).nextHintAt());
  }

  @Test
  void alphabetPersistsAcrossRoundsAndOnlyGrowsWithHints() {
    var context = context(1, 23);
    var state = started(config(UnownTranslatorMode.CLASSIC, 2, 60, 6), context);
    state = engine.handleTimeout(state, context.withNow(7_000));
    var alphabet = state.alphabet();
    assertEquals(1, alphabet.size());
    var first = normalized(state);
    state = act(state, "p1", answer(state), context, 8_000).state();
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(alphabet, state.alphabet());
    assertEquals(14_000L, state.nextTransitionAt());
    state = engine.handleTimeout(state, context.withNow(14_000));
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    assertEquals(2, state.roundNumber());
    assertEquals(alphabet, state.alphabet());
    for (var letter : UnownTranslatorRules.hiddenDistinctLetters(first, alphabet)) {
      assertFalse(state.alphabet().contains(letter), letter);
    }
    var publicAlphabet = view(state, context).alphabet();
    var letter = alphabet.getFirst();
    assertEquals(List.of(new UnownAlphabetEntry(state.key().get(letter.charAt(0) - 'A'), letter)), publicAlphabet);
  }

  @Test
  void wrongGuessStartsTheCooldownAndIsAccepted() {
    var context = context(2, 31);
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context);
    var result = act(state, "p1", "zzzz", context, 2_000);
    assertTrue(result.accepted());
    state = result.state();
    assertEquals(5_000L, state.cooldownUntil().get("p1"));
    var own = player(state, "p1", context);
    assertEquals(1, own.attemptCount());
    assertEquals(UnownTranslatorAttemptOutcome.INCORRECT, own.lastAttempt().outcome());
    assertEquals(5_000L, own.cooldownUntil());
    assertFalse(own.solved());
    assertTrue(own.canGuess());
    assertEquals(0, state.scores().get("p1"));
    assertFalse(wire(view(state, context)).contains("zzzz"));
  }

  @Test
  void guessDuringCooldownIsRejected() {
    var context = context(2, 31);
    var state = act(started(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context), "p1", "zzzz", context, 2_000)
        .state();
    var rejected = act(state, "p1", answer(state), context, 3_000);
    assertFalse(rejected.accepted());
    assertEquals(Timing.cooldownMessage(3_000, 5_000L), rejected.error());
    assertEquals("Espera 2s antes de volver a intentar.", rejected.error());
    assertSame(state, rejected.state());
    assertTrue(act(state, "p1", answer(state), context, 5_000).accepted());
  }

  @Test
  void solveScoresOnePlusHiddenLettersAndBlocksASecondGuess() {
    var context = context(2, 37);
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context);
    state = engine.handleTimeout(state, context.withNow(7_000));
    int hidden = UnownTranslatorRules.hiddenLetters(normalized(state), state.alphabet());
    var text = answer(state);
    var result = act(state, "p1", "  " + text.toLowerCase(java.util.Locale.ROOT) + " ", context, 8_000);
    assertTrue(result.accepted());
    state = result.state();
    var solve = state.solves().get("p1");
    assertEquals(1 + hidden, solve.points());
    assertEquals(hidden, solve.hiddenLetters());
    assertEquals(8_000L, solve.solvedAt());
    assertEquals(1 + hidden, state.scores().get("p1"));
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    var own = player(state, "p1", context);
    assertTrue(own.solved());
    assertFalse(own.canGuess());
    assertEquals(text, own.answer());
    assertEquals(UnownTranslatorAttemptOutcome.CORRECT, own.lastAttempt().outcome());
    assertNull(player(state, "p2", context).answer());
    var publicState = view(state, context);
    assertEquals(List.of("p1"), publicState.solvedPlayerIds());
    assertEquals(Map.of("p1", 1 + hidden), publicState.roundPointsByPlayer());
    var again = act(state, "p1", text, context, 9_000);
    assertFalse(again.accepted());
    assertEquals("Ya lo has descifrado.", again.error());
    // El segundo en acertar, sin pistas nuevas, suma lo mismo y no es el primero.
    state = act(state, "p2", text, context, 9_500).state();
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(new UnownTranslatorPlayerStats(1, 1, 0, 1, hidden, 1 + hidden), state.playerStats().get("p1"));
    assertEquals(new UnownTranslatorPlayerStats(1, 1, 0, 0, hidden, 1 + hidden), state.playerStats().get("p2"));
  }

  @Test
  void roundEndsWhenEveryoneSolvedOrOnTimeout() {
    var context = context(2, 41);
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 30, 6), context);
    var text = answer(state);
    // Sin pistas todavía: cada letra del mensaje sigue oculta.
    int letters = UnownTranslatorRules.letterCount(normalized(state));
    state = act(state, "p1", text, context, 2_000).state();
    state = act(state, "p2", text, context, 3_000).state();
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(9_000L, state.nextTransitionAt());
    assertNull(state.roundEndsAt());
    var lastRound = view(state, context).lastRound();
    assertNotNull(lastRound);
    assertEquals(text, lastRound.answer());
    assertEquals(List.of("p1", "p2"), lastRound.solves().stream().map(solve -> solve.playerId()).toList());
    assertEquals(List.of(), lastRound.missingPlayerIds());
    assertNull(view(state, context).nextHintAt());
    assertEquals(List.of(), view(state, context).tokens());

    // Ronda 2: nadie acierta y el tiempo la cierra.
    state = engine.handleTimeout(state, context.withNow(9_000));
    assertEquals(2, state.roundNumber());
    long endsAt = state.roundEndsAt();
    assertEquals(39_000L, endsAt);
    var timedOut = engine.handleTimeout(state, context.withNow(endsAt));
    assertEquals(GamePhase.ROUND_RESULTS, timedOut.phase());
    assertEquals(List.of("p1", "p2"), view(timedOut, context).lastRound().missingPlayerIds());
    assertEquals(new UnownTranslatorPlayerStats(2, 1, 1, 1, letters, 1 + letters), timedOut.playerStats().get("p1"));
    // Un intento con el tiempo agotado se rechaza y también resuelve la ronda.
    var late = act(state, "p1", answer(state), context, endsAt);
    assertFalse(late.accepted());
    assertEquals("El tiempo ha terminado.", late.error());
    assertEquals(GamePhase.ROUND_RESULTS, late.state().phase());
  }

  @Test
  void disconnectEndsTheRoundWhenTheRestSolved() {
    var context = context(2, 43);
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context);
    state = act(state, "p1", answer(state), context, 2_000).state();
    assertSame(state, engine.handlePresenceChange(state, context.withNow(2_500)));
    var away = context.withPlayers(List.of(new GamePlayer("p1", "Player 1"),
        new GamePlayer("p2", "Player 2", false, null))).withNow(3_000);
    state = engine.handlePresenceChange(state, away);
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(List.of("p2"), view(state, away).lastRound().missingPlayerIds());
    assertEquals(9_000L, state.nextTransitionAt());
  }

  @Test
  void activeProjectionsLeakNeitherAnswerNorKey() {
    var context = context(2, 53);
    var state = started(config(UnownTranslatorMode.CLASSIC, 2, 60, 6), context);
    var seen = new ArrayList<String>();
    for (int round = 1; round <= 2; round++) {
      var message = state.messages().get(round - 1);
      seen.add(message.text());
      long base = state.roundStartedAt();
      for (long offset : new long[] {0, 6_000, 12_000}) {
        state = engine.handleTimeout(state, context.withNow(base + offset));
        assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
        assertNoLeak(state, context, message, List.of("p1", "p2"));
      }
      state = act(state, "p1", message.text(), context, base + 13_000).state();
      assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
      assertNoLeak(state, context, message, List.of("p2"));
      assertEquals(message.text(), player(state, "p1", context).answer());
      state = act(state, "p2", message.text(), context, base + 14_000).state();
      assertEquals(GamePhase.ROUND_RESULTS, state.phase());
      if (round == 1) state = engine.handleTimeout(state, context.withNow(state.nextTransitionAt()));
    }
    assertNotEquals(seen.get(0), seen.get(1));
  }

  private void assertNoLeak(UnownTranslatorState state, GameContext context, UnownTranslatorTypes.UnownMessage message,
      List<String> unsolved) {
    var publicState = view(state, context);
    var texts = new ArrayList<String>();
    texts.add(wire(publicState));
    for (var playerId : unsolved) texts.add(wire(engine.getPlayerState(state, playerId, context)));
    for (var text : texts) {
      assertFalse(text.contains(message.text()), text);
      assertFalse(text.contains(message.normalized()), text);
      if (message.pokemon() != null) assertFalse(text.contains("\"" + message.pokemon().id() + "\""), text);
    }
    var revealed = new HashSet<Integer>();
    for (var entry : publicState.alphabet()) revealed.add(entry.glyph());
    for (var token : publicState.tokens()) {
      if (token instanceof UnownToken.Glyph glyph) assertFalse(revealed.contains(glyph.glyph()));
      if (token instanceof UnownToken.Letter letter) assertTrue(state.alphabet().contains(letter.letter()));
    }
  }

  @Test
  void movesModeUsesMoveNamesAndShortensTheGame() {
    var bulbasaur = CATALOG.byId("bulbasaur").orElseThrow();
    var moves = List.of(
        new Move("tackle", "Tackle", "normal", "physical", Map.of("es", "Placaje")),
        new Move("growl", "Growl", "normal", "status", Map.of("es", "Gruñido")),
        new Move("vine-whip", "Vine Whip", "grass", "physical", null));
    var learnsets = List.of(new LearnsetEntry("bulbasaur", "tackle", 2, 1),
        new LearnsetEntry("bulbasaur", "growl", 2, 3), new LearnsetEntry("bulbasaur", "vine-whip", 2, 7));
    var catalog = new InMemoryPokemonCatalog(List.of(bulbasaur), moves, learnsets, Map.of(), List.of());
    var context = GameContext.builder(catalog, new Mulberry32(61)).players(players(1)).now(1_000).build();
    var state = started(config(UnownTranslatorMode.MOVES, 10, 30, 6), context);
    assertEquals(3, state.messages().size());
    assertEquals(new HashSet<>(List.of("Placaje", "Gruñido", "Vine Whip")),
        new HashSet<>(state.messages().stream().map(message -> message.text()).toList()));
    var publicState = view(state, context);
    assertEquals(3, publicState.totalRounds());
    assertEquals(UnownTranslatorMode.MOVES, publicState.mode());
    for (int round = 1; round <= 3; round++) {
      var text = answer(state);
      // Sin tildes también acierta.
      state = act(state, "p1", UnownTranslatorRules.normalize(text).toLowerCase(java.util.Locale.ROOT), context,
          state.roundStartedAt() + 1_000).state();
      assertEquals(GamePhase.ROUND_RESULTS, state.phase());
      var lastRound = view(state, context).lastRound();
      assertNull(lastRound.pokemon());
      assertEquals(text, lastRound.move().name());
      state = engine.handleTimeout(state, context.withNow(state.nextTransitionAt()));
    }
    assertTrue(engine.isFinished(state));
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    assertNotNull(view(state, context).lastRound());
    assertNotNull(view(state, context).results());

    var empty = new InMemoryPokemonCatalog(List.of(bulbasaur), List.of(), List.of(), Map.of(), List.of());
    var emptyContext = GameContext.builder(empty, new Mulberry32(61)).players(players(1)).now(1_000).build();
    var error = assertThrows(EngineException.class,
        () -> started(config(UnownTranslatorMode.MOVES, 3, 30, 6), emptyContext));
    assertEquals("No hay movimientos disponibles en esas generaciones.", error.getMessage());
  }

  @Test
  void classicLastRoundCarriesThePokemon() {
    var context = context(1, 67);
    var state = started(config(UnownTranslatorMode.CLASSIC, 1, 30, 6), context);
    var message = state.messages().getFirst();
    state = act(state, "p1", message.text(), context, 2_000).state();
    var lastRound = view(state, context).lastRound();
    var pokemon = CATALOG.byId(message.pokemon().id()).orElseThrow();
    assertEquals(UnownTranslatorMode.CLASSIC, lastRound.mode());
    assertEquals(pokemon.id(), lastRound.pokemon().id());
    assertEquals(pokemon.name(), lastRound.pokemon().name());
    assertEquals(pokemon.sprite(), lastRound.pokemon().sprite());
    assertEquals(pokemon.nationalDexNumber(), lastRound.pokemon().nationalDexNumber());
    assertEquals(pokemon.types(), lastRound.pokemon().types());
    assertNull(lastRound.move());
    state = engine.handleTimeout(state, context.withNow(state.nextTransitionAt()));
    assertTrue(engine.isFinished(state));
    assertEquals(lastRound, view(state, context).lastRound());
  }

  @Test
  void classicRevealDoesNotLookThePokemonUpAgain() {
    var context = context(1, 67);
    var state = started(config(UnownTranslatorMode.CLASSIC, 1, 30, 6), context);
    var message = state.messages().getFirst();
    var pokemon = CATALOG.byId(message.pokemon().id()).orElseThrow();
    // El mazo copia el Pokémon tal cual está en el catálogo.
    assertEquals(new UnownTranslatorTypes.UnownTranslatorPokemon(pokemon.id(), pokemon.name(), pokemon.sprite(),
        pokemon.nationalDexNumber(), pokemon.types()), message.pokemon());
    // Aunque el Pokémon ya no esté en el catálogo, el acierto que cierra la ronda no falla y la revelación lo trae.
    var empty = new InMemoryPokemonCatalog(List.of(), List.of(), List.of(), Map.of(), List.of());
    var without = GameContext.builder(empty, new Mulberry32(67)).players(players(1)).now(1_000).build();
    var result = act(state, "p1", message.text(), without, 2_000);
    assertEquals(GamePhase.ROUND_RESULTS, result.state().phase());
    assertEquals(message.pokemon(), view(result.state(), without).lastRound().pokemon());
  }

  @Test
  void spectatorCannotGuess() {
    var context = context(2, 71);
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context);
    var outsider = act(state, "p9", answer(state), context, 2_000);
    assertFalse(outsider.accepted());
    assertEquals("Estás observando esta ronda.", outsider.error());
    assertEquals(UnownTranslatorPlayerState.spectator(), player(state, "p9", context));
    var inactive = context.withPlayers(List.of(new GamePlayer("p1", "Player 1"),
        new GamePlayer("p2", "Player 2", null, false)));
    var rejected = act(state, "p2", answer(state), inactive, 2_000);
    assertFalse(rejected.accepted());
    assertEquals("Estás observando esta ronda.", rejected.error());
    assertFalse(player(state, "p2", inactive).canGuess());
    assertEquals("PLAYER", player(state, "p2", inactive).role());
    var waiting = engine.createInitialState(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context);
    var noRound = act(waiting, "p1", "abra", context, 2_000);
    assertFalse(noRound.accepted());
    assertEquals("No hay una ronda activa.", noRound.error());
  }

  @Test
  void finalResultsRankByPointsThenSolved() {
    var context = context(3, 73);
    var state = started(config(UnownTranslatorMode.CLASSIC, 3, 60, 6), context);
    assertThrows(EngineException.class, () -> engine.getResults(state));
    var finished = state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .scores(Map.of("p1", 4, "p2", 4, "p3", 6))
        .playerStats(Map.of(
            "p1", new UnownTranslatorPlayerStats(3, 1, 2, 1, 3, 4),
            "p2", new UnownTranslatorPlayerStats(3, 2, 1, 0, 2, 4),
            "p3", new UnownTranslatorPlayerStats(3, 1, 2, 0, 5, 6)))
        .build();
    var results = engine.getResults(finished);
    assertEquals(List.of("p3", "p2", "p1"), results.standings().stream().map(GameStanding::playerId).toList());
    assertTrue(results.standings().getFirst().won());
    assertEquals(results, view(finished, context).results());
    var tied = finished.toBuilder().scores(Map.of("p1", 4, "p2", 4, "p3", 4))
        .playerStats(Map.of()).build();
    assertEquals(List.of("p1", "p2", "p3"),
        engine.getResults(tied).standings().stream().map(GameStanding::playerId).toList());
  }
}
