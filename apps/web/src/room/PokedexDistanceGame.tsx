import type { Pokemon, PokedexDistancePlayerState, PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared';
import { AlertTriangle, Clock3, Crosshair, Eye, Target, Trophy, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { PlayerList } from './PlayerList';
import { PokemonSelector } from './PokemonSelector';

function useCountdown(deadline: number | null, serverOffset: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  return deadline ? Math.max(0, deadline - (now + serverOffset)) : 0;
}

export function PokedexDistanceGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokedexDistancePublicState;
  const playerState = room.gamePlayerState as PokedexDistancePlayerState | null;
  const generations = (room.selectedGameConfig as { generations: number[] }).generations;
  const [pokemon, setPokemon] = useState<Pokemon[]>([]);
  const serverOffset = useMemo(() => room.serverNow - Date.now(), [room.serverNow]);
  const remainingMs = useCountdown(game.roundEndsAt, serverOffset); const totalMs = (room.selectedGameConfig as { roundSeconds: number }).roundSeconds * 1_000;
  const resultsRemainingMs = useCountdown(game.nextTransitionAt, serverOffset);
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
    {activePhase && <div className="mb-5"><div className="mb-1.5 flex items-center justify-between text-sm font-extrabold"><span className="flex items-center gap-1.5"><Clock3 size={17} /> Tiempo del servidor</span><span className={remaining <= 5 ? 'timer-pulse text-xl' : ''}>{remaining}s</span></div><div className="h-3 overflow-hidden rounded-full border-2 border-ink/20 bg-night"><div className={`h-full transition-[width] duration-100 ${remaining <= 5 ? 'bg-berry' : 'bg-aqua'}`} style={{ width: `${progress}%` }} /></div></div>}
    {game.phase === 'ROUND_RESULTS' && game.lastRound && <div className="reveal-pop mb-6 rounded-[2rem] border-2 border-aqua/45 bg-surface p-4 shadow-card sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><span className="label">Resultado de la ronda</span><h2 className="font-display text-3xl font-bold">{game.lastRound.reason === 'TIE' ? '⚔️ Empate en la peor distancia' : game.lastRound.reason === 'NO_RESPONSE' ? '⏱️ Tiempo agotado' : '📏 Distancias calculadas'}</h2></div><span className="chip"><Clock3 size={16} /> {Math.max(1, Math.ceil(resultsRemainingMs / 1_000))}s</span></div>
      <div className="mb-5 grid items-center gap-4 rounded-3xl border-2 border-berry/25 bg-berry/10 p-4 sm:grid-cols-[140px_1fr]">
        <img src={game.lastRound.targetPokemon.sprite} alt={game.lastRound.targetPokemon.name} className="mx-auto h-32 w-32 object-contain [image-rendering:pixelated]" />
        <div className="text-center sm:text-left"><span className="label">Pokémon objetivo</span><h3 className="font-display text-3xl font-bold">{game.lastRound.targetPokemon.name}</h3><p className="mt-1 font-display text-2xl font-bold text-berry">#{String(game.lastRound.targetPokemon.nationalDexNumber).padStart(3, '0')}</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{game.lastRound.eligibleIds.map((playerId) => {
        const selection = game.lastRound!.selections[playerId]; const eliminated = game.lastRound!.eliminatedIds.includes(playerId); const tied = game.lastRound!.tiedIds.includes(playerId); const exact = selection?.distance === 0; const resultMember = room.members.find((item) => item.id === playerId); const displayName = resultMember?.displayName ?? playerId;
        return <article key={playerId} className={`rounded-2xl border-2 p-4 ${eliminated ? 'border-berry bg-berry/10' : tied ? 'border-electric bg-electric/10' : exact ? 'border-leaf bg-leaf/10' : 'border-ink/10 bg-surface-raised'}`}>
          <div className="mb-3 flex items-center gap-2"><Avatar name={displayName} avatar={resultMember?.avatar} size="sm" /><strong className="min-w-0 flex-1 truncate font-display text-xl">{displayName}</strong>{eliminated && <span className="chip bg-berry/15 text-berry"><UserX size={15} /> Eliminado</span>}{tied && <span className="chip bg-electric/20 text-electric"><AlertTriangle size={15} /> Empate</span>}</div>
          {selection ? <><div className="flex items-center gap-3"><img src={selection.sprite} alt={selection.pokemonName} className="h-20 w-20 object-contain [image-rendering:pixelated]" /><div><strong className="block font-display text-lg">{selection.pokemonName}</strong><span className="font-extrabold text-ink/55">#{String(selection.dexNumber).padStart(3, '0')}</span></div></div><div className="mt-3 rounded-xl bg-night/40 px-3 py-2 font-extrabold">Distancia: <span className={exact ? 'text-leaf' : 'text-aqua'}>{selection.distance}</span></div>{exact && <p className="mt-2 flex items-center gap-2 font-display font-bold text-leaf"><Crosshair size={18} /> EXACT HIT</p>}</> : <div className="grid min-h-28 place-items-center rounded-xl bg-night/30 text-center"><div><UserX className="mx-auto mb-2 text-berry" /><strong className="text-berry">Sin respuesta</strong></div></div>}
        </article>;
      })}</div>
      {game.lastRound.reason === 'TIE' && <p className="mt-4 rounded-2xl bg-electric/15 p-3 text-center font-extrabold text-electric">Solo los jugadores empatados jugarán la ronda de desempate.</p>}
    </div>}
    {game.phase !== 'ROUND_RESULTS' && <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <aside className="card !p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-bold">En la ronda</h2><span className="chip">{game.survivorIds.length} siguen</span></div><PlayerList members={room.members} game={game} selfId={selfId} /></aside>
      <div>{activePhase && eligible && !hasSelection ? <PokemonSelector pokemon={pokemon} locked={new Set(game.lockedPokemonIds)} disabled={false} onSelect={(pokemonId) => onAction({ type: 'SELECT_POKEMON', pokemonId })} /> : <div className={`card grid min-h-[280px] place-items-center text-center ${playerState?.exactHit ? '!border-leaf bg-leaf/10' : ''}`}><div>{member?.role === 'SPECTATOR' || !eligible ? <><Eye className="mx-auto text-aqua" size={48} /><h2 className="mt-4 font-display text-2xl font-bold">Estás observando</h2><p className="mt-2 font-bold text-ink/45">Sigue las selecciones en directo.</p></> : hasSelection && playerState?.exactHit ? <div className="reveal-pop"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full border-4 border-leaf bg-leaf/20 text-leaf shadow-[0_0_40px_rgba(77,210,140,.35)]"><Crosshair size={52} /></div><span className="label mt-5 text-leaf">Distancia 0</span><h2 className="mt-1 font-display text-4xl font-bold text-leaf">¡EXACT HIT!</h2><p className="mt-2 font-bold text-ink/60">Has elegido exactamente el Pokémon objetivo.</p><span className="chip mt-4 bg-leaf/15 text-leaf">Selección bloqueada ✓</span></div> : hasSelection ? <><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-leaf/20 text-4xl">✓</div><h2 className="mt-4 font-display text-2xl font-bold">¡Selección confirmada!</h2><p className="mt-2 font-bold text-ink/45">Ya está bloqueada en el servidor.</p></> : <><Clock3 className="mx-auto text-aqua" size={48} /><h2 className="mt-4 font-display text-2xl font-bold">Siguiente ronda en breve…</h2></>}</div></div>}</div>
    </div>}
  </section>;
}
