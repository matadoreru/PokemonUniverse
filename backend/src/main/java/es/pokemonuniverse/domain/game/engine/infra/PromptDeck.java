package es.pokemonuniverse.domain.game.engine.infra;

import java.util.ArrayList;
import java.util.List;
import java.util.function.DoubleSupplier;
import java.util.function.Function;

/**
 * Elección del enunciado de la ronda de Secret Ranking, ¿Qué prefieres? y ¿Quién es más probable?: prefiere los no
 * usados y, cuando ya no queda ninguno, empieza un ciclo nuevo con el elegido.
 */
public final class PromptDeck {

  private PromptDeck() {}

  /** El enunciado elegido y los usados tras elegirlo (vacío si con él se agota el pool). */
  public record Choice(String promptId, List<String> usedPromptIds) {}

  /** Consume una extracción de {@code random}, con {@code Math.floor(r * n)} sin {@code Math.min}. */
  public static <T> Choice choose(List<T> pool, List<String> usedIds, Function<T, String> idOf,
      DoubleSupplier random) {
    var unused = pool.stream().filter(prompt -> !usedIds.contains(idOf.apply(prompt))).toList();
    var candidates = !unused.isEmpty() ? unused : pool;
    var selectedId = idOf.apply(candidates.get((int) Math.floor(random.getAsDouble() * candidates.size())));
    List<String> usedPromptIds;
    if (unused.isEmpty()) {
      usedPromptIds = List.of(selectedId);
    } else {
      usedPromptIds = new ArrayList<>(usedIds);
      usedPromptIds.add(selectedId);
    }
    return new Choice(selectedId, usedPromptIds.size() >= pool.size() ? List.of() : usedPromptIds);
  }
}
