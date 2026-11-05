import type { AdminActiveRoom, AdminDataSyncItem, AdminUserItem, ChangelogEntry, FeedbackItem } from '@pokemon-universe/shared/public';

/** Datos de ejemplo de los tests de la administración. */
export const room: AdminActiveRoom = {
  id: 'r1', code: 'PIKA42', phase: 'LOBBY', gameId: null, gameName: null, connectedPlayers: 2, totalPlayers: 3, maxPlayers: 8, hostDisplayName: 'Ash',
  createdAt: '2026-11-04T10:00:00.000Z', updatedAt: '2026-11-04T10:05:00.000Z',
  participants: [
    { id: 'p1', displayName: 'Ash', kind: 'USER', presence: 'CONNECTED', roomRole: 'HOST' },
    { id: 'p2', displayName: 'Misty', kind: 'GUEST', presence: 'LEFT', roomRole: 'MEMBER' },
  ],
};

export const adminUser: AdminUserItem = {
  id: 'u1', username: 'brock', email: 'brock@example.com', role: 'ADMIN', gamesPlayed: 12, gamesWon: 5, totalPoints: 1234,
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
};

export const syncItem: AdminDataSyncItem = {
  source: 'POKEAPI', status: 'FAILED', ready: true, lastSyncAt: '2026-11-03T10:00:00.000Z', lastAttemptAt: '2026-11-04T10:00:00.000Z', lastFullSyncAt: null,
  durationMs: 1500, recordsProcessed: 1025, inserted: 3, updated: 10, skipped: 0, recordsAvailable: 1025, error: 'PokéAPI no responde', nextSyncAt: '2026-11-05T10:00:00.000Z',
};

export const feedback: FeedbackItem = {
  id: 'f1', reference: 'MINIGAME', gameId: 'shiny-vote', gameName: 'Shiny Vote', roomCode: 'PIKA42', type: 'BUG', status: 'NEW',
  description: 'El temporizador se queda a cero.', author: { userId: null, displayName: 'Gary', kind: 'GUEST' },
  createdAt: '2026-11-04T10:00:00.000Z', updatedAt: '2026-11-04T10:00:00.000Z',
};

export const entry: ChangelogEntry = {
  id: 'c1', version: '0.9.0', title: 'Pantalla de título', summary: 'La portada estrena pantalla de título.', date: '2026-11-03T12:00:00.000Z', published: true,
  content: [{ type: 'NEW', text: 'Portada nueva', highlight: true }, { type: 'BUGS', text: 'Avisos por encima de los diálogos' }], createdAt: '2026-11-03T12:00:00.000Z', updatedAt: '2026-11-03T12:00:00.000Z',
};

/** Clases de los estilos antiguos que ya no deben salir en la administración. */
export const LEGACY = /btn-|status-error|empty-state|skeleton|icon-button|class="(label|field|panel)[ "]/;
