import { useEffect, useRef } from 'react';
import { audio, type SoundId } from '../audio';

/** Nombres de los efectos antiguos (el módulo de sonido anterior): los juegos que los piden siguen funcionando. */
export type LegacyCue = 'tick' | 'hit' | 'miss' | 'reveal' | 'win' | 'clang';

const LEGACY: Record<LegacyCue, SoundId> = {
  tick: 'ui.tick',
  hit: 'game.hit',
  miss: 'game.miss',
  reveal: 'game.reveal',
  win: 'game.win',
  clang: 'game.clang',
};

/** Traduce un nombre antiguo al id del catálogo; los ids nuevos pasan tal cual. */
export function resolveCue(cue: SoundId | LegacyCue): SoundId {
  return cue in LEGACY ? LEGACY[cue as LegacyCue] : (cue as SoundId);
}

/** ¿Suena ahora? Solo si la clave cambió respecto a la anterior (nunca en el primer render) y hay efecto y clave. */
export function shouldCue(previousKey: string | number | null, key: string | number | null, cue: unknown): boolean {
  return previousKey !== key && cue !== null && key !== null;
}

/**
 * Juegos que ya piden su propio `reveal` al llegar a los resultados de ronda: la sala no suma el suyo para no
 * duplicarlo.
 */
export const SELF_REVEAL_GAMES: ReadonlySet<string> = new Set(['pokedex-distance']);

/** Clave del `game.reveal` común de la sala: cambia al entrar en resultados de ronda y es `null` fuera de ellos. */
export function roomRevealKey(game: { gameId?: string; phase?: string; roundNumber?: number } | null | undefined): string | null {
  if (!game || game.phase !== 'ROUND_RESULTS' || !game.gameId || SELF_REVEAL_GAMES.has(game.gameId)) return null;
  return `${game.gameId}:${game.roundNumber ?? 0}`;
}

interface WinCueRoom {
  phase?: string;
  gamesPlayed?: number;
  game?: unknown;
  daily?: unknown;
}

/**
 * Clave del `game.win` de la sala en el reto diario: cambia al entrar en sus resultados si el jugador local ganó
 * (`results.winnerId` o su fila con `won`) y es `null` en otro caso. Fuera del reto el `game.win` (y el
 * `game.podium`) los da solo `ResultsShell`, que sabe quién ganó en cada juego; la pantalla del reto no lo monta.
 */
export function gameWinCue(room: WinCueRoom | null | undefined, selfId: string | null | undefined): string | null {
  if (!room || room.phase !== 'GAME_RESULTS' || !room.daily || !selfId) return null;
  const game = room.game as { gameId?: string; results?: { winnerId?: string | null; standings?: readonly { playerId: string; won?: boolean }[] } | null } | null | undefined;
  if (!game?.gameId) return null;
  const results = game.results;
  if (!results) return null;
  const won = results.winnerId === selfId || (results.standings ?? []).some((s) => s.playerId === selfId && s.won === true);
  return won ? `${game.gameId}:${room.gamesPlayed ?? 0}` : null;
}

/**
 * Suena `cue` una vez cada vez que cambia `key` (nunca en el primer render).
 * Con el sonido silenciado `audio.play` no hace nada.
 */
export function useSfxCue(cue: SoundId | LegacyCue | null, key: string | number | null): void {
  const previous = useRef(key);
  useEffect(() => {
    const before = previous.current;
    previous.current = key;
    if (cue !== null && shouldCue(before, key, cue)) audio.play(resolveCue(cue));
  }, [cue, key]);
}
