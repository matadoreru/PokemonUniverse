import type { ComponentType } from 'react';
import type { RoomView } from '@pokemon-universe/shared';
import { PokedexDistanceConfigPanel } from './pokedex-distance/ConfigPanel';
import { PokedexDistanceGame } from '../room/PokedexDistanceGame';
import { GameResults } from '../room/Results';
import { ShinyVoteConfigPanel } from './shiny-vote/ConfigPanel';
import { ShinyVoteGame } from '../room/ShinyVoteGame';
import { ShinyVoteResults } from '../room/ShinyVoteResults';
import { PokemonImpostorConfigPanel } from './pokemon-impostor/ConfigPanel';
import { PokemonImpostorGame } from '../room/PokemonImpostorGame';
import { PokemonImpostorResults } from '../room/PokemonImpostorResults';
import { HigherLowerConfigPanel } from './higher-lower/ConfigPanel';
import { HigherLowerGame } from '../room/HigherLowerGame';
import { HigherLowerResults } from '../room/HigherLowerResults';
import { TypeDuelConfigPanel } from './type-duel/ConfigPanel';
import { TypeDuelGame } from '../room/TypeDuelGame';
import { TypeDuelResults } from '../room/TypeDuelResults';
import { LearnsetGuessConfigPanel } from './learnset-guess/ConfigPanel';
import { LearnsetGuessGame } from '../room/LearnsetGuessGame';
import { LearnsetGuessResults } from '../room/LearnsetGuessResults';
import { PokeddleRaceConfigPanel, validatePokeddleConfig } from './pokeddle-race/ConfigPanel';
import { PokeddleRaceGame } from '../room/PokeddleRaceGame';
import { PokeddleRaceResults } from '../room/PokeddleRaceResults';
import { PokemonBingoConfigPanel, validatePokemonBingoConfig } from './pokemon-bingo/ConfigPanel';
import { PokemonBingoGame } from '../room/PokemonBingoGame';
import { PokemonBingoResults } from '../room/PokemonBingoResults';
import { WhosThatPokemonConfigPanel } from './whos-that-pokemon/ConfigPanel';
import { WhosThatPokemonGame } from '../room/WhosThatPokemonGame';
import { WhosThatPokemonResults } from '../room/WhosThatPokemonResults';
import { PokedexEntryGuessConfigPanel } from './pokedex-entry-guess/ConfigPanel';
import { PokedexEntryGuessGame } from '../room/PokedexEntryGuessGame';
import { PokedexEntryGuessResults } from '../room/PokedexEntryGuessResults';
import { TypeChainConfigPanel } from './type-chain/ConfigPanel';
import { TypeChainGame } from '../room/TypeChainGame';
import { TypeChainResults } from '../room/TypeChainResults';
import { GuessFromStatsConfigPanel, validateGuessFromStatsConfig } from './guess-from-stats/ConfigPanel';
import { GuessFromStatsGame } from '../room/GuessFromStatsGame';
import { GuessFromStatsResults } from '../room/GuessFromStatsResults';
import { ZoomedPokemonConfigPanel, validateZoomedPokemonConfig } from './zoomed-pokemon/ConfigPanel';
import { ZoomedPokemonGame } from '../room/ZoomedPokemonGame';
import { ZoomedPokemonResults } from '../room/ZoomedPokemonResults';

export interface ActiveGameProps { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }
export interface GameResultsProps { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }
export interface GameConfigProps { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }
export interface MiniGameClientModule {
  id: string;
  ConfigPanel: ComponentType<GameConfigProps>;
  ActiveGame: ComponentType<ActiveGameProps>;
  Results: ComponentType<GameResultsProps>;
  validateConfig?(config: unknown): string | null;
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

export const clientGameRegistry = new ClientGameRegistry().register({
  id: 'pokedex-distance',
  ConfigPanel: PokedexDistanceConfigPanel, ActiveGame: PokedexDistanceGame, Results: GameResults,
}).register({
  id: 'shiny-vote',
  ConfigPanel: ShinyVoteConfigPanel, ActiveGame: ShinyVoteGame, Results: ShinyVoteResults,
}).register({
  id: 'pokemon-impostor',
  ConfigPanel: PokemonImpostorConfigPanel, ActiveGame: PokemonImpostorGame, Results: PokemonImpostorResults,
}).register({
  id: 'higher-lower',
  ConfigPanel: HigherLowerConfigPanel, ActiveGame: HigherLowerGame, Results: HigherLowerResults,
}).register({
  id: 'type-duel',
  ConfigPanel: TypeDuelConfigPanel, ActiveGame: TypeDuelGame, Results: TypeDuelResults,
}).register({
  id: 'learnset-guess',
  ConfigPanel: LearnsetGuessConfigPanel, ActiveGame: LearnsetGuessGame, Results: LearnsetGuessResults,
}).register({
  id: 'pokeddle-race',
  ConfigPanel: PokeddleRaceConfigPanel, ActiveGame: PokeddleRaceGame, Results: PokeddleRaceResults, validateConfig: validatePokeddleConfig,
}).register({
  id: 'pokemon-bingo',
  ConfigPanel: PokemonBingoConfigPanel, ActiveGame: PokemonBingoGame, Results: PokemonBingoResults, validateConfig: validatePokemonBingoConfig,
}).register({
  id: 'whos-that-pokemon',
  ConfigPanel: WhosThatPokemonConfigPanel, ActiveGame: WhosThatPokemonGame, Results: WhosThatPokemonResults,
}).register({
  id: 'pokedex-entry-guess',
  ConfigPanel: PokedexEntryGuessConfigPanel, ActiveGame: PokedexEntryGuessGame, Results: PokedexEntryGuessResults,
}).register({
  id: 'type-chain',
  ConfigPanel: TypeChainConfigPanel, ActiveGame: TypeChainGame, Results: TypeChainResults,
}).register({
  id: 'guess-from-stats',
  ConfigPanel: GuessFromStatsConfigPanel, ActiveGame: GuessFromStatsGame, Results: GuessFromStatsResults, validateConfig: validateGuessFromStatsConfig,
}).register({
  id: 'zoomed-pokemon',
  ConfigPanel: ZoomedPokemonConfigPanel, ActiveGame: ZoomedPokemonGame, Results: ZoomedPokemonResults, validateConfig: validateZoomedPokemonConfig,
});
