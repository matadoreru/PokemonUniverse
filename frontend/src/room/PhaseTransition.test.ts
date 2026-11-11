import { describe, expect, it } from 'vitest';
import { phaseScreenKey } from './PhaseTransition';

const room = (phase: string, gamesPlayed = 0, gameInstanceId?: string) => ({ phase, gamesPlayed, ...(gameInstanceId ? { gameSkipState: { gameInstanceId } } : {}) });

describe('phaseScreenKey', () => {
  it('las fases de una misma partida comparten clave', () => {
    const keys = ['ROUND_ACTIVE', 'ROUND_RESULTS', 'CLUE_PHASE', 'VOTE_PHASE'].map((phase) => phaseScreenKey(room(phase, 2, 'a')));
    expect(new Set(keys).size).toBe(1);
  });

  it('saltar una partida y empezar otra cambia de clave aunque `gamesPlayed` no suba', () => {
    expect(phaseScreenKey(room('ROUND_ACTIVE', 2, 'a'))).not.toBe(phaseScreenKey(room('ROUND_ACTIVE', 2, 'b')));
    expect(phaseScreenKey(room('ROUND_ACTIVE', 2))).not.toBe(phaseScreenKey(room('ROUND_ACTIVE', 3)));
  });

  it('cambia de la sala a la partida, a sus resultados, a la votación y a la sesión', () => {
    const keys = [room('LOBBY'), room('ROUND_ACTIVE', 0), room('GAME_RESULTS', 1), room('NEXT_GAME_VOTE', 1), room('ROUND_ACTIVE', 1), room('GAME_RESULTS', 2), room('SESSION_RESULTS', 2)].map(phaseScreenKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('la intro es otra pantalla que la partida que abre', () => {
    expect(phaseScreenKey(room('GAME_INTRO', 0, 'a'))).not.toBe(phaseScreenKey(room('ROUND_ACTIVE', 0, 'a')));
  });

  it('la votación y su recuento son la misma pantalla', () => {
    expect(phaseScreenKey(room('NEXT_GAME_VOTE', 1))).toBe(phaseScreenKey(room('NEXT_GAME_VOTE_RESULTS', 1)));
  });
});
