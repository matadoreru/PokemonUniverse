import { describe, expect, it } from 'vitest';
import type { GameContext, PokemonCatalog, TcgCardCatalog, TcgComparableCard } from '../../index.js';
import { defaultTcgHigherLowerConfig } from './config.js';
import { tcgPriceComparison } from './rules.js';
import { tcgHigherLowerGame } from './server.js';
import type { TcgHigherLowerState } from './types.js';

const cards: TcgComparableCard[] = [
  { id: 'a', name: 'Pikachu', localId: '001', setId: 'base', setName: 'Base', rarity: 'Rare', imageUrl: 'https://img.test/a.webp', price: '5', currency: 'EUR', provider: 'cardmarket', variant: 'standard' },
  { id: 'b', name: 'Charizard', localId: '002', setId: 'base', setName: 'Base', rarity: 'Rare', imageUrl: 'https://img.test/b.webp', price: '10', currency: 'EUR', provider: 'cardmarket', variant: 'standard' },
  { id: 'c', name: 'Gengar', localId: '003', setId: 'promo', setName: 'Promos', rarity: null, imageUrl: 'https://img.test/c.webp', price: '10.0000', currency: 'EUR', provider: 'cardmarket', variant: 'standard' },
  { id: 'd', name: 'Pikachu', localId: '004', setId: 'promo', setName: 'Promos', rarity: 'Promo', imageUrl: 'https://img.test/d.webp', price: '999999.123456', currency: 'EUR', provider: 'cardmarket', variant: 'standard' },
];
const pokemon = { all: () => [], byId: () => undefined, byDexNumber: () => undefined, forGenerations: () => [] } as PokemonCatalog;
function fixture(pool = cards, playerIds = ['p1', 'p2']) {
  let now = 1_000; const catalog: TcgCardCatalog = { cardsFor: (filters) => pool.filter((card) => (filters.setIds.length === 0 || filters.setIds.includes(card.setId)) && (filters.rarities.length === 0 || card.rarity !== null && filters.rarities.includes(card.rarity))), options: () => ({ ready: true, cardCount: pool.length, generations: [], sets: [], rarities: [] }) };
  const context: GameContext = { players: playerIds.map((id) => ({ id, displayName: id, connected: true, active: true })), pokemon, tcgCards: catalog, get now() { return now; }, random: () => 0.999 };
  const initial = tcgHigherLowerGame.createInitialState({ ...defaultTcgHigherLowerConfig, rounds: 5 }, context);
  return { context, setNow: (value: number) => { now = value; }, state: tcgHigherLowerGame.start(initial, context) };
}
function forcePair(state: TcgHigherLowerState, previous: TcgComparableCard, current: TcgComparableCard): TcgHigherLowerState { return { ...state, sequence: [previous, current, ...state.sequence.slice(2)] }; }

