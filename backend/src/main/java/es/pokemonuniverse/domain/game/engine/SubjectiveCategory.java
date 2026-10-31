package es.pokemonuniverse.domain.game.engine;

import io.micronaut.serde.annotation.Serdeable;

/** Categoría o pregunta personal activa del host de la sala. */
@Serdeable
public record SubjectiveCategory(String id, String text) {}
