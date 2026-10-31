package es.pokemonuniverse.adapters.in.rest.pokemon;

import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;

// La paleta es un dato interno de los motores (pokemon-palette-guess). El Javadoc es la descripción del esquema
// OpenAPI, que conserva el nombre Pokemon y el texto que tenía cuando /api/pokemon devolvía el record del dominio.
/** Pokémon público del catálogo; sin {@code palette}/{@code paletteWeights}. Los null se omiten del JSON. */
@Serdeable
@Schema(name = "Pokemon")
public record PublicPokemon(
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
    List<String> types) {

  static PublicPokemon from(Pokemon pokemon) {
    return new PublicPokemon(pokemon.id(), pokemon.nationalDexNumber(), pokemon.name(), pokemon.generation(),
        pokemon.isDefault(), pokemon.sprite(), pokemon.shinySprite(), pokemon.hp(), pokemon.attack(),
        pokemon.defense(), pokemon.specialAttack(), pokemon.specialDefense(), pokemon.speed(),
        pokemon.baseStatTotal(), pokemon.heightDecimeters(), pokemon.weightHectograms(), pokemon.evolutionStage(),
        pokemon.evolutionStageCount(), pokemon.legendaryStatus(), pokemon.color(), pokemon.abilities(),
        pokemon.names(), pokemon.types());
  }
}
