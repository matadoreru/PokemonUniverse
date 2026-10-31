package es.pokemonuniverse.application.pokemon;

import java.util.List;

/** {@code generations} vacío significa todas. */
public record PokemonSearchQuery(List<Integer> generations, boolean includeForms) {}
