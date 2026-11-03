package es.pokemonuniverse.domain.game.engines.shinyvote;

import es.pokemonuniverse.domain.game.engine.AssetResolution.Recolor;
import java.util.List;
import java.util.function.DoubleSupplier;

/** Traducción literal de {@code shiny-vote/filters.ts}. */
public final class ShinyVoteFilters {

  /** {@code FAKE_SHINY_SPRITE_PROBABILITY}: algunos señuelos parten de la paleta shiny oficial antes de recolorearse. */
  public static final double FAKE_SHINY_SPRITE_PROBABILITY = 0.35;

  /**
   * {@code FAKE_SHINY_PALETTES}: desplazamientos contenidos que imitan recoloreados oficiales. Columnas en el orden de
   * {@link Recolor}: {@code hueShiftDegrees, saturationScale, lightnessScale, contrast} (las fixtures doradas y
   * {@code ShinyVoteEngineTest} comprueban cada fila por clave).
   */
  public static final List<Recolor> FAKE_SHINY_PALETTES = List.of(
      new Recolor(28, 0.9, 1.02, 0.97),
      new Recolor(76, 0.82, 0.99, 0.95),
      new Recolor(142, 0.86, 1.01, 0.96),
      new Recolor(196, 0.8, 1.03, 0.94),
      new Recolor(248, 0.84, 0.98, 0.96),
      new Recolor(310, 0.88, 1.02, 0.95));

  private ShinyVoteFilters() {}

  /** Paleta del señuelo {@code index} sobre la tabla barajada de la ronda ({@code palettes}), con vuelta al principio. */
  public static Recolor fakeShinyPalette(List<Recolor> palettes, int index) {
    return palettes.get(index % palettes.size());
  }

  /** Consume un {@code random()}. */
  public static boolean useShinySpriteForFake(DoubleSupplier random) {
    return random.getAsDouble() < FAKE_SHINY_SPRITE_PROBABILITY;
  }
}
