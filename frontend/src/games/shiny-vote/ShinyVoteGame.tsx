import { type RoomMemberView, type ShinyOptionId, type ShinyVoteConfig, type ShinyVotePlayerState, type ShinyVotePublicState } from '@pokemon-universe/shared/public';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Layers3, LayoutGrid, Shuffle } from 'lucide-react';
import { ShinyGameSidebar } from './ShinyGameSidebar';
import { clearShinySprites, ShinyBeforeAfter, ShinyOptionCard } from './ShinyOptionCard';
import { shinyStatusAnnouncement, ShinyVoteStatus } from './ShinyVoteStatus';
import { createShinyVoteAction, shinyOptionFromShortcut, updateShinyDraft } from './interaction';
import { SHINY_CARDS_TIMEOUT_MS, shinyCardsReady, shinyRoundFeedback } from './reveal';
import { shinyVisibilityChip, shinyVotersVisible } from './vote-visibility';
import { useServerOffset } from '../../hooks/useServerTime';
import { useOutcomeCue } from '../../room/game-kit/useOutcomeCue';
import { Chip, cx, Icon } from '../../ui';
import { GAME_SIDE_FIT, GameScreen, type GameTimer } from '../../room/game-kit/GameScreen';
import { useChoiceShortcuts } from '../../room/game-kit/useChoiceShortcuts';
import { usePendingAction } from '../../room/game-kit/usePendingAction';
import type { ActiveGameProps } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './ShinyVote.module.css';

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
 * Shiny Quiz (spec §2 y §6 «Juegos»), en el marco de juego (`GameScreen`). Arriba se mira: la placa con la ronda, la pregunta y el tiempo, y las cartas de
 * opción (`Card` llena: seleccionable, seleccionada, correcta que gira al revelar, incorrecta). Abajo se actúa: confirmar
 * el voto o, al revelar, el veredicto con los puntos. En la columna lateral, el marcador y, debajo, el antes y el
 * después al revelar; en el móvil, entre las cartas y la pantalla inferior.
 *
 * Supervivencia (`game.alive` presente): la placa dice cuántos candidatos hay, el marcador quién sigue en pie y quien
 * cayó en una ronda anterior deja de jugar (mira la partida con su propia placa).
 */
export function ShinyVoteGame({ room, selfId, onAction }: ActiveGameProps) {
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
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  const selectedOptionId = ownVote?.optionId ?? draft;
  const selectedOption = game.options.find((option) => option.id === selectedOptionId) ?? null;
  const optionIds = useMemo(() => game.options.map((option) => option.id), [game.options]);
  const correctOption = reveal ? game.options.find((option) => option.id === game.correctOptionId) ?? null : null;
  const feedback = reveal && participant ? shinyRoundFeedback(playerState?.roundResult ?? null, Boolean(ownVote)) : null;
  const cardFeedback = feedback ? { ...feedback, points: playerState?.roundResult?.points ?? 0 } : null;
  useOutcomeCue(reveal && participant ? Boolean(playerState?.roundResult?.correct) : null, game.roundNumber);

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

  // En la revelación, el plazo de la siguiente ronda en el mismo hueco: la placa no cambia de alto.
  const timer: GameTimer = active
    ? { deadline: game.roundEndsAt, serverOffset, totalMs: Math.max(1, config.roundSeconds * 1_000), label: 'Tiempo' }
    : { deadline: reveal ? game.nextTransitionAt : null, serverOffset, label: transitionLabel };
  // Modo de votos y de candidatos; en Supervivencia (crecen cada pocas rondas), también cuántos candidatos hay.
  const meta = <>
    {survival && game.options.length > 0 && <Chip tone="info" icon={<Icon icon={LayoutGrid} size={18} />}>{game.options.length} candidatos</Chip>}
    <Chip tone="neutral" icon={<Icon icon={Eye} size={18} />}>{shinyVisibilityChip(game.voteVisibility)}</Chip>
    <Chip tone="neutral" icon={<Icon icon={config.candidateMode === 'SAME_POKEMON' ? Layers3 : Shuffle} size={18} />}>{config.candidateMode === 'SAME_POKEMON' ? 'Mismo Pokémon' : 'Pokémon diferentes'}</Chip>
  </>;

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

  // El marcador y, al revelar, el antes y el después miden lo que necesitan: no llenan la columna.
  const side = <>
    <ShinyGameSidebar game={game} members={members} colors={colors} selfId={selfId} className={cx(s.sidePanel, GAME_SIDE_FIT)} />
    {correctOption && <ShinyBeforeAfter key={`${game.roundNumber}|${correctOption.id}`} option={correctOption} className={GAME_SIDE_FIT} />}
  </>;

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

  const announcement = shinyStatusAnnouncement({ active, loading: loadingCards, reveal, participant, ownVote, correctOptionId: game.correctOptionId, points: playerState?.roundResult?.points ?? 0, survival: survivalStatus });
  return <GameScreen gameName="Shiny Quiz" roundNumber={game.roundNumber} totalRounds={game.totalRounds} phase={game.phase} meta={meta} heading="¿Cuál es el shiny verdadero?"
    timer={timer} announcement={announcement} clue={grid} side={side} bottom={bottom} />;
}
