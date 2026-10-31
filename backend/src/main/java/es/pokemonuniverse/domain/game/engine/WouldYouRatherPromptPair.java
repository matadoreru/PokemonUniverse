package es.pokemonuniverse.domain.game.engine;

import io.micronaut.serde.annotation.Serdeable;

/** Dilema personal activo del host de la sala. */
@Serdeable
public record WouldYouRatherPromptPair(String id, String optionA, String optionB) {}
