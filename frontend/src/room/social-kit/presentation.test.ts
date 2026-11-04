import { describe, expect, it } from 'vitest';
import { ballotState, namesList, phaseIndex, runoffCounts, runoffLeaders, socialFocusKey, tallyOutcome, tallySummary, votesText } from './presentation';

const names: Record<string, string> = { p1: 'Snorlax', p2: 'Psyduck', p3: 'Gengar' };
const nameOf = (id: string) => names[id] ?? id;

describe('social-kit: presentación', () => {
  it('cuenta los votos de una vuelta en el orden de los candidatos (los que no son candidatos no cuentan)', () => {
    const counts = runoffCounts({ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p2: 'p1', p3: 'p2', s1: 'zz' } });
    expect(counts).toEqual([{ id: 'p1', votes: 1, voterIds: ['p2'] }, { id: 'p2', votes: 2, voterIds: ['p1', 'p3'] }, { id: 'p3', votes: 0, voterIds: [] }]);
    expect(runoffLeaders(counts)).toEqual(['p2']);
    expect(runoffLeaders(runoffCounts({ number: 1, candidateIds: ['p1', 'p2'], votes: { p3: 'p1', p1: 'p2' } }))).toEqual(['p1', 'p2']);
    expect(runoffLeaders([])).toEqual([]);
  });

  it('textos de votos y listas de nombres', () => {
    expect(votesText(0)).toBe('0 votos');
    expect(votesText(1)).toBe('1 voto');
    expect(namesList([])).toBe('');
    expect(namesList(['Ana'])).toBe('Ana');
    expect(namesList(['Ana', 'Leo', 'Eru'])).toBe('Ana, Leo y Eru');
  });

  it('el resultado nunca corona con «0 votos»: única respuesta, nadie votó, en solitario y compartida', () => {
    expect(tallyOutcome([], [])).toBe('none');
    expect(tallySummary([], [], nameOf, 'Nadie respondió a tiempo.')).toBe('Nadie respondió a tiempo.');
    expect(tallyOutcome(['p1'], [])).toBe('unopposed');
    expect(tallySummary(['p1'], [], nameOf)).toBe('Única respuesta: Snorlax gana sin votación.');
    const empty = [{ number: 1, candidateIds: ['p1', 'p2'], votes: {} }, { number: 2, candidateIds: ['p1', 'p2'], votes: {} }];
    expect(tallyOutcome(['p1', 'p2'], empty)).toBe('noVotes');
    expect(tallySummary(['p1', 'p2'], empty, nameOf)).toBe('Nadie votó: empate sin votos entre Snorlax y Psyduck.');
    const revote = [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p2: 'p1' } }, { number: 2, candidateIds: ['p1', 'p2'], votes: { p1: 'p2', p3: 'p2', p2: 'p1' } }];
    expect(tallyOutcome(['p2'], revote)).toBe('solo');
    expect(tallySummary(['p2'], revote, nameOf)).toBe('Gana Psyduck con 2 votos tras la segunda vuelta.');
    const shared = [{ number: 1, candidateIds: ['p1', 'p2'], votes: { p3: 'p1', p1: 'p2' } }, { number: 2, candidateIds: ['p1', 'p2'], votes: { p3: 'p1', p1: 'p2' } }];
    expect(tallyOutcome(['p1', 'p2'], shared)).toBe('shared');
    expect(tallySummary(['p1', 'p2'], shared, nameOf)).toBe('Empate a 1 voto entre Snorlax y Psyduck tras la segunda vuelta: victoria compartida.');
    // Empate final decidido por sorteo (One of Us) y empate sin ganador.
    expect(tallyOutcome(['p1'], shared)).toBe('lot');
    expect(tallySummary(['p1'], shared, nameOf, undefined, 'Sale')).toBe('Empate a 1 voto entre Snorlax y Psyduck tras la segunda vuelta: el sorteo eligió a Snorlax.');
    expect(tallyOutcome([], shared)).toBe('tie');
    expect(tallySummary([], shared, nameOf)).toBe('Empate a 1 voto entre Snorlax y Psyduck tras la segunda vuelta: no hay ganador.');
  });

  it('papeleta: manda el voto del servidor; la elección local solo vale en su ronda y vuelta y entre los candidatos', () => {
    const base = { epoch: 102, candidateIds: ['p1', 'p2'], ownId: 'p1', ownVote: null, busyId: '', canVote: true, participating: true };
    expect(ballotState({ ...base, pick: null })).toEqual({ locked: false, sending: false, open: true, picked: null, selected: null });
    expect(ballotState({ ...base, pick: { epoch: 102, id: 'p2' } }).selected).toBe('p2');
    // La elección de la primera vuelta no pasa a la segunda; la propia y la de quien ya no es candidato no cuentan.
    expect(ballotState({ ...base, pick: { epoch: 101, id: 'p2' } }).picked).toBeNull();
    expect(ballotState({ ...base, pick: { epoch: 102, id: 'p1' } }).picked).toBeNull();
    expect(ballotState({ ...base, pick: { epoch: 102, id: 'p3' } }).picked).toBeNull();
    // Enviando: marcada la que se envía; confirmado (o tras recargar): bloqueada aunque el hook siga ocupado.
    expect(ballotState({ ...base, pick: { epoch: 102, id: 'p2' }, busyId: 'p2' })).toMatchObject({ sending: true, selected: 'p2' });
    expect(ballotState({ ...base, pick: null, busyId: 'p2', ownVote: 'p2', canVote: false })).toEqual({ locked: true, sending: false, open: false, picked: null, selected: 'p2' });
    expect(ballotState({ ...base, pick: { epoch: 102, id: 'p2' }, participating: false, canVote: false })).toMatchObject({ open: false, picked: null, selected: null });
  });

  it('claves de foco y fases', () => {
    expect(socialFocusKey('VOTING', 2, 1, false)).toBe('VOTING-2-1-open');
    expect(socialFocusKey('VOTING', 2, 1, true)).not.toBe(socialFocusKey('VOTING', 2, 1, false));
    expect(socialFocusKey('REVOTE', 2, 2)).not.toBe(socialFocusKey('VOTING', 2, 1));
    const steps = [{ key: 'choose' }, { key: 'vote' }, { key: 'result' }];
    expect(phaseIndex(steps, 'vote')).toBe(1);
    expect(phaseIndex(steps, null)).toBe(-1);
  });
});
