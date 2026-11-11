package es.pokemonuniverse.application.wouldyourather;

import com.ibm.icu.text.Collator;
import com.ibm.icu.util.ULocale;
import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Esquemas Zod de dilemas (los de crear e importar siguen en {@code packages/shared/src/custom-would-you-rather.ts};
 * el de editar estaba antes ahí), con las incidencias de Zod 4 en el mismo orden: primero los campos, después las
 * claves desconocidas del objeto y por último el refine.
 * <ul>
 *   <li>El refine de opciones distintas compara los valores ya recortados y corre aunque haya {@code too_small},
 *   {@code too_big} o claves desconocidas; no corre si alguna opción no es una cadena.</li>
 *   <li>En la importación, una longitud fuera de 1..100 oculta las incidencias de los elementos (no las de
 *   {@code version} ni las claves de la raíz).</li>
 * </ul>
 */
final class WouldYouRatherPromptSchemas {

  static final String SAME_OPTIONS = "Las dos opciones deben ser diferentes.";
  static final String NO_CHANGES = "No hay cambios que guardar.";
  private static final String TOO_SHORT = "Escribe al menos 4 caracteres.";
  private static final String TOO_LONG = "La opción no puede superar 180 caracteres.";
  private static final String NO_PROMPTS = "Incluye al menos un dilema.";
  private static final String TOO_MANY_PROMPTS = "Puedes importar hasta 100 dilemas cada vez.";
  private static final int MIN_OPTION = 4;
  private static final int MAX_OPTION = 180;
  private static final int MIN_IMPORT = 1;
  private static final int MAX_IMPORT = 100;
  private static final Set<String> PAIR_KEYS = Set.of("optionA", "optionB");
  private static final Set<String> UPDATE_KEYS = Set.of("optionA", "optionB", "enabled");
  private static final Set<String> IMPORT_KEYS = Set.of("version", "prompts");

  /**
   * {@code localeCompare(b, 'es', {sensitivity: 'base'})}: V8 usa el colador ICU del locale con fuerza primaria y
   * normalización canónica. Congelado es inmutable y se comparte entre hilos.
   */
  private static final Collator SPANISH_BASE = spanishBase();

  private WouldYouRatherPromptSchemas() {}

  private static Collator spanishBase() {
    var collator = Collator.getInstance(ULocale.forLanguageTag("es"));
    collator.setStrength(Collator.PRIMARY);
    collator.setDecomposition(Collator.CANONICAL_DECOMPOSITION);
    return collator.freeze();
  }

  /** {@code a.localeCompare(b, 'es', {sensitivity: 'base'}) === 0}. */
  static boolean sameBase(String a, String b) {
    return SPANISH_BASE.compare(a, b) == 0;
  }

  record Pair(String optionA, String optionB) {}

  record Changes(@Nullable String optionA, @Nullable String optionB, @Nullable Boolean enabled) {}

