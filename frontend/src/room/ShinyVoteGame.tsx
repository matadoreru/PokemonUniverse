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
import { useChoiceShortcuts } from './useChoiceShortcuts';
import { usePendingAction } from './usePendingAction';
import s from '../games/shiny-vote/ShinyVote.module.css';

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
 *
 * Supervivencia (`game.alive` presente): la placa dice cuántos candidatos hay, el marcador quién sigue en pie y quien
 * cayó en una ronda anterior deja de jugar (mira la partida con su propia placa).
 */
export function ShinyVoteGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as ShinyVotePublicState;
  const config = room.selectedGameConfig as ShinyVoteConfig;
  const playerState = room.gamePlayerState as ShinyVotePlayerState | null;
  const [draft, setDraft] = useState<ShinyOptionId | null>(null);
  const { pending, submit } = usePendingAction(onAction);
  const submitting = pending !== null;
  const serverOffset = useServerOffset(room.serverNow);
  const active = game.phase === 'ROUND_ACTIVE';
  const reveal = game.phase === 'ROUND_RESULTS';
  const revealPhase = game.phase === 'ROUND_RESULTS' || game.phase === 'GAME_RESULTS';
  const survival = game.alive !== undefined;
  const transitionLabel = game.roundNumber >= game.totalRounds || game.alive?.length === 0 ? 'Resultados finales' : 'Siguiente ronda';
  const ownVote = playerState?.vote ?? game.votes[selfId] ?? null;
  // En Supervivencia, quien cayó antes de esta ronda ya no juega; quien cae en ella la sigue hasta su revelación.
  const fellThisRound = reveal && (game.lastRound?.missedPlayerIds.includes(selfId) ?? false);
  const eliminated = survival && game.playerIds.includes(selfId) && !game.alive?.includes(selfId) && !fellThisRound;
  const participant = game.playerIds.includes(selfId) && !eliminated;
  const survivalStatus = survival ? { eliminated, roundsSurvived: game.roundsSurvived?.[selfId] ?? game.scores[selfId] ?? 0 } : null;
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

  const confirmVote = () => {
    const action = createShinyVoteAction(draft, canVote, submitting);
    if (action) void submit(action);
  };

  // 1–4 o A–D eligen y Enter confirma (Intro sobre un control, una carta incluida, lo activa).
  useChoiceShortcuts(canVote && !submitting, (key) => {
    const optionId = shinyOptionFromShortcut(key, optionIds);
    if (optionId) {
      selectOption(optionId);
      return true;
    }
    if (key !== 'Enter' || !draft) return false;
    confirmVote();
    return true;
  });

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
    // Sin rol: la región viva es la de la placa («Preparando la ronda»); el esqueleto solo dice que está ocupado.
    : <div className={s.grid} data-count={4} aria-busy="true"><span className="sr-only">Cargando opciones</span>{Array.from({ length: 4 }, (_, index) => <span key={index} className={s.ghostCard}><span className={s.skeleton} /></span>)}</div>;

  const top = <div className={s.top}>
    <ShinyGameHeader roundNumber={game.roundNumber} totalRounds={game.totalRounds} voteVisibility={game.voteVisibility} candidateMode={config.candidateMode} timer={timer} candidates={survival && game.options.length > 0 ? game.options.length : null} />
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
    onConfirm={confirmVote}
    survival={survivalStatus}
  />;

  return <div className={cx('content-row', s.screen)}>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
  </div>;
}
