import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HigherLowerPlayerState, HigherLowerPublicState, RoomView } from '@pokemon-universe/shared/public';
import { higherLowerAnnouncement, higherLowerChoiceFromShortcut, higherLowerFocusKey, higherLowerMemberStatus, higherLowerPlateKind, higherLowerRanking, higherLowerRecord, higherLowerVerdict } from '../games/higher-lower/presentation';
import { HigherLowerGame } from './HigherLowerGame';
import { HigherLowerResults } from './HigherLowerResults';
import { expectSingleLiveRegion } from './test-support/live-regions';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const member = (id: string, displayName: string) => ({ id, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: 'MEMBER' as const, role: 'PLAYER' as const, isHost: false, ready: false, sessionPoints: 0 });

/** Pokémon de la ronda: el número de Pokédex de Onix (95) es la respuesta de la categoría «N.º Pokédex» y nunca se pinta. */
const ONIX_DEX = 95;

function room(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS', overrides: Partial<HigherLowerPublicState> = {}, player: Partial<HigherLowerPlayerState> = {}, visibility: 'LIVE' | 'REVEAL' = 'REVEAL'): RoomView {
  const lastRound = { previousValue: 40, currentValue: 63, correctAnswer: 'HIGHER' as const, outcomes: {
    p1: { choice: 'HIGHER' as const, correct: true, basePoints: 1, streakBonus: 0, speedBonus: 1, awardedPoints: 2, streak: 1 },
    p2: { choice: 'LOWER' as const, correct: false, basePoints: 0, streakBonus: 0, speedBonus: 0, awardedPoints: 0, streak: 0 },
    p3: { choice: null, correct: false, basePoints: 0, streakBonus: 0, speedBonus: 0, awardedPoints: 0, streak: 0 },
  } };
  const game: HigherLowerPublicState = { gameId: 'higher-lower', phase, mode: 'CLASSIC', playerIds: ['p1', 'p2', 'p3'], roundNumber: 1, totalRounds: 5, category: 'HP', previousPokemon: { id: 'pidgey', name: 'Pidgey', sprite: '/api/pokemon/pidgey/sprite', value: 40 }, currentPokemon: { id: 'onix', name: 'Onix', sprite: '/api/pokemon/onix/sprite', value: phase === 'ROUND_RESULTS' ? 63 : null }, answers: {}, answeredIds: [], scores: { p1: 2, p2: 0, p3: 0 }, streaks: { p1: 1, p2: 0, p3: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 21_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 4_000 : null, lastRound: phase === 'ROUND_RESULTS' ? lastRound : null, results: null, ...overrides };
  return { code: 'TEST11', phase, hostId: 'p1', maxPlayers: 8, members: [member('p1', 'Ana'), member('p2', 'Bruno'), member('p3', 'Carla')], availableGames: [], selectedGameId: 'higher-lower', selectedGameConfig: { answerVisibility: visibility, roundSeconds: 20 }, gameConfigs: {}, customizedGameIds: [], sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['higher-lower'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game, gamePlayerState: { canAnswer: phase === 'ROUND_ACTIVE', answer: null, ...player }, daily: null, serverNow: 1_000, hostCustomCategoryCount: 0, hostWouldYouRatherPromptCount: 0 } as RoomView;
}

const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(<HigherLowerGame room={view} selfId={selfId} onAction={async () => undefined} />);

describe('HigherLowerGame', () => {
  it('names each result with text, not only colour or a glyph', () => {
    const html = render(room('ROUND_RESULTS'));
    expect(html).toContain('<span aria-hidden="true">✓</span> +2<span class="sr-only"> acierto</span>');
    expect(html).toContain('<span aria-hidden="true">✗</span> Fallo');
    expect(html).toContain('<span aria-hidden="true">✗</span> Sin respuesta');
    expect(html).toContain('Racha 1 · +1 rapidez');
    expect(html).toContain('data-testid="higher-lower-bars"');
    expect(html).toContain('Respuesta: Mayor');
    expect(html).toContain('Siguiente ronda en');
  });
  it('keeps the bars and the current value out of the active round', () => {
    const html = render(room('ROUND_ACTIVE'));
    expect(html).not.toContain('higher-lower-bars');
    expect(html).toContain('data-hl-card="current"');
    expect(html).toMatch(/data-hl-card="current"[\s\S]*\?\?\?/);
    expect(html).not.toContain('>63<');
  });
  it('shows ??? for the previous value too when the server does not project it', () => {
    const html = render(room('ROUND_ACTIVE', { previousPokemon: { id: 'pidgey', name: 'Pidgey', sprite: '/api/pokemon/pidgey/sprite', value: null } }));
    expect(html.match(/\?\?\?/g)).toHaveLength(2);
    expect(html).not.toContain('>40<');
  });
  it('never paints the Pokédex number, not even in the N.º Pokédex category', () => {
    for (const phase of ['ROUND_ACTIVE', 'ROUND_RESULTS'] as const) {
      const html = render(room(phase, { category: 'DEX_NUMBER', previousPokemon: { id: 'pidgey', name: 'Pidgey', sprite: '/api/pokemon/pidgey/sprite', value: phase === 'ROUND_RESULTS' ? 16 : null }, currentPokemon: { id: 'onix', name: 'Onix', sprite: '/api/pokemon/onix/sprite', value: phase === 'ROUND_RESULTS' ? ONIX_DEX : null } }));
      expect(html).not.toMatch(/Nº \d/);
      expect(html).toContain('src="/api/pokemon/onix/sprite"');
      // Control: al revelar, el valor de la categoría (que aquí es el número) sí sale, y la búsqueda lo encuentra.
      const dex = new RegExp(`>\\s*#?0*${ONIX_DEX}\\b`);
      if (phase === 'ROUND_ACTIVE') expect(html).not.toMatch(dex);
      else expect(html).toMatch(dex);
    }
  });
  it('offers Mayor, Igual and Menor with their 1–3 shortcut badges and exact accessible names', () => {
    const html = render(room('ROUND_ACTIVE'));
    for (const [index, name] of ['Mayor', 'Igual', 'Menor'].entries()) {
      expect(html).toContain(`aria-label="${name}"`);
      expect(html).toContain(`aria-keyshortcuts="${index + 1}"`);
    }
    expect(html).toContain('Atajos: 1, 2 y 3');
  });
  it('locks the own answer and drops the buttons', () => {
    const html = render(room('ROUND_ACTIVE', { answeredIds: ['p1'] }, { canAnswer: false, answer: { choice: 'SAME', answeredAt: 2_000 } }));
    expect(html).toContain('Respuesta Igual bloqueada.');
    expect(html).not.toContain('aria-label="Mayor"');
  });
  it('with REVEAL visibility only says who answered, never what', () => {
    const html = render(room('ROUND_ACTIVE', { answeredIds: ['p2'] }));
    expect(html).toContain('Respondió');
    expect(html).toContain('Respuestas privadas');
    // Solo las píldoras dicen «Mayor/Igual/Menor»: ningún chip del marcador.
    expect(html.match(/>Mayor</g)).toHaveLength(1);
  });
  it('with LIVE visibility shows the projected choices of the others', () => {
    const html = render(room('ROUND_ACTIVE', { answeredIds: ['p2'], answers: { p2: { choice: 'LOWER', answeredAt: 2_000 } } }, {}, 'LIVE'));
    expect(html).toContain('Respuestas en directo');
    expect(html.match(/>Menor</g)).toHaveLength(2);
    expect(html).not.toContain('Respuestas privadas');
  });
  it('keeps exactly one live region on screen', () => {
    for (const view of [room('ROUND_ACTIVE'), room('ROUND_RESULTS')]) expectSingleLiveRegion(render(view));
  });
  it('the streak milestone cut-in is not a second live region: the screen region says it', () => {
    const base = (room('ROUND_RESULTS').game as HigherLowerPublicState).lastRound!;
    const lastRound = { ...base, outcomes: { ...base.outcomes, p1: { ...base.outcomes.p1!, streak: 3, streakBonus: 1 } } };
    const html = render(room('ROUND_RESULTS', { lastRound }));
    expect(html).toContain('¡Racha ×3!');
    expectSingleLiveRegion(html);
    expect(html).toMatch(/role="status" aria-live="polite">[^<]*3 aciertos seguidos/);
  });
  it('bumps only the streaks above zero', () => {
    const html = render(room('ROUND_RESULTS'));
    expect(html.match(/motion-bump/g)).toHaveLength(1);
    expect(html.match(/data-streak=/g)).toHaveLength(3);
  });
  it('tells a spectator they are watching', () => {
    const html = render(room('ROUND_ACTIVE', {}, { canAnswer: false }), 'p9');
    expect(html).toContain('Estás observando');
    expect(html).not.toContain('aria-label="Mayor"');
  });
});

describe('higher-lower presentation', () => {
  it('maps the 1–3 shortcuts', () => {
    expect(['1', '2', '3', '4', 'a'].map(higherLowerChoiceFromShortcut)).toEqual(['HIGHER', 'SAME', 'LOWER', null, null]);
  });
  it('picks the bottom plate', () => {
    expect(higherLowerPlateKind({ phase: 'ROUND_ACTIVE', canAnswer: true, answer: null, revealed: false })).toBe('answer');
    expect(higherLowerPlateKind({ phase: 'ROUND_ACTIVE', canAnswer: false, answer: { choice: 'HIGHER', answeredAt: 1 }, revealed: false })).toBe('locked');
    expect(higherLowerPlateKind({ phase: 'ROUND_ACTIVE', canAnswer: false, answer: null, revealed: false })).toBe('watching');
    expect(higherLowerPlateKind({ phase: 'ROUND_RESULTS', canAnswer: false, answer: null, revealed: true })).toBe('reveal');
    expect(higherLowerPlateKind({ phase: 'GAME_STARTING', canAnswer: false, answer: null, revealed: false })).toBe('waiting');
  });
  it('moves the focus only when locking and revealing', () => {
    expect(higherLowerFocusKey('answer', 2)).toBeNull();
    expect(higherLowerFocusKey('locked', 2)).toBe('locked-2');
    expect(higherLowerFocusKey('reveal', 2)).toBe('reveal-2');
  });
  it('member status uses only what is projected', () => {
    const base = { phase: 'ROUND_ACTIVE' as const, answers: {}, answeredIds: ['p1'], lastRound: null };
    expect(higherLowerMemberStatus(base, 'p1')).toEqual({ kind: 'answered' });
    expect(higherLowerMemberStatus(base, 'p2')).toEqual({ kind: 'pending' });
    expect(higherLowerMemberStatus({ ...base, answers: { p1: { choice: 'SAME', answeredAt: 1 } } }, 'p1')).toEqual({ kind: 'choice', choice: 'SAME' });
  });
  it('ranks with shared positions on ties', () => {
    expect(higherLowerRanking({ playerIds: ['a', 'b', 'c'], scores: { a: 1, b: 3, c: 1 } }, (id) => id)).toEqual([{ id: 'b', position: 1 }, { id: 'a', position: 2 }, { id: 'c', position: 2 }]);
  });
  it('shows «Empate» in the scoreboard only for tied players with points', () => {
    expect(render(room('ROUND_ACTIVE'))).not.toContain('Empate');
    expect(render(room('ROUND_ACTIVE', { scores: { p1: 2, p2: 2, p3: 0 } })).match(/>Empate</g)).toHaveLength(2);
  });
  it('writes the verdict', () => {
    expect(higherLowerVerdict({ choice: 'HIGHER', correct: true, basePoints: 1, streakBonus: 0, speedBonus: 0, awardedPoints: 1, streak: 1 }, true)).toBe('¡Acierto!');
    expect(higherLowerVerdict({ choice: 'SAME', correct: false, basePoints: 0, streakBonus: 0, speedBonus: 0, awardedPoints: 0, streak: 0 }, true)).toBe('Fallo: elegiste Igual');
    expect(higherLowerVerdict(null, true)).toBe('Sin respuesta');
    expect(higherLowerVerdict(null, false)).toBe('Estás observando');
  });
  it('the announcement never repeats the visible texts the E2E look for', () => {
    const base = { roundNumber: 1, category: 'HP', answer: { choice: 'HIGHER' as const, answeredAt: 1 }, correctAnswer: 'HIGHER' as const, outcome: null, participant: true };
    for (const kind of ['answer', 'locked', 'watching', 'reveal', 'waiting'] as const) {
      const text = higherLowerAnnouncement({ ...base, kind });
      expect(text).not.toMatch(/^Respuesta: |bloqueada\.|Clasificación en/);
      expect(text.length).toBeGreaterThan(0);
    }
  });
  it('finds the records of the match, with ties together', () => {
    const entries = [{ name: 'Ana', stats: { bestStreak: 3, sameCorrect: 0 } }, { name: 'Bruno', stats: { bestStreak: 3, sameCorrect: 0 } }];
    expect(higherLowerRecord(entries, 'bestStreak')).toEqual({ value: 3, names: ['Ana', 'Bruno'] });
    expect(higherLowerRecord(entries, 'sameCorrect')).toBeNull();
  });
});

describe('HigherLowerResults', () => {
  it('uses the catalogue ranking, singular stats and the match records', () => {
    const view = room('ROUND_RESULTS', { phase: 'GAME_RESULTS', results: { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 4, stats: { correct: 1, sameCorrect: 1, bestStreak: 1, accuracy: 100 } },
      { playerId: 'p2', position: 2, points: 0, stats: { correct: 0, sameCorrect: 0, bestStreak: 0, accuracy: 0 } },
    ] } as HigherLowerPublicState['results'] });
    const html = renderToStaticMarkup(<HigherLowerResults room={view} selfId="p1" onLobby={() => undefined} onEnd={() => undefined} />);
    expect(html).toContain('Clasificación Higher or Lower');
    expect(html).toContain('1 acierto · 1 igual · mejor racha 1 · 100%');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('Mejor racha');
    expect(html).toContain('Continuar sesión');
    // p2 comparte puesto con nadie aquí: sin empate.
    expect(html).not.toContain('Empate');
  });
});

