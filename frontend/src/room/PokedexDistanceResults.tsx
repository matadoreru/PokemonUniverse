import type { PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared/public';
import { RotateCcw, StopCircle, Target } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ResultsShell } from './ResultsShell';
import { distanceBestLabel, distanceCell, type DistanceCellTone, distanceResultsSummary, distanceRoundLabel, distanceStandingLabel, distanceStatsLine } from './pokedex-distance-results';

const CELL_TONE: Record<DistanceCellTone, string> = {
  leaf: 'text-leaf',
  aqua: 'text-aqua',
  ink: 'text-ink',
  berry: 'bg-berry/10 text-berry',
  muted: 'text-ink/65',
};

export function PokedexDistanceResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokedexDistancePublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const winnerId = game.results?.winnerId ?? null;
  const history = game.roundHistory;
  const summary = distanceResultsSummary(history, standings.map((standing) => standing.playerId));
  const byPlayer = new Map(summary.players.map((player) => [player.playerId, player]));
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const avatarOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.avatar;
  const best = summary.best;

  return <ResultsShell won={winnerId === selfId} title={winnerId ? 'Resultado de la partida' : 'Partida desierta'} subtitle={`Pokédex Distance · Partida ${room.gamesPlayed}`}>
    <ol className="space-y-2" aria-label="Clasificación">{standings.map((standing) => {
      const player = byPlayer.get(standing.playerId);
      const won = standing.playerId === winnerId;
      const standingLabel = player ? distanceStandingLabel(player, winnerId) : null;
      return <li key={standing.playerId} className={`ranking-row ${won ? 'border-electric/50 bg-electric/[.08]' : ''}`}>
        <strong className="w-9 text-center font-display text-2xl tabular-nums">{won ? '👑' : standing.position}</strong>
        <span className="hidden sm:block"><Avatar name={nameOf(standing.playerId)} avatar={avatarOf(standing.playerId)} size="md" /></span>
        <div className="min-w-0">
          <strong className="block truncate font-display text-lg" title={nameOf(standing.playerId)}>{nameOf(standing.playerId)}</strong>
          {standingLabel && <p className={`text-sm font-extrabold ${won ? 'text-ink' : 'text-berry'}`}>{standingLabel}</p>}
          <p className="text-sm font-bold text-ink/65">{distanceStatsLine(standing.stats)}</p>
        </div>
        <strong className="justify-self-end text-xl tabular-nums text-berry">+{standing.points}</strong>
      </li>;
    })}</ol>

    <section className="mt-6" aria-labelledby="distance-best-title">
      {best ? <div className="motion-enter-up flex items-center gap-4 rounded-xl border-2 border-electric/60 bg-electric/10 p-4">
        <Target className="shrink-0 text-electric" size={36} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="distance-best-title" className="text-sm font-extrabold text-ink/70">Mejor acierto</h2>
          <strong className="block truncate font-display text-xl" title={nameOf(best.playerId)}>{nameOf(best.playerId)}</strong>
          <p className="text-sm font-bold text-ink/70">{distanceBestLabel(best)}</p>
        </div>
        <strong className="font-display text-4xl tabular-nums text-ink" aria-hidden="true">{best.distance}</strong>
      </div> : <div className="empty-state"><h2 id="distance-best-title" className="font-extrabold">Mejor acierto</h2><p className="text-sm font-bold">Nadie llegó a elegir un Pokémon en esta partida.</p></div>}
    </section>

    {history.length > 0 && <section className="mt-6" aria-labelledby="distance-rounds-title">
      <h2 id="distance-rounds-title" className="mb-3 font-display text-xl font-bold">Distancia por ronda</h2>
      {/* Desplazable con teclado: a 390 las últimas columnas quedan dentro de la caja. */}
      <div className="overflow-x-auto rounded-xl border border-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua" tabIndex={0} role="region" aria-labelledby="distance-rounds-title">
        <table className="w-full border-collapse text-sm">
          <thead><tr>
            <th scope="col" className="sticky left-0 bg-surface px-3 py-2.5 text-left font-extrabold">Entrenador</th>
            {history.map((record) => <th key={`${record.roundNumber}-${record.tiebreakDepth}`} scope="col" className="whitespace-nowrap px-3 py-2.5 text-center font-extrabold" title={record.tiebreakDepth > 0 ? `Ronda ${record.roundNumber}, desempate ${record.tiebreakDepth} · objetivo #${record.targetDexNumber}` : `Ronda ${record.roundNumber} · objetivo #${record.targetDexNumber}`}>{distanceRoundLabel(record)}</th>)}
          </tr></thead>
          <tbody>{standings.map((standing) => <tr key={standing.playerId} className="border-t border-ink/10">
            <th scope="row" className="sticky left-0 max-w-36 bg-surface px-3 py-2.5 text-left font-bold"><span className="block truncate" title={nameOf(standing.playerId)}>{nameOf(standing.playerId)}</span></th>
            {history.map((record) => { const cell = distanceCell(record, standing.playerId); return <td key={`${record.roundNumber}-${record.tiebreakDepth}`} className={`whitespace-nowrap px-3 py-2.5 text-center font-extrabold tabular-nums ${CELL_TONE[cell.tone]}`} title={cell.label}><span aria-hidden="true">{cell.mark && `${cell.mark} `}{cell.text}</span><span className="sr-only">{cell.label}</span></td>; })}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs font-bold text-ink/60">Distancia al número de Pokédex objetivo. ✓ acierto exacto · en azul, a 10 o menos · ✗ ronda en la que cayó · — sin respuesta o no jugaba. D1, D2… son los desempates.</p>
    </section>}

    {host ? <div className="mt-6 flex flex-wrap justify-center gap-3"><button className="btn-primary" onClick={onLobby}><RotateCcw size={18} /> Continuar sesión</button><button className="btn-ghost" onClick={onEnd}><StopCircle size={18} /> Terminar sesión</button></div> : <p className="mt-6 text-center font-bold text-ink/65">Esperando al host…</p>}
  </ResultsShell>;
}
