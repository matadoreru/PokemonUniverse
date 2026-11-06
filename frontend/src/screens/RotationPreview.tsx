import type { RoomView } from '@pokemon-universe/shared/public';
import { GameOrderChoice, SelectedGamesConfig } from '../room/GameSelectionConfig';
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
  gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: null, gamePlayerState: null, daily: null, serverNow: Date.now(),
};

/**
 * Vista previa de la selección (desarrollo y revisión): con datos ficticios, el orden de los minijuegos (pestaña «Modo y
 * sesión») y los ajustes de los elegidos (pestaña «Configuración»), sobre el `Panel` crema del lobby. El `main` lo pone
 * el armazón.
 */
export function RotationPreview() {
  return (
    <Screen>
      <Panel variant="cream" as="div">
        <GameOrderChoice mode={room.gameSelectionMode} compatibleCount={3} disabled={false} onChange={() => undefined} />
      </Panel>
      <Panel variant="cream" as="div">
        <SelectedGamesConfig room={room} selfId="host" playerCount={3} disabled={false} onConfig={async () => undefined} />
      </Panel>
    </Screen>
  );
}
