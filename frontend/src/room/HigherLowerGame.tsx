import { gameModeLabel, type HigherLowerChoice, type HigherLowerConfig, type HigherLowerPlayerState, type HigherLowerPublicState, type RoomView } from '@pokemon-universe/shared/public';
import { useMemo, useRef } from 'react';
import { RevealCutIn } from '../components/RevealCutIn';
import { ServerTimer } from '../components/ServerTimer';
import { HigherLowerDuelCard, HigherLowerHud, HigherLowerPlate, HigherLowerSidebar } from '../games/higher-lower/HigherLowerParts';
import { higherLowerAnnouncement, higherLowerChoiceFromShortcut, higherLowerFocusKey, higherLowerPlateKind, higherLowerVerdict } from '../games/higher-lower/presentation';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { cx, ScreenSplit } from '../ui';
import { GameSkipSlot } from './GameSkipSlot';
import { HigherLowerBars } from './HigherLowerBars';
import { higherLowerBars, higherLowerCategoryLabels, higherLowerLastReveal, higherLowerRevealCountdown, higherLowerStreakMilestone } from './higher-lower-labels';
import { useFocusOnTransition } from './focus-transition';
import { useChoiceShortcuts } from './useChoiceShortcuts';
import { usePendingAction } from './usePendingAction';
import s from '../games/higher-lower/HigherLower.module.css';

/**
 * Higher or Lower (spec §2 y §6 «Juegos»). Arriba se mira: la placa con la ronda, la stat y el tiempo, el duelo de dos
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
export function HigherLowerGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as HigherLowerPublicState;
  const config = room.selectedGameConfig as Partial<HigherLowerConfig> | null;
  const player = room.gamePlayerState as HigherLowerPlayerState | null;
  const offset = useServerOffset(room.serverNow);
  const active = game.phase === 'ROUND_ACTIVE';
  const remaining = Math.ceil(useRemainingMs(game.roundEndsAt ?? game.nextTransitionAt, offset) / 1000);
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
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
  useSfxCue(selfOutcome ? selfOutcome.correct ? 'hit' : 'miss' : null, selfOutcome ? game.roundNumber : null);

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
  const timer = active
    ? <ServerTimer deadline={game.roundEndsAt} serverOffset={offset} totalMs={roundMs} label="Tiempo" />
    : lastRound ? <ServerTimer deadline={game.nextTransitionAt} serverOffset={offset} label={higherLowerLastReveal(game) ? 'Clasificación' : 'Siguiente ronda'} /> : null;

  const top = <div className={cx(s.top, lastRound && s.revealed)}>
    <HigherLowerHud roundNumber={game.roundNumber} totalRounds={endless ? null : game.totalRounds} category={category} visibility={config?.answerVisibility ?? null} timer={timer} modeLabel={gameModeLabel('higher-lower', game)} />
    <div className={s.duel} role="group" aria-label={`Duelo de ${category}`}>
      <HigherLowerDuelCard side="previous" pokemon={game.previousPokemon} category={category} flip={false} leader={bars !== null && bars.leader !== 'current'} />
      <span className={cx(s.vs, 'ol')} aria-hidden="true">VS</span>
      <HigherLowerDuelCard key={`current-${game.roundNumber}`} side="current" pokemon={game.currentPokemon} category={category} flip={lastRound !== null} leader={bars !== null && bars.leader !== 'previous'} />
    </div>
    {lastRound && <HigherLowerBars category={category} previous={{ name: game.previousPokemon.name, value: lastRound.previousValue }} current={{ name: game.currentPokemon.name, value: lastRound.currentValue }} />}
  </div>;

  const side = <div className={s.sideColumn}>
    <HigherLowerSidebar game={game} members={members} colors={colors} selfId={selfId} className={s.sidePanel} />
    <GameSkipSlot className={s.skip} />
  </div>;

  // El hito de racha va en la región de la placa: el cut-in solo se ve.
  const announcement = [higherLowerAnnouncement({ kind, roundNumber: game.roundNumber, category, answer, correctAnswer: lastRound?.correctAnswer ?? null, outcome: selfOutcome, participant, endless, eliminated }), milestone?.spoken].filter(Boolean).join(' ');
  const bottom = <HigherLowerPlate kind={kind} answer={answer?.choice ?? null} pending={pending} correctAnswer={lastRound?.correctAnswer ?? null} outcome={selfOutcome}
    participant={participant} countdown={higherLowerRevealCountdown(game, remaining)} verdict={eliminated ? 'Eliminado' : higherLowerVerdict(selfOutcome, participant)}
    announcement={announcement} titleRef={titleRef} onAnswer={submit} endless={endless} eliminated={eliminated} streak={selfStreak} />;

  return <div className={cx('content-row', s.screen)}>
    {milestone && <RevealCutIn key={game.roundNumber} tone="electric" title={milestone.title} subtitle={milestone.subtitle} live={false} />}
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
  </div>;
}
