/**
 * Kit de los juegos de adivinar (Arcade DS F6): Who's That, Zoomed, Palette, Cry, Pokédex Entry y Guess from Stats
 * comparten el marco, la placa de la acción, el marcador, los intentos, las pistas y la revelación.
 */
export { GuessScreen, GuessClue, GUESS_SIDE_FIT } from './GuessScreen';
export type { GuessScreenProps, GuessTimer } from './GuessScreen';
export { GuessPanel } from './GuessPanel';
export type { GuessPanelProps, GuessPlateContent, GuessSelectorProps } from './GuessPanel';
export { GuessPlayersPanel, GuessAttemptsFeed, GuessRevealBoard } from './GuessSidePanels';
export { GuessHints } from './GuessHints';
export type { GuessHint } from './GuessHints';
export { GuessRoundReveal } from './GuessRoundReveal';
export type { GuessAnswer } from './GuessRoundReveal';
export { attemptsText, guessOwnLastAttempt, guessPublicAttempts, guessRevealLines, guessScoreboard, guessSeconds, guessSolvedOrders, guessSprite, ordinal, pointsWord } from './presentation';
export { guessTop } from './results';
export type { GuessStats } from './results';
export { useGuessRound } from './useGuessRound';
export type { GuessRound, GuessRoundGame, GuessRoundOptions, GuessRoundPanelProps, GuessRoundPlayer, GuessRoundResultLike } from './useGuessRound';
