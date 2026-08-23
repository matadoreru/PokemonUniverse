import type { PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared';
import { Crown, Eye, WifiOff, X } from 'lucide-react';

export function PlayerList({ room, selfId, canKick, onKick }: { room: RoomView; selfId: string; canKick?: boolean; onKick?: (id: string) => void }) {
  const game = (room.game as { gameId?: string } | null)?.gameId === 'pokedex-distance' ? room.game as PokedexDistancePublicState : null;
  return <div className="space-y-2">
    {room.members.map((member) => {
      const selection = game?.selections[member.id];
      return <div key={member.id} className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 p-2.5 ${member.role === 'SPECTATOR' ? 'border-ink/5 bg-ink/[.03] opacity-65' : 'border-ink/10 bg-surface-raised'}`}>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-aqua/70 to-electric/80 font-display font-bold text-night">{member.displayName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 font-extrabold"><span className="truncate">{member.displayName}</span>{member.id === selfId && <span className="text-xs text-ink/35">(tú)</span>}{member.isHost && <Crown size={15} className="fill-electric text-ink" />}{!member.connected && <WifiOff size={14} className="text-berry" />}</div>
          {selection ? <p className="truncate text-sm font-bold text-ink/55">→ {selection.pokemonName} <span className="text-ink/35">#{String(selection.dexNumber).padStart(3, '0')}</span>{selection.distance === 0 && <span className="ml-1 text-berry">🎯</span>}</p> : game && member.role === 'PLAYER' ? <p className="text-sm font-bold text-ink/35">seleccionando…</p> : <p className="text-sm font-bold text-ink/40">{member.role === 'SPECTATOR' ? 'Espectador' : `${member.sessionPoints} pts`}</p>}
        </div>
        {selection && <img className="h-12 w-12 object-contain [image-rendering:auto]" src={selection.sprite} alt="" />}
        {member.role === 'SPECTATOR' && <Eye size={17} />}
        {canKick && !member.isHost && <button aria-label={`Expulsar a ${member.displayName}`} className="rounded-lg p-1 text-ink/30 hover:bg-berry/10 hover:text-berry" onClick={() => onKick?.(member.id)}><X size={18} /></button>}
      </div>;
    })}
  </div>;
}
