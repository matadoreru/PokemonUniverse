import type { RoomView, TcgHigherLowerChoice, TcgHigherLowerConfig, TcgHigherLowerPlayerState, TcgHigherLowerPublicState } from '@pokemon-universe/shared/public';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ServerTimer } from '../components/ServerTimer';
import { HigherLowerHud } from '../games/higher-lower/HigherLowerParts';
import { formatTcgPrice, tcgAnnouncement, tcgChoiceFromShortcut, tcgFocusKey, tcgPlateKind, tcgVerdict } from '../games/tcg-higher-lower/presentation';
import { TcgDuelCard, TcgPlate, TcgPriceStrip, TcgSidebar } from '../games/tcg-higher-lower/TcgParts';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { cx, ScreenSplit } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { GameSkipSlot } from './GameSkipSlot';
import { higherLowerRevealCountdown } from './higher-lower-labels';
import hl from '../games/higher-lower/HigherLower.module.css';
import s from '../games/tcg-higher-lower/TcgHigherLower.module.css';

/** El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí no se repite. */
const ignoreFailure = () => undefined;

/** Los atajos 1–3 no se disparan mientras se escribe en un campo. */
function ignoresGameShortcuts(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Higher or Lower: Cartas (spec §2 y §6 «Juegos»), con el lenguaje de Higher or Lower. Arriba se mira: la placa con la
 * ronda y el tiempo, el duelo de dos cartas TCG (la nueva con «¿? €» hasta revelar, y entonces gira) y, al revelar, la
 * franja con los dos precios y la diferencia. Abajo se actúa: «Más / Igual / Menos» (atajos 1–3), la respuesta
 * bloqueada o el veredicto con los puntos. Al lado, el marcador con las rachas y, al revelar, qué eligió cada uno.
 *
 * Privacidad: el precio de la nueva carta y `lastRound` solo se leen en `ROUND_RESULTS` (el servidor ya los manda en
 * `null` antes; aquí además no se pintan aunque llegaran). Las respuestas ajenas no se proyectan en la ronda.
 */
export function TcgHigherLowerGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as TcgHigherLowerPublicState;
  const config = room.selectedGameConfig as Partial<TcgHigherLowerConfig> | null;
  const player = room.gamePlayerState as TcgHigherLowerPlayerState | null;
  const [pending, setPending] = useState<TcgHigherLowerChoice | null>(null);
  const offset = useServerOffset(room.serverNow);
  const active = game.phase === 'ROUND_ACTIVE';
  const remaining = Math.ceil(useRemainingMs(game.roundEndsAt ?? game.nextTransitionAt, offset) / 1000);
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
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

  const submit = useCallback(async (choice: TcgHigherLowerChoice) => {
    if (!canAnswer || pending) return;
    setPending(choice);
    try {
      await onAction({ type: 'ANSWER', choice }).catch(ignoreFailure);
    } finally {
      setPending(null);
    }
  }, [canAnswer, onAction, pending]);

  useEffect(() => {
    if (!canAnswer || pending || answer) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || ignoresGameShortcuts(event.target)) return;
      const choice = tcgChoiceFromShortcut(event.key);
      if (!choice) return;
      event.preventDefault();
      void submit(choice);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [answer, canAnswer, pending, submit]);

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
    titleRef={titleRef} onAnswer={(choice) => void submit(choice)} />;

  return <div className={cx('content-row', hl.screen)} data-testid="tcg-higher-lower-screen">
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
  </div>;
}
