import type { GamePhase, RoomMemberView, RoomView } from '@pokemon-universe/shared/public';
import { useRef, type RefObject } from 'react';
import { useRemainingMs, useServerOffset } from '../../hooks/useServerTime';
import { useSfxCue } from '../../hooks/useSfxCue';
import { useFocusOnTransition } from '../focus-transition';
import type { GuessTimer } from './GuessScreen';
import { useRoomMembers } from '../room-members';
import {
  guessAnnouncement, guessFocusKey, guessOwnLastAttempt, guessPanelKind, guessVerdict,
  type GuessAttemptLike, type GuessPanelKind, type GuessVerdict,
} from './presentation';

/** Lo que el hook lee del estado público de un juego de adivinar (los seis lo tienen igual). */
export interface GuessRoundGame<L> {
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  attempts: readonly GuessAttemptLike[];
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: L | null;
}

/** Lo que el hook lee del estado propio del jugador (puede faltar: `null`). */
export interface GuessRoundPlayer {
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  /** Solo con `publicAttempts` apagado: los fallos propios de la ronda (la vista pública ya no los trae). */
  attempts?: readonly GuessAttemptLike[] | undefined;
}

/** El resultado de la ronda: al menos los aciertos (para el veredicto de quien mira). */
export interface GuessRoundResultLike { solves: Readonly<Record<string, { solveOrder: number; points: number }>> }

export interface GuessRoundOptions<L extends GuessRoundResultLike> {
  room: RoomView;
  selfId: string;
  game: GuessRoundGame<L>;
  player: GuessRoundPlayer | null;
  /** Quién responde: por defecto, el rol `PLAYER` del miembro (Palette y Cry pasan `player.role === 'PLAYER'`). */
  participating?: boolean;
  /** Lo que era (nombre, o «3 respuestas válidas»), para la región viva de la revelación. */
  answer: (lastRound: L) => string;
  /** Segundos de la ronda (`config.roundSeconds`): la barra del plazo no se rehace al volver a montar. */
  roundSeconds?: number | undefined;
}

/** Props comunes de `GuessPanel` que salen del estado de la ronda (el juego añade pregunta, buscador y textos). */
export interface GuessRoundPanelProps {
  kind: GuessPanelKind;
  titleRef: RefObject<HTMLHeadingElement | null>;
  cooldownMs: number;
  lastWrong: string | null;
  attemptCount: number;
  solveOrder: number | null;
  roundPoints: number;
  verdict: GuessVerdict | null;
  countdown: string;
}

export interface GuessRound<L> {
  members: ReadonlyMap<string, RoomMemberView>;
  /** Índice de cada jugador en la sala (para `playerColor`). */
  colors: ReadonlyMap<string, number>;
  offset: number;
  active: boolean;
  participating: boolean;
  /** La respuesta: solo en `ROUND_RESULTS` (privacidad). Nunca leas `game.lastRound` directamente. */
  lastRound: L | null;
  kind: GuessPanelKind;
  ownLast: GuessAttemptLike | null;
  /** Última ronda de la partida (la revelación lleva a la clasificación). */
  last: boolean;
  /** Segundos que faltan para la siguiente transición (pista, zoom, ronda), redondeados hacia arriba. */
  transitionRemaining: number;
  announcement: string;
  timer: GuessTimer;
  panel: GuessRoundPanelProps;
}

/**
 * Estado común de la pantalla de un juego de adivinar: los mapas de la sala, el plazo, quién responde, la respuesta
 * (solo en la revelación), qué placa toca abajo, el foco al acertar o revelar, el sonido del acierto, el aviso de la
 * región viva y las props de `GuessPanel`. Cada juego pinta su pista, sus pistas extra y su revelación con esto.
 */
export function useGuessRound<L extends GuessRoundResultLike>({ room, selfId, game, player, participating: forced, answer, roundSeconds }: GuessRoundOptions<L>): GuessRound<L> {
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  const offset = useServerOffset(room.serverNow);
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? null, offset);
  const transitionRemaining = Math.ceil(useRemainingMs(game.nextTransitionAt, offset) / 1_000);
  const active = game.phase === 'ROUND_ACTIVE';
  const participating = forced ?? members.get(selfId)?.role === 'PLAYER';
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const kind = guessPanelKind(game.phase, player ? { participating, canGuess: player.canGuess, solved: player.solved } : null, lastRound !== null);
  const ownLast = active ? guessOwnLastAttempt(player?.attempts ?? game.attempts, selfId) : null;

  useSfxCue('hit', active && player?.solved ? game.roundNumber : null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(guessFocusKey(kind, game.roundNumber), titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const next = last ? 'Clasificación' : 'Siguiente ronda';
  const announcement = guessAnnouncement({ kind, roundNumber: game.roundNumber, answer: lastRound ? answer(lastRound) : null, solveOrder: player?.solveOrder ?? null, roundPoints: player?.roundPoints ?? 0, lastWrong: ownLast?.guessedPokemon.name ?? null, attemptCount: player?.attemptCount ?? 0 });
  const timer: GuessTimer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Tiempo', totalMs: roundSeconds ? roundSeconds * 1_000 : undefined }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: next };

  return {
    members, colors, offset, active, participating, lastRound, kind, ownLast, last, transitionRemaining, announcement, timer,
    panel: {
      kind, titleRef, cooldownMs, lastWrong: ownLast?.guessedPokemon.name ?? null, attemptCount: player?.attemptCount ?? 0,
      solveOrder: player?.solveOrder ?? null, roundPoints: player?.roundPoints ?? 0,
      verdict: lastRound ? guessVerdict(lastRound.solves, selfId, participating) : null,
      countdown: `${next} en ${Math.max(1, transitionRemaining)}s`,
    },
  };
}
