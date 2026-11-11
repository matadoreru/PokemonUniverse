package es.pokemonuniverse.domain.game.engines.absurdpokedex;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexEntry;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexEntryResult;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexPlayerStats;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexPokemon;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexRealEntryRef;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexRoundResult;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexState;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.PokedexEntryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokedexEntryText;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Reglas puras de Pokédex Absurda: mazo, disponibilidad, puntuación de ronda y clasificación final. */
public final class AbsurdPokedexRules {

  /** {@code ABSURD_POKEDEX_MAX_ENTRY_LENGTH}: caracteres (unidades UTF-16) de una entrada. */
  public static final int MAX_ENTRY_LENGTH = 150;

  /** Tiempo que se ve el resultado de una ronda saltada o de resultados, en milisegundos. */
  public static final long REVEAL_MS = 8_000;

  /** Clásico: puntos por cada voto recibido. */
  public static final int POINTS_PER_VOTE = 1;

  /** Clásico: bonus de la entrada (o entradas empatadas) más votada. */
  public static final int WIN_BONUS = 2;

  /** {@code REAL_ENTRY}: puntos por votar la entrada oficial. */
  public static final int REAL_GUESS_POINTS = 2;

  /** {@code REAL_ENTRY}: puntos al autor por cada jugador que vota su inventada como oficial. */
  public static final int FOOL_POINTS = 1;

  /** {@code REAL_ENTRY}: puntos al autor por cada voto de graciosa. */
  public static final int FUNNY_POINTS = 1;

  private AbsurdPokedexRules() {}

  /** Los datos de un Pokémon que se muestran en la ronda. */
  public static AbsurdPokedexPokemon pokemonView(Pokemon pokemon) {
    return new AbsurdPokedexPokemon(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.nationalDexNumber(),
        pokemon.types());
  }

  /** El texto tapado de {@code entry} si es en español y cabe en {@value #MAX_ENTRY_LENGTH} caracteres; si no, nulo. */
  private static @Nullable String usableText(PokedexEntry entry, Pokemon pokemon) {
    if (!"es".equals(entry.language())) return null;
    var text = PokedexEntryText.sanitize(entry.text(), pokemon);
    return text.isEmpty() || text.length() > MAX_ENTRY_LENGTH ? null : text;
  }

  /**
   * Las entradas oficiales en español de {@code pokemon} de {@value #MAX_ENTRY_LENGTH} caracteres o menos una vez
   * tapado su nombre ({@link PokedexEntryText#sanitize}), con el texto ya tapado. Así la longitud no delata a la
   * oficial.
   */
  public static List<PokedexEntry> usableRealEntries(Pokemon pokemon, PokedexEntryPokemonCatalog catalog) {
    var usable = new ArrayList<PokedexEntry>();
    for (var entry : catalog.pokedexEntries(pokemon.id())) {
      var text = usableText(entry, pokemon);
      if (text == null) continue;
      usable.add(new PokedexEntry(entry.pokemonId(), text, entry.language(), entry.generation(), entry.version(),
          entry.versionLabel()));
    }
    return usable;
  }

  /** Si {@code pokemon} tiene alguna entrada utilizable: para en la primera, sin tapar las demás. */
  private static boolean hasUsableRealEntry(Pokemon pokemon, PokedexEntryPokemonCatalog catalog) {
    for (var entry : catalog.pokedexEntries(pokemon.id())) {
      if (usableText(entry, pokemon) != null) return true;
    }
    return false;
  }

  /**
   * El mazo de la partida: sin formas en ambos modos; en {@code REAL_ENTRY}, solo los Pokémon con alguna entrada
   * utilizable. Conserva el orden del catálogo.
   */
  public static List<Pokemon> pool(AbsurdPokedexConfig config, PokedexEntryPokemonCatalog catalog) {
    var pokemon = catalog.forGenerations(config.generations(), false);
    if (config.mode() != AbsurdPokedexMode.REAL_ENTRY) return pokemon;
    return pokemon.stream().filter(candidate -> hasUsableRealEntry(candidate, catalog)).toList();
  }

  /** El motivo por el que la partida no puede empezar con {@code pool}, o vacío si hay Pokémon para cada ronda. */
  public static Optional<String> availabilityIssue(AbsurdPokedexConfig config, List<Pokemon> pool) {
    return availabilityIssue(config, pool.size());
  }

  /**
   * Lo mismo que {@link #availabilityIssue(AbsurdPokedexConfig, List)} con el mazo de {@link #pool}, pero sin
   * construirlo: en {@code REAL_ENTRY} deja de buscar en cuanto hay Pokémon para todas las rondas (la sala lo
   * pregunta en cada elección de juego) y solo recorre todo el catálogo cuando faltan, para contar cuántos hay.
   */
  public static Optional<String> availabilityIssue(AbsurdPokedexConfig config, PokedexEntryPokemonCatalog catalog) {
    var pokemon = catalog.forGenerations(config.generations(), false);
    if (config.mode() != AbsurdPokedexMode.REAL_ENTRY) return availabilityIssue(config, pokemon.size());
    int available = 0;
    for (var candidate : pokemon) {
      if (!hasUsableRealEntry(candidate, catalog)) continue;
      available++;
      if (available >= config.rounds()) return Optional.empty();
    }
    return availabilityIssue(config, available);
  }

