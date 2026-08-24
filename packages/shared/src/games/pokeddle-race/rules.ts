import type { Pokemon } from '../../pokemon/types.js';
import { activePokeddleClues, type PokeddleRaceConfig } from './config.js';
import type { PokeddleFeedback, PokeddleNumericComparison, PokeddleTypeComparison } from './types.js';

export function comparePokeddleNumber(guess: number, secret: number): PokeddleNumericComparison {
  return secret > guess ? 'HIGHER' : secret < guess ? 'LOWER' : 'MATCH';
}

export function comparePokeddleTypes(guess: readonly string[], secret: readonly string[]): PokeddleTypeComparison {
  const guessed = new Set(guess); const target = new Set(secret);
  if (guessed.size === target.size && [...guessed].every((type) => target.has(type))) return 'EXACT';
  return [...guessed].some((type) => target.has(type)) ? 'PARTIAL' : 'NONE';
}

function numeric(value: number, secret: number) { return { kind: 'NUMERIC' as const, value, result: comparePokeddleNumber(value, secret) }; }

export function buildPokeddleFeedback(guess: Pokemon, secret: Pokemon, config: PokeddleRaceConfig): PokeddleFeedback {
  const enabled = new Set(activePokeddleClues(config)); const feedback: PokeddleFeedback = {};
  if (enabled.has('generation')) feedback.generation = numeric(guess.generation, secret.generation);
  if (enabled.has('dexNumber')) feedback.dexNumber = numeric(guess.nationalDexNumber, secret.nationalDexNumber);
  if (enabled.has('types')) feedback.types = { kind: 'TYPES', value: [...guess.types], result: comparePokeddleTypes(guess.types, secret.types) };
  if (enabled.has('typeCount')) feedback.typeCount = numeric(guess.types.length, secret.types.length);
  if (enabled.has('hp')) feedback.hp = numeric(guess.hp, secret.hp);
  if (enabled.has('attack')) feedback.attack = numeric(guess.attack, secret.attack);
  if (enabled.has('defense')) feedback.defense = numeric(guess.defense, secret.defense);
  if (enabled.has('specialAttack')) feedback.specialAttack = numeric(guess.specialAttack, secret.specialAttack);
  if (enabled.has('specialDefense')) feedback.specialDefense = numeric(guess.specialDefense, secret.specialDefense);
  if (enabled.has('speed')) feedback.speed = numeric(guess.speed, secret.speed);
  if (enabled.has('baseStatTotal')) feedback.baseStatTotal = numeric(guess.baseStatTotal, secret.baseStatTotal);
  if (enabled.has('height')) feedback.height = numeric(guess.heightDecimeters ?? 0, secret.heightDecimeters ?? 0);
  if (enabled.has('weight')) feedback.weight = numeric(guess.weightHectograms ?? 0, secret.weightHectograms ?? 0);
  if (enabled.has('evolutionStage')) feedback.evolutionStage = {
    kind: 'EVOLUTION',
    value: { stage: guess.evolutionStage ?? 1, stages: guess.evolutionStageCount ?? 1 },
    result: comparePokeddleNumber(guess.evolutionStage ?? 1, secret.evolutionStage ?? 1),
  };
  if (enabled.has('legendaryStatus')) feedback.legendaryStatus = { kind: 'CATEGORY', value: guess.legendaryStatus ?? 'NORMAL', result: (guess.legendaryStatus ?? 'NORMAL') === (secret.legendaryStatus ?? 'NORMAL') ? 'MATCH' : 'NONE' };
  if (enabled.has('color')) feedback.color = { kind: 'CATEGORY', value: guess.color ?? 'unknown', result: guess.color === secret.color ? 'MATCH' : 'NONE' };
  if (enabled.has('abilities')) {
    const target = new Set(secret.abilities ?? []); const matches = (guess.abilities ?? []).filter((ability) => target.has(ability)).length;
    feedback.abilities = { kind: 'ABILITIES', value: [...(guess.abilities ?? [])], result: matches ? 'PARTIAL' : 'NONE', matches };
  }
  return feedback;
}

export function hasCompletePokeddleMetadata(pokemon: Pokemon, config: PokeddleRaceConfig): boolean {
  const clues = config.clues;
  return (!clues.height || (pokemon.heightDecimeters ?? 0) > 0)
    && (!clues.weight || (pokemon.weightHectograms ?? 0) > 0)
    && (!clues.evolutionStage || Boolean(pokemon.evolutionStage && pokemon.evolutionStageCount))
    && (!clues.legendaryStatus || Boolean(pokemon.legendaryStatus))
    && (!clues.color || Boolean(pokemon.color && pokemon.color !== 'unknown'))
    && (!clues.abilities || Boolean(pokemon.abilities?.length));
}

/** Fisher-Yates makes allocation deterministic for a supplied GameContext random source. */
export function shufflePokeddlePool<T>(source: readonly T[], random: () => number): T[] {
  const result = [...source];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

