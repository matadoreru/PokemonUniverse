import type { RoomMemberView, RoomView, ShinyOption, ShinyOptionId, ShinyVotePublicState } from '@pokemon-universe/shared';
import { Check, Clock3, Eye, Sparkles, Trophy, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const imageSource = (source: string) => source.startsWith('/api/') ? `${API_ORIGIN}${source}` : source;

function useCountdown(deadline: number | null, serverOffset: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  return deadline ? Math.max(0, deadline - (now + serverOffset)) : 0;
}

function PlayerPill({ member, result }: { member: RoomMemberView; result?: 'correct' | 'wrong' | undefined }) {
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-extrabold ${result === 'correct' ? 'border-leaf/40 bg-leaf/15 text-leaf' : result === 'wrong' ? 'border-berry/30 bg-berry/10 text-berry' : 'border-ink/10 bg-surface-raised/90'}`}>
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-aqua/70 to-electric/80 text-[10px] text-night">{member.displayName.slice(0, 1).toUpperCase()}</span>
    <span className="truncate">{member.displayName}</span>
    {result === 'correct' && <span>✓ +1</span>}{result === 'wrong' && <span>✗</span>}
  </span>;
}

function OptionCard({ option, voters, selected, disabled, reveal, correct, onSelect }: {
  option: ShinyOption;
  voters: RoomMemberView[];
  selected: boolean;
  disabled: boolean;
  reveal: boolean;
  correct: boolean;
  onSelect(): void;
}) {
  const tone = reveal
    ? correct ? 'border-leaf bg-leaf/10 shadow-[0_0_0_5px_rgba(98,201,149,.16)]' : 'border-ink/5 bg-surface/60 opacity-55 grayscale'
    : selected ? 'border-berry bg-berry/10 shadow-[0_0_0_4px_rgba(255,92,130,.12)]' : 'border-ink/10 bg-surface hover:border-aqua';
  return <button type="button" disabled={disabled} aria-pressed={selected} onClick={onSelect} className={`relative flex min-h-[300px] flex-col overflow-hidden rounded-[1.75rem] border-2 p-3 text-left transition ${tone} ${disabled ? 'cursor-default' : 'hover:-translate-y-1'}`}>
    <div className="flex w-full items-center justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl border-2 font-display text-xl font-bold ${correct && reveal ? 'border-leaf bg-leaf text-night' : 'border-electric bg-electric text-night'}`}>{option.id}</span>{selected && !reveal && <span className="chip bg-berry/15 text-berry"><Check size={15} /> Tu elección</span>}{correct && reveal && <span className="chip bg-leaf/20 text-leaf">✨ Shiny correcto</span>}</div>
    <img className="mx-auto h-40 w-40 object-contain [image-rendering:auto] sm:h-44 sm:w-44" src={imageSource(option.sprite)} alt={`Candidato ${option.id}: ${option.pokemonName}`} />
    <strong className="w-full truncate text-center font-display text-lg">{option.pokemonName}</strong>
    <div className="mt-3 flex max-h-28 min-h-9 w-full flex-wrap content-start gap-1.5 overflow-y-auto rounded-xl bg-ink/[.035] p-2">
      {voters.length > 0 ? voters.map((member) => <PlayerPill key={member.id} member={member} result={reveal ? (correct ? 'correct' : 'wrong') : undefined} />) : <span className="m-auto text-sm font-bold text-ink/30">—</span>}
    </div>
  </button>;
}

