import type { SecretRankingPokemon, SecretRankingRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RANKING_DISTANCE, averageDistance, closestAverage, formatDistance, moveRankingItem, rankingFocusAfterMove, rankingMoveText, rankingPlayerStatus,
  rankingPositionOf, rankingStandings, secretRankingAnnouncement, secretRankingCurrentStep, secretRankingHeading, secretRankingStatsLine, secretRankingSummary,
  secretRankingVerdict, shouldRefocusSubmit, submitRanking,
} from './presentation';

const pokemon: SecretRankingPokemon[] = ['Pikachu', 'Eevee', 'Snorlax', 'Gengar', 'Psyduck'].map((name) => ({ id: name.toLowerCase(), name, sprite: `/${name}.png` }));
const names: Record<string, string> = { p1: 'Eru', p2: 'Ana', p3: 'Leo' };
const nameOf = (id: string) => names[id] ?? id;

function result(players: SecretRankingRoundResult['players'], consensus = true): SecretRankingRoundResult {
  return { prompt: 'De más adorable a menos', pokemon, consensus: consensus ? pokemon.map((entry, index) => ({ pokemon: entry, averagePosition: index + 1 })) : [], players };
}
const three = result({
  p1: { ranking: pokemon, distance: 1.5, position: 1, pointsAwarded: 6 },
  p2: { ranking: [...pokemon].reverse(), distance: 8, position: 2, pointsAwarded: 3 },
  p3: { ranking: null, distance: null, position: null, pointsAwarded: 0 },
});

