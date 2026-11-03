import type { RoomMemberView, ShinyVotePublicState } from '@pokemon-universe/shared/public';
import { Check, ChevronDown, CircleDashed, Eye, MessageSquareWarning, Trophy, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';

function memberName(member: RoomMemberView | undefined, id: string) {
  return member?.displayName ?? id;
}

export function ShinyGameSidebar({ game, members, selfId, feedbackUrl }: {
  game: ShinyVotePublicState;
  members: ReadonlyMap<string, RoomMemberView>;
  selfId: string;
  feedbackUrl: string;
}) {
  const reveal = game.phase === 'ROUND_RESULTS';
  const ranking = [...game.playerIds].sort((left, right) => (game.scores[right] ?? 0) - (game.scores[left] ?? 0) || memberName(members.get(left), left).localeCompare(memberName(members.get(right), right)));
  const voted = new Set(game.votedPlayerIds);

  return <aside className="min-w-0 lg:sticky lg:top-4" aria-label="Estado de la partida">
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-surface shadow-card">
      <div className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Partida</h2>
          <Link className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-extrabold text-ink/50 no-underline transition-colors hover:bg-ink/[.06] hover:text-ink" to={feedbackUrl}><MessageSquareWarning size={15} />Reportar</Link>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-ink/[.04] px-3 py-2 text-sm">
          <span className="font-bold text-ink/60">Votos</span>
          <strong className="tabular-nums">{game.votedPlayerIds.length} / {game.playerIds.length}</strong>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold">{game.pendingPlayerIds.length > 0 ? `Pendientes · ${game.pendingPlayerIds.length}` : 'Todos han votado'}</h3>
          {!game.showVotes && <span className="text-[.68rem] font-extrabold text-ink/45">Elección privada</span>}
        </div>
        <div className="mt-2 max-h-60 space-y-1.5 overflow-y-auto pr-0.5">{game.playerIds.map((id) => {
          const member = members.get(id);
          const hasVoted = voted.has(id);
          const vote = game.votes[id];
          const correct = reveal && vote?.optionId === game.correctOptionId;
          return <div key={id} className={`flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-2 ${id === selfId ? 'bg-aqua/[.08]' : 'bg-ink/[.03]'}`}>
            <Avatar name={memberName(member, id)} avatar={member?.avatar} presence={member?.presence} size="xs" />
            <strong className="min-w-0 flex-1 truncate text-sm">{memberName(member, id)}{id === selfId && <span className="ml-1 text-[.65rem] font-black text-aqua">TÚ</span>}</strong>
            {member?.role === 'SPECTATOR' ? <Eye size={15} className="text-ink/45" aria-label="Espectador" /> : !hasVoted ? <span className="inline-flex items-center gap-1 text-xs font-bold text-ink/50"><CircleDashed size={14} />Pendiente</span> : reveal && game.showVotes && vote ? <span className={`inline-flex items-center gap-1 text-xs font-black ${correct ? 'text-leaf' : 'text-berry'}`}>{correct ? <Check size={14} /> : <X size={14} />}{vote.optionId}</span> : <span className="inline-flex items-center gap-1 text-xs font-black text-leaf"><Check size={14} />Votó</span>}
          </div>;
        })}</div>
      </div>
      <details className="group border-t border-ink/10" open>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 sm:px-4">
          <Trophy size={18} className="text-electric" aria-hidden="true" />
          <h2 className="min-w-0 flex-1 font-display text-lg font-bold">Clasificación</h2>
          <ChevronDown className="text-ink/45 transition-transform group-open:rotate-180" size={18} aria-hidden="true" />
        </summary>
        <ol className="max-h-72 space-y-1.5 overflow-y-auto px-3.5 pb-3.5 sm:px-4 sm:pb-4">{ranking.map((id, index) => {
          const member = members.get(id);
          const previousId = ranking[index - 1];
          const tied = previousId !== undefined && (game.scores[previousId] ?? 0) === (game.scores[id] ?? 0);
          const position = tied ? ranking.findIndex((candidateId) => (game.scores[candidateId] ?? 0) === (game.scores[id] ?? 0)) + 1 : index + 1;
          return <li key={id} className={`grid min-h-10 grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-1.5 ${id === selfId ? 'bg-aqua/[.08]' : 'bg-ink/[.03]'}`} aria-current={id === selfId ? 'true' : undefined}>
            <span className="text-center font-display text-sm font-bold text-ink/55" title={tied ? 'Empate' : undefined}>{position}</span>
            <Avatar name={memberName(member, id)} avatar={member?.avatar} size="xs" />
            <strong className="truncate text-sm">{memberName(member, id)}</strong>
            <strong className={`tabular-nums text-right text-sm text-berry ${reveal ? 'shiny-score-update' : ''}`}>{game.scores[id] ?? 0}<span className="ml-1 text-[.65rem] text-ink/45">pts</span></strong>
          </li>;
        })}</ol>
      </details>
    </section>
  </aside>;
}
