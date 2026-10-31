package es.pokemonuniverse.domain.pokemon;

import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;

/** Pokémon público del catálogo; sin {@code palette}/{@code paletteWeights}. Los null se omiten del JSON. */
@Serdeable
public record Pokemon(
    String id,
    int nationalDexNumber,
    String name,
    int generation,
    boolean isDefault,
    String sprite,
    String shinySprite,
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
    List<String> types) {}
