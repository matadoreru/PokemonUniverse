import type { PokemonTriviaConfig, PokemonTriviaOptionId, PokemonTriviaPlayerState, PokemonTriviaPublicState, RoomView } from '@pokemon-universe/shared/public';
import { Check, CheckCircle2, Clock3, Eye, MousePointerClick, TimerOff, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TriviaAnswersBoard, TriviaBoard, TriviaScoreboard } from '../games/pokemon-trivia/TriviaParts';
import {
  triviaAnnouncement, triviaCategoryLabels, triviaDifficultyLabels, triviaFocusKey, triviaOptionFromKey, triviaOptionLabel, triviaPlateKind, triviaVerdict, triviaVisibleRound, type TriviaPlateKind, type TriviaVerdict,
} from '../games/pokemon-trivia/presentation';
import { ScorePop } from '../components/ScorePop';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { Chip } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { GuessPanel, GuessScreen, type GuessPlateContent } from './guess-kit';
import s from '../games/pokemon-trivia/PokemonTrivia.module.css';

/** El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí no se repite. */
const ignoreFailure = () => undefined;

/** Los atajos 1–4 no se disparan mientras se escribe en un campo. */
function ignoresGameShortcuts(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Pokémon Trivia (spec §2 y §6 «Juegos»), con el marco del kit (`GuessScreen`: placa de la ronda con el plazo y
 * «Saltar», una sola región viva). Arriba, la pregunta en un `Panel` y las opciones en `Card`s grandes con su atajo
 * (teclas 1–4). Abajo, la placa: elegir, la respuesta bloqueada, observar o, al revelar, el veredicto con los puntos. Al
 * lado, el marcador (quién ha respondido, en texto) o, al revelar, qué eligió cada uno.
 *
 * Privacidad: la respuesta correcta solo llega en `lastRound`, que el servidor manda en la revelación; aun así la
 * pantalla solo lo lee en `ROUND_RESULTS` (`triviaVisibleRound`).
 */
export function PokemonTriviaGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokemonTriviaPublicState;
  const player = room.gamePlayerState as PokemonTriviaPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonTriviaConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const [pending, setPending] = useState<PokemonTriviaOptionId | null>(null);
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  // Jugadores de la partida: los que puntúan (los espectadores no), en el orden de la sala.
  const players = useMemo(() => room.members.map((member) => member.id).filter((id) => id in game.scores), [room.members, game.scores]);
  const result = triviaVisibleRound(game);
  const kind = triviaPlateKind({ game, player });
  const participating = player?.role === 'PLAYER';
  const canAnswer = kind === 'answer';
  const verdict = result ? triviaVerdict(result, game.options, selfId, participating) : null;
  const last = game.roundNumber >= game.totalRounds;
  const transition = Math.ceil(useRemainingMs(result ? game.nextTransitionAt : null, offset) / 1_000);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(triviaFocusKey(kind, game.roundNumber), titleRef);
  useSfxCue('tick', player?.answer ? game.roundNumber : null);
  useSfxCue(verdict && participating ? verdict.tone === 'ok' ? 'hit' : 'miss' : null, result ? game.roundNumber : null);

  const submit = useCallback(async (optionId: PokemonTriviaOptionId) => {
    if (!canAnswer || pending) return;
    setPending(optionId);
    try {
      await onAction({ type: 'ANSWER', optionId }).catch(ignoreFailure);
    } finally {
      setPending(null);
    }
  }, [canAnswer, onAction, pending]);

  useEffect(() => {
    if (!canAnswer || pending) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || ignoresGameShortcuts(event.target)) return;
      const optionId = triviaOptionFromKey(event.key, game.options);
      if (!optionId) return;
      event.preventDefault();
      void submit(optionId);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canAnswer, pending, submit, game.options]);

  const category = game.questionType ? triviaCategoryLabels[game.questionType] : null;
  const correct = result ? game.options.find((option) => option.id === result.correctOptionId) : undefined;
  const heading = correct ? `Correcta: ${correct.pokemon.name}` : category ? `Pregunta · ${category}` : 'Pokémon Trivia';
  const timer = result
    ? { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente pregunta' }
    : { deadline: game.phase === 'ROUND_ACTIVE' ? game.roundEndsAt : null, serverOffset: offset, label: 'Tiempo', totalMs: (config?.roundSeconds ?? 20) * 1_000 };
  const selected = pending ?? player?.answer?.optionId ?? null;
  const content = plateContent({ kind, game, player, verdict, countdown: `${last ? 'Clasificación' : 'Siguiente pregunta'} en ${Math.max(0, transition)}s`, optionCount: game.options.length });

  return <GuessScreen gameName="Pokémon Trivia" roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={heading} className={s.screen}
    meta={<Chip tone="neutral">{triviaDifficultyLabels[game.difficulty]}</Chip>}
    timer={timer} announcement={triviaAnnouncement({ kind, game, player, verdict })}
    clue={<TriviaBoard game={game} result={result} selected={selected} pending={pending} canAnswer={canAnswer} members={members} colors={colors} selfId={selfId} onAnswer={(id) => void submit(id)} />}
    side={result
      ? <TriviaAnswersBoard game={game} result={result} players={players} members={members} colors={colors} selfId={selfId} />
      : <TriviaScoreboard game={game} players={players} members={members} colors={colors} selfId={selfId} />}
    bottom={<GuessPanel kind={kind === 'reveal' ? 'reveal' : 'waiting'} titleRef={titleRef} question="" content={content} />} />;
}

function plateContent({ kind, game, player, verdict, countdown, optionCount }: { kind: TriviaPlateKind; game: PokemonTriviaPublicState; player: PokemonTriviaPlayerState | null; verdict: TriviaVerdict | null; countdown: string; optionCount: number }): GuessPlateContent {
  switch (kind) {
    case 'answer': return { icon: MousePointerClick, tone: 'warn', kicker: 'Tu respuesta', title: 'Elige una opción', text: `Pulsa una carta o las teclas 1 a ${optionCount}. Acertar rápido da más puntos.` };
    case 'locked': return { icon: Check, tone: 'ok', kicker: 'Respuesta bloqueada', title: `${triviaOptionLabel(game.options, player!.answer!.optionId)} bloqueada`, text: 'Esperando al resto de entrenadores.' };
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'Sin respuesta esta ronda', title: 'Estás observando', text: 'Los espectadores no responden: el marcador y la solución se ven en directo.' };
    case 'out': return { icon: Eye, tone: 'info', kicker: 'Estás observando', title: 'No respondes esta pregunta', text: 'Entraste con la partida empezada o sin conexión: jugarás en la siguiente.' };
    case 'reveal': return {
      icon: verdict?.tone === 'ok' ? CheckCircle2 : verdict?.tone === 'bad' ? (verdict.text === 'Sin respuesta' ? TimerOff : X) : Eye,
      tone: verdict?.tone ?? 'info', kicker: verdict?.text ?? 'Resultado de la pregunta', title: countdown,
      ...(verdict && verdict.points > 0 ? { aside: <strong className={s.points}>{verdict.tone === 'ok' && <ScorePop points={verdict.points} tone="leaf" self />}+{verdict.points}<small> puntos</small></strong> } : {}),
    };
    default: return { icon: Clock3, tone: 'info', kicker: 'Pokémon Trivia', title: 'Esperando al servidor…', text: 'La pregunta llega en un momento.' };
  }
}
