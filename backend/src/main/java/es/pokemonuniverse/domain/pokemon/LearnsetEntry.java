package es.pokemonuniverse.domain.pokemon;

import io.micronaut.serde.annotation.Serdeable;

/** Fila de {@code PokemonLevelUpMove}: el Pokémon aprende el movimiento a ese nivel en la generación de referencia. */
@Serdeable
public record LearnsetEntry(String pokemonId, String moveId, int referenceGeneration, int level) {}
