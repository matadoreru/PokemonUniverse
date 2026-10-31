package es.pokemonuniverse.domain.game.engine.infra;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.function.DoubleSupplier;
import java.util.function.Function;

/**
 * Traducción literal de {@code games/infrastructure/random.ts}: consume {@code random} el mismo número de veces y en
 * el mismo orden que el TS.
 */
public final class Randoms {

  private Randoms() {}

  /** Fisher–Yates puro; una extracción por índice, de {@code size - 1} a {@code 1}. */
  public static <T> List<T> shuffled(List<T> values, DoubleSupplier random) {
    var result = new ArrayList<>(values);
    for (int index = result.size() - 1; index > 0; index -= 1) {
      int target = Math.min(index, (int) Math.floor(random.getAsDouble() * (index + 1)));
      Collections.swap(result, index, target);
    }
    return result;
  }

  /**
   * Mazo finito que se rellena sin repetir inmediatamente la carta anterior. El {@code previous && batch[0]} de TS
   * se traduce como comprobación de no nulo: un elemento falsy de JS ({@code ""}, {@code 0}) sí se compara aquí.
   */
  public static <T> List<T> contentDeck(List<T> pool, int length, DoubleSupplier random, Function<T, String> key) {
    if (length < 0) throw new IllegalArgumentException("Invalid deck length");
    if (length > 0 && pool.isEmpty()) throw new IllegalArgumentException("Empty content pool");
    var result = new ArrayList<T>();
    while (result.size() < length) {
      var batch = shuffled(pool, random);
      T previous = result.isEmpty() ? null : result.getLast();
      if (previous != null && !batch.isEmpty() && batch.getFirst() != null
          && Objects.equals(key.apply(previous), key.apply(batch.getFirst()))) {
        int other = -1;
        for (int i = 0; i < batch.size(); i++) {
          if (!Objects.equals(key.apply(batch.get(i)), key.apply(previous))) {
            other = i;
            break;
          }
        }
        if (other > 0) Collections.swap(batch, 0, other);
      }
      result.addAll(batch.subList(0, Math.min(batch.size(), length - result.size())));
    }
    return result;
  }

  /** {@code items[Math.min(Math.floor(random() * items.length), items.length - 1)]}; exige una lista no vacía. */
  public static <T> T randomItem(List<T> items, DoubleSupplier random) {
    return items.get(Math.min((int) Math.floor(random.getAsDouble() * items.size()), items.size() - 1));
  }
}
