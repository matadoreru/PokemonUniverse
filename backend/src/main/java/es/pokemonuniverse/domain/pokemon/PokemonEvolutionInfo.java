package es.pokemonuniverse.domain.pokemon;

import io.micronaut.serde.annotation.Serdeable;

/** Etapa evolutiva del Pokémon y número de etapas de su línea. */
@Serdeable
public record PokemonEvolutionInfo(int stage, int stages) {}
