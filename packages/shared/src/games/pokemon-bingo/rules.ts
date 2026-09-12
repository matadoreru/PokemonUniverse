import type { Pokemon } from '../../pokemon/types.js';
import type { PokemonBingoConfig } from './config.js';
export * from '../../pokemon/conditions/rules.js';

export function hasCompleteBingoMetadata(pokemon: Pokemon, config: PokemonBingoConfig): boolean {
  const families = config.families;
  return (!families.height || (pokemon.heightDecimeters ?? 0) > 0)
    && (!families.weight || (pokemon.weightHectograms ?? 0) > 0)
    && (!families.evolutionStage || Boolean(pokemon.evolutionStage && pokemon.evolutionStageCount))
    && (!families.legendaryStatus || Boolean(pokemon.legendaryStatus))
    && (!families.color || Boolean(pokemon.color && pokemon.color !== 'unknown'))
    && (!families.abilities || Boolean(pokemon.abilities?.length));
}

