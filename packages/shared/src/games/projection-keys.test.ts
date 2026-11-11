import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AbsurdPokedexPlayerState, AbsurdPokedexPublicState, GuessFromStatsPlayerState, GuessFromStatsPublicState, HigherLowerPlayerState, HigherLowerPublicState, LearnsetGuessPlayerState, LearnsetGuessPublicState, MostLikelyToPlayerState, MostLikelyToPublicState, OneOfUsIsFakePlayerState, OneOfUsIsFakePublicState, PokeddleRacePlayerState, PokeddleRacePublicState, PokedexDistancePlayerState, PokedexDistancePublicState, PokedexEntryGuessPlayerState, PokedexEntryGuessPublicState, PokemonBingoPlayerState, PokemonBingoPublicState, PokemonBluffAuctionPlayerState, PokemonBluffAuctionPublicState, PokemonConnectionsPlayerState, PokemonConnectionsPublicState, PokemonCryQuizPlayerState, PokemonCryQuizPublicState, PokemonImpostorPlayerState, PokemonImpostorPublicState, PokemonPaletteGuessPlayerState, PokemonPaletteGuessPublicState, PokemonRedFlagPlayerState, PokemonRedFlagPublicState, PokemonTeamAuctionPlayerState, PokemonTeamAuctionPublicState, PokemonTriviaPlayerState, PokemonTriviaPublicState, PokeTabooPlayerState, PokeTabooPublicState, SecretRankingPlayerState, SecretRankingPublicState, ShinyVotePlayerState, ShinyVotePublicState, SketchmonPlayerState, SketchmonPublicState, TcgHigherLowerPlayerState, TcgHigherLowerPublicState, TypeChainPlayerState, TypeChainPublicState, TypeDuelPlayerState, TypeDuelPublicState, UnownTranslatorPlayerState, UnownTranslatorPublicState, WhoAmIPlayerState, WhoAmIPublicState, WhoIsWhoPlayerState, WhoIsWhoPublicState, WhosThatPokemonPlayerState, WhosThatPokemonPublicState, WouldYouRatherPlayerState, WouldYouRatherPublicState, ZoomedPokemonPlayerState, ZoomedPokemonPublicState } from '../public.js';

/**
 * Las proyecciones del `/ws` las escribe Java y la web las lee con los tipos `*PublicState` y `*PlayerState` de este
 * paquete. Las fixtures doradas (`backend/src/test/resources/golden/<id>/*.json`) graban lo que manda Java en cada
 * instantánea (`initial`, `afterStart` y `afterSteps[*].snapshot`); aquí solo se leen.
 *
 * Criterio, por juego:
 * - toda clave de `publicState` o de `playerStates[*]` que salga en una dorada tiene que estar en la lista (Java no
 *   manda nada que los tipos no declaren, ni con otro nombre);
 * - las claves `true` son obligatorias en todas las variantes del tipo que las tienen: tienen que salir en alguna
 *   dorada y, en `publicState` (siempre una interfaz), en todas sus instantáneas;
 * - las `'opcional'` (`?:` en alguna variante) pueden no salir en ninguna dorada.
 *
 * `KeyList` obliga a listar todas las claves del tipo, de todas las variantes de una unión, y a marcar opcional
 * justo lo que el tipo declara opcional.
 */
type AllKeys<T> = T extends unknown ? keyof T : never;
type OptionalIn<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? (Partial<Pick<T, K>> extends Pick<T, K> ? true : never) : never) : never;
type KeyList<T> = { [K in AllKeys<T>]-?: [OptionalIn<T, K>] extends [never] ? true : 'opcional' };
type Keys = Record<string, true | 'opcional'>;

