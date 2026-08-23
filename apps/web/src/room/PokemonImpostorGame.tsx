import type { PokemonImpostorPlayerState, PokemonImpostorPublicState, RoomMemberView, RoomView } from '@pokemon-universe/shared';
import { Check, Clock3, Eye, MessageSquareText, Send, ShieldCheck, Skull, Users, Vote } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function useCountdown(deadline: number | null, serverOffset: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  return deadline ? Math.max(0, deadline - (now + serverOffset)) : 0;
}

function memberName(members: Map<string, RoomMemberView>, id: string): string {
  return members.get(id)?.displayName ?? id;
}

function RoleCard({ player, game }: { player: PokemonImpostorPlayerState; game: PokemonImpostorPublicState }) {
  if (!player.role) return <div className="card text-center"><Eye className="mx-auto text-aqua" size={42} /><h2 className="mt-3 font-display text-2xl">Espectador</h2><p className="font-bold text-ink/50">Observas la partida en directo.</p></div>;
  const impostor = player.role === 'IMPOSTOR';
  return <div className={`card text-center ${impostor ? '!border-berry/45 bg-berry/10' : '!border-aqua/45 bg-aqua/10'}`}>
    {impostor ? <Skull className="mx-auto text-berry" size={42} /> : <ShieldCheck className="mx-auto text-aqua" size={42} />}
    <span className="label mt-3">Tu rol</span><h2 className={`font-display text-2xl font-bold ${impostor ? 'text-berry' : 'text-aqua'}`}>{impostor ? 'IMPOSTOR' : 'INOCENTE'}</h2>
    {player.secretPokemon ? <div className="mt-4 rounded-2xl bg-surface/70 p-3"><img className="mx-auto h-28 w-28 object-contain" src={player.secretPokemon.sprite} alt="" /><strong className="font-display text-xl uppercase">{player.secretPokemon.name}</strong></div> : <p className="mt-4 font-bold text-ink/55">No conoces el Pokémon. Intenta disimular.</p>}
    {!player.alive && game.phase !== 'GAME_RESULTS' && <p className="mt-4 rounded-xl bg-ink/5 p-2 font-extrabold">Eliminado · ahora eres espectador</p>}
  </div>;
}

