import type { RoomMemberView, RoomView, WhoIsWhoCursorEvent, WhoIsWhoPlayerState, WhoIsWhoPokemonCard, WhoIsWhoPublicState, WhoIsWhoTeam } from '@pokemon-universe/shared';
import { Check, EyeOff, Flag, MousePointer2, Search, Target, X } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { ServerTimer } from '../components/ServerTimer';
import { useServerOffset } from '../hooks/useServerTime';
import { clearWhoIsWhoCursor, sendWhoIsWhoCursor, subscribeWhoIsWhoCursors } from './who-is-who-cursor-channel';
import { normalizeBoardPointer, projectBoardCursor } from './who-is-who-cursor-position';
import { searchPokemonOptions } from './pokemon-search';

const teamName: Record<WhoIsWhoTeam, string> = { BLUE: 'Equipo Azul', RED: 'Equipo Rojo' };
const otherTeam = (team: WhoIsWhoTeam): WhoIsWhoTeam => team === 'BLUE' ? 'RED' : 'BLUE';
const tone = { BLUE: { text: 'text-aqua', border: 'border-aqua/45', bg: 'bg-aqua/[.06]', ring: 'ring-aqua/20' }, RED: { text: 'text-berry', border: 'border-berry/45', bg: 'bg-berry/[.06]', ring: 'ring-berry/20' } } as const;

interface TeamBoardProps {
  team: WhoIsWhoTeam; cards: WhoIsWhoPokemonCard[]; players: RoomMemberView[]; active: boolean; own: boolean;
  canManage: boolean; discardedIds: string[]; selfId: string; onToggle(id: string): void;
}

const PokemonCard = memo(function PokemonCard({ pokemon, discarded, interactive, team, onToggle }: { pokemon: WhoIsWhoPokemonCard; discarded: boolean; interactive: boolean; team: WhoIsWhoTeam; onToggle(): void }) {
  return <button type="button" data-pokemon-id={pokemon.id} disabled={!interactive} aria-pressed={discarded} aria-label={`${discarded ? 'Restaurar' : 'Descartar'} ${pokemon.name}`} onClick={onToggle} className={`group relative min-w-0 rounded-xl border px-1.5 pb-2 pt-1 text-center transition-[opacity,filter,border-color,background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 ${discarded ? 'border-transparent bg-ink/[.025] opacity-30 grayscale' : `border-ink/10 bg-surface-raised ${interactive ? `${team === 'BLUE' ? 'hover:border-aqua/70' : 'hover:border-berry/70'} hover:-translate-y-0.5` : ''}`} disabled:cursor-default`}>
    <img src={pokemon.sprite} alt="" draggable={false} className={`mx-auto aspect-square w-full max-w-20 object-contain [image-rendering:pixelated] ${discarded ? 'brightness-50' : ''}`} />
    <strong className="block truncate text-[.7rem] leading-tight sm:text-xs" title={pokemon.name}>{pokemon.name}</strong>
    {discarded && <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true"><EyeOff className="text-ink/65" size={22} /></span>}
  </button>;
});

function SharedTeamCursors({ boardRef, selfId, members }: { boardRef: React.RefObject<HTMLDivElement | null>; selfId: string; members: Map<string, RoomMemberView> }) {
  const [cursors, setCursors] = useState<Record<string, WhoIsWhoCursorEvent>>({}); const [, redraw] = useState(0);
  useEffect(() => subscribeWhoIsWhoCursors((message) => {
    if (message.type === 'RESET') { setCursors({}); return; }
    if (message.type === 'CLEAR') { setCursors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== message.playerId))); return; }
    if (message.cursor.playerId !== selfId) setCursors((current) => ({ ...current, [message.cursor.playerId]: message.cursor }));
  }), [selfId]);
  useEffect(() => { const resize = () => redraw((value) => value + 1); window.addEventListener('resize', resize); const timer = window.setInterval(() => { const cutoff = Date.now() - 4_000; setCursors((current) => Object.fromEntries(Object.entries(current).filter(([, cursor]) => cursor.updatedAt >= cutoff))); }, 1_000); return () => { window.removeEventListener('resize', resize); window.clearInterval(timer); }; }, []);
  const rect = boardRef.current?.getBoundingClientRect();
  return <div className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden="true">{rect && Object.values(cursors).map((cursor) => { const cardElement = cursor.pokemonId ? Array.from(boardRef.current?.querySelectorAll<HTMLElement>('[data-pokemon-id]') ?? []).find((element) => element.dataset.pokemonId === cursor.pokemonId) : undefined; const cardRect = cardElement?.getBoundingClientRect(); const position = projectBoardCursor(cursor, rect.width, rect.height, 8, cardRect ? { left: cardRect.left - rect.left, top: cardRect.top - rect.top, width: cardRect.width, height: cardRect.height } : undefined); const name = members.get(cursor.playerId)?.displayName ?? 'Compañero'; return <span key={cursor.playerId} className="absolute transition-[left,top,opacity] duration-75 ease-out" style={{ left: position.left, top: position.top }}><MousePointer2 className="fill-electric text-night drop-shadow" size={21} /><small className={`absolute max-w-32 truncate rounded-md bg-night px-1.5 py-0.5 text-[10px] font-black text-white shadow ${position.labelBelow ? 'top-5' : 'bottom-5'} ${position.labelLeft ? 'right-1' : 'left-3'}`}>{name}</small></span>; })}</div>;
}

