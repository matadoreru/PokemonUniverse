import type { DistanceRoundRecord } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { distanceBestLabel, distanceCell, distanceResultsSummary, distanceRoundLabel, distanceStandingLabel, distanceStatsLine } from './pokedex-distance-results';

const record = (roundNumber: number, tiebreakDepth: number, distances: Record<string, number | null>, eliminatedIds: string[]): DistanceRoundRecord =>
  ({ roundNumber, tiebreakDepth, targetDexNumber: 100, distances, eliminatedIds });

// Ronda 1 con empate entre p1 y p2 (p3 a salvo), desempate en el que cae p2, ronda 2 en la que cae p3.
const history: DistanceRoundRecord[] = [
  record(1, 0, { p1: 40, p2: 40, p3: 3 }, []),
  record(1, 1, { p1: 3, p2: 90 }, ['p2']),
  record(2, 0, { p1: 0, p3: 12 }, ['p3']),
];

describe('Pokédex Distance: resultados', () => {
  it('summarises distances, best hit and elimination round', () => {
    const summary = distanceResultsSummary(history, ['p1', 'p2', 'p3']);
    expect(summary.players).toEqual([
      { playerId: 'p1', distances: [40, 3, 0], bestDistance: 0, eliminatedInRound: null },
      { playerId: 'p2', distances: [40, 90, null], bestDistance: 40, eliminatedInRound: 1 },
      { playerId: 'p3', distances: [3, null, 12], bestDistance: 3, eliminatedInRound: 2 },
    ]);
    expect(summary.best).toEqual({ playerId: 'p1', distance: 0, roundNumber: 2 });
  });

  it('a tie for the best hit goes to the earlier round', () => {
    const summary = distanceResultsSummary([record(1, 0, { p1: 5, p2: 9 }, ['p2']), record(2, 0, { p1: 5, p3: 5 }, [])], ['p1', 'p2', 'p3']);
    expect(summary.best).toEqual({ playerId: 'p1', distance: 5, roundNumber: 1 });
  });

  it('distanceResultsSummary handles no-response players and a deserted game', () => {
    // p2 no respondió nunca; en la última ronda nadie respondió y cayeron todos (winnerId: null).
    const deserted = [record(1, 0, { p1: 7, p2: null, p3: 4 }, ['p2']), record(2, 0, { p1: null, p3: null }, ['p1', 'p3'])];
    const summary = distanceResultsSummary(deserted, ['p1', 'p2', 'p3']);
    expect(summary.players).toEqual([
      { playerId: 'p1', distances: [7, null], bestDistance: 7, eliminatedInRound: 2 },
      { playerId: 'p2', distances: [null, null], bestDistance: null, eliminatedInRound: 1 },
      { playerId: 'p3', distances: [4, null], bestDistance: 4, eliminatedInRound: 2 },
    ]);
    expect(summary.best).toEqual({ playerId: 'p3', distance: 4, roundNumber: 1 });
    const labels = summary.players.map((player) => distanceStandingLabel(player, null));
    expect(labels).toEqual(['Cayó en la ronda 2', 'Cayó en la ronda 1', 'Cayó en la ronda 2']);
    expect(JSON.stringify(summary) + labels.join()).not.toMatch(/NaN|Infinity|ronda 0/);
    // Sin ninguna elección no hay mejor acierto.
    expect(distanceResultsSummary([record(1, 0, { p1: null, p2: null }, ['p1', 'p2'])], ['p1', 'p2']).best).toBeNull();
    expect(distanceResultsSummary([], ['p1', 'p2'])).toEqual({
      players: [{ playerId: 'p1', distances: [], bestDistance: null, eliminatedInRound: null }, { playerId: 'p2', distances: [], bestDistance: null, eliminatedInRound: null }],
      best: null,
    });
  });

  it('labels rounds and tiebreaks', () => {
    expect(distanceRoundLabel(record(3, 0, {}, []))).toBe('R3');
    expect(distanceRoundLabel(record(3, 1, {}, []))).toBe('R3 · D1');
  });

  it('labels each standing', () => {
    expect(distanceStandingLabel({ playerId: 'p1', distances: [], bestDistance: null, eliminatedInRound: null }, 'p1')).toBe('Ganador');
    expect(distanceStandingLabel({ playerId: 'p2', distances: [], bestDistance: null, eliminatedInRound: 3 }, 'p1')).toBe('Cayó en la ronda 3');
    expect(distanceStandingLabel({ playerId: 'p3', distances: [], bestDistance: null, eliminatedInRound: null }, 'p1')).toBe('Superviviente');
  });

  it('describes the best hit', () => {
    expect(distanceBestLabel({ playerId: 'p1', distance: 0, roundNumber: 2 })).toBe('Acierto exacto en la ronda 2');
    expect(distanceBestLabel({ playerId: 'p1', distance: 1, roundNumber: 1 })).toBe('A 1 número del objetivo en la ronda 1');
    expect(distanceBestLabel({ playerId: 'p1', distance: 12, roundNumber: 4 })).toBe('A 12 números del objetivo en la ronda 4');
  });

  it('marks each table cell with tone, symbol and an accessible label', () => {
    const [tie, tiebreak, second] = history as [DistanceRoundRecord, DistanceRoundRecord, DistanceRoundRecord];
    expect(distanceCell(second, 'p1')).toEqual({ text: '0', mark: '✓', tone: 'leaf', label: 'R2: acierto exacto' });
    expect(distanceCell(tiebreak, 'p1')).toEqual({ text: '3', mark: null, tone: 'aqua', label: 'R1 · D1: a 3' });
    expect(distanceCell(tie, 'p1')).toEqual({ text: '40', mark: null, tone: 'ink', label: 'R1: a 40' });
    expect(distanceCell(tiebreak, 'p2')).toEqual({ text: '90', mark: '✗', tone: 'berry', label: 'R1 · D1: a 90, cayó' });
    expect(distanceCell(record(1, 0, { p1: null }, ['p1']), 'p1')).toEqual({ text: '—', mark: '✗', tone: 'berry', label: 'R1: sin respuesta, cayó' });
    expect(distanceCell(tiebreak, 'p3')).toEqual({ text: '—', mark: null, tone: 'muted', label: 'R1 · D1: no jugaba' });
    expect(distanceCell(second, 'p3').tone).toBe('berry');
    expect(distanceCell(record(1, 0, { p1: 10 }, []), 'p1').tone).toBe('aqua');
    expect(distanceCell(record(1, 0, { p1: 11 }, []), 'p1').tone).toBe('ink');
  });

  it('writes the stats line with plurals and tiebreaks only when there are any', () => {
    expect(distanceStatsLine({ exactHits: 1, averageDistance: 12.5, tiebreaksWon: 1 })).toBe('1 acierto exacto · distancia media 12.5 · 1 desempate superado');
    expect(distanceStatsLine({ exactHits: 0, averageDistance: 0, tiebreaksWon: 0 })).toBe('0 aciertos exactos · distancia media 0');
    expect(distanceStatsLine({ exactHits: 2, averageDistance: 3, tiebreaksWon: 2 })).toBe('2 aciertos exactos · distancia media 3 · 2 desempates superados');
  });
});
