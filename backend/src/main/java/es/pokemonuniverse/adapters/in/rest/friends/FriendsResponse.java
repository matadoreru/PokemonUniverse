package es.pokemonuniverse.adapters.in.rest.friends;

import es.pokemonuniverse.application.friends.FriendsOverview;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Amigos, solicitudes recibidas ({@code from}) y enviadas ({@code to}). */
@Serdeable
public record FriendsResponse(
    List<FriendResponse> friends, List<FriendRequestResponse> incoming, List<FriendRequestResponse> outgoing) {

  static FriendsResponse of(FriendsOverview overview) {
    return new FriendsResponse(
        overview.friends().stream().map(FriendResponse::of).toList(),
        overview.incoming().stream().map(FriendRequestResponse::incoming).toList(),
        overview.outgoing().stream().map(FriendRequestResponse::outgoing).toList());
  }
}
