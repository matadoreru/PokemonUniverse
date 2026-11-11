package es.pokemonuniverse.domain.game.engines.pokedexentryguess;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessHint;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessState;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.PokedexEntryText;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.function.DoubleSupplier;

/** Traducción literal del TS que antes estaba en {@code pokedex-entry-guess/rules.ts}. */
public final class PokedexEntryGuessRules {

  private PokedexEntryGuessRules() {}

  /** {@code Math.max(...generations)}: el esquema garantiza al menos una generación. */
  public static int pokedexEntryReferenceGeneration(List<Integer> generations) {
    return Collections.max(generations);
  }

  public static String pokedexEntryKey(PokedexEntry entry) {
    return entry.pokemonId() + ":" + entry.generation() + ":" + entry.version();
  }

  /**
   * Entrada en español de la generación más reciente que no supere la de referencia o, si no hay ninguna, de la más
   * antigua disponible. Prefiere las no usadas y consume {@code random} exactamente una vez si hay entradas en español.
   */
  public static @Nullable PokedexEntry resolvePokedexEntry(List<PokedexEntry> entries, int referenceGeneration,
      DoubleSupplier random, Set<String> excluded) {
    var spanish = entries.stream().filter(entry -> "es".equals(entry.language())).toList();
    if (spanish.isEmpty()) return null;
    var historical = spanish.stream().filter(entry -> entry.generation() <= referenceGeneration).toList();
    int generation = historical.isEmpty()
        ? spanish.stream().mapToInt(PokedexEntry::generation).min().orElseThrow()
        : historical.stream().mapToInt(PokedexEntry::generation).max().orElseThrow();
    var nearest = spanish.stream().filter(entry -> entry.generation() == generation).toList();
    var unused = nearest.stream().filter(entry -> !excluded.contains(pokedexEntryKey(entry))).toList();
    return Randoms.randomItem(unused.isEmpty() ? nearest : unused, random);
  }

  public static @Nullable PokedexEntry resolvePokedexEntry(List<PokedexEntry> entries, int referenceGeneration,
      DoubleSupplier random) {
    return resolvePokedexEntry(entries, referenceGeneration, random, Set.of());
  }

  /** Tapa el nombre del Pokémon en la entrada; la lógica vive en {@link PokedexEntryText#sanitize}. */
  public static String sanitizePokedexEntry(String text, Pokemon pokemon) {
    return PokedexEntryText.sanitize(text, pokemon);
  }

  /** {@code evolutionStage && evolutionStageCount}: nulo o 0 no cuenta; la categoría exige una cadena no vacía. */
  public static List<PokedexEntryGuessHint> buildPokedexEntryHints(Pokemon pokemon, PokedexEntryGuessConfig config) {
    if (!config.hintsEnabled()) return List.of();
    var enabled = config.hints();
    var hints = new ArrayList<PokedexEntryGuessHint>();
    if (enabled.generation()) hints.add(new PokedexEntryGuessHint.Generation(pokemon.generation()));
    if (enabled.type()) hints.add(new PokedexEntryGuessHint.Type(pokemon.types().getFirst()));
    var stage = pokemon.evolutionStage();
    var stages = pokemon.evolutionStageCount();
    if (enabled.evolution() && stage != null && stage != 0 && stages != null && stages != 0) {
      hints.add(new PokedexEntryGuessHint.Evolution(stage, stages));
    }
    if (enabled.typeCount()) hints.add(new PokedexEntryGuessHint.TypeCount(pokemon.types().size()));
    var legendaryStatus = pokemon.legendaryStatus();
    if (enabled.category() && legendaryStatus != null && !legendaryStatus.isEmpty()) {
      hints.add(new PokedexEntryGuessHint.Category(legendaryStatus));
    }
    return hints;
  }

  public static int pokedexEntryRoundPoints(int playerCount, int solveOrder) {
    return Scoring.pointsForPosition(playerCount, solveOrder);
  }

  /**
   * Clasificación final: puntos, primeros puestos y aciertos descendentes, intentos ascendentes y, al final,
   * {@code playerId.localeCompare}, aquí {@link String#compareTo} (equivalente sobre ids de jugador, regla 21 del README
   * de motores). Sin {@code mapStats}: las estadísticas se copian tal cual ({@code { ...entry.stats }}).
   */
  public static GameResults buildPokedexEntryResults(PokedexEntryGuessState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, PokedexEntryGuessPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<PokedexEntryGuessPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<PokedexEntryGuessPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().roundFirsts())
        .thenComparingInt(entry -> -entry.stats().correct())
        .thenComparingInt(entry -> entry.stats().totalAttempts())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare,
        entry -> entry.points() + ":" + entry.stats().roundFirsts() + ":" + entry.stats().correct() + ":"
            + entry.stats().totalAttempts(),
        entry -> {
          var stats = entry.stats();
          var mapped = new LinkedHashMap<String, Number>();
          mapped.put("correct", stats.correct());
          mapped.put("missed", stats.missed());
          mapped.put("totalAttempts", stats.totalAttempts());
          mapped.put("firstTry", stats.firstTry());
          mapped.put("roundFirsts", stats.roundFirsts());
          mapped.put("solveTimeTotalMs", stats.solveTimeTotalMs());
          mapped.put("bestTimeMs", stats.bestTimeMs());
          mapped.put("pointsFromRounds", stats.pointsFromRounds());
          return mapped;
        });
  }
}
