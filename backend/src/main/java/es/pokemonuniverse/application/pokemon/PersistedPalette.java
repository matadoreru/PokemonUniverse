package es.pokemonuniverse.application.pokemon;

import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * Paleta que el data-sync guarda en {@code Pokemon.metadata}. Solo se acepta como la acepta Node en
 * {@code persistedPokemonPalette} ({@code data-sync/pokemon-palette-sync.ts}): {@code paletteVersion === 3},
 * {@code paletteSpriteUrl} igual al sprite actual, al menos 3 colores {@code #rrggbb} y tantos pesos finitos y positivos
 * como colores (los valores que no cumplen se descartan antes de contar). Los colores y pesos resultantes son los que
 * {@code loadPokemonCatalog} ({@code pokemon/catalog.ts}) entrega a los motores: los filtrados, sin recortar.
 */
public record PersistedPalette(List<String> palette, List<Double> paletteWeights) {

  /** {@code POKEMON_PALETTE_VERSION}. */
  static final int VERSION = 3;
  private static final int MIN_COLORS = 3;
  private static final Pattern COLOR = Pattern.compile("^#[0-9a-f]{6}$", Pattern.CASE_INSENSITIVE);

  public PersistedPalette {
    palette = List.copyOf(palette);
    paletteWeights = List.copyOf(paletteWeights);
  }

  /** La paleta válida de {@code metadata} para {@code sprite}, o {@code null} si no la hay o está obsoleta. */
  public static @Nullable PersistedPalette from(@Nullable Map<String, Object> metadata, String sprite) {
    if (metadata == null) return null;
    if (!(metadata.get("paletteVersion") instanceof Number version) || version.doubleValue() != VERSION) return null;
    if (!Objects.equals(metadata.get("paletteSpriteUrl"), sprite)) return null;
    if (!(metadata.get("palette") instanceof List<?> rawColors)) return null;
    var colors = new ArrayList<String>();
    for (var color : rawColors) {
      if (color instanceof String text && COLOR.matcher(text).matches()) colors.add(text);
    }
    var weights = new ArrayList<Double>();
    if (metadata.get("paletteWeights") instanceof List<?> rawWeights) {
      for (var weight : rawWeights) {
        // typeof === 'number': un booleano o una cadena no cuentan.
        if (weight instanceof Number number && Double.isFinite(number.doubleValue()) && number.doubleValue() > 0) {
          weights.add(number.doubleValue());
        }
      }
    }
    return colors.size() >= MIN_COLORS && weights.size() == colors.size() ? new PersistedPalette(colors, weights) : null;
  }
}
