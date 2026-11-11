import { speedPodiumScoringLabel } from '../speed-podium.js';

/** Ayuda de puntos de ¿Quién es ese Pokémon? (la de `SpeedPodiumScore`). */
export function whoPokemonScoringLabel(streakBonus = false): string {
  return speedPodiumScoringLabel(streakBonus);
}
