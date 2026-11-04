import type { RoomView, ZoomedPokemonPublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Timer, ZoomIn } from 'lucide-react';
import { Chip, Icon } from '../ui';
import { guessRecords, guessStatsLine, guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

/**
 * Resultados de Zoomed Pokémon: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N» y, en texto, aciertos, sin acertar, intentos, precisión, media, mejor tiempo, al primer intento y
 * los aciertos a máximo zoom) y, al lado, los récords de la partida (más aciertos, acierto más rápido y a máximo zoom;
 * empates juntos). Abajo, la acción del host. Un empate a cero no corona.
 */
export function ZoomedPokemonResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as ZoomedPokemonPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{guessStatsLine(standing.stats, [`${standing.stats.maxZoomSolves ?? 0} a máximo zoom`])}</span></>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const records = guessRecords(entries);
  const maxZoom = guessTop(entries, 'maxZoomSolves');
  const aside = <ResultsRecords id="zoomed-records-title" records={[
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: records.correct?.names ?? null, value: records.correct?.value ?? '', unit: records.correct?.value === '1' ? 'Pokémon reconocido' : 'Pokémon reconocidos' },
    { key: 'fastest', title: 'Acierto más rápido', icon: Timer, names: records.fastest?.names ?? null, value: records.fastest?.value ?? '', unit: 'desde que salió el recorte' },
    { key: 'maxZoom', title: 'A máximo zoom', icon: ZoomIn, names: maxZoom?.names ?? null, value: maxZoom ? String(maxZoom.value) : '', unit: maxZoom?.value === 1 ? 'acierto con el primer recorte' : 'aciertos con el primer recorte' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación final" subtitle={`Zoomed Pokémon · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge />;
}
