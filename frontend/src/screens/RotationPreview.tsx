import type { RoomView } from '@pokemon-universe/shared/public';
import { GameSelectionConfig } from '../room/GameSelectionConfig';
import { Panel, Screen } from '../ui';

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

/**
 * Vista previa de la rotación (desarrollo y revisión): el editor de la rotación con datos ficticios, en una pantalla del
 * catálogo y sobre el `Panel` crema de la pestaña «Modo y sesión» del lobby. El `main` lo pone el armazón.
 */
export function RotationPreview() {
  return (
    <Screen>
      <Panel variant="cream" as="div">
        <GameSelectionConfig availableGames={games} mode={room.gameSelectionMode} playerCount={3} disabled={false} room={room} selfId="host" onChange={() => undefined} onConfig={async () => undefined} />
      </Panel>
    </Screen>
  );
}
