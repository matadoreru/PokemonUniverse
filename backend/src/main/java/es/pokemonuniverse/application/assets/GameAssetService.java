package es.pokemonuniverse.application.assets;

import es.pokemonuniverse.domain.game.assets.ImageTransforms;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.AssetResolution.Recolor;
import es.pokemonuniverse.domain.game.engine.EngineException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code loadGameImage} y {@code preloadGameImage} de Node: descarga la fuente autorizada, aplica la transformación
 * de la resolución y cachea el resultado con la clave de la constraint 19 de la 2B.
 */
public class GameAssetService {

  /** Límites de {@code gameImageCache} de Node: 32 MiB, 256 entradas, concurrencia 8, 64 pendientes. */
  public static final long CACHE_BYTES = 32L * 1024 * 1024;
  public static final int CACHE_ENTRIES = 256;
  public static final int CACHE_CONCURRENCY = 8;
  public static final int CACHE_PENDING = 64;
  private static final String PNG = "image/png";
  private static final Logger LOG = LoggerFactory.getLogger(GameAssetService.class);

  private final AssetSourceLoader loader;
  private final ResourceCache<LoadedAsset> cache;

  public GameAssetService(AssetSourceLoader loader, ResourceCache<LoadedAsset> cache) {
    this.loader = loader;
    this.cache = cache;
  }

  public static ResourceCache<LoadedAsset> defaultCache() {
    return new ResourceCache<>(CACHE_BYTES, CACHE_ENTRIES, CACHE_CONCURRENCY, CACHE_PENDING,
        asset -> asset.body().length);
  }

  public LoadedAsset load(AssetResolution asset) {
    return cache.load(cacheKey(asset), () -> transform(asset, loader.fetch(asset.source())));
  }

  /** Precarga asíncrona de una fuente original; los fallos solo se registran. */
  public void preload(String source) {
    Thread.ofVirtual().name("game-asset-preload").start(() -> {
      try {
        load(AssetResolution.original(source));
      } catch (RuntimeException e) {
        LOG.error("Failed to preload game image", e);
      }
    });
  }

  /** {@code ${transform}:${focusSeed ?? ''}:${zoom ?? ''}:${recolorKey}:${source}}. */
  static String cacheKey(AssetResolution asset) {
    var recolor = asset.recolor();
    var recolorKey = recolor == null ? "" : number(recolor.hueShiftDegrees()) + ":" + number(recolor.saturationScale())
        + ":" + number(recolor.lightnessScale()) + ":" + number(recolor.contrast());
    return asset.transform().name() + ":" + (asset.focusSeed() == null ? "" : asset.focusSeed()) + ":"
        + (asset.zoom() == null ? "" : number(asset.zoom())) + ":" + recolorKey + ":" + asset.source();
  }

  /** Número como lo imprime JavaScript en los casos habituales ({@code 4} y no {@code 4.0}). */
  private static String number(double value) {
    return value == Math.rint(value) && Math.abs(value) < 1e15 ? Long.toString((long) value) : Double.toString(value);
  }

  private static LoadedAsset transform(AssetResolution asset, LoadedAsset image) {
    long seed = asset.focusSeed() == null ? 0 : asset.focusSeed();
    return switch (asset.transform()) {
      case ZOOM_CROP -> png(ImageTransforms.zoomCrop(image.body(), seed, asset.zoom() == null ? 1 : asset.zoom()));
      case SILHOUETTE -> png(ImageTransforms.silhouette(image.body()));
      case NORMALIZED -> png(ImageTransforms.normalized(image.body(), null));
      case FOCUSED_NORMALIZED -> png(ImageTransforms.normalized(image.body(), seed));
      case PIXEL_ART -> png(ImageTransforms.pixelArt(image.body(), null));
      case PALETTE_RECOLOR -> png(ImageTransforms.pixelArt(image.body(), requireRecolor(asset.recolor())));
      case ORIGINAL -> image;
    };
  }

  private static Recolor requireRecolor(Recolor recolor) {
    if (recolor == null) throw new EngineException("Palette recolor transform requires recolor parameters");
    return recolor;
  }

  private static LoadedAsset png(byte[] body) {
    return new LoadedAsset(body, PNG);
  }
}
