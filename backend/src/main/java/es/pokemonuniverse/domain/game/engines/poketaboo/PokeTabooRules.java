package es.pokemonuniverse.domain.game.engines.poketaboo;

import com.ibm.icu.lang.UCharacter;
import com.ibm.icu.lang.UProperty;
import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooPlayerStats;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Traducción literal de {@code poke-taboo/rules.ts}. */
public final class PokeTabooRules {

  public static final int GUESSER_MAX_POINTS = 5;
  public static final int GUESSER_MIN_POINTS = 1;
  public static final int DESCRIPTOR_POINTS = 2;

  /**
   * {@code /[^\p{L}\p{N}]+/gu}: Java aplica {@code \p{L}}/{@code \p{N}} (categorías generales Unicode) por punto de
   * código, como el modo {@code u} de JS.
   */
  private static final Pattern NOT_LETTER_OR_NUMBER = Pattern.compile("[^\\p{L}\\p{N}]+");

  /**
   * {@code /\s+/g} y {@code /\s/g}. Tras sustituir todo lo que no es letra ni número por {@code ' '}, el único espacio
   * posible es U+0020, así que el {@code \s} ASCII de Java equivale aquí al {@code \s} Unicode de JS.
   */
  private static final Pattern WHITESPACE_RUN = Pattern.compile("\\s+");

  private static final Pattern WHITESPACE = Pattern.compile("\\s");

  /** {@code /-(alola|galar|hisui|paldea)$/}; {@code \z} es el {@code $} de JS sin {@code m} (fin exacto de la cadena). */
  private static final Pattern REGIONAL_SUFFIX = Pattern.compile("-(alola|galar|hisui|paldea)\\z");

  private static final Pattern TAUROS_BREED = Pattern.compile("^tauros-paldea-(combat|blaze|aqua)-breed\\z");

  private PokeTabooRules() {}

  /** Puntos del adivinador por bandas de un quinto de la ronda; {@code double} como JS. */
  public static int pokeTabooGuesserPoints(long roundStartedAt, int roundSeconds, long solvedAt) {
    long duration = roundSeconds * 1_000L;
    long elapsed = Math.max(0, Math.min(duration, solvedAt - roundStartedAt));
    int band = (int) Math.min(4, Math.floor((double) elapsed / duration * 5));
    return Math.max(GUESSER_MIN_POINTS, GUESSER_MAX_POINTS - band);
  }

  /**
   * {@code value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
   * .trim().replace(/\s+/g, ' ')}, en el mismo orden:
   * <ul>
   *   <li>{@code normalize('NFD')} → {@link Normalizer} con {@link Normalizer.Form#NFD}.</li>
   *   <li>{@code \p{Diacritic}} es la propiedad binaria Unicode {@code Diacritic}, que Java no tiene en sus regex y no
   *   equivale a {@code \p{M}} (incluye modificadores como {@code ^}, {@code `} o {@code ¨} y excluye algunas marcas).
   *   Se usa la de ICU4J ({@link UProperty#DIACRITIC}), la misma tabla que consulta V8, por punto de código.</li>
   *   <li>{@code toLowerCase()} → {@link String#toLowerCase(Locale)} con {@link Locale#ROOT} (sin reglas locales).</li>
   *   <li>{@code trim()}: tras el paso anterior solo puede haber U+0020 en los extremos, así que
   *   {@link String#trim()} equivale al {@code trim} de JS en este punto.</li>
   * </ul>
   */
  public static String normalizeTabooText(String value) {
    var decomposed = Normalizer.normalize(value, Normalizer.Form.NFD);
    var withoutDiacritics = new StringBuilder(decomposed.length());
    decomposed.codePoints()
        .filter(codePoint -> !UCharacter.hasBinaryProperty(codePoint, UProperty.DIACRITIC))
        .forEach(withoutDiacritics::appendCodePoint);
    var lower = withoutDiacritics.toString().toLowerCase(Locale.ROOT);
    var spaced = NOT_LETTER_OR_NUMBER.matcher(lower).replaceAll(" ").trim();
    return WHITESPACE_RUN.matcher(spaced).replaceAll(" ");
  }

  /** Nombre, id, id sin forma regional y nombres localizados, normalizados, sin vacíos ni duplicados. */
  public static List<String> tabooPokemonAliases(Pokemon pokemon) {
    var idWithoutForm = TAUROS_BREED.matcher(REGIONAL_SUFFIX.matcher(pokemon.id()).replaceFirst(""))
        .replaceFirst("tauros");
    var values = new ArrayList<String>();
    values.add(pokemon.name());
    values.add(pokemon.id().replace("-", " "));
    values.add(idWithoutForm.replace("-", " "));
    if (pokemon.names() != null) {
      for (var localized : pokemon.names().values()) values.add(String.valueOf(localized));
    }
    var aliases = new LinkedHashSet<String>();
    for (var value : values) {
      var normalized = normalizeTabooText(value);
      if (!normalized.isEmpty()) aliases.add(normalized);
    }
    return new ArrayList<>(aliases);
  }

  public static boolean containsTabooPokemonName(String message, Pokemon pokemon) {
    var normalized = normalizeTabooText(message);
    var compact = WHITESPACE.matcher(normalized).replaceAll("");
    return tabooPokemonAliases(pokemon).stream().anyMatch(alias -> {
      boolean bounded = (" " + normalized + " ").contains(" " + alias + " ");
      return bounded || compact.contains(WHITESPACE.matcher(alias).replaceAll(""));
    });
  }

  static PokeTabooPlayerStats statsOf(PokeTabooState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? PokeTabooPlayerStats.ZERO : stats;
  }

  /**
   * Puntos, Pokémon adivinados y rondas de descriptor con éxito, de mayor a menor. El desempate de TS es
   * {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del servidor (cuid y
   * {@code guest_<uuid>}; ver el README de motores). La posición solo la comparte quien empata en puntos.
   */
  public static GameResults buildPokeTabooResults(PokeTabooState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before the game finishes");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(), playerId -> statsOf(state, playerId));
    Comparator<Scoring.ScoreEntry<PokeTabooPlayerStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().guessedPokemon(), left.stats().guessedPokemon());
      if (result == 0) {
        result = Integer.compare(right.stats().descriptorSuccesses(), left.stats().descriptorSuccesses());
      }
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}