  /** {@code createCustomWouldYouRatherPromptSchema}: {@code {optionA, optionB}} estricto con el refine. */
  static Pair parseCreate(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isObject()) {
      issues.invalidType("object", raw, List.of());
      throw new InvalidInputException(issues);
    }
    var pair = pair(raw, List.of(), issues);
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return pair;
  }

  /** {@code updateCustomWouldYouRatherPromptSchema}: {@code {optionA?, optionB?, enabled?}} estricto, sin refine de igualdad. */
  static Changes parseUpdate(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isObject()) {
      issues.invalidType("object", raw, List.of());
      throw new InvalidInputException(issues);
    }
    var optionANode = raw.get("optionA");
    var optionBNode = raw.get("optionB");
    var enabledNode = raw.get("enabled");
    var optionA = optionANode == null ? null : option(optionANode, List.of("optionA"), issues);
    var optionB = optionBNode == null ? null : option(optionBNode, List.of("optionB"), issues);
    Boolean enabled = null;
    if (enabledNode != null) {
      if (enabledNode.isBoolean()) enabled = enabledNode.getBooleanValue();
      else issues.invalidType("boolean", enabledNode, List.of("enabled"));
    }
    unrecognizedKeys(raw, UPDATE_KEYS, List.of(), issues);
    // El refine solo falla sin ningún campo; en ese caso no puede haber incidencias de campo.
    if (optionANode == null && optionBNode == null && enabledNode == null) issues.custom(List.of(), NO_CHANGES);
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return new Changes(optionA, optionB, enabled);
  }

  /** {@code importCustomWouldYouRatherPromptsSchema}: {@code {version: 1, prompts: [1..100]}} estricto en ambos niveles. */
  static List<Pair> parseImport(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isObject()) {
      issues.invalidType("object", raw, List.of());
      throw new InvalidInputException(issues);
    }
    var version = raw.get("version");
    if (version == null || !version.isNumber() || version.getNumberValue().doubleValue() != 1.0) {
      issues.invalidLiteral(1, List.of("version"));
    }
    var prompts = raw.get("prompts");
    var pairs = new ArrayList<Pair>();
    if (prompts == null || !prompts.isArray()) {
      issues.invalidType("array", prompts, List.of("prompts"));
    } else if (prompts.size() < MIN_IMPORT) {
      issues.tooSmall("array", MIN_IMPORT, List.of("prompts"), NO_PROMPTS);
    } else if (prompts.size() > MAX_IMPORT) {
      issues.tooBig("array", MAX_IMPORT, List.of("prompts"), TOO_MANY_PROMPTS);
    } else {
      for (int i = 0; i < prompts.size(); i++) {
        var element = prompts.get(i);
        List<Object> path = List.of("prompts", i);
        if (element == null || !element.isObject()) issues.invalidType("object", element, path);
        else pairs.add(pair(element, path, issues));
      }
    }
    unrecognizedKeys(raw, IMPORT_KEYS, List.of(), issues);
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return List.copyOf(pairs);
  }

  /** Objeto {@code {optionA, optionB}} en {@code path}: campos, claves desconocidas y refine, en ese orden. */
  private static @Nullable Pair pair(JsonNode raw, List<Object> path, ZodIssues issues) {
    var optionA = option(raw.get("optionA"), append(path, "optionA"), issues);
    var optionB = option(raw.get("optionB"), append(path, "optionB"), issues);
    unrecognizedKeys(raw, PAIR_KEYS, path, issues);
    if (optionA == null || optionB == null) return null;
    if (sameBase(optionA, optionB)) issues.custom(append(path, "optionB"), SAME_OPTIONS);
    return new Pair(optionA, optionB);
  }

  /** {@code wouldYouRatherOptionTextSchema}: {@code trim} de JS y longitud 4..180 en unidades UTF-16. */
  private static @Nullable String option(@Nullable JsonNode node, List<Object> path, ZodIssues issues) {
    if (node == null || !node.isString()) {
      issues.invalidType("string", node, path);
      return null;
    }
    var trimmed = JsStrings.trim(node.getStringValue());
    if (trimmed.length() < MIN_OPTION) issues.tooSmall("string", MIN_OPTION, path, TOO_SHORT);
    else if (trimmed.length() > MAX_OPTION) issues.tooBig("string", MAX_OPTION, path, TOO_LONG);
    return trimmed;
  }

  private static void unrecognizedKeys(JsonNode raw, Set<String> allowed, List<Object> path, ZodIssues issues) {
    var unknown = new ArrayList<String>();
    for (var entry : raw.entries()) if (!allowed.contains(entry.getKey())) unknown.add(entry.getKey());
    if (!unknown.isEmpty()) issues.unrecognizedKeys(unknown, path);
  }

  private static List<Object> append(List<Object> path, Object segment) {
    var next = new ArrayList<>(path);
    next.add(segment);
    return List.copyOf(next);
  }
}
