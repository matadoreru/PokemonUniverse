package es.pokemonuniverse.application.friends;

import java.util.List;

/** Amigos (ordenados por estado y nombre) y solicitudes recibidas y enviadas. */
public record FriendsOverview(List<FriendView> friends, List<FriendRequestView> incoming,
    List<FriendRequestView> outgoing) {}
