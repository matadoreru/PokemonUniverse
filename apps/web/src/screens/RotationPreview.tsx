import type { RoomView } from '@pokemon-universe/shared';
import { GameSelectionConfig } from '../room/GameSelectionConfig';

const games = [
  { id: 'pokedex-distance', name: 'Pokédex Distance', icon: '🎯', description: 'Elige un Pokémon cuyo número esté lo más cerca posible del objetivo.', minPlayers: 2, profileStats: { metrics: [] } },
  { id: 'shiny-vote', name: 'Shiny Quiz', icon: '✨', description: 'Encuentra el shiny verdadero entre varios candidatos.', minPlayers: 1, profileStats: { metrics: [] } },
  { id: 'higher-lower', name: 'Higher or Lower', icon: '📈', description: 'Acierta si la estadística del siguiente Pokémon es mayor o menor.', minPlayers: 1, profileStats: { metrics: [] } },
];

const room: RoomView = {
  code: 'ABC234', phase: 'LOBBY', hostId: 'host', maxPlayers: 8,
  members: [{ id: 'host', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 }],
  availableGames: games, selectedGameId: 'pokedex-distance', selectedGameConfig: { generations: [1, 2, 3, 4, 5, 6, 7, 8, 9], roundSeconds: 20 },
  gameConfigs: {
    'pokedex-distance': { generations: [1, 2, 3, 4, 5, 6, 7, 8, 9], roundSeconds: 20 },
    'shiny-vote': { generations: [1, 2, 3], rounds: 5, roundSeconds: 20 },
    'higher-lower': { generations: [1, 2, 3, 4], rounds: 10, roundSeconds: 15 },
  }, customizedGameIds: ['shiny-vote'], sessionMode: { type: 'INFINITE' },
  gameSelectionMode: { type: 'VOTE', gameIds: games.map((game) => game.id) }, nextGameVote: null,
  gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: null, gamePlayerState: null, serverNow: Date.now(),
};

export function RotationPreview() {
  return <main className="page-shell max-w-[90rem] py-8"><section className="panel p-4 sm:p-6"><GameSelectionConfig availableGames={games} mode={room.gameSelectionMode} playerCount={3} disabled={false} room={room} selfId="host" onChange={() => undefined} onConfig={async () => undefined} /></section></main>;
}
