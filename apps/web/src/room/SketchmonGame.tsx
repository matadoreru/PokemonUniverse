import type { Pokemon, RoomMemberView, RoomView, SketchmonPlayerState, SketchmonPublicState } from '@pokemon-universe/shared';
import { CheckCircle2, Clock3, Eye, EyeOff, History, Lightbulb, Palette, Search, XCircle } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { PokemonTypeBadge } from '../components/PokemonTypeBadge';
import { ServerTimer } from '../components/ServerTimer';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { PokemonSelector } from './PokemonSelector';
import { SketchmonCanvas, SketchmonCanvasSurface } from './SketchmonCanvas';

const EMPTY_LOCKED = new Set<string>();

function memberFor(room: RoomView, id: string | null): RoomMemberView | undefined {
  return id ? room.members.find((member) => member.id === id) : undefined;
}

function DrawerBanner({ room, game }: { room: RoomView; game: SketchmonPublicState }) {
  const drawer = memberFor(room, game.drawerId); const next = memberFor(room, game.nextDrawerId);
  return <div className="flex min-w-0 flex-wrap items-center gap-3">
    {drawer && <Avatar name={drawer.displayName} avatar={drawer.avatar} presence={drawer.presence} size="md" />}
    <div className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-black text-berry"><Palette size={15} /> DIBUJANDO</span><strong className="block truncate font-display text-xl sm:text-2xl">{drawer?.displayName ?? 'Preparando turno…'}</strong>{next && <span className="block truncate text-sm font-bold text-ink/60">Siguiente: {next.displayName}</span>}</div>
  </div>;
}

function SecretPokemon({ player, serverOffset }: { player: Extract<SketchmonPlayerState, { role: 'DRAWER' }>; serverOffset: number }) {
  const pokemon = player.secretPokemon;
  const previewRemainingMs = useRemainingMs(pokemon?.previewEndsAt, serverOffset);
  if (!pokemon) return <div className="skeleton min-h-56" />;
  const spriteVisible = Boolean(pokemon.sprite) && (pokemon.previewEndsAt === null || previewRemainingMs > 0);
  return <aside className="rounded-xl border border-berry/20 bg-berry/[.06] p-4 text-center" aria-labelledby="sketchmon-secret">
    <span className="text-xs font-black text-berry">SOLO TÚ PUEDES VER ESTO</span>
    <h2 id="sketchmon-secret" className="font-display text-xl">Tu Pokémon</h2>
    <div className="grid h-36 place-items-center">
      {spriteVisible ? <div className="relative"><img src={pokemon.sprite!} alt={pokemon.name} className="h-32 w-32 object-contain [image-rendering:pixelated]" />{pokemon.previewEndsAt !== null && <span className="absolute right-0 top-0 rounded-full bg-night px-2 py-1 text-xs font-black text-white">{Math.max(1, Math.ceil(previewRemainingMs / 1_000))}s</span>}</div> : <div className="text-ink/45"><EyeOff className="mx-auto" size={42} /><strong className="mt-2 block text-sm">Referencia oculta</strong></div>}
    </div>
    <strong className="block break-words font-display text-2xl text-aqua">{pokemon.name}</strong>
    <div className="mt-2 flex flex-wrap justify-center gap-1.5">{pokemon.types.map((type) => <PokemonTypeBadge key={type} type={type} compact />)}</div>
    {pokemon.previewEndsAt !== null && <p className="mt-2 text-xs font-bold text-ink/60">{spriteVisible ? 'Memoriza su aspecto antes de que desaparezca.' : 'Ahora dibuja de memoria: solo conservarás el nombre.'}</p>}
    <p className="mt-3 text-sm font-extrabold text-berry">No escribas letras, números, nombres ni símbolos que revelen directamente el Pokémon.</p>
  </aside>;
}

