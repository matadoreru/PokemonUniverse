import { IMPOSTOR_CLUE_MAX_CODE_POINTS } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { impostorClueAction, impostorGuessAction, impostorVoteAction } from './presentation';

describe('órdenes de Pokémon Impostor', () => {
  it('la pista sale tal cual se escribió, solo en tu turno y sin error del campo', () => {
    const turn = { canSubmitClue: true };
    expect(impostorClueAction(turn, ' Eléctrico ', null, 11)).toEqual({ type: 'SUBMIT_CLUE', text: ' Eléctrico ' });
    expect(impostorClueAction({ canSubmitClue: false }, 'Eléctrico', null, 9)).toBeNull();
    expect(impostorClueAction(turn, '   ', null, 3)).toBeNull();
    expect(impostorClueAction(turn, 'Pika', 'No puedes escribir el nombre del Pokémon.', 4)).toBeNull();
    expect(impostorClueAction(turn, 'x', null, IMPOSTOR_CLUE_MAX_CODE_POINTS)).not.toBeNull();
    expect(impostorClueAction(turn, 'x', null, IMPOSTOR_CLUE_MAX_CODE_POINTS + 1)).toBeNull();
  });

  it('el voto lleva al marcado y necesita poder votar', () => {
    expect(impostorVoteAction({ canVote: true }, 'p2')).toEqual({ type: 'VOTE', targetId: 'p2' });
    expect(impostorVoteAction({ canVote: true }, null)).toBeNull();
    expect(impostorVoteAction({ canVote: false }, 'p2')).toBeNull();
  });

  it('adivinar el Pokémon solo cuando te toca', () => {
    expect(impostorGuessAction({ canGuessPokemon: true }, '25')).toEqual({ type: 'GUESS_POKEMON', pokemonId: '25' });
    expect(impostorGuessAction({ canGuessPokemon: false }, '25')).toBeNull();
  });
});
