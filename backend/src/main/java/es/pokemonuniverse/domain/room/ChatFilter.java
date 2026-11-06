package es.pokemonuniverse.domain.room;

import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Filtro de palabras del chat: tapa con {@code ***} las palabras enteras de una lista, sin distinguir
 * mayúsculas ni tildes y aceptando el plural con «s» o «es». Dominio puro, sin dependencias de framework.
 */
public final class ChatFilter {

  private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]+");
  private static final String MASK = "***";

  /** Filtro con la lista vacía: devuelve el texto tal cual. */
  public static final ChatFilter NONE = new ChatFilter(Set.of());

  private final Set<String> words;

  public ChatFilter(Collection<String> words) {
    Set<String> normalized = new HashSet<>();
    for (String word : words) {
      normalized.add(normalizeWord(word));
    }
    this.words = Set.copyOf(normalized);
  }

  /**
   * Lee el contenido del fichero de la lista: una palabra por línea, ya normalizada; se ignoran las
   * líneas vacías y las que empiezan por {@code #}.
   *
   * @throws IllegalArgumentException con el número de línea si una línea no es una sola palabra normalizada
   */
  public static ChatFilter fromList(String content) {
    Set<String> list = new HashSet<>();
    String[] lines = content.split("\\R", -1);
    for (int i = 0; i < lines.length; i++) {
      String line = lines[i].strip();
      if (line.isEmpty() || line.startsWith("#")) {
        continue;
      }
      if (!WORD.matcher(line).matches() || !normalizeWord(line).equals(line)) {
        throw new IllegalArgumentException(
            "Línea " + (i + 1) + " de la lista de palabras: debe ser una sola palabra normalizada: " + line);
      }
      list.add(line);
    }
    return new ChatFilter(list);
  }

  /** Sustituye cada palabra de la lista (o su plural) por {@code ***}, conservando el resto del texto. */
  public String apply(String text) {
    if (words.isEmpty()) {
      return text;
    }
    Matcher matcher = WORD.matcher(text);
    StringBuilder out = new StringBuilder();
    while (matcher.find()) {
      String word = normalizeWord(matcher.group());
      matcher.appendReplacement(out, isFiltered(word) ? Matcher.quoteReplacement(MASK) : Matcher.quoteReplacement(matcher.group()));
    }
    matcher.appendTail(out);
    return out.toString();
  }

  private boolean isFiltered(String word) {
    if (words.contains(word)) {
      return true;
    }
    if (word.endsWith("s") && words.contains(word.substring(0, word.length() - 1))) {
      return true;
    }
    return word.endsWith("es") && words.contains(word.substring(0, word.length() - 2));
  }

  /** Minúsculas y vocales sin tilde; la ñ se conserva (por eso no se usa {@code Normalizer.NFD}). */
  static String normalizeWord(String word) {
    String lower = word.toLowerCase(Locale.ROOT);
    StringBuilder sb = new StringBuilder(lower.length());
    for (int i = 0; i < lower.length(); i++) {
      char c = lower.charAt(i);
      sb.append(
          switch (c) {
            case 'á' -> 'a';
            case 'é' -> 'e';
            case 'í' -> 'i';
            case 'ó' -> 'o';
            case 'ú', 'ü' -> 'u';
            default -> c;
          });
    }
    return sb.toString();
  }
}