function HintPanel({ game }: { game: SketchmonPublicState }) {
  if (!game.visibleHints.length) return null;
  return <section className="mt-4 rounded-xl border border-electric/25 bg-electric/[.06] p-3" aria-labelledby="sketchmon-hints">
    <h2 id="sketchmon-hints" className="flex items-center gap-2 font-display text-lg"><Lightbulb className="text-electric" size={19} /> Pistas automáticas</h2>
    <div className="mt-2 flex flex-wrap gap-2" aria-live="polite">{game.visibleHints.map((hint, index) => {
      if (hint.kind === 'GENERATION') return <span key={hint.kind} className="chip bg-electric/10 text-electric">Generación {hint.generation}</span>;
      if (hint.kind === 'TYPES') return <span key={hint.kind} className="flex flex-wrap gap-1.5">{hint.types.map((type) => <PokemonTypeBadge key={type} type={type} compact />)}</span>;
      return <span key={`${hint.kind}-${index}`} className="chip bg-electric/10 text-electric">{hint.text}</span>;
    })}</div>
  </section>;
}

function GuessPanel({ pokemon, player, game, serverOffset, loadError, onAction }: { pokemon: Pokemon[]; player: Extract<SketchmonPlayerState, { role: 'GUESSER' }>; game: SketchmonPublicState; serverOffset: number; loadError: string; onAction(action: unknown): Promise<void> }) {
  const cooldownMs = useRemainingMs(player.cooldownUntil, serverOffset);
  if (!player.canGuess) return <div className="grid min-h-28 place-items-center rounded-xl bg-ink/[.04] font-bold text-ink/65">Esperando al siguiente dibujo…</div>;
  return <section className="mt-4 border-t border-ink/10 pt-4" aria-labelledby="sketchmon-answer">
    <div className="mb-2 flex items-end justify-between gap-2"><div><span className="text-xs font-black text-aqua">TU RESPUESTA</span><h2 id="sketchmon-answer" className="flex items-center gap-2 font-display text-xl"><Search size={19} /> Buscar Pokémon</h2></div><span className="text-xs font-bold text-ink/60">{player.attemptCount} intento{player.attemptCount === 1 ? '' : 's'}</span></div>
    {cooldownMs > 0 && <p className="mb-2 flex items-center gap-2 rounded-xl bg-berry/[.08] px-3 py-2 text-sm font-extrabold text-berry" role="status"><XCircle size={17} /> Incorrecto · nuevo intento en {(cooldownMs / 1_000).toFixed(1)}s</p>}
    {loadError ? <p className="status-error" role="alert">{loadError}</p> : <PokemonSelector key={game.roundNumber} pokemon={pokemon} locked={EMPTY_LOCKED} disabled={false} confirmationDisabled={cooldownMs > 0} variant="embedded" autoFocus={false} inputLabel={`Buscar respuesta para el dibujo ${game.roundNumber}`} onSelect={(pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId })} />}
  </section>;
}

function AttemptsPanel({ room, game }: { room: RoomView; game: SketchmonPublicState }) {
  return <section className="rounded-xl border border-ink/10 bg-surface p-4" aria-labelledby="sketchmon-attempts"><h2 id="sketchmon-attempts" className="mb-3 flex items-center gap-2 font-display text-xl"><History className="text-berry" size={20} /> Intentos</h2>{game.attempts.length ? <div className="max-h-80 space-y-1.5 overflow-y-auto overscroll-contain" aria-live="polite">{game.attempts.slice().reverse().map((attempt, index) => { const member = memberFor(room, attempt.playerId); return <div key={`${attempt.playerId}-${attempt.attemptedAt}-${index}`} className="flex items-center gap-2 rounded-xl bg-berry/[.06] p-2"><Avatar name={member?.displayName ?? attempt.playerId} avatar={member?.avatar} size="xs" /><span className="min-w-0 flex-1 truncate text-sm"><strong>{member?.displayName ?? attempt.playerId}</strong><span className="text-ink/55"> → </span>{attempt.guessedPokemon.name}</span><img src={attempt.guessedPokemon.sprite} alt="" className="h-8 w-8 object-contain [image-rendering:pixelated]" /><XCircle className="shrink-0 text-berry" size={16} /></div>; })}</div> : <p className="rounded-xl border border-dashed border-ink/15 p-5 text-center text-sm font-bold text-ink/60">Aún no hay respuestas incorrectas.</p>}</section>;
}

