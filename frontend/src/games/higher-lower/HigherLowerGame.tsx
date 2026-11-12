import { gameModeLabel, type HigherLowerChoice, type HigherLowerConfig, type HigherLowerPlayerState, type HigherLowerPublicState } from '@pokemon-universe/shared/public';
import { useRef } from 'react';
import { Eye } from 'lucide-react';
import { HigherLowerDuelCard, HigherLowerPlate, HigherLowerSidebar } from './HigherLowerParts';
import { higherLowerAnnouncement, higherLowerChoiceFromShortcut, higherLowerFocusKey, higherLowerPlateKind, higherLowerVerdict } from './presentation';
import { useRemainingMs, useServerOffset } from '../../hooks/useServerTime';
import { useSfxCue } from '../../hooks/useSfxCue';
import { useOutcomeCue } from '../../room/game-kit/useOutcomeCue';
import { Chip, cx, Icon, MomentCutin } from '../../ui';
import { GAME_SIDE_FIT, GameScreen, type GameTimer } from '../../room/game-kit/GameScreen';
import { HigherLowerBars } from './HigherLowerBars';
import { higherLowerBars, higherLowerCategoryLabels, higherLowerVisibilityLabels, higherLowerLastReveal, higherLowerRevealCountdown, higherLowerStreakMilestone } from './higher-lower-labels';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { useChoiceShortcuts } from '../../room/game-kit/useChoiceShortcuts';
import { usePendingAction } from '../../room/game-kit/usePendingAction';
import type { ActiveGameProps } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './HigherLower.module.css';

/**
 * Higher or Lower (spec §2 y §6 «Juegos»), en el marco de juego (`GameScreen`). Arriba se mira: la placa con la ronda, la stat y el tiempo, el duelo de dos
 * cartas (la segunda con «???» hasta revelar, y entonces gira) y, al revelar, las barras comparadas. Abajo se actúa:
 * «Mayor / Igual / Menor» (atajos 1–3), la respuesta bloqueada o el veredicto con los puntos. Al lado, el marcador con
 * las rachas; en el móvil, entre el duelo y la pantalla inferior.
 *
 * Racha infinita (`mode: 'ENDLESS'`): sin número de rondas, la racha de cada uno es su puntuación y quien falla (o no
 * responde) cae: el servidor le quita `canAnswer` y aquí pasa a mirar con «Eliminado».
 *
 * Privacidad: solo se pinta lo proyectado. El valor del actual llega en `null` hasta el revelado, y con «Al revelar» las
 * respuestas ajenas también (solo `answeredIds`). Los sprites van por el proxy opaco y nunca se pinta el número de Pokédex.
 */
