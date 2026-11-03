package es.pokemonuniverse.application.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** {@code AdminGameHistoryItem} de {@code shared/admin.ts}; los nulos se emiten explícitos, como Node. */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record AdminGameHistoryItem(String id, String roomCode, String gameId, String gameName, int playerCount,
    String status, String startedAt, @Nullable String endedAt, List<Participant> participants) {

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record Participant(String displayName, @Nullable String userId, int position, int points) {}
}
