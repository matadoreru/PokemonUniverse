package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validaciones de las rutas de escritura de avatar con los esquemas Zod de Node: {@code guestSchema} solo para
 * {@code displayName} (de la query) y {@code z.object({presetId: avatarPresetIdSchema}).strict()}.
 */
final class AvatarRequests {

  /** Orden de {@code AVATAR_PRESETS} en {@code packages/shared/src/avatar.ts} (el de {@code values} en el issue). */
  static final List<String> PRESET_IDS = List.of("trainer-berry", "trainer-aqua", "trainer-electric", "trainer-violet");
  /** {@code type} de {@code express.raw}: el tipo sin parámetros y sin distinguir mayúsculas. */
  static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/webp");

  private static final String DISPLAY_NAME = "displayName";
  private static final Pattern NAME = Pattern.compile("^[\\p{L}\\p{N}_ -]+$");
  private static final String NAME_PATTERN = "/^[\\p{L}\\p{N}_ -]+$/u";

  private AvatarRequests() {}

  /** ¿Lo leería {@code express.raw({type: ['image/jpeg', 'image/png', 'image/webp']})} como Buffer? */
  static boolean isImage(String contentType) {
    if (contentType == null) return false;
    int semicolon = contentType.indexOf(';');
    var type = (semicolon < 0 ? contentType : contentType.substring(0, semicolon)).trim().toLowerCase(Locale.ROOT);
    return IMAGE_TYPES.contains(type);
  }

  /**
   * {@code displayNameSchema = z.string().trim().min(2).max(24).regex(...)} sobre {@code req.query.displayName}: sin
   * valor es {@code undefined} y repetido es un array (qs). Las comprobaciones de cadena se acumulan como en Zod.
   */
  static String displayName(List<String> values) {
    var issues = new ZodIssues();
    List<Object> path = List.of(DISPLAY_NAME);
    if (values.size() != 1) {
      issues.invalidType("string", values.isEmpty() ? null : arrayNode(values), path);
      throw new InvalidInputException(issues);
    }
    var name = JsStrings.trim(values.getFirst());
    if (name.length() < 2) issues.tooSmall("string", 2, path, "Too small: expected string to have >=2 characters");
    if (name.length() > 24) issues.tooBig("string", 24, path, "Too big: expected string to have <=24 characters");
    if (!NAME.matcher(name).matches()) {
      issues.invalidFormat("regex", NAME_PATTERN, path, "Invalid string: must match pattern " + NAME_PATTERN);
    }
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return name;
  }

  /** {@code z.object({presetId: avatarPresetIdSchema}).strict().parse(req.body)}. */
  static String presetId(JsonNode body) {
    var issues = new ZodIssues();
    if (!body.isObject()) {
      issues.invalidType("object", body, List.of());
      throw new InvalidInputException(issues);
    }
    var preset = body.get("presetId");
    if (preset == null || !preset.isString() || !PRESET_IDS.contains(preset.getStringValue())) {
      issues.invalidValue(PRESET_IDS, List.of("presetId"));
    }
    var unknown = new ArrayList<String>();
    for (var entry : body.entries()) {
      if (!entry.getKey().equals("presetId")) unknown.add(entry.getKey());
    }
    if (!unknown.isEmpty()) issues.unrecognizedKeys(unknown);
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return preset.getStringValue();
  }

  private static JsonNode arrayNode(List<String> values) {
    return JsonNode.createArrayNode(values.stream().map(JsonNode::createStringNode).toList());
  }
}
