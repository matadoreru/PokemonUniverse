import type { PublicRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { DISTANCE_RULER_CAPTION, distanceMarkerLabel, formatDexNumber, rulerLayout } from './distance-ruler';

/** Ronda revelada con objetivo `target` y, por jugador, el número de la Pokédex elegido (`null`: sin respuesta). */
function round(target: number, picks: Record<string, number | null>, eliminatedIds: string[] = []): PublicRoundResult {
  const selections: PublicRoundResult['selections'] = {};
  for (const [id, dex] of Object.entries(picks)) {
    if (dex === null) continue;
    selections[id] = { pokemonId: `p-${dex}`, pokemonName: `Poké ${dex}`, sprite: `/${dex}.png`, dexNumber: dex, distance: Math.abs(dex - target), selectedAt: 1 };
  }
  return {
    targetDexNumber: target, eligibleIds: Object.keys(picks), selections, eliminatedIds, reason: 'FARTHEST', tiedIds: [],
    targetPokemon: { id: 'target', name: 'Objetivo', nationalDexNumber: target, sprite: `/${target}.png` },
  };
}

describe('rulerLayout', () => {
  it('centra el objetivo: un acierto exacto queda en el 50 % y se marca', () => {
    const { markers } = rulerLayout(round(25, { p1: 25, p2: 40 }));
    expect(markers[0]).toMatchObject({ playerId: 'p1', dexNumber: 25, distance: 0, offsetPercent: 50, exact: true, eliminated: false });
    expect(markers[1]).toMatchObject({ playerId: 'p2', exact: false });
  });

  it('la ventana es max(10, ceil(maxDistance × 1.15)) y las distancias iguales quedan simétricas', () => {
    expect(rulerLayout(round(100, { p1: 98, p2: 103 })).window).toBe(10);
    const { window, markers } = rulerLayout(round(100, { p1: 60, p2: 140 }));
    expect(window).toBe(46);
    const [left, right] = markers;
    expect(left!.offsetPercent).toBeCloseTo(50 - 40 / 46 * 50);
    expect(right!.offsetPercent).toBeCloseTo(50 + 40 / 46 * 50);
    expect(left!.offsetPercent + right!.offsetPercent).toBeCloseTo(100);
  });

  it('limita las posiciones al 2–98 %', () => {
    // Con datos coherentes la ventana (≥ 1,15 × la mayor distancia) deja todo entre el 6,5 y el 93,5 %; el límite es
    // defensivo: aquí la distancia que manda el servidor no cuadra con el número elegido.
    const data = round(50, { p1: 40, p2: 60 });
    data.selections.p1 = { ...data.selections.p1!, dexNumber: 1, distance: 1 };
    data.selections.p2 = { ...data.selections.p2!, dexNumber: 151, distance: 1 };
    expect(rulerLayout(data).markers.map((m) => m.offsetPercent)).toEqual([2, 98]);
    const extremes = rulerLayout(round(50, { p1: 1, p2: 99 })).markers.map((m) => m.offsetPercent);
    expect(Math.min(...extremes)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...extremes)).toBeLessThanOrEqual(98);
  });

  it('sube de carril a los marcadores a menos de 8 puntos de otro', () => {
    // Ventana 115 (100 × 1.15): 1 y 4 quedan a 1,3 puntos; 25 está a más de 8 de los dos.
    const { markers } = rulerLayout(round(101, { p1: 1, p2: 4, p3: 25, p4: 5 }, ['p1']));
    const lane = (id: string) => markers.find((m) => m.playerId === id)!.lane;
    expect(lane('p1')).toBe(0);
    expect(lane('p2')).toBe(1);
    expect(lane('p4')).toBe(2);
    expect(lane('p3')).toBe(0);
    expect(markers.find((m) => m.playerId === 'p1')!.eliminated).toBe(true);
  });

  it('nunca pasa del carril 2 aunque se amontonen más de tres', () => {
    const { markers } = rulerLayout(round(200, { p1: 1, p2: 2, p3: 3, p4: 4, p5: 5 }));
    expect(Math.max(...markers.map((m) => m.lane))).toBe(2);
    expect(markers.every((m) => m.lane >= 0)).toBe(true);
  });

  it('deja fuera de la regla a quien no respondió', () => {
    const { window, markers } = rulerLayout(round(25, { p1: 30, p2: null }, ['p2']));
    expect(window).toBe(10);
    expect(markers.find((m) => m.playerId === 'p2')).toMatchObject({ dexNumber: null, distance: null, eliminated: true, exact: false });
  });

  it('sin ninguna respuesta usa la ventana mínima', () => {
    const { window, markers } = rulerLayout(round(25, { p1: null, p2: null }, ['p1', 'p2']));
    expect(window).toBe(10);
    expect(markers.every((m) => m.dexNumber === null)).toBe(true);
  });
});

describe('formatDexNumber', () => {
  it('rellena con ceros hasta tres cifras', () => {
    expect(formatDexNumber(25)).toBe('#025');
    expect(formatDexNumber(1025)).toBe('#1025');
  });
});

describe('textos de la regla', () => {
  const marker = { playerId: 'p1', dexNumber: 4, distance: 21, offsetPercent: 30, lane: 0, eliminated: false, exact: false };

  it('describe cada marcador para lectores de pantalla', () => {
    expect(DISTANCE_RULER_CAPTION).toBe('Distancia al objetivo');
    expect(distanceMarkerLabel('Ana', marker)).toBe('Ana: #004, a 21');
    expect(distanceMarkerLabel('Ana', { ...marker, eliminated: true })).toBe('Ana: #004, a 21, eliminado');
    expect(distanceMarkerLabel('Leo', { ...marker, dexNumber: 25, distance: 0, exact: true })).toBe('Leo: #025, acierto exacto');
    expect(distanceMarkerLabel('Eru', { ...marker, dexNumber: null, distance: null, eliminated: true })).toBe('Eru: sin respuesta, eliminado');
  });
});
