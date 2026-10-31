package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import io.micronaut.core.annotation.Nullable;

/**
 * Catálogos fijados por una partida: la siguiente partida usa el reemplazo, la actual conserva los suyos. Como
 * {@code catalogSnapshot()} de Node, la versión cambia con cada reemplazo de los tres catálogos.
 */
public record GameCatalogSnapshot(String version, PokemonCatalog pokemon, @Nullable PokemonVisualCatalog visuals,
    @Nullable PokemonAudioCatalog audio) {}
