package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.domain.game.GameManifest.MetricDefinition;
import io.micronaut.core.annotation.Nullable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** {@code mergeMetrics} de {@code stats/service.ts}: agrega SUM, MAX o MIN por métrica declarada del manifiesto. */
public final class MetricsMerge {

  private MetricsMerge() {}

  /**
   * Solo las métricas del manifiesto. Un valor previo o actual que no sea número cuenta como 0. MIN ignora los
   * valores {@code <= 0} (sin dato): {@code value <= 0 ? old : old <= 0 ? value : min(old, value)}.
   */
  public static Map<String, Object> merge(@Nullable Map<String, ?> previous, Map<String, ? extends Number> current,
      List<MetricDefinition> definitions) {
    var merged = new LinkedHashMap<String, Object>();
    for (var definition : definitions) {
      var priorValue = previous == null ? null : previous.get(definition.key());
      var currentValue = current.get(definition.key());
      double old = priorValue instanceof Number number ? number.doubleValue() : 0;
      double value = currentValue != null ? currentValue.doubleValue() : 0;
      double result = switch (definition.aggregation()) {
        case "MAX" -> Math.max(old, value);
        case "MIN" -> value <= 0 ? old : old <= 0 ? value : Math.min(old, value);
        default -> old + value;
      };
      merged.put(definition.key(), jsNumber(result));
    }
    return merged;
  }

  /** Enteros como {@code long} para que el JSON guarde {@code 3} y no {@code 3.0}, como un número de JS. */
  static Number jsNumber(double value) {
    return value == Math.rint(value) && Math.abs(value) < 9.007199254740992e15 ? (Number) (long) value : value;
  }
}
