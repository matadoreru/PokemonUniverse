package es.pokemonuniverse.application.friends;

import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.core.annotation.Nullable;

/** Otra cuenta tal como la ve el usuario: en una solicitud, sin nivel y siempre {@code OFFLINE}. */
public record FriendView(String id, String username, AvatarRef avatar, @Nullable Integer level, FriendStatus status) {}
