import type { PokedexDistancePublicState } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import {
  DISTANCE_HIDDEN_PICKED_LABEL, DISTANCE_SELECTION_VISIBILITY_LABEL, distanceMemberStatus, distanceSelectionVisibilityLabels,
  DISTANCE_EXACT_HIT_TITLE, distanceAnnouncement, distanceFocusKey, distancePickedCountText, distanceRoundOutcome, distanceRoundRows, distanceSpectatorHint,
} from './pokedex-distance-selection';

function game(overrides: Partial<PokedexDistancePublicState>): PokedexDistancePublicState {
  return {
    gameId: 'pokedex-distance', phase: 'ROUND_ACTIVE', roundNumber: 1, tiebreakDepth: 0, targetDexNumber: 25,
    eligibleIds: ['p1', 'p2'], survivorIds: ['p1', 'p2'], spectatorIds: [], selections: {}, selectedIds: [],
    lockedPokemonIds: [], roundStartedAt: 0, roundEndsAt: 20_000, nextTransitionAt: null, lastRound: null, roundHistory: [], winnerId: null,
    results: null, ...overrides,
  };
}

describe('distanceMemberStatus', () => {
  it('en LIVE muestra el Pokémon elegido', () => {
    const live = game({
      selections: { p1: { pokemonId: 'pikachu', pokemonName: 'Pikachu', sprite: '/25.png', selectedAt: 1 } },
      selectedIds: ['p1'], lockedPokemonIds: ['pikachu'],
    });
    expect(distanceMemberStatus(live, 'p1')).toEqual({ kind: 'picked', pokemonName: 'Pikachu', sprite: '/25.png' });
  });

  it('en HIDDEN solo dice que ya ha elegido', () => {
    expect(distanceMemberStatus(game({ selectedIds: ['p1'] }), 'p1')).toEqual({ kind: 'hidden-picked' });
  });

  it('sin elegir sigue seleccionando', () => {
    expect(distanceMemberStatus(game({ selectedIds: ['p1'] }), 'p2')).toEqual({ kind: 'picking' });
  });

  it('fuera de la ronda dice por qué: desempate, observa o eliminado', () => {
    const tiebreak = game({ eligibleIds: ['p1'], survivorIds: ['p1', 'p2'], spectatorIds: ['p4'] });
    expect(distanceMemberStatus(tiebreak, 'p2')).toEqual({ kind: 'waiting' });
    expect(distanceMemberStatus(tiebreak, 'p4')).toEqual({ kind: 'watching' });
    expect(distanceMemberStatus(tiebreak, 'p3')).toEqual({ kind: 'out' });
  });
});

describe('textos de visibilidad de Pokédex Distance', () => {
  it('nombra el grupo y sus dos botones', () => {
    expect(DISTANCE_SELECTION_VISIBILITY_LABEL).toBe('Elecciones de los rivales');
    expect(distanceSelectionVisibilityLabels).toEqual({ HIDDEN: 'Ocultas', LIVE: 'Visibles' });
  });

  it('confirma la elección oculta sin revelarla', () => {
    expect(DISTANCE_HIDDEN_PICKED_LABEL).toBe('✓ Ya ha elegido');
  });

  it('el espectador solo sigue las selecciones en directo en LIVE', () => {
    expect(distanceSpectatorHint('LIVE')).toBe('Sigue las selecciones en directo.');
    expect(distanceSpectatorHint('HIDDEN')).toBe('Las elecciones se verán al revelar la ronda.');
  });
});

describe('distanceRoundOutcome', () => {
  const base = { eliminatedIds: [] as string[], tiedIds: [] as string[] };

  it('un empate abre desempate y marca a los empatados', () => {
    const outcome = distanceRoundOutcome({ ...base, reason: 'TIE', tiedIds: ['p1', 'p2'] });
    expect(outcome.title).toBe('⚔️ Empate en la peor distancia');
    expect(outcome.note).toBe('Solo los jugadores empatados jugarán la ronda de desempate.');
    expect(outcome.showTiedChip('p1')).toBe(true);
  });

  it('el empate resuelto tras el tope explica quién cae y no marca empate al eliminado', () => {
    const outcome = distanceRoundOutcome({ reason: 'FARTHEST', eliminatedIds: ['p1'], tiedIds: ['p2', 'p1'] });
    expect(outcome.title).toBe('⚔️ Empate tras 3 desempates');
    expect(outcome.note).toBe('Cae quien eligió último; si eligieron a la vez, caen todos.');
    expect(outcome.showTiedChip('p1')).toBe(false);
    expect(outcome.showTiedChip('p2')).toBe(true);
  });

  it('una eliminación normal y una sin respuesta no llevan nota', () => {
    expect(distanceRoundOutcome({ ...base, reason: 'FARTHEST', eliminatedIds: ['p3'] })).toMatchObject({ title: '📏 Distancias calculadas', note: null });
    expect(distanceRoundOutcome({ ...base, reason: 'NO_RESPONSE', eliminatedIds: ['p3'] })).toMatchObject({ title: '⏱️ Tiempo agotado', note: null });
  });
});

describe('distancePickedCountText', () => {
  it('concuerda el verbo con cuántos han elegido', () => {
    expect(distancePickedCountText(2, 3)).toBe('2 de 3 han elegido');
    expect(distancePickedCountText(1, 2)).toBe('1 de 2 ha elegido');
    expect(distancePickedCountText(0, 3)).toBe('0 de 3 han elegido');
  });
});

