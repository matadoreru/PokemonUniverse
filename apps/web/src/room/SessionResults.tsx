import type { RoomView } from '@pokemon-universe/shared';
import { Crown, RotateCcw } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ResultsShell } from './ResultsShell';

export function SessionResults({ room, selfId, onLobby }: { room: RoomView; selfId: string; onLobby(): void }) {
  const ranking = [...room.members].sort((a, b) => b.sessionPoints - a.sessionPoints); const host = room.hostId === selfId;
  return <ResultsShell title="Campeón de la sesión" subtitle={`${room.gamesPlayed} partidas disputadas`}>
    <div className="mb-7 text-center"><Crown className="mx-auto fill-electric text-ink" size={64} /><p className="mt-2 font-display text-3xl font-bold">{ranking[0]?.displayName}</p><p className="font-extrabold text-berry">{ranking[0]?.sessionPoints ?? 0} puntos</p></div>
    <div className="space-y-2">{ranking.map((member, index) => <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-ink/5 px-4 py-3"><strong className="w-8 font-display text-xl">{index + 1}</strong><Avatar name={member.displayName} avatar={member.avatar} size="sm" /><span className="flex-1 font-extrabold">{member.displayName}</span><span className="font-extrabold text-berry">{member.sessionPoints} pts</span></div>)}</div>
    {host ? <button className="btn-primary mx-auto mt-7 flex" onClick={onLobby}><RotateCcw size={18} /> Nueva sesión</button> : <p className="mt-6 text-center font-bold text-ink/65">Esperando al host…</p>}
  </ResultsShell>;
}