const projections: Record<string, { publicState: Keys; playerState: Keys }> = {
  'absurd-pokedex': {
    publicState: { gameId: true, phase: true, mode: true, roundNumber: true, totalRounds: true, pokemon: true, playerIds: true, submittedPlayerIds: true, votedPlayerIds: true, entries: true, scores: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<AbsurdPokedexPublicState>,
    playerState: { role: true, canSubmit: true, ownDraft: true, ownEntry: true, canVote: true, ownVoteEntryId: true, ownFunnyEntryId: true } satisfies KeyList<AbsurdPokedexPlayerState>,
  },
  'guess-from-stats': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, visibleStats: true, hints: true, attempts: true, solvedPlayers: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<GuessFromStatsPublicState>,
    playerState: { canGuess: true, solved: true, solveOrder: true, cooldownUntil: true, roundPoints: true, attemptCount: true, lastAttempt: true, attempts: 'opcional' } satisfies KeyList<GuessFromStatsPlayerState>,
  },
  'higher-lower': {
    publicState: { gameId: true, phase: true, mode: true, playerIds: true, roundNumber: true, totalRounds: true, category: true, previousPokemon: true, currentPokemon: true, answers: true, answeredIds: true, scores: true, streaks: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true, alive: 'opcional' } satisfies KeyList<HigherLowerPublicState>,
    playerState: { canAnswer: true, answer: true } satisfies KeyList<HigherLowerPlayerState>,
  },
  'learnset-guess': {
    publicState: { gameId: true, phase: true, mode: true, roundNumber: true, totalRounds: true, referenceGeneration: true, referenceSource: true, visibleGroups: true, evolutionHint: true, attempts: true, solvedPlayers: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastWarning: true, lastRound: true, scores: true, results: true } satisfies KeyList<LearnsetGuessPublicState>,
    playerState: { canGuess: true, solved: true, solveOrder: true, cooldownUntil: true, roundPoints: true, revealedGroups: 'opcional', attempts: 'opcional', totalGroups: 'opcional' } satisfies KeyList<LearnsetGuessPlayerState>,
  },
  'most-likely-to': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, prompt: true, playerIds: true, selectionCompletedIds: true, revealedAnswers: true, votedPlayerIds: true, voteCandidates: true, voteRoundNumber: true, scores: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<MostLikelyToPublicState>,
    playerState: { role: true, canSelect: true, ownChoice: true, canVote: true, ownVotePlayerId: true } satisfies KeyList<MostLikelyToPlayerState>,
  },
  'one-of-us-is-fake': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, playerIds: true, selectionCompletedIds: true, revealedChoices: true, votedPlayerIds: true, voteCandidates: true, voteRoundNumber: true, scores: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<OneOfUsIsFakePublicState>,
    playerState: { role: true, myCategory: true, ownChoice: true, canSelect: true, canVote: true, ownVotePlayerId: true, isFake: 'opcional' } satisfies KeyList<OneOfUsIsFakePlayerState>,
  },
  'poke-taboo': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, lapNumber: true, totalLaps: true, descriptorId: true, nextDescriptorId: true, descriptorOrder: true, hints: true, attempts: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<PokeTabooPublicState>,
    playerState: { role: true, canGuess: true, cooldownUntil: true, attemptCount: true, canSendHint: true, secretPokemon: true, attempts: 'opcional' } satisfies KeyList<PokeTabooPlayerState>,
  },
  'pokeddle-race': {
    publicState: { gameId: true, phase: true, roundNumber: true, maxRounds: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, answeredPlayerIds: true, activePlayerIds: true, boards: true, enabledClues: true, results: true } satisfies KeyList<PokeddleRacePublicState>,
    playerState: { canGuess: true, hasGuessedThisRound: true, solved: true } satisfies KeyList<PokeddleRacePlayerState>,
  },
  'pokedex-distance': {
    publicState: { gameId: true, phase: true, mode: true, roundNumber: true, tiebreakDepth: true, targetDexNumber: true, eligibleIds: true, survivorIds: true, spectatorIds: true, selections: true, selectedIds: true, lockedPokemonIds: true, roundStartedAt: true, roundEndsAt: true, lastRound: true, roundHistory: true, winnerId: true, nextTransitionAt: true, results: true, pointsRound: 'opcional', pointsRounds: 'opcional', scores: 'opcional' } satisfies KeyList<PokedexDistancePublicState>,
    playerState: { canSelect: true, selection: true, exactHit: true } satisfies KeyList<PokedexDistancePlayerState>,
  },
  'pokedex-entry-guess': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, referenceGeneration: true, entryText: true, hints: true, attempts: true, solvedPlayers: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<PokedexEntryGuessPublicState>,
    playerState: { canGuess: true, solved: true, solveOrder: true, cooldownUntil: true, roundPoints: true, attemptCount: true, lastAttempt: true, attempts: 'opcional' } satisfies KeyList<PokedexEntryGuessPlayerState>,
  },
  'pokemon-bingo': {
    publicState: { gameId: true, phase: true, width: true, height: true, roundEndsAt: true, nextTransitionAt: true, winnerId: true, bingoAt: true, boards: true, results: true } satisfies KeyList<PokemonBingoPublicState>,
    playerState: { canAct: true, cooldownUntil: true, lastAttempt: true } satisfies KeyList<PokemonBingoPlayerState>,
  },
  'pokemon-bluff-auction': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, playerIds: true, condition: true, bidOrder: true, currentTurnPlayerId: true, passedPlayerIds: true, currentBid: true, minimumBid: true, currentBidderId: true, bidHistory: true, maxBid: true, bidderId: true, targetBid: true, attempts: true, correctCount: true, incorrectCount: true, remainingCount: true, scores: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<PokemonBluffAuctionPublicState>,
    playerState: { role: true, canRaise: true, canPass: true, canSubmitPokemon: true } satisfies KeyList<PokemonBluffAuctionPlayerState>,
  },
  'pokemon-connections': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, groupSize: true, groupCount: true, board: true, playerProgress: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<PokemonConnectionsPublicState>,
    playerState: { role: true, canSubmit: true, foundGroups: true, mistakesUsed: true, mistakesAllowed: true, status: true, completionRank: true, roundPoints: true, lastAttempt: true } satisfies KeyList<PokemonConnectionsPlayerState>,
  },
  'pokemon-cry-quiz': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, cryUrl: true, attempts: true, solvedPlayers: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<PokemonCryQuizPublicState>,
    playerState: { role: true, canGuess: true, solved: true, solveOrder: true, cooldownUntil: true, roundPoints: true, attemptCount: true, lastAttempt: true, attempts: 'opcional' } satisfies KeyList<PokemonCryQuizPlayerState>,
  },
  'pokemon-impostor': {
    publicState: { gameId: true, phase: true, mode: true, playerIds: true, aliveIds: true, eliminatedIds: true, spectatorIds: true, roundNumber: true, clues: true, clueOrder: true, currentClueTurnIndex: true, currentCluePlayerId: true, cluePendingIds: true, voteCompletedIds: true, voteCandidateIds: true, votingRound: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastVoteResult: true, eliminationReveal: true, winnerTeam: true, finishReason: true, results: true, clueLap: 'opcional' } satisfies KeyList<PokemonImpostorPublicState>,
    playerState: { role: true, secretPokemon: true, revealedRoles: true, alive: true, canSubmitClue: true, ownClue: true, canGuessPokemon: true, guessUsed: true, guessCorrect: true, canVote: true, ownVote: true, fellowImpostorIds: 'opcional' } satisfies KeyList<PokemonImpostorPlayerState>,
  },
  'pokemon-palette-guess': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, colors: true, colorWeights: true, hints: true, attempts: true, solvedPlayers: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<PokemonPaletteGuessPublicState>,
    playerState: { role: true, canGuess: true, solved: true, solveOrder: true, cooldownUntil: true, roundPoints: true, attemptCount: true, lastAttempt: true, attempts: 'opcional' } satisfies KeyList<PokemonPaletteGuessPlayerState>,
  },
  'pokemon-red-flag': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, pokemon: true, flagMode: true, playerIds: true, submittedPlayerIds: true, revealedAnswers: true, votedPlayerIds: true, voteCandidateIds: true, voteRoundNumber: true, scores: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<PokemonRedFlagPublicState>,
    playerState: { role: true, canSubmit: true, ownDraft: true, ownAnswer: true, canVote: true, ownVoteAnswerId: true, ownAnswerId: true } satisfies KeyList<PokemonRedFlagPlayerState>,
  },
  'pokemon-team-auction': {
    publicState: { roundEndsAt: 'opcional', gameId: true, phase: true, lotNumber: true, totalLots: true, currentPokemon: true, currentBid: true, minimumBid: true, currentBidderId: true, currentTurnPlayerId: true, turnOrder: true, passedPlayerIds: true, bidHistory: true, lotHistory: true, participants: true, scores: true, results: true } satisfies KeyList<PokemonTeamAuctionPublicState>,
    playerState: { role: true, canRaise: true, canPass: true, minimumBid: true, coins: true, team: true } satisfies KeyList<PokemonTeamAuctionPlayerState>,
  },
  'pokemon-trivia': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, difficulty: true, prompt: true, questionType: true, options: true, answeredPlayerIds: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<PokemonTriviaPublicState>,
    playerState: { role: true, canAnswer: true, answer: true } satisfies KeyList<PokemonTriviaPlayerState>,
  },
  'secret-ranking': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, prompt: true, pokemon: true, submittedPlayerIds: true, scores: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<SecretRankingPublicState>,
    playerState: { role: true, canSubmit: true, ownRanking: true } satisfies KeyList<SecretRankingPlayerState>,
  },
  'shiny-vote': {
    publicState: { gameId: true, phase: true, mode: true, roundNumber: true, totalRounds: true, playerIds: true, options: true, votes: true, votedPlayerIds: true, voteVisibility: true, pendingPlayerIds: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, correctOptionId: true, lastRound: true, winnerId: true, results: true, alive: 'opcional', roundsSurvived: 'opcional' } satisfies KeyList<ShinyVotePublicState>,
    playerState: { canVote: true, vote: true, roundResult: true } satisfies KeyList<ShinyVotePlayerState>,
  },
  'sketchmon': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, lapNumber: true, totalLaps: true, drawerId: true, nextDrawerId: true, drawerOrder: true, strokes: true, visibleHints: true, attempts: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, gallery: true, results: true } satisfies KeyList<SketchmonPublicState>,
    playerState: { role: true, canGuess: true, cooldownUntil: true, attemptCount: true, canDraw: true, secretPokemon: true, attempts: 'opcional' } satisfies KeyList<SketchmonPlayerState>,
  },
  'tcg-higher-lower': {
    publicState: { gameId: true, phase: true, playerIds: true, roundNumber: true, totalRounds: true, currency: true, previousCard: true, currentCard: true, answeredIds: true, scores: true, streaks: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<TcgHigherLowerPublicState>,
    playerState: { canAnswer: true, answer: true } satisfies KeyList<TcgHigherLowerPlayerState>,
  },
  'type-chain': {
    publicState: { gameId: true, phase: true, turnOrder: true, activePlayerIds: true, eliminatedPlayerIds: true, currentPlayerId: true, nextPlayerId: true, turnNumber: true, chainNumber: true, chainType: true, chain: true, usedPokemonIds: true, longestChain: true, namedCounts: true, turnStartedAt: true, roundEndsAt: true, invalidAttempts: true, eliminations: true, events: true, results: true } satisfies KeyList<TypeChainPublicState>,
    playerState: { canSubmit: true, isCurrentPlayer: true, eliminated: true, cooldownUntil: true, lastAttempt: true } satisfies KeyList<TypeChainPlayerState>,
  },
  'type-duel': {
    publicState: { gameId: true, phase: true, mode: true, playerIds: true, completedRounds: true, roundNumber: true, totalRounds: true, participants: true, participationCounts: true, typeSelectionCompletedIds: true, revealedTypes: true, requiredTypes: true, solutionCount: true, invalidCombinations: true, finalSelectionCycle: true, attempts: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true, found: 'opcional', contributions: 'opcional', combination: 'opcional' } satisfies KeyList<TypeDuelPublicState>,
    playerState: { participant: true, ownType: true, canSelectType: true, canAttempt: true, cooldownUntil: true } satisfies KeyList<TypeDuelPlayerState>,
  },
  'unown-translator': {
    publicState: { gameId: true, phase: true, mode: true, roundNumber: true, totalRounds: true, playerIds: true, tokens: true, alphabet: true, solvedPlayerIds: true, roundPointsByPlayer: true, scores: true, roundEndsAt: true, nextHintAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<UnownTranslatorPublicState>,
    playerState: { role: true, canGuess: true, solved: true, answer: true, cooldownUntil: true, attemptCount: true, lastAttempt: true } satisfies KeyList<UnownTranslatorPlayerState>,
  },
  'who-am-i': {
    publicState: { gameId: true, phase: true, lap: true, maxLaps: true, playerIds: true, turnPlayerId: true, turnStep: true, currentQuestion: true, history: true, solvedPlayerIds: true, questionsAsked: true, scores: true, turnEndsAt: true, results: true } satisfies KeyList<WhoAmIPublicState>,
    playerState: { role: true, others: true, self: true, canAsk: true, canAnswer: true, canGuess: true, canPass: true, ownAnswer: true } satisfies KeyList<WhoAmIPlayerState>,
  },
  'who-is-who-pokemon': {
    publicState: { gameId: true, phase: true, board: true, teams: true, currentTeam: true, roundNumber: true, turnNumber: true, totalRounds: true, roundStartedAt: true, roundEndsAt: true, guesses: true, winnerTeam: true, revealedSecrets: true, results: true } satisfies KeyList<WhoIsWhoPublicState>,
    playerState: { role: true, team: true, ownSecret: true, discardedPokemonIds: true, canChooseSecret: true, canManageBoard: true, canAct: true, canGuess: true, guessUsed: true, lastGuess: true } satisfies KeyList<WhoIsWhoPlayerState>,
  },
  'whos-that-pokemon': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, silhouetteSprite: true, visibleHints: true, attempts: true, solvedPlayers: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<WhosThatPokemonPublicState>,
    playerState: { canGuess: true, solved: true, solveOrder: true, cooldownUntil: true, roundPoints: true, attemptCount: true, lastAttempt: true, attempts: 'opcional' } satisfies KeyList<WhosThatPokemonPlayerState>,
  },
  'would-you-rather': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, prompt: true, playerIds: true, submittedPlayerIds: true, scores: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<WouldYouRatherPublicState>,
    playerState: { role: true, canSubmit: true, ownBallot: true } satisfies KeyList<WouldYouRatherPlayerState>,
  },
  'zoomed-pokemon': {
    publicState: { gameId: true, phase: true, roundNumber: true, totalRounds: true, imageUrl: true, imageSourceType: true, focusPoint: true, zoomStages: true, currentZoomStage: true, currentZoomBonus: true, visibleHints: true, attempts: true, solves: true, scores: true, roundStartedAt: true, roundEndsAt: true, nextTransitionAt: true, lastRound: true, results: true } satisfies KeyList<ZoomedPokemonPublicState>,
    playerState: { canGuess: true, solved: true, solveOrder: true, cooldownUntil: true, roundPoints: true, attemptCount: true, lastAttempt: true, attempts: 'opcional' } satisfies KeyList<ZoomedPokemonPlayerState>,
  },
};

