package es.pokemonuniverse.domain.pokemon;

import io.micronaut.serde.annotation.Serdeable;

/** Arista de la cadena evolutiva (fila de {@code "PokemonEvolution"}): {@code fromPokemonId} evoluciona a {@code toPokemonId}. */
@Serdeable
public record PokemonEvolutionLink(String fromPokemonId, String toPokemonId) {}
