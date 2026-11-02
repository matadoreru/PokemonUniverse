package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Lector común de los {@code *Config.parse}: reproduce los esquemas Zod de configuración sobre un objeto JSON. Falla en
 * el primer error con una {@link ConfigValidationException} cuyo mensaje es
 * {@code "Configuración de <juego> no válida: <detalle>."}, que llega tal cual a la sala como motivo de no
 * disponibilidad. Los enteros siguen {@code .int()} de Zod 4 ({@link JsNumbers#isSafeInteger}): admiten {@code 10.0}
 * y rechazan {@code 10.5} y {@code 2^53}.
 */
public final class ConfigReader {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  public static final int FIRST_GENERATION = 1;
  public static final int LAST_GENERATION = 9;

  private final JsonNode raw;
  private final String game;

  private ConfigReader(JsonNode raw, String game) {
    this.raw = raw;
    this.game = game;
  }

  /** Todas las generaciones en orden ascendente, como el {@code generations} de las configuraciones por defecto. */
  public static List<Integer> allGenerations() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return generations;
  }

  /** Lector de la raíz; {@code game} es el nombre visible del minijuego en el mensaje de error. */
  public static ConfigReader of(JsonNode raw, String game) {
    var reader = new ConfigReader(raw, game);
    if (raw == null || !raw.isObject()) throw reader.invalid("la configuración debe ser un objeto");
    return reader;
  }

  /** Lector de un objeto anidado obligatorio, con el mismo prefijo de error y sus claves sin calificar. */
  public ConfigReader object(String key) {
    var value = required(key);
    if (!value.isObject()) throw invalid(key + " debe ser un objeto");
    return new ConfigReader(value, game);
  }

  /** {@code .strict()}: ninguna clave fuera de {@code allowed}; se comprueba antes que los campos, como hoy. */
  public void strict(Set<String> allowed) {
    for (var entry : raw.entries()) {
      if (!allowed.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
  }

  public boolean has(String key) {
    return raw.get(key) != null;
  }

  public JsonNode required(String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  /** {@code z.number().int().min(min).max(max)}. */
  public int integer(String key, int min, int max) {
    return integer(required(key), key, min, max);
  }

  /** {@code z.number().int().min(min).max(max)} sobre un valor ya extraído (un elemento de lista, por ejemplo). */
  public int integer(JsonNode value, String key, int min, int max) {
    double number = safeNumber(value, key);
    if (number < min || number > max) throw invalid(key + " debe estar entre " + min + " y " + max);
    return (int) number;
  }

  /** {@code z.number().int()} sin límites: un entero seguro, que siempre cabe en un {@code long}. */
  public long safeInteger(String key) {
    return (long) safeNumber(required(key), key);
  }

  /** Entero de una lista cerrada ({@code z.union} de literales o {@code .refine}); fuera de ella, {@code message}. */
  public int option(String key, Collection<Integer> options, String message) {
    long number = safeInteger(key);
    if (number < Integer.MIN_VALUE || number > Integer.MAX_VALUE || !options.contains((int) number)) {
      throw invalid(message);
    }
    return (int) number;
  }

  /** {@code z.boolean()}. */
  public boolean bool(String key) {
    var value = required(key);
    if (!value.isBoolean()) throw invalid(key + " debe ser booleano");
    return value.getBooleanValue();
  }

  /** {@code z.enum([...])}: solo cadenas con el nombre exacto de una constante. */
  public <E extends Enum<E>> E enumValue(String key, Class<E> type) {
    return enumValue(required(key), key, type);
  }

  /** {@link #enumValue(String, Class)} con un mensaje de error propio del motor. */
  public <E extends Enum<E>> E enumValue(String key, Class<E> type, String message) {
    var constant = constant(required(key), type);
    if (constant == null) throw invalid(message);
    return constant;
  }

  /** {@link #enumValue(String, Class)} sobre un valor ya extraído (un elemento de lista, por ejemplo). */
  public <E extends Enum<E>> E enumValue(JsonNode value, String key, Class<E> type) {
    var constant = constant(value, type);
    if (constant == null) throw invalid(key + " tiene un valor no válido");
    return constant;
  }

  /** {@code pokemonGenerationsSchema}: lista no vacía de generaciones 1–9, sin duplicados y en orden ascendente. */
  public List<Integer> generations(String key) {
    var node = required(key);
    if (!node.isArray() || node.size() < 1) throw invalid(key + " debe ser una lista con al menos una generación");
    var generations = new TreeSet<Integer>();
    for (var value : node.values()) generations.add(integer(value, key, FIRST_GENERATION, LAST_GENERATION));
    return new ArrayList<>(generations);
  }

  /** La excepción con el prefijo del juego, para las reglas propias de cada esquema ({@code superRefine}). */
  public ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de " + game + " no válida: " + detail + ".");
  }

  private double safeNumber(JsonNode value, String key) {
    if (!value.isNumber() || !JsNumbers.isSafeInteger(value.getDoubleValue())) {
      throw invalid(key + " debe ser un número entero");
    }
    return value.getDoubleValue();
  }

  private static <E extends Enum<E>> E constant(JsonNode value, Class<E> type) {
    if (!value.isString()) return null;
    for (var constant : type.getEnumConstants()) {
      if (constant.name().equals(value.getStringValue())) return constant;
    }
    return null;
  }
}
