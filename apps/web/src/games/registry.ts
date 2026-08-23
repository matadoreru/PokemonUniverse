import type { ComponentType } from 'react';
import type { RoomView } from '@pokemon-universe/shared';
import { PokedexDistanceConfigPanel } from './pokedex-distance/ConfigPanel';
import { PokedexDistanceGame } from '../room/PokedexDistanceGame';
import { GameResults } from '../room/Results';
import { ShinyVoteConfigPanel } from './shiny-vote/ConfigPanel';
import { ShinyVoteGame } from '../room/ShinyVoteGame';
import { ShinyVoteResults } from '../room/ShinyVoteResults';

export interface ActiveGameProps { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }
export interface GameResultsProps { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }
export interface GameConfigProps { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }
export interface MiniGameClientModule {
  id: string;
  name: string;
  description: string;
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
  description: 'Acércate al número objetivo. La elección más lejana queda fuera.',
  ConfigPanel: PokedexDistanceConfigPanel, ActiveGame: PokedexDistanceGame, Results: GameResults,
}).register({
  id: 'shiny-vote', name: 'Shiny Quiz',
  description: 'Encuentra el shiny real. Verás en directo qué opción elige cada entrenador.',
  ConfigPanel: ShinyVoteConfigPanel, ActiveGame: ShinyVoteGame, Results: ShinyVoteResults,
});