export function HigherLowerGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as HigherLowerPublicState;
  const config = room.selectedGameConfig as Partial<HigherLowerConfig> | null;
  const player = room.gamePlayerState as HigherLowerPlayerState | null;
  const offset = useServerOffset(room.serverNow);
  const active = game.phase === 'ROUND_ACTIVE';
  const remaining = Math.ceil(useRemainingMs(game.roundEndsAt ?? game.nextTransitionAt, offset) / 1000);
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  const category = higherLowerCategoryLabels[game.category];
  // Solo en `ROUND_RESULTS`: en la ronda siguiente `lastRound` sigue siendo el de la anterior.
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const endless = game.mode === 'ENDLESS';
  const selfOutcome = lastRound?.outcomes[selfId] ?? null;
  // En Racha infinita, quien cayó en una ronda anterior ya no juega: no tiene resultado y mira la partida.
  const eliminated = endless && game.playerIds.includes(selfId) && !(game.alive ?? []).includes(selfId) && !selfOutcome;
  const participant = game.playerIds.includes(selfId) && !eliminated;
  const selfStreak = game.streaks[selfId] ?? 0;
  const milestone = selfOutcome ? higherLowerStreakMilestone(selfOutcome) : null;
  const answer = player?.answer ?? null;
  const canAnswer = active && player?.canAnswer === true;
  const kind = higherLowerPlateKind({ phase: game.phase, canAnswer, answer, revealed: lastRound !== null });
  const bars = lastRound ? higherLowerBars(lastRound.previousValue, lastRound.currentValue) : null;
  useSfxCue('tick', answer ? game.roundNumber : null);
  useOutcomeCue(selfOutcome?.correct, game.roundNumber);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(higherLowerFocusKey(kind, game.roundNumber), titleRef);

  const { pending, submit: send } = usePendingAction((choice: HigherLowerChoice) => onAction({ type: 'ANSWER', choice }));
  const submit = (choice: HigherLowerChoice) => {
    if (canAnswer) void send(choice);
  };

  useChoiceShortcuts(canAnswer && !pending, (key) => {
    const choice = higherLowerChoiceFromShortcut(key);
    if (choice) submit(choice);
    return choice !== null;
  });

  const roundMs = Math.max(1, (config?.roundSeconds ?? 20) * 1_000);
  // Al revelar, el plazo de la siguiente ronda en el mismo hueco: la placa no cambia de alto.
  const timer: GameTimer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, totalMs: roundMs, label: 'Tiempo' }
    : { deadline: lastRound ? game.nextTransitionAt : null, serverOffset: offset, label: higherLowerLastReveal(game) ? 'Clasificación' : 'Siguiente ronda' };
  const modeLabel = gameModeLabel('higher-lower', game);
  const visibility = config?.answerVisibility ?? null;
  const meta = <>
    {modeLabel && <Chip tone="info">{modeLabel}</Chip>}
    {visibility && <Chip tone="neutral" icon={<Icon icon={Eye} size={18} />}>Respuestas {higherLowerVisibilityLabels[visibility].toLowerCase()}</Chip>}
  </>;

  const duel = <div className={s.duel} role="group" aria-label={`Duelo de ${category}`}>
    <HigherLowerDuelCard side="previous" pokemon={game.previousPokemon} category={category} flip={false} leader={bars !== null && bars.leader !== 'current'} />
    <span className={cx(s.vs, 'ol')} aria-hidden="true">VS</span>
    <HigherLowerDuelCard key={`current-${game.roundNumber}`} side="current" pokemon={game.currentPokemon} category={category} flip={lastRound !== null} leader={bars !== null && bars.leader !== 'previous'} />
  </div>;
  // Al revelar, las barras comparadas bajo el duelo (el duelo cede el alto que ocupan).
  const barsRow = lastRound ? <HigherLowerBars category={category} previous={{ name: game.previousPokemon.name, value: lastRound.previousValue }} current={{ name: game.currentPokemon.name, value: lastRound.currentValue }} /> : null;
  const side = <HigherLowerSidebar game={game} members={members} colors={colors} selfId={selfId} className={GAME_SIDE_FIT} />;

  // El hito de racha va en la región de la placa: el cut-in solo se ve.
  const announcement = [higherLowerAnnouncement({ kind, roundNumber: game.roundNumber, category, answer, correctAnswer: lastRound?.correctAnswer ?? null, outcome: selfOutcome, participant, endless, eliminated }), milestone?.spoken].filter(Boolean).join(' ');
  const bottom = <HigherLowerPlate kind={kind} answer={answer?.choice ?? null} pending={pending} correctAnswer={lastRound?.correctAnswer ?? null} outcome={selfOutcome}
    participant={participant} countdown={higherLowerRevealCountdown(game, remaining)} verdict={eliminated ? 'Eliminado' : higherLowerVerdict(selfOutcome, participant)}
    titleRef={titleRef} onAnswer={submit} endless={endless} eliminated={eliminated} streak={selfStreak} />;

  return <GameScreen gameName="Higher or Lower" roundNumber={game.roundNumber} totalRounds={game.totalRounds} phase={game.phase} roundLabel={endless ? `Ronda ${game.roundNumber}` : undefined}
    meta={meta} headingLead="Se compara" heading={category} timer={timer} announcement={announcement} clue={duel} hints={barsRow} side={side} bottom={bottom}
    className={cx(lastRound && s.revealed)} moment={milestone && <MomentCutin key={game.roundNumber} tone="yellow" title={milestone.title} subtitle={milestone.subtitle} />} />;
}