describe('acierto exacto', () => {
  it('se anuncia en español', () => {
    expect(DISTANCE_EXACT_HIT_TITLE).toBe('¡Acierto exacto!');
  });
});

describe('distanceRoundRows', () => {
  const sel = (distance: number) => ({ pokemonId: `p${distance}`, pokemonName: `P${distance}`, sprite: '/s.png', dexNumber: 25 + distance, distance, selectedAt: 1 });
  it('ordena de la más cercana a la más lejana y deja al final a quien no respondió', () => {
    const rows = distanceRoundRows({ eligibleIds: ['a', 'b', 'c', 'd'], selections: { a: sel(12), b: sel(0), d: sel(12) }, reason: 'NO_RESPONSE', eliminatedIds: ['c'], tiedIds: [] });
    expect(rows.map((row) => row.playerId)).toEqual(['b', 'a', 'd', 'c']);
    expect(rows[0]).toMatchObject({ exact: true, eliminated: false, distance: 0 });
    expect(rows[3]).toMatchObject({ distance: null, eliminated: true });
  });
  it('en un empate forzado el eliminado no lleva «Empate»', () => {
    const rows = distanceRoundRows({ eligibleIds: ['a', 'b'], selections: { a: sel(5), b: sel(5) }, reason: 'FARTHEST', eliminatedIds: ['b'], tiedIds: ['a', 'b'] });
    expect(rows.map((row) => [row.playerId, row.tied, row.eliminated])).toEqual([['a', true, false], ['b', false, true]]);
  });
});

describe('foco y avisos', () => {
  const sel = (distance: number) => ({ pokemonId: `p${distance}`, pokemonName: `P${distance}`, sprite: '/s.png', dexNumber: 25 + distance, distance, selectedAt: 1 });
  const base = { phase: 'ROUND_ACTIVE' as const, roundNumber: 2, target: '#025', eligible: true, hasSelection: false, exactHit: false, ownPickName: null, lastRound: null, selfId: 'a' };
  it('la clave del foco solo existe con la elección bloqueada o en la revelación, y cambia con el desempate', () => {
    expect(distanceFocusKey('ROUND_ACTIVE', '2-0', false)).toBeNull();
    expect(distanceFocusKey('ROUND_ACTIVE', '2-0', true)).toBe('locked:2-0');
    expect(distanceFocusKey('TIEBREAKER_ACTIVE', '2-1', true)).toBe('locked:2-1');
    expect(distanceFocusKey('ROUND_RESULTS', '2-0', true)).toBe('reveal:2-0');
    expect(distanceFocusKey('ROUND_RESULTS', '2-0', false)).toBe('reveal:2-0');
    expect(distanceFocusKey('GAME_RESULTS', '2-0', true)).toBeNull();
  });
  it('anuncia la ronda, la elección bloqueada y el acierto exacto', () => {
    expect(distanceAnnouncement(base)).toBe('Ronda 2: busca el Pokémon más cercano al objetivo #025.');
    expect(distanceAnnouncement({ ...base, hasSelection: true, ownPickName: 'Pikachu' })).toBe('Has elegido Pikachu: tu elección queda bloqueada hasta la revelación.');
    expect(distanceAnnouncement({ ...base, hasSelection: true, exactHit: true, ownPickName: 'Pikachu' })).toBe('Distancia 0 con Pikachu: es el objetivo #025.');
    expect(distanceAnnouncement({ ...base, eligible: false })).toBe('');
  });
  it('anuncia el veredicto de la ronda con la distancia propia y la eliminación', () => {
    const lastRound = { eligibleIds: ['a', 'b'], selections: { a: sel(3) }, reason: 'NO_RESPONSE' as const, eliminatedIds: ['b'], tiedIds: [] };
    const reveal = { ...base, phase: 'ROUND_RESULTS' as const, lastRound };
    expect(distanceAnnouncement(reveal)).toBe('Ronda 2 revelada: ⏱️ Tiempo agotado. Cae el más alejado del objetivo. Te quedaste a 3.');
    expect(distanceAnnouncement({ ...reveal, selfId: 'b' })).toBe('Ronda 2 revelada: ⏱️ Tiempo agotado. Cae el más alejado del objetivo. No elegiste a tiempo. Quedas fuera de la partida.');
    expect(distanceAnnouncement({ ...reveal, selfId: 'c' })).toBe('Ronda 2 revelada: ⏱️ Tiempo agotado. Cae el más alejado del objetivo.');
    const forced = distanceAnnouncement({ ...reveal, selfId: 'c', lastRound: { ...lastRound, reason: 'FARTHEST', tiedIds: ['a', 'b'] } });
    expect(forced).toBe('Ronda 2 revelada: ⚔️ Empate tras 3 desempates. Sin más desempates: cae quien eligió más tarde.');
    expect(forced).not.toContain(distanceRoundOutcome({ ...lastRound, reason: 'FARTHEST', tiedIds: ['a', 'b'] }).note!);
    expect(distanceAnnouncement({ ...reveal, selfId: 'c', lastRound: { ...lastRound, reason: 'TIE', eliminatedIds: [], tiedIds: ['a', 'b'] } })).toBe('Ronda 2 revelada: ⚔️ Empate en la peor distancia. Los empatados juegan un desempate.');
  });
});
