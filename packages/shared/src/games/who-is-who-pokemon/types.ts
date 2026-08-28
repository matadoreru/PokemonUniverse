import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { WhoIsWhoPokemonConfig } from './config.js';

export type WhoIsWhoTeam = 'BLUE' | 'RED';
export interface WhoIsWhoCursor { x: number; y: number; updatedAt: number }
export interface WhoIsWhoPokemonCard { id: string; name: string; sprite: string }
export interface WhoIsWhoTeamState { playerIds: string[]; secretPokemonId: string; discardedPokemonIds: string[] }
export interface WhoIsWhoGuess { team: WhoIsWhoTeam; playerId: string; pokemonId: string; correct: boolean; attemptedAt: number; turnNumber: number }
export interface WhoIsWhoStats { wins: number; turnsPlayed: number; correctGuesses: number; incorrectGuesses: number }
export interface WhoIsWhoState {
  phase: GamePhase; config: WhoIsWhoPokemonConfig; playerIds: string[]; board: WhoIsWhoPokemonCard[];
  teams: Record<WhoIsWhoTeam, WhoIsWhoTeamState>; currentTeam: WhoIsWhoTeam; roundNumber: number; turnNumber: number;
  roundStartedAt: number | null; roundEndsAt: number | null; scores: Record<string, number>; playerStats: Record<string, WhoIsWhoStats>; guesses: WhoIsWhoGuess[];
  cursors: Record<string, WhoIsWhoCursor>; winnerTeam: WhoIsWhoTeam | null; results: GameResults | null;
}
export interface WhoIsWhoPublicState {
  gameId: 'who-is-who-pokemon'; phase: GamePhase; board: WhoIsWhoPokemonCard[];
  teams: Record<WhoIsWhoTeam, { playerIds: string[] }>; currentTeam: WhoIsWhoTeam; roundNumber: number; turnNumber: number;
  totalRounds: number; roundStartedAt: number | null; roundEndsAt: number | null; guesses: WhoIsWhoGuess[];
  winnerTeam: WhoIsWhoTeam | null; revealedSecrets: Record<WhoIsWhoTeam, WhoIsWhoPokemonCard | null>; results: GameResults | null;
}
export interface WhoIsWhoPlayerState {
  role: 'PLAYER' | 'SPECTATOR'; team: WhoIsWhoTeam | null; ownSecret: WhoIsWhoPokemonCard | null; discardedPokemonIds: string[];
  cursors: Record<string, WhoIsWhoCursor>; canAct: boolean; canGuess: boolean; guessUsed: boolean; lastGuess: WhoIsWhoGuess | null;
}
export const whoIsWhoPokemonActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TOGGLE_DISCARD'), pokemonId: z.string().min(1).max(96) }).strict(),
  z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict(),
  z.object({ type: z.literal('END_TURN') }).strict(),
  z.object({ type: z.literal('UPDATE_CURSOR'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
  z.object({ type: z.literal('CLEAR_CURSOR') }).strict(),
]);
export type WhoIsWhoPokemonAction = z.infer<typeof whoIsWhoPokemonActionSchema>;
