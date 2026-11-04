import type { FakeRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { fakeAnnouncement, fakeCurrentStep, fakeHeading, fakeSteps, fakeTallySummary, fakeVerdict, fakeVoteRoundLabel } from './presentation';

const names: Record<string, string> = { p1: 'Eru', p2: 'Ana', p3: 'Leo' };
const nameOf = (id: string) => names[id] ?? id;
const base: FakeRoundResult = {
  fakePlayerId: 'p3', selectedPlayerId: 'p3', winner: 'NORMALS', mainCategory: 'A', fakeCategory: 'B',
  players: ['p1', 'p2', 'p3'].map((playerId) => ({ playerId, category: playerId === 'p3' ? 'B' : 'A', pokemon: null, isFake: playerId === 'p3' })),
  voteRounds: [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p3', p2: 'p3', p3: 'p1' } }],
  pointsAwarded: { p1: 2, p2: 2, p3: 0 },
};

describe('One of Us Is Fake: textos', () => {
  it('fases: una por fase del motor; la segunda vuelta solo cuando la hay', () => {
    expect(fakeSteps('DISCUSSION', 1, 0).map((step) => step.key)).toEqual(['choose', 'reveal', 'discuss', 'result']);
    expect(fakeSteps('REVOTE', 2, 0).map((step) => step.label)).toEqual(['Elegir', 'Revelación', 'Debate y voto', 'Desempate', 'Resultado']);
    expect(fakeSteps('REVOTE', 3, 0)[3]?.label).toBe('Desempate 2');
    expect(fakeSteps('ROUND_RESULTS', 1, 2).map((step) => step.key)).toContain('revote');
    expect(fakeSteps('ROUND_RESULTS', 1, 1).map((step) => step.key)).not.toContain('revote');
    expect(['ROUND_ACTIVE', 'CHOICE_REVEAL', 'DISCUSSION', 'REVOTE', 'ROUND_RESULTS', 'GAME_STARTING'].map((phase) => fakeCurrentStep(phase as never))).toEqual(['choose', 'reveal', 'discuss', 'revote', 'result', null]);
    expect(fakeVoteRoundLabel(9)).toBe('Vuelta 9');
  });

  it('títulos', () => {
    expect(fakeHeading('ROUND_ACTIVE', 1, null)).toBe('Elige tu Pokémon');
    expect(fakeHeading('REVOTE', 2, null)).toBe('Segunda vuelta');
    expect(fakeHeading('ROUND_RESULTS', 1, base)).toBe('Ganan los normales');
    expect(fakeHeading('ROUND_RESULTS', 1, { ...base, winner: 'FAKE', selectedPlayerId: 'p1' })).toBe('Gana el fake');
  });

  it('resumen: quién sale, cómo (también por sorteo) y si era el fake', () => {
    expect(fakeTallySummary(base, nameOf)).toBe('Sale Leo con 2 votos. Leo era el fake.');
    const lot = { ...base, selectedPlayerId: 'p2', winner: 'FAKE' as const, voteRounds: [{ number: 1, candidateIds: ['p1', 'p2'], votes: { p1: 'p2', p2: 'p1' } }, { number: 2, candidateIds: ['p1', 'p2'], votes: { p1: 'p2', p2: 'p1' } }, { number: 3, candidateIds: ['p1', 'p2'], votes: { p1: 'p2', p2: 'p1', p3: 'p1' } }] };
    expect(fakeTallySummary({ ...lot, voteRounds: lot.voteRounds.slice(0, 2) }, nameOf)).toBe('Empate a 1 voto entre Eru y Ana tras la segunda vuelta: el sorteo eligió a Ana. Ana no era el fake: el fake era Leo.');
    expect(fakeTallySummary({ ...lot, selectedPlayerId: 'p1' }, nameOf)).toBe('Sale Eru con 2 votos tras 3 vueltas. Eru no era el fake: el fake era Leo.');
    expect(fakeTallySummary({ ...base, voteRounds: [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: {} }] }, nameOf)).toBe('Nadie votó: el sorteo eligió a Leo. Leo era el fake.');
  });

  it('región viva: dice lo que cambia, sin nombrar al fake antes del resultado', () => {
    const common = { roundNumber: 2, voteRound: 1, ownChoice: null, locked: false, tiedNames: [], result: null, nameOf };
    expect(fakeAnnouncement({ ...common, phase: 'ROUND_ACTIVE', ownChoice: 'Lapras' })).toBe('Elección guardada: Lapras.');
    expect(fakeAnnouncement({ ...common, phase: 'CHOICE_REVEAL' })).toBe('Ronda 2: se revelan las elecciones.');
    expect(fakeAnnouncement({ ...common, phase: 'DISCUSSION' })).toBe('Ronda 2: debate y votación abiertos.');
    expect(fakeAnnouncement({ ...common, phase: 'REVOTE', voteRound: 2, tiedNames: ['Eru', 'Ana'] })).toBe('Empate: segunda vuelta entre Eru y Ana.');
    expect(fakeAnnouncement({ ...common, phase: 'REVOTE', voteRound: 2, locked: true })).toBe('Voto bloqueado en la segunda vuelta.');
    expect(fakeAnnouncement({ ...common, phase: 'ROUND_RESULTS', result: base })).toBe('Ronda 2 terminada. Sale Leo con 2 votos. Leo era el fake. Ganan los normales.');
  });

  it('veredicto propio', () => {
    expect(fakeVerdict(base, 'p1', true)).toEqual({ tone: 'ok', text: '¡El grupo descubrió al fake!', points: 2 });
    expect(fakeVerdict(base, 'p3', true).text).toBe('Eras el fake y te descubrieron');
    expect(fakeVerdict({ ...base, winner: 'FAKE', pointsAwarded: { p3: 4 } }, 'p3', true)).toEqual({ tone: 'ok', text: '¡Eras el fake y engañaste al grupo!', points: 4 });
    expect(fakeVerdict({ ...base, winner: 'FAKE' }, 'p1', true).tone).toBe('bad');
    expect(fakeVerdict(base, 'p9', false).text).toBe('Estás observando');
  });
});
