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
    return new LearnsetGuessConfig(List.of(1), showLevels, showEvolution, 30, 3);
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
    var initial = engine.createInitialState(new LearnsetGuessConfig(List.of(1, 3), true, true, 30, 3), context);
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
   * La pista pendiente en el cierre recortado o después pasa a {@code null}. El flujo público no lo produce (la pista
   * siempre cae a menos de 7 s), así que no sale en las fixtures doradas.
   */
  @Test
  void lastWarningDropsAHintAtOrAfterTheCutDeadline() {
    var context = context(GOLDEN, 3);
    var started = engine.start(engine.createInitialState(
        new LearnsetGuessConfig(List.of(1), true, true, 60, 3), context), context);
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
}
