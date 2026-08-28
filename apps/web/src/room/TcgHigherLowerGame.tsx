import type { RoomView, TcgHigherLowerChoice, TcgHigherLowerPlayerState, TcgHigherLowerPublicState } from '@pokemon-universe/shared';
import { ArrowDown, ArrowUp, Check, Clock3, Equal, Flame, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';

export function formatTcgPrice(amount: string, currency: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
}
const choices: Array<{ id: TcgHigherLowerChoice; label: string; icon: typeof ArrowUp; tone: string }> = [
  { id: 'LOWER', label: 'MENOS', icon: ArrowDown, tone: 'border-berry hover:bg-berry/10' },
  { id: 'SAME', label: 'IGUAL', icon: Equal, tone: 'border-electric hover:bg-electric/10' },
  { id: 'HIGHER', label: 'MÁS', icon: ArrowUp, tone: 'border-leaf hover:bg-leaf/10' },
];
const labelFor = (choice: TcgHigherLowerChoice | null) => choices.find(({ id }) => id === choice)?.label ?? 'Sin respuesta';

function Card({ card, currency, hidden, reveal }: { card: TcgHigherLowerPublicState['previousCard']; currency: string; hidden: boolean; reveal: boolean }) {
  return <article className={`min-w-0 text-center ${reveal ? 'reveal-pop' : ''}`}><div className="mx-auto aspect-[2.5/3.5] w-full max-w-[18rem] overflow-hidden rounded-2xl bg-ink/[.04] shadow-card"><img src={card.imageUrl} alt={`Carta ${card.name}`} className="h-full w-full object-contain" /></div><h2 className="mt-3 truncate font-display text-2xl" title={card.name}>{card.name}</h2><p className="truncate text-sm font-bold text-ink/60" title={card.setName}>{card.setName} · {card.localId}</p>{card.rarity && <p className="truncate text-xs font-bold text-ink/45">{card.rarity}</p>}<strong className={`mt-2 block font-display text-2xl ${hidden ? 'text-ink/55' : 'text-aqua'}`}>{hidden ? '¿? ' + new Intl.NumberFormat('es-ES', { style: 'currency', currency }).formatToParts(0).find((part) => part.type === 'currency')?.value : formatTcgPrice(card.price!, currency)}</strong></article>;
}

export function TcgHigherLowerGame({ room, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as TcgHigherLowerPublicState; const player = room.gamePlayerState as TcgHigherLowerPlayerState; const [pending, setPending] = useState(false); const [error, setError] = useState(''); const offset = useServerOffset(room.serverNow); const remaining = Math.ceil(useRemainingMs(game.roundEndsAt ?? game.nextTransitionAt, offset) / 1000); const reveal = game.phase === 'ROUND_RESULTS'; const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  async function answer(choice: TcgHigherLowerChoice) { setPending(true); setError(''); try { await onAction({ type: 'ANSWER', choice }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Respuesta rechazada'); } finally { setPending(false); } }
  return <section className="mx-auto max-w-7xl px-3 py-4 sm:px-5 sm:py-6"><header className="mb-4 flex items-end justify-between gap-3"><div><span className="label">Higher or Lower TCG</span><h1 className="font-display text-2xl sm:text-3xl">Ronda {game.roundNumber} de {game.totalRounds}</h1></div><span className="chip text-lg"><Clock3 size={18} /> {remaining}s</span></header>
    {reveal && <div className="reveal-pop mb-4 rounded-2xl border border-electric bg-electric/10 p-3 text-center"><strong className="font-display text-xl">Respuesta correcta: {labelFor(game.lastRound?.correctAnswer ?? null)}</strong></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]"><main><div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"><Card card={game.previousCard} currency={game.currency} hidden={false} reveal={false} /><strong className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-night font-display text-white">VS</strong><Card card={game.currentCard} currency={game.currency} hidden={game.currentCard.price === null} reveal={reveal} /></div>
      {game.phase === 'ROUND_ACTIVE' && <div className="mx-auto mt-5 grid max-w-3xl gap-3 sm:grid-cols-3">{choices.map(({ id, label, icon: Icon, tone }) => <button key={id} disabled={pending || !player.canAnswer} onClick={() => void answer(id)} aria-pressed={player.answer?.choice === id} className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 bg-surface px-4 font-display text-xl transition ${tone} disabled:cursor-not-allowed disabled:opacity-55 ${player.answer?.choice === id ? 'ring-2 ring-aqua ring-offset-2' : ''}`}><Icon />{label}</button>)}</div>}
      {game.phase === 'ROUND_ACTIVE' && player.answer && <p className="mt-3 text-center font-extrabold text-leaf"><Check className="mr-1 inline" />{labelFor(player.answer.choice)} bloqueado. Esperando al resto…</p>}{error && <p className="mt-3 text-center font-bold text-berry">{error}</p>}
      {reveal && <div className="card mt-5 !p-4"><div className="mb-3 flex flex-wrap justify-center gap-3 font-bold"><span>Anterior: {formatTcgPrice(game.lastRound!.previousPrice, game.currency)}</span><span>Actual: {formatTcgPrice(game.lastRound!.currentPrice, game.currency)}</span></div><div className="grid gap-2 sm:grid-cols-2">{game.playerIds.map((id) => { const outcome = game.lastRound?.outcomes[id]; return <div key={id} className={`rounded-xl p-3 ${outcome?.correct ? 'bg-leaf/10' : 'bg-berry/10'}`}><strong>{members.get(id)?.displayName ?? id}</strong><span className="float-right font-extrabold">{labelFor(outcome?.choice ?? null)} {outcome?.correct ? `✓ +${outcome.awardedPoints}` : '✕'}</span></div>; })}</div></div>}
    </main><aside className="card self-start !p-4"><h2 className="mb-3 flex gap-2 font-display text-xl"><Trophy className="text-electric" /> Clasificación</h2>{[...game.playerIds].sort((a, b) => (game.scores[b] ?? 0) - (game.scores[a] ?? 0)).map((id) => <div key={id} className="mb-2 rounded-xl bg-ink/[.04] p-2"><div className="flex gap-2"><span className="min-w-0 flex-1 truncate font-bold">{members.get(id)?.displayName}</span><strong>{game.scores[id]} pts</strong></div><span className="text-xs font-extrabold text-electric"><Flame className="inline" size={14} /> Racha {game.streaks[id]}</span></div>)}</aside></div>
  </section>;
}

