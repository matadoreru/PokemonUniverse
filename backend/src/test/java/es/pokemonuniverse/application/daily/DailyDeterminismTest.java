package es.pokemonuniverse.application.daily;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.daily.DailyOutcome;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerEngine;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerRules;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerAction;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerChoice;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerState;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessEngine;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessAction;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessState;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceEngine;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceAction;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceState;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteEngine;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyOptionId;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVoteAction;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVoteState;
import es.pokemonuniverse.domain.pokemon.PinnedPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.function.ToIntFunction;
import org.junit.jupiter.api.Test;

/**
 * Review Focus 3: con la misma semilla y el mismo catálogo fijado, el contenido de cada ronda es el mismo juegue como
 * juegue la persona. Cada juego usa una semilla fija (no depende del sorteo) y su configuración del reto, con el motor
 * real y un solo jugador; se juega acertando al momento, respondiendo mal y dejando vencer el tiempo.
 */
class DailyDeterminismTest {

  private static final String P = "p1";
  private static final PokemonCatalog GOLDEN = GoldenCatalogs.load("gen1-2");
  private static final PokemonCatalog PINNED =
      PinnedPokemonCatalog.of(GOLDEN, GOLDEN.all().stream().map(Pokemon::id).toList());

  private enum Strategy { CORRECT, WRONG, TIMEOUT }

  private record Run(List<String> content, DailyOutcome outcome) {}

  /** Lo que cada juego sabe de su estado: ronda, contenido y respuestas buena y mala. */
  private record Rules<S, A>(ToIntFunction<S> roundNumber, Function<S, String> content, Function<S, A> correct,
      Function<S, A> wrong) {}

  private static <C, S extends TimedGameState, A, V> Run play(GameEngine<C, S, A, V> engine, C config, long seed,
      Strategy strategy, Rules<S, A> rules) {
    var game = DailyGames.byId(engine.manifest().id()).orElseThrow();
    // Un Mulberry32 por partida: es la única fuente de azar, también en cada contexto con otro now.
    var random = new Mulberry32(seed);
    var base = GameContext.builder(PINNED, random).players(List.of(new GamePlayer(P, "Player"))).now(1_000_000).build();
    long now = base.now();
    var state = engine.start(engine.createInitialState(config, base), base);
    var outcomes = new TreeMap<Integer, Integer>();
    var content = new ArrayList<String>();
    int recordedRound = 0;
    for (int step = 0; step < 500 && !engine.isFinished(state); step++) {
      game.observe(engine.getPublicState(state, base.withNow(now)), P, outcomes);
      if (state.phase() == GamePhase.ROUND_ACTIVE && rules.roundNumber().applyAsInt(state) != recordedRound) {
        recordedRound = rules.roundNumber().applyAsInt(state);
        content.add(recordedRound + ": " + rules.content().apply(state));
        if (strategy != Strategy.TIMEOUT) {
          now += 1_500;
          var action = strategy == Strategy.CORRECT ? rules.correct().apply(state) : rules.wrong().apply(state);
          var result = engine.handleAction(state, P, action, base.withNow(now));
          assertTrue(result.accepted(), "acción rechazada en la ronda " + recordedRound);
          state = result.state();
          continue;
        }
      }
      var deadline = engine.getLifecycle(state).nextDeadline();
      assertTrue(deadline != null, "sin plazo en " + state.phase());
      now = Math.max(now, deadline);
      state = engine.handleTimeout(state, base.withNow(now));
    }
    assertTrue(engine.isFinished(state), "la partida no terminó");
    game.observe(engine.getPublicState(state, base.withNow(now)), P, outcomes);
    return new Run(content, DailyGames.outcome(game, outcomes, engine.getResults(state), P));
  }

  private static <C, S extends TimedGameState, A, V> List<Run> playAll(GameEngine<C, S, A, V> engine, JsonNode raw,
      long seed, Rules<S, A> rules) {
    var config = engine.parseConfig(raw);
    var runs = new ArrayList<Run>();
    for (var strategy : Strategy.values()) runs.add(play(engine, config, seed, strategy, rules));
    var game = DailyGames.byId(engine.manifest().id()).orElseThrow();
    for (var run : runs) {
      assertEquals(game.roundCount(), run.content().size(), "rondas jugadas");
      assertEquals(runs.getFirst().content(), run.content(), "el contenido depende de cómo se juega");
    }
    return runs;
  }

  private static JsonNode dailyConfig(GameEngine<?, ?, ?, ?> engine) {
    return DailyGames.byId(engine.manifest().id()).orElseThrow()
        .config(GoldenReplayer.tree(engine.defaultConfig()));
  }

  /**
   * La fixture {@code gen1-2} solo trae learnsets de referencia 1 y 2; con todas las generaciones la referencia sería
   * la 9 y no habría candidatos. Solo aquí se limitan las generaciones; el resto es la configuración del reto.
   */
  private static JsonNode withGenerations12(JsonNode config) {
    var values = new LinkedHashMap<String, JsonNode>();
    for (var entry : config.entries()) values.put(entry.getKey(), entry.getValue());
    values.put("generations", JsonNode.createArrayNode(List.of(JsonNode.createNumberNode(1),
        JsonNode.createNumberNode(2))));
    return JsonNode.createObjectNode(values);
  }

