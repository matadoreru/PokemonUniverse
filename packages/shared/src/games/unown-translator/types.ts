import type { GamePhase, GameResults } from '../contracts.js';
import type { UnownTranslatorMode } from './config.js';

/** Una pieza del mensaje cifrado: glifo oculto, glifo ya traducido a letra, o un carácter que no se cifra. */
export type UnownToken =
  | { kind: 'GLYPH'; glyph: number }
  | { kind: 'LETTER'; glyph: number; letter: string }
  | { kind: 'LITERAL'; text: string };

export interface UnownAlphabetEntry {
  glyph: number;
  letter: string;
}

export interface UnownTranslatorPokemon {
  id: string;
  name: string;
  sprite: string;
  nationalDexNumber: number;
  types: string[];
}

export interface UnownTranslatorMove {
  name: string;
  type: string;
  category: string;
}

export interface UnownTranslatorSolve {
  playerId: string;
  points: number;
  hiddenLetters: number;
  solvedAt: number;
}

export interface UnownTranslatorRoundResult {
  mode: UnownTranslatorMode;
  answer: string;
  pokemon: UnownTranslatorPokemon | null;
  move: UnownTranslatorMove | null;
  /** En orden de acierto. Sin piezas: glifo y letra juntos para todo el mensaje darían la clave entera. */
  solves: UnownTranslatorSolve[];
  missingPlayerIds: string[];
}

export interface UnownTranslatorPublicState {
  gameId: 'unown-translator';
  phase: GamePhase;
  mode: UnownTranslatorMode;
  roundNumber: number;
  totalRounds: number;
  playerIds: string[];
  /** Vacío fuera de `ROUND_ACTIVE`. */
  tokens: UnownToken[];
  alphabet: UnownAlphabetEntry[];
  solvedPlayerIds: string[];
  roundPointsByPlayer: Record<string, number>;
  scores: Record<string, number>;
  roundEndsAt: number | null;
  nextHintAt: number | null;
  nextTransitionAt: number | null;
  lastRound: UnownTranslatorRoundResult | null;
  results: GameResults | null;
}

export type UnownTranslatorPlayerState =
  | { role: 'PLAYER'; canGuess: boolean; solved: boolean; answer: string | null; cooldownUntil: number | null; attemptCount: number; lastAttempt: { outcome: 'CORRECT' | 'INCORRECT'; at: number } | null }
  | { role: 'SPECTATOR'; canGuess: false; solved: false; answer: null; cooldownUntil: null; attemptCount: 0; lastAttempt: null };
