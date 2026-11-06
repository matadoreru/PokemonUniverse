package es.pokemonuniverse.domain.game.engines.typeduel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelAction;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelRoundReason;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelState;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelStats;
import es.pokemonuniverse.domain.json.JsonTree;
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
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto, parseo, errores de arranque y las
 * estadísticas privadas del abandono por desconexión.
 */
class TypeDuelEngineTest {

  private final TypeDuelEngine engine = new TypeDuelEngine(GoldenManifests.of(TypeDuelEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).hostId("p1")
        .build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("type-duel", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new TypeDuelEngine(other));
  }

  @Test
  void parsesEachStrictActionVariant() throws IOException {
    assertEquals(new TypeDuelAction.SelectType("fairy"),
        engine.parseAction(json("{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"fairy\"}")));
    var longest = "x".repeat(64);
    assertEquals(new TypeDuelAction.AttemptPokemon(longest),
        engine.parseAction(json("{\"type\":\"ATTEMPT_POKEMON\",\"pokemonId\":\"" + longest + "\"}")));
    assertInstanceOf(TypeDuelAction.Continue.class, engine.parseAction(json("{\"type\":\"CONTINUE\"}")));
    for (var invalid : List.of("{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"shadow\"}",
        "{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"Fire\"}",
        "{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"fire\",\"extra\":1}",
        "{\"type\":\"ATTEMPT_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"ATTEMPT_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"ATTEMPT_POKEMON\",\"pokemonId\":6}", "{\"type\":\"CONTINUE\",\"now\":true}",
        "{\"type\":\"ANSWER\"}", "{\"pokemonType\":\"fire\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTwoPlayers() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(1)));
    assertEquals("Se necesitan dos jugadores.", error.getMessage());
  }

  @Test
  void rejectsEachActionWithItsLiteral() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    assertEquals(GamePhase.SELECTING_TYPES, state.phase());
    var spectator = context.players().stream().map(GamePlayer::id).filter(id -> !state.participants().contains(id))
        .findFirst().orElseThrow();
    var duelist = state.participants().getFirst();
    assertEquals("Observas este duelo.",
        engine.handleAction(state, spectator, new TypeDuelAction.SelectType("fire"), context).error());
    assertEquals("No hay ningún resultado que avanzar.",
        engine.handleAction(state, "p1", new TypeDuelAction.Continue(), context).error());
    assertEquals("La carrera no está activa.",
        engine.handleAction(state, duelist, new TypeDuelAction.AttemptPokemon("pikachu"), context).error());
    var locked = engine.handleAction(state, duelist, new TypeDuelAction.SelectType("fire"), context).state();
    assertEquals("Tu tipo ya está bloqueado.",
        engine.handleAction(locked, duelist, new TypeDuelAction.SelectType("water"), context).error());
    var rival = state.participants().get(1);
    var revealed = engine.handleAction(locked, rival, new TypeDuelAction.SelectType("fire"), context).state();
    var search = engine.handleTimeout(revealed, context.withNow(3_000));
    assertEquals(GamePhase.POKEMON_SEARCH, search.phase());
    var pikachu = new TypeDuelAction.AttemptPokemon("pikachu");
    var failed = engine.handleAction(search, duelist, pikachu, context.withNow(3_000));
    assertTrue(failed.accepted());
    var repeated = engine.handleAction(failed.state(), duelist, pikachu, context.withNow(4_000));
    assertFalse(repeated.accepted());
    assertEquals("Ya lo probaste.", repeated.error());
    assertEquals(failed.state(), repeated.state());
    var late = context.withNow(state.roundEndsAt());
    var result = engine.handleAction(state, duelist, new TypeDuelAction.SelectType("fire"), late);
    assertFalse(result.accepted());
    assertEquals("El tiempo ha terminado.", result.error());
  }

  @Test
  void solutionCountIsPublicOnlyDuringTheRevealAndTheSearch() {
    var context = context(2);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    assertNull(engine.getPublicState(state, context).solutionCount());
    var first = engine.handleAction(state, "p1", new TypeDuelAction.SelectType("bug"), context).state();
    assertNull(engine.getPublicState(first, context).solutionCount());
    // Bicho y lucha: solo Heracross en gen 1–2. Se publica cuántos, nunca cuáles.
    var revealed = engine.handleAction(first, "p2", new TypeDuelAction.SelectType("fighting"), context).state();
    assertEquals(GamePhase.TYPE_REVEAL, revealed.phase());
    assertEquals(1, engine.getPublicState(revealed, context).solutionCount());
    var search = engine.handleTimeout(revealed, context.withNow(3_000));
    assertEquals(GamePhase.POKEMON_SEARCH, search.phase());
    assertEquals(1, engine.getPublicState(search, context).solutionCount());
    var won = engine.handleAction(search, "p1", new TypeDuelAction.AttemptPokemon("heracross"), context.withNow(4_000));
    assertEquals(GamePhase.ROUND_RESULTS, won.state().phase());
    assertNull(engine.getPublicState(won.state(), context).solutionCount());
    var impossible = engine.handleAction(
        engine.handleAction(state, "p1", new TypeDuelAction.SelectType("dragon"), context).state(), "p2",
        new TypeDuelAction.SelectType("fairy"), context).state();
    assertEquals(GamePhase.INVALID_COMBINATION, impossible.phase());
    assertNull(engine.getPublicState(impossible, context).solutionCount());
  }

  private static GameContext without(GameContext context, Set<String> absent) {
    return context.withPlayers(context.players().stream()
        .map(player -> absent.contains(player.id()) ? new GamePlayer(player.id(), player.displayName(), false, null)
            : player)
        .toList());
  }

  @Test
  void aLoneDisconnectedDuelistForfeitsToTheRival() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var rival = state.participants().getFirst();
    var absent = state.participants().get(1);
    var result = engine.handlePresenceChange(state, without(context, Set.of(absent)));
    assertEquals(GamePhase.ROUND_RESULTS, result.phase());
    assertEquals(state.completedRounds() + 1, result.completedRounds());
    assertEquals(TypeDuelRoundReason.DISCONNECT_FORFEIT, result.lastRound().reason());
    assertEquals(rival, result.lastRound().winnerId());
    assertEquals(List.of(absent), result.lastRound().disconnectedIds());
    assertEquals(5, result.scores().get(rival));
    assertEquals(0, result.scores().get(absent));
    assertEquals(1, result.playerStats().get(rival).duelsPlayed());
    assertEquals(1, result.playerStats().get(rival).duelsWon());
    assertEquals(1, result.playerStats().get(absent).duelsPlayed());
    assertEquals(0, result.playerStats().get(absent).duelsWon());
  }