describe('TCG Higher or Lower', () => {
  it('compares canonical precision for HIGHER, LOWER and SAME', () => {
    expect(tcgPriceComparison('5', '10')).toBe('HIGHER'); expect(tcgPriceComparison('10', '5')).toBe('LOWER'); expect(tcgPriceComparison('10', '10.0000')).toBe('SAME'); expect(tcgPriceComparison('4.124', '4.129')).toBe('HIGHER');
  });
  it('awards one point, tracks streaks, and awards two for SAME', () => {
    const game = fixture(); let state = forcePair(game.state, cards[0]!, cards[1]!);
    state = tcgHigherLowerGame.handleAction(state, 'p1', { type: 'ANSWER', choice: 'HIGHER' }, game.context).state;
    state = tcgHigherLowerGame.handleAction(state, 'p2', { type: 'ANSWER', choice: 'LOWER' }, game.context).state;
    expect(state).toMatchObject({ phase: 'ROUND_RESULTS', scores: { p1: 1, p2: 0 }, streaks: { p1: 1, p2: 0 } });
    state = { ...state, phase: 'ROUND_ACTIVE', roundNumber: 1, sequence: [cards[1]!, cards[2]!], answers: {}, roundEndsAt: 5_000, nextTransitionAt: null };
    state = tcgHigherLowerGame.handleAction(state, 'p1', { type: 'ANSWER', choice: 'SAME' }, game.context).state;
    state = tcgHigherLowerGame.handleAction(state, 'p2', { type: 'ANSWER', choice: 'SAME' }, game.context).state;
    expect(state.scores.p1).toBe(3); expect(state.streaks.p1).toBe(2); expect(state.playerStats.p1).toMatchObject({ sameCorrect: 1, bestStreak: 2 });
  });
  it('resets a streak and counts a timeout as an error', () => {
    const game = fixture(); let state = forcePair(game.state, cards[0]!, cards[1]!); state = { ...state, streaks: { p1: 4, p2: 2 } }; game.setNow(state.roundEndsAt!);
    state = tcgHigherLowerGame.handleTimeout(state, game.context);
    expect(state.streaks).toEqual({ p1: 0, p2: 0 }); expect(state.playerStats.p1).toMatchObject({ comparisons: 1, incorrect: 1, answered: 0 });
  });
  it('rejects double submit, spectators, and answers exactly at the deadline', () => {
    const game = fixture(); let state = game.state; state = tcgHigherLowerGame.handleAction(state, 'p1', { type: 'ANSWER', choice: 'HIGHER' }, game.context).state;
    expect(tcgHigherLowerGame.handleAction(state, 'p1', { type: 'ANSWER', choice: 'LOWER' }, game.context).accepted).toBe(false);
    expect(tcgHigherLowerGame.handleAction(state, 'spectator', { type: 'ANSWER', choice: 'LOWER' }, game.context).accepted).toBe(false);
    game.setNow(state.roundEndsAt!); expect(tcgHigherLowerGame.handleAction(state, 'p2', { type: 'ANSWER', choice: 'LOWER' }, game.context).accepted).toBe(false);
  });
  it('reveals early after every connected player responds and advances after three seconds', () => {
    const game = fixture(); let state = tcgHigherLowerGame.handleAction(game.state, 'p1', { type: 'ANSWER', choice: 'HIGHER' }, game.context).state; expect(state.phase).toBe('ROUND_ACTIVE'); state = tcgHigherLowerGame.handleAction(state, 'p2', { type: 'ANSWER', choice: 'LOWER' }, game.context).state; expect(state.phase).toBe('ROUND_RESULTS'); game.setNow(state.nextTransitionAt!); state = tcgHigherLowerGame.handleTimeout(state, game.context); expect(state).toMatchObject({ phase: 'ROUND_ACTIVE', roundNumber: 2 });
  });
  it('finishes the last round and ranks by points, best streak, then correct answers with real ties', () => {
    const game = fixture(); const state: TcgHigherLowerState = { ...game.state, phase: 'ROUND_RESULTS', roundNumber: 5, nextTransitionAt: 1_000, scores: { p1: 4, p2: 4 }, playerStats: { p1: { comparisons: 5, correct: 3, incorrect: 2, sameCorrect: 0, answered: 5, bestStreak: 2 }, p2: { comparisons: 5, correct: 3, incorrect: 2, sameCorrect: 1, answered: 5, bestStreak: 2 } } };
    const finished = tcgHigherLowerGame.handleTimeout(state, game.context); expect(finished.phase).toBe('GAME_RESULTS'); const results = tcgHigherLowerGame.getResults(finished); expect(results.winnerId).toBeNull(); expect(results.standings.map(({ position }) => position)).toEqual([1, 1]);
  });
  it('never repeats adjacent cards and supports a two-card pool', () => {
    const { state } = fixture(cards.slice(0, 2)); expect(state.sequence).toHaveLength(6); expect(state.sequence.every((card, index) => index === 0 || card.id !== state.sequence[index - 1]!.id)).toBe(true);
  });
  it('rejects insufficient and empty filtered pools clearly', () => {
    expect(() => fixture(cards.slice(0, 1))).toThrow(/al menos dos cartas/); expect(() => fixture([])).toThrow(/al menos dos cartas/);
  });
  it('does not expose the hidden price in public, player, serialized, or reconnect projections', () => {
    const game = fixture(); const secret = game.state.sequence[1]!.price; const publicState = tcgHigherLowerGame.getPublicState(game.state, game.context); const playerState = tcgHigherLowerGame.getPlayerState(game.state, 'p1', game.context); const socketPayload = JSON.stringify({ game: publicState, gamePlayerState: playerState });
    expect(publicState.currentCard.price).toBeNull(); expect(publicState.lastRound).toBeNull(); expect(socketPayload).not.toContain(JSON.stringify(secret));
    const reconnect = JSON.parse(socketPayload) as { game: { currentCard: { price: unknown } } }; expect(reconnect.game.currentCard.price).toBeNull();
  });
  it('hides card rarity while choosing when configured and reveals it with the result', () => {
    const game = fixture(); let state = { ...game.state, config: { ...game.state.config, showRarity: false } };
    const active = tcgHigherLowerGame.getPublicState(state, game.context); expect(active.previousCard.rarity).toBeNull(); expect(active.currentCard.rarity).toBeNull();
    game.setNow(state.roundEndsAt!); state = tcgHigherLowerGame.handleTimeout(state, game.context);
    const revealed = tcgHigherLowerGame.getPublicState(state, game.context); expect(revealed.previousCard.rarity).toBe('Rare'); expect(revealed.currentCard.rarity).toBe('Rare');
  });
  it('keeps a price snapshot when the backing catalog changes mid-game', () => {
    const mutable = cards.map((card) => ({ ...card })); const game = fixture(mutable); const snapshot = game.state.sequence.map(({ price }) => price); mutable.forEach((card) => { card.price = '0'; }); expect(game.state.sequence.map(({ price }) => price)).toEqual(snapshot);
  });
  it('reveals both exact prices and the correct comparison after resolution', () => {
    const game = fixture(); let state = forcePair(game.state, { ...cards[0]!, price: '0' }, { ...cards[3]!, price: '999999.123456' }); game.setNow(state.roundEndsAt!); state = tcgHigherLowerGame.handleTimeout(state, game.context); const publicState = tcgHigherLowerGame.getPublicState(state, game.context); expect(publicState.currentCard.price).toBe('999999.123456'); expect(publicState.lastRound).toMatchObject({ previousPrice: '0', currentPrice: '999999.123456', correctAnswer: 'HIGHER' });
  });
});
