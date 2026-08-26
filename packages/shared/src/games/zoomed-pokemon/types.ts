import { z } from 'zod';
import type { PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { ZoomedPokemonConfig } from './config.js';

export type ZoomedPokemonHint =
  | { kind: 'GENERATION'; value: number }
  | { kind: 'TYPE'; values: PokemonType[] }
  | { kind: 'TYPE_COUNT'; value: number }
  | { kind: 'EVOLUTION'; stage: number; stages: number }
  | { kind: 'CATEGORY'; value: PokemonLegendaryStatus };

export interface ZoomedPokemonAttempt {
  playerId: string;
  guessedPokemon: { id: string; name: string; sprite: string };
  attemptedAt: number;
}

export interface ZoomedPokemonSolve {
  solvedAt: number;
  elapsedMs: number;
  solveOrder: number;
  zoomStage: number;
  zoom: number;
  zoomBonus: number;
  points: number;
  attempts: number;
}

export interface ZoomedPokemonPlayerStats {
  correct: number;
  missed: number;
  totalAttempts: number;
  firstTry: number;
  firstPositions: number;
  solveTimeTotalMs: number;
  bestTimeMs: number;
  maxZoomSolves: number;
  solveStageTotal: number;
  pointsFromRounds: number;
  solvesBySprite: number;
  solvesByArtwork: number;
}

export interface ZoomedPokemonVisual {
  pokemonId: string;
  source: 'SPRITE' | 'ARTWORK';
  location: string;
  focusSeed: number;
}

export interface ZoomedPokemonRoundResult {
  pokemon: { id: string; name: string; generation: number };
  imageSourceType: 'SPRITE' | 'ARTWORK';
  solves: Record<string, ZoomedPokemonSolve>;
  attemptCounts: Record<string, number>;
}

export interface ZoomedPokemonState {
  phase: GamePhase;
  config: ZoomedPokemonConfig;
  assetToken: string;
  playerIds: string[];
  poolIds: string[];
  guessPoolIds: string[];
  roundNumber: number;
  targetPokemonId: string | null;
  visual: ZoomedPokemonVisual | null;
  usedPokemonIds: string[];
  attempts: ZoomedPokemonAttempt[];
  attemptCounts: Record<string, number>;
  solves: Record<string, ZoomedPokemonSolve>;
  cooldownUntil: Record<string, number>;
  lastAttemptResult: Record<string, { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number }>;
  scores: Record<string, number>;
  playerStats: Record<string, ZoomedPokemonPlayerStats>;
  currentZoomStage: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: ZoomedPokemonRoundResult | null;
}

export interface ZoomedPokemonPublicState {
  gameId: 'zoomed-pokemon';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  imageUrl: string | null;
  imageSourceType: 'SPRITE' | 'ARTWORK' | null;
  focusPoint: { x: 0.5; y: 0.5 };
  zoomStages: readonly number[];
  currentZoomStage: number;
  currentZoomBonus: number;
  visibleHints: ZoomedPokemonHint[];
  attempts: ZoomedPokemonAttempt[];
  solves: Record<string, Pick<ZoomedPokemonSolve, 'solveOrder' | 'zoomStage'>>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: null | {
    pokemon: { name: string; generation: number };
    imageUrl: string;
    initialCropUrl: string;
    imageSourceType: 'SPRITE' | 'ARTWORK';
    solves: Record<string, ZoomedPokemonSolve>;
    attemptCounts: Record<string, number>;
  };
  results: GameResults | null;
}

export interface ZoomedPokemonPlayerState {
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  lastAttempt: { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number } | null;
}

export const zoomedPokemonActionSchema = z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict();
export type ZoomedPokemonAction = z.infer<typeof zoomedPokemonActionSchema>;
