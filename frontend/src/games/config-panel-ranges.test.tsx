import {
  absurdPokedexConfigSchema,
  defaultAbsurdPokedexConfig,
  defaultGuessFromStatsConfig,
  defaultHigherLowerConfig,
  defaultLearnsetGuessConfig,
  defaultMostLikelyToConfig,
  defaultOneOfUsIsFakeConfig,
  defaultPokeddleRaceConfig,
  defaultPokedexDistanceConfig,
  defaultPokedexEntryGuessConfig,
  defaultPokemonBingoConfig,
  defaultPokemonBluffAuctionConfig,
  defaultPokemonConnectionsConfig,
  defaultPokemonCryQuizConfig,
  defaultPokemonImpostorConfig,
  defaultPokemonPaletteGuessConfig,
  defaultPokemonRedFlagConfig,
  defaultPokemonTeamAuctionConfig,
  defaultPokemonTriviaConfig,
  defaultPokeTabooConfig,
  defaultSecretRankingConfig,
  defaultShinyVoteConfig,
  defaultSketchmonConfig,
  defaultTcgHigherLowerConfig,
  defaultTypeChainConfig,
  defaultTypeDuelConfig,
  defaultUnownTranslatorConfig,
  gameModeCatalog,
  defaultOddOneOutConfig,
  defaultWhoAmIConfig,
  defaultWhoIsWhoPokemonConfig,
  defaultWhosThatPokemonConfig,
  defaultWouldYouRatherConfig,
  defaultZoomedPokemonConfig,
  guessFromStatsConfigSchema,
  higherLowerConfigSchema,
  learnsetGuessConfigSchema,
  mostLikelyToConfigSchema,
  oneOfUsIsFakeConfigSchema,
  pokeddleRaceConfigSchema,
  pokedexDistanceConfigSchema,
  pokedexEntryGuessConfigSchema,
  pokemonBingoConfigSchema,
  pokemonBluffAuctionConfigSchema,
  pokemonConnectionsConfigSchema,
  pokemonCryQuizConfigSchema,
  pokemonImpostorConfigSchema,
  pokemonPaletteGuessConfigSchema,
  pokemonRedFlagConfigSchema,
  pokemonTeamAuctionConfigSchema,
  pokemonTriviaConfigSchema,
  pokeTabooConfigSchema,
  secretRankingConfigSchema,
  oddOneOutConfigSchema,
  shinyVoteConfigSchema,
  sketchmonConfigSchema,
  tcgHigherLowerConfigSchema,
  typeChainConfigSchema,
  typeDuelConfigSchema,
  unownTranslatorConfigSchema,
  whoAmIConfigSchema,
  whoIsWhoPokemonConfigSchema,
  whosThatPokemonConfigSchema,
  wouldYouRatherConfigSchema,
  zoomedPokemonConfigSchema,
  type RoomView,
} from '@pokemon-universe/shared/public';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AbsurdPokedexConfigPanel } from './absurd-pokedex/ConfigPanel';
import { GuessFromStatsConfigPanel } from './guess-from-stats/ConfigPanel';
import { HigherLowerConfigPanel } from './higher-lower/ConfigPanel';
import { LearnsetGuessConfigPanel } from './learnset-guess/ConfigPanel';
import { MostLikelyToConfigPanel } from './most-likely-to/ConfigPanel';
import { OneOfUsIsFakeConfigPanel } from './one-of-us-is-fake/ConfigPanel';
import { PokeTabooConfigPanel } from './poke-taboo/ConfigPanel';
import { PokeddleRaceConfigPanel } from './pokeddle-race/ConfigPanel';
import { PokedexDistanceConfigPanel } from './pokedex-distance/ConfigPanel';
import { PokedexEntryGuessConfigPanel } from './pokedex-entry-guess/ConfigPanel';
import { PokemonBingoConfigPanel } from './pokemon-bingo/ConfigPanel';
import { PokemonBluffAuctionConfigPanel } from './pokemon-bluff-auction/ConfigPanel';
import { PokemonConnectionsConfigPanel } from './pokemon-connections/ConfigPanel';
import { PokemonCryQuizConfigPanel } from './pokemon-cry-quiz/ConfigPanel';
import { PokemonImpostorConfigPanel } from './pokemon-impostor/ConfigPanel';
import { PokemonPaletteGuessConfigPanel } from './pokemon-palette-guess/ConfigPanel';
import { PokemonRedFlagConfigPanel } from './pokemon-red-flag/ConfigPanel';
import { PokemonTeamAuctionConfigPanel } from './pokemon-team-auction/ConfigPanel';
import { PokemonTriviaConfigPanel } from './pokemon-trivia/ConfigPanel';
import { SecretRankingConfigPanel } from './secret-ranking/ConfigPanel';
import { ShinyVoteConfigPanel } from './shiny-vote/ConfigPanel';
import { SketchmonConfigPanel } from './sketchmon/ConfigPanel';
import { TcgHigherLowerConfigPanel } from './tcg-higher-lower/ConfigPanel';
import { TypeChainConfigPanel } from './type-chain/ConfigPanel';
import { TypeDuelConfigPanel } from './type-duel/ConfigPanel';
import { UnownTranslatorConfigPanel } from './unown-translator/ConfigPanel';
import { OddOneOutConfigPanel } from './odd-one-out/ConfigPanel';
import { WhoAmIConfigPanel } from './who-am-i/ConfigPanel';
import { WhoIsWhoPokemonConfigPanel } from './who-is-who-pokemon/ConfigPanel';
import { WhosThatPokemonConfigPanel } from './whos-that-pokemon/ConfigPanel';
import { WouldYouRatherConfigPanel } from './would-you-rather/ConfigPanel';
import { ZoomedPokemonConfigPanel } from './zoomed-pokemon/ConfigPanel';
import { roomView } from '../room/test-support/room-view';
import { applyPace, PACE_IDS, pacePresetsOf } from './common/pace-presets';

