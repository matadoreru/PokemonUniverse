package es.pokemonuniverse.domain.pokemon;

import io.micronaut.serde.annotation.Serdeable;

/** Entrada de Pokédex; el cargador solo produce {@code language = "es"}, como en Node. */
@Serdeable
public record PokedexEntry(
    String pokemonId, String text, String language, int generation, String version, String versionLabel) {}
