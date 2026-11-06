package es.pokemonuniverse.domain.room;

import io.micronaut.core.annotation.Nullable;

/**
 * Un minijuego que puede salir y, si el juego tiene modos y la sesión es al azar o por votación, el modo con el que
 * sale. Sin modo ({@code null}) el juego usa el de su configuración.
 */
public record GamePick(String gameId, @Nullable String mode) {}
