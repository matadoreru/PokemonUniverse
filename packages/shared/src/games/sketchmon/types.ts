import { z } from 'zod';
import type { PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { SketchmonConfig } from './config.js';

export const SKETCHMON_COLORS = ['#182033', '#e24671', '#10a6c3', '#27965c', '#e1a817', '#7457c7', '#9a5b3c'] as const;

export type SketchmonTool = 'PENCIL' | 'ERASER';
export type SketchmonColor = (typeof SKETCHMON_COLORS)[number];
export interface SketchmonPoint { x: number; y: number }
export interface SketchmonStroke {
  id: string;
  tool: SketchmonTool;
  color: SketchmonColor;
  width: number;
  points: SketchmonPoint[];
}

export interface SketchmonAttempt {
  playerId: string;
  guessedPokemon: { id: string; name: string; sprite: string };
  attemptedAt: number;
}

export type SketchmonHint =
  | { kind: 'GENERATION'; generation: number }
  | { kind: 'TYPES'; types: PokemonType[] }
  | { kind: 'EVOLUTION'; text: string };

export interface SketchmonPokemonReveal {
  id: string;
  name: string;
  sprite: string;
  generation: number;
  types: PokemonType[];
}

export interface SketchmonRoundResult {
  reason: 'GUESSED' | 'TIMEOUT';
  pokemon: SketchmonPokemonReveal;
  drawerId: string;
  winnerId: string | null;
  elapsedMs: number;
  guesserPoints: number;
  drawerPoints: number;
  winnerAttemptCount: number | null;
  drawing: SketchmonStroke[];
}

export interface SketchmonGalleryEntry extends SketchmonRoundResult {
  roundNumber: number;
  lapNumber: number;
}

export interface SketchmonPlayerStats {
  guessedPokemon: number;
  firstTry: number;
  totalAttempts: number;
  firstCorrectResponses: number;
  drawingRounds: number;
  drawingSuccesses: number;
  drawingFailures: number;
  pointsFromGuessing: number;
  pointsFromDrawing: number;
}

export interface SketchmonState {
  phase: GamePhase;
  config: SketchmonConfig;
  playerIds: string[];
  drawerOrder: string[];
  poolIds: string[];
  usedPokemonIds: string[];
  roundNumber: number;
  targetPokemonId: string | null;
  drawerId: string | null;
  strokes: SketchmonStroke[];
  clearedStrokes: SketchmonStroke[] | null;
  visibleHints: SketchmonHint[];
  attempts: SketchmonAttempt[];
  attemptCounts: Record<string, number>;
  cooldownUntil: Record<string, number>;
  scores: Record<string, number>;
  playerStats: Record<string, SketchmonPlayerStats>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: SketchmonRoundResult | null;
  gallery: SketchmonGalleryEntry[];
}

export interface SketchmonPublicState {
  gameId: 'sketchmon';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  lapNumber: number;
  totalLaps: number;
  drawerId: string | null;
  nextDrawerId: string | null;
  drawerOrder: string[];
  strokes: SketchmonStroke[];
  visibleHints: SketchmonHint[];
  attempts: SketchmonAttempt[];
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: SketchmonRoundResult | null;
  gallery: SketchmonGalleryEntry[];
  results: GameResults | null;
}

export type SketchmonPlayerState =
  | { role: 'DRAWER'; canDraw: boolean; secretPokemon: SketchmonPokemonReveal | null }
  | { role: 'GUESSER'; canGuess: boolean; cooldownUntil: number | null; attemptCount: number }
  | { role: 'SPECTATOR' };

const pointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const strokeIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const strokeStartSchema = z.object({
  kind: z.literal('START'),
  stroke: z.object({
    id: strokeIdSchema,
    tool: z.enum(['PENCIL', 'ERASER']),
    color: z.enum(SKETCHMON_COLORS),
    width: z.number().int().min(2).max(32),
    points: z.array(pointSchema).min(1).max(32),
  }).strict(),
}).strict();
const strokeAppendSchema = z.object({
  kind: z.literal('APPEND'),
  strokeId: strokeIdSchema,
  points: z.array(pointSchema).min(1).max(32),
}).strict();

export const sketchmonActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DRAW_BATCH'), operations: z.array(z.discriminatedUnion('kind', [strokeStartSchema, strokeAppendSchema])).min(1).max(8) }).strict(),
  z.object({ type: z.literal('UNDO_STROKE') }).strict(),
  z.object({ type: z.literal('CLEAR_DRAWING') }).strict(),
  z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict(),
]);

export type SketchmonAction = z.infer<typeof sketchmonActionSchema>;
