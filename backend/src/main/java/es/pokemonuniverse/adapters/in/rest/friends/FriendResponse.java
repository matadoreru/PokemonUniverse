package es.pokemonuniverse.adapters.in.rest.friends;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.friends.FriendStatus;
import es.pokemonuniverse.application.friends.FriendView;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/** Un amigo: {@code level} es {@code null} si aún no tiene experiencia registrada. */
@Serdeable
public record FriendResponse(
    String id,
    String username,
    AvatarRef avatar,
    @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable Integer level,
    FriendStatus status) {

  static FriendResponse of(FriendView view) {
    return new FriendResponse(view.id(), view.username(), view.avatar(), view.level(), view.status());
  }
}
