package es.pokemonuniverse.application.datasync.pokemon;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.List;

/**
 * Lectura de las respuestas de PokéAPI que usan los extractores (las interfaces {@code PokeApi*} de {@code seed.ts}).
 * Un campo ausente se lee como lo haría JavaScript: cadena vacía no, {@code null}/{@code 0} según el uso.
 */
public final class PokeApiPayloads {

  /** {@code {name, language: {name}}}. */
  public record LocalizedName(String name, String language) {}

  /** {@code {level_learned_at, move_learn_method: {name}, version_group: {name}}}. */
  public record VersionDetail(int level, String method, String versionGroup) {}

  /** {@code {move: {name}, version_group_details}}. */
  public record SourceMove(String move, List<VersionDetail> details) {}

  /** {@code {flavor_text, language: {name}, version: {name}}}. */
  public record FlavorText(String text, String language, String version) {}

  private PokeApiPayloads() {}

  public static List<LocalizedName> names(@Nullable JsonNode names) {
    var result = new ArrayList<LocalizedName>();
    for (var entry : items(names)) result.add(new LocalizedName(text(entry.get("name")), nestedName(entry, "language")));
    return result;
  }

  public static List<SourceMove> moves(@Nullable JsonNode moves) {
    var result = new ArrayList<SourceMove>();
    for (var entry : items(moves)) {
      var details = new ArrayList<VersionDetail>();
      for (var detail : items(entry.get("version_group_details"))) {
        details.add(new VersionDetail(integer(detail.get("level_learned_at")), nestedName(detail, "move_learn_method"),
            nestedName(detail, "version_group")));
      }
      result.add(new SourceMove(nestedName(entry, "move"), details));
    }
    return result;
  }

  public static List<FlavorText> flavorTexts(@Nullable JsonNode entries) {
    var result = new ArrayList<FlavorText>();
    for (var entry : items(entries)) {
      result.add(new FlavorText(text(entry.get("flavor_text")), nestedName(entry, "language"), nestedName(entry, "version")));
    }
    return result;
  }

  /** {@code value.name} de un objeto anidado ({@code entry.language.name}). */
  public static String nestedName(@Nullable JsonNode parent, String field) {
    if (parent == null) return "";
    var child = parent.get(field);
    return child == null || !child.isObject() ? "" : text(child.get("name"));
  }

  public static Iterable<JsonNode> items(@Nullable JsonNode array) {
    return array == null || !array.isArray() ? List.of() : array.values();
  }

  public static String text(@Nullable JsonNode node) {
    return node != null && node.isString() ? node.getStringValue() : "";
  }

  public static @Nullable String nullableText(@Nullable JsonNode node) {
    return node != null && node.isString() ? node.getStringValue() : null;
  }

  public static int integer(@Nullable JsonNode node) {
    return node != null && node.isNumber() ? node.getNumberValue().intValue() : 0;
  }

  public static @Nullable Integer nullableInteger(@Nullable JsonNode node) {
    return node != null && node.isNumber() ? node.getNumberValue().intValue() : null;
  }

  public static boolean bool(@Nullable JsonNode node) {
    return node != null && node.isBoolean() && node.getBooleanValue();
  }
}
