import type { PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared';
import { Crown, RotateCcw, StopCircle, Trophy } from 'lucide-react';

export function GameResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokedexDistancePublicState; const host = room.hostId === selfId;
  return <ResultsShell title={game.results?.winnerId ? 'Resultado de la partida' : 'Partida desierta'} subtitle={`Partida ${room.gamesPlayed} completada`}>
    <div className="space-y-2">{game.results?.standings.map((standing) => { const member = room.members.find((item) => item.id === standing.playerId); return <div key={standing.playerId} className={`flex items-center gap-4 rounded-2xl border-2 p-3 ${standing.position === 1 ? 'border-ink bg-electric' : 'border-ink/10 bg-white'}`}><span className="w-9 text-center font-display text-2xl font-bold">{standing.position === 1 ? '👑' : standing.position}</span><div className="flex-1"><strong className="font-display text-lg">{member?.displayName ?? 'Entrenador'}</strong><p className="text-sm font-bold text-ink/45">{standing.stats.exactHits ?? 0} aciertos exactos · distancia media {standing.stats.averageDistance ?? 0}</p></div><strong className="text-xl text-berry">+{standing.points}</strong></div>; })}</div>
    {host ? <div className="mt-6 flex flex-wrap justify-center gap-3"><button className="btn-primary" onClick={onLobby}><RotateCcw size={18} /> Volver al lobby</button><button className="btn-ghost" onClick={onEnd}><StopCircle size={18} /> Terminar sesión</button></div> : <p className="mt-6 text-center font-bold text-ink/45">Esperando al host…</p>}
  </ResultsShell>;
}

export function SessionResults({ room, selfId, onLobby }: { room: RoomView; selfId: string; onLobby(): void }) {
  const ranking = [...room.members].sort((a, b) => b.sessionPoints - a.sessionPoints); const host = room.hostId === selfId;
  return <ResultsShell title="Campeón de la sesión" subtitle={`${room.gamesPlayed} partidas disputadas`}>
    <div className="mb-7 text-center"><Crown className="mx-auto fill-electric text-ink" size={64} /><p className="mt-2 font-display text-3xl font-bold">{ranking[0]?.displayName}</p><p className="font-extrabold text-berry">{ranking[0]?.sessionPoints ?? 0} puntos</p></div>
    <div className="space-y-2">{ranking.map((member, index) => <div key={member.id} className="flex items-center rounded-2xl bg-ink/5 px-4 py-3"><strong className="w-10 font-display text-xl">{index + 1}</strong><span className="flex-1 font-extrabold">{member.displayName}</span><span className="font-extrabold text-berry">{member.sessionPoints} pts</span></div>)}</div>
    {host ? <button className="btn-primary mx-auto mt-7 flex" onClick={onLobby}><RotateCcw size={18} /> Nueva sesión</button> : <p className="mt-6 text-center font-bold text-ink/45">Esperando al host…</p>}
  </ResultsShell>;
}

function ResultsShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="mx-auto max-w-2xl px-5 py-12"><div className="card"><div className="mb-7 text-center"><Trophy className="mx-auto text-berry" size={48} /><span className="label mt-3">{subtitle}</span><h1 className="font-display text-4xl font-bold">{title}</h1></div>{children}</div></section>;
}
