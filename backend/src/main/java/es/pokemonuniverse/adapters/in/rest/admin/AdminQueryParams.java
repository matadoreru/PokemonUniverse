package es.pokemonuniverse.adapters.in.rest.admin;

import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.Map;

/**
 * Esquemas de query de los routers de administración: {@code pageQuery} ({@code page} con
 * {@code z.coerce.number().int().min(1).default(1)} y {@code search} con {@code z.string().trim().max(80).default('')})
 * y sus extensiones. Cada método valida un campo y anota sus incidencias en el orden en que se llama, que debe ser el
 * de la forma del esquema; {@link #done()} lanza el 400 con todas.
 *
 * <p>Como el parser {@code qs} de Express, un parámetro repetido es un array: {@code Number(['3'])} es 3,
 * {@code Number(['1', '2'])} es {@code NaN} y un array en un campo de texto es {@code received array}. Las claves con
 * corchetes de {@code qs} ({@code page[a]=1}) no se reproducen: aquí son otro parámetro y se ignoran.
 */
final class AdminQueryParams {

  private static final int MAX_SEARCH = 80;

  private final Map<String, List<String>> params;
  private final ZodIssues issues = new ZodIssues();

  private AdminQueryParams(Map<String, List<String>> params) {
    this.params = params;
  }

  static AdminQueryParams of(Map<String, List<String>> params) {
    return new AdminQueryParams(params);
  }

  /** {@code z.coerce.number().int().min(1).default(1)}; con incidencias devuelve 1 (no se usa). */
  long page() {
    var values = params.get("page");
    if (values == null) return 1;
    var path = List.<Object>of("page");
    double value = JsNumbers.fromString(String.join(",", values));
    if (Double.isNaN(value) || Double.isInfinite(value)) {
      issues.notANumber(value, path);
      return 1;
    }
    if (value != Math.rint(value)) {
      issues.notInteger(path);
      return 1;
    }
    boolean valid = true;
    if (Math.abs(value) > JsNumbers.MAX_SAFE_INTEGER) {
      issues.unsafeInteger(value > 0, path);
      valid = false;
    }
    if (value < 1) {
      issues.tooSmall("number", 1, path, "Too small: expected number to be >=1");
      valid = false;
    }
    return valid ? (long) value : 1;
  }

  /** {@code z.string().trim().max(80).default('')}. */
  String search() {
    var value = text("search", MAX_SEARCH);
    return value == null ? "" : value;
  }

  /** {@code z.string().trim().max(max).optional()}; ausente o inválido devuelve {@code null}. */
  @Nullable String text(String key, int max) {
    var values = params.get(key);
    if (values == null) return null;
    var path = List.<Object>of(key);
    if (values.size() != 1) {
      issues.invalidType("string", io.micronaut.json.tree.JsonNode.createArrayNode(List.of()), path);
      return null;
    }
    var trimmed = JsStrings.trim(values.getFirst());
    if (trimmed.length() > max) {
      issues.tooBig("string", max, path, "Too big: expected string to have <=" + max + " characters");
      return null;
    }
    return trimmed;
  }

  /** {@code z.enum(values).optional()}; un array tampoco es una opción válida. */
  @Nullable String enumValue(String key, List<String> values) {
    var raw = params.get(key);
    if (raw == null) return null;
    if (raw.size() != 1 || !values.contains(raw.getFirst())) {
      issues.invalidValue(values, List.of(key));
      return null;
    }
    return raw.getFirst();
  }

  /** Lanza el 400 de Zod si algún campo falló. */
  void done() {
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
  }
}
