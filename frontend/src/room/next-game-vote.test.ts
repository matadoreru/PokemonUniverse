import { describe, expect, it } from 'vitest';
import { voteActionStatus, votesLabel } from './next-game-vote';

const base = { active: true, eligible: true, ownVote: null, draftName: null, resolvedName: null, revealSeconds: 0 };

describe('voteActionStatus', () => {
  it('asks to pick, then to confirm the draft', () => {
    expect(voteActionStatus(base)).toMatchObject({ title: 'Elige una carta', text: 'Selecciona una opción para preparar tu voto.', canConfirm: true });
    expect(voteActionStatus({ ...base, draftName: 'Juego dos' })).toMatchObject({ title: 'Has elegido Juego dos', canConfirm: true });
  });

  it('waits once the vote is registered and explains a disconnected voter', () => {
    expect(voteActionStatus({ ...base, ownVote: 'Juego uno', draftName: 'Juego uno' })).toMatchObject({ title: 'Tu voto está registrado.', text: 'Has votado por Juego uno. Esperando al resto…', canConfirm: false });
    expect(voteActionStatus({ ...base, eligible: false })).toMatchObject({ title: 'Fuera de la votación', canConfirm: false });
  });

  it('announces the winner and the countdown, never below 1 s', () => {
    expect(voteActionStatus({ ...base, active: false, resolvedName: 'Juego dos', revealSeconds: 3 })).toMatchObject({ title: 'La sala ha elegido Juego dos', text: 'La siguiente partida empieza en 3 s…' });
    expect(voteActionStatus({ ...base, active: false, revealSeconds: 0 }).text).toBe('La siguiente partida empieza en 1 s…');
  });
});

it('votesLabel', () => {
  expect(votesLabel(1)).toBe('1 voto');
  expect(votesLabel(3)).toBe('3 votos');
});
