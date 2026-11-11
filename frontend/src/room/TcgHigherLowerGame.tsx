import type { TcgHigherLowerChoice, TcgHigherLowerConfig, TcgHigherLowerPlayerState, TcgHigherLowerPublicState } from '@pokemon-universe/shared/public';
import { useRef } from 'react';
import { ServerTimer } from '../components/ServerTimer';
import { HigherLowerHud } from '../games/higher-lower/HigherLowerParts';
import { formatTcgPrice, tcgAnnouncement, tcgChoiceFromShortcut, tcgFocusKey, tcgPlateKind, tcgVerdict } from '../games/tcg-higher-lower/presentation';
import { TcgDuelCard, TcgPlate, TcgPriceStrip, TcgSidebar } from '../games/tcg-higher-lower/TcgParts';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { cx, ScreenSplit } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { useChoiceShortcuts } from './useChoiceShortcuts';
import { usePendingAction } from './usePendingAction';
import { GameSkipSlot } from './GameSkipSlot';
import { higherLowerRevealCountdown } from './higher-lower-labels';
import type { ActiveGameProps } from './room-command';
import { useRoomMembers } from './room-members';
import hl from '../games/higher-lower/HigherLower.module.css';
import s from '../games/tcg-higher-lower/TcgHigherLower.module.css';

/**
 * Higher or Lower: Cartas (spec §2 y §6 «Juegos»), con el lenguaje de Higher or Lower. Arriba se mira: la placa con la
 * ronda y el tiempo, el duelo de dos cartas TCG (la nueva con «¿? €» hasta revelar, y entonces gira) y, al revelar, la
 * franja con los dos precios y la diferencia. Abajo se actúa: «Más / Igual / Menos» (atajos 1–3), la respuesta
 * bloqueada o el veredicto con los puntos. Al lado, el marcador con las rachas y, al revelar, qué eligió cada uno.
 *
 * Privacidad: el precio de la nueva carta y `lastRound` solo se leen en `ROUND_RESULTS` (el servidor ya los manda en
 * `null` antes; aquí además no se pintan aunque llegaran). Las respuestas ajenas no se proyectan en la ronda.
 */
export function TcgHigherLowerGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as TcgHigherLowerPublicState;
  const config = room.selectedGameConfig as Partial<TcgHigherLowerConfig> | null;
  const player = room.gamePlayerState as TcgHigherLowerPlayerState | null;
  const offset = useServerOffset(room.serverNow);
  const active = game.phase === 'ROUND_ACTIVE';
  const remaining = Math.ceil(useRemainingMs(game.roundEndsAt ?? game.nextTransitionAt, offset) / 1000);
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  // Solo en `ROUND_RESULTS`: fuera de ella no se pinta ningún precio de la nueva carta ni el resultado.
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const participant = game.playerIds.includes(selfId);
  const selfOutcome = lastRound?.outcomes[selfId] ?? null;
  const answer = player?.answer ?? null;
  const canAnswer = active && player?.canAnswer === true;
  const kind = tcgPlateKind({ phase: game.phase, canAnswer, answer, revealed: lastRound !== null });
  const comparison = lastRound ? Math.sign(Number(lastRound.currentPrice) - Number(lastRound.previousPrice)) : null;
  useSfxCue('tick', answer ? game.roundNumber : null);
  useSfxCue(selfOutcome ? selfOutcome.correct ? 'hit' : 'miss' : null, selfOutcome ? game.roundNumber : null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(tcgFocusKey(kind, game.roundNumber), titleRef);

  const { pending, submit: send } = usePendingAction((choice: TcgHigherLowerChoice) => onAction({ type: 'ANSWER', choice }));
  const submit = (choice: TcgHigherLowerChoice) => {
    if (canAnswer) void send(choice);
  };

  useChoiceShortcuts(canAnswer && !pending && !answer, (key) => {
    const choice = tcgChoiceFromShortcut(key);
    if (choice) submit(choice);
    return choice !== null;
  });

  const roundMs = Math.max(1, (config?.roundSeconds ?? 15) * 1_000);
  const timer = active
    ? <ServerTimer deadline={game.roundEndsAt} serverOffset={offset} totalMs={roundMs} label="Tiempo" />
    : lastRound ? <ServerTimer deadline={game.nextTransitionAt} serverOffset={offset} label={game.roundNumber >= game.totalRounds ? 'Clasificación' : 'Siguiente ronda'} /> : null;

  const top = <div className={cx(hl.top, lastRound && hl.revealed)}>
    <HigherLowerHud roundNumber={game.roundNumber} totalRounds={game.totalRounds} category="Precio de mercado" visibility={null} timer={timer} />
    <div className={s.duel} role="group" aria-label="Duelo de precios">
      <TcgDuelCard side="previous" card={game.previousCard} price={game.previousCard.price} currency={game.currency} flip={false} leader={comparison !== null && comparison <= 0} />
      <span className={cx(hl.vs, 'ol')} aria-hidden="true">VS</span>
      <TcgDuelCard key={`current-${game.roundNumber}`} side="current" card={game.currentCard} price={lastRound ? lastRound.currentPrice : null} currency={game.currency} flip={lastRound !== null} leader={comparison !== null && comparison >= 0} />
    </div>
    {lastRound && <TcgPriceStrip previous={lastRound.previousPrice} current={lastRound.currentPrice} currency={game.currency} correctAnswer={lastRound.correctAnswer} />}
  </div>;

  const side = <div className={hl.sideColumn}>
    <TcgSidebar game={game} lastRound={lastRound} members={members} colors={colors} selfId={selfId} className={hl.sidePanel} />
    <GameSkipSlot className={hl.skip} />
  </div>;

  const announcement = tcgAnnouncement({
    kind, roundNumber: game.roundNumber, answer, correctAnswer: lastRound?.correctAnswer ?? null, outcome: selfOutcome, participant,
    prices: lastRound ? { previous: formatTcgPrice(lastRound.previousPrice, game.currency), current: formatTcgPrice(lastRound.currentPrice, game.currency) } : null,
  });
  const bottom = <TcgPlate kind={kind} answer={answer?.choice ?? null} pending={pending} correctAnswer={lastRound?.correctAnswer ?? null} outcome={selfOutcome}
    participant={participant} countdown={higherLowerRevealCountdown(game, remaining)} verdict={tcgVerdict(selfOutcome, participant)}
    titleRef={titleRef} onAnswer={submit} />;

  return <div className={cx('content-row', hl.screen)} data-testid="tcg-higher-lower-screen">
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
  </div>;
}
