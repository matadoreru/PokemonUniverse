import type { PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { GuessedPokemon } from '../guess-types.js';

export interface PokeTabooAttempt {
  playerId: string;
  guessedPokemon: GuessedPokemon;
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
  /** `attempts` del descriptor: con `publicAttempts` apagado, los fallos de todos. */
  | { role: 'DESCRIPTOR'; canSendHint: boolean; secretPokemon: PokeTabooSecretPokemon | null; attempts?: PokeTabooAttempt[] }
  /** `attempts`: solo con `publicAttempts` apagado, los fallos propios de la ronda. */
  | { role: 'GUESSER'; canGuess: boolean; cooldownUntil: number | null; attemptCount: number; attempts?: PokeTabooAttempt[] }
  | { role: 'SPECTATOR' };
