import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView, TcgHigherLowerPlayerState, TcgHigherLowerPublicState } from '@pokemon-universe/shared/public';
import { defaultTcgHigherLowerConfig } from '@pokemon-universe/shared/public';
import { TcgHigherLowerConfigPanel } from '../games/tcg-higher-lower/ConfigPanel';
import { formatTcgPrice, tcgAnnouncement, tcgChoiceFromShortcut, tcgFocusKey, tcgMemberStatus, tcgPlateKind, tcgPriceDiff, tcgStatsLine, tcgVerdict } from '../games/tcg-higher-lower/presentation';
import { TcgHigherLowerGame } from './TcgHigherLowerGame';
import { TcgHigherLowerResults } from './TcgHigherLowerResults';
import { expectSingleLiveRegion } from './test-support/live-regions';
import { member, roomView } from './test-support/room-view';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));


/** Precio de la nueva carta: nunca puede salir antes de revelar (ni en bruto ni formateado). */
const SECRET_PRICE = '98.7654';
const SECRET_FORMATTED = formatTcgPrice(SECRET_PRICE, 'EUR');

const lastRound = { previousPrice: '4.25', currentPrice: SECRET_PRICE, correctAnswer: 'HIGHER' as const, outcomes: {
  p1: { choice: 'HIGHER' as const, correct: true, awardedPoints: 1, streak: 2 },
  p2: { choice: 'LOWER' as const, correct: false, awardedPoints: 0, streak: 0 },
  p3: { choice: null, correct: false, awardedPoints: 0, streak: 0 },
} };

function room(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS', overrides: Partial<TcgHigherLowerPublicState> = {}, player: Partial<TcgHigherLowerPlayerState> = {}): RoomView {
  const game: TcgHigherLowerPublicState = {
    gameId: 'tcg-higher-lower', phase, playerIds: ['p1', 'p2', 'p3'], roundNumber: 1, totalRounds: 5, currency: 'EUR',
    previousCard: { id: 'a', name: 'Pikachu', localId: '001', setId: 'base', setName: 'Base Set', rarity: 'Rare', imageUrl: 'https://img.test/a.webp', price: '4.25' },
    currentCard: { id: 'b', name: 'Charizard con un nombre muy largo', localId: '002', setId: 'base', setName: 'Una expansión con nombre muy largo', rarity: 'Holo Rare', imageUrl: 'https://img.test/b.webp', price: phase === 'ROUND_ACTIVE' ? null : SECRET_PRICE },
    answeredIds: [], scores: { p1: 3, p2: 1, p3: 0 }, streaks: { p1: 2, p2: 0, p3: 0 }, roundStartedAt: 1_000,
    roundEndsAt: phase === 'ROUND_ACTIVE' ? 16_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 4_000 : null,
    lastRound: phase === 'ROUND_ACTIVE' ? null : lastRound,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 3, won: true, stats: { comparisons: 5, correct: 1, incorrect: 4, sameCorrect: 1, answered: 5, bestStreak: 1, accuracy: 20 } },
      { playerId: 'p2', position: 2, points: 1, won: false, stats: { comparisons: 5, correct: 1, incorrect: 4, sameCorrect: 0, answered: 4, bestStreak: 1, accuracy: 20 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { comparisons: 5, correct: 0, incorrect: 5, sameCorrect: 0, answered: 0, bestStreak: 0, accuracy: 0 } },
    ] } : null,
    ...overrides,
  };
  return roomView({ code: 'TEST12', phase, members: [member({ id: 'p1', displayName: 'Ana' }), member({ id: 'p2', displayName: 'Bruno' }), member({ id: 'p3', displayName: 'Carla', connected: false, presence: 'TEMPORARILY_DISCONNECTED' })], selectedGameId: 'tcg-higher-lower', selectedGameConfig: { roundSeconds: 15 }, gameConfigs: {}, customizedGameIds: [], game, gamePlayerState: { canAnswer: phase === 'ROUND_ACTIVE', answer: null, ...player }, hostCustomCategoryCount: 0, hostWouldYouRatherPromptCount: 0 });
}

const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(<TcgHigherLowerGame room={view} selfId={selfId} onAction={async () => undefined} />);

