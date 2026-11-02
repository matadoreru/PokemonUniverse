package es.pokemonuniverse.application.datasync;

/**
 * {@code countPersistedPokemonPalettes} de {@code pokemon-palette-sync.ts}: Pokémon por defecto con una paleta vigente
 * persistida. Lo aporta la sincronización de Pokémon; sin este bean {@link DataSyncService#ensureInitialPokemon} cuenta
 * cero paletas y lanza la sincronización inicial.
 */
public interface PokemonPaletteCount {

  /** Mínimo de paletas para considerar jugable {@code pokemon-palette-guess} ({@code MIN_PLAYABLE_POKEMON_PALETTES}). */
  int MIN_PLAYABLE = 100;

  long persisted();
}
