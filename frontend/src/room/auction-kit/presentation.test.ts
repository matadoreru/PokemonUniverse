import { describe, expect, it } from 'vitest';
import { amountText, bidBlock, bidDraftError, bidShortcutsLive, bidEpoch, bidLog, bidSteps, clampBid, parseBid, safeAmount, type BidBlockInput } from './presentation';

const base: BidBlockInput = { participating: true, open: true, canRaise: true, canPass: true, leading: false, passed: false, full: false, min: 5, max: 20, turnName: 'Ana' };

describe('cantidades de la puja', () => {
  it('safeAmount nunca da NaN ni negativos', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -3, '', 'abc', undefined, null, {}]) expect(safeAmount(value)).toBe(0);
    expect(safeAmount(7.9)).toBe(7);
    expect(safeAmount('12')).toBe(12);
  });

  it('parseBid solo acepta enteros positivos escritos', () => {
    expect(parseBid('15')).toBe(15);
    expect(parseBid(' 7 ')).toBe(7);
    for (const text of ['', '0', '-2', '2.5', '1e3', 'abc', '5 monedas']) expect(parseBid(text)).toBeNull();
  });

  it('clampBid ajusta al presupuesto y a la mínima', () => {
    expect(clampBid(50, 5, 20)).toBe(20);
    expect(clampBid(2, 5, 20)).toBe(5);
    expect(clampBid('12', 5, 20)).toBe(12);
    expect(clampBid('', 5, 20)).toBe(5);
    expect(clampBid('abc', 5, 20)).toBe(5);
    expect(clampBid(Number.NaN, 5, 20)).toBe(5);
    expect(clampBid(-4, 5, 20)).toBe(5);
    // Sin presupuesto para la mínima: la mínima (el bloqueo lo dice bidBlock), nunca negativo ni NaN.
    expect(clampBid(10, 5, 3)).toBe(5);
    expect(clampBid(10, Number.NaN, Number.NaN)).toBe(1);
  });

  it('bidSteps da la mínima, +2, +5 y «Todo» sin repetir y sin pasarse', () => {
    expect(bidSteps(5, 20).map((step) => [step.label, step.value, step.shortcut])).toEqual([['Mínima', 5, '1'], ['+2', 7, '2'], ['+5', 10, '3'], ['Todo', 20, '4']]);
    // Con poco presupuesto: los que no caben no salen y «Todo» no repite la mínima.
    expect(bidSteps(5, 8).map((step) => step.value)).toEqual([5, 7, 8]);
    expect(bidSteps(5, 5).map((step) => step.value)).toEqual([5]);
    expect(bidSteps(5, 4)).toEqual([]);
    expect(bidSteps(3, 20, { allIn: false }).map((step) => step.value)).toEqual([3, 5, 8]);
    expect(bidSteps(Number.NaN, -2)).toEqual([]);
  });

  it('bidDraftError explica lo escrito en texto', () => {
    expect(bidDraftError('8', 5, 20)).toBeNull();
    expect(bidDraftError('', 5, 20)).toBe('Escribe una cantidad entera.');
    expect(bidDraftError('3', 5, 20)).toBe('La mínima es 5.');
    expect(bidDraftError('25', 5, 20)).toBe('No te llega: máximo 20 monedas.');
  });

  it('amountText y bidEpoch', () => {
    expect(amountText(1)).toBe('1 moneda');
    expect(amountText(3)).toBe('3 monedas');
    expect(amountText(-3)).toBe('0 monedas');
    expect(amountText(4, 'Pokémon')).toBe('4 Pokémon');
    expect(bidEpoch(2, 3)).not.toBe(bidEpoch(2, 4));
    expect(bidEpoch(3, 0)).not.toBe(bidEpoch(2, 0));
  });
});

