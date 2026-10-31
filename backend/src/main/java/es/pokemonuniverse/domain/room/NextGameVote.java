package es.pokemonuniverse.domain.room;

import io.micronaut.core.annotation.Nullable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** {@code NextGameVote}: votación privada del siguiente minijuego. */
public final class NextGameVote {

  public final List<String> optionGameIds;
  /** Votos por jugador en orden de llegada ({@code Record<string, string>}). */
  public final Map<String, String> votes = new LinkedHashMap<>();
  public @Nullable Long endsAt;
  public @Nullable String resolvedGameId;
  public @Nullable Map<String, Integer> tallies;
  public @Nullable Long nextTransitionAt;

  public NextGameVote(List<String> optionGameIds, long endsAt) {
    this.optionGameIds = List.copyOf(optionGameIds);
    this.endsAt = endsAt;
  }
}
