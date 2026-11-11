import { describe, expect, it } from 'vitest';
import { phaseScreenKey } from './PhaseTransition';

const room = (phase: string, gamesPlayed = 0, gameInstanceId?: string) => ({ phase, gamesPlayed, ...(gameInstanceId ? { gameSkipState: { gameInstanceId } } : {}) });

describe('phaseScreenKey', () => {
  it('las fases de una misma partida comparten clave, venga o no el estado de saltar', () => {
    const keys = ['ROUND_ACTIVE', 'ROUND_RESULTS', 'CLUE_PHASE', 'VOTE_PHASE'].map((phase) => phaseScreenKey(room(phase, 2, 'a')));
    expect(new Set(keys).size).toBe(1);
    expect(phaseScreenKey(room('ROUND_ACTIVE', 2))).toBe(keys[0]);
  });

  it('cambia de la sala a la partida, a sus resultados, a la votación y a la sesión', () => {
    const keys = [room('LOBBY'), room('ROUND_ACTIVE', 0), room('GAME_RESULTS', 1), room('NEXT_GAME_VOTE', 1), room('ROUND_ACTIVE', 1), room('GAME_RESULTS', 2), room('SESSION_RESULTS', 2)].map(phaseScreenKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('la votación y su recuento son la misma pantalla', () => {
    expect(phaseScreenKey(room('NEXT_GAME_VOTE', 1))).toBe(phaseScreenKey(room('NEXT_GAME_VOTE_RESULTS', 1)));
  });
});
