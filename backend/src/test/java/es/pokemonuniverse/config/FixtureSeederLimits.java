package es.pokemonuniverse.config;

import es.pokemonuniverse.application.datasync.pokemon.SeederLimits;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import jakarta.inject.Singleton;

/**
 * Límites de la PokéAPI grabada (Pokémon 74–76, como {@code PokemonCatalogSeederTest.LIMITS}) en lugar de
 * {@link SeederLimits#PRODUCTION}. Solo en los contextos que lo piden con {@code pu.test.fixture-seeder-limits}.
 */
@Factory
@Requires(property = "pu.test.fixture-seeder-limits", value = "true")
class FixtureSeederLimits {

  @Singleton
  @Replaces(value = SeederLimits.class, factory = PokemonDataSyncBeans.class)
  SeederLimits fixtureSeederLimits() {
    return new SeederLimits(74, 76, 1, 1, 1, 1, SeederLimits.PRODUCTION.generationEnds());
  }
}
