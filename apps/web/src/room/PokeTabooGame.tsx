import type { PokeTabooPlayerState, PokeTabooPublicState, PokeTabooSecretPokemon, Pokemon, RoomMemberView, RoomView } from '@pokemon-universe/shared';
import { CheckCircle2, Eye, History, MessageCircle, Mic2, Search, Send, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { PokemonTypeBadge } from '../components/PokemonTypeBadge';
import { ServerTimer } from '../components/ServerTimer';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { PokemonSelector } from './PokemonSelector';

const EMPTY_LOCKED = new Set<string>();

function memberFor(room: RoomView, id: string | null): RoomMemberView | undefined {
  return id ? room.members.find((member) => member.id === id) : undefined;
}

function DescriptorBanner({ room, game }: { room: RoomView; game: PokeTabooPublicState }) {
  const descriptor = memberFor(room, game.descriptorId); const next = memberFor(room, game.nextDescriptorId);
  return <div className="flex min-w-0 flex-wrap items-center gap-3">
    {descriptor && <Avatar name={descriptor.displayName} avatar={descriptor.avatar} presence={descriptor.presence} size="md" />}
    <div className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-black text-berry"><Mic2 size={15} /> DESCRIBIENDO</span><strong className="block truncate font-display text-xl sm:text-2xl">{descriptor?.displayName ?? 'Preparando turno…'}</strong>{next && <span className="block truncate text-sm font-bold text-ink/60">Siguiente: {next.displayName}</span>}</div>
  </div>;
}

function SecretPanel({ pokemon }: { pokemon: PokeTabooSecretPokemon }) {
  const evolution = pokemon.evolutionStageCount === null || pokemon.evolutionStage === null ? 'Sin datos de evolución'
    : pokemon.evolutionStageCount <= 1 ? 'No evoluciona'
      : `Etapa ${pokemon.evolutionStage} de ${pokemon.evolutionStageCount}`;
  const stats = [['PS', pokemon.hp], ['Ataque', pokemon.attack], ['Defensa', pokemon.defense], ['At. Esp.', pokemon.specialAttack], ['Def. Esp.', pokemon.specialDefense], ['Velocidad', pokemon.speed]] as const;
  return <section aria-labelledby="secret-heading">
    <div className="mb-3"><span className="text-xs font-black text-berry">SOLO TÚ PUEDES VER ESTO</span><h2 id="secret-heading" className="font-display text-2xl">Tu Pokémon</h2></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(14rem,19rem)_1fr] lg:items-center">
      <div className="grid min-h-64 place-items-center rounded-xl bg-aqua/[.08] p-3"><img src={pokemon.sprite} alt={pokemon.name} className="h-52 w-52 object-contain [image-rendering:pixelated]" /></div>
      <div className="min-w-0"><h3 className="break-words font-display text-3xl text-aqua sm:text-4xl">{pokemon.name}</h3><div className="mt-2 flex flex-wrap gap-2">{pokemon.types.map((type) => <PokemonTypeBadge key={type} type={type} />)}</div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-ink/65"><span>Generación {pokemon.generation}</span><span>{evolution}</span>{pokemon.heightDecimeters !== null && <span>{(pokemon.heightDecimeters / 10).toFixed(1)} m</span>}{pokemon.weightHectograms !== null && <span>{(pokemon.weightHectograms / 10).toFixed(1)} kg</span>}</div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">{stats.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-2 border-b border-ink/10 py-1.5"><span className="text-sm font-bold text-ink/60">{label}</span><strong className="tabular-nums">{value}</strong></div>)}</div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-electric/[.09] px-3 py-2"><span className="font-bold text-ink/65">Total de stats</span><strong className="font-display text-xl text-electric">{pokemon.baseStatTotal}</strong></div>
        {pokemon.abilities.length > 0 && <p className="mt-3 text-sm font-bold text-ink/65"><span className="text-ink">Habilidades:</span> {pokemon.abilities.join(', ')}</p>}
      </div>
    </div>
    <p className="mt-4 rounded-xl border border-berry/20 bg-berry/[.07] px-3 py-2.5 text-sm font-extrabold text-berry">No puedes decir ni escribir el nombre del Pokémon. Descríbelo por voz externa o utiliza las pistas de texto.</p>
  </section>;
}

function HintComposer({ enabled, onAction }: { enabled: boolean; onAction(action: unknown): Promise<void> }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try { await onAction({ type: 'SEND_HINT', text }); setText(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo enviar la pista.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} aria-labelledby="hint-composer-heading"><div className="mb-2 flex items-end justify-between gap-3"><div><span className="text-xs font-black text-aqua">FALLBACK DE TEXTO</span><h2 id="hint-composer-heading" className="font-display text-xl">Escribe una pista</h2></div><span className="text-xs font-bold tabular-nums text-ink/55">{text.length}/180</span></div><div className="flex items-stretch gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Pista para los adivinadores</span><input className="field min-h-12" value={text} maxLength={180} disabled={!enabled || busy} onChange={(event) => { setText(event.target.value); setError(''); }} placeholder="Ej.: Camina sobre dos patas…" /></label><button type="submit" className="btn-primary shrink-0 px-3 sm:px-4" disabled={!enabled || busy || !text.trim()} aria-label="Enviar pista"><Send size={19} /><span className="hidden sm:inline">Enviar pista</span></button></div>{error && <p className="status-error mt-2" role="alert">{error}</p>}</form>;
}

function HintList({ game, descriptorName }: { game: PokeTabooPublicState; descriptorName: string }) {
  return <section aria-labelledby="taboo-hints-heading"><h2 id="taboo-hints-heading" className="mb-3 flex items-center gap-2 font-display text-xl"><MessageCircle className="text-aqua" size={20} /> Pistas de {descriptorName}</h2>{game.hints.length ? <div className="space-y-2" aria-live="polite">{game.hints.map((hint) => <p key={hint.id} className="rounded-xl bg-aqua/[.07] px-3 py-2.5 font-bold">“{hint.text}”</p>)}</div> : <div className="rounded-xl border border-dashed border-ink/15 p-5 text-center"><strong className="block">La descripción se escucha fuera del juego</strong><span className="text-sm font-bold text-ink/60">Si {descriptorName} necesita texto, sus pistas aparecerán aquí.</span></div>}</section>;
}

function GuessPanel({ pokemon, player, game, serverOffset, loadError, onAction }: { pokemon: Pokemon[]; player: Extract<PokeTabooPlayerState, { role: 'GUESSER' }>; game: PokeTabooPublicState; serverOffset: number; loadError: string; onAction(action: unknown): Promise<void> }) {
  const cooldownMs = useRemainingMs(player.cooldownUntil, serverOffset);
  if (!player.canGuess) return <div className="grid min-h-28 place-items-center rounded-xl bg-ink/[.04] font-bold text-ink/65">Esperando al siguiente turno…</div>;
  return <section aria-labelledby="taboo-answer-heading"><div className="mb-2 flex items-end justify-between gap-2"><div><span className="text-xs font-black text-aqua">TU RESPUESTA</span><h2 id="taboo-answer-heading" className="flex items-center gap-2 font-display text-xl"><Search size={19} /> Buscar Pokémon</h2></div><span className="text-xs font-bold text-ink/60">{player.attemptCount} intento{player.attemptCount === 1 ? '' : 's'}</span></div>{cooldownMs > 0 && <p className="mb-2 flex items-center gap-2 rounded-xl bg-berry/[.08] px-3 py-2 text-sm font-extrabold text-berry" role="status"><XCircle size={17} /> Incorrecto · nuevo intento en {(cooldownMs / 1_000).toFixed(1)}s</p>}{loadError ? <p className="status-error" role="alert">{loadError}</p> : <PokemonSelector key={game.roundNumber} pokemon={pokemon} locked={EMPTY_LOCKED} disabled={false} confirmationDisabled={cooldownMs > 0} variant="embedded" autoFocus={false} inputLabel={`Buscar respuesta para la ronda ${game.roundNumber}`} onSelect={(pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId })} />}</section>;
}

function AttemptsPanel({ room, game }: { room: RoomView; game: PokeTabooPublicState }) {
  return <section className="rounded-xl border border-ink/10 bg-surface p-4" aria-labelledby="taboo-attempts-heading"><h2 id="taboo-attempts-heading" className="mb-3 flex items-center gap-2 font-display text-xl"><History className="text-berry" size={20} /> Intentos</h2>{game.attempts.length ? <div className="max-h-80 space-y-1.5 overflow-y-auto overscroll-contain" aria-live="polite">{game.attempts.slice().reverse().map((attempt, index) => { const member = memberFor(room, attempt.playerId); return <div key={`${attempt.playerId}-${attempt.attemptedAt}-${index}`} className="flex items-center gap-2 rounded-xl bg-berry/[.06] p-2"><Avatar name={member?.displayName ?? attempt.playerId} avatar={member?.avatar} size="xs" /><span className="min-w-0 flex-1 truncate text-sm"><strong>{member?.displayName ?? attempt.playerId}</strong><span className="text-ink/55"> → </span>{attempt.guessedPokemon.name}</span><img src={attempt.guessedPokemon.sprite} alt="" className="h-8 w-8 object-contain [image-rendering:pixelated]" /><XCircle className="shrink-0 text-berry" size={16} /></div>; })}</div> : <p className="rounded-xl border border-dashed border-ink/15 p-5 text-center text-sm font-bold text-ink/60">Aún no hay respuestas incorrectas.</p>}</section>;
}

function TurnOrder({ room, game }: { room: RoomView; game: PokeTabooPublicState }) {
  return <section className="rounded-xl border border-ink/10 bg-surface p-4" aria-labelledby="taboo-order-heading"><h2 id="taboo-order-heading" className="mb-3 font-display text-xl">Orden de descriptores</h2><div className="space-y-1.5">{game.descriptorOrder.map((id, index) => { const member = memberFor(room, id); const current = id === game.descriptorId; const next = id === game.nextDescriptorId; return <div key={id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${current ? 'bg-berry/[.09]' : next ? 'bg-aqua/[.07]' : 'bg-ink/[.03]'}`}><span className="w-5 text-center text-xs font-black text-ink/50">{index + 1}</span><Avatar name={member?.displayName ?? id} avatar={member?.avatar} presence={member?.presence} size="xs" /><strong className="min-w-0 flex-1 truncate text-sm">{member?.displayName ?? id}</strong>{current ? <span className="flex items-center gap-1 text-xs font-black text-berry"><Mic2 size={14} /> Ahora</span> : next ? <span className="text-xs font-black text-aqua">Siguiente</span> : null}</div>; })}</div></section>;
}

function RoundReveal({ room, game, serverOffset }: { room: RoomView; game: PokeTabooPublicState; serverOffset: number }) {
  const result = game.lastRound!; const winner = memberFor(room, result.winnerId); const descriptor = memberFor(room, result.descriptorId);
  return <section className="mx-auto max-w-5xl px-3 py-5 sm:px-5"><div className="overflow-hidden rounded-2xl border border-leaf/25 bg-surface shadow-card reveal-pop"><header className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-4 sm:px-6"><div><span className="label !mb-0">Ronda {game.roundNumber} · Reveal</span><h1 className="font-display text-3xl text-leaf sm:text-4xl">¡Era {result.pokemon.name}!</h1></div><ServerTimer deadline={game.nextTransitionAt} serverOffset={serverOffset} label="Siguiente turno" /></header><div className="grid gap-5 p-4 sm:p-6 md:grid-cols-[18rem_1fr] md:items-center"><div className="grid min-h-72 place-items-center rounded-xl bg-leaf/[.07] p-4"><img src={result.pokemon.sprite} alt={result.pokemon.name} className="h-56 w-56 object-contain [image-rendering:pixelated]" /><div className="flex flex-wrap justify-center gap-2">{result.pokemon.types.map((type) => <PokemonTypeBadge key={type} type={type} compact />)}</div><strong className="mt-2">Generación {result.pokemon.generation}</strong></div><div>{winner ? <><CheckCircle2 className="text-leaf" size={44} /><h2 className="mt-2 font-display text-3xl">{winner.displayName} ha acertado</h2><p className="mt-1 font-bold text-ink/65">Encontró el Pokémon en {result.winnerAttemptCount} intento{result.winnerAttemptCount === 1 ? '' : 's'}.</p><div className="mt-5 space-y-2"><div className="flex items-center gap-3 rounded-xl bg-leaf/[.08] p-3"><Avatar name={winner.displayName} avatar={winner.avatar} size="md" /><span className="min-w-0 flex-1"><strong className="block truncate">{winner.displayName}</strong><small className="font-bold text-ink/60">Adivinó el Pokémon</small></span><strong className="text-xl text-leaf">+{result.guesserPoints}</strong></div>{descriptor && <div className="flex items-center gap-3 rounded-xl bg-aqua/[.07] p-3"><Avatar name={descriptor.displayName} avatar={descriptor.avatar} size="md" /><span className="min-w-0 flex-1"><strong className="block truncate">{descriptor.displayName}</strong><small className="font-bold text-ink/60">Descriptor</small></span><strong className="text-xl text-aqua">+{result.descriptorPoints}</strong></div>}</div></> : <><Eye className="text-electric" size={44} /><h2 className="mt-2 font-display text-3xl">Nadie lo adivinó</h2><p className="mt-1 font-bold text-ink/65">La ronda terminó sin puntos para el grupo ni para quien describía.</p>{descriptor && <div className="mt-5 flex items-center gap-3 rounded-xl bg-ink/[.04] p-3"><Avatar name={descriptor.displayName} avatar={descriptor.avatar} size="md" /><span className="min-w-0 flex-1"><strong className="block truncate">{descriptor.displayName}</strong><small className="font-bold text-ink/60">Descriptor · +0 puntos</small></span></div>}</>}</div></div></div></section>;
}

export function PokeTabooGame({ room, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokeTabooPublicState; const player = room.gamePlayerState as PokeTabooPlayerState;
  const config = room.selectedGameConfig as { generations: number[]; includeRegionalForms: boolean };
  const canLoadPool = player.role === 'GUESSER' && player.canGuess;
  const { pokemon, error: loadError } = usePokemonPool({ generations: config.generations, includeForms: config.includeRegionalForms, enabled: canLoadPool });
  const serverOffset = useServerOffset(room.serverNow); const descriptor = memberFor(room, game.descriptorId);
  if (game.phase === 'ROUND_RESULTS' && game.lastRound) return <RoundReveal room={room} game={game} serverOffset={serverOffset} />;
  return <section className="mx-auto max-w-[90rem] overflow-x-clip px-3 py-4 sm:px-5"><header className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink/10 bg-surface px-4 py-3 shadow-card"><div><span className="text-xs font-black text-ink/60">Vuelta {game.lapNumber}/{game.totalLaps} · Turno {game.roundNumber}/{game.totalRounds}</span><h1 className="font-display text-2xl sm:text-3xl">PokéTaboo</h1></div><DescriptorBanner room={room} game={game} /><ServerTimer deadline={game.roundEndsAt} serverOffset={serverOffset} /></header>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]"><main className="min-w-0 overflow-hidden rounded-2xl border border-ink/10 bg-surface shadow-card"><div className="p-4 sm:p-6">{player.role === 'DESCRIPTOR' && player.secretPokemon ? <SecretPanel pokemon={player.secretPokemon} /> : <section className="py-2 text-center"><Mic2 className="mx-auto text-berry" size={42} /><h2 className="mt-2 font-display text-2xl">{descriptor?.displayName ?? 'El descriptor'} está describiendo</h2><p className="mx-auto mt-1 max-w-xl font-bold text-ink/65">Escucha la descripción en vuestro chat de voz. Las pistas escritas aparecerán debajo.</p></section>}</div><div className="border-t border-ink/10 bg-night/10 p-4 sm:p-5"><div className="grid gap-5 lg:grid-cols-2">{player.role === 'DESCRIPTOR' ? <HintComposer enabled={player.canSendHint} onAction={onAction} /> : <HintList game={game} descriptorName={descriptor?.displayName ?? 'quien describe'} />}{player.role === 'GUESSER' ? <GuessPanel pokemon={pokemon} player={player} game={game} serverOffset={serverOffset} loadError={loadError} onAction={onAction} /> : player.role === 'SPECTATOR' ? <div className="grid min-h-28 place-items-center rounded-xl bg-ink/[.04] text-center"><div><Eye className="mx-auto text-aqua" /><strong className="mt-1 block font-display text-xl">Estás observando</strong><span className="text-sm font-bold text-ink/60">Puedes seguir las pistas y los intentos.</span></div></div> : <HintList game={game} descriptorName={descriptor?.displayName ?? 'tu turno'} />}</div></div></main><aside className="grid gap-4 md:grid-cols-2 xl:sticky xl:top-20 xl:grid-cols-1"><AttemptsPanel room={room} game={game} /><TurnOrder room={room} game={game} /></aside></div>
  </section>;
}
