package es.pokemonuniverse.application.pokemon;

import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.assets.ResourceCache;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.pokemon.Pokemon;

/**
 * Miniaturas del buscador ({@code GET /api/pokemon/{id}/sprite}): la imagen original del catálogo por la misma lista
 * de orígenes de confianza que los assets de ronda, pero con un {@link GameAssetService} y una caché propios para que
 * las miniaturas no expulsen los assets precargados de las rondas. La web nunca ve la URL de origen (lleva el número
 * de PokéAPI).
 */
public class PokemonSpriteService {

  /**
   * Unos 1 500 sprites de unos pocos KiB caben enteros (el catálogo tiene unos 1 100, de 0,5 a 3 KiB); 40 miniaturas
   * por búsqueda y varios jugadores a la vez. El precalentado ocupa 4 de las 16 descargas simultáneas.
   */
  public static final long SPRITE_CACHE_BYTES = 16L * 1024 * 1024;
  public static final int SPRITE_CACHE_ENTRIES = 4096;
  public static final int SPRITE_CACHE_CONCURRENCY = 16;
  public static final int SPRITE_CACHE_PENDING = 512;

  private final GameAssetService assets;

  public PokemonSpriteService(GameAssetService assets) {
    this.assets = assets;
  }

  /** Caché del buscador; {@link GameAssetService#defaultCache()} (256 entradas, 64 pendientes) se queda corta. */
  public static ResourceCache<LoadedAsset> cache() {
    return new ResourceCache<>(SPRITE_CACHE_BYTES, SPRITE_CACHE_ENTRIES, SPRITE_CACHE_CONCURRENCY,
        SPRITE_CACHE_PENDING, asset -> asset.body().length);
  }

  /** Lanza {@code ResourceCapacityException} si hay demasiadas descargas en curso y propaga los fallos del origen. */
  public LoadedAsset sprite(Pokemon pokemon) {
    return assets.load(AssetResolution.original(pokemon.sprite()));
  }
}
