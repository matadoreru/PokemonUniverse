import type { Pokemon, PokemonLegendaryStatus, PokemonType, RoomView, WhosThatPokemonHint, WhosThatPokemonPlayerState, WhosThatPokemonPublicState } from '@pokemon-universe/shared';
import { CheckCircle2, Eye, History, Lightbulb, Search, XCircle } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ServerTimer } from '../components/ServerTimer';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { PokemonSelector } from './PokemonSelector';

const EMPTY_LOCKED = new Set<string>();
const typeLabels: Record<PokemonType, string> = { normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };
const categoryLabels: Record<PokemonLegendaryStatus, string> = { NORMAL: 'No legendario', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' };

function describeHint(hint: WhosThatPokemonHint): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.value}`;
  if (hint.kind === 'TYPE') return `Uno de sus tipos es ${typeLabels[hint.value]}`;
  if (hint.kind === 'TYPE_COUNT') return hint.value === 1 ? 'Es monotipo' : 'Tiene dos tipos';
  if (hint.kind === 'CATEGORY') return categoryLabels[hint.value];
  if (hint.stages <= 1) return 'No evoluciona';
  if (hint.stage === 1) return 'Pokémon base';
  if (hint.stage >= hint.stages) return 'Evolución final';
  return 'Evolución intermedia';
}

function SilhouetteStage({ source }: { source: string }) {
  return <div className="who-silhouette-stage relative mx-auto grid aspect-square w-full max-w-[23rem] place-items-center overflow-hidden rounded-2xl border border-aqua/20" aria-label="Silueta misteriosa normalizada">
    <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_center,rgba(240,191,84,.65),transparent_55%)]" />
    <span className="absolute right-5 top-4 font-display text-5xl text-ink/10" aria-hidden="true">?</span>
    <img src={source} alt="Silueta de un Pokémon misterioso" className="relative z-10 h-[82%] w-[82%] object-contain [image-rendering:pixelated]" />
  </div>;
}

function HintPanel({ game, enabled, serverOffset }: { game: WhosThatPokemonPublicState; enabled: boolean; serverOffset: number }) {
  if (!enabled) return null;
  return <section className="rounded-2xl border border-electric/20 bg-electric/[0.06] p-3" aria-label="Pistas adicionales"><div className="mb-2 flex items-center justify-between gap-2"><strong className="flex items-center gap-2 font-display text-lg"><Lightbulb className="text-electric" size={19} /> Pistas</strong>{game.nextTransitionAt && <ServerTimer deadline={game.nextTransitionAt} serverOffset={serverOffset} label="Siguiente pista" />}</div>{game.visibleHints.length ? <div className="flex flex-wrap gap-2">{game.visibleHints.map((hint, index) => <span key={`${hint.kind}-${index}`} className="reveal-pop rounded-full border border-electric/20 bg-night/30 px-3 py-1.5 text-sm font-extrabold text-electric">Pista {index + 1} · {describeHint(hint)}</span>)}</div> : <p className="text-sm font-bold text-ink/65">La primera pista aparecerá durante la ronda.</p>}</section>;
}

function GuessPanel({ pokemon, player, game, serverOffset, participating, loadError, onAction }: { pokemon: Pokemon[]; player: WhosThatPokemonPlayerState; game: WhosThatPokemonPublicState; serverOffset: number; participating: boolean; loadError: string; onAction(action: unknown): Promise<void> }) {
  const cooldownMs = useRemainingMs(player.cooldownUntil, serverOffset);
  if (!participating) return <div className="grid min-h-28 place-items-center rounded-2xl bg-ink/[0.04] text-center"><div><Eye className="mx-auto text-aqua" /><strong className="mt-1 block font-display text-xl">Estás observando</strong><span className="text-sm font-bold text-ink/65">Los espectadores no pueden enviar respuestas.</span></div></div>;
  if (player.solved) return <div className="reveal-pop grid min-h-32 place-items-center rounded-2xl border border-leaf/30 bg-leaf/[0.08] text-center"><div><CheckCircle2 className="mx-auto text-leaf" size={42} /><strong className="mt-1 block font-display text-2xl text-leaf">¡Has acertado!</strong><span className="font-bold text-ink/65">+{player.roundPoints} puntos · esperando al resto…</span></div></div>;
  if (!player.canGuess) return <div className="grid min-h-28 place-items-center rounded-2xl bg-ink/[0.04] font-bold text-ink/65">Esperando al servidor…</div>;
  return <section aria-label="Enviar intento"><div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><span className="block text-[10px] font-black uppercase tracking-[.15em] text-aqua">Tu respuesta</span><h2 className="flex items-center gap-2 font-display text-xl"><Search size={19} /> Buscar Pokémon</h2></div><span className="text-xs font-bold text-ink/60">{player.attemptCount} intento{player.attemptCount === 1 ? '' : 's'}</span></div>
    {player.lastAttempt?.result === 'INCORRECT' && <p className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-berry/[0.08] px-3 py-2 text-sm font-extrabold text-berry" role="status"><span className="flex items-center gap-1.5"><XCircle size={17} /> Incorrecto</span><span>{cooldownMs > 0 ? `Nuevo intento en ${(cooldownMs / 1_000).toFixed(1)}s` : 'Ya puedes volver a intentarlo'}</span></p>}
    {loadError ? <p className="rounded-xl bg-berry/10 p-3 font-extrabold text-berry" role="alert">{loadError}</p> : <PokemonSelector key={game.roundNumber} pokemon={pokemon} locked={EMPTY_LOCKED} disabled={false} confirmationDisabled={cooldownMs > 0} variant="embedded" autoFocus={false} inputLabel={`Buscar respuesta para la ronda ${game.roundNumber}`} onSelect={(pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId })} />}
  </section>;
}

function PlayersPanel({ room, game }: { room: RoomView; game: WhosThatPokemonPublicState }) {
  return <section className="rounded-2xl border border-ink/10 bg-surface/80 p-4"><h2 className="mb-3 font-display text-xl">Jugadores</h2><div className="space-y-2">{room.members.map((member) => { const solved = game.solvedPlayerIds.includes(member.id); const participating = member.role === 'PLAYER'; return <div key={member.id} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${solved ? 'bg-leaf/[0.08]' : 'bg-ink/[0.035]'}`}><Avatar name={member.displayName} avatar={member.avatar} presence={member.presence} size="sm" /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{member.displayName}</strong><small className="font-bold text-ink/55">{game.scores[member.id] ?? 0} pts</small></div>{!participating ? <span className="flex items-center gap-1 text-xs font-bold text-ink/55"><Eye size={15} /> Espectador</span> : solved ? <span className="flex items-center gap-1 text-xs font-black text-leaf"><CheckCircle2 size={16} /> Ha acertado</span> : <span className="text-xs font-bold text-ink/60">buscando…</span>}</div>; })}</div></section>;
}

