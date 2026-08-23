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

export interface ActiveGameProps { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }
export interface GameResultsProps { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }
export interface GameConfigProps { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }
export interface MiniGameClientModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  ConfigPanel: ComponentType<GameConfigProps>;
  ActiveGame: ComponentType<ActiveGameProps>;
  Results: ComponentType<GameResultsProps>;
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
  id: 'pokedex-distance', name: 'Pokédex Distance',
  icon: '🎯',
  description: 'Acércate al número objetivo. La elección más lejana queda fuera.',
  ConfigPanel: PokedexDistanceConfigPanel, ActiveGame: PokedexDistanceGame, Results: GameResults,
}).register({
  id: 'shiny-vote', name: 'Shiny Quiz',
  icon: '✨',
  description: 'Encuentra el shiny real. Verás en directo qué opción elige cada entrenador.',
  ConfigPanel: ShinyVoteConfigPanel, ActiveGame: ShinyVoteGame, Results: ShinyVoteResults,
}).register({
  id: 'pokemon-impostor', name: 'Pokémon Impostor', icon: '🕵️',
  description: 'Da pistas sin revelar demasiado y descubre quién no conoce el Pokémon.',
  ConfigPanel: PokemonImpostorConfigPanel, ActiveGame: PokemonImpostorGame, Results: PokemonImpostorResults,
}).register({
  id: 'higher-lower', name: 'Higher or Lower', icon: '📈', description: 'Compara stats, decide si suben o bajan y construye una racha.',
  ConfigPanel: HigherLowerConfigPanel, ActiveGame: HigherLowerGame, Results: HigherLowerResults,
}).register({
  id: 'type-duel', name: 'Type Duel', icon: '⚔️', description: 'Duelo de tipos: encuentra antes que tu rival la combinación Pokémon exacta.',
  ConfigPanel: TypeDuelConfigPanel, ActiveGame: TypeDuelGame, Results: TypeDuelResults,
}).register({
  id: 'learnset-guess', name: 'Learnset Guess', icon: '📚', description: 'Adivina el Pokémon por los movimientos que aprende al subir de nivel.',
  ConfigPanel: LearnsetGuessConfigPanel, ActiveGame: LearnsetGuessGame, Results: LearnsetGuessResults,
});