const TeamBoard = memo(function TeamBoard({ team, cards, players, active, own, canManage, discardedIds, selfId, onToggle }: TeamBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null); const frameRef = useRef<number | null>(null); const lastSentRef = useRef(0); const pendingRef = useRef<{ x: number; y: number } | null>(null); const leaveTimerRef = useRef<number | null>(null); const discarded = useMemo(() => new Set(discardedIds), [discardedIds]); const memberMap = useMemo(() => new Map(players.map((member) => [member.id, member])), [players]);
  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current); if (own) clearWhoIsWhoCursor(); }, [own]);
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!own || !canManage || !boardRef.current) return; if (leaveTimerRef.current !== null) { window.clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    const position = normalizeBoardPointer(event.clientX, event.clientY, boardRef.current.getBoundingClientRect()); if (!position) return;
    const cardElement = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pokemon-id]') : null; const cardRect = cardElement?.getBoundingClientRect();
    pendingRef.current = cardElement?.dataset.pokemonId && cardRect && cardRect.width > 0 && cardRect.height > 0 ? { ...position, pokemonId: cardElement.dataset.pokemonId, cardX: Math.min(1, Math.max(0, (event.clientX - cardRect.left) / cardRect.width)), cardY: Math.min(1, Math.max(0, (event.clientY - cardRect.top) / cardRect.height)) } : position;
    if (frameRef.current !== null) return; frameRef.current = requestAnimationFrame((now) => { frameRef.current = null; if (!pendingRef.current || now - lastSentRef.current < 40) return; lastSentRef.current = now; sendWhoIsWhoCursor(pendingRef.current); });
  };
  const pointerLeave = () => { if (!own) return; leaveTimerRef.current = window.setTimeout(clearWhoIsWhoCursor, 500); };
  return <section className={`min-w-0 rounded-2xl border bg-surface p-2.5 transition-[border-color,box-shadow] sm:p-3 ${active ? `${tone[team].border} ring-4 ${tone[team].ring}` : 'border-ink/10'}`}>
    <header className="mb-2.5 flex flex-wrap items-center gap-2"><Flag className={tone[team].text} size={18} /><h2 className={`font-display text-lg ${tone[team].text}`}>{teamName[team]}</h2>{active && <span className={`rounded-full px-2 py-0.5 text-[.65rem] font-black ${tone[team].bg} ${tone[team].text}`}>TURNO</span>}<span className="ml-auto text-xs font-extrabold text-ink/55">{players.length} {players.length === 1 ? 'jugador' : 'jugadores'}</span></header>
    <div className="mb-3 flex min-h-7 flex-wrap gap-x-3 gap-y-1">{players.map((member) => <span key={member.id} className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold"><Avatar name={member.displayName} avatar={member.avatar} size="xs" /><span className="max-w-28 truncate">{member.displayName}</span></span>)}</div>
    <div ref={boardRef} onPointerMove={pointerMove} onPointerLeave={pointerLeave} className="relative overflow-visible"><div className="grid grid-cols-[repeat(auto-fit,minmax(4.6rem,1fr))] gap-1.5 sm:grid-cols-[repeat(auto-fit,minmax(5rem,1fr))]">{cards.map((pokemon) => <PokemonCard key={pokemon.id} pokemon={pokemon} team={team} discarded={own && discarded.has(pokemon.id)} interactive={own && canManage} onToggle={() => onToggle(pokemon.id)} />)}</div>{own && <SharedTeamCursors boardRef={boardRef} selfId={selfId} members={memberMap} />}</div>
  </section>;
});

