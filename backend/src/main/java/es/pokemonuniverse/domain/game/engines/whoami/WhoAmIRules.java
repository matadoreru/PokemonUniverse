package es.pokemonuniverse.domain.game.engines.whoami;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPlayerStats;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPokemon;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.DoubleSupplier;
import java.util.function.Predicate;

/** Reglas puras de ¿Quién soy? (contrapartida de {@code who-am-i/rules.ts}, más las del motor). */
public final class WhoAmIRules {

  /** {@code WHO_AM_I_MAX_QUESTION_LENGTH}. */
  public static final int MAX_QUESTION_LENGTH = 120;
  /** Tiempo para decidir (adivinar o pasar) tras las respuestas. */
  public static final long DECIDE_MS = 20_000;
  public static final int BASE_POINTS = 10;
  public static final int MIN_POINTS = 2;
  /** Bonus por orden de acierto: primero, segundo y tercero; el resto, 0. */
  public static final int[] ORDER_BONUS = {3, 2, 1};

  private WhoAmIRules() {}

  /** Siguiente turno: vuelta (desde 1) e índice en {@code playerIds}. */
  public record NextTurn(int lap, int turnIndex) {}

  /** Pokémon de las generaciones, sin formas, en el orden del catálogo. */
  public static List<Pokemon> pool(WhoAmIConfig config, PokemonCatalog catalog) {
    return catalog.forGenerations(config.generations(), false);
  }

  /** Por qué no se puede jugar con esa configuración y ese número de jugadores, o vacío. */
  public static Optional<String> availabilityIssue(WhoAmIConfig config, PokemonCatalog catalog, int playerCount) {
    int available = pool(config, catalog).size();
    if (available < playerCount) return Optional.of("Solo hay " + available + " Pokémon en esas generaciones.");
    return Optional.empty();
  }

  /** Reparte un Pokémon distinto a cada jugador: baraja el pool y asigna por orden de {@code playerIds}. */
  public static Map<String, WhoAmIPokemon> deal(List<String> playerIds, List<Pokemon> pool, DoubleSupplier random) {
    if (pool.size() < playerIds.size()) throw new EngineException("No hay Pokémon suficientes para repartir");
    var shuffled = Randoms.shuffled(pool, random);
    var dealt = new LinkedHashMap<String, WhoAmIPokemon>();
    for (int index = 0; index < playerIds.size(); index++) {
      var pokemon = shuffled.get(index);
      dealt.put(playerIds.get(index), new WhoAmIPokemon(pokemon.id(), pokemon.name(), pokemon.sprite(),
          pokemon.nationalDexNumber(), pokemon.types()));
    }
    return dealt;
  }

  /** {@code max(MIN_POINTS, BASE_POINTS - preguntas) + bonus del orden} (orden desde 1; 0 a partir del cuarto). */
  public static int solvePoints(int questionsAsked, int solveOrder) {
    int bonus = solveOrder >= 1 && solveOrder <= ORDER_BONUS.length ? ORDER_BONUS[solveOrder - 1] : 0;
    return Math.max(MIN_POINTS, BASE_POINTS - questionsAsked) + bonus;
  }

  /** Primer elegible desde el índice 0, en la vuelta 1; vacío si no hay ninguno. */
  public static Optional<NextTurn> firstTurn(List<String> playerIds, Predicate<String> eligible) {
    for (int index = 0; index < playerIds.size(); index++) {
      if (eligible.test(playerIds.get(index))) return Optional.of(new NextTurn(1, index));
    }
    return Optional.empty();
  }

  /**
   * Recorre {@code playerIds} desde el índice siguiente, de forma circular; cada paso del último índice al 0 sube la
   * vuelta. Vacío (la partida termina) si la vuelta supera {@code maxLaps} o se da una vuelta entera sin elegibles.
   */
  public static Optional<NextTurn> nextTurn(List<String> playerIds, int currentIndex, int lap, int maxLaps,
      Predicate<String> eligible) {
    int size = playerIds.size();
    for (int step = 1; step <= size; step++) {
      int absolute = currentIndex + step;
      int candidateLap = lap + absolute / size;
      if (candidateLap > maxLaps) return Optional.empty();
      int index = absolute % size;
      if (eligible.test(playerIds.get(index))) return Optional.of(new NextTurn(candidateLap, index));
    }
    return Optional.empty();
  }

  /** Clasificación final: puntos, después menos preguntas hechas y después id del jugador. */
  public static GameResults buildResults(WhoAmIState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, WhoAmIPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<WhoAmIPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<WhoAmIPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> state.questionsAsked().getOrDefault(entry.playerId(), 0))
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, entry -> entry.points() + ":" + state.questionsAsked().getOrDefault(entry.playerId(), 0),
        entry -> entry.stats().toMap());
  }
}
