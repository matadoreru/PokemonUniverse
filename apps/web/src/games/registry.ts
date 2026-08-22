import type { ComponentType } from 'react';
import type { RoomView } from '@pokemon-universe/shared';
import { PokedexDistanceConfigPanel } from './pokedex-distance/ConfigPanel';
import { PokedexDistanceGame } from '../room/PokedexDistanceGame';
import { GameResults } from '../room/Results';

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
  register(module: MiniGameClientModule): this { this.modules.set(module.id, module); return this; }
  get(id: string): MiniGameClientModule {
    const module = this.modules.get(id); if (!module) throw new Error(`No client registered for game ${id}`); return module;
  }
}

export const clientGameRegistry = new ClientGameRegistry().register({
  id: 'pokedex-distance', name: 'Pokédex Distance',
  description: 'Acércate al número objetivo. La elección más lejana queda fuera.',
  ConfigPanel: PokedexDistanceConfigPanel, ActiveGame: PokedexDistanceGame, Results: GameResults,
});