// Los paneles de preguntas propias leen la sesión: un invitado no ve el gestor, que pediría datos a la API.
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { kind: 'GUEST' } }) }));

type Panel = ComponentType<{ config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }>;
/** Sala mínima: quien mira no es el anfitrión. */
const room = roomView({ hostId: 'host' });
interface NumericField { minValue: number | null; maxValue: number | null }
interface Range { min: number; max: number }

/** Reads every `<input type="range">` of the static markup, keyed by its accessible label. */
function renderRanges(Panel: Panel, config: unknown): Map<string, Range> {
  const markup = renderToStaticMarkup(createElement(Panel, { config, disabled: false, room, selfId: 'guest', onChange: async () => {} }));
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

/**
 * Todos los paneles de configuración, con cada deslizador (en cualquier modo) y el campo del esquema que edita. Sus
 * límites tienen que ser los del campo Zod, que son los que acepta Java (`config-cases.test.ts`).
 */
const panels: Record<string, { Panel: Panel; config: object; shape: Record<string, unknown>; fields: Record<string, string> }> = {
  'absurd-pokedex': { Panel: AbsurdPokedexConfigPanel, config: defaultAbsurdPokedexConfig, shape: absurdPokedexConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo para escribir': 'writeSeconds', 'Tiempo para votar': 'voteSeconds' } },
  'guess-from-stats': { Panel: GuessFromStatsConfigPanel, config: defaultGuessFromStatsConfig, shape: guessFromStatsConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  'higher-lower': { Panel: HigherLowerConfigPanel, config: defaultHigherLowerConfig, shape: higherLowerConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  'learnset-guess': { Panel: LearnsetGuessConfigPanel, config: defaultLearnsetGuessConfig, shape: learnsetGuessConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  'most-likely-to': { Panel: MostLikelyToConfigPanel, config: defaultMostLikelyToConfig, shape: mostLikelyToConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo para responder': 'selectionSeconds', 'Tiempo para votar': 'votingSeconds' } },
  'one-of-us-is-fake': { Panel: OneOfUsIsFakeConfigPanel, config: defaultOneOfUsIsFakeConfig, shape: oneOfUsIsFakeConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo para elegir': 'selectionSeconds', 'Tiempo de debate y voto': 'discussionSeconds' } },
  'poke-taboo': { Panel: PokeTabooConfigPanel, config: defaultPokeTabooConfig, shape: pokeTabooConfigSchema.shape, fields: { 'Vueltas': 'laps' } },
  'pokeddle-race': { Panel: PokeddleRaceConfigPanel, config: defaultPokeddleRaceConfig, shape: pokeddleRaceConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Máximo de rondas': 'maxRounds' } },
  'pokedex-distance': { Panel: PokedexDistanceConfigPanel, config: defaultPokedexDistanceConfig, shape: pokedexDistanceConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'pointsRounds' } },
  'pokedex-entry-guess': { Panel: PokedexEntryGuessConfigPanel, config: defaultPokedexEntryGuessConfig, shape: pokedexEntryGuessConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  'pokemon-bingo': { Panel: PokemonBingoConfigPanel, config: defaultPokemonBingoConfig, shape: pokemonBingoConfigSchema.shape, fields: { 'Tiempo total': 'durationSeconds' } },
  'pokemon-bluff-auction': { Panel: PokemonBluffAuctionConfigPanel, config: defaultPokemonBluffAuctionConfig, shape: pokemonBluffAuctionConfigSchema.shape, fields: { 'Tiempo por puja': 'bidSeconds' } },
  'pokemon-connections': { Panel: PokemonConnectionsConfigPanel, config: defaultPokemonConnectionsConfig, shape: pokemonConnectionsConfigSchema.shape, fields: { 'Errores permitidos': 'mistakesAllowed', 'Tiempo por puzle': 'roundSeconds', 'Número de puzles': 'rounds' } },
  'pokemon-cry-quiz': { Panel: PokemonCryQuizConfigPanel, config: defaultPokemonCryQuizConfig, shape: pokemonCryQuizConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  'pokemon-impostor': { Panel: PokemonImpostorConfigPanel, config: defaultPokemonImpostorConfig, shape: pokemonImpostorConfigSchema.shape, fields: { 'Impostores': 'impostorCount', 'Tiempo por pista': 'clueSeconds', 'Tiempo de votación': 'voteSeconds' } },
  'pokemon-palette-guess': { Panel: PokemonPaletteGuessConfigPanel, config: defaultPokemonPaletteGuessConfig, shape: pokemonPaletteGuessConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  'pokemon-red-flag': { Panel: PokemonRedFlagConfigPanel, config: defaultPokemonRedFlagConfig, shape: pokemonRedFlagConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo por fase': 'phaseSeconds' } },
  'pokemon-team-auction': { Panel: PokemonTeamAuctionConfigPanel, config: defaultPokemonTeamAuctionConfig, shape: pokemonTeamAuctionConfigSchema.shape, fields: { 'Tiempo por turno': 'bidSeconds' } },
  'pokemon-trivia': { Panel: PokemonTriviaConfigPanel, config: defaultPokemonTriviaConfig, shape: pokemonTriviaConfigSchema.shape, fields: { 'Tiempo por pregunta': 'roundSeconds', 'Número de preguntas': 'rounds' } },
  'secret-ranking': { Panel: SecretRankingConfigPanel, config: defaultSecretRankingConfig, shape: secretRankingConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo para ordenar': 'roundSeconds' } },
  'shiny-vote': { Panel: ShinyVoteConfigPanel, config: defaultShinyVoteConfig, shape: shinyVoteConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds', 'Duración de la revelación': 'revealSeconds' } },
  'sketchmon': { Panel: SketchmonConfigPanel, config: defaultSketchmonConfig, shape: sketchmonConfigSchema.shape, fields: { 'Vueltas': 'laps' } },
  'tcg-higher-lower': { Panel: TcgHigherLowerConfigPanel, config: defaultTcgHigherLowerConfig, shape: tcgHigherLowerConfigSchema.shape, fields: { 'Tiempo por comparación': 'roundSeconds', 'Número de rondas': 'rounds' } },
  'type-chain': { Panel: TypeChainConfigPanel, config: defaultTypeChainConfig, shape: typeChainConfigSchema.shape, fields: {} },
  'type-duel': { Panel: TypeDuelConfigPanel, config: defaultTypeDuelConfig, shape: typeDuelConfigSchema.shape, fields: { 'Tiempo para elegir tipo': 'typeSelectSeconds', 'Tiempo para buscar': 'searchSeconds', 'Tiempo de búsqueda conjunta': 'coopSeconds', 'Número de rondas': 'rounds' } },
  'unown-translator': { Panel: UnownTranslatorConfigPanel, config: defaultUnownTranslatorConfig, shape: unownTranslatorConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo por ronda': 'roundSeconds', 'Tiempo entre letras': 'hintSeconds' } },
  'odd-one-out': { Panel: OddOneOutConfigPanel, config: defaultOddOneOutConfig, shape: oddOneOutConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo por ronda': 'roundSeconds' } },
  'who-am-i': { Panel: WhoAmIConfigPanel, config: defaultWhoAmIConfig, shape: whoAmIConfigSchema.shape, fields: { 'Número de vueltas': 'maxLaps', 'Tiempo para preguntar': 'askSeconds', 'Tiempo para responder': 'answerSeconds' } },
  'who-is-who-pokemon': { Panel: WhoIsWhoPokemonConfigPanel, config: defaultWhoIsWhoPokemonConfig, shape: whoIsWhoPokemonConfigSchema.shape, fields: { 'Pokémon en el tablero': 'boardSize', 'Tiempo para elegir secreto': 'selectionSeconds' } },
  'whos-that-pokemon': { Panel: WhosThatPokemonConfigPanel, config: defaultWhosThatPokemonConfig, shape: whosThatPokemonConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
  'would-you-rather': { Panel: WouldYouRatherConfigPanel, config: defaultWouldYouRatherConfig, shape: wouldYouRatherConfigSchema.shape, fields: { 'Número de rondas': 'rounds', 'Tiempo para votar y predecir': 'roundSeconds' } },
  'zoomed-pokemon': { Panel: ZoomedPokemonConfigPanel, config: defaultZoomedPokemonConfig, shape: zoomedPokemonConfigSchema.shape, fields: { 'Tiempo por ronda': 'roundSeconds', 'Número de rondas': 'rounds' } },
};

/** Los ajustes propios de un modo solo salen en ese modo; los que el modo no usa se ocultan. */
const modeSliders: { game: string; mode: string; labels: string[] }[] = [
  { game: 'pokedex-distance', mode: 'CLASSIC', labels: ['Tiempo por ronda'] },
  { game: 'pokedex-distance', mode: 'POINTS', labels: ['Tiempo por ronda', 'Número de rondas'] },
  { game: 'type-duel', mode: 'COOP', labels: ['Tiempo de búsqueda conjunta', 'Número de rondas'] },
  { game: 'higher-lower', mode: 'ENDLESS', labels: ['Tiempo por ronda'] },
];

/** La configuración por defecto de `game` en cada uno de sus modos (o sin modo). */
const modeConfigs = (game: string): [string, object][] => {
  const { config } = panels[game]!;
  return (gameModeCatalog(game)?.modes ?? ['—']).map((mode) => [mode, mode === '—' ? config : { ...config, mode }]);
};

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

  it('Traductor Unown: 1–10 rondas, 30–120 s por ronda y 3–15 s entre letras', () => {
    const ranges = renderRanges(UnownTranslatorConfigPanel, defaultUnownTranslatorConfig);
    expect(ranges.get('Número de rondas')).toEqual({ min: 1, max: 10 });
    expect(ranges.get('Tiempo por ronda')).toEqual({ min: 30, max: 120 });
    expect(ranges.get('Tiempo entre letras')).toEqual({ min: 3, max: 15 });
  });

  it('¿Quién soy?: 3–20 vueltas, 20–90 s para preguntar y 10–60 s para responder', () => {
    const ranges = renderRanges(WhoAmIConfigPanel, defaultWhoAmIConfig);
    expect(ranges.get('Número de vueltas')).toEqual({ min: 3, max: 20 });
    expect(ranges.get('Tiempo para preguntar')).toEqual({ min: 20, max: 90 });
    expect(ranges.get('Tiempo para responder')).toEqual({ min: 10, max: 60 });
  });

  it('El Intruso: 3–30 rondas y 10–60 s por ronda', () => {
    const ranges = renderRanges(OddOneOutConfigPanel, defaultOddOneOutConfig);
    expect(ranges.get('Número de rondas')).toEqual({ min: 3, max: 30 });
    expect(ranges.get('Tiempo por ronda')).toEqual({ min: 10, max: 60 });
  });

  it('hay una fila por cada panel de configuración', () => {
    const files = Object.keys(import.meta.glob('./*/ConfigPanel.tsx')).map((path) => path.split('/')[1]).sort();
    expect(Object.keys(panels).sort()).toEqual(files);
  });

  it.each(Object.keys(panels))('%s: cada deslizador, en cada modo, tiene los límites de su campo Zod', (game) => {
    const { Panel, shape, fields } = panels[game]!;
    const seen = new Set<string>();
    for (const [mode, config] of modeConfigs(game)) {
      for (const [label, range] of renderRanges(Panel, config)) {
        seen.add(label);
        const field = fields[label];
        expect(field, `${mode}: «${label}» no está en la tabla`).toBeDefined();
        const schema = numericField(shape[field!]);
        expect({ mode, label, ...range }).toEqual({ mode, label, min: schema.minValue, max: schema.maxValue });
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(fields).sort());
  });

  it.each(modeSliders)('$game $mode: solo salen los deslizadores del modo', ({ game, mode, labels }) => {
    const { Panel, config } = panels[game]!;
    expect([...renderRanges(Panel, { ...config, mode }).keys()].sort()).toEqual([...labels].sort());
  });

  /**
   * Los ritmos de «Ritmo» tienen que caber en los controles del panel, no solo en Zod: cada `Segmented` sigue con una
   * opción marcada y cada deslizador cae en su paso (en cada modo, que enseña sus propios ajustes).
   */
  it.each(Object.keys(panels).filter((game) => pacePresetsOf(game)))('%s: cada ritmo cae en la rejilla del panel', (game) => {
    const { Panel } = panels[game]!;
    const render = (config: unknown) => renderToStaticMarkup(createElement(Panel, { config, disabled: false, room, selfId: 'guest', onChange: async () => {} }));
    const checked = (html: string) => (html.match(/aria-checked="true"/g) ?? []).length;
    for (const [mode, config] of modeConfigs(game)) {
      const base = checked(render(config));
      for (const pace of PACE_IDS) {
        const html = render(applyPace(game, config, pace));
        expect({ mode, pace, checked: checked(html) }).toEqual({ mode, pace, checked: base });
        for (const [input] of html.matchAll(/<input[^>]*type="range"[^>]*>/g)) {
          const attribute = (name: string) => Number(input.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? 1);
          expect({ mode, pace, input, offGrid: (attribute('value') - attribute('min')) % attribute('step') }).toEqual({ mode, pace, input, offGrid: 0 });
        }
      }
    }
  });
});
