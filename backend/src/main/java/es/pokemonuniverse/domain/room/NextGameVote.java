package es.pokemonuniverse.domain.room;

import io.micronaut.core.annotation.Nullable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code NextGameVote}: votación privada del siguiente minijuego. Cada opción es un par juego y modo; su id es el del
 * juego si el juego sale una sola vez entre las opciones y {@code juego:MODO} si sale con varios modos.
 */
public final class NextGameVote {

  /** Una opción de voto: su id, el juego y el modo con el que sale ({@code null} si el juego no tiene modos). */
  public record Option(String id, String gameId, @Nullable String mode) {
    public GamePick pick() {
      return new GamePick(gameId, mode);
    }
  }

  public final List<Option> options;
  /** Ids de las opciones, en el orden de {@link #options}. */
  public final List<String> optionIds;
  /** Votos por jugador (id de opción) en orden de llegada ({@code Record<string, string>}). */
  public final Map<String, String> votes = new LinkedHashMap<>();
  public @Nullable Long endsAt;
  public @Nullable String resolvedOptionId;
  public @Nullable Map<String, Integer> tallies;
  public @Nullable Long nextTransitionAt;

  public NextGameVote(List<GamePick> picks, long endsAt) {
    var counts = new LinkedHashMap<String, Integer>();
    for (var pick : picks) counts.merge(pick.gameId(), 1, Integer::sum);
    this.options = picks.stream().map(pick -> new Option(
        counts.get(pick.gameId()) > 1 && pick.mode() != null ? pick.gameId() + ":" + pick.mode() : pick.gameId(),
        pick.gameId(), pick.mode())).toList();
    this.optionIds = options.stream().map(Option::id).toList();
    this.endsAt = endsAt;
  }

  public @Nullable Option option(@Nullable String optionId) {
    return options.stream().filter(option -> option.id().equals(optionId)).findFirst().orElse(null);
  }
}
