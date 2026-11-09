import {
  absurdPokedexConfigSchema,
  defaultAbsurdPokedexConfig,
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
import { AbsurdPokedexConfigPanel } from './absurd-pokedex/ConfigPanel';
import { HigherLowerConfigPanel } from './higher-lower/ConfigPanel';
import { LearnsetGuessConfigPanel } from './learnset-guess/ConfigPanel';
import { PokedexDistanceConfigPanel } from './pokedex-distance/ConfigPanel';
import { PokemonImpostorConfigPanel } from './pokemon-impostor/ConfigPanel';
import { ShinyVoteConfigPanel } from './shiny-vote/ConfigPanel';
import { TypeDuelConfigPanel } from './type-duel/ConfigPanel';

type Panel = ComponentType<{ config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }>;
interface NumericField { minValue: number | null; maxValue: number | null }
interface Range { min: number; max: number }

/** Reads every `<input type="range">` of the static markup, keyed by its accessible label. */
function renderRanges(Panel: Panel, config: unknown): Map<string, Range> {
  const markup = renderToStaticMarkup(createElement(Panel, { config, disabled: false, onChange: async () => {} }));
  const ranges = new Map<string, Range>();
  for (const [input] of markup.matchAll(/<input[^>]*type="range"[^>]*>/g)) {
    const attribute = (name: string) => input.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    // El deslizador del catálogo se nombra con su <label for>; se admite también aria-label.
    const id = attribute('id');
    const label = attribute('aria-label') ?? (id ? markup.match(new RegExp(`<label for="${id}"[^>]*>([^<]*)</label>`))?.[1] : undefined);
    if (label) ranges.set(label, { min: Number(attribute('min')), max: Number(attribute('max')) });
  }
  return ranges;
}

/** Each slider label with the schema field it edits. */
const panels: { game: string; Panel: Panel; config: unknown; shape: Record<string, unknown>; fields: Record<string, string> }[] = [
  { game: 'higher-lower', Panel: HigherLowerConfigPanel, config: defaultHigherLowerConfig, shape: higherLowerConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  { game: 'type-duel', Panel: TypeDuelConfigPanel, config: defaultTypeDuelConfig, shape: typeDuelConfigSchema.shape, fields: { 'Tiempo para elegir tipo': 'typeSelectSeconds', 'Tiempo para buscar': 'searchSeconds', 'Número de rondas': 'rounds' } },
  { game: 'shiny-vote', Panel: ShinyVoteConfigPanel, config: defaultShinyVoteConfig, shape: shinyVoteConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds', 'Duración de la revelación': 'revealSeconds' } },
  { game: 'pokemon-impostor', Panel: PokemonImpostorConfigPanel, config: defaultPokemonImpostorConfig, shape: pokemonImpostorConfigSchema.shape, fields: { Impostores: 'impostorCount', 'Tiempo por pista': 'clueSeconds', 'Tiempo de votación': 'voteSeconds' } },
  { game: 'pokedex-distance', Panel: PokedexDistanceConfigPanel, config: defaultPokedexDistanceConfig, shape: pokedexDistanceConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds' } },
  { game: 'learnset-guess', Panel: LearnsetGuessConfigPanel, config: defaultLearnsetGuessConfig, shape: learnsetGuessConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  { game: 'absurd-pokedex', Panel: AbsurdPokedexConfigPanel, config: defaultAbsurdPokedexConfig, shape: absurdPokedexConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo para escribir': 'writeSeconds', 'Tiempo para votar': 'voteSeconds' } },
  // Los ajustes propios de un modo solo salen en ese modo; los que el modo no usa se ocultan.
  { game: 'pokedex-distance POINTS', Panel: PokedexDistanceConfigPanel, config: { ...defaultPokedexDistanceConfig, mode: 'POINTS' }, shape: pokedexDistanceConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'pointsRounds' } },
  { game: 'type-duel COOP', Panel: TypeDuelConfigPanel, config: { ...defaultTypeDuelConfig, mode: 'COOP' }, shape: typeDuelConfigSchema.shape, fields: { 'Tiempo de búsqueda conjunta': 'coopSeconds', 'Número de rondas': 'rounds' } },
  { game: 'higher-lower ENDLESS', Panel: HigherLowerConfigPanel, config: { ...defaultHigherLowerConfig, mode: 'ENDLESS' }, shape: higherLowerConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds' } },
];

/** El campo numérico del esquema, sin el `.default()` de los ajustes que una configuración guardada puede no traer. */
const numericField = (field: unknown): NumericField => {
  const unwrap = (field as { unwrap?: () => unknown }).unwrap;
  return (typeof unwrap === 'function' ? unwrap.call(field) : field) as NumericField;
};

describe('config panel ranges', () => {
  it('widens rounds to 50 in Higher or Lower, Type Duel and Shiny Quiz', () => {
    const roundPanels: [Panel, unknown][] = [[HigherLowerConfigPanel, defaultHigherLowerConfig], [TypeDuelConfigPanel, defaultTypeDuelConfig], [ShinyVoteConfigPanel, defaultShinyVoteConfig]];
    for (const [Panel, config] of roundPanels) {
      expect(renderRanges(Panel, config).get('Número de rondas')).toEqual({ min: 1, max: 50 });
    }
  });

  it('Type Duel COOP explains that each round is one combination for the whole group', () => {
    const render = (config: unknown) => renderToStaticMarkup(createElement(TypeDuelConfigPanel, { config, disabled: false, onChange: async () => undefined }));
    const coop = render({ ...defaultTypeDuelConfig, mode: 'COOP' });
    expect(coop).toContain('Cada ronda, una combinación de tipos nueva para todo el grupo.');
    expect(coop).toContain('Lo que dura cada ronda');
    expect(render(defaultTypeDuelConfig)).not.toContain('Cada ronda, una combinación');
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
      const schema = numericField(shape[field]);
      expect({ label, ...ranges.get(label) }).toEqual({ label, min: schema.minValue, max: schema.maxValue });
    }
  });
});