interface Snapshot { publicState: Record<string, unknown>; playerStates: Record<string, Record<string, unknown>> }
interface Fixture { expected: { initial?: Snapshot; afterStart?: Snapshot; afterSteps?: { snapshot?: Snapshot }[] } }

const golden = new URL('../../../../backend/src/test/resources/golden/', import.meta.url);
const ids = readdirSync(golden, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'catalog').map((entry) => entry.name).sort();

function snapshots(id: string): { file: string; snapshot: Snapshot }[] {
  const dir = new URL(`${id}/`, golden);
  return readdirSync(dir).filter((file) => file.endsWith('.json') && file !== 'config-cases.json').sort().flatMap((file) => {
    const { expected } = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as Fixture;
    return [expected.initial, expected.afterStart, ...(expected.afterSteps ?? []).map((step) => step.snapshot)]
      .filter((snapshot): snapshot is Snapshot => snapshot !== undefined)
      .map((snapshot) => ({ file, snapshot }));
  });
}

const required = (keys: Keys): string[] => Object.keys(keys).filter((key) => keys[key] === true).sort();

it('hay una lista por cada juego con doradas, y ninguna de más', () => {
  expect(Object.keys(projections).sort()).toEqual(ids);
});

describe.each(ids)('proyecciones de %s frente a sus doradas', (id) => {
  const all = snapshots(id);
  const lists = projections[id]!;

  it('publicState', () => {
    expect(all.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const { file, snapshot } of all) {
      const keys = Object.keys(snapshot.publicState);
      keys.forEach((key) => seen.add(key));
      expect(keys.filter((key) => !(key in lists.publicState)), `${file}: claves que el tipo no declara`).toEqual([]);
      expect(required(lists.publicState).filter((key) => !keys.includes(key)), `${file}: claves obligatorias ausentes`).toEqual([]);
    }
  });

  it('playerStates', () => {
    const seen = new Set<string>();
    for (const { file, snapshot } of all) {
      for (const state of Object.values(snapshot.playerStates)) {
        const keys = Object.keys(state);
        keys.forEach((key) => seen.add(key));
        expect(keys.filter((key) => !(key in lists.playerState)), `${file}: claves que el tipo no declara`).toEqual([]);
      }
    }
    expect(required(lists.playerState).filter((key) => !seen.has(key)), 'claves obligatorias que no salen en ninguna dorada').toEqual([]);
  });
});
