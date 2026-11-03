import {
  defaultHigherLowerConfig,
  defaultLearnsetGuessConfig,
  defaultPokedexDistanceConfig,
  defaultPokemonImpostorConfig,
  defaultShinyVoteConfig,
  defaultTypeDuelConfig,
  higherLowerConfigSchema,
  learnsetGuessConfigSchema,
  pokedexDistanceConfigSchema,
  pokemonImpostorConfigSchema,
  shinyVoteConfigSchema,
  typeDuelConfigSchema,
} from '@pokemon-universe/shared/public';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HigherLowerConfigPanel } from './higher-lower/ConfigPanel';
import { LearnsetGuessConfigPanel } from './learnset-guess/ConfigPanel';
import { PokedexDistanceConfigPanel } from './pokedex-distance/ConfigPanel';
import { PokemonImpostorConfigPanel } from './pokemon-impostor/ConfigPanel';
import { ShinyVoteConfigPanel } from './shiny-vote/ConfigPanel';
import { TypeDuelConfigPanel } from './type-duel/ConfigPanel';

type Panel = ComponentType<{ config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }>;
interface NumericField { minValue: number | null; maxValue: number | null }
interface Range { min: number; max: number }

/** Reads every `<input type="range">` of the static markup, keyed by its aria-label. */
function renderRanges(Panel: Panel, config: unknown): Map<string, Range> {
  const markup = renderToStaticMarkup(createElement(Panel, { config, disabled: false, onChange: async () => {} }));
  const ranges = new Map<string, Range>();
  for (const [input] of markup.matchAll(/<input[^>]*type="range"[^>]*>/g)) {
    const attribute = (name: string) => input.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    const label = attribute('aria-label');
    if (label) ranges.set(label, { min: Number(attribute('min')), max: Number(attribute('max')) });
  }
  return ranges;
}

/** Each slider label with the schema field it edits. */
const panels: { game: string; Panel: Panel; config: unknown; shape: Record<string, unknown>; fields: Record<string, string> }[] = [
  { game: 'higher-lower', Panel: HigherLowerConfigPanel, config: defaultHigherLowerConfig, shape: higherLowerConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  { game: 'type-duel', Panel: TypeDuelConfigPanel, config: defaultTypeDuelConfig, shape: typeDuelConfigSchema.shape, fields: { 'Tiempo para elegir tipo': 'typeSelectSeconds', 'Tiempo para buscar': 'searchSeconds', 'Número de rondas': 'rounds' } },
  { game: 'shiny-vote', Panel: ShinyVoteConfigPanel, config: defaultShinyVoteConfig, shape: shinyVoteConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  { game: 'pokemon-impostor', Panel: PokemonImpostorConfigPanel, config: defaultPokemonImpostorConfig, shape: pokemonImpostorConfigSchema.shape, fields: { Impostores: 'impostorCount', 'Tiempo por pista': 'clueSeconds', 'Tiempo de votación': 'voteSeconds' } },
  { game: 'pokedex-distance', Panel: PokedexDistanceConfigPanel, config: defaultPokedexDistanceConfig, shape: pokedexDistanceConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds' } },
  { game: 'learnset-guess', Panel: LearnsetGuessConfigPanel, config: defaultLearnsetGuessConfig, shape: learnsetGuessConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
];

describe('config panel ranges', () => {
  it('widens rounds to 50 in Higher or Lower, Type Duel and Shiny Quiz', () => {
    const roundPanels: [Panel, unknown][] = [[HigherLowerConfigPanel, defaultHigherLowerConfig], [TypeDuelConfigPanel, defaultTypeDuelConfig], [ShinyVoteConfigPanel, defaultShinyVoteConfig]];
    for (const [Panel, config] of roundPanels) {
      expect(renderRanges(Panel, config).get('Número de rondas')).toEqual({ min: 1, max: 50 });
    }
  });

  it('offers 1–10 impostors and up to 120 seconds per clue in Impostor', () => {
    const ranges = renderRanges(PokemonImpostorConfigPanel, defaultPokemonImpostorConfig);
    expect(ranges.get('Impostores')).toEqual({ min: 1, max: 10 });
    expect(ranges.get('Tiempo por pista')).toEqual({ min: 10, max: 120 });
  });

  it.each(panels)('$game: every slider matches the bounds of its Zod field', ({ Panel, config, shape, fields }) => {
    const ranges = renderRanges(Panel, config);
    expect([...ranges.keys()].sort()).toEqual(Object.keys(fields).sort());
    for (const [label, field] of Object.entries(fields)) {
      const schema = shape[field] as NumericField;
      expect({ label, ...ranges.get(label) }).toEqual({ label, min: schema.minValue, max: schema.maxValue });
    }
  });
});