function AttemptsPanel({ room, game }: { room: RoomView; game: WhosThatPokemonPublicState }) {
  return <section className="rounded-2xl border border-ink/10 bg-surface/80 p-4"><h2 className="mb-3 flex items-center gap-2 font-display text-xl"><History className="text-berry" size={20} /> Intentos públicos</h2>{game.attempts.length ? <div className="max-h-72 space-y-1.5 overflow-y-auto overscroll-contain pr-1" aria-live="polite">{game.attempts.slice().reverse().map((attempt, index) => { const member = room.members.find((candidate) => candidate.id === attempt.playerId); return <div key={`${attempt.playerId}-${attempt.attemptedAt}-${index}`} className="flex items-center gap-2 rounded-xl bg-berry/[0.07] p-2"><Avatar name={member?.displayName ?? attempt.playerId} avatar={member?.avatar} size="xs" /><span className="min-w-0 flex-1 text-sm"><strong className="truncate">{member?.displayName ?? attempt.playerId}</strong><span className="text-ink/60"> probó </span><strong>{attempt.guessedPokemon.name}</strong></span><img src={attempt.guessedPokemon.sprite} alt="" className="h-8 w-8 object-contain [image-rendering:pixelated]" /><XCircle className="shrink-0 text-berry" size={16} /></div>; })}</div> : <p className="rounded-xl border border-dashed border-ink/10 p-5 text-center text-sm font-bold text-ink/60">Todavía no hay intentos incorrectos.</p>}</section>;
}

