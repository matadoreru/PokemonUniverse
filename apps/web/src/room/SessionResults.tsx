import type { RoomView } from '@pokemon-universe/shared';
import { Crown, History, RotateCcw } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ResultsShell } from './ResultsShell';

export function SessionResults({ room, selfId, onLobby }: { room: RoomView; selfId: string; onLobby(): void }) {
  const ranking = [...room.sessionStandings].sort((a, b) => b.sessionPoints - a.sessionPoints || a.displayName.localeCompare(b.displayName)); const host = room.hostId === selfId;
  const winningPoints = ranking[0]?.sessionPoints ?? 0;
  const champions = ranking.filter((standing) => standing.sessionPoints === winningPoints);
  const tied = champions.length > 1;
  const gameNames = new Map(room.availableGames.map((game) => [game.id, game.name]));
  return <ResultsShell title={tied ? 'Campeones de la sesión' : 'Campeón de la sesión'} subtitle={`${room.gamesPlayed} partida${room.gamesPlayed === 1 ? '' : 's'} disputada${room.gamesPlayed === 1 ? '' : 's'}`}>
    <div className="mb-7 text-center"><Crown className="mx-auto fill-electric text-ink" size={64} /><p className="mx-auto mt-2 max-w-xl text-pretty font-display text-3xl font-bold">{champions.map((standing) => standing.displayName).join(' y ') || 'Sin ganador'}</p><p className="font-extrabold text-berry">{winningPoints} puntos</p></div>
    <div className="space-y-2">{ranking.map((member, index) => <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-ink/5 px-4 py-3"><strong className="w-8 font-display text-xl">{index + 1}</strong><Avatar name={member.displayName} avatar={member.avatar} size="sm" /><span className="flex-1 font-extrabold">{member.displayName}</span><span className="font-extrabold text-berry">{member.sessionPoints} pts</span></div>)}</div>
    {room.sessionHistory.length > 0 && <section className="mt-7" aria-labelledby="session-history-title">
      <h2 id="session-history-title" className="mb-3 flex items-center gap-2 font-display text-xl font-bold"><History size={20} className="text-aqua" /> Evolución de puntos</h2>
      <div className="overflow-x-auto rounded-xl border border-ink/10">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <thead><tr className="bg-ink/[.04] text-left"><th className="px-3 py-2.5 font-extrabold">Entrenador</th>{room.sessionHistory.map((game) => <th key={`${game.gameId}-${game.gameNumber}`} className="px-3 py-2.5 text-center font-extrabold" title={gameNames.get(game.gameId) ?? game.gameId}>P{game.gameNumber}</th>)}<th className="px-3 py-2.5 text-right font-extrabold">Total</th></tr></thead>
          <tbody>{ranking.map((member) => <tr key={member.id} className="border-t border-ink/10"><th scope="row" className="max-w-48 px-3 py-2.5 text-left font-bold"><span className="block truncate">{member.displayName}</span></th>{room.sessionHistory.map((game) => { const points = game.points[member.id] ?? 0; const won = game.winnerIds.includes(member.id); return <td key={`${game.gameId}-${game.gameNumber}`} className={`px-3 py-2.5 text-center font-extrabold ${won ? 'text-leaf' : 'text-ink/65'}`} aria-label={`${points} puntos en la partida ${game.gameNumber}${won ? ', ganador' : ''}`}>{won && <Crown className="mr-1 inline-block fill-electric text-ink" size={13} aria-hidden="true" />}+{points}</td>; })}<td className="px-3 py-2.5 text-right font-black text-berry">{member.sessionPoints}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs font-bold text-ink/55">P1, P2… representan cada partida. En sesiones largas se muestran las 100 más recientes.</p>
    </section>}
    {host ? <button className="btn-primary mx-auto mt-7 flex" onClick={onLobby}><RotateCcw size={18} /> Nueva sesión</button> : <p className="mt-6 text-center font-bold text-ink/65">Esperando al host…</p>}
  </ResultsShell>;
}
