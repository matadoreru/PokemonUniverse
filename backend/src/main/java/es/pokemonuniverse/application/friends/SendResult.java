package es.pokemonuniverse.application.friends;

/** Resultado de enviar una solicitud: queda pendiente o, si el otro ya la había pedido, sois amigos. */
public sealed interface SendResult {

  record Requested(FriendRequestView request) implements SendResult {}

  record BecameFriends(FriendView friend) implements SendResult {}
}
