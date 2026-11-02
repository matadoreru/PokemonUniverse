package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import es.pokemonuniverse.domain.pokemon.Pokemon;

/**
 * Traducción literal de {@code pokemon-bingo/rules.ts}. Las reglas de condición que el motor TS reexporta de
 * {@code pokemon/conditions/rules.ts} están en {@code domain/pokemon/conditions/ConditionRules}.
 */
public final class PokemonBingoRules {

  private PokemonBingoRules() {}

  /**
   * {@code hasCompleteBingoMetadata}: cada familia activa exige su dato ({@code Boolean(...)} de JS: un texto vacío o
   * un {@code 0} cuentan como ausentes).
   */
  public static boolean hasCompleteBingoMetadata(Pokemon pokemon, PokemonBingoConfig config) {
    return (!config.family("height") || pokemon.heightDecimeters() > 0)
        && (!config.family("weight") || pokemon.weightHectograms() > 0)
        && (!config.family("evolutionStage") || (nonZero(pokemon.evolutionStage())
            && nonZero(pokemon.evolutionStageCount())))
        && (!config.family("legendaryStatus") || nonEmpty(pokemon.legendaryStatus()))
        && (!config.family("color") || (nonEmpty(pokemon.color()) && !pokemon.color().equals("unknown")))
        && (!config.family("abilities") || (pokemon.abilities() != null && !pokemon.abilities().isEmpty()));
  }

  private static boolean nonZero(Integer value) {
    return value != null && value != 0;
  }

  private static boolean nonEmpty(String value) {
    return value != null && !value.isEmpty();
  }
}
