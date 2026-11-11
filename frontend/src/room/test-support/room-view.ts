import type { MiniGameManifest, RoomMemberView, RoomView } from '@pokemon-universe/shared/public';

/** Miembro conectado, jugador y sin puntos; cada test da su `id`, su nombre y lo que cambie. */
export function member(overrides: Partial<RoomMemberView> & Pick<RoomMemberView, 'id' | 'displayName'>): RoomMemberView {
  return {
    avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false,
    ready: false, sessionPoints: 0, ...overrides,
  };
}

/** Manifiesto mínimo de un juego (sin métricas de perfil). */
export function manifest(overrides: Partial<MiniGameManifest> & Pick<MiniGameManifest, 'id' | 'name'>): MiniGameManifest {
  return { icon: '🎮', description: '', minPlayers: 1, profileStats: { metrics: [] }, ...overrides };
}

/**
 * Vista de sala con solo los campos obligatorios: lobby vacío de `ABC234` con `p1` de host. Los opcionales
 * (`gameConfigs`, `gameSkipState`…) quedan ausentes salvo que el test los dé. Sin `gameSelectionMode`, la cola por
 * orden lleva solo el juego elegido.
 */
export function roomView(overrides: Partial<RoomView> = {}): RoomView {
  const selectedGameId = overrides.selectedGameId ?? '';
  return {
    code: 'ABC234', phase: 'LOBBY', hostId: 'p1', maxPlayers: 8, members: [], availableGames: [],
    selectedGameId, selectedGameConfig: null, sessionMode: { type: 'INFINITE' },
    gameSelectionMode: { type: 'ORDER', gameIds: selectedGameId ? [selectedGameId] : [] }, nextGameVote: null,
    gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: null, gamePlayerState: null, daily: null, serverNow: 1_000,
    ...overrides,
  };
}
