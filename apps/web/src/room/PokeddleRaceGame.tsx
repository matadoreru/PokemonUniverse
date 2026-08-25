import type { Pokemon, PokeddlePublicBoard, PokeddleRacePlayerState, PokeddleRacePublicState, PresenceStatus, RoomMemberView, RoomView } from '@pokemon-universe/shared';
import { Check, CheckCircle2, Circle, Eye, Flag, Search, Trophy, WifiOff } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useServerOffset } from '../hooks/useServerTime';
import { PokeddleBoard } from './PokeddleBoard';
import { PokemonSelector } from './PokemonSelector';
import { resolveRivalSelection } from './pokeddle-presentation';
import { PokeddleRaceTimer } from './PokeddleRaceTimer';

export { PokeddleBoard } from './PokeddleBoard';
export { formatPokeddleFeedback } from './pokeddle-presentation';

const EMPTY_LOCKED = new Set<string>();

export interface PokeddleRoundStatus {
  kind: 'pending' | 'submitted' | 'solved' | 'transition' | 'disconnected';
  title: string;
  detail?: string;
}

export function getPokeddleRoundStatus(game: Pick<PokeddleRacePublicState, 'phase'>, player: PokeddleRacePlayerState, presence: PresenceStatus): PokeddleRoundStatus {
  if (presence === 'TEMPORARILY_DISCONNECTED' || presence === 'LEFT') return { kind: 'disconnected', title: 'Reconectando…', detail: 'Tu estado sigue guardado en el servidor.' };
  if (player.solved) return { kind: 'solved', title: 'Pokémon encontrado' };
  if (game.phase === 'ROUND_RESULTS') return { kind: 'transition', title: 'Calculando resultados…', detail: 'Preparando la siguiente ronda.' };
  if (player.hasGuessedThisRound) return { kind: 'submitted', title: 'Intento enviado', detail: 'Esperando al resto…' };
  return { kind: 'pending', title: 'Falta tu intento' };
}

export function isPokeddleSearchEnabled(game: Pick<PokeddleRacePublicState, 'phase'>, player: PokeddleRacePlayerState): boolean {
  return game.phase === 'ROUND_ACTIVE' && player.canGuess && !player.solved && !player.hasGuessedThisRound;
}

export function getPokeddleRivalSummary(board: PokeddlePublicBoard, currentRound: number, answered: boolean) {
  if (board.solved) return { status: `Resuelto · ${board.revealedPokemon?.name ?? 'Pokémon'}`, detail: `R${board.solvedRound} · ${board.validGuesses} intento${board.validGuesses === 1 ? '' : 's'}` };
  return { status: answered ? 'Intento enviado' : `Ronda ${currentRound}`, detail: `${board.validGuesses} intento${board.validGuesses === 1 ? '' : 's'} · ${board.missedRounds} sin responder` };
}

