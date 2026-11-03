import { IMPOSTOR_CLUE_MAX_CODE_POINTS, IMPOSTOR_SKIP_TARGET, type PokemonImpostorPlayerState, type PokemonImpostorPublicState, type RoomMemberView, type RoomView } from '@pokemon-universe/shared/public';
import { Brain, Check, Clock3, Eye, MessageSquareText, Send, ShieldCheck, Skull, Users, Vote } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { CUT_IN_DELAYED_LINE_MS, RevealCutIn } from '../components/RevealCutIn';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useSfxCue } from '../hooks/useSfxCue';
import { useDelayElapsed } from '../hooks/useTimedVisibility';
import { PokemonSelector } from './PokemonSelector';
import { clampImpostorClue, impostorClueLength, impostorCluePhaseTitle, impostorEliminationCutIn, impostorVoteHeadline, impostorVoteTargetLabel } from './pokemon-impostor-texts';

function memberName(members: Map<string, RoomMemberView>, id: string): string {
  return members.get(id)?.displayName ?? id;
}

function RoleCard({ player, game }: { player: PokemonImpostorPlayerState; game: PokemonImpostorPublicState }) {
  if (!player.role) return <div className="card text-center"><Eye className="mx-auto text-aqua" size={42} /><h2 className="mt-3 font-display text-2xl">Espectador</h2><p className="font-bold text-ink/65">Observas la partida en directo.</p></div>;
  const impostor = player.role === 'IMPOSTOR';
  return <div className={`card text-center ${impostor ? '!border-berry/45 bg-berry/10' : '!border-aqua/45 bg-aqua/10'}`}>
    {impostor ? <Skull className="mx-auto text-berry" size={42} /> : <ShieldCheck className="mx-auto text-aqua" size={42} />}
    <span className="label mt-3">Tu rol</span><h2 className={`font-display text-2xl font-bold ${impostor ? 'text-berry' : 'text-aqua'}`}>{impostor ? 'IMPOSTOR' : 'INOCENTE'}</h2>
    {player.secretPokemon ? <div className="mt-4 rounded-2xl bg-surface/70 p-3"><img className="mx-auto h-28 w-28 object-contain" src={player.secretPokemon.sprite} alt="" /><strong className="font-display text-xl uppercase">{player.secretPokemon.name}</strong></div> : <p className="mt-4 font-bold text-ink/70">No conoces el Pokémon. Intenta disimular.</p>}
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
  const [showGuess, setShowGuess] = useState(false);
  const [error, setError] = useState('');
  const serverOffset = useServerOffset(room.serverNow);
  const deadline = game.roundEndsAt ?? game.nextTransitionAt;
  const remaining = Math.ceil(useRemainingMs(deadline, serverOffset) / 1_000);
  const clueLength = impostorClueLength(clueText);
  const generations = (room.selectedGameConfig as { generations: number[] }).generations;
  const { pokemon, loading: poolLoading, error: poolError, retry: retryPool } = usePokemonPool({ generations, enabled: player.canGuessPokemon });
  const orderedPlayers = game.phase === 'CLUE_PHASE'
    ? [...game.clueOrder, ...game.playerIds.filter((id) => !game.clueOrder.includes(id))]
    : game.playerIds;

  const elimination = game.phase === 'ELIMINATION' ? game.eliminationReveal : null;
  const eliminationCutIn = elimination ? impostorEliminationCutIn(elimination, memberName(members, elimination.playerId)) : null;
  useSfxCue('game.eliminate', elimination ? `${game.roundNumber}:${game.votingRound}` : null);
  // El rol de la tarjeta sigue la misma pausa que el cut-in: no está en el DOM hasta pasado 1 s.
  const reducedMotion = usePrefersReducedMotion();
  const eliminationRoleShown = useDelayElapsed(CUT_IN_DELAYED_LINE_MS, elimination ? `${game.roundNumber}:${elimination.playerId}` : 'none', reducedMotion);

  useEffect(() => { setClueText(''); setVoteDraft(null); setError(''); }, [game.phase, game.roundNumber, game.votingRound]);

  async function submitClue() {
    if (!player.canSubmitClue || !clueText.trim() || clueLength > IMPOSTOR_CLUE_MAX_CODE_POINTS || submitting) return;
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
  async function guessPokemon(pokemonId: string) {
    if (!player.canGuessPokemon || submitting) return;
    setSubmitting(true); setError('');
    try { await onAction({ type: 'GUESS_POKEMON', pokemonId }); setShowGuess(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo registrar el intento.'); }
    finally { setSubmitting(false); }
  }

  const phaseTitle = game.phase === 'ROLE_REVEAL' ? 'Descubre tu rol'
    : game.phase === 'CLUE_PHASE' ? impostorCluePhaseTitle(game.currentCluePlayerId ? memberName(members, game.currentCluePlayerId) : null)
      : game.phase === 'VOTING' ? (game.votingRound > 1 ? 'Votación de desempate' : '¿Quién es el impostor?')
        : game.phase === 'VOTE_RESULTS' ? 'Resultado de la votación' : 'Jugador eliminado';

  return <section className="mx-auto max-w-7xl px-4 py-5 md:px-8">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><span className="label">Ronda {Math.max(1, game.roundNumber)}</span><h1 className="font-display text-3xl font-bold sm:text-4xl">{phaseTitle}</h1></div>{deadline && <span className={`chip text-lg tabular-nums ${remaining <= 5 ? 'timer-pulse text-berry' : ''}`}><Clock3 size={18} /> {remaining}s</span>}</div>
    {game.phase === 'ROLE_REVEAL' && <div className="mb-5 rounded-2xl border border-electric/40 bg-electric/10 p-3 text-center font-bold">Esta información es privada. La fase de pistas comenzará automáticamente.</div>}
    {game.phase === 'CLUE_PHASE' && game.clueOrder.length === 0 && <div className="mb-5 rounded-2xl border border-electric/40 bg-electric/10 p-3 text-center font-bold">Nadie puede dar pistas ahora. La votación empezará cuando se acabe el tiempo.</div>}
    {game.phase === 'VOTE_RESULTS' && game.lastVoteResult && <div className={`mb-5 rounded-2xl border p-4 text-center ${game.lastVoteResult.kind === 'ELIMINATION' ? 'border-aqua bg-aqua/15' : 'border-electric bg-electric/15'}`}><strong className="font-display text-2xl">{impostorVoteHeadline(game.lastVoteResult, (id) => memberName(members, id))}</strong><div className="mt-3 flex flex-wrap justify-center gap-2">{Object.entries(game.lastVoteResult.tallies).filter(([, count]) => count > 0).map(([id, count]) => <span key={id} className="chip tabular-nums">{memberName(members, id)} · {count} {count === 1 ? 'voto' : 'votos'}</span>)}{game.lastVoteResult.skipVotes > 0 && <span className="chip tabular-nums">Saltar · {game.lastVoteResult.skipVotes} {game.lastVoteResult.skipVotes === 1 ? 'voto' : 'votos'}</span>}</div><div className="mx-auto mt-3 grid max-w-2xl gap-2 sm:grid-cols-2">{game.aliveIds.map((voterId) => { const vote = game.lastVoteResult!.votes[voterId]; return <div key={voterId} className="rounded-xl bg-surface/70 px-3 py-2 text-sm font-bold">{memberName(members, voterId)} → {vote ? impostorVoteTargetLabel(vote.targetId, (id) => memberName(members, id)) : 'Sin voto'}</div>; })}</div></div>}
    {elimination && eliminationCutIn && <RevealCutIn key={`${game.roundNumber}:${elimination.playerId}`} tone="electric" delayedTone={eliminationCutIn.tone} title={eliminationCutIn.title} delayedLine={eliminationCutIn.delayedLine} holdMs={3_200} media={<Avatar name={eliminationCutIn.title} avatar={members.get(elimination.playerId)?.avatar} size="lg" />} />}
    {elimination && <div className={`motion-enter-up mb-5 rounded-2xl border p-5 text-center ${!eliminationRoleShown ? 'border-ink/15 bg-surface-raised' : elimination.role === 'IMPOSTOR' ? 'border-berry bg-berry/10' : 'border-aqua bg-aqua/10'}`}><Skull className={`mx-auto ${!eliminationRoleShown ? 'text-ink/60' : elimination.role === 'IMPOSTOR' ? 'text-berry' : 'text-aqua'}`} size={44} /><strong className="mt-2 block font-display text-3xl">{memberName(members, elimination.playerId)}</strong><p className={`font-display text-xl${reducedMotion ? '' : ' motion-enter-up'}`}>{eliminationRoleShown ? `era ${elimination.role === 'IMPOSTOR' ? 'IMPOSTOR' : 'INOCENTE'}` : '\u00a0'}</p>{eliminationRoleShown && game.winnerTeam && <p className="mt-2 font-extrabold text-berry">Partida terminada: ganan {game.winnerTeam === 'IMPOSTORS' ? 'los impostores' : 'los inocentes'}.</p>}</div>}
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]"><aside><RoleCard player={player} game={game} /></aside><div className={`flex min-w-0 flex-col gap-5 ${game.phase === 'VOTING' ? 'order-first lg:order-none' : ''}`}>
      <div className="card !p-4"><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-display text-xl"><Users size={20} className="text-aqua" /> Orden y pistas</h2><span className="chip tabular-nums">{game.aliveIds.length} vivos</span></div><div className="grid gap-3 md:grid-cols-2">{orderedPlayers.map((id) => { const currentTurn = game.phase === 'CLUE_PHASE' && game.currentCluePlayerId === id; const orderIndex = game.clueOrder.indexOf(id); return <article key={id} className={`rounded-2xl border p-3 ${game.eliminatedIds.includes(id) ? 'border-ink/5 bg-ink/[.03] opacity-65' : currentTurn ? 'border-aqua bg-aqua/10 ring-4 ring-aqua/10' : 'border-ink/10 bg-surface-raised'}`}><div className="flex items-center justify-between gap-2"><strong className="truncate font-display text-lg" title={memberName(members, id)}>{orderIndex >= 0 && <span className="mr-2 text-ink/55">{orderIndex + 1}.</span>}{memberName(members, id)}</strong>{game.eliminatedIds.includes(id) ? <span className="chip text-xs">Eliminado</span> : currentTurn ? <span className="chip bg-aqua/15 text-aqua">▶ Su turno · {remaining}s</span> : game.phase === 'VOTING' ? <span className={`text-sm font-extrabold ${game.voteCompletedIds.includes(id) ? 'text-leaf' : 'text-ink/55'}`}>{game.voteCompletedIds.includes(id) ? '✓ Votó' : '…'}</span> : null}</div><div className="mt-2 space-y-1.5">{Array.from({ length: game.roundNumber }, (_, index) => index + 1).map((round) => { const entry = game.clues[round]?.[id]; const isCurrent = round === game.roundNumber && currentTurn; const waiting = round === game.roundNumber && game.phase === 'CLUE_PHASE' && orderIndex > game.currentClueTurnIndex; return <p key={round} className="rounded-lg bg-ink/[.035] px-2 py-1.5 text-sm"><span className="mr-2 font-extrabold text-ink/60">R{round}</span>{entry?.status === 'SUBMITTED' ? `“${entry.text}”` : entry ? <span className="text-berry">Sin pista · {entry.status === 'TIMEOUT' ? 'tiempo agotado' : 'desconectado'}</span> : isCurrent ? <span className="font-extrabold text-aqua">TU TURNO</span> : waiting ? <span className="text-ink/55">Esperando…</span> : <span className="text-ink/55">Sin pista</span>}</p>; })}</div></article>; })}</div></div>
      {game.phase === 'CLUE_PHASE' && player.canSubmitClue && <div className="card !p-4"><label className="label flex items-center gap-2"><MessageSquareText size={17} /> Tu pista</label><div className="flex flex-col gap-3 sm:flex-row"><input className="field flex-1" value={clueText} onChange={(event) => setClueText(clampImpostorClue(event.target.value))} placeholder="Escribe algo relacionado…" onKeyDown={(event) => { if (event.key === 'Enter') void submitClue(); }} /><button className="btn-primary justify-center" disabled={!clueText.trim() || clueLength > IMPOSTOR_CLUE_MAX_CODE_POINTS || submitting} aria-busy={submitting} onClick={() => void submitClue()}><Send size={18} /> Enviar pista</button></div><p className={`mt-2 text-right text-sm font-extrabold ${clueLength > IMPOSTOR_CLUE_MAX_CODE_POINTS ? 'text-berry' : 'text-ink/60'}`}>{clueLength}/{IMPOSTOR_CLUE_MAX_CODE_POINTS} caracteres</p></div>}
      {game.phase === 'CLUE_PHASE' && player.ownClue?.status === 'SUBMITTED' && <div className="rounded-2xl border border-leaf/40 bg-leaf/10 p-3 text-center font-extrabold text-leaf"><Check className="mr-2 inline" />Tu pista está enviada y bloqueada.</div>}
      {game.phase === 'CLUE_PHASE' && player.role === 'IMPOSTOR' && <div className="card !p-4"><h2 className="flex items-center gap-2 font-display text-xl"><Brain className="text-berry" /> Adivinar el Pokémon</h2>{player.canGuessPokemon ? <><p className="mt-1 font-bold text-ink/65">Tienes un único intento durante la partida, aunque no sea tu turno de pista.</p><button className="btn-secondary mt-3" onClick={() => setShowGuess((value) => !value)}>{showGuess ? 'Cerrar buscador' : 'Adivinar Pokémon'}</button>{showGuess && <div className="mt-3"><PokemonSelector pokemon={pokemon} loading={poolLoading} loadError={poolError} onRetry={retryPool} locked={new Set()} disabled={submitting} variant="embedded" onSelect={guessPokemon} /></div>}</> : <p className={`mt-2 font-extrabold ${player.guessCorrect ? 'text-leaf' : 'text-berry'}`}>{player.guessCorrect ? '¡Adivinaste el Pokémon!' : 'Ya utilizaste tu intento.'}</p>}</div>}
      {game.phase === 'VOTING' && <div className="card order-first !p-4"><h2 className="mb-3 flex items-center gap-2 font-display text-xl"><Vote className="text-berry" /> {game.votingRound > 1 ? 'Vota entre los jugadores empatados' : 'Elige a quién quieres expulsar'}</h2><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{game.voteCandidateIds.map((id) => { const self = id === selfId; return <button type="button" key={id} disabled={!player.canVote || self || submitting} aria-pressed={voteDraft === id} onClick={() => setVoteDraft(id)} className={`session-card ${voteDraft === id ? 'session-card-selected' : ''} ${self ? 'opacity-35' : ''}`}><strong>{memberName(members, id)}</strong>{self && <span>Eres tú</span>}</button>; })}<button type="button" disabled={!player.canVote || submitting} aria-pressed={voteDraft === IMPOSTOR_SKIP_TARGET} onClick={() => setVoteDraft(IMPOSTOR_SKIP_TARGET)} className={`session-card ${voteDraft === IMPOSTOR_SKIP_TARGET ? 'session-card-selected' : ''}`}><strong>Saltar</strong></button></div><p className="mt-3 text-sm font-bold text-ink/65">Tres rondas seguidas sin expulsión dan la victoria a los impostores.</p>{player.canVote ? <button className="btn-primary mx-auto mt-4" disabled={!voteDraft || submitting} aria-busy={submitting} onClick={() => void submitVote()}><Vote size={18} /> Confirmar voto</button> : player.ownVote ? <p className="mt-4 text-center font-extrabold text-leaf"><Check className="mr-2 inline" />Tu voto está bloqueado. El objetivo permanece secreto.</p> : null}</div>}
      {error && <p className="status-error text-center" role="alert">{error}</p>}
    </div></div>
  </section>;
}
