package es.pokemonuniverse.domain.game.engine;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/**
 * Fuente y transformación autorizadas para una imagen ({@code GameAssetResolution}). El {@code string} suelto que
 * puede devolver un motor TS equivale a {@link #original(String)}, como normaliza {@code game-image-cache.ts}.
 */
@Serdeable
public record AssetResolution(String source, Transform transform, @Nullable Long focusSeed, @Nullable Double zoom,
    @Nullable Recolor recolor) {

  public enum Transform { ORIGINAL, SILHOUETTE, NORMALIZED, FOCUSED_NORMALIZED, ZOOM_CROP, PIXEL_ART, PALETTE_RECOLOR }

  @Serdeable
  public record Recolor(double hueShiftDegrees, double saturationScale, double lightnessScale, double contrast) {}

  public static AssetResolution original(String source) {
    return new AssetResolution(source, Transform.ORIGINAL, null, null, null);
  }
}
