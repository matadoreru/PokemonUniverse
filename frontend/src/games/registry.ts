import { validateGameConfigReadiness, type GameConfigReadinessContext, type RoomView } from '@pokemon-universe/shared/public';
import type { GameActionOptions } from '../room/room-command';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { validateGuessFromStatsConfig } from './guess-from-stats/validation';
import { validateZoomedPokemonConfig } from './zoomed-pokemon/validation';

export interface ActiveGameProps { room: RoomView; selfId: string; onAction(action: unknown, options?: GameActionOptions): Promise<void> }
export interface GameResultsProps { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }
export interface GameConfigProps { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }
export interface MiniGameClientModule {
  id: string;
  ConfigPanel: ComponentType<GameConfigProps>;
  ActiveGame: ComponentType<ActiveGameProps>;
  Results: ComponentType<GameResultsProps>;
  /**
   * El primer motivo por el que la config no deja empezar, o `null`: la comprobación propia de la web del juego (si la
   * tiene, en `webConfigChecks`) y si no la preparación de shared, la misma regla que aplica el servidor. Un juego no
   * tiene las dos: su comprobación propia taparía los mensajes del servidor (lo vigila `registry.test.ts`).
   */
  validateConfig(config: unknown, room?: RoomView): string | null;
  preloadConfig(): Promise<unknown>;
  preloadGameplay(): Promise<unknown>;
}

interface LazyComponentDefinition {
  load(): Promise<Record<string, unknown>>;
  exportName: string;
}

function preloadableComponent<TProps>(definition: LazyComponentDefinition): {
  Component: LazyExoticComponent<ComponentType<TProps>>;
  preload(): Promise<unknown>;
} {
  let pending: Promise<{ default: ComponentType<TProps> }> | null = null;
  const load = () => {
    pending ??= definition.load().then((module) => {
      const Component = module[definition.exportName];
      if (!Component) throw new Error(`Missing client component export: ${definition.exportName}`);
      return { default: Component as ComponentType<TProps> };
    }).catch((error: unknown) => { pending = null; throw error; });
    return pending;
  };
  return { Component: lazy(load), preload: load };
}

/**
 * Lo que la preparación de shared necesita de la sala, contado como el servidor: los jugadores conectados y el
 * contenido personal del host. Sin sala no se comprueba nada que dependa de ellos.
 */
function readinessContext(room: RoomView | undefined): GameConfigReadinessContext {
  if (!room) return {};
  return {
    hostCustomCategoryCount: room.hostCustomCategoryCount ?? 0,
    hostWouldYouRatherPromptCount: room.hostWouldYouRatherPromptCount ?? 0,
    playerCount: room.members.filter((member) => member.presence === 'CONNECTED').length,
  };
}

/** Lo que solo comprueba la web, en juegos sin regla de preparación en el servidor. */
export const webConfigChecks: Readonly<Record<string, (config: unknown) => string | null>> = {
  'guess-from-stats': validateGuessFromStatsConfig,
  'zoomed-pokemon': validateZoomedPokemonConfig,
};

function clientModule(definition: {
  id: string;
  config: LazyComponentDefinition;
  active: LazyComponentDefinition;
  results: LazyComponentDefinition;
}): MiniGameClientModule {
  const webCheck = webConfigChecks[definition.id];
  const config = preloadableComponent<GameConfigProps>(definition.config);
  const active = preloadableComponent<ActiveGameProps>(definition.active);
  const results = preloadableComponent<GameResultsProps>(definition.results);
  return {
    id: definition.id,
    ConfigPanel: config.Component,
    ActiveGame: active.Component,
    Results: results.Component,
    validateConfig: (value, room) => webCheck?.(value) ?? validateGameConfigReadiness(definition.id, value, readinessContext(room)),
    preloadConfig: config.preload,
    preloadGameplay: () => Promise.all([active.preload(), results.preload()]),
  };
}

