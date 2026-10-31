package es.pokemonuniverse.application.pokemon;

import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Paleta de {@code Pokemon.metadata} tal como la carga {@code loadPokemonCatalog} ({@code pokemon/catalog.ts}), el
 * catálogo de las salas: se filtran los colores {@code #rrggbb} y los pesos finitos y positivos; {@code palette} solo si
 * quedan al menos 3 colores y {@code paletteWeights} solo si además tienen la misma longitud (si no, se descartan solo
 * los pesos y el motor reparte el peso por igual). No comprueba {@code paletteVersion} ni {@code paletteSpriteUrl}:
 * eso lo hace el data-sync ({@code persistedPokemonPalette}) para decidir qué recalcular, no el catálogo.
 */
public record CatalogPalette(List<String> palette, @Nullable List<Double> paletteWeights) {

  private static final int MIN_COLORS = 3;
  private static final Pattern COLOR = Pattern.compile("^#[0-9a-f]{6}$", Pattern.CASE_INSENSITIVE);

  public CatalogPalette {
    palette = List.copyOf(palette);
    paletteWeights = paletteWeights == null ? null : List.copyOf(paletteWeights);
  }

  /** La paleta de {@code metadata}, o {@code null} si no tiene al menos 3 colores válidos. */
  public static @Nullable CatalogPalette from(@Nullable Map<String, Object> metadata) {
    if (metadata == null) return null;
    var colors = new ArrayList<String>();
    if (metadata.get("palette") instanceof List<?> rawColors) {
      for (var color : rawColors) {
        if (color instanceof String text && COLOR.matcher(text).matches()) colors.add(text);
      }
    }
    if (colors.size() < MIN_COLORS) return null;
    var weights = new ArrayList<Double>();
    if (metadata.get("paletteWeights") instanceof List<?> rawWeights) {
      for (var weight : rawWeights) {
        // typeof === 'number': un booleano o una cadena no cuentan.
        if (weight instanceof Number number && Double.isFinite(number.doubleValue()) && number.doubleValue() > 0) {
          weights.add(number.doubleValue());
        }
      }
    }
    return new CatalogPalette(colors, weights.size() == colors.size() ? weights : null);
  }
}
