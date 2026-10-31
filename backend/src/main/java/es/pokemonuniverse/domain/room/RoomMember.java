package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;

/** {@code RoomMember} de {@code rooms/types.ts}; mutable y solo accesible bajo el lock de su sala. */
public final class RoomMember {

  public AuthUser identity;
  public boolean connected = true;
  public PresenceStatus presence = PresenceStatus.CONNECTED;
  public RoomRole roomRole;
  /** {@code socketId} de TS: la conexión que recibe los eventos del miembro. */
  public @Nullable String connectionId;
  public MemberRole role;
  public boolean ready;
  public int sessionPoints;
  public final long joinedAt;
  public @Nullable RoomTimer disconnectTimer;

  public RoomMember(AuthUser identity, @Nullable String connectionId, MemberRole role, RoomRole roomRole, long joinedAt) {
    this.identity = identity;
    this.connectionId = connectionId;
    this.role = role;
    this.roomRole = roomRole;
    this.joinedAt = joinedAt;
  }
}
