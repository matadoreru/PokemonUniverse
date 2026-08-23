import type { GameResults, GameStanding } from '../contracts.js';
import type { ImpostorRole, ImpostorWinner, PokemonImpostorState } from './types.js';

export function impostorWinner(aliveIds: readonly string[], roles: Readonly<Record<string, ImpostorRole>>): ImpostorWinner | null {
  const impostors = aliveIds.filter((id) => roles[id] === 'IMPOSTOR').length;
  const innocents = aliveIds.length - impostors;
  if (impostors === 0) return 'INNOCENTS';
  if (impostors >= innocents) return 'IMPOSTORS';
  return null;
}

export function buildPokemonImpostorResults(state: PokemonImpostorState): GameResults {
  if (state.phase !== 'GAME_RESULTS' || !state.winnerTeam) throw new Error('Results are unavailable before the game finishes');
  const winners = state.playerIds.filter((id) => (state.winnerTeam === 'IMPOSTORS') === (state.roles[id] === 'IMPOSTOR'));
  const standings: GameStanding[] = state.playerIds.map((playerId) => {
    const won = winners.includes(playerId);
    const stats = state.playerStats[playerId] ?? { cluesSubmitted: 0, votesCast: 0 };
    const wasImpostor = state.roles[playerId] === 'IMPOSTOR';
    return {
      playerId,
      position: won ? 1 : 2,
      points: won ? 1 : 0,
      won,
      stats: {
        ...stats,
        wasImpostor: wasImpostor ? 1 : 0,
        survived: state.aliveIds.includes(playerId) ? 1 : 0,
        playedAsInnocent: wasImpostor ? 0 : 1,
        wonAsInnocent: !wasImpostor && won ? 1 : 0,
        playedAsImpostor: wasImpostor ? 1 : 0,
        wonAsImpostor: wasImpostor && won ? 1 : 0,
        pokemonGuessed: state.guessAttempts[playerId]?.correct ? 1 : 0,
      },
    };
  }).sort((a, b) => a.position - b.position || a.playerId.localeCompare(b.playerId));
  return { winnerId: winners.length === 1 ? winners[0]! : null, standings };
}
