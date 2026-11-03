import { type RoomMemberView, type RoomView, type ShinyOptionId, type ShinyVoteConfig, type ShinyVotePlayerState, type ShinyVotePublicState } from '@pokemon-universe/shared/public';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShinyGameHeader } from '../games/shiny-vote/ShinyGameHeader';
import { ShinyGameSidebar } from '../games/shiny-vote/ShinyGameSidebar';
import { ShinyBeforeAfter, ShinyOptionCard } from '../games/shiny-vote/ShinyOptionCard';
import { ShinyVoteStatus } from '../games/shiny-vote/ShinyVoteStatus';
import { createShinyVoteAction, shinyOptionFromShortcut, updateShinyDraft } from '../games/shiny-vote/interaction';
import { SHINY_CARDS_TIMEOUT_MS, shinyCardsReady, shinyRoundFeedback } from '../games/shiny-vote/reveal';
import { shinyVotersVisible } from '../games/shiny-vote/vote-visibility';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';

function ignoresGameShortcuts(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-shiny-option]')) return false;
  return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"]'));
}

/**
 * Cartas de la ronda listas para votar: todas cargadas (o fallidas) o, como mucho, `SHINY_CARDS_TIMEOUT_MS` después de
 * que aparezcan. El temporizador fuerza el render del límite aunque no llegue ningún evento de imagen.
 */
function useShinyCardsReady(roundKey: string, total: number) {
  const [settled, setSettled] = useState<{ key: string; ids: ReadonlySet<ShinyOptionId> }>({ key: roundKey, ids: new Set() });
  const [timedOutKey, setTimedOutKey] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOutKey(roundKey), SHINY_CARDS_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [roundKey]);
  const onSettled = useCallback((optionId: ShinyOptionId) => {
    setSettled((current) => {
      const ids = current.key === roundKey ? current.ids : new Set<ShinyOptionId>();
      return ids.has(optionId) && current.key === roundKey ? current : { key: roundKey, ids: new Set([...ids, optionId]) };
    });
  }, [roundKey]);
  const loaded = settled.key === roundKey ? settled.ids.size : 0;
  const ready = shinyCardsReady(loaded, total, timedOutKey === roundKey ? SHINY_CARDS_TIMEOUT_MS : 0);
  return { ready, onSettled };
}