function SecretPanel({ secret, team, canGuess, canEndTurn, busy, onGuess, onEndTurn }: { secret: WhoIsWhoPokemonCard | null; team: WhoIsWhoTeam | null; canGuess: boolean; canEndTurn: boolean; busy: boolean; onGuess(): void; onEndTurn(): void }) {
  return <aside className={`mx-auto w-full max-w-sm self-start rounded-2xl border bg-surface p-3 text-center lg:sticky lg:top-3 lg:max-w-none ${team ? tone[team].border : 'border-ink/10'}`}><span className="text-xs font-black text-ink/55">TU POKÉMON</span>{secret ? <><img src={secret.sprite} alt="" className="mx-auto my-2 aspect-square w-36 object-contain [image-rendering:pixelated] lg:w-full lg:max-w-44" /><h2 className="truncate font-display text-xl" title={secret.name}>{secret.name}</h2><p className="text-sm font-extrabold text-ink/55">N.º {secret.nationalDexNumber}</p><span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[.65rem] font-black ${team ? `${tone[team].bg} ${tone[team].text}` : 'bg-ink/5'}`}>SECRETO</span></> : <div className="grid min-h-44 place-items-center"><span className="font-display text-6xl text-ink/25">?</span></div>}
    <div className="mt-4 grid gap-2"><button type="button" className="btn-primary !min-h-11 !px-3" disabled={!canGuess || busy} onClick={onGuess}><Target size={17} /> Adivinar Pokémon</button>{canEndTurn && <button type="button" className="btn-ghost !min-h-10 !px-3 text-sm" disabled={busy} onClick={onEndTurn}>Terminar turno</button>}</div></aside>;
}

function GuessDialog({ open, cards, busy, onClose, onConfirm }: { open: boolean; cards: WhoIsWhoPokemonCard[]; busy: boolean; onClose(): void; onConfirm(id: string): Promise<void> }) {
  const dialogRef = useRef<HTMLDialogElement>(null); const [query, setQuery] = useState(''); const [selectedId, setSelectedId] = useState<string | null>(null); const results = useMemo(() => searchPokemonOptions(cards, query, 24), [cards, query]);
  useEffect(() => { const dialog = dialogRef.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); if (!open) { setQuery(''); setSelectedId(null); } }, [open]);
  const selected = cards.find(({ id }) => id === selectedId);
  return <dialog ref={dialogRef} className="modal-dialog" aria-labelledby="guess-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="p-4 sm:p-5"><header className="flex items-center justify-between gap-3"><div><h2 id="guess-title" className="font-display text-2xl">Adivinar Pokémon</h2><p className="text-sm font-bold text-ink/60">Elige un candidato y confirma tu intento.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X /></button></header>
    <label className="relative mt-4 block"><span className="sr-only">Buscar candidato</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" size={18} /><input autoFocus className="field !pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar Pokémon…" /></label>
    <div className="mt-3 grid max-h-[45dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">{results.map((pokemon) => <button type="button" key={pokemon.id} aria-pressed={selectedId === pokemon.id} onClick={() => setSelectedId(pokemon.id)} className={`relative rounded-xl border p-2 text-center ${selectedId === pokemon.id ? 'border-electric bg-electric/10' : 'border-ink/10 bg-surface-raised hover:border-aqua/60'}`}><img src={pokemon.sprite} alt="" className="mx-auto h-20 w-20 object-contain" /><strong className="block truncate text-sm">{pokemon.name}</strong>{selectedId === pokemon.id && <Check className="absolute right-2 top-2 text-electric" size={17} />}</button>)}</div>
    <button type="button" className="btn-primary mt-4 w-full" disabled={!selected || busy} onClick={() => selected && void onConfirm(selected.id).catch(() => undefined)}>Confirmar {selected?.name ?? 'intento'}</button></div></dialog>;
}

export function WhoIsWhoPokemonGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as WhoIsWhoPublicState; const player = room.gamePlayerState as WhoIsWhoPlayerState; const offset = useServerOffset(room.serverNow); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [guessing, setGuessing] = useState(false); const memberMap = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const teamMembers = (team: WhoIsWhoTeam) => game.teams[team].playerIds.map((id) => memberMap.get(id)).filter((member): member is RoomMemberView => Boolean(member));
  const send = async (action: unknown) => { setBusy(true); setError(''); try { await onAction(action); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Acción rechazada.'); throw caught; } finally { setBusy(false); } };
  const toggle = (pokemonId: string) => { setError(''); void onAction({ type: 'TOGGLE_DISCARD', pokemonId }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'No se pudo actualizar el tablero.')); };
  const ownTeam = player.team; const mobileTeams: WhoIsWhoTeam[] = ownTeam ? [ownTeam, otherTeam(ownTeam)] : ['BLUE', 'RED'];
  return <section className="mx-auto w-full max-w-[120rem] px-2 py-3 sm:px-4"><header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-surface px-3 py-2.5 sm:px-4"><div><p className="text-xs font-extrabold text-ink/55">Ronda {game.roundNumber} / {game.totalRounds} · Turno {game.turnNumber}</p><h1 className="font-display text-xl sm:text-2xl">Quién es Quién — Pokémon</h1></div><div className="flex items-center gap-2"><span className={`hidden rounded-full px-2.5 py-1 text-xs font-black sm:inline-flex ${tone[game.currentTeam].bg} ${tone[game.currentTeam].text}`}>{teamName[game.currentTeam]}</span><ServerTimer deadline={game.roundEndsAt} serverOffset={offset} label="Turno" /></div></header>
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,42fr)_minmax(10rem,16fr)_minmax(0,42fr)] lg:items-start">{mobileTeams.map((team, index) => <div key={team} className={`${index === 0 ? 'order-2' : 'order-3'} min-w-0 ${team === 'BLUE' ? 'lg:col-start-1' : 'lg:col-start-3'} lg:row-start-1`}><TeamBoard team={team} cards={game.board} players={teamMembers(team)} active={game.currentTeam === team} own={player.team === team} canManage={player.canManageBoard} discardedIds={player.team === team ? player.discardedPokemonIds : []} selfId={selfId} onToggle={toggle} /></div>)}<div className="order-1 min-w-0 lg:col-start-2 lg:row-start-1"><SecretPanel secret={player.ownSecret} team={player.team} canGuess={player.canGuess} canEndTurn={player.canAct} busy={busy} onGuess={() => setGuessing(true)} onEndTurn={() => void send({ type: 'END_TURN' }).catch(() => undefined)} /></div></div>
    {player.lastGuess?.correct === false && <p className="mx-auto mt-3 w-fit rounded-full bg-berry/10 px-3 py-1.5 text-sm font-extrabold text-berry">Intento incorrecto · turno terminado</p>}{error && <p className="status-error mx-auto mt-3 w-fit" role="alert">{error}</p>}
    <GuessDialog open={guessing} cards={game.board} busy={busy} onClose={() => setGuessing(false)} onConfirm={async (pokemonId) => { await send({ type: 'GUESS_POKEMON', pokemonId }); setGuessing(false); }} />
  </section>;
}
