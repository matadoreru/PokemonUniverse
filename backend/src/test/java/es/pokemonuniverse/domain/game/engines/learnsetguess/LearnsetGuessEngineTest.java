package es.pokemonuniverse.domain.game.engines.learnsetguess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Move;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokemonEvolutionInfo;
import es.pokemonuniverse.domain.pokemon.ResolvedLevelUpMove;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque, catálogos sin movimientos por nivel
 * y el filtro de {@code showEvolution} (todos los Pokémon de {@code gen1-2} tienen evolución).
 */
class LearnsetGuessEngineTest {

  private static final InMemoryPokemonCatalog GOLDEN = GoldenCatalogs.load("gen1-2");

  private final LearnsetGuessEngine engine = new LearnsetGuessEngine(GoldenManifests.of(LearnsetGuessEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(PokemonCatalog catalog, int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(catalog, new Mulberry32(1)).players(list).now(1000).build();
  }

  private static LearnsetGuessConfig config(boolean showLevels, boolean showEvolution) {
    return new LearnsetGuessConfig(List.of(1), showLevels, showEvolution, 30, 3, LearnsetGuessMode.CLASSIC);
  }

  /** Catálogo con esos Pokémon de {@code gen1-2}, sus movimientos de generación 1 (editados) y esa evolución. */
  private static InMemoryPokemonCatalog catalog(Set<String> ids, Map<String, PokemonEvolutionInfo> evolution,
      UnaryOperator<Move> editMove) {
    var pokemon = GoldenCatalogs.pokemon("gen1-2").stream().filter(entry -> ids.contains(entry.id())).toList();
    var moves = new LinkedHashMap<String, Move>();
    for (var id : ids) {
      for (var entry : GOLDEN.levelUpMoves(id, 1)) moves.put(entry.moveId(), editMove.apply(entry.move()));
    }
    var learnsets = GoldenCatalogs.learnsets("gen1-2").stream()
        .filter(entry -> ids.contains(entry.pokemonId()) && entry.referenceGeneration() == 1)
        .toList();
    return new InMemoryPokemonCatalog(pokemon, List.copyOf(moves.values()), learnsets, evolution, List.of());
  }

  /** Solo {@link PokemonCatalog}: el {@code isLearnsetPokemonCatalog} de TS devolvería {@code false}. */
  private record PlainCatalog(PokemonCatalog delegate) implements PokemonCatalog {
    @Override
    public List<Pokemon> all() {
      return delegate.all();
    }

    @Override
    public Optional<Pokemon> byId(String id) {
      return delegate.byId(id);
    }

    @Override
    public Optional<Pokemon> byDexNumber(int number) {
      return delegate.byDexNumber(number);
    }

    @Override
    public List<Pokemon> forGenerations(List<Integer> generations, boolean includeForms) {
      return delegate.forGenerations(generations, includeForms);
    }
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("learnset-guess", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new LearnsetGuessEngine(other));
  }

  @Test
  void parsesTheStrictGuessAction() throws IOException {
    var longest = "x".repeat(64);
    assertEquals(longest,
        engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":25}", "{\"type\":\"ANSWER\",\"pokemonId\":\"pikachu\"}",
        "{\"pokemonId\":\"pikachu\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTwoPlayersAndStartsOnlyOnce() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(engine.defaultConfig(), context(GOLDEN, 1)));
    assertEquals("At least 2 players are required", error.getMessage());
    var preloaded = new ArrayList<String>();
    var context = context(GOLDEN, 2).toBuilder().preloadImage(preloaded::add).build();
    var started = engine.start(engine.createInitialState(config(true, true), context), context);
    assertEquals(1, preloaded.size());
    error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("Game already started", error.getMessage());
    // Sin preloadImage (opcional en el contexto) la ronda empieza igual.
    var withoutPreload = context(GOLDEN, 2);
    engine.start(engine.createInitialState(config(true, true), withoutPreload), withoutPreload);
  }

  @Test
  void needsALearnsetCatalog() {
    var context = context(new PlainCatalog(GOLDEN), 2);
    var initial = engine.createInitialState(config(true, true), context);
    var error = assertThrows(EngineException.class, () -> engine.start(initial, context));
    assertEquals("The Pokémon catalog has no learnset data", error.getMessage());
  }

  @Test
  void needsLearnsetsForTheReferenceGeneration() {
    // gen1-2 solo trae movimientos de Yellow y Crystal: con la generación 3 como referencia no hay candidatos.
    var context = context(GOLDEN, 2);
    var initial = engine.createInitialState(new LearnsetGuessConfig(List.of(1, 3), true, true, 30, 3, LearnsetGuessMode.CLASSIC), context);
    var error = assertThrows(EngineException.class, () -> engine.start(initial, context));
    assertEquals("No hay Pokémon con learnsets válidos para esa selección de generaciones. Ejecuta el seed actualizado.",
        error.getMessage());
  }

  @Test
  void showEvolutionLeavesOutPokemonWithoutEvolutionInfo() {
    var ids = Set.of("bulbasaur", "ivysaur", "venusaur");
    var noEvolution = catalog(ids, Map.of(), UnaryOperator.identity());
    var context = context(noEvolution, 2);
    var initial = engine.createInitialState(config(true, true), context);
    var error = assertThrows(EngineException.class, () -> engine.start(initial, context));
    assertEquals("No hay Pokémon con learnsets válidos para esa selección de generaciones. Ejecuta el seed actualizado.",
        error.getMessage());
    var hidden = engine.start(engine.createInitialState(config(true, false), context), context);
    assertNull(engine.getPublicState(hidden, context).evolutionHint());

    // Con evolución solo para Ivysaur, todas las rondas son de Ivysaur (el pool repite cuando se agota).
    var onlyIvysaur = catalog(ids, Map.of("ivysaur", new PokemonEvolutionInfo(2, 3)), UnaryOperator.identity());
    var ivysaurContext = context(onlyIvysaur, 2);
    var state = engine.start(engine.createInitialState(config(true, true), ivysaurContext), ivysaurContext);
    for (int round = 1; round <= 3; round++) {
      assertEquals("ivysaur", state.correctPokemonId());
      assertEquals("Evolución intermedia · etapa 2 de 3", engine.getPublicState(state, ivysaurContext).evolutionHint());
      var ended = ivysaurContext.withNow(state.roundEndsAt());
      state = engine.handleTimeout(state, ended);
      state = engine.handleTimeout(state, ended.withNow(state.nextTransitionAt()));
    }
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
  }

  @Test
  void movesWithoutASpanishNameShowTheirCatalogName() {
    var spanish = new HashMap<String, String>();
    var catalog = catalog(Set.of("bulbasaur"), Map.of(), move -> switch (move.id()) {
      case "growl" -> new Move(move.id(), move.name(), move.type(), move.category(), null);
      case "tackle" -> new Move(move.id(), move.name(), move.type(), move.category(), Map.of("es", "  ﻿"));
      case "leech-seed" -> new Move(move.id(), move.name(), move.type(), move.category(), Map.of("es", " Drenadoras "));
      default -> move;
    });
    var context = context(catalog, 2);
    var state = engine.start(engine.createInitialState(config(false, false), context), context);
    for (var group : engine.getPublicState(state, context).visibleGroups()) {
      for (var move : group.moves()) spanish.put(move.moveId(), move.name());
      assertNull(group.level());
    }
    assertEquals("Growl", spanish.get("growl"));
    assertEquals("Tackle", spanish.get("tackle"));
    assertEquals("Drenadoras", spanish.get("leech-seed"));
  }

  /** Estados que el flujo público no produce: la respuesta ya no está en el catálogo o la partida no ha terminado. */
  @Test
  void throwsTheServerLiteralsForStatesTheFlowDoesNotProduce() {
    var context = context(GOLDEN, 2);
    var missing = LearnsetGuessTypes.LearnsetGuessState.builder().phase(GamePhase.ROUND_ACTIVE)
        .config(config(true, true)).playerIds(List.of("p1", "p2")).roundNumber(1).referenceGeneration(1)
        .correctPokemonId("missingno").roundStartedAt(1000L).roundEndsAt(31_000L).build();
    var error = assertThrows(EngineException.class, () -> engine.handleTimeout(missing, context.withNow(31_000)));
    assertEquals("Learnset Guess answer is missing from the catalog", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.getResults(missing));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }

  @Test
  void groupsByLevelAndThenByMoveName() {
    var groups = LearnsetGuessEngine.groupLearnset(GOLDEN.levelUpMoves("pikachu", 2).reversed());
    var levels = groups.stream().map(group -> group.getFirst().level()).toList();
    assertEquals(levels.stream().sorted().distinct().toList(), levels);
    assertEquals(List.of("growl", "thunder-shock"),
        groups.getFirst().stream().map(ResolvedLevelUpMove::moveId).toList());
  }

  @Test
  void pointsAddTheOrderBonusOnlyForTheFirstTwo() {
    assertEquals(7, LearnsetGuessRules.learnsetPoints(0, 1));
    assertEquals(6, LearnsetGuessRules.learnsetPoints(0, 2));
    assertEquals(5, LearnsetGuessRules.learnsetPoints(0, 3));
    assertEquals(3, LearnsetGuessRules.learnsetPoints(4, 1));
    assertEquals(1, LearnsetGuessRules.learnsetPoints(6, 3));
    // bonus[solveOrder - 1] ?? 0: un orden fuera de rango no suma.
    assertEquals(5, LearnsetGuessRules.learnsetPoints(0, 0));
  }

  /**
   * {@code lastRound.absentIds} se fija al cerrar la ronda con {@code isPlayerRequired}: quien acertó y se fue no está;
   * quien se fue y volvió antes del cierre tampoco; los cambios de presencia durante la revelación no lo alteran.
   */
  @Test
  void absentIdsAreFixedAtResolution() {
    var players = List.of(new GamePlayer("p1", "Pedro"), new GamePlayer("p2", "Ana"), new GamePlayer("p3", "Luis"),
        new GamePlayer("p4", "Eva"));
    var context = context(GOLDEN, 4);
    var state = engine.start(engine.createInitialState(config(true, true), context), context);
    state = engine.handleAction(state, "p1", new LearnsetGuessTypes.LearnsetGuessAction(state.correctPokemonId()),
        context).state();
    var p4Away = context.withPlayers(List.of(players.get(0), players.get(1), players.get(2),
        new GamePlayer("p4", "Eva", false, null)));
    state = engine.handlePresenceChange(state, p4Away);
    state = engine.handlePresenceChange(state, context.withPlayers(players));
    var atClose = context.withPlayers(List.of(new GamePlayer("p1", "Pedro", false, null), players.get(1),
        new GamePlayer("p3", "Luis", false, null), players.get(3)));
    state = engine.handlePresenceChange(state, atClose);
    state = engine.handleTimeout(state, atClose.withNow(state.roundEndsAt()));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(List.of("p3"), state.lastRound().absentIds());
    var duringResults = context.withPlayers(List.of(players.get(0), new GamePlayer("p2", "Ana", false, null),
        players.get(2), players.get(3)));
    state = engine.handlePresenceChange(state, duringResults);
    assertEquals(List.of("p3"), engine.getPublicState(state, duringResults).lastRound().absentIds());
  }

  /**
   * La pista pendiente en el cierre recortado o después pasa a {@code null}. El flujo público no lo produce (la pista
   * siempre cae a menos de 7 s), así que no sale en las fixtures doradas.
   */
  @Test
  void lastWarningDropsAHintAtOrAfterTheCutDeadline() {
    var context = context(GOLDEN, 3);
    var started = engine.start(engine.createInitialState(
        new LearnsetGuessConfig(List.of(1), true, true, 60, 3, LearnsetGuessMode.CLASSIC), context), context);
    var answer = started.correctPokemonId();
    for (long hint : List.of(16_000L, 20_000L)) {
      var state = started.toBuilder().nextTransitionAt(hint).build();
      var at = context.withNow(6_000);
      state = engine.handleAction(state, "p1", new LearnsetGuessTypes.LearnsetGuessAction(answer), at).state();
      assertFalse(state.lastWarning());
      state = engine.handleAction(state, "p2", new LearnsetGuessTypes.LearnsetGuessAction(answer), at).state();
      assertTrue(state.lastWarning());
      assertEquals(16_000L, state.roundEndsAt());
      assertNull(state.nextTransitionAt());
      assertTrue(engine.getPublicState(state, at).lastWarning());
    }
  }

  // --- Revelación manual (MANUAL_REVEAL) ---

  private static final String EXHAUSTED = "Ya no te quedan pistas en esta ronda.";

  private static LearnsetGuessConfig manual(int roundSeconds) {
    return new LearnsetGuessConfig(List.of(1), true, true, roundSeconds, 3, LearnsetGuessMode.MANUAL_REVEAL);
  }

  private static GameContext manualContext(int players, int seed) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GOLDEN, new Mulberry32(seed)).players(list).now(1000).build();
  }

  /** Un Pokémon de Gen 1 que no es la respuesta de la ronda. */
  private static LearnsetGuessTypes.LearnsetGuessAction wrongGuess(LearnsetGuessTypes.LearnsetGuessState state) {
    return new LearnsetGuessTypes.LearnsetGuessAction(
        "bulbasaur".equals(state.correctPokemonId()) ? "charmander" : "bulbasaur");
  }

  private static LearnsetGuessTypes.LearnsetGuessAction rightGuess(LearnsetGuessTypes.LearnsetGuessState state) {
    return new LearnsetGuessTypes.LearnsetGuessAction(state.correctPokemonId());
  }

  private static int totalGroups(LearnsetGuessTypes.LearnsetGuessState state) {
    return LearnsetGuessEngine.groupLearnset(state.learnset()).size();
  }

  private static List<String> groupMoveIds(LearnsetGuessTypes.LearnsetGuessState state, int index) {
    return LearnsetGuessEngine.groupLearnset(state.learnset()).get(index).stream()
        .map(ResolvedLevelUpMove::moveId).toList();
  }

  private static String text(Object value) throws IOException {
    return ObjectMapper.getDefault().writeValueAsString(GoldenReplayer.tree(value));
  }

  private LearnsetGuessTypes.LearnsetGuessState startManual(GameContext context, int roundSeconds) {
    var state = engine.start(engine.createInitialState(manual(roundSeconds), context), context);
    assertTrue(totalGroups(state) >= 3, "la semilla debe dar un Pokémon con al menos 3 grupos");
    return state;
  }

  @Test
  void startsWithFirstGroupOnly() throws IOException {
    var context = manualContext(2, 7);
    var state = startManual(context, 60);
    var publicState = engine.getPublicState(state, context);
    assertEquals(LearnsetGuessMode.MANUAL_REVEAL, publicState.mode());
    assertEquals(List.of(), publicState.visibleGroups());
    assertNull(publicState.nextTransitionAt());
    for (var id : List.of("p1", "p2")) {
      var player = engine.getPlayerState(state, id, context);
      assertTrue(player.canGuess());
      assertEquals(1, player.revealedGroups().size());
      assertEquals(groupMoveIds(state, 0),
          player.revealedGroups().getFirst().moves().stream().map(LearnsetGuessTypes.LearnsetMoveHint::moveId).toList());
      assertEquals(0, player.revealedGroups().getFirst().stage());
      assertEquals(totalGroups(state), player.totalGroups());
      assertEquals(List.of(), player.attempts());
    }
    // Clásico: sin los campos del modo.
    var classicContext = context(GOLDEN, 2);
    var classic = engine.start(engine.createInitialState(config(true, true), classicContext), classicContext);
    var classicPlayer = text(engine.getPlayerState(classic, "p1", classicContext));
    assertFalse(classicPlayer.contains("revealedGroups"));
    assertFalse(classicPlayer.contains("totalGroups"));
    assertEquals(LearnsetGuessMode.CLASSIC, engine.getPublicState(classic, classicContext).mode());
  }

  @Test
  void wrongGuessRevealsNextGroupForThatPlayerOnly() {
    var context = manualContext(2, 7);
    var state = startManual(context, 60);
    var result = engine.handleAction(state, "p1", wrongGuess(state), context.withNow(2_000));
    assertTrue(result.accepted());
    state = result.state();
    var p1 = engine.getPlayerState(state, "p1", context.withNow(2_000));
    assertEquals(2, p1.revealedGroups().size());
    assertEquals(1, p1.revealedGroups().get(1).stage());
    assertEquals(groupMoveIds(state, 1),
        p1.revealedGroups().get(1).moves().stream().map(LearnsetGuessTypes.LearnsetMoveHint::moveId).toList());
    assertEquals(1, p1.attempts().size());
    assertEquals(3_000L, p1.cooldownUntil());
    var p2 = engine.getPlayerState(state, "p2", context.withNow(2_000));
    assertEquals(1, p2.revealedGroups().size());
    assertEquals(List.of(), p2.attempts());
  }

  @Test
  void noTimedReveal() {
    var context = manualContext(2, 7);
    var state = startManual(context, 60);
    assertNull(state.nextTransitionAt());
    assertEquals(state.roundEndsAt(), engine.getLifecycle(state).nextDeadline());
    var later = context.withNow(state.roundEndsAt() - 1);
    var ticked = engine.handleTimeout(state, later);
    assertEquals(GamePhase.ROUND_ACTIVE, ticked.phase());
    assertEquals(1, engine.getPlayerState(ticked, "p1", later).revealedGroups().size());
    var ended = engine.handleTimeout(ticked, context.withNow(state.roundEndsAt()));
    assertEquals(GamePhase.ROUND_RESULTS, ended.phase());
  }

  @Test
  void roundEndsWhenAllSolvedOrExhaustedOrTimeout() {
    // Tres jugadores: p1 agota los grupos (y ya no puede adivinar), p2 acierta y p3 agota: la ronda se cierra sola.
    var context = manualContext(3, 7);
    var state = startManual(context, 120);
    int total = totalGroups(state);
    long now = 1_000;
    for (int miss = 0; miss < total; miss++) {
      now += 1_000;
      var result = engine.handleAction(state, "p1", wrongGuess(state), context.withNow(now));
      assertTrue(result.accepted());
      state = result.state();
    }
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    assertFalse(engine.getPlayerState(state, "p1", context.withNow(now)).canGuess());
    assertEquals(total, engine.getPlayerState(state, "p1", context.withNow(now)).revealedGroups().size());
    now += 1_000;
    var rejected = engine.handleAction(state, "p1", rightGuess(state), context.withNow(now));
    assertFalse(rejected.accepted());
    assertEquals(EXHAUSTED, rejected.error());
    state = engine.handleAction(state, "p2", rightGuess(state), context.withNow(now)).state();
    // Sin último aviso en este modo: la ronda sigue con su tope.
    assertFalse(state.lastWarning());
    assertEquals(1_000L + 120_000L, state.roundEndsAt());
    for (int miss = 0; miss < total; miss++) {
      assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
      now += 1_000;
      state = engine.handleAction(state, "p3", wrongGuess(state), context.withNow(now)).state();
    }
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(Map.of("p1", total, "p2", 1, "p3", total), state.lastRound().groupsSeen());
    assertEquals(total, state.lastRound().totalGroups());

    // Nadie acierta: dos jugadores que agotan cierran la ronda.
    var pair = manualContext(2, 7);
    var both = startManual(pair, 120);
    now = 1_000;
    for (var id : List.of("p1", "p2")) {
      for (int miss = 0; miss < totalGroups(both); miss++) {
        now += 1_000;
        both = engine.handleAction(both, id, wrongGuess(both), pair.withNow(now)).state();
      }
    }
    assertEquals(GamePhase.ROUND_RESULTS, both.phase());
    assertEquals(Map.of(), both.lastRound().solves());

    // Nadie juega: el tope de roundSeconds cierra la ronda.
    var fresh = manualContext(2, 7);
    var idle = startManual(fresh, 30);
    var timedOut = engine.handleTimeout(idle, fresh.withNow(idle.roundEndsAt()));
    assertEquals(GamePhase.ROUND_RESULTS, timedOut.phase());
    assertEquals(1, timedOut.playerStats().get("p1").missed());
  }

  @Test
  void scoringFormula() {
    assertEquals(50, LearnsetGuessRules.manualRevealPoints(5, 1));
    assertEquals(40, LearnsetGuessRules.manualRevealPoints(5, 2));
    assertEquals(10, LearnsetGuessRules.manualRevealPoints(5, 5));
    assertEquals(10, LearnsetGuessRules.manualRevealPoints(5, 7));

    var context = manualContext(3, 7);
    var state = startManual(context, 60);
    int total = totalGroups(state);
    state = engine.handleAction(state, "p1", wrongGuess(state), context.withNow(2_000)).state();
    state = engine.handleAction(state, "p1", rightGuess(state), context.withNow(3_000)).state();
    // Sin bonus por orden: el segundo en acertar, con un solo grupo, vale más que el primero.
    state = engine.handleAction(state, "p2", rightGuess(state), context.withNow(3_100)).state();
    assertEquals((total - 1) * 10, state.solves().get("p1").points());
    assertEquals(1, state.solves().get("p1").revealStage());
    assertEquals(total * 10, state.solves().get("p2").points());
    assertEquals(total * 10, state.scores().get("p2"));
    assertEquals((total - 1) * 10, engine.getPlayerState(state, "p1", context.withNow(3_100)).roundPoints());
    assertEquals(1, state.playerStats().get("p2").initialSolves());
    assertEquals(0, state.playerStats().get("p1").initialSolves());
  }

  @Test
  void publicProjectionHidesOthersGroups() throws IOException {
    // Una semilla cuyo segundo grupo trae un movimiento que no está en el primero (un mismo movimiento puede repetirse).
    int seed = 1;
    while (true) {
      var probe = startManual(manualContext(2, seed), 60);
      var extra = new ArrayList<>(groupMoveIds(probe, 1));
      extra.removeAll(groupMoveIds(probe, 0));
      if (!extra.isEmpty()) break;
      seed += 1;
    }
    var context = manualContext(2, seed);
    var state = startManual(context, 60);
    var at = context.withNow(2_000);
    state = engine.handleAction(state, "p1", wrongGuess(state), at).state();
    var hidden = new ArrayList<>(groupMoveIds(state, 1));
    hidden.removeAll(groupMoveIds(state, 0));
    var publicText = text(engine.getPublicState(state, at));
    var others = List.of(text(engine.getPlayerState(state, "p2", at)), text(engine.getPlayerState(state, "p9", at)));
    for (var moveId : hidden) {
      assertFalse(publicText.contains("\"" + moveId + "\""), moveId);
      for (var other : others) assertFalse(other.contains("\"" + moveId + "\""), moveId);
    }
    // Ni siquiera el primer grupo ni el intento fallido salen en la proyección pública.
    for (var moveId : groupMoveIds(state, 0)) assertFalse(publicText.contains("\"" + moveId + "\""), moveId);
    assertEquals(List.of(), engine.getPublicState(state, at).attempts());
    assertTrue(text(engine.getPlayerState(state, "p1", at)).contains("\"" + hidden.getFirst() + "\""));
    // Quien no participa no recibe grupos.
    assertNull(engine.getPlayerState(state, "p9", at).revealedGroups());
    // En la revelación se publica lo que llegó a ver el que más vio.
    var ended = engine.handleTimeout(state, at.withNow(state.roundEndsAt()));
    var revealed = engine.getPublicState(ended, at).lastRound().revealedMoves().stream()
        .map(LearnsetGuessTypes.LearnsetMoveHint::moveId).toList();
    assertTrue(revealed.containsAll(groupMoveIds(state, 1)));
    assertEquals(Map.of("p1", 2, "p2", 1), ended.lastRound().groupsSeen());
  }
}
