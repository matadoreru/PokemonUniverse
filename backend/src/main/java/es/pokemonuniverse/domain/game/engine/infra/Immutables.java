package es.pokemonuniverse.domain.game.engine.infra;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Copias inmutables para los records de estado de los motores, que se copian en cada transición como el spread de TS.
 *
 * <p>Constraint 6 del plan: un {@code Record<string, …>} de TS conserva el orden de inserción, igual que
 * {@link LinkedHashMap}, salvo para claves con aspecto de entero, que JS ordena ascendentes. Mientras ningún motor
 * portado tenga un {@code Record<number, …>} basta con {@link #frozenMap}; el primero que lo tenga debe ordenar esas
 * claves como {@code JsonTree} al proyectarlas.
 */
public final class Immutables {

  private Immutables() {}

  /** Copia inmutable que conserva el orden de inserción (admite valores nulos, a diferencia de {@code Map.copyOf}). */
  public static <K, V> Map<K, V> frozenMap(Map<K, V> map) {
    return Collections.unmodifiableMap(new LinkedHashMap<>(map));
  }

  /** {@code List.copyOf}: inmutable y sin nulos. */
  public static <T> List<T> frozenList(List<T> list) {
    return List.copyOf(list);
  }
}
