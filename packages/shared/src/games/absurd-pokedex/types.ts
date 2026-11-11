import type { GamePhase, GameResults } from '../contracts.js';
import type { AbsurdPokedexMode } from './config.js';

export interface AbsurdPokedexPokemon {
  id: string;
  name: string;
  sprite: string;
  nationalDexNumber: number;
  types: string[];
}

/** Una entrada anónima durante la votación: sin autor ni indicio de si es la oficial. */
export interface AbsurdPokedexEntryView {
  id: string;
  text: string;
}

export interface AbsurdPokedexEntryResult {
  id: string;
  text: string;
  /** `null` en la entrada oficial. */
  authorId: string | null;
  isReal: boolean;
  votesReceived: number;
  funnyVotesReceived: number;
  votedBy: string[];
  funnyVotedBy: string[];
}

export interface AbsurdPokedexRoundResult {
  mode: AbsurdPokedexMode;
  pokemon: AbsurdPokedexPokemon;
  skipped: boolean;
  /** Ordenadas por `votesReceived` descendente y luego por id. */
  entries: AbsurdPokedexEntryResult[];
  realEntry: { id: string; versionLabel: string } | null;
  winnerPlayerIds: string[];
  pointsAwarded: Record<string, number>;
  missingPlayerIds: string[];
}

export interface AbsurdPokedexPublicState {
  gameId: 'absurd-pokedex';
  phase: GamePhase;
  mode: AbsurdPokedexMode;
  roundNumber: number;
  totalRounds: number;
  pokemon: AbsurdPokedexPokemon | null;
  playerIds: string[];
  submittedPlayerIds: string[];
  votedPlayerIds: string[];
  /** Vacío fuera de `VOTING`. */
  entries: AbsurdPokedexEntryView[];
  scores: Record<string, number>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: AbsurdPokedexRoundResult | null;
  results: GameResults | null;
}

export type AbsurdPokedexPlayerState =
  | { role: 'PLAYER'; canSubmit: boolean; ownDraft: string; ownEntry: { id: string | null; text: string } | null; canVote: boolean; ownVoteEntryId: string | null; ownFunnyEntryId: string | null }
  | { role: 'SPECTATOR'; canSubmit: false; ownDraft: ''; ownEntry: null; canVote: false; ownVoteEntryId: null; ownFunnyEntryId: null };
