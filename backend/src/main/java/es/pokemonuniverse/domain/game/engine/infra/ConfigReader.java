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
 * necesita {@code migrateStoredGameConfig}: cada fallo del lector se anota y devuelve un valor centinela válido para
 * que el {@code parse} siga. Diferencias deliberadas con Zod: una ruta guarda solo su primer issue; un objeto anidado
 * que no es objeto es un issue y sus campos ya no se leen; y una regla del motor que lanza ({@link #invalid},
 * {@link #invalidAt}) solo cuenta si antes no falló nada, porque con centinelas su resultado no es fiable (Zod tampoco
 * corre los {@code superRefine} sobre una entrada rota). Lo que quede sin anotar aparece en la siguiente pasada de
 * quien itera sobre las rutas.
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
   * Ejecuta {@code parse} recogiendo todos los issues con su ruta, en orden de lectura; vacío si es válido. Una
   * excepción del motor cuenta como issue solo si no se anotó ninguno antes (si no es de validación, en la raíz).
   */
  public static List<ConfigIssue> collectIssues(Runnable parse) {
    var issues = new Issues();
    try {
      ScopedValue.where(COLLECTING, issues).run(parse);
    } catch (ConfigValidationException e) {
      if (issues.isEmpty()) issues.add(e.path(), e.getMessage());
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
        fail(path, "clave desconocida " + entry.getKey());
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
      fail(at(key), key + " debe ser un número entero");
      return 0;
    }
    return (long) number;
  }

  /** Entero de una lista cerrada ({@code z.union} de literales o {@code .refine}); fuera de ella, {@code message}. */
  public int option(String key, Collection<Integer> options, String message) {
    long number = safeInteger(key);
    if (number < Integer.MIN_VALUE || number > Integer.MAX_VALUE || !options.contains((int) number)) {
      fail(at(key), message);
      return options.iterator().next();
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
    if (!node.isArray() || node.size() < 1) {
      fail(at(key), key + " debe ser una lista con al menos una generación");
      return allGenerations();
    }
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
   * Fallo de tipo o de valor de {@code key} que el motor comprueba a mano: lanza como {@link #invalidAt}, o al recoger
   * lo anota y vuelve, y el motor sigue con un valor centinela.
   */
  public void reject(String key, String detail) {
    fail(at(key), detail);
  }

  private int integerAt(JsonNode value, List<Object> issuePath, String key, int min, int max) {
    if (value == MISSING) return min;
    double number = wholeNumber(value, issuePath, key);
    if (Double.isNaN(number)) return min;
    if (number < min || number > max) {
      fail(issuePath, key + " debe estar entre " + min + " y " + max);
      return min;
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

  /** Lanza fuera de {@link #collectIssues}; dentro, anota el issue (si el lector no está silenciado) y vuelve. */
  private void fail(List<Object> issuePath, String detail) {
    var exception = exception(issuePath, detail);
    if (!COLLECTING.isBound()) throw exception;
    if (!muted) COLLECTING.get().add(issuePath, exception.getMessage());
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

    void add(List<Object> issuePath, String message) {
      if (paths.add(List.copyOf(issuePath))) list.add(new ConfigIssue(issuePath, message));
    }

    boolean isEmpty() {
      return list.isEmpty();
    }
  }
}
