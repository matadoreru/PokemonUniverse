import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RoomView, TcgHigherLowerPublicState } from '@pokemon-universe/shared';
import { TcgHigherLowerGame } from './TcgHigherLowerGame';

function room(): RoomView {
  const game: TcgHigherLowerPublicState = { gameId: 'tcg-higher-lower', phase: 'ROUND_ACTIVE', playerIds: ['p1'], roundNumber: 1, totalRounds: 10, currency: 'EUR', previousCard: { id: 'a', name: 'Pikachu', localId: '001', setId: 'base', setName: 'Base Set', rarity: 'Rare', imageUrl: 'https://img.test/a.webp', price: '4.25' }, currentCard: { id: 'b', name: 'Charizard con un nombre muy largo', localId: '002', setId: 'base', setName: 'Una expansión con nombre muy largo', rarity: 'Rare', imageUrl: 'https://img.test/b.webp', price: null }, answeredIds: [], scores: { p1: 0 }, streaks: { p1: 0 }, roundStartedAt: 1_000, roundEndsAt: 16_000, nextTransitionAt: null, lastRound: null, results: null };
  return { code: 'TEST12', phase: 'ROUND_ACTIVE', hostId: 'p1', maxPlayers: 8, members: [{ id: 'p1', displayName: 'eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 }], availableGames: [], selectedGameId: 'tcg-higher-lower', selectedGameConfig: {}, gameConfigs: {}, customizedGameIds: [], sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game, gamePlayerState: { canAnswer: true, answer: null }, serverNow: 1_000, hostCustomCategoryCount: 0, hostWouldYouRatherPromptCount: 0 };
}

describe('TCG Higher or Lower presentation', () => {
  it('renders a responsive two-card choice without inventing the hidden price', () => {
    const markup = renderToStaticMarkup(<TcgHigherLowerGame room={room()} selfId="p1" onAction={async () => undefined} />);
    expect(markup).toContain('sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'); expect(markup).toContain('¿? €'); expect(markup).toContain('MENOS'); expect(markup).toContain('IGUAL'); expect(markup).toContain('MÁS'); expect(markup).not.toContain('98.7654');
  });
});