describe('mover en la lista', () => {
  it('sube y baja un puesto sin tocar el original', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect(moveRankingItem(order, 2, -1)).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(moveRankingItem(order, 2, 1)).toEqual(['a', 'b', 'd', 'c', 'e']);
    expect(order).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('fuera de los extremos no cambia nada', () => {
    expect(moveRankingItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveRankingItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveRankingItem(['a', 'b'], 5, -1)).toEqual(['a', 'b']);
  });
  it('el foco sigue en el mismo botón salvo al llegar a un extremo, donde pasa al contrario', () => {
    expect(rankingFocusAfterMove(2, 5, -1)).toBe('up');
    expect(rankingFocusAfterMove(0, 5, -1)).toBe('down');
    expect(rankingFocusAfterMove(3, 5, 1)).toBe('down');
    expect(rankingFocusAfterMove(4, 5, 1)).toBe('up');
  });
  it('anuncia el nuevo puesto', () => {
    expect(rankingMoveText('Pikachu', 2)).toBe('Pikachu pasa al puesto 2.');
  });
});

describe('fases, título y región viva', () => {
  it('dos pasos: ordenar y resultado', () => {
    expect(secretRankingCurrentStep('ROUND_ACTIVE')).toBe('order');
    expect(secretRankingCurrentStep('ROUND_RESULTS')).toBe('result');
    expect(secretRankingCurrentStep('GAME_STARTING')).toBeNull();
  });
  it('título por fase', () => {
    expect(secretRankingHeading('ROUND_ACTIVE', null, false)).toBe('Ordena el ranking');
    expect(secretRankingHeading('ROUND_ACTIVE', null, true)).toBe('Ranking bloqueado');
    expect(secretRankingHeading('ROUND_RESULTS', three, false)).toBe('El consenso del grupo');
    expect(secretRankingHeading('ROUND_RESULTS', result({}, false), false)).toBe('Sin rankings');
  });
  it('cada movimiento se anuncia aunque repita el texto del anterior', () => {
    const base = { phase: 'ROUND_ACTIVE' as const, roundNumber: 2, locked: false, result: null, nameOf };
    expect(secretRankingAnnouncement({ ...base, move: null })).toBe('Ronda 2: ordena los cinco Pokémon.');
    const first = secretRankingAnnouncement({ ...base, move: 'Pikachu pasa al puesto 2.', moveSeq: 1 });
    const again = secretRankingAnnouncement({ ...base, move: 'Pikachu pasa al puesto 2.', moveSeq: 2 });
    expect(first).not.toBe(again);
    expect(first.trim().replace('​', '')).toBe(again);
    expect(secretRankingAnnouncement({ ...base, move: 'X', locked: true })).toMatch(/^Ranking bloqueado/);
    expect(secretRankingAnnouncement({ ...base, phase: 'ROUND_RESULTS', move: null, result: three })).toBe('Ronda 2 terminada. Eru fue quien más se acercó al grupo, a distancia 1,50.');
  });
});

describe('revelación', () => {
  it('ordena a los jugadores por cercanía y deja al final a quien no envió', () => {
    expect(rankingStandings(three)).toEqual(['p1', 'p2', 'p3']);
    const lone = result({ p3: { ranking: null, distance: null, position: null, pointsAwarded: 0 }, p2: { ranking: pokemon, distance: null, position: null, pointsAwarded: 0 } });
    expect(rankingStandings(lone)).toEqual(['p2', 'p3']);
  });
  it('resume el resultado: el más cercano, empate, uno solo y nadie', () => {
    expect(secretRankingSummary(three, nameOf)).toBe('Eru fue quien más se acercó al grupo, a distancia 1,50.');
    const tie = result({ p1: { ranking: pokemon, distance: 2, position: 1, pointsAwarded: 6 }, p2: { ranking: pokemon, distance: 2, position: 1, pointsAwarded: 6 } });
    expect(secretRankingSummary(tie, nameOf)).toBe('Empate en cabeza entre Eru y Ana, a distancia 2,00.');
    const perfect = result({ p1: { ranking: pokemon, distance: 0, position: 1, pointsAwarded: 6 }, p2: { ranking: pokemon, distance: 1, position: 2, pointsAwarded: 3 } });
    expect(secretRankingSummary(perfect, nameOf)).toBe('Eru coincidió del todo con el grupo.');
    expect(secretRankingSummary(result({ p1: { ranking: pokemon, distance: null, position: null, pointsAwarded: 0 } }), nameOf)).toBe('Solo llegó un ranking: no hubo con quién compararlo.');
    expect(secretRankingSummary(result({}, false), nameOf)).toBe('Nadie completó el ranking a tiempo.');
  });
  it('estado de cada jugador en texto', () => {
    expect(rankingPlayerStatus(three, 'p1')).toEqual({ tone: 'ok', text: 'El más cercano' });
    expect(rankingPlayerStatus(three, 'p2')).toEqual({ tone: 'neutral', text: '2.º puesto' });
    expect(rankingPlayerStatus(three, 'p3')).toEqual({ tone: 'bad', text: 'Sin ranking' });
    expect(rankingPlayerStatus(result({ p1: { ranking: pokemon, distance: null, position: null, pointsAwarded: 0 } }), 'p1').text).toBe('Sin con quién comparar');
  });
  it('puesto que dio cada uno a un Pokémon', () => {
    expect(rankingPositionOf(three, 'p2', 'pikachu')).toBe(5);
    expect(rankingPositionOf(three, 'p3', 'pikachu')).toBeNull();
  });
  it('veredicto propio', () => {
    expect(secretRankingVerdict(three, 'p1', true)).toEqual({ tone: 'ok', text: '¡Fuiste quien más se acercó!', points: 6 });
    expect(secretRankingVerdict(three, 'p2', true)).toEqual({ tone: 'info', text: 'Quedaste 2.º · distancia 8,00', points: 3 });
    expect(secretRankingVerdict(three, 'p3', true).text).toBe('No enviaste ranking');
    expect(secretRankingVerdict(three, 'p1', false).text).toBe('Estás observando');
  });
  it('la distancia máxima de cinco Pokémon es 12 y se escribe con coma', () => {
    expect(MAX_RANKING_DISTANCE).toBe(12);
    expect(formatDistance(1.5)).toBe('1,50');
  });
});

describe('envío', () => {
  it('tras el éxito sigue ocupado hasta que el servidor devuelve el ranking', async () => {
    let busy: number | null = null;
    const set = (update: (current: number | null) => number | null) => { busy = update(busy); };
    expect(await submitRanking(3, async () => undefined, set)).toBe(true);
    expect(busy).toBe(3);
  });
  it('si el servidor lo rechaza, suelta el botón', async () => {
    let busy: number | null = null;
    const set = vi.fn((update: (current: number | null) => number | null) => { busy = update(busy); });
    expect(await submitRanking(3, async () => { throw new Error('El tiempo ha terminado.'); }, set)).toBe(false);
    expect(busy).toBeNull();
  });
});

describe('resultados', () => {
  const stats = { roundsPlayed: 3, rankingsSubmitted: 2, roundWins: 1, perfectMatches: 0, distanceTotal: 3 };
  it('línea de métricas', () => {
    expect(secretRankingStatsLine(stats)).toBe('1 victoria · 0 coincidencias perfectas · 2/3 rankings · distancia media 1,50');
    expect(secretRankingStatsLine({ roundsPlayed: 1 })).toBe('0 victorias · 0 coincidencias perfectas · 0/1 rankings · distancia media —');
    expect(averageDistance({ rankingsSubmitted: 0 })).toBeNull();
  });
  it('menor distancia media: una media de 0 cuenta y quien no envió nada no', () => {
    expect(closestAverage([{ name: 'Eru', stats: { rankingsSubmitted: 1, distanceTotal: 0 } }, { name: 'Ana', stats: { rankingsSubmitted: 0 } }, { name: 'Leo', stats: { rankingsSubmitted: 2, distanceTotal: 4 } }])).toEqual({ value: 0, names: ['Eru'] });
    expect(closestAverage([{ name: 'Ana', stats: { rankingsSubmitted: 0 } }])).toBeNull();
  });
});

describe('foco tras un rechazo', () => {
  const busy = { round: 2, busy: true };
  it('vuelve a «Bloquear ranking» si se rechaza en la misma ronda con el foco en el body', () => {
    expect(shouldRefocusSubmit(busy, { round: 2, busy: false, open: true }, true)).toBe(true);
  });
  it('no lo mueve si el foco ya está en otro sitio, si cambia la ronda, si se aceptó o si no estaba ocupado', () => {
    expect(shouldRefocusSubmit(busy, { round: 2, busy: false, open: true }, false)).toBe(false);
    expect(shouldRefocusSubmit(busy, { round: 3, busy: false, open: true }, true)).toBe(false);
    expect(shouldRefocusSubmit(busy, { round: 2, busy: false, open: false }, true)).toBe(false);
    expect(shouldRefocusSubmit({ round: 2, busy: false }, { round: 2, busy: false, open: true }, true)).toBe(false);
  });
});
