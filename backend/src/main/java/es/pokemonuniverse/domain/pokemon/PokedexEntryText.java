package es.pokemonuniverse.domain.pokemon;

import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Utilidades sobre el texto de las entradas de Pokédex, compartidas por los juegos que las muestran. */
public final class PokedexEntryText {

  /** {@code /[\p{L}\p{N}]/u}: letra o número de cualquier escritura (no solo {@code Nd}). */
  private static final Pattern LETTER_OR_NUMBER = Pattern.compile("[\\p{L}\\p{N}]");

  /**
   * Separador entre las letras de un alias: {@code [\s\p{P}\p{S}]*}. El {@code \s} de Java (sin
   * {@code UNICODE_CHARACTER_CLASS}) solo cubre el espacio ASCII y los controles, pero {@link #sanitize}
   * ya ha colapsado todo espacio de JavaScript en {@code ' '} antes de enmascarar, así que basta.
   */
  private static final String ALIAS_JOINER = "[\\s\\p{P}\\p{S}]*";

  /**
   * Patrones ya compilados por expresión: los alias salen del catálogo, así que son pocos y se repiten en cada
   * llamada a {@link #sanitize}. Compartido entre hilos ({@link Pattern} es inmutable).
   */
  private static final ConcurrentHashMap<String, Pattern> COMPILED = new ConcurrentHashMap<>();

  private PokedexEntryText() {}

  /**
   * Nombre, id con espacios, nombres localizados y el símbolo de Nidoran; en NFC, recortados, de al menos dos unidades
   * UTF-16 y del más largo al más corto (orden estable, como {@code Array.prototype.sort}).
   */
  private static List<String> aliasesFor(Pokemon pokemon) {
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
  private static String aliasPattern(String alias) {
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
  public static String sanitize(String text, Pokemon pokemon) {
    var result = JsStrings.trim(collapseWhitespace(text));
    for (var alias : aliasesFor(pokemon)) {
      var pattern = aliasPattern(alias);
      if (pattern.isEmpty()) continue;
      var regex = "(?<![\\p{L}\\p{N}])" + pattern + "(?![\\p{L}\\p{N}])";
      result = COMPILED
          .computeIfAbsent(regex, key -> Pattern.compile(key, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE))
          .matcher(result).replaceAll(Matcher.quoteReplacement("???"));
    }
    return result;
  }
}
