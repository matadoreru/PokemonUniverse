import { z } from 'zod';
import type { PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokeTabooConfig } from './config.js';

export interface PokeTabooPlayerStats {
  guessedPokemon: number;
  firstTry: number;
  totalAttempts: number;
  firstCorrectResponses: number;
  descriptorRounds: number;
  descriptorSuccesses: number;
  descriptorFailures: number;
  pointsFromGuessing: number;
  pointsFromDescribing: number;
}

export interface PokeTabooAttempt {
  playerId: string;
  guessedPokemon: { id: string; name: string; sprite: string };
  attemptedAt: number;
}

export interface PokeTabooHint {
  id: number;
  text: string;
  sentAt: number;
}

export interface PokeTabooPokemonReveal {
  id: string;
  name: string;
  sprite: string;
  generation: number;
  types: PokemonType[];
}

export interface PokeTabooSecretPokemon extends PokeTabooPokemonReveal {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  evolutionStage: number | null;
  evolutionStageCount: number | null;
  heightDecimeters: number | null;
  weightHectograms: number | null;
  legendaryStatus: PokemonLegendaryStatus | null;
  abilities: string[];
}

export interface PokeTabooRoundResult {
  reason: 'GUESSED' | 'TIMEOUT';
  pokemon: PokeTabooPokemonReveal;
  descriptorId: string;
  winnerId: string | null;
  guesserPoints: number;
  descriptorPoints: number;
  winnerAttemptCount: number | null;
}

export interface PokeTabooState {
  phase: GamePhase;
  config: PokeTabooConfig;
  playerIds: string[];
  descriptorOrder: string[];
  poolIds: string[];
  usedPokemonIds: string[];
  roundNumber: number;
  targetPokemonId: string | null;
  descriptorId: string | null;
  hints: PokeTabooHint[];
  hintCooldownUntil: number | null;
  attempts: PokeTabooAttempt[];
  attemptCounts: Record<string, number>;
  cooldownUntil: Record<string, number>;
  scores: Record<string, number>;
  playerStats: Record<string, PokeTabooPlayerStats>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokeTabooRoundResult | null;
}

export interface PokeTabooPublicState {
  gameId: 'poke-taboo';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  lapNumber: number;
  totalLaps: number;
  descriptorId: string | null;
  nextDescriptorId: string | null;
  descriptorOrder: string[];
  hints: PokeTabooHint[];
  attempts: PokeTabooAttempt[];
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokeTabooRoundResult | null;
  results: GameResults | null;
}

export type PokeTabooPlayerState =
  | { role: 'DESCRIPTOR'; canSendHint: boolean; secretPokemon: PokeTabooSecretPokemon | null }
  | { role: 'GUESSER'; canGuess: boolean; cooldownUntil: number | null; attemptCount: number }
  | { role: 'SPECTATOR' };

export const pokeTabooActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict(),
  z.object({ type: z.literal('SEND_HINT'), text: z.string().trim().min(1).max(180) }).strict(),
]);

export type PokeTabooAction = z.infer<typeof pokeTabooActionSchema>;
