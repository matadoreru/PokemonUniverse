import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { WhoIsWhoPokemonConfig } from './config.js';

export type WhoIsWhoTeam = 'BLUE' | 'RED';
export interface WhoIsWhoPokemonCard { id: string; nationalDexNumber: number; name: string; sprite: string }
export interface WhoIsWhoTeamState { playerIds: string[]; secretPokemonId: string | null; discardedPokemonIds: string[] }
export interface WhoIsWhoGuess { team: WhoIsWhoTeam; playerId: string; pokemonId: string; correct: boolean; attemptedAt: number; turnNumber: number }
export interface WhoIsWhoStats { wins: number; turnsPlayed: number; correctGuesses: number; incorrectGuesses: number }
export interface WhoIsWhoState {
  phase: GamePhase; config: WhoIsWhoPokemonConfig; playerIds: string[]; board: WhoIsWhoPokemonCard[];
  teams: Record<WhoIsWhoTeam, WhoIsWhoTeamState>; currentTeam: WhoIsWhoTeam; roundNumber: number; turnNumber: number;
  roundStartedAt: number | null; roundEndsAt: number | null; scores: Record<string, number>; playerStats: Record<string, WhoIsWhoStats>; guesses: WhoIsWhoGuess[];
  winnerTeam: WhoIsWhoTeam | null; results: GameResults | null;
}
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
export const whoIsWhoPokemonActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SELECT_SECRET'), pokemonId: z.string().min(1).max(96) }).strict(),
  z.object({ type: z.literal('TOGGLE_DISCARD'), pokemonId: z.string().min(1).max(96) }).strict(),
  z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict(),
  z.object({ type: z.literal('END_TURN') }).strict(),
]);
export type WhoIsWhoPokemonAction = z.infer<typeof whoIsWhoPokemonActionSchema>;

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
