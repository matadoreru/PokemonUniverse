package es.pokemonuniverse.application.rooms;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomPhase;
import es.pokemonuniverse.domain.room.RoomRole;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** {@code AdminActiveRoom}: proyección segura para administración (sin estado de juego ni correos). */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record AdminActiveRoom(String id, String code, RoomPhase phase, @Nullable String gameId,
    @Nullable String gameName, int connectedPlayers, int totalPlayers, int maxPlayers, String hostDisplayName,
    String createdAt, String updatedAt, List<Participant> participants) {

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record Participant(String id, String displayName, AuthUser.Kind kind, PresenceStatus presence,
      RoomRole roomRole) {}
}
