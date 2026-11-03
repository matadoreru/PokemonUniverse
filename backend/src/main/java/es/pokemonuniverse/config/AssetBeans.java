package es.pokemonuniverse.config;

import es.pokemonuniverse.adapters.out.assets.TrustedAssetSourceLoader;
import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.pokemon.PokemonSpriteService;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Property;
import jakarta.inject.Singleton;
import java.nio.file.Path;

/**
 * Proxy de imágenes y audio de ronda: origen de confianza ({@code pu.artwork-dir}) y caché acotada de Node. Las
 * miniaturas del buscador comparten el origen de confianza, pero no la caché.
 */
@Factory
public class AssetBeans {

  @Singleton
  AssetSourceLoader assetSourceLoader(@Property(name = "pu.artwork-dir") String artworkDir) {
    return new TrustedAssetSourceLoader(Path.of(artworkDir));
  }

  @Singleton
  GameAssetService gameAssetService(AssetSourceLoader loader) {
    return new GameAssetService(loader, GameAssetService.defaultCache());
  }

  /** Su {@link GameAssetService} no es un bean: solo existe uno inyectable, el de las rondas. */
  @Singleton
  PokemonSpriteService pokemonSpriteService(AssetSourceLoader loader) {
    return new PokemonSpriteService(new GameAssetService(loader, PokemonSpriteService.cache()));
  }
}