const RaceHeader = memo(function RaceHeader({ game, room, selfId, serverOffset }: { game: PokeddleRacePublicState; room: RoomView; selfId: string; serverOffset: number }) {
  const participants = room.members.filter((member) => Boolean(game.boards[member.id]));
  const sessionPoints = room.members.find((member) => member.id === selfId)?.sessionPoints ?? 0;
  const timerDeadline = game.roundEndsAt ?? game.nextTransitionAt;
  return <header className="mb-4 rounded-2xl border border-ink/10 bg-surface/90 px-4 py-3.5 shadow-card sm:px-5">
    <div className="mb-2.5 flex items-center justify-between gap-3 border-b border-ink/[0.07] pb-2.5">
      <div><span className="block text-[10px] font-black uppercase tracking-[.16em] text-ink/60">Carrera multijugador</span><h1 className="font-display text-xl font-bold sm:text-2xl">Pokédle Race</h1></div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 py-1.5 text-xs font-extrabold"><Trophy size={15} className="text-electric" aria-hidden="true" /> {sessionPoints} pts <span className="hidden sm:inline">sesión</span></span>
    </div>
    <div className="grid grid-cols-3 items-center divide-x divide-ink/10">
      <PokeddleRaceTimer deadline={timerDeadline} serverOffset={serverOffset} active={game.phase === 'ROUND_ACTIVE'} />
      <div className="text-center"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-[.14em] text-ink/60">Ronda</span><strong className="font-display text-xl tabular-nums sm:text-2xl">{game.roundNumber}<span className="text-ink/50">/{game.maxRounds}</span></strong></div>
      <div className="text-center"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-[.14em] text-ink/60">En carrera</span><strong className="font-display text-xl tabular-nums sm:text-2xl">{game.activePlayerIds.length}</strong></div>
    </div>
    <div className="mt-2.5 flex items-center gap-2 overflow-x-auto border-t border-ink/[0.07] pt-2.5" aria-label="Estado de los participantes">
      {participants.map((member) => { const solved = game.boards[member.id]?.solved; return <span key={member.id} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-extrabold ${solved ? 'bg-leaf/[0.08] text-leaf' : 'bg-ink/[0.05] text-ink/65'}`} title={`${member.displayName}: ${solved ? 'Pokémon encontrado' : member.presence === 'CONNECTED' ? 'en carrera' : 'reconectando'}`}><Avatar name={member.displayName} avatar={member.avatar} presence={member.presence} size="xs" />{solved ? <Check size={13} aria-hidden="true" /> : <Circle size={9} className="fill-current" aria-hidden="true" />}<span className="max-w-24 truncate">{member.id === selfId ? 'Tú' : member.displayName}</span></span>; })}
    </div>
  </header>;
});

function RoundStatus({ status }: { status: PokeddleRoundStatus }) {
  const tone = status.kind === 'solved' || status.kind === 'submitted' ? 'text-leaf' : status.kind === 'pending' ? 'text-electric' : status.kind === 'disconnected' ? 'text-berry' : 'text-aqua';
  return <div className="text-right" role="status" aria-live="polite"><strong className={`flex items-center justify-end gap-1.5 text-sm ${tone}`}>{status.kind === 'solved' || status.kind === 'submitted' ? <CheckCircle2 size={17} aria-hidden="true" /> : status.kind === 'disconnected' ? <WifiOff size={17} aria-hidden="true" /> : <Circle size={10} className={status.kind === 'pending' ? 'fill-current' : ''} aria-hidden="true" />}{status.title}</strong>{status.detail && <small className="mt-0.5 block font-bold text-ink/60">{status.detail}</small>}</div>;
}

function SubmittedGuess({ pokemon }: { pokemon: Pokemon | null }) {
  return <div className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-leaf/[0.06] px-3 py-3 text-center" role="status">
    {pokemon ? <img src={pokemon.sprite} alt="" className="h-14 w-14 object-contain [image-rendering:pixelated]" /> : <CheckCircle2 className="text-leaf" size={34} aria-hidden="true" />}
    <div className="text-left"><strong className="block font-display text-lg text-leaf">{pokemon ? `${pokemon.name} enviado` : 'Intento enviado'}</strong><span className="text-sm font-bold text-ink/65">Esperando resultados de la ronda…</span></div>
  </div>;
}

const RivalCard = memo(function RivalCard({ member, board, currentRound, answered, selected, onSelect }: { member: RoomMemberView; board: PokeddlePublicBoard; currentRound: number; answered: boolean; selected: boolean; onSelect(id: string): void }) {
  const summary = getPokeddleRivalSummary(board, currentRound, answered);
  return <button id={`rival-tab-${member.id}`} role="tab" aria-selected={selected} aria-controls="selected-rival-board" onClick={() => onSelect(member.id)} className={`group flex min-h-16 min-w-[12rem] items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition focus-visible:z-10 ${selected ? 'border-aqua/55 bg-aqua/[0.08]' : 'border-ink/10 bg-surface-raised/70 hover:border-ink/25 hover:bg-ink/[0.05]'}`}>
    <Avatar name={member.displayName} avatar={member.avatar} presence={member.presence} size="sm" />
    <span className="min-w-0 flex-1"><strong className="block truncate font-display text-sm">{member.displayName}</strong><small className={`block truncate font-extrabold ${board.solved ? 'text-leaf' : answered ? 'text-aqua' : 'text-ink/65'}`}>{board.solved && '✓ '}{summary.status}</small><small className="block truncate text-[10px] font-bold text-ink/55">{summary.detail}</small></span>
    {board.revealedPokemon && <img src={board.revealedPokemon.sprite} alt="" className="h-9 w-9 shrink-0 object-contain [image-rendering:pixelated]" />}
  </button>;
});

export function PokeddleRaceGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokeddleRacePublicState;
  const player = room.gamePlayerState as PokeddleRacePlayerState;
  const config = room.selectedGameConfig as { generations: number[]; roundSeconds: number };
  const { pokemon, error: poolError } = usePokemonPool({ generations: config.generations });
  const [selectedRival, setSelectedRival] = useState<string | null>(null);
  const [submittedPokemon, setSubmittedPokemon] = useState<Pokemon | null>(null);
  const [solveNotice, setSolveNotice] = useState<{ member: RoomMemberView; pokemon: PokeddlePublicBoard['revealedPokemon']; round: number | null } | null>(null);
  const knownSolved = useRef(new Set(Object.values(game.boards).filter((board) => board.solved).map((board) => board.playerId)));
  const serverOffset = useServerOffset(room.serverNow);
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const own = game.boards[selfId];
  const selfMember = members.get(selfId);
  const rivals = useMemo(() => {
    const ordered = room.members.map((member) => member.id).filter((id) => id !== selfId && Boolean(game.boards[id]));
    const missing = Object.keys(game.boards).filter((id) => id !== selfId && !ordered.includes(id));
    return [...ordered, ...missing];
  }, [game.boards, room.members, selfId]);
  const rivalId = resolveRivalSelection(rivals, selectedRival);
  const rival = rivalId ? game.boards[rivalId] : null;

  useEffect(() => {
    if (!player.hasGuessedThisRound || game.phase !== 'ROUND_ACTIVE') setSubmittedPokemon(null);
  }, [game.phase, game.roundNumber, player.hasGuessedThisRound]);

  useEffect(() => {
    for (const board of Object.values(game.boards)) {
      if (!board.solved || board.playerId === selfId || knownSolved.current.has(board.playerId)) continue;
      knownSolved.current.add(board.playerId);
      const member = members.get(board.playerId);
      if (member) setSolveNotice({ member, pokemon: board.revealedPokemon, round: board.solvedRound });
    }
  }, [game.boards, members, selfId]);

  useEffect(() => {
    if (!solveNotice) return undefined;
    const timer = window.setTimeout(() => setSolveNotice(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [solveNotice]);

  async function submitGuess(pokemonId: string) {
    const selected = pokemon.find((entry) => entry.id === pokemonId) ?? null;
    await onAction({ type: 'GUESS_POKEMON', pokemonId });
    setSubmittedPokemon(selected);
  }

  const status = getPokeddleRoundStatus(game, player, selfMember?.presence ?? 'CONNECTED');
  const canSearch = isPokeddleSearchEnabled(game, player);
  return <section className="mx-auto max-w-[96rem] overflow-x-clip px-3 py-3 sm:px-5 md:py-5">
    <RaceHeader game={game} room={room} selfId={selfId} serverOffset={serverOffset} />

    {solveNotice && <aside className="pointer-events-none fixed right-3 top-20 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-2xl border border-leaf/35 bg-surface/95 p-3 shadow-card reveal-pop sm:right-5" role="status" aria-live="polite"><Avatar name={solveNotice.member.displayName} avatar={solveNotice.member.avatar} size="md" /><div className="min-w-0"><strong className="block truncate font-display text-leaf">{solveNotice.member.displayName} ha encontrado su Pokémon</strong><span className="text-sm font-extrabold">{solveNotice.pokemon?.name} · Ronda {solveNotice.round}</span></div>{solveNotice.pokemon && <img src={solveNotice.pokemon.sprite} alt="" className="h-12 w-12 object-contain" />}</aside>}

    {own && <section className="mb-5 overflow-hidden rounded-2xl border border-ink/10 bg-surface/90 shadow-card">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5"><div className="flex min-w-0 items-center gap-3">{selfMember && <Avatar name={selfMember.displayName} avatar={selfMember.avatar} presence={selfMember.presence} size="sm" />}<div className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[.15em] text-aqua">Tu tablero</span><strong className="block truncate font-display text-xl">{selfMember?.displayName ?? selfId}</strong></div></div><RoundStatus status={status} /></div>
      <div className="px-2.5 pb-2.5 sm:px-4 sm:pb-4"><PokeddleBoard board={own} clues={game.enabledClues} mode="self" /></div>
      <div className="border-t border-ink/[0.08] bg-night/10 px-3 py-3 sm:px-5 sm:py-4">
        {canSearch ? <div><div className="mb-2 flex flex-wrap items-center justify-between gap-1.5"><h2 className="flex items-center gap-2 font-display text-lg"><Search size={18} className="text-aqua" aria-hidden="true" /> Tu intento · Ronda {game.roundNumber}</h2><span className="text-xs font-bold text-ink/60">Un Pokémon por ronda</span></div>{poolError ? <p className="rounded-xl bg-berry/10 p-3 text-sm font-extrabold text-berry" role="alert">{poolError}</p> : <PokemonSelector key={game.roundNumber} pokemon={pokemon} locked={EMPTY_LOCKED} disabled={false} variant="embedded" autoFocus={false} inputLabel={`Buscar Pokémon para la ronda ${game.roundNumber}`} onSelect={submitGuess} />}</div>
          : player.hasGuessedThisRound && game.phase === 'ROUND_ACTIVE' ? <SubmittedGuess pokemon={submittedPokemon} />
            : player.solved ? <div className="flex min-h-20 items-center justify-center gap-3 text-center"><Eye className="text-aqua" aria-hidden="true" /><div className="text-left"><strong className="block font-display text-lg">Ahora observas la carrera</strong><span className="text-sm font-bold text-ink/65">Tu Pokémon ya es público y no bloqueas las rondas.</span></div></div>
              : <div className="flex min-h-20 items-center justify-center gap-3 text-center"><Flag className="text-aqua" aria-hidden="true" /><div className="text-left"><strong className="block font-display text-lg">{game.phase === 'ROUND_RESULTS' ? 'Preparando la siguiente ronda…' : 'Esperando al servidor…'}</strong><span className="text-sm font-bold text-ink/65">Tu historial permanece visible.</span></div></div>}
      </div>
    </section>}

    {rivals.length > 0 && <section aria-labelledby="rivals-title">
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1"><div><span className="block text-[10px] font-black uppercase tracking-[.15em] text-ink/60">Competición</span><h2 id="rivals-title" className="font-display text-xl sm:text-2xl">Rivales</h2></div><span className="hidden text-xs font-bold text-ink/60 sm:block">Selecciona un entrenador para ver su tablero</span></div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Seleccionar tablero rival">{rivals.map((id) => { const board = game.boards[id]; const member = members.get(id); if (!board || !member) return null; return <RivalCard key={id} member={member} board={board} currentRound={game.roundNumber} answered={game.answeredPlayerIds.includes(id)} selected={rivalId === id} onSelect={setSelectedRival} />; })}</div>
      {rival && <div id="selected-rival-board" role="tabpanel" aria-labelledby={`rival-tab-${rival.playerId}`} className="rounded-2xl border border-ink/10 bg-surface/65 p-2.5 sm:p-4"><div className="mb-2.5 flex items-center justify-between gap-3 px-1"><div className="flex min-w-0 items-center gap-2.5">{members.get(rival.playerId) && <Avatar name={members.get(rival.playerId)!.displayName} avatar={members.get(rival.playerId)!.avatar} presence={members.get(rival.playerId)!.presence} size="sm" />}<div className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[.14em] text-ink/60">Tablero de</span><strong className="block truncate font-display text-lg">{members.get(rival.playerId)?.displayName ?? rival.playerId}</strong></div></div>{rival.solved ? <span className="inline-flex items-center gap-1 text-sm font-extrabold text-leaf"><CheckCircle2 size={17} /> Resuelto</span> : game.answeredPlayerIds.includes(rival.playerId) ? <span className="text-xs font-extrabold text-aqua">Intento enviado ✓</span> : <span className="text-xs font-bold text-ink/60">En carrera</span>}</div><PokeddleBoard board={rival} clues={game.enabledClues} mode="spectator" showLegend={false} /></div>}
    </section>}
  </section>;
}
