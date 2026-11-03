import { TYPE_DUEL_MAX_INVALID_COMBINATIONS } from '@pokemon-universe/shared/public';

/** Tras una combinación imposible, ¿los mismos jugadores vuelven a elegir? No si es la tercera ni si se alcanzó el tope de ciclos. */
export function typeDuelWillRetry(game: { invalidCombinations: number; finalSelectionCycle: boolean }): boolean {
  return game.invalidCombinations < TYPE_DUEL_MAX_INVALID_COMBINATIONS && !game.finalSelectionCycle;
}

/** ¿El resultado actual es el último antes de la clasificación? */
export function typeDuelIsLastResult(game: { completedRounds: number; totalRounds: number; finalSelectionCycle: boolean }): boolean {
  return game.completedRounds >= game.totalRounds || game.finalSelectionCycle;
}
