import type { Pokemon, PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared';
import { Clock3, Eye, Target, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { PlayerList } from './PlayerList';
import { PokemonSelector } from './PokemonSelector';

function useCountdown(deadline: number | null, serverOffset: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  return deadline ? Math.max(0, deadline - (now + serverOffset)) : 0;
}

export function PokedexDistanceGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokedexDistancePublicState;
  const generations = (room.selectedGameConfig as { generations: number[] }).generations;
  const [pokemon, setPokemon] = useState<Pokemon[]>([]);
  const serverOffset = useMemo(() => room.serverNow - Date.now(), [room.serverNow]);
  const remainingMs = useCountdown(game.roundEndsAt, serverOffset); const totalMs = (room.selectedGameConfig as { roundSeconds: number }).roundSeconds * 1_000;
  const remaining = Math.ceil(remainingMs / 1_000); const progress = Math.min(100, remainingMs / totalMs * 100);
  const member = room.members.find((item) => item.id === selfId);
  const activePhase = game.phase === 'ROUND_ACTIVE' || game.phase === 'TIEBREAKER_ACTIVE';
  const eligible = game.eligibleIds.includes(selfId); const hasSelection = Boolean(game.selections[selfId]);
  useEffect(() => { void api<{ pokemon: Pokemon[] }>(`/pokemon?generations=${generations.join(',')}`).then((body) => setPokemon(body.pokemon)); }, [generations.join(',')]);
  return <section className="mx-auto max-w-7xl px-4 py-5 md:px-8">
    <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="flex gap-2"><span className="chip">Ronda {game.roundNumber}</span>{game.tiebreakDepth > 0 && <span className="chip bg-berry/15 text-berry">Desempate {game.tiebreakDepth}</span>}</div>
      <div className="text-center"><span className="label">Objetivo</span><div className="font-display text-5xl font-bold sm:text-6xl"><Target className="mr-2 inline text-berry" size={38} />#{String(game.targetDexNumber ?? 0).padStart(3, '0')}</div></div>
      <div className="flex items-center justify-end gap-2"><Trophy size={18} className="text-berry" /><span className="font-extrabold">{member?.sessionPoints ?? 0} pts</span></div>
    </div>
    {activePhase && <div className="mb-5"><div className="mb-1.5 flex items-center justify-between text-sm font-extrabold"><span className="flex items-center gap-1.5"><Clock3 size={17} /> Tiempo del servidor</span><span className={remaining <= 5 ? 'timer-pulse text-xl' : ''}>{remaining}s</span></div><div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-white"><div className={`h-full transition-[width] duration-100 ${remaining <= 5 ? 'bg-berry' : 'bg-aqua'}`} style={{ width: `${progress}%` }} /></div></div>}
    {game.phase === 'ROUND_RESULTS' && <div className={`mb-5 rounded-2xl border-2 border-ink p-4 text-center ${game.lastRound?.reason === 'TIE' ? 'bg-electric' : 'bg-aqua/30'}`}><strong className="font-display text-2xl">{game.lastRound?.reason === 'TIE' ? '⚔️ ¡Empate! Se prepara el desempate' : game.lastRound?.reason === 'NO_RESPONSE' ? '⏱️ Eliminados por no responder' : '📏 Resultado de la ronda'}</strong>{game.lastRound?.eliminatedIds.length ? <p className="mt-1 font-bold">{game.lastRound.eliminatedIds.map((id) => room.members.find((member) => member.id === id)?.displayName ?? id).join(', ')}</p> : null}</div>}
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <aside className="card !p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-bold">En la ronda</h2><span className="chip">{game.survivorIds.length} siguen</span></div><PlayerList room={room} selfId={selfId} /></aside>
      <div>{activePhase && eligible && !hasSelection ? <PokemonSelector pokemon={pokemon} locked={new Set(game.lockedPokemonIds)} disabled={false} onSelect={(pokemonId) => onAction({ type: 'SELECT_POKEMON', pokemonId })} /> : <div className="card grid min-h-[280px] place-items-center text-center"><div>{member?.role === 'SPECTATOR' || !eligible ? <><Eye className="mx-auto text-aqua" size={48} /><h2 className="mt-4 font-display text-2xl font-bold">Estás observando</h2><p className="mt-2 font-bold text-ink/45">Sigue las selecciones en directo.</p></> : hasSelection ? <><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-leaf/20 text-4xl">✓</div><h2 className="mt-4 font-display text-2xl font-bold">¡Selección confirmada!</h2><p className="mt-2 font-bold text-ink/45">Ya está bloqueada en el servidor.</p></> : <><Clock3 className="mx-auto text-aqua" size={48} /><h2 className="mt-4 font-display text-2xl font-bold">Siguiente ronda en breve…</h2></>}</div></div>}</div>
    </div>
  </section>;
}
