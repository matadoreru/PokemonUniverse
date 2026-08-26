import type { Pokemon } from '../../pokemon/types.js';
import { buildRankedResults, pointsForPosition } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { ZoomedPokemonConfig, ZoomedPokemonHintKind } from './config.js';
import type { ZoomedPokemonHint, ZoomedPokemonPlayerStats, ZoomedPokemonState } from './types.js';

/** Discrete, centralized camera levels. The final stage intentionally remains cropped. */
export const ZOOMED_POKEMON_ZOOM_STAGES = [5, 3.5, 2.5, 1.7] as const;
export const ZOOMED_POKEMON_ZOOM_BONUSES = [4, 3, 2, 1] as const;
export const ZOOMED_POKEMON_ALPHA_THRESHOLD = 24;
export const ZOOMED_POKEMON_MIN_LOCAL_DENSITY = 0.32;

export interface AlphaPlane { width: number; height: number; alpha: Uint8Array }
export interface FocusPoint { x: number; y: number }
export interface AlphaBounds { x: number; y: number; width: number; height: number }

export function alphaBounds(plane: AlphaPlane, threshold = ZOOMED_POKEMON_ALPHA_THRESHOLD): AlphaBounds | null {
  let minX = plane.width; let minY = plane.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < plane.height; y += 1) for (let x = 0; x < plane.width; x += 1) {
    if ((plane.alpha[y * plane.width + x] ?? 0) <= threshold) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function localAlphaDensity(plane: AlphaPlane, x: number, y: number, radius: number, threshold = ZOOMED_POKEMON_ALPHA_THRESHOLD): number {
  let useful = 0; let total = 0;
  for (let yy = Math.max(0, y - radius); yy <= Math.min(plane.height - 1, y + radius); yy += 1) for (let xx = Math.max(0, x - radius); xx <= Math.min(plane.width - 1, x + radius); xx += 1) {
    total += 1; if ((plane.alpha[yy * plane.width + xx] ?? 0) > threshold) useful += 1;
  }
  return total ? useful / total : 0;
}

/** Picks among dense opaque pixels; the seed is fixed by the authoritative round. */
export function validFocusPoint(plane: AlphaPlane, seed: number): FocusPoint | null {
  const bounds = alphaBounds(plane); if (!bounds) return null;
  const radius = Math.max(2, Math.round(Math.min(bounds.width, bounds.height) * 0.08));
  const candidates: Array<{ x: number; y: number; density: number }> = [];
  const stride = Math.max(1, Math.floor(Math.min(plane.width, plane.height) / 64));
  for (let y = bounds.y; y < bounds.y + bounds.height; y += stride) for (let x = bounds.x; x < bounds.x + bounds.width; x += stride) {
    if ((plane.alpha[y * plane.width + x] ?? 0) <= ZOOMED_POKEMON_ALPHA_THRESHOLD) continue;
    const density = localAlphaDensity(plane, x, y, radius);
    if (density >= ZOOMED_POKEMON_MIN_LOCAL_DENSITY) candidates.push({ x, y, density });
  }
  if (!candidates.length) return { x: (bounds.x + bounds.width / 2) / plane.width, y: (bounds.y + bounds.height / 2) / plane.height };
  candidates.sort((left, right) => right.density - left.density || left.y - right.y || left.x - right.x);
  const good = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.7)));
  const index = Math.abs(Math.trunc(seed)) % good.length; const chosen = good[index]!;
  return { x: (chosen.x + 0.5) / plane.width, y: (chosen.y + 0.5) / plane.height };
}

export function zoomStageSchedule(roundStartedAt: number, roundSeconds: number): number[] {
  const duration = roundSeconds * 1_000;
  return ZOOMED_POKEMON_ZOOM_STAGES.slice(1).map((_, index) => roundStartedAt + Math.round(duration * (index + 1) / ZOOMED_POKEMON_ZOOM_STAGES.length));
}

export function zoomStageAt(roundStartedAt: number, roundSeconds: number, now: number): number {
  return zoomStageSchedule(roundStartedAt, roundSeconds).filter((deadline) => now >= deadline).length;
}

export function isUsableZoomedSprite(pokemon: Pokemon): boolean {
  if (!pokemon.id || !pokemon.name || !pokemon.sprite) return false;
  try { const url = new URL(pokemon.sprite); return url.protocol === 'https:' && url.hostname === 'raw.githubusercontent.com' && /\.(png|webp)$/i.test(url.pathname); }
  catch { return false; }
}

export function buildZoomedHints(pokemon: Pokemon, selected: readonly ZoomedPokemonHintKind[]): ZoomedPokemonHint[] {
  const result: ZoomedPokemonHint[] = [];
  for (const kind of selected) {
    if (kind === 'GENERATION') result.push({ kind, value: pokemon.generation });
    else if (kind === 'TYPE') result.push({ kind, values: [...pokemon.types] });
    else if (kind === 'TYPE_COUNT') result.push({ kind, value: pokemon.types.length });
    else if (kind === 'EVOLUTION' && pokemon.evolutionStage && pokemon.evolutionStageCount) result.push({ kind, stage: pokemon.evolutionStage, stages: pokemon.evolutionStageCount });
    else if (kind === 'CATEGORY' && pokemon.legendaryStatus) result.push({ kind, value: pokemon.legendaryStatus });
  }
  return result;
}

export function emptyZoomedPokemonStats(): ZoomedPokemonPlayerStats {
  return { correct: 0, missed: 0, totalAttempts: 0, firstTry: 0, firstPositions: 0, solveTimeTotalMs: 0, bestTimeMs: 0, maxZoomSolves: 0, solveStageTotal: 0, pointsFromRounds: 0, solvesBySprite: 0, solvesByArtwork: 0 };
}

export function zoomBonusForStage(zoomStage: number): number {
  const bonus = ZOOMED_POKEMON_ZOOM_BONUSES[zoomStage];
  if (!Number.isInteger(zoomStage) || bonus === undefined) throw new RangeError('Invalid zoom stage');
  return bonus;
}

export function zoomedPoints(playerCount: number, solveOrder: number, zoomStage: number): number {
  return pointsForPosition(playerCount, solveOrder) + zoomBonusForStage(zoomStage);
}

export function buildZoomedPokemonResults(state: ZoomedPokemonState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId] ?? emptyZoomedPokemonStats() })), {
    compare: (left, right) => right.points - left.points || right.stats.correct - left.stats.correct || right.stats.firstPositions - left.stats.firstPositions || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
  });
}

export function supportsArtwork(config: ZoomedPokemonConfig, pokemonId: string, artworkIds: ReadonlySet<string>): boolean {
  return config.imageMode !== 'ARTWORK' || artworkIds.has(pokemonId);
}
