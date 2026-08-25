import type { RoomView } from '@pokemon-universe/shared';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { validateGuessFromStatsConfig } from './guess-from-stats/validation';
import { validatePokeddleConfig } from './pokeddle-race/validation';
import { validatePokemonBingoConfig } from './pokemon-bingo/validation';
import { validateZoomedPokemonConfig } from './zoomed-pokemon/validation';

export interface ActiveGameProps { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }
export interface GameResultsProps { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }
export interface GameConfigProps { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }
export interface MiniGameClientModule {
  id: string;
  ConfigPanel: ComponentType<GameConfigProps>;
  ActiveGame: ComponentType<ActiveGameProps>;
  Results: ComponentType<GameResultsProps>;
  validateConfig?(config: unknown): string | null;
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

function clientModule(definition: {
  id: string;
  config: LazyComponentDefinition;
  active: LazyComponentDefinition;
  results: LazyComponentDefinition;
  validateConfig?(config: unknown): string | null;
}): MiniGameClientModule {
  const config = preloadableComponent<GameConfigProps>(definition.config);
  const active = preloadableComponent<ActiveGameProps>(definition.active);
  const results = preloadableComponent<GameResultsProps>(definition.results);
  return {
    id: definition.id,
    ConfigPanel: config.Component,
    ActiveGame: active.Component,
    Results: results.Component,
    ...(definition.validateConfig ? { validateConfig: definition.validateConfig } : {}),
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
  results: component(() => import('../room/Results'), 'GameResults'),
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
  validateConfig: validatePokeddleConfig,
})).register(clientModule({
  id: 'pokemon-bingo',
  config: component(() => import('./pokemon-bingo/ConfigPanel'), 'PokemonBingoConfigPanel'),
  active: component(() => import('../room/PokemonBingoGame'), 'PokemonBingoGame'),
  results: component(() => import('../room/PokemonBingoResults'), 'PokemonBingoResults'),
  validateConfig: validatePokemonBingoConfig,
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
  validateConfig: validateGuessFromStatsConfig,
})).register(clientModule({
  id: 'zoomed-pokemon',
  config: component(() => import('./zoomed-pokemon/ConfigPanel'), 'ZoomedPokemonConfigPanel'),
  active: component(() => import('../room/ZoomedPokemonGame'), 'ZoomedPokemonGame'),
  results: component(() => import('../room/ZoomedPokemonResults'), 'ZoomedPokemonResults'),
  validateConfig: validateZoomedPokemonConfig,
}));
