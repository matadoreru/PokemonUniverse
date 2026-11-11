package es.pokemonuniverse.application.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * {@code AdminGameHistoryItem} de {@code shared/admin.ts}; los nulos se emiten explícitos, como Node. {@code status} es el enum
 * de Postgres como texto: sus valores solo documentan el contrato, no se validan al leer.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record AdminGameHistoryItem(String id, String roomCode, String gameId, String gameName, int playerCount,
    @Schema(type = "string", allowableValues = {"IN_PROGRESS", "COMPLETED", "ABANDONED", "INTERRUPTED"},
        requiredMode = Schema.RequiredMode.REQUIRED)
    String status,
    String startedAt, @Nullable String endedAt, List<Participant> participants) {

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record Participant(String displayName, @Nullable String userId, int position, int points) {}
}
