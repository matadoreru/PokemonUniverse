package es.pokemonuniverse.application.tcg;

import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.json.JsNumbers;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Cuerpo de {@code POST /api/tcg/eligibility}: {@code tcgHigherLowerConfigSchema.parse(req.body)} con las incidencias
 * de Zod 4 tal cual (el {@code TcgHigherLowerConfig.parse} de las salas da el mensaje de sala, no las incidencias). El
 * objeto no es {@code .strict()}: las claves desconocidas se ignoran.
 *
 * <p>Como Zod 4, una incidencia de tipo ({@code invalid_type}, incluido el decimal en un entero) aborta y las demás
 * ({@code too_small}, {@code too_big}, {@code invalid_format}) son continuables: el {@code superRefine} de precios solo
 * corre si no hubo ninguna que aborte. Con un precio no canónico, {@code compareTcgPrices} lanza dentro del
 * {@code parse} y Node responde 500 {@code Invalid canonical TCG price}: aquí sale la misma
 * {@link IllegalArgumentException}.
 */
public final class TcgEligibility {

  private static final Pattern PRICE = Pattern.compile("\\d+(?:\\.\\d+)?");
  private static final String PRICE_PATTERN = "/^\\d+(?:\\.\\d+)?$/";
  private static final int FIRST_GENERATION = 1;
  private static final int LAST_GENERATION = 9;

  private final ZodIssues issues = new ZodIssues();
  private boolean aborted;

  private TcgEligibility() {}

  /** Los filtros de la configuración válida; si no, {@link InvalidInputException} con las incidencias de Zod. */
  public static TcgCardCatalog.Filters parse(@Nullable JsonNode body) {
    return new TcgEligibility().run(body);
  }

  private TcgCardCatalog.Filters run(@Nullable JsonNode body) {
    if (body == null || !body.isObject()) {
      issues.invalidType("object", body, List.of());
      throw new InvalidInputException(issues);
    }
    var generations = generations(body.get("generations"));
    var setIds = strings(body.get("setIds"), "setIds");
    var rarities = strings(body.get("rarities"), "rarities");
    var minPrice = price(body.get("minPrice"), "minPrice");
    var maxPrice = price(body.get("maxPrice"), "maxPrice");
    var showRarity = body.get("showRarity");
    if (showRarity == null || !showRarity.isBoolean()) abort(() -> issues.invalidType("boolean", showRarity,
        List.of("showRarity")));
    integer(body.get("rounds"), List.of("rounds"), 5, 50);
    integer(body.get("roundSeconds"), List.of("roundSeconds"), 5, 60);
    if (!aborted && minPrice != null && maxPrice != null && TcgPrices.compare(minPrice, maxPrice) > 0) {
      issues.custom(List.of("maxPrice"), "El precio máximo debe ser igual o mayor que el mínimo.");
    }
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return new TcgCardCatalog.Filters(generations, setIds, rarities, minPrice, maxPrice);
  }

  private void abort(Runnable issue) {
    issue.run();
    aborted = true;
  }

  /** {@code pokemonGenerationsSchema}: lista de enteros 1..9 con al menos uno; sin duplicados y ascendente. */
  private List<Integer> generations(@Nullable JsonNode node) {
    var values = new TreeSet<Integer>();
    if (node == null || !node.isArray()) {
      abort(() -> issues.invalidType("array", node, List.of("generations")));
      return new ArrayList<>(values);
    }
    for (int index = 0; index < node.size(); index++) {
      var value = integer(node.get(index), List.of("generations", index), FIRST_GENERATION, LAST_GENERATION);
      if (value != null) values.add(value);
    }
    if (node.size() < 1) {
      issues.tooSmall("array", 1, List.of("generations"), "Too small: expected array to have >=1 items");
    }
    return new ArrayList<>(values);
  }

  /** {@code z.array(z.string().min(1))} sin duplicados, en orden de primera aparición. */
  private List<String> strings(@Nullable JsonNode node, String key) {
    var values = new LinkedHashSet<String>();
    if (node == null || !node.isArray()) {
      abort(() -> issues.invalidType("array", node, List.of(key)));
      return new ArrayList<>(values);
    }
    for (int index = 0; index < node.size(); index++) {
      var item = node.get(index);
      List<Object> path = List.of(key, index);
      if (!item.isString()) {
        abort(() -> issues.invalidType("string", item, path));
      } else if (item.getStringValue().isEmpty()) {
        issues.tooSmall("string", 1, path, "Too small: expected string to have >=1 characters");
      } else {
        values.add(item.getStringValue());
      }
    }
    return new ArrayList<>(values);
  }

  /** {@code optionalPriceSchema}: texto decimal o {@code null}; la clave es obligatoria. */
  private @Nullable String price(@Nullable JsonNode node, String key) {
    if (node != null && node.isNull()) return null;
    if (node == null || !node.isString()) {
      abort(() -> issues.invalidType("string", node, List.of(key)));
      return null;
    }
    if (!PRICE.matcher(node.getStringValue()).matches()) {
      issues.invalidFormat("regex", PRICE_PATTERN, List.of(key), "Introduce un precio válido.");
    }
    return node.getStringValue();
  }

  /** {@code z.number().int().min(min).max(max)}: devuelve el entero o {@code null} si no lo es. */
  private @Nullable Integer integer(@Nullable JsonNode node, List<Object> path, int min, int max) {
    if (node == null || !node.isNumber()) {
      abort(() -> issues.invalidType("number", node, path));
      return null;
    }
    double value = node.getNumberValue().doubleValue();
    if (value != Math.rint(value) || Double.isInfinite(value)) {
      abort(() -> issues.notInteger(path));
      return null;
    }
    if (!JsNumbers.isSafeInteger(value)) issues.unsafeInteger(value > 0, path);
    if (value < min) issues.tooSmall("number", min, path, "Too small: expected number to be >=" + min);
    if (value > max) issues.tooBig("number", max, path, "Too big: expected number to be <=" + max);
    return value >= min && value <= max ? (int) value : null;
  }
}
