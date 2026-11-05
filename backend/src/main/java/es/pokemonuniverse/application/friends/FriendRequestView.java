package es.pokemonuniverse.application.friends;

import java.time.Instant;

/** Solicitud pendiente; {@code user} es la otra cuenta (remitente si es recibida, destinatario si es enviada). */
public record FriendRequestView(String id, FriendView user, Instant createdAt) {}
