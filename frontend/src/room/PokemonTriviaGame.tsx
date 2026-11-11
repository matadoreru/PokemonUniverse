import type { PokemonTriviaConfig, PokemonTriviaOptionId, PokemonTriviaPlayerState, PokemonTriviaPublicState } from '@pokemon-universe/shared/public';
import { Check, CheckCircle2, Clock3, Eye, MousePointerClick, Send, TimerOff, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TriviaAnswersBoard, TriviaBoard, TriviaScoreboard } from '../games/pokemon-trivia/TriviaParts';
import {
  triviaAnnouncement, triviaCategoryLabels, triviaConfirmAction, triviaDifficultyLabels, triviaDraftAfterSelect, triviaFocusKey, triviaOptionFromKey, triviaOptionLabel, triviaPlateKind, triviaVerdict, triviaVisibleRound, type TriviaPlateKind, type TriviaVerdict,
} from '../games/pokemon-trivia/presentation';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { Chip, Pill, ScorePop } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { GuessPanel, type GuessPlateContent } from './guess-kit';
import { GameScreen } from './game-kit/GameScreen';
import { useChoiceShortcuts } from './useChoiceShortcuts';
import { usePendingAction } from './usePendingAction';
import type { ActiveGameProps } from './room-command';
import { useRoomMembers } from './room-members';
import s from '../games/pokemon-trivia/PokemonTrivia.module.css';

/**
 * Pokémon Trivia (spec §2 y §6 «Juegos»), con el marco del kit (`GameScreen`: placa de la ronda con el plazo y
 * «Saltar», una sola región viva). Arriba, la pregunta en un `Panel` y las opciones en `Card`s grandes con su atajo
 * (teclas 1–4). Abajo, la placa: elegir y confirmar (como Shiny Quiz), la respuesta bloqueada, observar o, al revelar, el veredicto con los puntos. Al
 * lado, el marcador (quién ha respondido, en texto) o, al revelar, qué eligió cada uno.
 *
 * Privacidad: la respuesta correcta solo llega en `lastRound`, que el servidor manda en la revelación; aun así la
 * pantalla solo lo lee en `ROUND_RESULTS` (`triviaVisibleRound`).
 */
export function PokemonTriviaGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokemonTriviaPublicState;
  const player = room.gamePlayerState as PokemonTriviaPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonTriviaConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const [draft, setDraft] = useState<PokemonTriviaOptionId | null>(null);
  const { pending, submit } = usePendingAction(onAction);
  const submitting = pending !== null;
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
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

  // Una pregunta nueva empieza sin elección.
  useEffect(() => { setDraft(null); }, [game.roundNumber]);

  const selectOption = useCallback((optionId: PokemonTriviaOptionId) => {
    setDraft((current) => triviaDraftAfterSelect(current, optionId, canAnswer, submitting));
  }, [canAnswer, submitting]);

  const confirm = () => {
    const action = triviaConfirmAction(draft, canAnswer, submitting);
    if (action) void submit(action);
  };

  // Atajos como en Shiny Quiz: 1–4 eligen y Enter confirma (Intro sobre un control, una carta incluida, lo activa).
  useChoiceShortcuts(canAnswer && !submitting, (key) => {
    const optionId = triviaOptionFromKey(key, game.options);
    if (optionId) {
      selectOption(optionId);
      return true;
    }
    if (key !== 'Enter' || !draft) return false;
    confirm();
    return true;
  });

  const category = game.questionType ? triviaCategoryLabels[game.questionType] : null;
  const correct = result ? game.options.find((option) => option.id === result.correctOptionId) : undefined;
  const heading = correct ? `Correcta: ${correct.pokemon.name}` : category ? `Pregunta · ${category}` : 'Pokémon Trivia';
  const timer = result
    ? { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente pregunta' }
    : { deadline: game.phase === 'ROUND_ACTIVE' ? game.roundEndsAt : null, serverOffset: offset, label: 'Tiempo', totalMs: (config?.roundSeconds ?? 20) * 1_000 };
  const selected = player?.answer?.optionId ?? draft;
  const content = plateContent({ kind, game, player, verdict, countdown: `${last ? 'Clasificación' : 'Siguiente pregunta'} en ${Math.max(0, transition)}s`, optionCount: game.options.length, draft, submitting, onConfirm: confirm });

  return <GameScreen gameName="Pokémon Trivia" roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={heading} className={s.screen}
    meta={<Chip tone="neutral">{triviaDifficultyLabels[game.difficulty]}</Chip>}
    timer={timer} announcement={triviaAnnouncement({ kind, game, player, verdict })}
    clue={<TriviaBoard game={game} result={result} selected={selected} pending={submitting} canAnswer={canAnswer} members={members} selfId={selfId} onSelect={selectOption} />}
    side={result
      ? <TriviaAnswersBoard game={game} result={result} players={players} members={members} colors={colors} selfId={selfId} />
      : <TriviaScoreboard game={game} players={players} members={members} colors={colors} selfId={selfId} />}
    bottom={<GuessPanel kind={kind === 'reveal' ? 'reveal' : 'waiting'} titleRef={titleRef} question="" content={content} />} />;
}

function plateContent({ kind, game, player, verdict, countdown, optionCount, draft, submitting, onConfirm }: { kind: TriviaPlateKind; game: PokemonTriviaPublicState; player: PokemonTriviaPlayerState | null; verdict: TriviaVerdict | null; countdown: string; optionCount: number; draft: PokemonTriviaOptionId | null; submitting: boolean; onConfirm(): void }): GuessPlateContent {
  switch (kind) {
    // Como el voto de Shiny Quiz: elegir no envía; «Confirmar respuesta» (o Enter) sí.
    case 'answer': return {
      icon: MousePointerClick, tone: draft ? 'warn' : 'info', kicker: draft ? 'Has seleccionado' : 'Tu respuesta', title: draft ? triviaOptionLabel(game.options, draft) : 'Elige una opción',
      text: <span className={s.shortcuts}>Atajos: 1–{optionCount} · Enter confirma</span>,
      aside: <Pill variant="yellow" size="main" icon={Send} disabled={!draft} loading={submitting} aria-keyshortcuts="Enter" onClick={onConfirm}>Confirmar respuesta</Pill>,
    };
    case 'locked': return { icon: Check, tone: 'ok', kicker: 'Respuesta bloqueada', title: `${triviaOptionLabel(game.options, player!.answer!.optionId)} bloqueada`, text: 'Esperando al resto de entrenadores.' };
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'Sin respuesta esta ronda', title: 'Estás observando', text: 'Los espectadores no responden: el marcador se ve en directo y la solución, al revelar.' };
    case 'out': return { icon: Eye, tone: 'info', kicker: 'Estás observando', title: 'No respondes esta pregunta', text: 'Entraste con la partida empezada o sin conexión: jugarás en la siguiente.' };
    case 'reveal': return {
      icon: verdict?.tone === 'ok' ? CheckCircle2 : verdict?.tone === 'bad' ? (verdict.text === 'Sin respuesta' ? TimerOff : X) : Eye,
      tone: verdict?.tone ?? 'info', kicker: verdict?.text ?? 'Resultado de la pregunta', title: countdown,
      ...(verdict && verdict.points > 0 ? { aside: <strong className={s.points}>{verdict.tone === 'ok' && <ScorePop points={verdict.points} color="var(--ok)" placement="before" self />}+{verdict.points}<small> puntos</small></strong> } : {}),
    };
    default: return { icon: Clock3, tone: 'info', kicker: 'Pokémon Trivia', title: 'Esperando al servidor…', text: 'La pregunta llega en un momento.' };
  }
}
