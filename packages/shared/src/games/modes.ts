import { HIGHER_LOWER_MODES } from './higher-lower/config.js';
import { LEARNSET_GUESS_MODES } from './learnset-guess/config.js';
import { POKEDEX_DISTANCE_MODES } from './pokedex-distance/config.js';
import { POKEMON_IMPOSTOR_MODES } from './pokemon-impostor/config.js';
import { SHINY_VOTE_MODES } from './shiny-vote/config.js';
import { TYPE_DUEL_MODES } from './type-duel/config.js';

/**
 * Catálogo de modos de un juego: `CLASSIC` y el modo nuevo, con su nombre visible; `texts` explica las reglas del modo
 * nuevo (Clásico no lleva línea: son las reglas de siempre).
 */
export interface GameModeCatalog {
  modes: readonly ['CLASSIC', string];
  labels: Record<string, string>;
  texts: Record<string, string>;
}

export const CLASSIC_MODE_LABEL = 'Clásico';

/** Los juegos con modos de juego (Fase 3); los demás no tienen campo `mode`. */
export type GameModeId = 'pokedex-distance' | 'higher-lower' | 'shiny-vote' | 'learnset-guess' | 'type-duel' | 'pokemon-impostor';

export const GAME_MODES: Record<GameModeId, GameModeCatalog> = {
  'pokedex-distance': {
    modes: POKEDEX_DISTANCE_MODES,
    labels: { CLASSIC: CLASSIC_MODE_LABEL, POINTS: 'Por puntos' },
    texts: { POINTS: 'Nadie queda fuera: cada ronda suma 100 menos tu distancia, y 50 extra si clavas el número.' },
  },
  'higher-lower': {
    modes: HIGHER_LOWER_MODES,
    labels: { CLASSIC: CLASSIC_MODE_LABEL, ENDLESS: 'Racha infinita' },
    texts: { ENDLESS: 'Un fallo y estás fuera. Gana quien encadene más aciertos.' },
  },
  'shiny-vote': {
    modes: SHINY_VOTE_MODES,
    labels: { CLASSIC: CLASSIC_MODE_LABEL, SURVIVAL: 'Supervivencia' },
    texts: { SURVIVAL: 'Un fallo y estás fuera; cada pocas rondas hay más candidatos.' },
  },
  'learnset-guess': {
    modes: LEARNSET_GUESS_MODES,
    labels: { CLASSIC: CLASSIC_MODE_LABEL, MANUAL_REVEAL: 'Revelación manual' },
    texts: { MANUAL_REVEAL: 'Sin prisas: cada fallo te enseña más movimientos. Menos intentos, más puntos.' },
  },
  'type-duel': {
    modes: TYPE_DUEL_MODES,
    labels: { CLASSIC: CLASSIC_MODE_LABEL, COOP: 'Cooperativo' },
    texts: { COOP: 'Todos contra el reloj: encontrad juntos todos los Pokémon posibles con esos tipos.' },
  },
  'pokemon-impostor': {
    modes: POKEMON_IMPOSTOR_MODES,
    labels: { CLASSIC: CLASSIC_MODE_LABEL, ONE_WORD: 'Una palabra' },
    texts: { ONE_WORD: 'Pistas de una sola palabra y dos vueltas antes de votar.' },
  },
};

/** El catálogo de modos de `gameId`, o `undefined` si el juego no tiene modos. */
export function gameModeCatalog(gameId: string): GameModeCatalog | undefined {
  return Object.hasOwn(GAME_MODES, gameId) ? GAME_MODES[gameId as GameModeId] : undefined;
}

/** El nombre visible del modo de `config` si no es `CLASSIC`; `null` en Clásico, sin modo o si el juego no tiene modos. */
export function gameModeLabel(gameId: string, config: unknown): string | null {
  const catalog = gameModeCatalog(gameId);
  if (!catalog || typeof config !== 'object' || config === null) return null;
  const mode = (config as { mode?: unknown }).mode;
  if (typeof mode !== 'string' || mode === 'CLASSIC' || !catalog.modes.includes(mode)) return null;
  return catalog.labels[mode] ?? null;
}

/** Cuántos modos tiene `gameId` (1 si no tiene modos). */
export function gameModeCount(gameId: string): number {
  return gameModeCatalog(gameId)?.modes.length ?? 1;
}

/** El nombre visible de `mode` en `gameId`, también «Clásico»; `null` si el juego no tiene ese modo. */
export function gameModeName(gameId: string, mode: string): string | null {
  const catalog = gameModeCatalog(gameId);
  return catalog?.modes.includes(mode) ? catalog.labels[mode] ?? null : null;
}
