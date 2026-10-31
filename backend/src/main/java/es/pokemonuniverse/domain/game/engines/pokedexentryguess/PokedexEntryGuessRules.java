package es.pokemonuniverse.domain.game.engines.pokedexentryguess;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessHint;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessTypes.PokedexEntryGuessState;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.DoubleSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Traducción literal de {@code pokedex-entry-guess/rules.ts}. */
public final class PokedexEntryGuessRules {

  /** {@code /[\p{L}\p{N}]/u}: letra o número de cualquier escritura (no solo {@code Nd}). */
  private static final Pattern LETTER_OR_NUMBER = Pattern.compile("[\\p{L}\\p{N}]");

  /**
   * Separador entre las letras de un alias: {@code [\s\p{P}\p{S}]*}. El {@code \s} de Java (sin
   * {@code UNICODE_CHARACTER_CLASS}) solo cubre el espacio ASCII y los controles, pero {@link #sanitizePokedexEntry}
   * ya ha colapsado todo espacio de JavaScript en {@code ' '} antes de enmascarar, así que basta.
   */
  private static final String ALIAS_JOINER = "[\\s\\p{P}\\p{S}]*";

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

  /**
   * Nombre, id con espacios, nombres localizados y el símbolo de Nidoran; en NFC, recortados, de al menos dos unidades
   * UTF-16 y del más largo al más corto (orden estable, como {@code Array.prototype.sort}).
   */
  static List<String> aliasesFor(Pokemon pokemon) {
    var aliases = new LinkedHashSet<String>();
    aliases.add(pokemon.name());
    aliases.add(pokemon.id().replace("-", " "));
    if (pokemon.names() != null) {
      for (var value : pokemon.names().values()) aliases.add(String.valueOf(value));
    }
    if (pokemon.id().equals("nidoran-f")) aliases.add("Nidoran♀");
    if (pokemon.id().equals("nidoran-m")) aliases.add("Nidoran♂");
    var result = new ArrayList<String>();
    for (var alias : aliases) {
      var normalized = JsStrings.trim(Normalizer.normalize(alias, Normalizer.Form.NFC));
      if (normalized.length() >= 2) result.add(normalized);
    }
    result.sort(Comparator.comparingInt(String::length).reversed());
    return result;
  }

  /**
   * Solo las letras y números del alias (por punto de código, como {@code [...alias]}), separados por espacios,
   * puntuación o símbolos opcionales. El escape de metacaracteres de TS no cambia nada: ninguna letra ni número lo es.
   */
  static String aliasPattern(String alias) {
    var letters = new ArrayList<String>();
    alias.codePoints().mapToObj(Character::toString)
        .filter(character -> LETTER_OR_NUMBER.matcher(character).matches())
        .forEach(letters::add);
    return String.join(ALIAS_JOINER, letters);
  }

  /** {@code text.replace(/\s+/g, ' ')}: el {@code \s} de JavaScript es Unicode aun sin la bandera {@code u}. */
  private static String collapseWhitespace(String text) {
    var result = new StringBuilder(text.length());
    boolean inRun = false;
    for (int index = 0; index < text.length(); index++) {
      char character = text.charAt(index);
      if (JsStrings.isJsWhitespace(character)) {
        if (!inRun) result.append(' ');
        inRun = true;
      } else {
        result.append(character);
        inRun = false;
      }
    }
    return result.toString();
  }

  /**
   * Oculta cada alias con {@code ???} cuando no está pegado a otra letra o número. Las banderas {@code giu} de TS son
   * {@code CASE_INSENSITIVE | UNICODE_CASE} (mayúsculas y acentos de cualquier escritura); {@code ?} no es especial en
   * el reemplazo de Java.
   */
  public static String sanitizePokedexEntry(String text, Pokemon pokemon) {
    var result = JsStrings.trim(collapseWhitespace(text));
    for (var alias : aliasesFor(pokemon)) {
      var pattern = aliasPattern(alias);
      if (pattern.isEmpty()) continue;
      result = Pattern.compile("(?<![\\p{L}\\p{N}])" + pattern + "(?![\\p{L}\\p{N}])",
          Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE).matcher(result).replaceAll(Matcher.quoteReplacement("???"));
    }
    return result;
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