export function ShinyVoteGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as ShinyVotePublicState;
  const [draft, setDraft] = useState<ShinyOptionId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const serverOffset = useMemo(() => room.serverNow - Date.now(), [room.serverNow]);
  const remainingMs = useCountdown(game.roundEndsAt, serverOffset);
  const totalMs = (room.selectedGameConfig as { roundSeconds: number }).roundSeconds * 1_000;
  const remaining = Math.ceil(remainingMs / 1_000);
  const progress = Math.min(100, remainingMs / totalMs * 100);
  const active = game.phase === 'ROUND_ACTIVE';
  const reveal = game.phase === 'ROUND_RESULTS';
  const ownVote = game.votes[selfId];
  const participant = game.playerIds.includes(selfId);
  const canVote = active && participant && !ownVote;
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const ranking = [...game.playerIds].sort((a, b) => (game.scores[b] ?? 0) - (game.scores[a] ?? 0) || (members.get(a)?.displayName ?? '').localeCompare(members.get(b)?.displayName ?? ''));

  useEffect(() => { setDraft(null); setError(''); }, [game.roundNumber]);

  async function confirmVote() {
    if (!draft || !canVote || submitting) return;
    setSubmitting(true); setError('');
    try { await onAction({ type: 'VOTE', optionId: draft }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'El servidor rechazó el voto.'); }
    finally { setSubmitting(false); }
  }

  return <section className="mx-auto max-w-7xl px-4 py-5 md:px-8">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><span className="label">Ronda {game.roundNumber} de {game.totalRounds}</span><h1 className="font-display text-3xl font-bold sm:text-4xl">¿Cuál es el shiny verdadero?</h1></div>
      <span className="chip text-base"><Users size={17} /> {Object.keys(game.votes).length}/{game.playerIds.length} votos</span>
    </div>
    {active && <div className="mb-5"><div className="mb-1.5 flex items-center justify-between text-sm font-extrabold"><span className="flex items-center gap-1.5"><Clock3 size={17} /> Votación pública</span><span className={remaining <= 5 ? 'timer-pulse text-xl' : ''}>{remaining}s</span></div><div className="h-3 overflow-hidden rounded-full border-2 border-ink/20 bg-night"><div className={`h-full transition-[width] duration-100 ${remaining <= 5 ? 'bg-berry' : 'bg-aqua'}`} style={{ width: `${progress}%` }} /></div></div>}
    {reveal && <div className="reveal-pop mb-5 rounded-2xl border-2 border-leaf bg-leaf/15 p-4 text-center"><Sparkles className="mr-2 inline text-leaf" /><strong className="font-display text-2xl">SHINY CORRECTO: {game.correctOptionId}</strong><p className="mt-1 font-bold text-ink/55">Siguiente ronda en unos 3 segundos…</p></div>}
    <div className="grid gap-5 xl:grid-cols-[1fr_290px]">
      <div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{game.options.map((option) => {
          const voters = Object.entries(game.votes).filter(([, vote]) => vote.optionId === option.id).map(([playerId]) => members.get(playerId)).filter((member): member is RoomMemberView => Boolean(member));
          return <OptionCard key={option.id} option={option} voters={voters} selected={(ownVote?.optionId ?? draft) === option.id} disabled={!canVote || submitting} reveal={reveal} correct={game.correctOptionId === option.id} onSelect={() => setDraft(option.id)} />;
        })}</div>
        {canVote && <div className="sticky bottom-3 z-10 mx-auto mt-4 flex max-w-lg flex-col items-center gap-2 rounded-2xl border-2 border-ink/10 bg-surface/95 p-3 shadow-card backdrop-blur sm:flex-row"><p className="flex-1 text-center font-bold sm:text-left">{draft ? <>Has elegido <strong className="text-berry">{draft}</strong>. Al confirmar no podrás cambiar.</> : 'Selecciona una tarjeta para preparar tu voto.'}</p><button className="btn-primary whitespace-nowrap" disabled={!draft || submitting} onClick={() => void confirmVote()}>{submitting ? 'Confirmando…' : `Confirmar voto${draft ? ` ${draft}` : ''}`}</button></div>}
        {ownVote && active && <div className="mt-4 rounded-2xl border-2 border-leaf/40 bg-leaf/10 p-3 text-center font-extrabold text-leaf"><Check className="mr-2 inline" size={20} />Tu voto por {ownVote.optionId} está bloqueado en el servidor.</div>}
        {!participant && active && <div className="mt-4 rounded-2xl bg-aqua/10 p-3 text-center font-bold"><Eye className="mr-2 inline" size={20} />Estás viendo la votación en directo como espectador.</div>}
        {error && <p className="mt-3 rounded-xl bg-berry/10 p-3 text-center font-bold text-berry">{error}</p>}
      </div>
      <aside className="space-y-4">
        <div className="card !p-4"><h2 className="mb-3 font-display text-xl font-bold">{reveal ? 'Resultados de ronda' : 'Pendientes'}</h2>{reveal ? <div className="space-y-2">{game.playerIds.map((id) => { const member = members.get(id); const vote = game.votes[id]; const correct = vote?.optionId === game.correctOptionId; return <div key={id} className="flex items-center gap-2 rounded-xl bg-ink/[.04] px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-extrabold">{member?.displayName ?? id}</span><span className="font-bold text-ink/45">→ {vote?.optionId ?? 'sin voto'}</span><strong className={correct ? 'text-leaf' : 'text-berry'}>{correct ? '✓ +1' : '✗'}</strong></div>; })}</div> : <div className="flex flex-wrap gap-2">{game.pendingPlayerIds.length > 0 ? game.pendingPlayerIds.map((id) => { const member = members.get(id); return member ? <PlayerPill key={id} member={member} /> : null; }) : <p className="font-extrabold text-leaf">✓ Todos han votado</p>}</div>}</div>
        <div className="card !p-4"><h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold"><Trophy size={19} className="text-berry" /> Clasificación</h2><div className="space-y-2">{ranking.map((id, index) => <div key={id} className="flex items-center gap-2 rounded-xl bg-ink/[.04] px-3 py-2"><span className="w-5 font-display font-bold">{index + 1}</span><span className="min-w-0 flex-1 truncate font-extrabold">{members.get(id)?.displayName ?? id}</span><strong className="text-berry">{game.scores[id] ?? 0}</strong></div>)}</div></div>
      </aside>
    </div>
  </section>;
}
