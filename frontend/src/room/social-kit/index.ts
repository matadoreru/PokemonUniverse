/**
 * Kit de los juegos sociales y de votación (Arcade DS F7): Most Likely To, Red Flag, Would You Rather, One of Us Is
 * Fake, Secret Ranking y Poké Taboo comparten el marco, las fases, el progreso del grupo, la papeleta con segunda vuelta
 * y el recuento de la revelación.
 */
export { SocialScreen } from './SocialScreen';
export type { SocialScreenProps, SocialTimer } from './SocialScreen';
export { SocialPrompt } from './SocialPrompt';
export type { SocialPromptProps } from './SocialPrompt';
export { SocialPlate } from './SocialPlate';
export type { SocialPlateContent, SocialPlateProps } from './SocialPlate';
export { PhaseRail } from './PhaseRail';
export type { PhaseRailProps, PhaseStep } from './PhaseRail';
export { ResponseProgress } from './ResponseProgress';
export type { ProgressStatus, ResponseProgressProps } from './ResponseProgress';
export { VoteBallot } from './VoteBallot';
export type { BallotOption, VoteBallotProps } from './VoteBallot';
export { ChoicePair } from './ChoicePair';
export type { ChoiceOption, ChoicePairProps } from './ChoicePair';
export { VoteTally } from './VoteTally';
export type { TallyOption, VoteTallyProps } from './VoteTally';
export { ballotState, bindChoiceShortcuts, choiceFromKey, namesList, phaseIndex, runoffCounts, runoffLeaders, runoffTotal, socialFocusKey, tallyOutcome, tallySummary, typingTarget, votesText } from './presentation';
export type { BallotState, RunoffCount, RunoffRoundLike, ShortcutTarget, TallyOutcome } from './presentation';
