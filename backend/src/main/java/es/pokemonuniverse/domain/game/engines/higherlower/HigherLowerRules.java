package es.pokemonuniverse.domain.game.engines.higherlower;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig.HigherLowerCategory;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig.HigherLowerDifficulty;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerChoice;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerState;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerStats;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;

/** Traducción literal del TS que antes estaba en {@code higher-lower/rules.ts}. */
public final class HigherLowerRules {

  /** {@code HIGHER_LOWER_POINTS}. */
  public static final Map<HigherLowerChoice, Integer> POINTS =
      Map.of(HigherLowerChoice.HIGHER, 1, HigherLowerChoice.SAME, 3, HigherLowerChoice.LOWER, 1);

  /** {@code STREAK_BONUSES}: {@code {streak, bonus}} de mayor a menor. */
  private static final int[][] STREAK_BONUSES = {{10, 4}, {5, 2}, {3, 1}};

  /** {@code HIGHER_LOWER_DIFFICULTY_PERCENTILES}. */
  public static final Map<HigherLowerDifficulty, Double> DIFFICULTY_PERCENTILES = Map.of(
      HigherLowerDifficulty.VERY_EASY, 1.0,
      HigherLowerDifficulty.EASY, 0.75,
      HigherLowerDifficulty.NORMAL, 0.5,
      HigherLowerDifficulty.HARD, 0.25,
      HigherLowerDifficulty.VERY_HARD, 0.0);

  public static final double DIFFICULTY_CANDIDATE_RATIO = 0.2;

  /** {@code HIGHER_LOWER_SPEED_BONUS}. */
  public static final int SPEED_BONUS = 1;

  private HigherLowerRules() {}

  public static int pokemonCategoryValue(Pokemon pokemon, HigherLowerCategory category) {
    return switch (category) {
      case DEX_NUMBER -> pokemon.nationalDexNumber();
      case HP -> pokemon.hp();
      case ATTACK -> pokemon.attack();
      case DEFENSE -> pokemon.defense();
      case SPECIAL_ATTACK -> pokemon.specialAttack();
      case SPECIAL_DEFENSE -> pokemon.specialDefense();
      case SPEED -> pokemon.speed();
      case BASE_STAT_TOTAL -> pokemon.baseStatTotal();
    };
  }

  public static HigherLowerChoice higherLowerAnswer(int previous, int current) {
    return current > previous ? HigherLowerChoice.HIGHER : current < previous ? HigherLowerChoice.LOWER : HigherLowerChoice.SAME;
  }

  private record Ranked(Pokemon pokemon, int difference) {}

  /**
   * Ordena los candidatos por cercanía al valor anterior, toma la banda del percentil de la dificultad y elige uno al
   * azar entre los que tienen una diferencia dentro de esa banda. Consume {@code random} exactamente una vez.
   *
   * <p>El desempate final de TS es {@code id.localeCompare}; aquí {@link String#compareTo}. Solo se alcanza con dos
   * candidatos del mismo número de Pokédex (formas regionales), que {@code forGenerations} sin formas nunca devuelve.
   */
  public static Pokemon selectPokemonByDifficulty(Pokemon previous, List<Pokemon> candidates,
      HigherLowerCategory category, HigherLowerDifficulty difficulty, DoubleSupplier random) {
    if (candidates.isEmpty()) throw new EngineException("No hay Pokémon candidatos para esta ronda.");
    int previousValue = pokemonCategoryValue(previous, category);
    var ranked = new ArrayList<Ranked>(candidates.size());
    for (var pokemon : candidates) {
      ranked.add(new Ranked(pokemon, Math.abs(pokemonCategoryValue(pokemon, category) - previousValue)));
    }
    ranked.sort(Comparator.comparingInt(Ranked::difference)
        .thenComparingInt(entry -> entry.pokemon().nationalDexNumber())
        .thenComparing(entry -> entry.pokemon().id()));
    int targetIndex = (int) Math.round((ranked.size() - 1) * DIFFICULTY_PERCENTILES.get(difficulty));
    int bandSize = Math.max(1, (int) Math.ceil(ranked.size() * DIFFICULTY_CANDIDATE_RATIO));
    int bandStart = Math.min(Math.max(targetIndex - bandSize / 2, 0), ranked.size() - bandSize);
    var targetBand = ranked.subList(bandStart, bandStart + bandSize);
    int minimumDifference = targetBand.getFirst().difference();
    int maximumDifference = targetBand.getLast().difference();
    var suitable = ranked.stream()
        .filter(entry -> entry.difference() >= minimumDifference && entry.difference() <= maximumDifference)
        .toList();
    return Randoms.randomItem(suitable, random).pokemon();
  }

  public static int streakBonus(int streak) {
    for (var entry : STREAK_BONUSES) {
      if (streak >= entry[0]) return entry[1];
    }
    return 0;
  }

  /** Bonus por acertar en la primera mitad de la ronda ({@code answeredAt - roundStartedAt < roundSeconds * 500}). */
  public static int speedBonus(long answeredAt, long roundStartedAt, int roundSeconds) {
    return answeredAt - roundStartedAt < roundSeconds * 500L ? SPEED_BONUS : 0;
  }

  /**
   * Clasificación final con {@code accuracy} derivada. El desempate de TS es {@code playerId.localeCompare}; aquí
   * {@link String#compareTo}. Es equivalente para los ids del servidor: cuid de Prisma (usuarios: {@code c} + minúsculas
   * y dígitos) y {@code guest_<uuid>} (invitados: UUID en hexadecimal minúscula con {@code -} en posiciones fijas). El
   * único {@code _} está en el prefijo fijo y los {@code -} siempre coinciden en posición, así que dos ids difieren
   * siempre en una minúscula o un dígito, donde el orden de ICU y el de unidades UTF-16 coinciden. No vale para
   * nombres visibles ni para separadores en posiciones variables ({@code "_"} va antes que {@code "-"} en ICU): eso
   * necesita un {@link java.text.Collator}.
   */
  public static GameResults buildHigherLowerResults(HigherLowerState state) {
    Scoring.requireFinished(state.phase(), "Results unavailable");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(),
        playerId -> state.playerStats().get(playerId));
    Comparator<Scoring.ScoreEntry<HigherLowerStats>> compare = (left, right) -> {
      int byPoints = Integer.compare(right.points(), left.points());
      return byPoints != 0 ? byPoints : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> {
      var stats = entry.stats();
      int resolvedRounds = stats.correct() + stats.incorrect();
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("correct", stats.correct());
      mapped.put("incorrect", stats.incorrect());
      mapped.put("sameCorrect", stats.sameCorrect());
      mapped.put("answered", stats.answered());
      mapped.put("bestStreak", stats.bestStreak());
      mapped.put("accuracy", resolvedRounds != 0 ? (int) Math.round((double) stats.correct() / resolvedRounds * 100) : 0);
      // Récord de Racha infinita: solo existe en ENDLESS, para que el perfil no mezcle modos.
      if (state.config().mode() == HigherLowerMode.ENDLESS) mapped.put("endlessBestStreak", stats.bestStreak());
      return mapped;
    });
  }
}
