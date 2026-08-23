import type { PokemonImpostorPlayerState, PokemonImpostorPublicState, RoomView } from '@pokemon-universe/shared';
import { RotateCcw, ShieldCheck, Skull, StopCircle } from 'lucide-react';
import { Avatar } from '../components/Avatar';

export function PokemonImpostorResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokemonImpostorPublicState;
  const player = room.gamePlayerState as PokemonImpostorPlayerState;
  const host = room.hostId === selfId;
  const impostorsWon = game.winnerTeam === 'IMPOSTORS';
  return <section className="mx-auto max-w-2xl px-5 py-12"><div className="card">
    <div className="text-center">{impostorsWon ? <Skull className="mx-auto text-berry" size={58} /> : <ShieldCheck className="mx-auto text-aqua" size={58} />}<span className="label mt-3">Partida terminada</span><h1 className="font-display text-4xl">Ganan {impostorsWon ? 'los impostores' : 'los inocentes'}</h1>{player.secretPokemon && <div className="mx-auto mt-5 inline-flex items-center gap-3 rounded-2xl bg-surface-raised px-5 py-3"><img className="h-20 w-20 object-contain" src={player.secretPokemon.sprite} alt="" /><div className="text-left"><span className="label !mb-0">Pokémon secreto</span><strong className="font-display text-2xl">{player.secretPokemon.name}</strong></div></div>}</div>
    <div className="mt-7 space-y-2">{game.playerIds.map((id) => { const member = room.members.find((entry) => entry.id === id); const role = player.revealedRoles?.[id]; return <div key={id} className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${role === 'IMPOSTOR' ? 'border-berry/35 bg-berry/10' : 'border-aqua/25 bg-aqua/5'}`}><Avatar name={member?.displayName ?? id} avatar={member?.avatar} size="md" /><strong className="min-w-0 flex-1 truncate font-display text-lg">{member?.displayName ?? id}</strong><span className={`font-extrabold ${role === 'IMPOSTOR' ? 'text-berry' : 'text-aqua'}`}>{role === 'IMPOSTOR' ? 'IMPOSTOR' : 'INOCENTE'}</span></div>; })}</div>
    {host ? <div className="mt-6 flex flex-wrap justify-center gap-3"><button className="btn-primary" onClick={onLobby}><RotateCcw size={18} /> Volver al lobby</button><button className="btn-ghost" onClick={onEnd}><StopCircle size={18} /> Terminar sesión</button></div> : <p className="mt-6 text-center font-bold text-ink/45">Esperando al host…</p>}
  </div></section>;
}
