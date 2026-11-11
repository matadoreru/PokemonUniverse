package es.pokemonuniverse.config;

import es.pokemonuniverse.application.datasync.pokemon.PokeApiUrls;
import es.pokemonuniverse.application.datasync.pokemon.PokemonCatalogSeeder;
import es.pokemonuniverse.application.datasync.pokemon.PokemonCatalogStore;
import es.pokemonuniverse.application.datasync.pokemon.PokemonDataSync;
import es.pokemonuniverse.application.datasync.pokemon.PokemonPaletteSync;
import es.pokemonuniverse.application.datasync.pokemon.SeederLimits;
import es.pokemonuniverse.application.ports.SyncHttp;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Requires;
import jakarta.inject.Singleton;
import javax.sql.DataSource;

/**
 * Sincronización de Pokémon ({@code PokemonDataSync} de {@code index.ts}): el adaptador {@code POKEAPI} del data-sync y
 * el recuento de paletas que usa {@code ensureInitialPokemon}. Construirlos no hace ninguna petición; solo
 * {@link DataSyncStartup} (con {@code pu.data-sync.enabled}) o la administración los ponen en marcha. Producción usa
 * los totales de Node ({@link SeederLimits#PRODUCTION}), expuestos como bean para que las pruebas de arranque los
 * sustituyan por los de la PokéAPI grabada.
 */
@Factory
@Requires(beans = DataSource.class)
public class PokemonDataSyncBeans {

  @Singleton
  PokemonPaletteSync pokemonPaletteSync(PokemonCatalogStore store, SyncHttp http, Clock clock,
      PuConfig.DataSync config) {
    return new PokemonPaletteSync(store, http, config.spriteBaseUrl(), clock);
  }

  @Singleton
  PokemonCatalogSeeder pokemonCatalogSeeder(PokemonCatalogStore store, SyncHttp http, Clock clock,
      PuConfig.DataSync config) {
    return new PokemonCatalogSeeder(store, http, new PokeApiUrls(config.pokeapiBaseUrl()), clock);
  }

  @Singleton
  SeederLimits seederLimits() {
    return SeederLimits.PRODUCTION;
  }

  @Singleton
  PokemonDataSync pokemonDataSync(PokemonCatalogStore store, PokemonCatalogSeeder seeder, PokemonPaletteSync palettes,
      SyncHttp http, Clock clock, PuConfig.DataSync config, SeederLimits limits) {
    return new PokemonDataSync(store, seeder, palettes, http, new PokeApiUrls(config.pokeapiBaseUrl()), limits,
        clock);
  }
}
