import type { ImpostorVoteResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { clampImpostorClue, impostorClueLength, impostorCluePhaseTitle, impostorFinishText, impostorVoteHeadline, impostorVoteTargetLabel } from './pokemon-impostor-texts';

const nameOf = (id: string) => ({ p1: 'Ana', p2: 'Bruno' } as Record<string, string>)[id] ?? id;
function result(overrides: Partial<ImpostorVoteResult>): ImpostorVoteResult {
  return { kind: 'ELIMINATION', votes: {}, tallies: {}, skipVotes: 0, tiedIds: [], eliminatedId: null, ...overrides };
}

describe('impostorVoteHeadline', () => {
  it('TIE announces a new voting round', () => {
    expect(impostorVoteHeadline(result({ kind: 'TIE', tiedIds: ['p1', 'p2'] }), nameOf)).toBe('⚔️ Empate: habrá una nueva votación');
  });
  it('ELIMINATION names who received the most votes', () => {
    expect(impostorVoteHeadline(result({ kind: 'ELIMINATION', eliminatedId: 'p1' }), nameOf)).toBe('Ana recibió más votos');
  });
  it('SKIPPED says nobody is eliminated', () => {
    expect(impostorVoteHeadline(result({ kind: 'SKIPPED', skipVotes: 2 }), nameOf)).toBe('⏭️ Se salta la votación: nadie es expulsado');
  });
  it('DEADLOCK says the tie repeated and nobody is eliminated', () => {
    expect(impostorVoteHeadline(result({ kind: 'DEADLOCK', tiedIds: ['p1', 'p2'] }), nameOf)).toBe('⚔️ Empate otra vez: nadie es expulsado');
  });
});

describe('impostorVoteTargetLabel', () => {
  it('labels the skip target as Saltar', () => {
    expect(impostorVoteTargetLabel('SKIP', nameOf)).toBe('Saltar');
  });
  it('uses the player name otherwise', () => {
    expect(impostorVoteTargetLabel('p2', nameOf)).toBe('Bruno');
  });
});

describe('impostorFinishText', () => {
  it('GUESS names who guessed', () => {
    expect(impostorFinishText('GUESS', 'Ana')).toBe('Ana adivinó el Pokémon secreto.');
  });
  it('PARITY', () => {
    expect(impostorFinishText('PARITY', null)).toBe('Los impostores igualaron en número a los inocentes.');
  });
  it('IMPOSTORS_ELIMINATED', () => {
    expect(impostorFinishText('IMPOSTORS_ELIMINATED', null)).toBe('Todos los impostores fueron expulsados.');
  });
  it('STALEMATE', () => {
    expect(impostorFinishText('STALEMATE', null)).toBe('Tres rondas seguidas sin expulsar a nadie.');
  });
  it('null has no text', () => {
    expect(impostorFinishText(null, null)).toBeNull();
  });
});

describe('clampImpostorClue', () => {
  it('keeps 25 emojis (50 UTF-16 units)', () => {
    const clue = '\u{1F525}'.repeat(25);
    expect(clampImpostorClue(clue)).toBe(clue);
  });
  it('cuts to 25 code points', () => {
    expect(clampImpostorClue('\u{1F525}'.repeat(26))).toBe('\u{1F525}'.repeat(25));
    expect(clampImpostorClue('x'.repeat(30))).toBe('x'.repeat(25));
  });
  it('counts only the trimmed text, like the server, and keeps the spaces typed around it', () => {
    const clue = `  ${'x'.repeat(25)}  `;
    expect(clampImpostorClue(clue)).toBe(clue);
    expect(clampImpostorClue(`  ${'x'.repeat(26)}  `)).toBe(`  ${'x'.repeat(25)}`);
    expect(clampImpostorClue(`\u00A0${'\u{1F525}'.repeat(26)}`)).toBe(`\u00A0${'\u{1F525}'.repeat(25)}`);
  });
  it('normalizes to NFC before counting', () => {
    expect(clampImpostorClue('É'.repeat(25))).toBe('É'.repeat(25));
  });
});

describe('impostorClueLength', () => {
  it('counts code points of the trimmed, NFC-normalized clue', () => {
    expect(impostorClueLength('  abc  ')).toBe(3);
    expect(impostorClueLength('E\u0301\u{1F525}')).toBe(2);
  });
});

describe('impostorCluePhaseTitle', () => {
  it('names whose turn it is', () => {
    expect(impostorCluePhaseTitle('Ana')).toBe('Turno de Ana');
  });
  it('does not announce a turn when nobody is connected to give clues', () => {
    expect(impostorCluePhaseTitle(null)).toBe('Nadie conectado para dar pistas');
  });
});
