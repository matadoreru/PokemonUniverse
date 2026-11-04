/**
 * Kit de los juegos de adivinar (Arcade DS F6): Who's That, Zoomed, Palette, Cry, Pokédex Entry y Guess from Stats
 * comparten el marco, la placa de la acción, el marcador, los intentos, las pistas y la revelación.
 */
export { GuessScreen, GuessClue } from './GuessScreen';
export type { GuessScreenProps, GuessTimer } from './GuessScreen';
export { GuessPanel } from './GuessPanel';
export type { GuessPanelProps, GuessSelectorProps } from './GuessPanel';
export { GuessPlayersPanel, GuessAttemptsFeed, GuessRevealBoard } from './GuessSidePanels';
export { GuessHints } from './GuessHints';
export type { GuessHint } from './GuessHints';
export { GuessRoundReveal } from './GuessRoundReveal';
export type { GuessAnswer } from './GuessRoundReveal';
export {
  attemptsText, guessAnnouncement, guessFocusKey, guessOwnLastAttempt, guessPanelKind, guessRevealLines, guessScoreboard, guessSeconds,
  guessSolvedOrders, guessSprite, guessVerdict, ordinal, pointsWord,
} from './presentation';
export type { GuessAttemptLike, GuessPanelKind, GuessRevealLine, GuessRevealSolveLike, GuessScoreLine, GuessVerdict } from './presentation';
export { guessRecords, guessRoundFirsts, guessStatsLine, guessTop } from './results';
export type { GuessRecord, GuessStats } from './results';