export function ShinyVoteGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as ShinyVotePublicState;
  const config = room.selectedGameConfig as ShinyVoteConfig;
  const playerState = room.gamePlayerState as ShinyVotePlayerState | null;
  const [draft, setDraft] = useState<ShinyOptionId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const serverOffset = useServerOffset(room.serverNow);
  const remainingMs = useRemainingMs(game.roundEndsAt, serverOffset);
  const transitionRemainingMs = useRemainingMs(game.nextTransitionAt, serverOffset);
  const totalMs = Math.max(1, config.roundSeconds * 1_000);
  const remaining = Math.max(0, Math.ceil(remainingMs / 1_000));
  const progress = game.phase === 'ROUND_ACTIVE' ? Math.min(100, Math.max(0, remainingMs / totalMs * 100)) : 0;
  const active = game.phase === 'ROUND_ACTIVE';
  const reveal = game.phase === 'ROUND_RESULTS';
  const revealPhase = game.phase === 'ROUND_RESULTS' || game.phase === 'GAME_RESULTS';
  const transitionRemaining = Math.max(1, Math.ceil(transitionRemainingMs / 1_000));
  const transitionLabel = game.roundNumber >= game.totalRounds ? 'Resultados finales' : 'Siguiente ronda';
  const ownVote = playerState?.vote ?? game.votes[selfId] ?? null;
  const participant = game.playerIds.includes(selfId);
  const roundKey = `${game.roundNumber}|${game.options.map((option) => option.sprite).join('|')}`;
  const cards = useShinyCardsReady(roundKey, game.options.length);
  // Al revelar las cartas ya estaban cargadas: el esqueleto solo bloquea el voto de la ronda abierta.
  const loadingCards = active && game.options.length > 0 && !cards.ready;
  const canVote = active && participant && !ownVote && playerState?.canVote === true && !loadingCards;
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const selectedOptionId = ownVote?.optionId ?? draft;
  const selectedOption = game.options.find((option) => option.id === selectedOptionId) ?? null;
  const optionIds = useMemo(() => game.options.map((option) => option.id), [game.options]);
  const optionGrid = game.options.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : game.options.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3';
  const correctOption = reveal ? game.options.find((option) => option.id === game.correctOptionId) ?? null : null;
  const feedback = reveal && participant ? shinyRoundFeedback(playerState?.roundResult ?? null, Boolean(ownVote)) : null;
  const cardFeedback = feedback ? { ...feedback, points: playerState?.roundResult?.points ?? 0 } : null;
  useSfxCue(reveal && participant ? playerState?.roundResult?.correct ? 'hit' : 'miss' : null, reveal ? game.roundNumber : null);
  const feedbackUrl = `/feedback?${new URLSearchParams({ game: 'shiny-vote', room: room.code })}`;

  useEffect(() => {
    setDraft(null);
    setError('');
  }, [game.roundNumber]);

  const selectOption = useCallback((optionId: ShinyOptionId) => {
    setDraft((current) => updateShinyDraft(current, optionId, canVote && !submitting));
    setError('');
  }, [canVote, submitting]);

  const confirmVote = useCallback(async () => {
    const action = createShinyVoteAction(draft, canVote, submitting);
    if (!action) return;
    setSubmitting(true);
    setError('');
    try {
      await onAction(action);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'El servidor rechazó el voto. Puedes intentarlo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }, [canVote, draft, onAction, submitting]);

  useEffect(() => {
    if (!canVote || submitting) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || ignoresGameShortcuts(event.target)) return;
      const optionId = shinyOptionFromShortcut(event.key, optionIds);
      if (optionId) {
        event.preventDefault();
        selectOption(optionId);
        return;
      }
      if (event.key === 'Enter' && draft) {
        event.preventDefault();
        void confirmVote();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canVote, confirmVote, draft, optionIds, selectOption, submitting]);

  return <section className="mx-auto w-full max-w-[90rem] overflow-x-clip px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
    <ShinyGameHeader
      roundNumber={game.roundNumber}
      totalRounds={game.totalRounds}
      active={active}
      voteVisibility={game.voteVisibility}
      candidateMode={config.candidateMode}
      remainingSeconds={active ? remaining : transitionRemaining}
      progress={active ? progress : 100}
    />
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
      <main className="min-w-0" aria-busy={loadingCards ? 'true' : undefined}>
        {game.options.length > 0 ? <div className={`shiny-option-grid grid gap-2.5 sm:gap-3 ${optionGrid}`} role="group" aria-label="Opciones de Pokémon">{game.options.map((option) => {
          const voters = Object.entries(game.votes)
            .filter(([, vote]) => vote.optionId === option.id)
            .map(([playerId]) => members.get(playerId))
            .filter((member): member is RoomMemberView => Boolean(member));
          return <ShinyOptionCard
            key={option.id}
            option={option}
            voters={voters}
            selected={selectedOptionId === option.id}
            confirmed={Boolean(ownVote)}
            disabled={!canVote || submitting}
            loading={loadingCards}
            reveal={reveal}
            correct={game.correctOptionId === option.id}
            showVoters={shinyVotersVisible(game.voteVisibility, revealPhase)}
            feedback={cardFeedback}
            onSelect={() => selectOption(option.id)}
            onSettled={cards.onSettled}
          />;
        })}</div> : <div className="grid grid-cols-2 gap-2.5 sm:gap-3" aria-label="Cargando opciones">{Array.from({ length: 4 }, (_, index) => <div key={index} className="shiny-option-card rounded-2xl border border-ink/10 bg-surface p-3"><div className="skeleton h-9 w-9" /><div className="skeleton mx-auto mt-3 h-44 w-44 max-w-full" /><div className="skeleton mx-auto mt-3 h-5 w-24 max-w-full" /></div>)}</div>}
        {correctOption && <ShinyBeforeAfter key={`${game.roundNumber}|${correctOption.id}`} option={correctOption} />}
        <ShinyVoteStatus
          active={active}
          loading={loadingCards}
          reveal={reveal}
          participant={participant}
          selectedOption={selectedOption}
          ownVote={ownVote}
          correctOptionId={game.correctOptionId}
          points={playerState?.roundResult?.points ?? 0}
          submitting={submitting}
          error={error}
          transitionLabel={transitionLabel}
          transitionRemaining={transitionRemaining}
          onConfirm={() => void confirmVote()}
        />
      </main>
      <ShinyGameSidebar game={game} members={members} selfId={selfId} feedbackUrl={feedbackUrl} />
    </div>
  </section>;
}
