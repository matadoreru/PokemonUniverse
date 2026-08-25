import type { PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared';
import { RotateCcw, StopCircle } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ResultsShell } from './ResultsShell';

export function GameResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokedexDistancePublicState; const host = room.hostId === selfId;
  return <ResultsShell title={game.results?.winnerId ? 'Resultado de la partida' : 'Partida desierta'} subtitle={`Partida ${room.gamesPlayed} completada`}>
    <div className="space-y-2">{game.results?.standings.map((standing) => { const member = room.members.find((item) => item.id === standing.playerId); return <div key={standing.playerId} className={`flex items-center gap-4 rounded-2xl border p-3 ${standing.position === 1 ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised'}`}><span className="w-9 text-center font-display text-2xl font-bold">{standing.position === 1 ? '👑' : standing.position}</span><Avatar name={member?.displayName ?? 'Entrenador'} avatar={member?.avatar} size="md" /><div className="flex-1"><strong className="font-display text-lg">{member?.displayName ?? 'Entrenador'}</strong><p className={`text-sm font-bold ${standing.position === 1 ? 'text-night/60' : 'text-ink/65'}`}>{standing.stats.exactHits ?? 0} aciertos exactos · distancia media {standing.stats.averageDistance ?? 0}</p></div><strong className={`text-xl ${standing.position === 1 ? 'text-night' : 'text-berry'}`}>+{standing.points}</strong></div>; })}</div>
    {host ? <div className="mt-6 flex flex-wrap justify-center gap-3"><button className="btn-primary" onClick={onLobby}><RotateCcw size={18} /> Continuar sesión</button><button className="btn-ghost" onClick={onEnd}><StopCircle size={18} /> Terminar sesión</button></div> : <p className="mt-6 text-center font-bold text-ink/65">Esperando al host…</p>}
  </ResultsShell>;
}
