import type { PokeddleRacePublicState, RoomView } from '@pokemon-universe/shared/public';
import { Flag, ListChecks, Timer, X, Check } from 'lucide-react';
import { Chip, Icon } from '../ui';
import { guessSeconds, guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { pokeddleAttemptsText, pokeddleVisibleSecret } from './pokeddle-presentation';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

const num = (stats: Record<string, number>, key: string) => Number(stats[key] ?? 0);

/** Línea de métricas de un jugador en texto: intentos, rondas sin responder y, si lo resolvió, el tiempo desde el inicio. */
export function pokeddleStatsLine(stats: Record<string, number>): string {
  const resolved = num(stats, 'resolved') > 0;
  return [
    pokeddleAttemptsText(num(stats, 'totalGuesses')),
    `${num(stats, 'missedRounds')} sin responder`,
    resolved && num(stats, 'bestTimeMs') > 0 ? `resuelto a los ${guessSeconds(num(stats, 'bestTimeMs'))}` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Resultados de Pokédle Race: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con insignia
 * y «+N»), con el Pokémon secreto de cada uno (encontrado o no) y sus métricas en texto; al lado, los récords (la
 * resolución en menos rondas, con menos intentos y la más rápida desde el inicio; empates juntos). Abajo, la acción del
 * host. Nadie resuelto no corona a nadie.
 */
export function PokeddleRaceResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokeddleRacePublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    const board = game.boards[standing.playerId];
    const secret = board ? pokeddleVisibleSecret(board, game.phase) : null;
    const solved = board?.solved === true;
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <>
        {solved
          ? <><Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Encontrado</Chip><span>{secret?.name ?? 'Su Pokémon'} · ronda {board?.solvedRound}</span></>
          : <><Chip tone="bad" icon={<Icon icon={X} size={18} />}>No resuelto</Chip>{secret && <span>Era {secret.name}</span>}</>}
        <span>{pokeddleStatsLine(standing.stats)}</span>
      </>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const rounds = guessTop(entries, 'bestResolutionRounds', true);
  const fewest = guessTop(entries, 'guessesToSolveTotal', true);
  const fastest = guessTop(entries, 'bestTimeMs', true);
  const aside = <ResultsRecords id="pokeddle-records-title" records={[
    { key: 'rounds', title: 'En menos rondas', icon: Flag, names: rounds?.names ?? null, value: rounds ? String(rounds.value) : '', unit: rounds?.value === 1 ? 'ronda hasta encontrar su Pokémon' : 'rondas hasta encontrar su Pokémon' },
    { key: 'fewest', title: 'Menos intentos', icon: ListChecks, names: fewest?.names ?? null, value: fewest ? String(fewest.value) : '', unit: fewest?.value === 1 ? 'intento para resolverlo' : 'intentos para resolverlo' },
    { key: 'fastest', title: 'Resolución más rápida', icon: Timer, names: fastest?.names ?? null, value: fastest ? guessSeconds(fastest.value) : '', unit: 'desde el inicio de la partida' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación final" subtitle={`${GAME_SUBTITLE} · ${game.roundNumber} ${game.roundNumber === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge />;
}

const GAME_SUBTITLE = 'Pokédle Race';
