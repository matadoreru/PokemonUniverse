import { supportsPlayerCount, type GameResults as GameResultsData, type RoomView } from '@pokemon-universe/shared';
import { Check, LoaderCircle, StopCircle, Trophy, UsersRound, Vote } from 'lucide-react';
import { useState } from 'react';
import { ServerTimer } from '../components/ServerTimer';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { gameAvailabilityReason } from './GameSelectionConfig';
import { summarizeGameConfig } from './game-config-summary';

export function NextGameVote({ room, selfId, onVote, onEnd }: { room: RoomView; selfId: string; onVote(gameId: string): Promise<void>; onEnd(): void }) {
  const vote = room.nextGameVote!;
  const results = (room.game as { results?: GameResultsData | null } | null)?.results;
  const active = room.phase === 'NEXT_GAME_VOTE';
  const [draft, setDraft] = useState<string | null>(vote.ownVoteGameId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const serverOffset = useServerOffset(room.serverNow);
  const revealRemainingMs = useRemainingMs(vote.nextTransitionAt, serverOffset, 250);
  const host = room.hostId === selfId;
  const eligible = vote.eligibleVoterIds.includes(selfId);
  const canVote = active && eligible && !vote.ownVoteGameId;
  const playerCount = room.members.filter((member) => member.presence === 'CONNECTED').length;
  const members = new Map(room.members.map((member) => [member.id, member]));

  async function confirmVote() {
    if (!draft || !canVote || submitting) return;
    const selectedGame = vote.options.find((game) => game.id === draft);
    if (!selectedGame || !supportsPlayerCount(selectedGame, playerCount)) { setError('Ese minijuego ya no admite el número actual de jugadores.'); return; }
    setSubmitting(true); setError('');
    try { await onVote(draft); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se ha podido registrar el voto.'); }
    finally { setSubmitting(false); }
  }

  return <section className="page-shell max-w-5xl py-6 sm:py-10">
    <header className="mb-5 flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
      <div><span className="label !mb-1">Partida {room.gamesPlayed} completada</span><h1 className="font-display text-3xl font-bold sm:text-4xl">Elige el siguiente minijuego</h1><p className="mt-1 font-bold text-ink/60">El más votado será el próximo. En caso de empate, decide el azar.</p></div>
      {active ? <ServerTimer deadline={vote.endsAt} serverOffset={serverOffset} label="Para votar" /> : <div className="text-center"><span className="label !mb-0">Siguiente juego</span><strong className="font-display text-xl text-leaf">Elegido</strong></div>}
    </header>

    {results && <div className="panel mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
      <span className="inline-flex items-center gap-2 font-display text-lg font-bold"><Trophy size={20} className="text-electric" /> Resultado anterior</span>
      <div className="flex flex-1 flex-wrap gap-2">{results.standings.slice(0, 3).map((standing) => <span key={standing.playerId} className="chip"><strong className="mr-1 text-berry">{standing.position}.</strong>{members.get(standing.playerId)?.displayName ?? standing.playerId} · +{standing.points}</span>)}</div>
      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ink/60"><UsersRound size={17} /> {vote.votedPlayerIds.length}/{vote.eligibleVoterIds.length} votos</span>
    </div>}

    {!active && vote.resolvedGameId && <div className="reveal-pop mb-5 rounded-xl border border-leaf/40 bg-leaf/10 p-4 text-center">
      <Check className="mr-2 inline text-leaf" size={22} /><strong className="font-display text-xl">La sala ha elegido {vote.options.find((game) => game.id === vote.resolvedGameId)?.name}</strong>
      <p className="mt-1 text-sm font-bold text-ink/65">La siguiente partida empieza en {Math.max(1, Math.ceil(revealRemainingMs / 1_000))} s…</p>
    </div>}

    <div className="grid gap-3 md:grid-cols-3">
      {vote.options.map((game) => {
        const selected = (vote.ownVoteGameId ?? draft) === game.id;
        const winner = vote.resolvedGameId === game.id;
        const tally = vote.tallies?.[game.id] ?? 0;
        const unavailableReason = active ? gameAvailabilityReason(game, playerCount) : null;
        return <button key={game.id} type="button" disabled={!canVote || submitting || Boolean(unavailableReason)} aria-pressed={selected} title={unavailableReason ?? undefined} onClick={() => setDraft(game.id)} className={`relative min-h-0 rounded-2xl border p-4 text-left transition-colors md:min-h-48 md:p-5 ${winner ? 'border-leaf bg-leaf/10' : selected ? 'border-aqua bg-aqua/10' : active ? 'border-ink/10 bg-surface hover:border-aqua/60 hover:bg-ink/[.04]' : 'border-ink/10 bg-surface-raised opacity-70'} disabled:cursor-default`}>
          <span className="mb-3 flex items-start justify-between gap-3 md:mb-5"><span className="text-3xl md:text-4xl" aria-hidden="true">{game.icon}</span>{winner ? <span className="chip bg-leaf/15 text-leaf"><Trophy size={15} /> Ganador</span> : selected && <span className="chip bg-aqua/15 text-aqua"><Check size={15} /> Tu voto</span>}</span>
          <span className="flex flex-wrap items-center gap-2"><strong className="font-display text-xl">{game.name}</strong>{game.recommended && <span className="recommended-badge">TOP</span>}{game.experimental && <span className="experimental-badge">Experimental</span>}</span><span className={`mt-1 block text-sm font-bold leading-snug ${unavailableReason ? 'text-berry' : 'text-ink/60'}`}>{unavailableReason ?? game.description}</span>
          {!unavailableReason && <span className="mt-3 inline-flex rounded-lg bg-ink/[.06] px-2.5 py-1.5 text-xs font-extrabold text-ink/60">{summarizeGameConfig(room.gameConfigs?.[game.id])}</span>}
          {!active && <span className="mt-4 inline-flex items-center gap-1.5 font-extrabold text-ink/70"><Vote size={17} /> {tally} {tally === 1 ? 'voto' : 'votos'}</span>}
        </button>;
      })}
    </div>

    {canVote && <div className="sticky bottom-3 z-10 mx-auto mt-5 flex max-w-xl flex-col items-center gap-3 rounded-xl border border-ink/10 bg-surface/95 p-3 sm:flex-row">
      <p className="flex-1 text-center font-bold sm:text-left">{draft ? <>Has elegido <strong className="text-aqua">{vote.options.find((game) => game.id === draft)?.name}</strong>.</> : 'Selecciona una opción para preparar tu voto.'}</p>
      <button type="button" className="btn-primary w-full whitespace-nowrap sm:w-auto" disabled={!draft || submitting} onClick={() => void confirmVote()}>{submitting ? <LoaderCircle className="animate-spin" size={18} /> : <Vote size={18} />}{submitting ? 'Confirmando…' : 'Confirmar voto'}</button>
    </div>}
    {vote.ownVoteGameId && active && <p className="mt-4 text-center font-extrabold text-leaf"><Check className="mr-1.5 inline" size={19} />Tu voto está registrado.</p>}
    {!eligible && active && <p className="mt-4 text-center font-bold text-ink/60">Te has desconectado de la votación. Podrás seguir cuando recuperes la conexión.</p>}
    {error && <p role="alert" className="status-error mx-auto mt-4 max-w-xl text-center">{error}</p>}
    {host && <button type="button" className="btn-ghost mx-auto mt-6 flex" onClick={onEnd}><StopCircle size={18} /> Terminar sesión</button>}
  </section>;
}