  private static Optional<String> availabilityIssue(AbsurdPokedexConfig config, int available) {
    if (available == 0 && config.mode() == AbsurdPokedexMode.REAL_ENTRY) {
      return Optional.of("No hay Pokémon con entradas de Pokédex en las generaciones seleccionadas.");
    }
    if (available < config.rounds()) {
      return Optional.of("Solo hay " + available + " Pokémon disponibles en estas generaciones: baja las rondas a "
          + available + " o añade generaciones.");
    }
    return Optional.empty();
  }

  /** Ronda saltada (menos de 2 entradas): sin entradas, sin puntos y sin ganadores. */
  public static AbsurdPokedexRoundResult skippedRound(AbsurdPokedexMode mode, Pokemon pokemon,
      List<String> missingPlayerIds) {
    return AbsurdPokedexRoundResult.builder().mode(mode).pokemon(pokemonView(pokemon)).skipped(true)
        .missingPlayerIds(missingPlayerIds).build();
  }

  /**
   * Puntúa una ronda con votos ya validados. {@code votes} y {@code funnyVotes} van de votante a id de entrada.
   *
   * <p>Clásico: +1 por voto recibido y +2 a toda entrada empatada en lo más votado con al menos 1 voto. {@code
   * REAL_ENTRY}: +2 al votante que acierta la oficial, +1 al autor por cada jugador al que engaña y +1 por cada voto de
   * graciosa. Ganan los jugadores con más puntos de la ronda, mínimo 1. {@code pointsAwarded} y los ganadores solo
   * recogen a quienes puntúan, en el orden en que puntúan al recorrer las entradas. Las entradas salen por votos
   * recibidos descendentes y después por id.
   */
  public static AbsurdPokedexRoundResult score(AbsurdPokedexMode mode, Pokemon pokemon,
      List<AbsurdPokedexEntry> entries, Map<String, String> votes, Map<String, String> funnyVotes,
      @Nullable String versionLabel, List<String> missingPlayerIds) {
    var points = new LinkedHashMap<String, Integer>();
    var results = new ArrayList<AbsurdPokedexEntryResult>();
    AbsurdPokedexRealEntryRef realEntry = null;
    int topVotes = 0;
    for (var entry : entries) {
      topVotes = Math.max(topVotes, voters(votes, entry.id()).size());
    }
    for (var entry : entries) {
      var votedBy = voters(votes, entry.id());
      var funnyVotedBy = voters(funnyVotes, entry.id());
      if (mode == AbsurdPokedexMode.REAL_ENTRY) {
        if (entry.isReal()) {
          if (versionLabel != null) realEntry = new AbsurdPokedexRealEntryRef(entry.id(), versionLabel);
          for (var voter : votedBy) add(points, voter, REAL_GUESS_POINTS);
        } else {
          add(points, entry.authorId(), FOOL_POINTS * votedBy.size() + FUNNY_POINTS * funnyVotedBy.size());
        }
      } else {
        int bonus = topVotes >= 1 && votedBy.size() == topVotes ? WIN_BONUS : 0;
        add(points, entry.authorId(), POINTS_PER_VOTE * votedBy.size() + bonus);
      }
      results.add(AbsurdPokedexEntryResult.builder().id(entry.id()).text(entry.text()).authorId(entry.authorId())
          .isReal(entry.isReal()).votesReceived(votedBy.size()).funnyVotesReceived(funnyVotedBy.size())
          .votedBy(votedBy).funnyVotedBy(funnyVotedBy).build());
    }
    results.sort(Comparator.comparingInt(AbsurdPokedexEntryResult::votesReceived).reversed()
        .thenComparing(AbsurdPokedexEntryResult::id));
    var awarded = new LinkedHashMap<String, Integer>();
    points.forEach((playerId, value) -> {
      if (value > 0) awarded.put(playerId, value);
    });
    int best = awarded.values().stream().mapToInt(Integer::intValue).max().orElse(0);
    var winners = best >= 1
        ? awarded.entrySet().stream().filter(entry -> entry.getValue() == best).map(Map.Entry::getKey).toList()
        : List.<String>of();
    return AbsurdPokedexRoundResult.builder().mode(mode).pokemon(pokemonView(pokemon)).skipped(false)
        .entries(results).realEntry(realEntry).winnerPlayerIds(winners).pointsAwarded(awarded)
        .missingPlayerIds(missingPlayerIds).build();
  }

  /** Votantes de {@code entryId}, en el orden de inserción de {@code votes}. */
  private static List<String> voters(Map<String, String> votes, String entryId) {
    return votes.entrySet().stream().filter(vote -> vote.getValue().equals(entryId)).map(Map.Entry::getKey)
        .toList();
  }

  /** Suma {@code value} a {@code playerId} (las entradas oficiales no tienen autor y no puntúan). */
  private static void add(Map<String, Integer> points, @Nullable String playerId, int value) {
    if (playerId != null) points.merge(playerId, value, Integer::sum);
  }

  private static AbsurdPokedexPlayerStats statsOf(AbsurdPokedexState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? AbsurdPokedexPlayerStats.ZERO : stats;
  }

  /**
   * Clasificación final: puntos, luego rondas ganadas y luego el id ({@link String#compareTo}, equivalente a
   * {@code localeCompare} para los ids del servidor; ver el README de motores). Solo existe en {@code GAME_RESULTS}.
   */
  public static GameResults buildResults(AbsurdPokedexState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before Pokédex Absurda finishes");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(), playerId -> statsOf(state, playerId));
    Comparator<Scoring.ScoreEntry<AbsurdPokedexPlayerStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().roundWins(), left.stats().roundWins());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare, entry -> entry.points() + ":" + entry.stats().roundWins(),
        entry -> entry.stats().toMap());
  }
}
