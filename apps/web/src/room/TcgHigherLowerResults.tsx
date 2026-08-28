import type { RoomView, TcgHigherLowerPublicState } from '@pokemon-universe/shared';
import { RotateCcw, StopCircle } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ResultsShell } from './ResultsShell';

export function TcgHigherLowerResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as TcgHigherLowerPublicState; const host = room.hostId === selfId;
  return <ResultsShell title="Resultado" subtitle="Higher or Lower: Cartas"><div className="space-y-2">{game.results?.standings.map((entry) => { const member = room.members.find(({ id }) => id === entry.playerId); return <div key={entry.playerId} className="flex items-center gap-3 rounded-2xl bg-surface-raised p-3"><strong className="w-6 font-display text-lg">{entry.position}</strong><Avatar name={member?.displayName ?? entry.playerId} avatar={member?.avatar} size="md" /><div className="min-w-0 flex-1"><strong className="block truncate">{member?.displayName ?? entry.playerId}</strong><p className="text-sm font-bold text-ink/60">Mejor racha: {entry.stats.bestStreak} · {entry.stats.correct}/{entry.stats.comparisons} aciertos · {entry.stats.accuracy}%</p></div><strong className="text-berry">{entry.points} pts</strong></div>; })}</div>{host ? <div className="mt-6 flex flex-wrap justify-center gap-3"><button className="btn-primary" onClick={onLobby}><RotateCcw /> Continuar sesión</button><button className="btn-ghost" onClick={onEnd}><StopCircle /> Terminar</button></div> : <p className="mt-6 text-center">Esperando al host…</p>}</ResultsShell>;
}

