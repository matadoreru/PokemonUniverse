package es.pokemonuniverse.domain.game.engine.infra;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;

/**
 * Copias inmutables para los records de estado de los motores, que se copian en cada transición como el spread de TS.
 *
 * <p>Un {@code Record<string, …>} de TS conserva el orden de inserción, igual que {@link LinkedHashMap}
 * ({@link #frozenMap}), salvo para claves con aspecto de entero, que JS serializa ascendentes antes que las de texto.
 * Un {@code Record<number, …>} se modela con {@link #frozenSortedMap} (constraint 14 de la etapa 2B), nunca con un
 * {@code LinkedHashMap<String, …>}: el arnés dorado compara el orden de claves.
 */
public final class Immutables {

  private Immutables() {}

  /** Copia inmutable que conserva el orden de inserción (admite valores nulos, a diferencia de {@code Map.copyOf}). */
  public static <K, V> Map<K, V> frozenMap(Map<K, V> map) {
    return Collections.unmodifiableMap(new LinkedHashMap<>(map));
  }

  /** Copia inmutable ordenada por clave numérica ascendente: se serializa como un {@code Record<number, …>} de JS. */
  public static <V> SortedMap<Integer, V> frozenSortedMap(Map<Integer, V> map) {
    return Collections.unmodifiableSortedMap(new TreeMap<>(map));
  }

  /** {@code List.copyOf}: inmutable y sin nulos. */
  public static <T> List<T> frozenList(List<T> list) {
    return List.copyOf(list);
  }
}
