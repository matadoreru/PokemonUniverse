package es.pokemonuniverse.adapters.in.rest.friends;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.friends.FriendRequestView;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/** Solicitud pendiente: {@code from} en las recibidas y {@code to} en las enviadas; la otra clave no se escribe. */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FriendRequestResponse(String id, @Nullable Party from, @Nullable Party to, String createdAt) {

  private static final DateTimeFormatter MILLIS =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

  /** La otra cuenta de la solicitud. */
  @Serdeable
  public record Party(String id, String username, AvatarRef avatar) {}

  static FriendRequestResponse incoming(FriendRequestView view) {
    return new FriendRequestResponse(view.id(), party(view), null, format(view.createdAt()));
  }

  static FriendRequestResponse outgoing(FriendRequestView view) {
    return new FriendRequestResponse(view.id(), null, party(view), format(view.createdAt()));
  }

  private static Party party(FriendRequestView view) {
    var user = view.user();
    return new Party(user.id(), user.username(), user.avatar());
  }

  private static String format(Instant instant) {
    return MILLIS.format(instant);
  }
}
