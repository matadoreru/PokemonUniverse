package es.pokemonuniverse.config;

import es.pokemonuniverse.adapters.out.assets.TrustedAssetSourceLoader;
import es.pokemonuniverse.adapters.out.storage.FilesystemArtworkCatalog;
import es.pokemonuniverse.adapters.out.storage.FilesystemSpriteStorage;
import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.pokemon.PokemonSpriteService;
import es.pokemonuniverse.application.pokemon.StoredSpriteSourceLoader;
import es.pokemonuniverse.application.ports.ArtworkCatalog;
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

  /** Los artworks de las partidas salen del mismo directorio de confianza; se vuelven a indexar en cada recarga. */
  @Singleton
  ArtworkCatalog artworkCatalog(@Property(name = "pu.artwork-dir") String artworkDir) {
    var dir = Path.of(artworkDir);
    return catalogIds -> new FilesystemArtworkCatalog(dir, catalogIds);
  }

  @Singleton
  GameAssetService gameAssetService(AssetSourceLoader loader) {
    return new GameAssetService(loader, GameAssetService.defaultCache());
  }

  /**
   * Su {@link GameAssetService} no es un bean: solo existe uno inyectable, el de las rondas. Con
   * {@code pu.sprites.cache-dir} (en producción, una carpeta del volumen de avatares) las miniaturas se guardan también
   * en disco y sobreviven a un despliegue; vacío (test) solo quedan en memoria.
   */
  @Singleton
  PokemonSpriteService pokemonSpriteService(AssetSourceLoader loader,
      @Property(name = "pu.sprites.cache-dir", defaultValue = "") String cacheDir) {
    var source = cacheDir.isBlank() ? loader
        : new StoredSpriteSourceLoader(loader, new FilesystemSpriteStorage(Path.of(cacheDir)));
    return new PokemonSpriteService(new GameAssetService(source, PokemonSpriteService.cache()));
  }
}