function RoundReveal({ room, game, serverOffset }: { room: RoomView; game: WhosThatPokemonPublicState; serverOffset: number }) {
  const result = game.lastRound!;
  return <section className="mx-auto max-w-6xl px-3 py-5 sm:px-5"><div className="overflow-hidden rounded-2xl border border-leaf/25 bg-surface/95 shadow-card reveal-pop"><header className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-4 sm:px-6"><div><span className="label !mb-0">Resultado · Ronda {game.roundNumber}</span><h1 className="font-display text-3xl text-leaf sm:text-4xl">¡Era {result.pokemon.name}!</h1></div><ServerTimer deadline={game.nextTransitionAt} serverOffset={serverOffset} label="Siguiente ronda" /></header><div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[20rem_1fr]"><div className="who-reveal-stage grid min-h-72 place-items-center rounded-2xl bg-leaf/[0.08] p-4"><img src={result.pokemon.sprite} alt={result.pokemon.name} className="h-64 w-64 object-contain [image-rendering:pixelated]" /><strong className="font-display text-2xl">{result.pokemon.name}</strong></div><div className="grid content-start gap-2 sm:grid-cols-2">{room.members.map((member) => { const solve = result.solves[member.id]; const attempts = result.attemptCounts[member.id] ?? 0; return <article key={member.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${solve ? 'border-leaf/30 bg-leaf/[0.07]' : 'border-berry/20 bg-berry/[0.05]'}`}><Avatar name={member.displayName} avatar={member.avatar} size="md" /><div className="min-w-0 flex-1"><strong className="block truncate">{member.displayName}</strong>{member.role === 'SPECTATOR' ? <small className="font-bold text-ink/55">Espectador</small> : solve ? <small className="font-bold text-leaf">✓ {attempts} intento{attempts === 1 ? '' : 's'} · {(solve.elapsedMs / 1_000).toFixed(1)}s</small> : <small className="font-bold text-berry">✗ No acertó · {attempts} intentos</small>}</div><strong className={solve ? 'text-leaf' : 'text-ink/50'}>+{solve?.points ?? 0}</strong></article>; })}</div></div></div></section>;
}

export function WhosThatPokemonGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as WhosThatPokemonPublicState; const player = room.gamePlayerState as WhosThatPokemonPlayerState;
  const config = room.selectedGameConfig as { generations: number[]; hintsEnabled: boolean; includeRegionalForms: boolean };
  const { pokemon, error: loadError } = usePokemonPool({ generations: config.generations, includeForms: config.includeRegionalForms });
  const serverOffset = useServerOffset(room.serverNow);
  const self = room.members.find((member) => member.id === selfId); const participating = self?.role === 'PLAYER';
  if (game.phase === 'ROUND_RESULTS' && game.lastRound) return <RoundReveal room={room} game={game} serverOffset={serverOffset} />;
  return <section className="mx-auto max-w-[90rem] overflow-x-clip px-3 py-4 sm:px-5"><header className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-surface/85 px-4 py-3 shadow-card"><div><span className="block text-[10px] font-black uppercase tracking-[.16em] text-ink/60">Ronda {game.roundNumber} / {game.totalRounds}</span><h1 className="font-display text-xl sm:text-3xl">¿Quién es ese Pokémon?</h1></div><ServerTimer deadline={game.roundEndsAt} serverOffset={serverOffset} /></header>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"><main className="overflow-hidden rounded-2xl border border-ink/10 bg-surface/90 shadow-card"><div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(18rem,25rem)_1fr] lg:items-center"><div><SilhouetteStage source={game.silhouetteSprite ?? ''} /></div><div className="space-y-4"><div><h2 className="font-display text-2xl sm:text-3xl">Reconoce su forma</h2></div><HintPanel game={game} enabled={config.hintsEnabled} serverOffset={serverOffset} /></div></div><div className="border-t border-ink/[0.08] bg-night/10 p-4 sm:p-5"><GuessPanel pokemon={pokemon} player={player} game={game} serverOffset={serverOffset} participating={Boolean(participating)} loadError={loadError} onAction={onAction} /></div></main><aside className="grid gap-4 md:grid-cols-2 xl:sticky xl:top-4 xl:grid-cols-1"><PlayersPanel room={room} game={game} /><AttemptsPanel room={room} game={game} /></aside></div>
  </section>;
}