describe('Higher or Lower · Racha infinita', () => {
  // Carla cayó en una ronda anterior; en esta ronda Ana acierta (racha 2) y Bruno falla (se queda en 1).
  const endlessRound = { previousValue: 40, currentValue: 63, correctAnswer: 'HIGHER' as const, outcomes: {
    p1: { choice: 'HIGHER' as const, correct: true, basePoints: 1, streakBonus: 0, speedBonus: 0, awardedPoints: 1, streak: 2 },
    p2: { choice: 'LOWER' as const, correct: false, basePoints: 0, streakBonus: 0, speedBonus: 0, awardedPoints: 0, streak: 1 },
  } };
  const endless = (phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS', overrides: Partial<HigherLowerPublicState> = {}, player: Partial<HigherLowerPlayerState> = {}) => {
    const view = room(phase, { mode: 'ENDLESS', roundNumber: 3, totalRounds: 100, alive: phase === 'ROUND_ACTIVE' ? ['p1', 'p2'] : ['p1'], scores: { p1: 2, p2: 1, p3: 0 }, streaks: { p1: 2, p2: 1, p3: 0 }, ...(phase === 'ROUND_RESULTS' ? { lastRound: endlessRound } : {}), ...overrides }, player);
    return { ...view, selectedGameConfig: { ...(view.selectedGameConfig as object), mode: 'ENDLESS' } } as RoomView;
  };

  it('shows each streak and who is still standing, with «Eliminado» for the fallen', () => {
    const html = render(endless('ROUND_ACTIVE'));
    expect(html).toContain('Ronda 3');
    expect(html).not.toContain('Ronda 3 de');
    expect(html).toContain('Racha infinita');
    expect(html).toContain('2 en pie');
    // Las respuestas cuentan solo a los que siguen en pie.
    expect(html).toContain('0 / 2 respuestas');
    const board = html.slice(html.indexOf('Clasificación de la partida'));
    expect(board.match(/>Eliminado</g)).toHaveLength(1);
    expect(board.indexOf('Carla')).toBeGreaterThan(board.indexOf('Bruno'));
    expect(board).toContain('2<small> racha</small>');
    expect(html).toContain('Un fallo y estás fuera');
    expect(html).not.toContain('Igual vale más puntos');
    expectSingleLiveRegion(html);
  });

  it('the eliminated player watches the rest of the game and cannot answer', () => {
    const html = render(endless('ROUND_ACTIVE', {}, { canAnswer: false }), 'p3');
    expect(html).toContain('Eliminado');
    expect(html).toContain('Sigues la partida como espectador');
    expect(html).not.toContain('aria-label="Mayor"');
    expectSingleLiveRegion(html);
  });

  it('at the reveal, the one who fails is out with their streak, and nobody left means the ranking is next', () => {
    const fell = render(endless('ROUND_RESULTS', { alive: [] }), 'p2');
    expect(fell).toContain('Quedas eliminado con racha 1');
    expect(fell).toContain('Clasificación en');
    const survivor = render(endless('ROUND_RESULTS'), 'p1');
    expect(survivor).toContain('Sigues en pie');
    expect(survivor).toContain('Siguiente ronda en');
    // Quien cayó antes no tiene resultado en esta ronda: sale «Eliminado», no «Sin respuesta».
    expect(survivor).not.toContain('Sin respuesta');
    const watcher = render(endless('ROUND_RESULTS'), 'p3');
    expect(watcher).toContain('Eliminado');
    expect(watcher).not.toContain('Sin respuesta');
  });

  it('announces the elimination in the live region', () => {
    expect(higherLowerAnnouncement({ kind: 'reveal', roundNumber: 3, category: 'HP', answer: null, correctAnswer: 'HIGHER', outcome: endlessRound.outcomes.p2, participant: true, endless: true })).toContain('quedas eliminado con racha 1');
    expect(higherLowerAnnouncement({ kind: 'reveal', roundNumber: 3, category: 'HP', answer: null, correctAnswer: 'HIGHER', outcome: endlessRound.outcomes.p1, participant: true, endless: true })).toContain('racha 2');
  });

  it('member status marks the fallen as eliminated', () => {
    const base = { phase: 'ROUND_ACTIVE' as const, answers: {}, answeredIds: [], lastRound: null, alive: ['p1'] };
    expect(higherLowerMemberStatus(base, 'p2')).toEqual({ kind: 'eliminated' });
    expect(higherLowerMemberStatus(base, 'p1')).toEqual({ kind: 'pending' });
    expect(higherLowerMemberStatus({ ...base, phase: 'ROUND_RESULTS', lastRound: endlessRound }, 'p2')).toEqual({ kind: 'outcome', outcome: endlessRound.outcomes.p2 });
  });

  it('results rank by streak, in the server order, with the mode in the subtitle', () => {
    const view = endless('ROUND_RESULTS', { phase: 'GAME_RESULTS', roundNumber: 4, alive: [], results: { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 3, stats: { correct: 3, incorrect: 1, sameCorrect: 0, answered: 3, bestStreak: 3, accuracy: 75 } },
      { playerId: 'p2', position: 2, points: 1, stats: { correct: 1, incorrect: 1, sameCorrect: 0, answered: 1, bestStreak: 1, accuracy: 50 } },
      { playerId: 'p3', position: 3, points: 0, stats: { correct: 0, incorrect: 1, sameCorrect: 0, answered: 1, bestStreak: 0, accuracy: 0 } },
    ] } as HigherLowerPublicState['results'] });
    const html = renderToStaticMarkup(<HigherLowerResults room={view} selfId="p1" onLobby={() => undefined} onEnd={() => undefined} />);
    expect(html).toContain('Higher or Lower · Racha infinita · 4 rondas');
    expect(html).toContain('Racha 3');
    expect(html).not.toContain('3 pts');
    expect(html.indexOf('Ana')).toBeLessThan(html.indexOf('Bruno'));
    expect(html.indexOf('Bruno')).toBeLessThan(html.indexOf('Carla'));
    expect(html).not.toContain('Iguales acertados');
  });
});