  @Test
  void twoDisconnectedDuelistsStillCancelWithoutPoints() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var result = engine.handlePresenceChange(state, without(context, Set.copyOf(state.participants())));
    assertEquals(TypeDuelRoundReason.DISCONNECTED, result.lastRound().reason());
    assertNull(result.lastRound().winnerId());
    assertEquals(state.participants(), result.lastRound().disconnectedIds());
    for (var id : state.participants()) {
      assertEquals(0, result.scores().get(id));
      assertEquals(0, result.playerStats().get(id).duelsPlayed());
    }
  }

  // ---------------------------------------------------------------------------------------------- COOP

  private static TypeDuelConfig coop(List<Integer> generations, int rounds, int coopSeconds) {
    return new TypeDuelConfig(generations, 15, 20, rounds, coopSeconds, TypeDuelMode.COOP);
  }

  private TypeDuelState startCoop(TypeDuelConfig config, GameContext context) {
    return engine.start(engine.createInitialState(config, context), context);
  }

  @Test
  void combinationHasAtLeastOneValidPokemon() {
    // Solo la gen 1: muchas parejas de tipos no tienen ningún Pokémon, así que el sorteo tiene que filtrarlas.
    var context = context(3);
    var catalog = context.pokemon().forGenerations(List.of(1), true);
    var state = startCoop(coop(List.of(1), 5, 30), context);
    var seen = new HashSet<List<String>>();
    for (int round = 1; round <= 5; round++) {
      assertEquals(GamePhase.POKEMON_SEARCH, state.phase());
      var publicState = engine.getPublicState(state, context);
      var combination = publicState.combination();
      assertTrue(combination.size() == 1 || combination.size() == 2, combination.toString());
      var expected = catalog.stream()
          .filter(pokemon -> TypeDuelRules.isValidPokemonForTypes(pokemon, combination.getFirst(), combination.getLast()))
          .map(pokemon -> pokemon.id()).toList();
      assertFalse(expected.isEmpty(), combination.toString());
      assertEquals(expected, state.validPokemonIds());
      assertEquals(expected.size(), publicState.solutionCount());
      assertTrue(seen.add(combination), "Combinación repetida: " + combination);
      var results = engine.handleTimeout(state, context.withNow(state.roundEndsAt()));
      state = engine.handleTimeout(results, context.withNow(results.nextTransitionAt()));
    }
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    // Ninguna combinación válida en las generaciones elegidas (el catálogo dorado solo tiene gen 1–2): fin sin rondas.
    var empty = startCoop(coop(List.of(3), 3, 30), context);
    assertEquals(GamePhase.GAME_RESULTS, empty.phase());
  }

  @Test
  void validGuessAddsToGroup() {
    var context = context(3);
    var state = startCoop(coop(List.of(1, 2), 3, 60), context);
    var target = state.validPokemonIds().getFirst();
    // Cualquiera de la sala busca, también el tercer jugador (no hay pareja de duelistas).
    var result = engine.handleAction(state, "p3", new TypeDuelAction.AttemptPokemon(target), context.withNow(2_000));
    assertTrue(result.accepted(), result.error());
    var publicState = engine.getPublicState(result.state(), context);
    assertEquals(1, publicState.found().size());
    assertEquals(target, publicState.found().getFirst().pokemonId());
    assertEquals("p3", publicState.found().getFirst().playerId());
    assertEquals(Map.of("p1", 0, "p2", 0, "p3", 1), publicState.contributions());
    assertTrue(engine.getPlayerState(result.state(), "p3", context).canAttempt());
    // Un Pokémon que no cumple la combinación no suma y aplica la espera de siempre.
    var wrong = context.pokemon().forGenerations(List.of(1, 2), true).stream()
        .filter(pokemon -> !state.validPokemonIds().contains(pokemon.id())).findFirst().orElseThrow();
    var missed = engine.handleAction(result.state(), "p1", new TypeDuelAction.AttemptPokemon(wrong.id()),
        context.withNow(2_500));
    assertTrue(missed.accepted());
    assertEquals(1, engine.getPublicState(missed.state(), context).found().size());
    assertEquals(0, missed.state().contributions().get("p1"));
    assertEquals(3_500, engine.getPlayerState(missed.state(), "p1", context).cooldownUntil());
  }

  @Test
  void duplicateRejectedWithMessage() {
    var context = context(3);
    var state = startCoop(coop(List.of(1, 2), 3, 60), context);
    var target = new TypeDuelAction.AttemptPokemon(state.validPokemonIds().getFirst());
    var found = engine.handleAction(state, "p1", target, context.withNow(2_000)).state();
    var again = engine.handleAction(found, "p2", target, context.withNow(5_000));
    assertFalse(again.accepted());
    assertEquals("Ya lo ha encontrado alguien.", again.error());
    assertEquals(TypeDuelEngine.COOP_DUPLICATE_MESSAGE, again.error());
    assertEquals(found, again.state());
    // También quien lo encontró.
    assertEquals("Ya lo ha encontrado alguien.",
        engine.handleAction(found, "p1", target, context.withNow(5_000)).error());
  }

  @Test
  void simultaneousSameGuessCountsOnce() {
    // La sala procesa las acciones de una en una: «a la vez» son dos acciones seguidas con el mismo Pokémon.
    var context = context(2).withNow(2_000);
    var state = startCoop(coop(List.of(1, 2), 3, 60), context(2));
    var target = new TypeDuelAction.AttemptPokemon(state.validPokemonIds().getFirst());
    var first = engine.handleAction(state, "p1", target, context);
    var second = engine.handleAction(first.state(), "p2", target, context);
    assertTrue(first.accepted());
    assertFalse(second.accepted());
    assertEquals("Ya lo ha encontrado alguien.", second.error());
    assertEquals(first.state(), second.state());
    var publicState = engine.getPublicState(second.state(), context);
    assertEquals(1, publicState.found().size());
    assertEquals(Map.of("p1", 1, "p2", 0), publicState.contributions());
    assertEquals(0, second.state().cooldownUntil().getOrDefault("p2", 0L));
  }

  @Test
  void roundEndsAfterCoopSeconds() {
    var context = context(2);
    var state = startCoop(coop(List.of(1, 2), 3, 30), context);
    assertEquals(1_000 + 30_000, state.roundEndsAt());
    assertEquals(state, engine.handleTimeout(state, context.withNow(30_999)));
    var late = engine.handleAction(state, "p1", new TypeDuelAction.AttemptPokemon(state.validPokemonIds().getFirst()),
        context.withNow(31_000));
    assertEquals("El tiempo ha terminado.", late.error());
    var ended = engine.handleTimeout(state, context.withNow(31_000));
    assertEquals(GamePhase.ROUND_RESULTS, ended.phase());
    assertEquals(TypeDuelRoundReason.TIMEOUT, ended.lastRound().reason());
    assertEquals(1, ended.completedRounds());
    assertEquals(state.requiredTypes(), engine.getPublicState(ended, context).combination());
    // Una desconexión no da la ronda a nadie: la búsqueda sigue hasta el reloj.
    var absent = engine.handlePresenceChange(state, without(context, Set.of("p2")));
    assertEquals(state, absent);
  }

  @Test
  void roundEndsEarlyWhenEverythingIsFound() {
    var context = context(2);
    var state = startCoop(coop(List.of(1, 2), 3, 60), context);
    var ids = state.validPokemonIds();
    for (int index = 0; index < ids.size(); index++) {
      assertEquals(GamePhase.POKEMON_SEARCH, state.phase());
      state = engine.handleAction(state, index % 2 == 0 ? "p1" : "p2", new TypeDuelAction.AttemptPokemon(ids.get(index)),
          context.withNow(2_000 + index)).state();
    }
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(TypeDuelRoundReason.ALL_FOUND, state.lastRound().reason());
    assertEquals(List.of(), state.lastRound().solutions());
  }

  @Test
  void resultsShowGroupTotalAndContributions() {
    var context = context(3);
    var state = startCoop(coop(List.of(1, 2), 2, 60), context);
    for (int round = 0; round < 2; round++) {
      var ids = state.validPokemonIds();
      state = engine.handleAction(state, "p2", new TypeDuelAction.AttemptPokemon(ids.getFirst()),
          context.withNow(2_000)).state();
      if (round == 0 && ids.size() > 1) {
        state = engine.handleAction(state, "p3", new TypeDuelAction.AttemptPokemon(ids.get(1)),
            context.withNow(2_100)).state();
      }
      if (state.phase() == GamePhase.POKEMON_SEARCH) state = engine.handleTimeout(state, context.withNow(state.roundEndsAt()));
      state = engine.handleTimeout(state, context.withNow(state.nextTransitionAt()));
    }
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    var contributions = state.contributions();
    int total = contributions.values().stream().mapToInt(Integer::intValue).sum();
    assertEquals(2, contributions.get("p2"));
    assertEquals(0, contributions.get("p1"));
    var results = engine.getResults(state);
    assertNull(results.winnerId());
    // Clasificación por aportación (p2 encontró uno en cada ronda), sin ganador individual.
    assertEquals("p2", results.standings().getFirst().playerId());
    assertEquals(1, results.standings().getFirst().position());
    for (var standing : results.standings()) {
      assertNull(standing.won());
      assertEquals(contributions.get(standing.playerId()), standing.points());
      // Solo métricas cooperativas: nada de duelos, intentos ni winrate.
      assertEquals(List.of("coopFinds", "coopGamesPlayed", "groupTotal"), List.copyOf(standing.stats().keySet()));
      assertEquals(contributions.get(standing.playerId()), standing.stats().get("coopFinds").intValue());
      assertEquals(1, standing.stats().get("coopGamesPlayed").intValue());
      assertEquals(total, standing.stats().get("groupTotal").intValue());
    }
    // Sin clasificación de victorias: el perfil no la cuenta como jugada ni perdida.
    assertEquals(Boolean.FALSE, results.ranked());
    assertFalse(results.isRanked());
    // Las estadísticas de duelo no se tocan en COOP.
    for (var stats : state.playerStats().values()) assertEquals(TypeDuelStats.ZERO, stats);
    assertEquals(results, engine.getPublicState(state, context).results());
  }

  @Test
  void classicProjectionHasNoCoopFields() {
    var context = context(2);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var publicState = engine.getPublicState(state, context);
    assertEquals(TypeDuelMode.CLASSIC, publicState.mode());
    assertNull(publicState.combination());
    assertNull(publicState.found());
    assertNull(publicState.contributions());
  }
}
