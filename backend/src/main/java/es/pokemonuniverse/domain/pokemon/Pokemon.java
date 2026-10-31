package es.pokemonuniverse.domain.pokemon;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;

/**
 * Pokémon del catálogo ({@code Pokemon} de {@code pokemon/types.ts}). {@code palette}/{@code paletteWeights} son
 * internos de los motores (los calcula el data-sync): {@code /api/pokemon} responde con {@code PublicPokemon}, que no
 * los incluye. Los null se omiten del JSON.
 */
@Serdeable
public record Pokemon(
    String id,
    int nationalDexNumber,
    String name,
    int generation,
    boolean isDefault,
    String sprite,
    String shinySprite,
    @Nullable List<String> palette,
    @Nullable List<Double> paletteWeights,
    int hp,
    int attack,
    int defense,
    int specialAttack,
    int specialDefense,
    int speed,
    int baseStatTotal,
    int heightDecimeters,
    int weightHectograms,
    Integer evolutionStage,
    Integer evolutionStageCount,
    String legendaryStatus,
    String color,
    List<String> abilities,
    Map<String, Object> names,
    List<String> types) {

  public Pokemon {
    palette = palette == null ? null : List.copyOf(palette);
    paletteWeights = paletteWeights == null ? null : List.copyOf(paletteWeights);
  }

  /** Copia con otra paleta ({@code { ...pokemon, palette, paletteWeights }}). */
  public Pokemon withPalette(@Nullable List<String> colors, @Nullable List<Double> weights) {
    return new Pokemon(id, nationalDexNumber, name, generation, isDefault, sprite, shinySprite, colors, weights, hp,
        attack, defense, specialAttack, specialDefense, speed, baseStatTotal, heightDecimeters, weightHectograms,
        evolutionStage, evolutionStageCount, legendaryStatus, color, abilities, names, types);
  }
}