class ClientGameRegistry {
  private readonly modules = new Map<string, MiniGameClientModule>();
  register(module: MiniGameClientModule): this {
    if (this.modules.has(module.id)) throw new Error(`Duplicate client game id: ${module.id}`);
    this.modules.set(module.id, module);
    return this;
  }
  get(id: string): MiniGameClientModule {
    const module = this.modules.get(id); if (!module) throw new Error(`No client registered for game ${id}`); return module;
  }
  list(): MiniGameClientModule[] { return [...this.modules.values()]; }
}

const component = (load: LazyComponentDefinition['load'], exportName: string): LazyComponentDefinition => ({ load, exportName });

export const clientGameRegistry = new ClientGameRegistry().register(clientModule({
  id: 'pokedex-distance',
  config: component(() => import('./pokedex-distance/ConfigPanel'), 'PokedexDistanceConfigPanel'),
  active: component(() => import('../room/PokedexDistanceGame'), 'PokedexDistanceGame'),
  results: component(() => import('../room/PokedexDistanceResults'), 'PokedexDistanceResults'),
})).register(clientModule({
  id: 'shiny-vote',
  config: component(() => import('./shiny-vote/ConfigPanel'), 'ShinyVoteConfigPanel'),
  active: component(() => import('../room/ShinyVoteGame'), 'ShinyVoteGame'),
  results: component(() => import('../room/ShinyVoteResults'), 'ShinyVoteResults'),
})).register(clientModule({
  id: 'pokemon-impostor',
  config: component(() => import('./pokemon-impostor/ConfigPanel'), 'PokemonImpostorConfigPanel'),
  active: component(() => import('../room/PokemonImpostorGame'), 'PokemonImpostorGame'),
  results: component(() => import('../room/PokemonImpostorResults'), 'PokemonImpostorResults'),
})).register(clientModule({
  id: 'higher-lower',
  config: component(() => import('./higher-lower/ConfigPanel'), 'HigherLowerConfigPanel'),
  active: component(() => import('../room/HigherLowerGame'), 'HigherLowerGame'),
  results: component(() => import('../room/HigherLowerResults'), 'HigherLowerResults'),
})).register(clientModule({
  id: 'type-duel',
  config: component(() => import('./type-duel/ConfigPanel'), 'TypeDuelConfigPanel'),
  active: component(() => import('../room/TypeDuelGame'), 'TypeDuelGame'),
  results: component(() => import('../room/TypeDuelResults'), 'TypeDuelResults'),
})).register(clientModule({
  id: 'learnset-guess',
  config: component(() => import('./learnset-guess/ConfigPanel'), 'LearnsetGuessConfigPanel'),
  active: component(() => import('../room/LearnsetGuessGame'), 'LearnsetGuessGame'),
  results: component(() => import('../room/LearnsetGuessResults'), 'LearnsetGuessResults'),
})).register(clientModule({
  id: 'pokeddle-race',
  config: component(() => import('./pokeddle-race/ConfigPanel'), 'PokeddleRaceConfigPanel'),
  active: component(() => import('../room/PokeddleRaceGame'), 'PokeddleRaceGame'),
  results: component(() => import('../room/PokeddleRaceResults'), 'PokeddleRaceResults'),
})).register(clientModule({
  id: 'pokemon-bingo',
  config: component(() => import('./pokemon-bingo/ConfigPanel'), 'PokemonBingoConfigPanel'),
  active: component(() => import('../room/PokemonBingoGame'), 'PokemonBingoGame'),
  results: component(() => import('../room/PokemonBingoResults'), 'PokemonBingoResults'),
})).register(clientModule({
  id: 'whos-that-pokemon',
  config: component(() => import('./whos-that-pokemon/ConfigPanel'), 'WhosThatPokemonConfigPanel'),
  active: component(() => import('../room/WhosThatPokemonGame'), 'WhosThatPokemonGame'),
  results: component(() => import('../room/WhosThatPokemonResults'), 'WhosThatPokemonResults'),
})).register(clientModule({
  id: 'pokedex-entry-guess',
  config: component(() => import('./pokedex-entry-guess/ConfigPanel'), 'PokedexEntryGuessConfigPanel'),
  active: component(() => import('../room/PokedexEntryGuessGame'), 'PokedexEntryGuessGame'),
  results: component(() => import('../room/PokedexEntryGuessResults'), 'PokedexEntryGuessResults'),
})).register(clientModule({
  id: 'type-chain',
  config: component(() => import('./type-chain/ConfigPanel'), 'TypeChainConfigPanel'),
  active: component(() => import('../room/TypeChainGame'), 'TypeChainGame'),
  results: component(() => import('../room/TypeChainResults'), 'TypeChainResults'),
})).register(clientModule({
  id: 'guess-from-stats',
  config: component(() => import('./guess-from-stats/ConfigPanel'), 'GuessFromStatsConfigPanel'),
  active: component(() => import('../room/GuessFromStatsGame'), 'GuessFromStatsGame'),
  results: component(() => import('../room/GuessFromStatsResults'), 'GuessFromStatsResults'),
})).register(clientModule({
  id: 'zoomed-pokemon',
  config: component(() => import('./zoomed-pokemon/ConfigPanel'), 'ZoomedPokemonConfigPanel'),
  active: component(() => import('../room/ZoomedPokemonGame'), 'ZoomedPokemonGame'),
  results: component(() => import('../room/ZoomedPokemonResults'), 'ZoomedPokemonResults'),
})).register(clientModule({
  id: 'poke-taboo',
  config: component(() => import('./poke-taboo/ConfigPanel'), 'PokeTabooConfigPanel'),
  active: component(() => import('../room/PokeTabooGame'), 'PokeTabooGame'),
  results: component(() => import('../room/PokeTabooResults'), 'PokeTabooResults'),
})).register(clientModule({
  id: 'one-of-us-is-fake',
  config: component(() => import('./one-of-us-is-fake/ConfigPanel'), 'OneOfUsIsFakeConfigPanel'),
  active: component(() => import('../room/OneOfUsIsFakeGame'), 'OneOfUsIsFakeGame'),
  results: component(() => import('../room/OneOfUsIsFakeResults'), 'OneOfUsIsFakeResults'),
})).register(clientModule({
  id: 'pokemon-bluff-auction',
  config: component(() => import('./pokemon-bluff-auction/ConfigPanel'), 'PokemonBluffAuctionConfigPanel'),
  active: component(() => import('../room/PokemonBluffAuctionGame'), 'PokemonBluffAuctionGame'),
  results: component(() => import('../room/PokemonBluffAuctionResults'), 'PokemonBluffAuctionResults'),
})).register(clientModule({
  id: 'sketchmon',
  config: component(() => import('./sketchmon/ConfigPanel'), 'SketchmonConfigPanel'),
  active: component(() => import('../room/SketchmonGame'), 'SketchmonGame'),
  results: component(() => import('../room/SketchmonResults'), 'SketchmonResults'),
})).register(clientModule({
  id: 'pokemon-connections',
  config: component(() => import('./pokemon-connections/ConfigPanel'), 'PokemonConnectionsConfigPanel'),
  active: component(() => import('../room/PokemonConnectionsGame'), 'PokemonConnectionsGame'),
  results: component(() => import('../room/PokemonConnectionsResults'), 'PokemonConnectionsResults'),
})).register(clientModule({
  id: 'pokemon-team-auction',
  config: component(() => import('./pokemon-team-auction/ConfigPanel'), 'PokemonTeamAuctionConfigPanel'),
  active: component(() => import('../room/PokemonTeamAuctionGame'), 'PokemonTeamAuctionGame'),
  results: component(() => import('../room/PokemonTeamAuctionResults'), 'PokemonTeamAuctionResults'),
})).register(clientModule({
  id: 'secret-ranking',
  config: component(() => import('./secret-ranking/ConfigPanel'), 'SecretRankingConfigPanel'),
  active: component(() => import('../room/SecretRankingGame'), 'SecretRankingGame'),
  results: component(() => import('../room/SecretRankingResults'), 'SecretRankingResults'),
})).register(clientModule({
  id: 'most-likely-to',
  config: component(() => import('./most-likely-to/ConfigPanel'), 'MostLikelyToConfigPanel'),
  active: component(() => import('../room/MostLikelyToGame'), 'MostLikelyToGame'),
  results: component(() => import('../room/MostLikelyToResults'), 'MostLikelyToResults'),
})).register(clientModule({
  id: 'would-you-rather',
  config: component(() => import('./would-you-rather/ConfigPanel'), 'WouldYouRatherConfigPanel'),
  active: component(() => import('../room/WouldYouRatherGame'), 'WouldYouRatherGame'),
  results: component(() => import('../room/WouldYouRatherResults'), 'WouldYouRatherResults'),
})).register(clientModule({
  id: 'pokemon-red-flag',
  config: component(() => import('./pokemon-red-flag/ConfigPanel'), 'PokemonRedFlagConfigPanel'),
  active: component(() => import('../room/PokemonRedFlagGame'), 'PokemonRedFlagGame'),
  results: component(() => import('../room/PokemonRedFlagResults'), 'PokemonRedFlagResults'),
})).register(clientModule({
  id: 'tcg-higher-lower',
  config: component(() => import('./tcg-higher-lower/ConfigPanel'), 'TcgHigherLowerConfigPanel'),
  active: component(() => import('../room/TcgHigherLowerGame'), 'TcgHigherLowerGame'),
  results: component(() => import('../room/TcgHigherLowerResults'), 'TcgHigherLowerResults'),
})).register(clientModule({
  id: 'pokemon-cry-quiz',
  config: component(() => import('./pokemon-cry-quiz/ConfigPanel'), 'PokemonCryQuizConfigPanel'),
  active: component(() => import('../room/PokemonCryQuizGame'), 'PokemonCryQuizGame'),
  results: component(() => import('../room/PokemonCryQuizResults'), 'PokemonCryQuizResults'),
})).register(clientModule({
  id: 'pokemon-trivia',
  config: component(() => import('./pokemon-trivia/ConfigPanel'), 'PokemonTriviaConfigPanel'),
  active: component(() => import('../room/PokemonTriviaGame'), 'PokemonTriviaGame'),
  results: component(() => import('../room/PokemonTriviaResults'), 'PokemonTriviaResults'),
})).register(clientModule({
  id: 'pokemon-palette-guess',
  config: component(() => import('./pokemon-palette-guess/ConfigPanel'), 'PokemonPaletteGuessConfigPanel'),
  active: component(() => import('../room/PokemonPaletteGuessGame'), 'PokemonPaletteGuessGame'),
  results: component(() => import('../room/PokemonPaletteGuessResults'), 'PokemonPaletteGuessResults'),
})).register(clientModule({
  id: 'who-is-who-pokemon',
  config: component(() => import('./who-is-who-pokemon/ConfigPanel'), 'WhoIsWhoPokemonConfigPanel'),
  active: component(() => import('../room/WhoIsWhoPokemonGame'), 'WhoIsWhoPokemonGame'),
  results: component(() => import('../room/WhoIsWhoPokemonResults'), 'WhoIsWhoPokemonResults'),
})).register(clientModule({
  id: 'absurd-pokedex',
  config: component(() => import('./absurd-pokedex/ConfigPanel'), 'AbsurdPokedexConfigPanel'),
  active: component(() => import('../room/AbsurdPokedexGame'), 'AbsurdPokedexGame'),
  results: component(() => import('../room/AbsurdPokedexResults'), 'AbsurdPokedexResults'),
})).register(clientModule({
  id: 'unown-translator',
  config: component(() => import('./unown-translator/ConfigPanel'), 'UnownTranslatorConfigPanel'),
  active: component(() => import('../room/UnownTranslatorGame'), 'UnownTranslatorGame'),
  results: component(() => import('../room/UnownTranslatorResults'), 'UnownTranslatorResults'),
})).register(clientModule({
  id: 'who-am-i',
  config: component(() => import('./who-am-i/ConfigPanel'), 'WhoAmIConfigPanel'),
  active: component(() => import('../room/WhoAmIGame'), 'WhoAmIGame'),
  results: component(() => import('../room/WhoAmIResults'), 'WhoAmIResults'),
}));
