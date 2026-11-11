package es.pokemonuniverse.domain.game.engine.infra;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.serde.annotation.Serdeable;

/** {@code { id, name, sprite }}: el Pokémon de un intento ({@code guessedPokemon}) o de un acierto. */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record GuessPokemonSummary(String id, String name, String sprite) {

  public static GuessPokemonSummary of(Pokemon pokemon) {
    return new GuessPokemonSummary(pokemon.id(), pokemon.name(), pokemon.sprite());
  }
}