describe('TcgHigherLowerGame', () => {
  it('pinta dos cartas, el «¿? €» de la nueva y las tres píldoras con atajos', () => {
    const html = render(room('ROUND_ACTIVE'));
    expect(html).toContain('data-tcg-card="previous"');
    expect(html).toContain('data-tcg-card="current"');
    expect(html).toMatch(/data-tcg-price="current"[^>]*>¿\? €/);
    expect(html).toContain(formatTcgPrice('4.25', 'EUR'));
    expect(html).toContain('Base Set · 001');
    expect(html).toContain('Holo Rare');
    for (const [label, key] of [['Más', '1'], ['Igual', '2'], ['Menos', '3']] as const) expect(html).toContain(`aria-label="${label}" aria-keyshortcuts="${key}"`);
    expect(html).not.toContain('data-testid="tcg-prices"');
    // Una sola región viva y ningún heredado.
    expectSingleLiveRegion(html);
    expect(html).not.toMatch(/class="[^"]*\b(btn-primary|btn-ghost|card|chip|label|reveal-pop)\b/);
  });

  it('no pinta el precio de la nueva carta ni el resultado antes de revelar, aunque llegaran', () => {
    // Un `lastRound` sobrante y un precio que el servidor no debería mandar: ninguno se pinta en la ronda.
    for (const player of [{}, { answer: { choice: 'HIGHER' as const, answeredAt: 2_000 }, canAnswer: false }] as Partial<TcgHigherLowerPlayerState>[]) {
      const view = room('ROUND_ACTIVE', { lastRound, currentCard: { id: 'b', name: 'Charizard', localId: '002', setId: 'base', setName: 'Base Set', rarity: null, imageUrl: 'https://img.test/b.webp', price: SECRET_PRICE } }, player);
      for (const selfId of ['p1', 'watcher']) {
        const html = render(view, selfId);
        expect(html).not.toContain(SECRET_PRICE);
        expect(html).not.toContain(SECRET_FORMATTED);
        expect(html).not.toContain('98,76');
        expect(html).not.toContain('Correcta:');
        expect(html).not.toContain('Eligió');
        expect(html).toMatch(/data-tcg-price="current"[^>]*>¿\? €/);
      }
    }
  });

  it('al revelar enseña los dos precios, la diferencia, la correcta y qué eligió cada uno', () => {
    const html = render(room('ROUND_RESULTS'));
    expect(html).toContain('data-testid="tcg-prices"');
    expect(html).toContain(SECRET_FORMATTED);
    expect(html).toContain(tcgPriceDiff('4.25', SECRET_PRICE, 'EUR'));
    expect(html).toContain('Correcta: Más');
    expect(html).toContain('Respuesta: Más');
    expect(html).toContain('Eligió Más');
    expect(html).toContain('Eligió Menos');
    expect(html.match(/data-tcg-choice/g)).toHaveLength(2);
    expect(html).toContain('<span aria-hidden="true">✓</span> +1<span class="sr-only"> acierto</span>');
    expect(html).toContain('<span aria-hidden="true">✗</span> Fallo');
    expect(html).toContain('<span aria-hidden="true">✗</span> Sin respuesta');
    expect(html).toContain('Racha 2');
    expect(html).toContain('Siguiente ronda en');
    expect(html).toContain('Sin conexión');
  });

  it('el espectador ve el duelo y el marcador sin píldoras', () => {
    const html = render(room('ROUND_ACTIVE', {}, { canAnswer: false }), 'watcher');
    expect(html).toContain('Estás observando');
    expect(html).not.toContain('aria-keyshortcuts');
  });
});

