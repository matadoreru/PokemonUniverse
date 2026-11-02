package es.pokemonuniverse.application.gameconfigs;

import es.pokemonuniverse.domain.game.engine.ConfigIssue;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * {@code migrateStoredGameConfig} de {@code game-configs/service.ts}: mezcla la configuración guardada sobre la
 * configuración por defecto actual, descarta las claves retiradas y repara las ramas no válidas, de modo que un
 * cambio de esquema no borra los ajustes del usuario que siguen valiendo. Una configuración irreparable cae al defecto;
 * solo lanza ante un fallo que no es de validación (p. ej. de serialización).
 *
 * <p>Los issues salen de {@link GameEngine#configIssues} (el modo que recoge todo de
 * {@link es.pokemonuniverse.domain.game.engine.infra.ConfigReader}); los que ese modo deja para la siguiente pasada se
 * reparan en ella, dentro del mismo tope de intentos.
 */
public final class StoredGameConfigMigration {

  static final int MAX_ATTEMPTS = 24;

  private final JsonMapper json;

  public StoredGameConfigMigration(JsonMapper json) {
    this.json = json;
  }

  /** La configuración guardada ya validada y normalizada para {@code engine}; {@code null} es JSON {@code null}. */
  public JsonNode migrate(GameEngine<?, ?, ?, ?> engine, @Nullable JsonNode stored) {
    var fallback = toTree(engine.parseConfig(toTree(engine.defaultConfig())));
    var candidate = mergeKnown(fallback, stored == null ? JsonNode.nullNode() : stored);
    var priorCandidates = new HashSet<String>();
    for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return toTree(engine.parseConfig(candidate));
      } catch (ConfigValidationException invalid) {
        // safeParse fallido: se reparan las rutas de sus issues. Otro error (serialización) no se oculta.
      }
      if (!priorCandidates.add(JsonTree.toCanonicalString(candidate))) return fallback;
      var paths = engine.configIssues(candidate).stream().map(ConfigIssue::path)
          .map(StoredGameConfigMigration::normalizedIssuePath).toList();
      if (paths.isEmpty() || paths.stream().anyMatch(List::isEmpty)) return fallback;
      for (var path : paths) candidate = replaceAtPath(candidate, path, 0, valueAtPath(fallback, path));
    }
    return fallback;
  }

  /**
   * {@code mergeKnown}: solo se baja por objetos; las claves que el defecto no tiene se descartan; una rama ausente o
   * que no es objeto toma el defecto; listas y escalares guardados se toman enteros. {@code storedValue} Java
   * {@code null} es una clave ausente ({@code undefined}).
   */
  static JsonNode mergeKnown(JsonNode defaultValue, @Nullable JsonNode storedValue) {
    if (!defaultValue.isObject()) return storedValue == null ? defaultValue : storedValue;
    if (storedValue == null || !storedValue.isObject()) return defaultValue;
    var merged = new LinkedHashMap<String, JsonNode>();
    for (var entry : defaultValue.entries()) {
      merged.put(entry.getKey(), mergeKnown(entry.getValue(), storedValue.get(entry.getKey())));
    }
    return JsonNode.createObjectNode(merged);
  }

  /** {@code normalizedIssuePath}: la ruta hasta el primer índice de array (una lista se repara entera). */
  static List<Object> normalizedIssuePath(List<Object> path) {
    var normalized = new ArrayList<Object>();
    for (var segment : path) {
      if (segment instanceof Integer) break;
      normalized.add(segment);
    }
    return normalized;
  }

  /** {@code valueAtPath} sobre rutas de claves; {@code null} si no existe ({@code undefined}). */
  private static @Nullable JsonNode valueAtPath(JsonNode value, List<Object> path) {
    JsonNode current = value;
    for (var segment : path) {
      if (current == null || !current.isObject()) return null;
      current = current.get((String) segment);
    }
    return current;
  }

  /**
   * {@code replaceAtPath}: copia con {@code replacement} en {@code path}; un {@code null} ({@code undefined}) quita la
   * clave, como {@code JSON.stringify} la omitiría. Un intermedio que no es objeto (no ocurre tras {@link #mergeKnown})
   * se trata como objeto vacío en lugar de lanzar.
   */
  private static @Nullable JsonNode replaceAtPath(@Nullable JsonNode value, List<Object> path, int index,
      @Nullable JsonNode replacement) {
    if (index == path.size()) return replacement;
    var key = (String) path.get(index);
    var entries = new LinkedHashMap<String, JsonNode>();
    if (value != null && value.isObject()) {
      for (var entry : value.entries()) entries.put(entry.getKey(), entry.getValue());
    }
    var child = replaceAtPath(entries.get(key), path, index + 1, replacement);
    if (child == null) entries.remove(key);
    else entries.put(key, child);
    return JsonNode.createObjectNode(entries);
  }

  private JsonNode toTree(Object value) {
    try {
      return json.writeValueToTree(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
