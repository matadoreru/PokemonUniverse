package es.pokemonuniverse.domain.game.engines.pokemontrivia;

import com.ibm.icu.number.LocalizedNumberFormatter;
import com.ibm.icu.number.NumberFormatter;
import com.ibm.icu.number.Precision;
import com.ibm.icu.util.ULocale;
import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaConfig.PokemonTriviaQuestionType;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaState;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaStats;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Locale;

/** Traducción literal del TS que antes estaba en {@code pokemon-trivia/rules.ts}, más el formato {@code toLocaleString('es-ES')}. */
public final class PokemonTriviaRules {

  /**
   * {@code Number.prototype.toLocaleString('es-ES')} con las opciones por defecto de {@code Intl.NumberFormat}: hasta
   * 3 decimales con redondeo {@code halfExpand} y agrupación según CLDR ({@code es} agrupa solo a partir de 5 cifras
   * enteras: {@code 1000}, {@code 12.345,6}). ICU4J es la misma biblioteca que usa Node; el formateador es inmutable.
   */
  private static final LocalizedNumberFormatter ES_ES = NumberFormatter.withLocale(ULocale.forLanguageTag("es-ES"))
      .precision(Precision.minMaxFraction(0, 3))
      .roundingMode(RoundingMode.HALF_UP);

  private PokemonTriviaRules() {}

  /** {@code toLocaleString('es-ES')} de un número. */
  public static String formatEs(double value) {
    return ES_ES.format(value).toString();
  }

  /** 100 por acertar más hasta 100 por la rapidez (aritmética {@code double}, como JS). */
  public static int pokemonTriviaPoints(long startedAt, int durationSeconds, long answeredAt) {
    long durationMs = durationSeconds * 1_000L;
    double remainingRatio = Math.max(0, Math.min(1, (double) (startedAt + durationMs - answeredAt) / durationMs));
    return 100 + (int) Math.ceil(remainingRatio * 100);
  }

  /**
   * Clasificación final: puntos y aciertos descendentes y, al final, {@code playerId.localeCompare}, aquí
   * {@link String#compareTo} (equivalente sobre ids de jugador, regla 21 del README de motores). Las estadísticas
   * por categoría se aplanan como {@code <tipo en minúscula>Answers}/{@code Correct}.
   */
  public static GameResults buildPokemonTriviaResults(PokemonTriviaState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, PokemonTriviaStats.empty())))
        .toList();
    Comparator<Scoring.ScoreEntry<PokemonTriviaStats>> compare = Comparator
        .<Scoring.ScoreEntry<PokemonTriviaStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().correct())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, entry -> entry.points() + ":" + entry.stats().correct(),
        entry -> {
          var stats = entry.stats();
          var mapped = new LinkedHashMap<String, Number>();
          mapped.put("answers", stats.answers());
          mapped.put("correct", stats.correct());
          mapped.put("incorrect", stats.incorrect());
          mapped.put("unanswered", stats.unanswered());
          mapped.put("fastestCorrectMs", stats.fastestCorrectMs());
          mapped.put("correctTimeTotalMs", stats.correctTimeTotalMs());
          mapped.put("pointsFromRounds", stats.pointsFromRounds());
          for (var type : PokemonTriviaQuestionType.values()) {
            var prefix = type.name().toLowerCase(Locale.ROOT);
            mapped.put(prefix + "Answers", stats.categoryAnswers().get(type.name()));
            mapped.put(prefix + "Correct", stats.categoryCorrect().get(type.name()));
          }
          return mapped;
        });
  }
}
