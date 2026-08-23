import type { RoomView, ShinyVotePublicState } from '@pokemon-universe/shared';
import { RotateCcw, Sparkles, StopCircle, Trophy } from 'lucide-react';

export function ShinyVoteResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as ShinyVotePublicState;
  const host = room.hostId === selfId;
  return <section className="mx-auto max-w-2xl px-5 py-12"><div className="card">
    <div className="mb-7 text-center"><Sparkles className="mx-auto text-electric" fill="currentColor" size={50} /><span className="label mt-3">{game.totalRounds} rondas completadas</span><h1 className="font-display text-4xl font-bold">Clasificación shiny</h1></div>
    <div className="space-y-2">{game.results?.standings.map((standing) => { const member = room.members.find((item) => item.id === standing.playerId); return <div key={standing.playerId} className={`flex items-center gap-4 rounded-2xl border-2 p-3 ${standing.position === 1 ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised'}`}><span className="w-9 text-center font-display text-2xl font-bold">{standing.position === 1 ? <Trophy className="mx-auto text-night" /> : standing.position}</span><div className="flex-1"><strong className="font-display text-lg">{member?.displayName ?? 'Entrenador'}</strong><p className={`text-sm font-bold ${standing.position === 1 ? 'text-night/60' : 'text-ink/45'}`}>{standing.stats.correctVotes ?? 0} aciertos · {standing.stats.accuracy ?? 0}% de precisión</p></div><strong className={`text-xl ${standing.position === 1 ? 'text-night' : 'text-berry'}`}>{standing.points} pts</strong></div>; })}</div>
    {host ? <div className="mt-6 flex flex-wrap justify-center gap-3"><button className="btn-primary" onClick={onLobby}><RotateCcw size={18} /> Volver al lobby</button><button className="btn-ghost" onClick={onEnd}><StopCircle size={18} /> Terminar sesión</button></div> : <p className="mt-6 text-center font-bold text-ink/45">Esperando al host…</p>}
  </div></section>;
}
