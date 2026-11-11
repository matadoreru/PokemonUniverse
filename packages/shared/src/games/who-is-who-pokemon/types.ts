import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';

export type WhoIsWhoTeam = 'BLUE' | 'RED';
export interface WhoIsWhoPokemonCard { id: string; nationalDexNumber: number; name: string; sprite: string }
export interface WhoIsWhoGuess { team: WhoIsWhoTeam; playerId: string; pokemonId: string; correct: boolean; attemptedAt: number; turnNumber: number }
export interface WhoIsWhoPublicState {
  gameId: 'who-is-who-pokemon'; phase: GamePhase; board: WhoIsWhoPokemonCard[];
  teams: Record<WhoIsWhoTeam, { playerIds: string[]; secretReady: boolean }>; currentTeam: WhoIsWhoTeam; roundNumber: number; turnNumber: number;
  totalRounds: number; roundStartedAt: number | null; roundEndsAt: number | null; guesses: WhoIsWhoGuess[];
  winnerTeam: WhoIsWhoTeam | null; revealedSecrets: Record<WhoIsWhoTeam, WhoIsWhoPokemonCard | null>; results: GameResults | null;
}
export interface WhoIsWhoPlayerState {
  role: 'PLAYER' | 'SPECTATOR'; team: WhoIsWhoTeam | null; ownSecret: WhoIsWhoPokemonCard | null; discardedPokemonIds: string[];
  canManageBoard: boolean; canAct: boolean; canGuess: boolean; guessUsed: boolean; lastGuess: WhoIsWhoGuess | null;
  canChooseSecret: boolean;
}

export const whoIsWhoCursorPositionSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  pokemonId: z.string().min(1).max(96).optional(),
  cardX: z.number().finite().min(0).max(1).optional(),
  cardY: z.number().finite().min(0).max(1).optional(),
}).strict().superRefine((position, context) => {
  const anchorCount = [position.pokemonId, position.cardX, position.cardY].filter((value) => value !== undefined).length;
  if (anchorCount !== 0 && anchorCount !== 3) context.addIssue({ code: 'custom', message: 'El anclaje de carta está incompleto.' });
});
export type WhoIsWhoCursorPosition = z.infer<typeof whoIsWhoCursorPositionSchema>;
export interface WhoIsWhoCursorEvent extends WhoIsWhoCursorPosition { playerId: string; updatedAt: number }
