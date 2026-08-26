import type { ConnectionAnswerGroup, ConnectionPlayerStatus, PokemonConnectionsPlayerState, PokemonConnectionsPublicState, RoomMemberView, RoomView } from '@pokemon-universe/shared';
import { Check, CheckCircle2, Eye, Lightbulb, LockKeyhole, Puzzle, ShieldX, Sparkles, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { ServerTimer } from '../components/ServerTimer';
import { useServerOffset } from '../hooks/useServerTime';

function member(room: RoomView, id: string): RoomMemberView | undefined {
  return room.members.find((candidate) => candidate.id === id);
}

function statusLabel(status: ConnectionPlayerStatus): string {
  if (status === 'SOLVED') return 'Completado';
  if (status === 'ELIMINATED') return 'Sin intentos';
  if (status === 'TIMED_OUT') return 'Sin tiempo';
  return 'Resolviendo';
}

function statusTone(status: ConnectionPlayerStatus): string {
  if (status === 'SOLVED') return 'text-leaf';
  if (status === 'ELIMINATED' || status === 'TIMED_OUT') return 'text-berry';
  return 'text-aqua';
}

function FoundGroup({ group }: { group: ConnectionAnswerGroup }) {
  return <article className="overflow-hidden rounded-xl bg-leaf/[.08] reveal-pop"><header className="px-3 pt-3 text-center"><strong className="font-display text-lg text-leaf">{group.label}</strong><p className="text-xs font-bold text-ink/60">{group.explanation}</p></header><div className="grid grid-cols-3 gap-1 p-2 sm:grid-cols-4 lg:grid-cols-5">{group.pokemon.map((pokemon) => <div key={pokemon.id} className="min-w-0 text-center"><img src={pokemon.sprite} alt="" className="mx-auto h-12 w-12 object-contain [image-rendering:pixelated]" /><span className="block truncate text-xs font-extrabold">{pokemon.name}</span></div>)}</div></article>;
}

function ProgressPanel({ room, game }: { room: RoomView; game: PokemonConnectionsPublicState }) {
  return <section className="rounded-2xl border border-ink/10 bg-surface p-4 shadow-card" aria-labelledby="connections-progress"><h2 id="connections-progress" className="mb-3 font-display text-xl">Progreso del grupo</h2><div className="space-y-2">{Object.entries(game.playerProgress).map(([id, progress]) => { const person = member(room, id); return <div key={id} className="flex min-h-12 items-center gap-2 rounded-xl bg-surface-raised px-3 py-2"><Avatar name={person?.displayName ?? id} avatar={person?.avatar} presence={person?.presence} size="sm" /><span className="min-w-0 flex-1"><strong className="block truncate">{person?.displayName ?? id}</strong><small className={`font-extrabold ${statusTone(progress.status)}`}>{statusLabel(progress.status)}</small></span><strong className="text-sm">{progress.foundGroups}/{game.groupCount}</strong></div>; })}</div></section>;
}

function RoundReveal({ room, game, serverOffset }: { room: RoomView; game: PokemonConnectionsPublicState; serverOffset: number }) {
  const result = game.lastRound!;
  const ordered = Object.entries(result.players).sort(([, left], [, right]) => (left.completionRank ?? Infinity) - (right.completionRank ?? Infinity) || right.pointsAwarded - left.pointsAwarded);
  return <section className="mx-auto max-w-7xl px-3 py-5 sm:px-5"><div className="overflow-hidden rounded-2xl border border-leaf/25 bg-surface shadow-card reveal-pop"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 p-4 sm:p-6"><div><span className="label !mb-0">Puzle {game.roundNumber} · Solución {result.source === 'CURATED' ? 'curada' : 'generada'}</span><h1 className="font-display text-3xl text-leaf sm:text-4xl">Estas eran las conexiones</h1></div><ServerTimer deadline={game.nextTransitionAt} serverOffset={serverOffset} label="Siguiente puzle" /></header><div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_22rem]"><main className="grid content-start gap-3 md:grid-cols-2">{result.groups.map((group) => <FoundGroup key={group.id} group={group} />)}</main><aside><h2 className="mb-3 font-display text-xl">Clasificación de la ronda</h2><div className="space-y-2">{ordered.map(([id, progress]) => { const person = member(room, id); return <article key={id} className="flex items-center gap-2 rounded-xl bg-surface-raised p-3"><strong className="w-7 text-center text-lg">{progress.completionRank && progress.completionRank <= 3 ? ['🥇', '🥈', '🥉'][progress.completionRank - 1] : '—'}</strong><Avatar name={person?.displayName ?? id} avatar={person?.avatar} size="sm" /><span className="min-w-0 flex-1"><strong className="block truncate">{person?.displayName ?? id}</strong><small className={`font-bold ${statusTone(progress.status)}`}>{progress.foundGroups}/{game.groupCount} grupos{progress.elapsedMs !== null ? ` · ${(progress.elapsedMs / 1_000).toFixed(1)}s` : ''}</small></span><strong className="text-leaf">+{progress.pointsAwarded}</strong></article>; })}</div></aside></div></div></section>;
}

export function PokemonConnectionsGame({ room, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokemonConnectionsPublicState;
  const player = room.gamePlayerState as PokemonConnectionsPlayerState;
  const serverOffset = useServerOffset(room.serverNow);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setSelected([]); setSubmitting(false); }, [game.roundNumber]);
  const foundIds = useMemo(() => new Set(player.role === 'PLAYER' ? player.foundGroups.flatMap((group) => group.pokemon.map((pokemon) => pokemon.id)) : []), [player]);
  useEffect(() => { setSelected((current) => current.filter((id) => !foundIds.has(id))); }, [foundIds]);
  if (game.phase === 'ROUND_RESULTS' && game.lastRound) return <RoundReveal room={room} game={game} serverOffset={serverOffset} />;
  const canSubmit = player.role === 'PLAYER' && player.canSubmit && !submitting;
  function toggle(id: string) {
    if (!canSubmit || foundIds.has(id)) return;
    setSelected((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : current.length < game.groupSize ? [...current, id] : current);
  }
  async function submit() {
    if (!canSubmit || selected.length !== game.groupSize) return;
    setSubmitting(true);
    try { await onAction({ type: 'SUBMIT_GROUP', pokemonIds: selected }); setSelected([]); } finally { setSubmitting(false); }
  }
  const feedback = player.role === 'PLAYER' ? player.lastAttempt : null;
  return <section className="mx-auto max-w-[96rem] overflow-x-clip px-3 py-4 sm:px-5"><header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-surface px-4 py-3 shadow-card"><div><span className="label !mb-0">Puzle {game.roundNumber} de {game.totalRounds} · {game.groupCount} grupos de {game.groupSize}</span><h1 className="flex items-center gap-2 font-display text-2xl sm:text-3xl"><Puzzle className="text-aqua" /> Pokémon Connections</h1></div><ServerTimer deadline={game.roundEndsAt} serverOffset={serverOffset} /></header>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"><main className="min-w-0 space-y-4"><section className="rounded-2xl border border-ink/10 bg-surface p-3 shadow-card sm:p-5" aria-labelledby="connections-board"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 id="connections-board" className="font-display text-xl sm:text-2xl">Encuentra la conexión</h2><p className="text-sm font-bold text-ink/60">Selecciona exactamente {game.groupSize} Pokémon que compartan una relación.</p></div>{player.role === 'PLAYER' && <span className="chip"><ShieldX size={15} /> {Math.max(0, player.mistakesAllowed - player.mistakesUsed)} errores disponibles</span>}</div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 7.25rem), 1fr))' }}>{game.board.map((pokemon) => { const active = selected.includes(pokemon.id); const found = foundIds.has(pokemon.id); return <button type="button" key={pokemon.id} aria-pressed={active} disabled={!canSubmit || found} onClick={() => toggle(pokemon.id)} className={`relative min-h-28 min-w-0 rounded-xl border p-2 text-center transition-[background-color,border-color,transform,opacity] duration-200 active:scale-[.98] ${found ? 'border-leaf/20 bg-leaf/[.07] opacity-35' : active ? 'border-electric bg-electric/15 ring-2 ring-electric/30' : canSubmit ? 'border-ink/10 bg-surface-raised hover:border-aqua/55 hover:bg-aqua/[.06]' : 'border-ink/10 bg-surface-raised opacity-60'}`}><img src={pokemon.sprite} alt="" className="mx-auto h-16 w-16 object-contain [image-rendering:pixelated]" /><strong className="block truncate text-sm">{pokemon.name}</strong>{active && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-electric text-night"><Check size={15} strokeWidth={3} /></span>}{found && <LockKeyhole className="absolute right-2 top-2 text-leaf" size={17} />}</button>; })}</div>
      {player.role === 'PLAYER' ? <div className="connections-submit mt-4 flex flex-wrap items-center justify-between gap-3"><div aria-live="polite" className="min-h-6">{feedback?.kind === 'INCORRECT' ? <p className={`flex items-center gap-2 font-extrabold ${feedback.nearMiss ? 'text-electric' : 'text-berry'}`}>{feedback.nearMiss ? <Lightbulb size={19} /> : <X size={19} />}{feedback.nearMiss ? 'Te falta uno' : 'Ese grupo no conecta'}</p> : feedback?.kind === 'CORRECT' ? <p className="flex items-center gap-2 font-extrabold text-leaf"><CheckCircle2 size={19} /> Grupo encontrado</p> : null}</div><button type="button" className="btn-primary min-w-44" disabled={!canSubmit || selected.length !== game.groupSize} onClick={() => void submit()}>{submitting ? 'Comprobando…' : `Comprobar ${selected.length}/${game.groupSize}`}</button></div> : <div className="mt-4 rounded-xl bg-ink/[.04] p-4 text-center"><Eye className="mx-auto text-aqua" /><strong className="mt-1 block">Estás observando</strong><p className="text-sm font-bold text-ink/60">El progreso se sincroniza, pero las soluciones de cada persona son privadas.</p></div>}</section>
      {player.role === 'PLAYER' && player.foundGroups.length > 0 && <section aria-labelledby="my-connections"><div className="mb-2 flex items-center gap-2"><Sparkles className="text-leaf" /><h2 id="my-connections" className="font-display text-xl">Tus conexiones</h2></div><div className="grid gap-3 md:grid-cols-2">{player.foundGroups.map((group) => <FoundGroup key={group.id} group={group} />)}</div></section>}
      {player.role === 'PLAYER' && player.status !== 'PLAYING' && <section className={`rounded-2xl p-5 text-center ${player.status === 'SOLVED' ? 'bg-leaf/[.08]' : 'bg-berry/[.07]'}`}>{player.status === 'SOLVED' ? <Trophy className="mx-auto text-electric" size={38} /> : <ShieldX className="mx-auto text-berry" size={38} />}<h2 className="mt-2 font-display text-2xl">{player.status === 'SOLVED' ? `Tablero completado · ${player.completionRank}.º` : 'Ya no quedan intentos'}</h2><p className="font-bold text-ink/65">Has conseguido {player.roundPoints} puntos. Esperando al resto del grupo.</p></section>}
    </main><aside className="xl:sticky xl:top-4"><ProgressPanel room={room} game={game} /></aside></div></section>;
}
