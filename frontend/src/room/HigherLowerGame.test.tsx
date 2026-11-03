import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HigherLowerPublicState, RoomView } from '@pokemon-universe/shared';
import { HigherLowerGame } from './HigherLowerGame';

const member = (id: string, displayName: string) => ({ id, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: 'MEMBER' as const, role: 'PLAYER' as const, isHost: false, ready: false, sessionPoints: 0 });

function room(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS'): RoomView {
  const lastRound = { previousValue: 40, currentValue: 63, correctAnswer: 'HIGHER' as const, outcomes: {
    p1: { choice: 'HIGHER' as const, correct: true, basePoints: 1, streakBonus: 0, speedBonus: 1, awardedPoints: 2, streak: 1 },
    p2: { choice: 'LOWER' as const, correct: false, basePoints: 0, streakBonus: 0, speedBonus: 0, awardedPoints: 0, streak: 0 },
    p3: { choice: null, correct: false, basePoints: 0, streakBonus: 0, speedBonus: 0, awardedPoints: 0, streak: 0 },
  } };
  const game: HigherLowerPublicState = { gameId: 'higher-lower', phase, playerIds: ['p1', 'p2', 'p3'], roundNumber: 1, totalRounds: 5, category: 'HP', previousPokemon: { id: 'pidgey', name: 'Pidgey', sprite: '/api/pokemon/pidgey/sprite', value: 40 }, currentPokemon: { id: 'onix', name: 'Onix', sprite: '/api/pokemon/onix/sprite', value: phase === 'ROUND_RESULTS' ? 63 : null }, answers: {}, answeredIds: [], scores: { p1: 2, p2: 0, p3: 0 }, streaks: { p1: 1, p2: 0, p3: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 21_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 4_000 : null, lastRound: phase === 'ROUND_RESULTS' ? lastRound : null, results: null };
  return { code: 'TEST11', phase, hostId: 'p1', maxPlayers: 8, members: [member('p1', 'Ana'), member('p2', 'Bruno'), member('p3', 'Carla')], availableGames: [], selectedGameId: 'higher-lower', selectedGameConfig: {}, gameConfigs: {}, customizedGameIds: [], sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game, gamePlayerState: { canAnswer: phase === 'ROUND_ACTIVE', answer: null }, serverNow: 1_000, hostCustomCategoryCount: 0, hostWouldYouRatherPromptCount: 0 };
}

describe('HigherLowerGame', () => {
  it('names each result with text, not only colour or a glyph', () => {
    const html = renderToStaticMarkup(<HigherLowerGame room={room('ROUND_RESULTS')} selfId="p1" onAction={async () => undefined} />);
    expect(html).toContain('<span aria-hidden="true">✓</span> +2<span class="sr-only"> acierto</span>');
    expect(html).toContain('<span aria-hidden="true">✗</span> Fallo');
    expect(html).toContain('<span aria-hidden="true">✗</span> Sin respuesta');
    expect(html).toContain('Racha 1 · +1 rapidez');
    expect(html).toContain('data-testid="higher-lower-bars"');
  });
  it('keeps the bars and the current value out of the active round', () => {
    const html = renderToStaticMarkup(<HigherLowerGame room={room('ROUND_ACTIVE')} selfId="p1" onAction={async () => undefined} />);
    expect(html).not.toContain('higher-lower-bars');
    expect(html).toContain('???');
    expect(html).toContain('answer-dock');
  });
});
