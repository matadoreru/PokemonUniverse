package es.pokemonuniverse.application.changelog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Validacion estricta de {@code content} (changelogContentSchema.parse en Node). Cada elemento es {@code {type, text}}
 * o {@code {type, text, highlight}} con {@code highlight} booleano.
 */
public final class ChangelogContent {

  private static final Set<String> TYPES =
      Set.of("NEW", "MINIGAMES", "BALANCE", "INTERFACE", "IMPROVEMENTS", "BUGS", "TECHNICAL");

  private ChangelogContent() {}

  /** @throws IllegalStateException si el JSON almacenado no cumple el esquema */
  public static List<ChangelogChange> parse(Object raw) {
    if (!(raw instanceof List<?> items) || items.isEmpty() || items.size() > 100) {
      throw invalid("content debe ser un array de 1 a 100 elementos");
    }
    var out = new ArrayList<ChangelogChange>(items.size());
    for (var item : items) {
      if (!(item instanceof Map<?, ?> m) || !(m.get("type") instanceof String type)
          || !(m.get("text") instanceof String text)) {
        throw invalid("elemento con forma invalida");
      }
      boolean hasHighlight = m.containsKey("highlight");
      var highlight = m.get("highlight");
      if (m.size() != (hasHighlight ? 3 : 2) || (hasHighlight && !(highlight instanceof Boolean))) {
        throw invalid("elemento con claves invalidas");
      }
      var trimmed = text.trim();
      if (!TYPES.contains(type) || trimmed.length() < 3 || trimmed.length() > 500) {
        throw invalid("tipo o texto fuera de rango");
      }
      out.add(new ChangelogChange(type, trimmed, (Boolean) highlight));
    }
    return List.copyOf(out);
  }

  private static IllegalStateException invalid(String why) {
    return new IllegalStateException("Changelog content invalido: " + why);
  }
}
