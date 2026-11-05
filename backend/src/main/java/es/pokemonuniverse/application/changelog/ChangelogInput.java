package es.pokemonuniverse.application.changelog;

import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * {@code createChangelogSchema} y {@code updateChangelogSchema} de {@code shared/changelog.ts} con las incidencias de
 * Zod 4 en su orden: campos en el orden de la forma, después las claves desconocidas ({@code .strict()}).
 *
 * <p>{@code updateChangelogSchema = createChangelogSchema.partial().refine(...)}: {@code .partial()} conserva el
 * {@code .default(false)} de {@code published}, así que una edición que no lo envía despublica la entrada y el
 * {@code refine} («Incluye al menos un campo para actualizar.») nunca falla. Se reproduce tal cual (paridad con Node).
 *
 * <p>{@code summary} es opcional también al crear y llega recortado; la cadena vacía se conserva (en la edición borra
 * el resumen) y {@code null} significa que no se envió.
 */
public record ChangelogInput(@Nullable String version, @Nullable String title, @Nullable String summary,
    @Nullable Instant date, boolean published, @Nullable List<ChangelogChange> content) {

  private static final Set<String> KEYS = Set.of("version", "title", "summary", "date", "published", "content");
  private static final Set<String> CHANGE_KEYS = Set.of("type", "text", "highlight");
  private static final List<String> CATEGORIES =
      List.of("NEW", "MINIGAMES", "BALANCE", "INTERFACE", "IMPROVEMENTS", "BUGS", "TECHNICAL");
  private static final String VERSION_SOURCE = "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$";
  private static final Pattern VERSION = Pattern.compile(VERSION_SOURCE);
  /** Expresión de {@code z.string().datetime({offset: true})} de Zod 4, carácter a carácter. */
  private static final String DATETIME_SOURCE = "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00"
      + "|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)"
      + "|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3])"
      + ":[0-5]\\d)))$";
  private static final Pattern DATETIME = Pattern.compile(DATETIME_SOURCE);
  /** Descomposición de una fecha que ya cumple {@link #DATETIME}. */
  private static final Pattern PARTS = Pattern.compile(
      "(\\d{4})-(\\d\\d)-(\\d\\d)T(\\d\\d):(\\d\\d):(\\d\\d)(?:\\.(\\d+))?(?:Z|([+-])(\\d\\d):(\\d\\d))");
  private static final int MAX_CHANGES = 100;
  private static final int SUMMARY_MAX = 200;
  private static final int MAX_HIGHLIGHTS = 3;
  static final String TOO_MANY_HIGHLIGHTS = "Marca como destacados " + MAX_HIGHLIGHTS + " cambios como máximo.";

  public static ChangelogInput parseCreate(JsonNode raw) {
    return parse(raw, false);
  }

  public static ChangelogInput parseUpdate(JsonNode raw) {
    return parse(raw, true);
  }

  private static ChangelogInput parse(JsonNode raw, boolean partial) {
    var issues = new ZodIssues();
    if (!raw.isObject()) {
      issues.invalidType("object", raw, List.of());
      throw new InvalidInputException(issues);
    }
    var version = string(raw.get("version"), "version", partial, issues);
    if (version != null && !VERSION.matcher(version).matches()) {
      issues.invalidFormat("regex", "/" + VERSION_SOURCE + "/", List.of("version"), "Usa una versión como 0.8.0.");
    }
    var title = string(raw.get("title"), "title", partial, issues);
    if (title != null) length(title, 3, 120, List.of("title"), null, issues);
    // z.string().trim().max(200).optional(): opcional en las dos variantes.
    var summary = string(raw.get("summary"), "summary", true, issues);
    if (summary != null) length(summary, 0, SUMMARY_MAX, List.of("summary"), null, issues);
    Instant date = null;
    var rawDate = raw.get("date");
    if (rawDate != null || !partial) {
      if (rawDate == null || !rawDate.isString()) {
        issues.invalidType("string", rawDate, List.of("date"));
      } else if (!DATETIME.matcher(rawDate.getStringValue()).matches()) {
        issues.invalidFormat("datetime", "/" + DATETIME_SOURCE + "/", List.of("date"), "Invalid ISO datetime");
      } else {
        date = instant(rawDate.getStringValue());
      }
    }
    boolean published = false;
    var rawPublished = raw.get("published");
    if (rawPublished != null) {
      if (rawPublished.isBoolean()) published = rawPublished.getBooleanValue();
      else issues.invalidType("boolean", rawPublished, List.of("published"));
    }
    List<ChangelogChange> content = null;
    var rawContent = raw.get("content");
    if (rawContent != null || !partial) content = content(rawContent, issues);
    unrecognizedKeys(raw, KEYS, List.of(), issues);
    if (!issues.isEmpty()) throw new InvalidInputException(issues);
    return new ChangelogInput(version, title, summary, date, published, content);
  }

  /** {@code z.string().trim()} obligatorio (u opcional en la edición); devuelve el texto recortado. */
  private static @Nullable String string(@Nullable JsonNode node, String key, boolean partial, ZodIssues issues) {
    if (node == null && partial) return null;
    if (node == null || !node.isString()) {
      issues.invalidType("string", node, List.of(key));
      return null;
    }
    return JsStrings.trim(node.getStringValue());
  }

  private static boolean length(String value, int min, int max, List<Object> path, @Nullable String minMessage,
      ZodIssues issues) {
    if (value.length() < min) {
      issues.tooSmall("string", min, path,
          minMessage != null ? minMessage : "Too small: expected string to have >=" + min + " characters");
      return false;
    }
    if (value.length() > max) {
      issues.tooBig("string", max, path, "Too big: expected string to have <=" + max + " characters");
      return false;
    }
    return true;
  }

  /**
   * {@code changelogContentSchema}. Con más de 100 elementos Zod solo informa del tamaño (comprobado con Zod 4: los
   * errores de los elementos no aparecen); un array vacío, solo del mínimo.
   *
   * <p>El {@code superRefine} de los destacados (más de 3 es una incidencia {@code custom} en {@code content}) solo
   * corre si ningún elemento abortó: los tipos inválidos y el enum abortan; la longitud del texto y las claves
   * desconocidas no (comprobado con Zod 4). Cuenta los {@code highlight: true} de todos los elementos objeto.
   */
  private static @Nullable List<ChangelogChange> content(@Nullable JsonNode raw, ZodIssues issues) {
    var path = List.<Object>of("content");
    if (raw == null || !raw.isArray()) {
      issues.invalidType("array", raw, path);
      return null;
    }
    if (raw.size() > MAX_CHANGES) {
      issues.tooBig("array", MAX_CHANGES, path, "Too big: expected array to have <=100 items");
      return null;
    }
    int before = issues.size();
    boolean aborted = false;
    int highlights = 0;
    var changes = new ArrayList<ChangelogChange>();
    for (int i = 0; i < raw.size(); i++) {
      var item = raw.get(i);
      List<Object> itemPath = List.of("content", i);
      if (item == null || !item.isObject()) {
        issues.invalidType("object", item, itemPath);
        aborted = true;
        continue;
      }
      var type = item.get("type");
      boolean valid = true;
      if (type == null || !type.isString() || !CATEGORIES.contains(type.getStringValue())) {
        issues.invalidValue(CATEGORIES, List.of("content", i, "type"));
        valid = false;
        aborted = true;
      }
      var text = item.get("text");
      String trimmed = null;
      if (text == null || !text.isString()) {
        issues.invalidType("string", text, List.of("content", i, "text"));
        valid = false;
        aborted = true;
      } else {
        trimmed = JsStrings.trim(text.getStringValue());
        valid &= length(trimmed, 3, 500, List.of("content", i, "text"),
            "Describe el cambio con al menos 3 caracteres.", issues);
      }
      var highlight = item.get("highlight");
      if (highlight != null && !highlight.isBoolean()) {
        issues.invalidType("boolean", highlight, List.of("content", i, "highlight"));
        valid = false;
        aborted = true;
      }
      boolean highlighted = highlight != null && highlight.isBoolean() && highlight.getBooleanValue();
      if (highlighted) highlights++;
      unrecognizedKeys(item, CHANGE_KEYS, itemPath, issues);
      if (valid && type != null) changes.add(new ChangelogChange(type.getStringValue(), trimmed, highlighted));
    }
    if (raw.size() < 1) issues.tooSmall("array", 1, path, "Añade al menos un cambio.");
    if (!aborted && highlights > MAX_HIGHLIGHTS) issues.refinement(path, TOO_MANY_HIGHLIGHTS);
    return issues.size() == before ? List.copyOf(changes) : null;
  }

  /** {@code .strict()}: claves desconocidas en el orden de un objeto de JavaScript (índices enteros primero). */
  private static void unrecognizedKeys(JsonNode raw, Set<String> allowed, List<Object> path, ZodIssues issues) {
    var unknown = new ArrayList<String>();
    for (var entry : raw.entries()) if (!allowed.contains(entry.getKey())) unknown.add(entry.getKey());
    if (unknown.isEmpty()) return;
    var indices = unknown.stream().filter(ChangelogInput::isArrayIndex)
        .sorted(Comparator.comparingLong(Long::parseLong)).toList();
    var ordered = new ArrayList<>(indices);
    unknown.stream().filter(key -> !isArrayIndex(key)).forEach(ordered::add);
    issues.unrecognizedKeys(ordered, path);
  }

  /** Índice de array canónico ({@code 0} .. {@code 2^32 - 2}, sin ceros a la izquierda). */
  private static boolean isArrayIndex(String key) {
    if (key.isEmpty() || key.length() > 10 || !key.chars().allMatch(Character::isDigit)) return false;
    if (key.length() > 1 && key.charAt(0) == '0') return false;
    return Long.parseLong(key) <= 4_294_967_294L;
  }

  /**
   * {@code new Date(date)}: hora local más el desplazamiento (Zod admite hasta ±23:59, más que {@code ZoneOffset}) y
   * fracción truncada a milisegundos, como el {@code Date} de JavaScript.
   */
  static Instant instant(String value) {
    Matcher m = PARTS.matcher(value);
    if (!m.matches()) throw new IllegalArgumentException("Fecha no validada: " + value);
    var fraction = m.group(7) == null ? "" : m.group(7);
    int millis = Integer.parseInt((fraction + "000").substring(0, 3));
    var local = LocalDateTime.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)),
        Integer.parseInt(m.group(3)), Integer.parseInt(m.group(4)), Integer.parseInt(m.group(5)),
        Integer.parseInt(m.group(6)), millis * 1_000_000);
    long offsetSeconds = 0;
    if (m.group(8) != null) {
      offsetSeconds = (Integer.parseInt(m.group(9)) * 3600L + Integer.parseInt(m.group(10)) * 60L)
          * ("-".equals(m.group(8)) ? -1 : 1);
    }
    return local.toInstant(ZoneOffset.UTC).minusSeconds(offsetSeconds);
  }
}