describe('presentación de TCG Higher or Lower', () => {
  it('atajos, placas, foco y veredictos', () => {
    expect(tcgChoiceFromShortcut('1')).toBe('HIGHER');
    expect(tcgChoiceFromShortcut('2')).toBe('SAME');
    expect(tcgChoiceFromShortcut('3')).toBe('LOWER');
    expect(tcgChoiceFromShortcut('4')).toBeNull();
    const answer = { choice: 'LOWER' as const, answeredAt: 1 };
    expect(tcgPlateKind({ phase: 'ROUND_ACTIVE', canAnswer: true, answer: null, revealed: false })).toBe('answer');
    expect(tcgPlateKind({ phase: 'ROUND_ACTIVE', canAnswer: false, answer, revealed: false })).toBe('locked');
    expect(tcgPlateKind({ phase: 'ROUND_ACTIVE', canAnswer: false, answer: null, revealed: false })).toBe('watching');
    expect(tcgPlateKind({ phase: 'ROUND_RESULTS', canAnswer: false, answer: null, revealed: true })).toBe('reveal');
    expect(tcgPlateKind({ phase: 'GAME_STARTING', canAnswer: false, answer: null, revealed: false })).toBe('waiting');
    expect(tcgFocusKey('locked', 2)).toBe('locked-2');
    expect(tcgFocusKey('reveal', 2)).toBe('reveal-2');
    expect(tcgFocusKey('answer', 2)).toBeNull();
    expect(tcgVerdict(lastRound.outcomes.p1, true)).toBe('¡Acierto!');
    expect(tcgVerdict(lastRound.outcomes.p2, true)).toBe('Fallo: elegiste Menos');
    expect(tcgVerdict(lastRound.outcomes.p3, true)).toBe('Sin respuesta');
    expect(tcgVerdict(null, false)).toBe('Estás observando');
    expect(tcgMemberStatus(['p1'], null, 'p1')).toEqual({ kind: 'answered' });
    expect(tcgMemberStatus([], null, 'p1')).toEqual({ kind: 'pending' });
    expect(tcgMemberStatus([], lastRound, 'p2')).toEqual({ kind: 'outcome', outcome: lastRound.outcomes.p2 });
  });

  it('precios y anuncios en español', () => {
    expect(tcgPriceDiff('4.25', '4.25', 'EUR')).toBe('Mismo precio');
    expect(tcgPriceDiff('5', '3.9', 'EUR')).toBe(`−${formatTcgPrice('1.1', 'EUR')}`);
    expect(tcgAnnouncement({ kind: 'locked', roundNumber: 1, answer: { choice: 'SAME', answeredAt: 1 }, correctAnswer: null, outcome: null, participant: true })).toBe('Has elegido Igual. Esperando al resto de entrenadores.');
    expect(tcgAnnouncement({ kind: 'reveal', roundNumber: 1, answer: null, correctAnswer: 'HIGHER', outcome: lastRound.outcomes.p1, participant: true, prices: { previous: '4,25 €', current: '98,77 €' } }))
      .toBe('Precio revelado. La anterior valía 4,25 € y la nueva, 98,77 €. La correcta era Más. Has acertado: +1 punto.');
    expect(tcgStatsLine({ correct: 1, comparisons: 5, sameCorrect: 1, bestStreak: 1, accuracy: 20 })).toBe('1 acierto de 5 · 1 igual · mejor racha 1 · 20%');
  });
});

describe('TcgHigherLowerResults y ajustes', () => {
  it('clasificación con métricas en texto, récords y sin medallas', () => {
    const html = renderToStaticMarkup(<TcgHigherLowerResults room={room('GAME_RESULTS')} selfId="p1" onLobby={() => undefined} onEnd={() => undefined} />);
    expect(html).toContain('Clasificación Higher or Lower: Cartas');
    expect(html).toContain('1 acierto de 5 · 1 igual · mejor racha 1 · 20%');
    expect(html).toContain('Mejor racha');
    expect(html).toContain('Iguales acertados');
    expect(html).toContain('Mejor precisión');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });

  it('ajustes con controles del catálogo', () => {
    const html = renderToStaticMarkup(<TcgHigherLowerConfigPanel config={defaultTcgHigherLowerConfig} disabled={false} onChange={async () => undefined} />);
    expect(html).toContain('Todos los sets');
    expect(html).toContain('Todas las rarezas');
    expect(html).toContain('Mostrar rareza de las cartas');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Tiempo por comparación');
    expect(html).toContain('Comprobando cartas disponibles…');
    // `GenerationSelector` (la primera sección) sigue siendo el heredado hasta F9: el resto no lleva clases heredadas.
    expect(html.slice(html.indexOf('</section>'))).not.toMatch(/class="(field|label|status-error|chip)[ "]/);
  });
});
