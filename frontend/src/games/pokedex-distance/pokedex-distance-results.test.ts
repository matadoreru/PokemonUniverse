import type { DistanceRoundRecord } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { distanceBestLabel, distanceCell, distanceResultsSummary, distanceResultsTitle, distanceRoundLabel, distanceStandingLabel, distanceStatsLine, distanceTableFootnote } from './pokedex-distance-results';

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
      { playerId: 'p1', distances: [40, 3, 0], bestDistance: 0, eliminatedInRound: null, eliminationNote: null },
      { playerId: 'p2', distances: [40, 90, null], bestDistance: 40, eliminatedInRound: 1, eliminationNote: null },
      { playerId: 'p3', distances: [3, null, 12], bestDistance: 3, eliminatedInRound: 2, eliminationNote: null },
    ]);
    expect(summary.best).toEqual({ playerId: 'p1', distance: 0, roundNumber: 2, tiebreakDepth: 0 });
  });

  it('a tie for the best hit goes to the earlier round', () => {
    const summary = distanceResultsSummary([record(1, 0, { p1: 5, p2: 9 }, ['p2']), record(2, 0, { p1: 5, p3: 5 }, [])], ['p1', 'p2', 'p3']);
    expect(summary.best).toEqual({ playerId: 'p1', distance: 5, roundNumber: 1, tiebreakDepth: 0 });
  });

  it('distanceResultsSummary handles no-response players and a deserted game', () => {
    // p2 no respondió nunca; en la última ronda nadie respondió y cayeron todos (winnerId: null).
    const deserted = [record(1, 0, { p1: 7, p2: null, p3: 4 }, ['p2']), record(2, 0, { p1: null, p3: null }, ['p1', 'p3'])];
    const summary = distanceResultsSummary(deserted, ['p1', 'p2', 'p3']);
    expect(summary.players).toEqual([
      { playerId: 'p1', distances: [7, null], bestDistance: 7, eliminatedInRound: 2, eliminationNote: null },
      { playerId: 'p2', distances: [null, null], bestDistance: null, eliminatedInRound: 1, eliminationNote: null },
      { playerId: 'p3', distances: [4, null], bestDistance: 4, eliminatedInRound: 2, eliminationNote: null },
    ]);
    expect(summary.best).toEqual({ playerId: 'p3', distance: 4, roundNumber: 1, tiebreakDepth: 0 });
    const labels = summary.players.map((player) => distanceStandingLabel(player, null));
    expect(labels).toEqual(['Cayó en la ronda 2', 'Cayó en la ronda 1', 'Cayó en la ronda 2']);
    expect(JSON.stringify(summary) + labels.join()).not.toMatch(/NaN|Infinity|ronda 0/);
    // Sin ninguna elección no hay mejor acierto.
    expect(distanceResultsSummary([record(1, 0, { p1: null, p2: null }, ['p1', 'p2'])], ['p1', 'p2']).best).toBeNull();
    expect(distanceResultsSummary([], ['p1', 'p2'])).toEqual({
      players: [{ playerId: 'p1', distances: [], bestDistance: null, eliminatedInRound: null, eliminationNote: null }, { playerId: 'p2', distances: [], bestDistance: null, eliminatedInRound: null, eliminationNote: null }],
      best: null,
    });
  });

  it('labels rounds and tiebreaks', () => {
    expect(distanceRoundLabel(record(3, 0, {}, []))).toBe('R3');
    expect(distanceRoundLabel(record(3, 1, {}, []))).toBe('R3 · D1');
  });

  it('labels each standing', () => {
    expect(distanceStandingLabel({ playerId: 'p1', distances: [], bestDistance: null, eliminatedInRound: null, eliminationNote: null }, 'p1')).toBe('Ganador');
    expect(distanceStandingLabel({ playerId: 'p2', distances: [], bestDistance: null, eliminatedInRound: 3, eliminationNote: null }, 'p1')).toBe('Cayó en la ronda 3');
    expect(distanceStandingLabel({ playerId: 'p2', distances: [], bestDistance: null, eliminatedInRound: 1, eliminationNote: 'empate forzado: eligió más tarde' }, 'p1')).toBe('Cayó en la ronda 1 · empate forzado: eligió más tarde');
  });

  it('describes the best hit', () => {
    expect(distanceBestLabel({ playerId: 'p1', distance: 0, roundNumber: 2, tiebreakDepth: 0 })).toBe('Acierto exacto en R2');
    expect(distanceBestLabel({ playerId: 'p1', distance: 1, roundNumber: 1, tiebreakDepth: 2 })).toBe('A 1 número del objetivo en R1 · D2');
    expect(distanceBestLabel({ playerId: 'p1', distance: 12, roundNumber: 4, tiebreakDepth: 0 })).toBe('A 12 números del objetivo en R4');
  });

  it('keeps the tiebreak of the best hit', () => {
    const summary = distanceResultsSummary([record(1, 0, { p1: 40, p2: 40 }, []), record(1, 2, { p1: 2, p2: 30 }, ['p2'])], ['p1', 'p2']);
    expect(summary.best).toEqual({ playerId: 'p1', distance: 2, roundNumber: 1, tiebreakDepth: 2 });
    expect(distanceBestLabel(summary.best!)).toBe('A 2 números del objetivo en R1 · D2');
  });

  it('marks each table cell with tone, symbol and an accessible label', () => {
    const [tie, tiebreak, second] = history as [DistanceRoundRecord, DistanceRoundRecord, DistanceRoundRecord];
    expect(distanceCell(second, 'p1')).toEqual({ text: '0', mark: 'hit', tone: 'ok', label: 'R2: acierto exacto' });
    expect(distanceCell(tiebreak, 'p1')).toEqual({ text: '3', mark: null, tone: 'info', label: 'R1 · D1: a 3' });
    expect(distanceCell(tie, 'p1')).toEqual({ text: '40', mark: null, tone: 'neutral', label: 'R1: a 40' });
    expect(distanceCell(tiebreak, 'p2')).toEqual({ text: '90', mark: 'fell', tone: 'bad', label: 'R1 · D1: a 90, cayó' });
    expect(distanceCell(record(1, 0, { p1: null }, ['p1']), 'p1')).toEqual({ text: '—', mark: 'fell', tone: 'bad', label: 'R1: sin respuesta, cayó' });
    expect(distanceCell(tiebreak, 'p3')).toEqual({ text: '—', mark: null, tone: null, label: 'R1 · D1: no jugaba' });
    expect(distanceCell(second, 'p3').tone).toBe('bad');
    expect(distanceCell(record(1, 0, { p1: 10 }, []), 'p1').tone).toBe('info');
    expect(distanceCell(record(1, 0, { p1: 11 }, []), 'p1').tone).toBe('neutral');
  });

  it('writes the stats line with plurals and tiebreaks only when there are any', () => {
    expect(distanceStatsLine({ exactHits: 1, averageDistance: 12.5, tiebreaksWon: 1 })).toBe('1 acierto exacto · distancia media 12,5 · 1 desempate superado');
    expect(distanceStatsLine({ exactHits: 0, averageDistance: 0, tiebreaksWon: 0 })).toBe('0 aciertos exactos · distancia media 0');
    expect(distanceStatsLine({ exactHits: 2, averageDistance: 3, tiebreaksWon: 2 })).toBe('2 aciertos exactos · distancia media 3 · 2 desempates superados');
    expect(distanceStatsLine({ exactHits: 0, averageDistance: 181.754, tiebreaksWon: 0 })).toBe('0 aciertos exactos · distancia media 181,75');
  });

  it('explains a forced-tie elimination at the tiebreak cap', () => {
    // Tope de desempates (D3): p1 y p2 empatan a 20 y cae p2, que eligió más tarde.
    const forced = record(1, 3, { p1: 20, p2: 20, p3: 4 }, ['p2']);
    const summary = distanceResultsSummary([record(1, 0, { p1: 20, p2: 20, p3: 4 }, []), forced], ['p1', 'p2', 'p3']);
    expect(summary.players.map((player) => player.eliminationNote)).toEqual([null, 'empate forzado: eligió más tarde', null]);
    expect(distanceStandingLabel(summary.players[1]!, 'p1')).toBe('Cayó en la ronda 1 · empate forzado: eligió más tarde');
    expect(distanceCell(forced, 'p2')).toEqual({ text: '20', mark: 'fell', tone: 'bad', label: 'R1 · D3: a 20, cayó (empate forzado: eligió más tarde)' });
    expect(distanceCell(forced, 'p1').label).toBe('R1 · D3: a 20');
    // Si eligieron a la vez, caen todos los empatados.
    const together = record(1, 3, { p1: 20, p2: 20 }, ['p1', 'p2']);
    expect(distanceCell(together, 'p1').label).toBe('R1 · D3: a 20, cayó (empate forzado: eligieron a la vez)');
    // En el tope, quien cae sin empate (el más lejano, o sin respuesta) no lleva nota.
    expect(distanceCell(record(1, 3, { p1: 20, p2: 30 }, ['p2']), 'p2').label).toBe('R1 · D3: a 30, cayó');
    expect(distanceCell(record(1, 3, { p1: 20, p2: null }, ['p2']), 'p2').label).toBe('R1 · D3: sin respuesta, cayó');
    // Por debajo del tope no hay empate forzado.
    expect(distanceCell(record(1, 2, { p1: 20, p2: 20 }, ['p2']), 'p2').label).toBe('R1 · D2: a 20, cayó');
  });
});

describe('distanceResultsTitle y distanceTableFootnote', () => {
  it('Clásico sin ganador es desierta; Por puntos sin líder único es empate salvo que nadie sume', () => {
    expect(distanceResultsTitle(false, 'p1', [])).toBe('Resultado de la partida');
    expect(distanceResultsTitle(false, null, [{ points: 0 }])).toBe('Partida desierta');
    expect(distanceResultsTitle(true, null, [{ points: 90 }, { points: 90 }])).toBe('Empate en cabeza');
    expect(distanceResultsTitle(true, null, [{ points: 0 }, { points: 0 }])).toBe('Partida desierta');
  });
  it('la leyenda de Por puntos no habla de caídas ni desempates', () => {
    expect(distanceTableFootnote(true)).not.toMatch(/cayó|desempate/);
    expect(distanceTableFootnote(false)).toContain('cayó');
  });
});
