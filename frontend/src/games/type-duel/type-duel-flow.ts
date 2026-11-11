import { TYPE_DUEL_MAX_INVALID_COMBINATIONS } from '@pokemon-universe/shared/public';

/** Tras una combinación imposible, ¿los mismos jugadores vuelven a elegir? No si es la tercera ni si se alcanzó el tope de ciclos. */
export function typeDuelWillRetry(game: { invalidCombinations: number; finalSelectionCycle: boolean }): boolean {
  return game.invalidCombinations < TYPE_DUEL_MAX_INVALID_COMBINATIONS && !game.finalSelectionCycle;
}

/** ¿El resultado actual es el último antes de la clasificación? */
export function typeDuelIsLastResult(game: { completedRounds: number; totalRounds: number; finalSelectionCycle: boolean }): boolean {
  return game.completedRounds >= game.totalRounds || game.finalSelectionCycle;
}

/**
 * Sonido de la fase: al revelarse los tipos con una combinación válida, el de revelación (positivo); solo la combinación
 * sin ningún Pokémon lleva el choque disonante. La clave cambia con la ronda y con cada reintento.
 */
export function typeDuelPhaseCue(game: { phase: string; roundNumber: number; invalidCombinations: number }): { cue: 'reveal' | 'clang'; key: string } | null {
  if (game.phase === 'TYPE_REVEAL') return { cue: 'reveal', key: `reveal:${game.roundNumber}:${game.invalidCombinations}` };
  if (game.phase === 'INVALID_COMBINATION') return { cue: 'clang', key: `invalid:${game.roundNumber}:${game.invalidCombinations}` };
  return null;
}
