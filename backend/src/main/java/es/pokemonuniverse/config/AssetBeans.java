package es.pokemonuniverse.config;

import es.pokemonuniverse.adapters.out.assets.TrustedAssetSourceLoader;
import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.GameAssetService;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Property;
import jakarta.inject.Singleton;
import java.nio.file.Path;

/** Proxy de imágenes y audio de ronda: origen de confianza ({@code pu.artwork-dir}) y caché acotada de Node. */
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
}