describe('bloqueo de la puja', () => {
  it('abierta en tu turno, con la mínima y el máximo en texto', () => {
    expect(bidBlock(base)).toMatchObject({ reason: 'open', canRaise: true, canPass: true, title: 'Tu turno', text: 'Mínima 5 · puedes llegar a 20 monedas.' });
  });

  it('cada bloqueo con su texto y sin botones', () => {
    const cases: Array<[Partial<BidBlockInput>, string, string]> = [
      [{ participating: false }, 'watching', 'Estás observando'],
      [{ open: false }, 'closed', 'Puja cerrada'],
      [{ leading: true, canRaise: false, canPass: false }, 'leading', 'Ya vas ganando'],
      [{ full: true }, 'full', 'Equipo completo'],
      [{ passed: true, canRaise: false, canPass: false }, 'passed', 'Has pasado'],
      [{ max: 3, canRaise: false, canPass: false }, 'noBudget', 'Sin presupuesto'],
      [{ canRaise: false, canPass: false }, 'waiting', 'Esperando tu turno'],
    ];
    for (const [input, reason, title] of cases) {
      const block = bidBlock({ ...base, ...input });
      expect(block, reason).toMatchObject({ reason, title, canRaise: false, canPass: false });
      expect(block.text).not.toMatch(/NaN|-\d/);
    }
  });

  it('va ganando manda aunque el servidor diga otra cosa, y el turno ajeno se nombra', () => {
    expect(bidBlock({ ...base, leading: true }).reason).toBe('leading');
    expect(bidBlock({ ...base, leading: true }).text).toBe('Tu puja es la más alta. Turno de Ana.');
    expect(bidBlock({ ...base, canRaise: false, canPass: false, turnName: null }).text).toBe('Esperando el siguiente turno.');
  });

  it('sin presupuesto con valores raros no da NaN ni negativos', () => {
    const block = bidBlock({ ...base, min: Number.NaN, max: -4 });
    expect(block.reason).toBe('noBudget');
    expect(block.text).toBe('La mínima es 1 moneda y tienes 0.');
  });

  it('sin llegar a la mínima se puede pasar si el servidor lo deja (Bluff: la puja llegó al máximo)', () => {
    // El servidor de Bluff da `canRaise` y `canPass` a quien tiene el turno aunque la mínima supere el máximo.
    const block = bidBlock({ ...base, min: 1026, max: 1025, canRaise: true, canPass: true, unit: 'Pokémon' });
    expect(block).toMatchObject({ reason: 'noBudget', canRaise: false, canPass: true });
    // Sin el permiso del servidor (no es su turno), no; y quien ya pasó, tampoco.
    expect(bidBlock({ ...base, min: 1026, max: 1025, canRaise: false, canPass: false })).toMatchObject({ reason: 'noBudget', canPass: false });
    expect(bidBlock({ ...base, min: 1026, max: 1025, passed: true })).toMatchObject({ reason: 'noBudget', canPass: false });
    // Team Auction: el motor pasa solo a quien no llega, así que nunca le da `canPass`: sigue bloqueado del todo.
    expect(bidBlock({ ...base, max: 3, canRaise: false, canPass: false })).toMatchObject({ reason: 'noBudget', canRaise: false, canPass: false, title: 'Sin presupuesto' });
  });

  it('los atajos 1–4 no escuchan con el diálogo de pasar abierto, enviando ni sin poder subir', () => {
    expect(bidShortcutsLive({ canRaise: true, busy: false, confirming: false })).toBe(true);
    expect(bidShortcutsLive({ canRaise: true, busy: false, confirming: true })).toBe(false);
    expect(bidShortcutsLive({ canRaise: true, busy: true, confirming: false })).toBe(false);
    expect(bidShortcutsLive({ canRaise: false, busy: false, confirming: false })).toBe(false);
  });

  it('textos propios por motivo (Bluff)', () => {
    const block = bidBlock({ ...base, max: 2, unit: 'Pokémon', texts: { noBudget: { title: 'Puja máxima alcanzada', text: 'Nadie puede subir más.' } } });
    expect(block).toMatchObject({ reason: 'noBudget', title: 'Puja máxima alcanzada', text: 'Nadie puede subir más.' });
  });
});

describe('historial', () => {
  it('de la más reciente a la más antigua, con la última marcada', () => {
    const log = bidLog([{ playerId: 'p1', type: 'BID', amount: 1 }, { playerId: 'p2', type: 'BID', amount: 3 }, { playerId: 'p1', type: 'PASS' }], (id) => (id === 'p1' ? 'Eru' : 'Ana'), { selfId: 'p1', colorOf: () => '#fff' });
    expect(log.map((entry) => [entry.name, entry.text, entry.value ?? null, entry.fresh, entry.self ?? false])).toEqual([
      ['Eru', 'Pasó', null, true, true],
      ['Ana', 'Pujó 3 monedas', '3', false, false],
      ['Eru', 'Pujó 1 moneda', '1', false, true],
    ]);
    expect(bidLog([], () => 'x')).toEqual([]);
  });
});
