package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.ConfigIssue;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Lector común de los {@code *Config.parse}: reproduce los esquemas Zod de configuración sobre un objeto JSON. Falla en
 * el primer error con una {@link ConfigValidationException} cuyo mensaje es
 * {@code "Configuración de <juego> no válida: <detalle>."}, que llega tal cual a la sala como motivo de no
 * disponibilidad. Los enteros admiten {@code 10.0} y rechazan {@code 10.5} («debe ser un número entero»). Un entero
 * fuera del rango seguro ({@code 2^53}, {@code 1e20}) también se rechaza, pero con un acotado lo hace la comprobación de
 * rango («debe estar entre»), como el primer issue de Zod 4 ({@code too_big}); sin cotas, {@link #safeInteger} lo
 * rechaza con {@link JsNumbers#isSafeInteger} como {@code .int()}.
 *
 * <p>Cada fallo lleva su ruta Zod ({@link ConfigValidationException#path()}): la clave, con el prefijo del objeto
 * anidado, y el índice en {@link #generations}; en los elementos de listas que recorre el motor
 * ({@link #integer(JsonNode, String, int, int)}, {@link #enumValue(JsonNode, String, Class)}) la ruta se queda en la
 * clave de la lista.
 *
 * <p>{@link #collectIssues} ejecuta un {@code parse} en modo «recoger todo», el {@code safeParse(...).error.issues} que
 * necesita {@code migrateStoredGameConfig}, con la misma división que Zod 4 entre issues que abortan y continuables:
 * <ul>
 *   <li>Abortan el campo (tipo erróneo, clave ausente, decimal en un entero, enum, unión): se anota el issue y el
 *       {@code parse} sigue con un centinela válido; desde ese momento las reglas entre campos ({@code superRefine})
 *       no cuentan, como Zod, que no las corre sobre una entrada abortada.</li>
 *   <li>Continuables (rango {@code too_small}/{@code too_big}, lista vacía, clave desconocida de {@code .strict()},
 *       {@code refine} de un campo, {@link #rejectContinuable}): se anota el issue y el {@code parse} sigue con el valor
 *       real, y una regla del motor que lanza ({@link #invalid}, {@link #invalidAt}) también se anota, como el
 *       {@code superRefine} que Zod sí corre.</li>
 * </ul>
 * Diferencias deliberadas con Zod: una ruta guarda solo su primer issue; un objeto anidado que no es objeto es un issue
 * y sus campos ya no se leen; tras la primera regla que lanza no se lee nada más (las reglas van al final del
 * {@code parse}); y una excepción ajena a la validación (p. ej. {@code compareTcgPrices} con un precio no canónico, que
 * en Node hace lanzar al propio {@code safeParse}) se descarta si ya hay issues. Lo que quede sin anotar aparece en la
 * siguiente pasada de quien itera sobre las rutas.
 */
public final class ConfigReader {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  public static final int FIRST_GENERATION = 1;
  public static final int LAST_GENERATION = 9;

  /** Issues de la ejecución de {@link #collectIssues} en curso en este hilo; sin enlazar, cada fallo lanza. */
  private static final ScopedValue<Issues> COLLECTING = ScopedValue.newInstance();

  /** Clave ausente al recoger: los métodos que la reciben devuelven su centinela sin anotar otro issue. */
  private static final JsonNode MISSING = JsonNode.createArrayNode(new ArrayList<>());

  private final JsonNode raw;
  private final String game;
  private final List<Object> path;
  /** Lector de un objeto que ya falló (solo al recoger): no anota nada más. */
  private final boolean muted;

  private ConfigReader(JsonNode raw, String game, List<Object> path, boolean muted) {
    this.raw = raw;
    this.game = game;
    this.path = path;
    this.muted = muted;
  }

  /** Todas las generaciones en orden ascendente, como el {@code generations} de las configuraciones por defecto. */
  public static List<Integer> allGenerations() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return generations;
  }

  /**
   * Ejecuta {@code parse} recogiendo todos los issues con su ruta, en orden de lectura; vacío si es válido. Una regla
   * del motor que lanza ({@link #invalid}, {@link #invalidAt}) cuenta si antes no se anotó ningún issue que aborte;
   * otra excepción cuenta solo si no se anotó nada (en la raíz).
   */
  public static List<ConfigIssue> collectIssues(Runnable parse) {
    var issues = new Issues();
    try {
      ScopedValue.where(COLLECTING, issues).run(parse);
    } catch (ConfigValidationException e) {
      if (!issues.aborted) issues.add(e.path(), e.getMessage());
    } catch (RuntimeException e) {
      if (issues.isEmpty()) issues.add(List.of(), String.valueOf(e.getMessage()));
    }
    return List.copyOf(issues.list);
  }

  /** Lector de la raíz; {@code game} es el nombre visible del minijuego en el mensaje de error. */
  public static ConfigReader of(JsonNode raw, String game) {
    var reader = new ConfigReader(raw, game, List.of(), false);
    if (raw == null || !raw.isObject()) {
      reader.fail(List.of(), "la configuración debe ser un objeto");
      return reader.mutedChild(List.of());
    }
    return reader;
  }

  /** Lector de un objeto anidado obligatorio, con el mismo prefijo de error y sus claves sin calificar. */
  public ConfigReader object(String key) {
    var value = required(key);
    if (value == MISSING) return mutedChild(at(key));
    if (!value.isObject()) {
      fail(at(key), key + " debe ser un objeto");
      return mutedChild(at(key));
    }
    return new ConfigReader(value, game, at(key), muted);
  }

  /**
   * {@code .strict()}: ninguna clave fuera de {@code allowed}; se comprueba antes que los campos, como hoy. Como el
   * {@code unrecognized_keys} de Zod, es un único issue en la ruta del objeto.
   */
  public void strict(Set<String> allowed) {
    for (var entry : raw.entries()) {
      if (!allowed.contains(entry.getKey())) {
        failContinuable(path, "clave desconocida " + entry.getKey());
        return;
      }
    }
  }

  public boolean has(String key) {
    return raw.get(key) != null;
  }

  /** El valor de {@code key} tal cual, o {@code null} si falta; para los esquemas que el motor valida a mano. */
  public @Nullable JsonNode get(String key) {
    return raw.get(key);
  }

  public JsonNode required(String key) {
    var value = raw.get(key);
    if (value == null) {
      fail(at(key), "falta " + key);
      return MISSING;
    }
    return value;
  }

  /** {@code z.number().int().min(min).max(max)}. */
  public int integer(String key, int min, int max) {
    return integerAt(required(key), at(key), key, min, max);
  }

  /** {@code z.number().int().min(min).max(max)} sobre un valor ya extraído (un elemento de lista, por ejemplo). */
  public int integer(JsonNode value, String key, int min, int max) {
    return integerAt(value, at(key), key, min, max);
  }

  /** {@code z.number().int()} sin límites: un entero seguro, que siempre cabe en un {@code long}. */
  public long safeInteger(String key) {
    var value = required(key);
    if (value == MISSING) return 0;
    double number = wholeNumber(value, at(key), key);
    if (Double.isNaN(number)) return 0;
    if (!JsNumbers.isSafeInteger(number)) {
      failContinuable(at(key), key + " debe ser un número entero");
      return (long) number;
    }
    return (long) number;
  }

  /** Entero de una lista cerrada ({@code z.union} de literales o {@code .refine}); fuera de ella, {@code message}. */
  public int option(String key, Collection<Integer> options, String message) {
    long number = safeInteger(key);
    if (number < Integer.MIN_VALUE || number > Integer.MAX_VALUE || !options.contains((int) number)) {
      failContinuable(at(key), message);
      return (int) Math.max(Integer.MIN_VALUE, Math.min(Integer.MAX_VALUE, number));
    }
    return (int) number;
  }

  /** {@code z.boolean()}. */
  public boolean bool(String key) {
    var value = required(key);
    if (value == MISSING) return false;
    if (!value.isBoolean()) {
      fail(at(key), key + " debe ser booleano");
      return false;
    }
    return value.getBooleanValue();
  }

  /** {@code z.enum([...])}: solo cadenas con el nombre exacto de una constante. */
  public <E extends Enum<E>> E enumValue(String key, Class<E> type) {
    return enumValue(required(key), key, type);
  }

  /**
   * {@code z.enum([...]).default(defaultValue)}: una clave ausente vale {@code defaultValue} (una configuración guardada
   * antes de existir la clave); un {@code null} explícito se rechaza, como Zod, que solo rellena {@code undefined}.
   */
  public <E extends Enum<E>> E enumValueOrDefault(String key, Class<E> type, E defaultValue) {
    return has(key) ? enumValue(key, type) : defaultValue;
  }

  /** {@code z.boolean().default(defaultValue)}, con la misma regla de ausencia. */
  public boolean boolOrDefault(String key, boolean defaultValue) {
    return has(key) ? bool(key) : defaultValue;
  }

  /** {@code z.number().int().min(min).max(max).default(defaultValue)}, con la misma regla de ausencia. */
  public int integerOrDefault(String key, int min, int max, int defaultValue) {
    return has(key) ? integer(key, min, max) : defaultValue;
  }

  /** {@link #enumValue(String, Class)} con un mensaje de error propio del motor. */
  public <E extends Enum<E>> E enumValue(String key, Class<E> type, String message) {
    var value = required(key);
    if (value == MISSING) return type.getEnumConstants()[0];
    var constant = constant(value, type);
    if (constant == null) {
      fail(at(key), message);
      return type.getEnumConstants()[0];
    }
    return constant;
  }

  /** {@link #enumValue(String, Class)} sobre un valor ya extraído (un elemento de lista, por ejemplo). */
  public <E extends Enum<E>> E enumValue(JsonNode value, String key, Class<E> type) {
    if (value == MISSING) return type.getEnumConstants()[0];
    var constant = constant(value, type);
    if (constant == null) {
      fail(at(key), key + " tiene un valor no válido");
      return type.getEnumConstants()[0];
    }
    return constant;
  }

  /** {@code pokemonGenerationsSchema}: lista no vacía de generaciones 1–9, sin duplicados y en orden ascendente. */
  public List<Integer> generations(String key) {
    var node = required(key);
    if (node == MISSING) return allGenerations();
    if (!node.isArray()) {
      fail(at(key), key + " debe ser una lista con al menos una generación");
      return allGenerations();
    }
    if (node.size() < 1) failContinuable(at(key), key + " debe ser una lista con al menos una generación");
    var generations = new TreeSet<Integer>();
    for (int index = 0; index < node.size(); index++) {
      generations.add(integerAt(node.get(index), at(key, index), key, FIRST_GENERATION, LAST_GENERATION));
    }
    return new ArrayList<>(generations);
  }

  /**
   * La excepción con el prefijo del juego y la ruta de este objeto, para las reglas propias de cada esquema
   * ({@code superRefine}) cuyo issue va en la raíz del objeto.
   */
  public ConfigValidationException invalid(String detail) {
    return exception(path, detail);
  }

  /** {@link #invalid} con el issue en {@code key}, como un {@code ctx.addIssue({path: [key]})} de Zod. */
  public ConfigValidationException invalidAt(String key, String detail) {
    return exception(at(key), detail);
  }

  /**
   * Fallo de tipo o de valor de {@code key} que el motor comprueba a mano y que en Zod aborta el campo
   * ({@code invalid_type}, {@code invalid_value}, {@code invalid_union}): lanza como {@link #invalidAt}, o al recoger lo
   * anota y vuelve, y el motor sigue con un valor centinela.
   */
  public void reject(String key, String detail) {
    fail(at(key), detail);
  }

  /**
   * Como {@link #reject}, para un issue que Zod deja continuar ({@code too_small}, {@code too_big},
   * {@code invalid_format} o un {@code refine} del campo): al recoger, el motor sigue con el valor real y las reglas
   * entre campos todavía cuentan.
   */
  public void rejectContinuable(String key, String detail) {
    failContinuable(at(key), detail);
  }

  private int integerAt(JsonNode value, List<Object> issuePath, String key, int min, int max) {
    if (value == MISSING) return min;
    double number = wholeNumber(value, issuePath, key);
    if (Double.isNaN(number)) return min;
    if (number < min || number > max) {
      failContinuable(issuePath, key + " debe estar entre " + min + " y " + max);
      return (int) number;
    }
    return (int) number;
  }

  /**
   * Número finito sin parte decimal; la magnitud la comprueba quien llama (rango o entero seguro). Al recoger, un
   * fallo devuelve {@code NaN}.
   */
  private double wholeNumber(JsonNode value, List<Object> issuePath, String key) {
    if (!value.isNumber()) {
      fail(issuePath, key + " debe ser un número entero");
      return Double.NaN;
    }
    double number = value.getDoubleValue();
    if (Double.isInfinite(number) || number != Math.rint(number)) {
      fail(issuePath, key + " debe ser un número entero");
      return Double.NaN;
    }
    return number;
  }

  /**
   * Issue que aborta su campo en Zod: lanza fuera de {@link #collectIssues}; dentro, lo anota (si el lector no está
   * silenciado) y vuelve, y ya no cuentan las reglas entre campos.
   */
  private void fail(List<Object> issuePath, String detail) {
    record(issuePath, detail, true);
  }

  /** Issue continuable de Zod ({@code too_small}/{@code too_big}…): las reglas entre campos siguen contando. */
  private void failContinuable(List<Object> issuePath, String detail) {
    record(issuePath, detail, false);
  }

  private void record(List<Object> issuePath, String detail, boolean aborts) {
    var exception = exception(issuePath, detail);
    if (!COLLECTING.isBound()) throw exception;
    if (muted) return;
    var issues = COLLECTING.get();
    issues.add(issuePath, exception.getMessage());
    if (aborts) issues.aborted = true;
  }

  private ConfigValidationException exception(List<Object> issuePath, String detail) {
    return new ConfigValidationException("Configuración de " + game + " no válida: " + detail + ".", issuePath);
  }

  private ConfigReader mutedChild(List<Object> childPath) {
    return new ConfigReader(JsonNode.createObjectNode(Map.of()), game, childPath, true);
  }

  private List<Object> at(Object... segments) {
    var full = new ArrayList<Object>(path);
    full.addAll(List.of(segments));
    return List.copyOf(full);
  }

  private static <E extends Enum<E>> E constant(JsonNode value, Class<E> type) {
    if (!value.isString()) return null;
    for (var constant : type.getEnumConstants()) {
      if (constant.name().equals(value.getStringValue())) return constant;
    }
    return null;
  }

  /** Issues recogidos; una ruta conserva solo el primero. */
  private static final class Issues {
    private final List<ConfigIssue> list = new ArrayList<>();
    private final Set<List<Object>> paths = new HashSet<>();
    /** Algún issue que en Zod aborta: a partir de él, los {@code superRefine} del objeto no corren. */
    private boolean aborted;

    void add(List<Object> issuePath, String message) {
      if (paths.add(List.copyOf(issuePath))) list.add(new ConfigIssue(issuePath, message));
    }

    boolean isEmpty() {
      return list.isEmpty();
    }
  }
}