  private static Pokemon byId(String id) {
    return PINNED.byId(id).orElseThrow();
  }

  @Test
  void pokedexDistanceContentIgnoresHowItIsPlayed() {
    var engine = new PokedexDistanceEngine(GoldenManifests.of(PokedexDistanceEngine.ID));
    var runs = playAll(engine, dailyConfig(engine), 20_261_107L, new Rules<PokedexDistanceState, PokedexDistanceAction>(
        PokedexDistanceState::roundNumber,
        state -> "objetivo " + state.targetDexNumber(),
        state -> new PokedexDistanceAction(PINNED.byDexNumber(state.targetDexNumber()).orElseThrow().id()),
        state -> new PokedexDistanceAction(state.targetDexNumber() == 25 ? "bulbasaur" : "pikachu")));
    assertEquals(List.of(0, 0, 0, 0, 0), runs.get(0).outcome().rounds());
    assertEquals(5, runs.get(0).outcome().correct());
    assertTrue(runs.get(1).outcome().rounds().stream().allMatch(value -> value > 0));
    assertEquals(List.of(-1, -1, -1, -1, -1), runs.get(2).outcome().rounds());
  }

  private static HigherLowerChoice higherLowerAnswer(HigherLowerState state) {
    return HigherLowerRules.higherLowerAnswer(
        HigherLowerRules.pokemonCategoryValue(byId(state.previousPokemonId()), state.category()),
        HigherLowerRules.pokemonCategoryValue(byId(state.currentPokemonId()), state.category()));
  }

  @Test
  void higherLowerContentIgnoresHowItIsPlayed() {
    var engine = new HigherLowerEngine(GoldenManifests.of(HigherLowerEngine.ID));
    var runs = playAll(engine, dailyConfig(engine), 7L, new Rules<HigherLowerState, HigherLowerAction>(
        HigherLowerState::roundNumber,
        state -> state.category() + " " + state.previousPokemonId() + " → " + state.currentPokemonId(),
        state -> new HigherLowerAction(higherLowerAnswer(state)),
        state -> new HigherLowerAction(
            higherLowerAnswer(state) == HigherLowerChoice.HIGHER ? HigherLowerChoice.LOWER : HigherLowerChoice.HIGHER)));
    assertEquals(10, runs.get(0).outcome().correct());
    assertEquals(List.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0), runs.get(1).outcome().rounds());
    assertEquals(List.of(-1, -1, -1, -1, -1, -1, -1, -1, -1, -1), runs.get(2).outcome().rounds());
  }

  @Test
  void shinyVoteContentIgnoresHowItIsPlayed() {
    var engine = new ShinyVoteEngine(GoldenManifests.of(ShinyVoteEngine.ID));
    // SAME_POKEMON: todas las opciones son el mismo Pokémon; el orden se ve en la correcta, los sprites y las paletas.
    var runs = playAll(engine, dailyConfig(engine), 42L, new Rules<ShinyVoteState, ShinyVoteAction>(
        ShinyVoteState::roundNumber,
        state -> "correcta " + state.correctOptionId() + " " + state.options().stream()
            .map(option -> option.id() + ":" + option.pokemonId() + ":" + option.sprite() + ":" + option.recolor())
            .toList(),
        state -> new ShinyVoteAction(state.correctOptionId()),
        state -> new ShinyVoteAction(state.correctOptionId() == ShinyOptionId.A ? ShinyOptionId.B : ShinyOptionId.A)));
    assertEquals(10, runs.get(0).outcome().correct());
    assertEquals(List.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0), runs.get(1).outcome().rounds());
    assertEquals(List.of(-1, -1, -1, -1, -1, -1, -1, -1, -1, -1), runs.get(2).outcome().rounds());
  }

  @Test
  void learnsetGuessContentIgnoresHowItIsPlayed() {
    var engine = new LearnsetGuessEngine(GoldenManifests.of(LearnsetGuessEngine.ID));
    var runs = playAll(engine, withGenerations12(dailyConfig(engine)), 2_026L,
        new Rules<LearnsetGuessState, LearnsetGuessAction>(
            LearnsetGuessState::roundNumber,
            state -> "correcto " + state.correctPokemonId(),
            state -> new LearnsetGuessAction(state.correctPokemonId()),
            state -> new LearnsetGuessAction("bulbasaur".equals(state.correctPokemonId()) ? "ivysaur" : "bulbasaur")));
    // Acertar al momento: se ve un grupo.
    assertEquals(List.of(1, 1, 1), runs.get(0).outcome().rounds());
    assertEquals(List.of(0, 0, 0), runs.get(1).outcome().rounds());
    assertEquals(List.of(0, 0, 0), runs.get(2).outcome().rounds());
    assertTrue(runs.get(0).outcome().score() > 0);
  }
}