export function PokemonImpostorGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokemonImpostorPublicState;
  const player = room.gamePlayerState as PokemonImpostorPlayerState;
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const [clueText, setClueText] = useState('');
  const [voteDraft, setVoteDraft] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const serverOffset = useMemo(() => room.serverNow - Date.now(), [room.serverNow]);
  const deadline = game.roundEndsAt ?? game.nextTransitionAt;
  const remaining = Math.ceil(useCountdown(deadline, serverOffset) / 1_000);
  const clueLength = [...clueText.normalize('NFC')].length;

  useEffect(() => { setClueText(''); setVoteDraft(null); setError(''); }, [game.phase, game.roundNumber, game.votingRound]);

  async function submitClue() {
    if (!player.canSubmitClue || !clueText.trim() || clueLength > 25 || submitting) return;
    setSubmitting(true); setError('');
    try { await onAction({ type: 'SUBMIT_CLUE', text: clueText }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo enviar la pista.'); }
    finally { setSubmitting(false); }
  }
  async function submitVote() {
    if (!player.canVote || !voteDraft || submitting) return;
    setSubmitting(true); setError('');
    try { await onAction({ type: 'VOTE', targetId: voteDraft }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo enviar el voto.'); }
    finally { setSubmitting(false); }
  }

  const phaseTitle = game.phase === 'ROLE_REVEAL' ? 'Descubre tu rol'
    : game.phase === 'CLUE_PHASE' ? 'Escribe una pista'
      : game.phase === 'VOTING' ? (game.votingRound > 1 ? 'Votación de desempate' : '¿Quién es el impostor?')
        : game.phase === 'VOTE_RESULTS' ? 'Resultado de la votación' : 'Jugador eliminado';

  return <section className="mx-auto max-w-7xl px-4 py-5 md:px-8">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><span className="label">Ronda {Math.max(1, game.roundNumber)}</span><h1 className="font-display text-3xl font-bold sm:text-4xl">{phaseTitle}</h1></div>{deadline && <span className={`chip text-lg ${remaining <= 5 ? 'timer-pulse text-berry' : ''}`}><Clock3 size={18} /> {remaining}s</span>}</div>
    {game.phase === 'ROLE_REVEAL' && <div className="mb-5 rounded-2xl border-2 border-electric/40 bg-electric/10 p-3 text-center font-bold">Esta información es privada. La fase de pistas comenzará automáticamente.</div>}
    {game.phase === 'VOTE_RESULTS' && game.lastVoteResult && <div className={`mb-5 rounded-2xl border-2 p-4 text-center ${game.lastVoteResult.kind === 'TIE' ? 'border-electric bg-electric/15' : 'border-aqua bg-aqua/15'}`}><strong className="font-display text-2xl">{game.lastVoteResult.kind === 'TIE' ? '⚔️ Empate: habrá una nueva votación' : `${memberName(members, game.lastVoteResult.eliminatedId!)} recibió más votos`}</strong><div className="mt-3 flex flex-wrap justify-center gap-2">{Object.entries(game.lastVoteResult.tallies).filter(([, count]) => count > 0).map(([id, count]) => <span key={id} className="chip">{memberName(members, id)} · {count} {count === 1 ? 'voto' : 'votos'}</span>)}</div><div className="mx-auto mt-3 grid max-w-2xl gap-2 sm:grid-cols-2">{game.aliveIds.map((voterId) => { const vote = game.lastVoteResult!.votes[voterId]; return <div key={voterId} className="rounded-xl bg-surface/70 px-3 py-2 text-sm font-bold">{memberName(members, voterId)} → {vote ? memberName(members, vote.targetId) : 'Sin voto'}</div>; })}</div></div>}
    {game.phase === 'ELIMINATION' && game.eliminationReveal && <div className="reveal-pop mb-5 rounded-2xl border-2 border-berry bg-berry/10 p-5 text-center"><Skull className="mx-auto text-berry" size={44} /><strong className="mt-2 block font-display text-3xl">{memberName(members, game.eliminationReveal.playerId)}</strong><p className="font-display text-xl">era {game.eliminationReveal.role === 'IMPOSTOR' ? 'IMPOSTOR' : 'INOCENTE'}</p>{game.winnerTeam && <p className="mt-2 font-extrabold text-berry">Partida terminada: ganan {game.winnerTeam === 'IMPOSTORS' ? 'los impostores' : 'los inocentes'}.</p>}</div>}
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]"><aside><RoleCard player={player} game={game} /></aside><div className="space-y-5">
      <div className="card !p-4"><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-display text-xl"><Users size={20} className="text-aqua" /> Jugadores y pistas</h2><span className="chip">{game.aliveIds.length} vivos</span></div><div className="grid gap-3 md:grid-cols-2">{game.playerIds.map((id) => <article key={id} className={`rounded-2xl border-2 p-3 ${game.eliminatedIds.includes(id) ? 'border-ink/5 bg-ink/[.03] opacity-65' : 'border-ink/10 bg-surface-raised'}`}><div className="flex items-center justify-between"><strong className="font-display text-lg">{memberName(members, id)}</strong>{game.eliminatedIds.includes(id) ? <span className="chip text-xs">Eliminado</span> : game.phase === 'VOTING' && <span className={`text-sm font-extrabold ${game.voteCompletedIds.includes(id) ? 'text-leaf' : 'text-ink/35'}`}>{game.voteCompletedIds.includes(id) ? '✓ Votó' : '…'}</span>}</div><div className="mt-2 space-y-1.5">{Array.from({ length: game.roundNumber }, (_, index) => index + 1).map((round) => { const entry = game.clues[round]?.[id]; const currentWaiting = round === game.roundNumber && game.phase === 'CLUE_PHASE' && !entry; return <p key={round} className="rounded-lg bg-ink/[.035] px-2 py-1.5 text-sm"><span className="mr-2 font-extrabold text-ink/40">R{round}</span>{entry ? `“${entry.text}”` : currentWaiting ? <span className="text-ink/35">Escribiendo…</span> : <span className="text-ink/35">Sin respuesta</span>}</p>; })}</div></article>)}</div></div>
      {game.phase === 'CLUE_PHASE' && player.canSubmitClue && <div className="card !p-4"><label className="label flex items-center gap-2"><MessageSquareText size={17} /> Tu pista</label><div className="flex flex-col gap-3 sm:flex-row"><input className="field flex-1" maxLength={50} value={clueText} onChange={(event) => setClueText(event.target.value)} placeholder="Escribe algo relacionado…" onKeyDown={(event) => { if (event.key === 'Enter') void submitClue(); }} /><button className="btn-primary justify-center" disabled={!clueText.trim() || clueLength > 25 || submitting} onClick={() => void submitClue()}><Send size={18} /> Enviar pista</button></div><p className={`mt-2 text-right text-sm font-extrabold ${clueLength > 25 ? 'text-berry' : 'text-ink/40'}`}>{clueLength}/25 caracteres</p></div>}
      {game.phase === 'CLUE_PHASE' && player.ownClue && <div className="rounded-2xl border-2 border-leaf/40 bg-leaf/10 p-3 text-center font-extrabold text-leaf"><Check className="mr-2 inline" />Tu pista está enviada y bloqueada.</div>}
      {game.phase === 'VOTING' && <div className="card !p-4"><h2 className="mb-3 flex items-center gap-2 font-display text-xl"><Vote className="text-berry" /> {game.votingRound > 1 ? 'Vota entre los jugadores empatados' : 'Elige a quien quieres expulsar'}</h2><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{game.voteCandidateIds.map((id) => { const self = id === selfId; return <button type="button" key={id} disabled={!player.canVote || self || submitting} aria-pressed={voteDraft === id} onClick={() => setVoteDraft(id)} className={`rounded-2xl border-2 p-3 text-left font-display text-lg transition ${voteDraft === id ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised'} ${self ? 'cursor-not-allowed opacity-35' : ''}`}>{memberName(members, id)}{self && <span className="ml-2 text-xs">(tú)</span>}</button>; })}</div>{player.canVote ? <button className="btn-primary mx-auto mt-4" disabled={!voteDraft || submitting} onClick={() => void submitVote()}><Vote size={18} /> Confirmar voto</button> : player.ownVote ? <p className="mt-4 text-center font-extrabold text-leaf"><Check className="mr-2 inline" />Tu voto está bloqueado. El objetivo permanece secreto.</p> : null}</div>}
      {error && <p className="rounded-xl bg-berry/10 p-3 text-center font-bold text-berry">{error}</p>}
    </div></div>
  </section>;
}
