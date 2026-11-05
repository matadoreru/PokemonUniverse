import { type RoomMemberView, type ShinyOptionId, type ShinyVoteConfig, type ShinyVotePlayerState, type ShinyVotePublicState, type RoomView } from '@pokemon-universe/shared/public';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ServerTimer } from '../components/ServerTimer';
import { ShinyGameHeader } from '../games/shiny-vote/ShinyGameHeader';
import { ShinyGameSidebar } from '../games/shiny-vote/ShinyGameSidebar';
import { clearShinySprites, ShinyBeforeAfter, ShinyOptionCard } from '../games/shiny-vote/ShinyOptionCard';
import { ShinyVoteStatus } from '../games/shiny-vote/ShinyVoteStatus';
import { createShinyVoteAction, shinyOptionFromShortcut, updateShinyDraft } from '../games/shiny-vote/interaction';
import { SHINY_CARDS_TIMEOUT_MS, shinyCardsReady, shinyRoundFeedback } from '../games/shiny-vote/reveal';
import { shinyVotersVisible } from '../games/shiny-vote/vote-visibility';
import { useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { cx, ScreenSplit } from '../ui';
import { GameSkipSlot } from './GameSkipSlot';
import s from '../games/shiny-vote/ShinyVote.module.css';

/** El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí no se repite. */
const ignoreFailure = () => undefined;

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

/**
 * Shiny Quiz (spec §2 y §6 «Juegos»). Arriba se mira: la placa con la ronda, la pregunta y el tiempo, y las cartas de
 * opción (`Card` llena: seleccionable, seleccionada, correcta que gira al revelar, incorrecta). Abajo se actúa: confirmar
 * el voto o, al revelar, el veredicto con los puntos. En la columna lateral, el marcador y, debajo, el antes y el
 * después al revelar; en el móvil, entre las cartas y la pantalla inferior.
 */
export function ShinyVoteGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as ShinyVotePublicState;
  const config = room.selectedGameConfig as ShinyVoteConfig;
  const playerState = room.gamePlayerState as ShinyVotePlayerState | null;
  const [draft, setDraft] = useState<ShinyOptionId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const serverOffset = useServerOffset(room.serverNow);
  const active = game.phase === 'ROUND_ACTIVE';
  const reveal = game.phase === 'ROUND_RESULTS';
  const revealPhase = game.phase === 'ROUND_RESULTS' || game.phase === 'GAME_RESULTS';
  const transitionLabel = game.roundNumber >= game.totalRounds ? 'Resultados finales' : 'Siguiente ronda';
  const ownVote = playerState?.vote ?? game.votes[selfId] ?? null;
  const participant = game.playerIds.includes(selfId);
  const roundKey = `${game.roundNumber}|${game.options.map((option) => option.sprite).join('|')}`;
  const cards = useShinyCardsReady(roundKey, game.options.length);
  // Al revelar las cartas ya estaban cargadas: el esqueleto solo bloquea el voto de la ronda abierta.
  const loadingCards = active && game.options.length > 0 && !cards.ready;
  const canVote = active && participant && !ownVote && playerState?.canVote === true && !loadingCards;
  // Botones mientras se puede votar (o se podrá cuando carguen): con el voto dado o al revelar, cartas fijas sin apagar.
  const interactive = active && participant && !ownVote && playerState?.canVote === true;
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  const selectedOptionId = ownVote?.optionId ?? draft;
  const selectedOption = game.options.find((option) => option.id === selectedOptionId) ?? null;
  const optionIds = useMemo(() => game.options.map((option) => option.id), [game.options]);
  const correctOption = reveal ? game.options.find((option) => option.id === game.correctOptionId) ?? null : null;
  const feedback = reveal && participant ? shinyRoundFeedback(playerState?.roundResult ?? null, Boolean(ownVote)) : null;
  const cardFeedback = feedback ? { ...feedback, points: playerState?.roundResult?.points ?? 0 } : null;
  useSfxCue(reveal && participant ? playerState?.roundResult?.correct ? 'hit' : 'miss' : null, reveal ? game.roundNumber : null);

  useEffect(() => {
    setDraft(null);
  }, [game.roundNumber]);
  useEffect(() => clearShinySprites, []);

  const selectOption = useCallback((optionId: ShinyOptionId) => {
    setDraft((current) => updateShinyDraft(current, optionId, canVote && !submitting));
  }, [canVote, submitting]);

  const confirmVote = useCallback(async () => {
    const action = createShinyVoteAction(draft, canVote, submitting);
    if (!action) return;
    setSubmitting(true);
    try {
      await onAction(action).catch(ignoreFailure);
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

  const timer = active
    ? <ServerTimer deadline={game.roundEndsAt} serverOffset={serverOffset} totalMs={Math.max(1, config.roundSeconds * 1_000)} label="Tiempo" />
    : reveal ? <ServerTimer deadline={game.nextTransitionAt} serverOffset={serverOffset} label={transitionLabel} /> : null;

  const grid = game.options.length > 0
    ? <div className={s.grid} data-count={game.options.length} role="group" aria-label="Opciones de Pokémon" aria-busy={loadingCards ? 'true' : undefined}>{game.options.map((option) => {
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
        interactive={interactive}
        loading={loadingCards}
        reveal={reveal}
        correct={game.correctOptionId === option.id}
        showVoters={shinyVotersVisible(game.voteVisibility, revealPhase)}
        feedback={cardFeedback}
        onSelect={() => selectOption(option.id)}
        onSettled={cards.onSettled}
      />;
    })}</div>
    : <div className={s.grid} data-count={4} role="status" aria-label="Cargando opciones">{Array.from({ length: 4 }, (_, index) => <span key={index} className={s.ghostCard}><span className={s.skeleton} /></span>)}</div>;

  const top = <div className={s.top}>
    <ShinyGameHeader roundNumber={game.roundNumber} totalRounds={game.totalRounds} voteVisibility={game.voteVisibility} candidateMode={config.candidateMode} timer={timer} />
    {grid}
  </div>;

  const side = <div className={s.side}>
    <ShinyGameSidebar game={game} members={members} colors={colors} selfId={selfId} className={cx(s.sidePanel)} />
    {correctOption && <ShinyBeforeAfter key={`${game.roundNumber}|${correctOption.id}`} option={correctOption} />}
    <GameSkipSlot className={s.skip} />
  </div>;

  const bottom = <ShinyVoteStatus
    active={active}
    loading={loadingCards}
    reveal={reveal}
    participant={participant}
    selectedOption={selectedOption}
    ownVote={ownVote}
    correctOptionId={game.correctOptionId}
    points={playerState?.roundResult?.points ?? 0}
    submitting={submitting}
    onConfirm={() => void confirmVote()}
  />;

  return <div className={cx('content-row', s.screen)}>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
  </div>;
}
