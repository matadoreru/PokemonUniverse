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

  it('abre los carriles que hagan falta cuando se amontonan', () => {
    const { markers } = rulerLayout(round(200, { p1: 1, p2: 2, p3: 3, p4: 4, p5: 5 }));
    expect(markers.map((m) => m.lane)).toEqual([0, 1, 2, 3, 4]);
  });

  it('dos marcadores del mismo carril siempre quedan a la separación pedida (azar, hasta 8 jugadores)', () => {
    // Generador determinista (LCG) para que el test no dependa de la suerte.
    let seed = 12345;
    const next = (max: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return 1 + seed % max; };
    // 15,5 puntos: un marcador de 44 px en la regla de 284 px que queda a 390 px de ancho.
    for (const gap of [8, 15.5, 30]) {
      for (let run = 0; run < 300; run++) {
        const players = 2 + next(7) - 1;
        const target = next(1025);
        // La mitad de las veces, todos cerca del objetivo o entre sí: el caso que amontona.
        const spread = run % 2 === 0 ? 1025 : 12;
        const base = spread === 1025 ? 0 : next(1000);
        const picks = Object.fromEntries(Array.from({ length: players }, (_, i) => [`p${i}`, run % 3 === 0 && i === 0 ? null : base + next(spread)]));
        const { markers } = rulerLayout(round(target, picks), gap);
        const placed = markers.filter((m) => m.dexNumber !== null);
        for (const a of placed) {
          expect(a.offsetPercent).toBeGreaterThanOrEqual(2);
          expect(a.offsetPercent).toBeLessThanOrEqual(98);
          for (const b of placed) {
            if (a !== b && a.lane === b.lane) expect(Math.abs(a.offsetPercent - b.offsetPercent)).toBeGreaterThanOrEqual(gap - 1e-9);
          }
        }
        expect(Math.max(0, ...placed.map((m) => m.lane))).toBeLessThan(Math.max(1, placed.length));
      }
    }
  });

  it('marca el empate de quien no cae', () => {
    const tie = { ...round(50, { p1: 40, p2: 60, p3: 52 }), reason: 'TIE' as const, tiedIds: ['p1', 'p2'] };
    expect(rulerLayout(tie).markers.map((m) => m.tied)).toEqual([true, true, false]);
    const forced = { ...round(50, { p1: 40, p2: 60 }, ['p2']), tiedIds: ['p1', 'p2'] };
    expect(rulerLayout(forced).markers.map((m) => m.tied)).toEqual([true, false]);
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
  const marker = { playerId: 'p1', dexNumber: 4, distance: 21, offsetPercent: 30, lane: 0, eliminated: false, exact: false, tied: false };

  it('describe cada marcador para lectores de pantalla', () => {
    expect(DISTANCE_RULER_CAPTION).toBe('Distancia al objetivo');
    expect(distanceMarkerLabel('Ana', marker)).toBe('Ana: #004, a 21');
    expect(distanceMarkerLabel('Ana', { ...marker, eliminated: true })).toBe('Ana: #004, a 21, eliminado');
    expect(distanceMarkerLabel('Ana', { ...marker, tied: true })).toBe('Ana: #004, a 21, empate');
    expect(distanceMarkerLabel('Leo', { ...marker, dexNumber: 25, distance: 0, exact: true })).toBe('Leo: #025, acierto exacto');
    expect(distanceMarkerLabel('Eru', { ...marker, dexNumber: null, distance: null, eliminated: true })).toBe('Eru: sin respuesta, eliminado');
  });
});