function TurnOrder({ room, game }: { room: RoomView; game: SketchmonPublicState }) {
  return <section className="rounded-xl border border-ink/10 bg-surface p-4" aria-labelledby="sketchmon-order"><h2 id="sketchmon-order" className="mb-1 font-display text-xl">Orden de esta vuelta</h2><p className="mb-3 text-xs font-bold text-ink/55">Se vuelve a mezclar en la siguiente.</p><div className="space-y-1.5">{game.drawerOrder.map((id, index) => { const member = memberFor(room, id); const current = id === game.drawerId; const next = id === game.nextDrawerId; return <div key={id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${current ? 'bg-berry/[.09]' : next ? 'bg-aqua/[.07]' : 'bg-ink/[.03]'}`}><span className="w-5 text-center text-xs font-black text-ink/50">{index + 1}</span><Avatar name={member?.displayName ?? id} avatar={member?.avatar} presence={member?.presence} size="xs" /><strong className="min-w-0 flex-1 truncate text-sm">{member?.displayName ?? id}</strong>{current ? <span className="flex items-center gap-1 text-xs font-black text-berry"><Palette size={14} /> Ahora</span> : next ? <span className="text-xs font-black text-aqua">Siguiente</span> : null}</div>; })}</div></section>;
}

function RoundReveal({ room, game, serverOffset }: { room: RoomView; game: SketchmonPublicState; serverOffset: number }) {
  const result = game.lastRound!; const winner = memberFor(room, result.winnerId); const drawer = memberFor(room, result.drawerId);
  return <section className="mx-auto max-w-6xl px-3 py-5 sm:px-5"><div className="overflow-hidden rounded-2xl border border-leaf/25 bg-surface shadow-card reveal-pop"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 px-4 py-4 sm:px-6"><div><span className="label !mb-0">Dibujo {game.roundNumber} · Reveal</span><h1 className="font-display text-3xl text-leaf sm:text-4xl">¡Era {result.pokemon.name}!</h1></div><ServerTimer deadline={game.nextTransitionAt} serverOffset={serverOffset} label="Siguiente dibujo" /></header>
    <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,.65fr)]"><div><div className="overflow-hidden rounded-xl border border-night/15 bg-white"><SketchmonCanvasSurface strokes={result.drawing} label={`Dibujo final de ${result.pokemon.name}`} /></div><p className="mt-2 text-center text-sm font-bold text-ink/60">Dibujo de {drawer?.displayName ?? result.drawerId}</p></div><div className="flex flex-col justify-center text-center"><img src={result.pokemon.sprite} alt={result.pokemon.name} className="mx-auto h-48 w-48 object-contain [image-rendering:pixelated]" /><div className="flex flex-wrap justify-center gap-1.5">{result.pokemon.types.map((type) => <PokemonTypeBadge key={type} type={type} compact />)}</div>{winner ? <><CheckCircle2 className="mx-auto mt-4 text-leaf" size={36} /><h2 className="mt-1 font-display text-2xl">{winner.displayName} lo adivinó</h2><p className="font-bold text-ink/65">En {(result.elapsedMs / 1_000).toFixed(1)}s · {result.winnerAttemptCount} intento{result.winnerAttemptCount === 1 ? '' : 's'}</p><div className="mt-4 grid gap-2 text-left"><div className="flex items-center gap-3 rounded-xl bg-leaf/[.08] p-3"><Avatar name={winner.displayName} avatar={winner.avatar} size="sm" /><strong className="min-w-0 flex-1 truncate">{winner.displayName}</strong><strong className="text-leaf">+{result.guesserPoints}</strong></div>{drawer && <div className="flex items-center gap-3 rounded-xl bg-aqua/[.07] p-3"><Avatar name={drawer.displayName} avatar={drawer.avatar} size="sm" /><span className="min-w-0 flex-1"><strong className="block truncate">{drawer.displayName}</strong><small className="font-bold text-ink/60">Dibujante</small></span><strong className="text-aqua">+{result.drawerPoints}</strong></div>}</div></> : <><Clock3 className="mx-auto mt-4 text-electric" size={36} /><h2 className="mt-1 font-display text-2xl">Se acabó el tiempo</h2><p className="font-bold text-ink/65">Nadie acertó este dibujo. No se reparten puntos.</p></>}</div></div></div></section>;
}

export function SketchmonGame({ room, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as SketchmonPublicState; const player = room.gamePlayerState as SketchmonPlayerState;
  const config = room.selectedGameConfig as { generations: number[]; includeForms: boolean };
  const canLoadPool = player.role === 'GUESSER' && player.canGuess;
  const { pokemon, error: loadError } = usePokemonPool({ generations: config.generations, includeForms: config.includeForms, enabled: canLoadPool });
  const serverOffset = useServerOffset(room.serverNow); const drawer = memberFor(room, game.drawerId);
  if (game.phase === 'ROUND_RESULTS' && game.lastRound) return <RoundReveal room={room} game={game} serverOffset={serverOffset} />;
  return <section className="mx-auto max-w-[90rem] overflow-x-clip px-3 py-4 sm:px-5"><header className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink/10 bg-surface px-4 py-3 shadow-card"><div><span className="text-xs font-black text-ink/60">Vuelta {game.lapNumber}/{game.totalLaps} · Dibujo {game.roundNumber}/{game.totalRounds}</span><h1 className="font-display text-2xl sm:text-3xl">Sketchmon</h1></div><DrawerBanner room={room} game={game} /><ServerTimer deadline={game.roundEndsAt} serverOffset={serverOffset} /></header>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]"><main className="min-w-0 rounded-2xl border border-ink/10 bg-surface p-4 shadow-card sm:p-5"><div className={player.role === 'DRAWER' ? 'grid items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]' : ''}>{player.role === 'DRAWER' && <SecretPokemon player={player} serverOffset={serverOffset} />}<div className="min-w-0">{player.role !== 'DRAWER' && <div className="mb-3 text-center"><Eye className="mx-auto text-aqua" size={30} /><h2 className="font-display text-xl">{drawer?.displayName ?? 'El dibujante'} está dibujando</h2><p className="text-sm font-bold text-ink/60">Observa los trazos en tiempo real y prueba todas las respuestas que necesites.</p></div>}{player.role === 'DRAWER' ? <SketchmonCanvas key={game.roundNumber} strokes={game.strokes} onAction={onAction} /> : <div className="relative overflow-hidden rounded-xl border border-night/15 bg-white shadow-inner"><SketchmonCanvasSurface strokes={game.strokes} label={`Dibujo en directo de ${drawer?.displayName ?? 'otro jugador'}`} /></div>}{player.role !== 'DRAWER' && !game.strokes.length && <p className="mt-2 text-center text-sm font-bold text-ink/55">Esperando el primer trazo…</p>}<HintPanel game={game} />{player.role === 'GUESSER' && <GuessPanel pokemon={pokemon} player={player} game={game} serverOffset={serverOffset} loadError={loadError} onAction={onAction} />}{player.role === 'SPECTATOR' && <div className="mt-4 rounded-xl bg-ink/[.04] p-4 text-center font-bold text-ink/65">Estás observando esta ronda.</div>}</div></div></main><aside className="grid gap-4 md:grid-cols-2 xl:sticky xl:top-20 xl:grid-cols-1"><AttemptsPanel room={room} game={game} /><TurnOrder room={room} game={game} /></aside></div>
  </section>;
}
