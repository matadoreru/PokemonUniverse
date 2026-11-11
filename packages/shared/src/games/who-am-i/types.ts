import type { GamePhase } from '../contracts.js';

export const WHO_AM_I_ANSWERS = ['YES', 'NO', 'PARTLY', 'UNKNOWN'] as const;
export type WhoAmIAnswer = (typeof WHO_AM_I_ANSWERS)[number];

/** Paso del turno activo: el jugador pregunta, los demás responden, y el jugador decide (adivinar o pasar). */
export type WhoAmITurnStep = 'ASKING' | 'ANSWERING' | 'DECIDING';

export interface WhoAmIPokemon {
  id: string;
  name: string;
  sprite: string;
  nationalDexNumber: number;
  types: string[];
}

export interface WhoAmIAnswerEntry {
  playerId: string;
  answer: WhoAmIAnswer;
}

/**
 * Entrada del historial de un jugador (las pistas de quien pregunta).
 *
 * Regla del historial: la pregunta solo está en `currentQuestion` durante `ANSWERING` y `DECIDING`. Entra en el
 * historial del que pregunta, con las respuestas que tenga, cuando termina su turno, sea cual sea el motivo (pasar,
 * adivinar, plazo vencido o desconexión); en ese momento `currentQuestion` vuelve a ser nulo. Así la pantalla no
 * muestra la misma pregunta dos veces. Un fallo al adivinar añade una entrada `GUESS`.
 */
export type WhoAmIHistoryEntry =
  | { kind: 'QUESTION'; text: string; answers: WhoAmIAnswerEntry[] }
  | { kind: 'GUESS'; pokemon: WhoAmIPokemon };

/** Pregunta en curso del jugador del turno. Solo existe durante `ANSWERING` y `DECIDING`. */
export interface WhoAmICurrentQuestion {
  text: string;
  answers: WhoAmIAnswerEntry[];
  answeredPlayerIds: string[];
}

export interface WhoAmIResultEntry {
  playerId: string;
  pokemon: WhoAmIPokemon;
  solved: boolean;
  questionsAsked: number;
  points: number;
  rank: number;
}

/**
 * Estado público: no lleva ningún Pokémon de los jugadores hasta `GAME_RESULTS` (entonces `results` los revela).
 * `turnPlayerId` y `turnStep` son nulos fuera de `TURN_ACTIVE`.
 */
export interface WhoAmIPublicState {
  gameId: 'who-am-i';
  phase: GamePhase;
  lap: number;
  maxLaps: number;
  playerIds: string[];
  turnPlayerId: string | null;
  turnStep: WhoAmITurnStep | null;
  currentQuestion: WhoAmICurrentQuestion | null;
  /** Historial por id de jugador; véase `WhoAmIHistoryEntry` para cuándo entra una pregunta. */
  history: Record<string, WhoAmIHistoryEntry[]>;
  solvedPlayerIds: string[];
  questionsAsked: Record<string, number>;
  scores: Record<string, number>;
  turnEndsAt: number | null;
  results: WhoAmIResultEntry[] | null;
}

/**
 * Proyección por jugador.
 *
 * Regla del rol: `SPECTATOR` solo si el id NO está en `playerIds`. Un jugador original que deja de ser necesario
 * (desconectado o inactivo) sigue siendo `PLAYER`: su `others` le excluye a él y `self` es nulo hasta que acierte.
 * Un espectador recibe en `others` a todos los jugadores y `self` nulo. Antes de acertar, ni `others` ni nada más
 * contiene el Pokémon propio.
 */
export interface WhoAmIPlayerState {
  role: 'PLAYER' | 'SPECTATOR';
  others: Record<string, WhoAmIPokemon>;
  self: WhoAmIPokemon | null;
  canAsk: boolean;
  canAnswer: boolean;
  canGuess: boolean;
  canPass: boolean;
  ownAnswer: WhoAmIAnswer | null;
}
