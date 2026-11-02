package es.pokemonuniverse.domain.content;

/**
 * Identidad de un dilema ({@code wouldYouRatherPromptKey} de {@code apps/server/src/would-you-rather-prompts/service.ts}):
 * {@code [norm(A), norm(B)].sort().join('::')}, así que el orden de las opciones no importa. El {@code sort()} de JS
 * compara unidades UTF-16, como {@link String#compareTo}.
 */
public final class WouldYouRatherPromptKey {

  private WouldYouRatherPromptKey() {}

  public static String of(String optionA, String optionB) {
    var a = ContentNormalizer.normalize(optionA);
    var b = ContentNormalizer.normalize(optionB);
    return a.compareTo(b) <= 0 ? a + "::" + b : b + "::" + a;
  }

  /** {@code normalizeWouldYouRatherOption(A) === normalizeWouldYouRatherOption(B)} ({@code assertDifferent}). */
  public static boolean sameOptions(String optionA, String optionB) {
    return ContentNormalizer.normalize(optionA).equals(ContentNormalizer.normalize(optionB));
  }
}
