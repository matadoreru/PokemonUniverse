/**
 * Kit de los juegos de adivinar (Arcade DS F6): Who's That, Zoomed, Palette, Cry, Pokédex Entry y Guess from Stats
 * comparten la placa de la acción, el marcador, los intentos, las pistas y la revelación. El marco de la pantalla es el
 * de todos los juegos (`room/game-kit/GameScreen.tsx`).
 */
export { GuessPanel } from './GuessPanel';
export type { GuessPanelProps, GuessPlateContent, GuessSelectorProps } from './GuessPanel';
export { GuessPlayersPanel, GuessAttemptsFeed, GuessRevealBoard } from './GuessSidePanels';
export { GuessHints } from './GuessHints';
export type { GuessHint } from './GuessHints';
export { GuessRoundReveal } from './GuessRoundReveal';
export { GuessStreakChip } from './GuessStreakChip';
export type { GuessAnswer } from './GuessRoundReveal';
export { attemptsText, guessOwnLastAttempt, guessPublicAttempts, guessRevealLines, guessScoreboard, guessSeconds, guessSolvedOrders, guessSprite, guessStreakLabel, ordinal, pointsWord, speedPodiumSolveDetail } from './presentation';
export { guessTop } from './results';
export type { GuessStats } from './results';
export { useGuessRound } from './useGuessRound';
export type { GuessRound, GuessRoundGame, GuessRoundOptions, GuessRoundPanelProps, GuessRoundPlayer, GuessRoundResultLike } from './useGuessRound';
