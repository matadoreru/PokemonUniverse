import type { RoomView, UnownAlphabetEntry, UnownToken, UnownTranslatorConfig, UnownTranslatorPlayerState, UnownTranslatorPublicState } from '@pokemon-universe/shared/public';
import { gameModeName, UNOWN_GLYPH_COUNT, UNOWN_MAX_GUESS_LENGTH, unownTranslatorScoringLabel } from '@pokemon-universe/shared/public';
import { CheckCircle2, Clock3, Eye, Hourglass, Languages, Send, Trophy, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { hintCountdownLabel, newLetters, newLettersAnnouncement, splitWords } from '../games/unown-translator/presentation';
import { useNow, useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { Chip, Field, Icon, Pill, UnownGlyph } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { attemptsText, GuessClue, GuessScreen, guessSeconds, ordinal, pointsWord, type GuessTimer } from './guess-kit';
import { guessSearchAutoFocus } from './guess-kit/presentation';
import { ResponseProgress, SocialPlate, type SocialPlateContent } from './social-kit';
import { hiddenLettersText, UnownRoundReveal } from './UnownTranslatorResults';
import s from '../games/unown-translator/UnownTranslator.module.css';

const GAME_NAME = 'Traductor Unown';
const QUESTION = 'Descifra el mensaje';
/** El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí no se repite. */
const ignoreFailure = () => undefined;

/** Una pieza del mensaje: el glifo (oculto o con su letra debajo) o el carácter que no se cifra. */
function MessageToken({ token }: { token: UnownToken }) {
  if (token.kind === 'LITERAL') return <span className={s.literal}>{token.text}</span>;
  return <UnownGlyph glyph={token.glyph} size="lg" className={s.glyph ?? ''} {...(token.kind === 'LETTER' ? { letter: token.letter } : {})} />;
}

/**
 * El mensaje cifrado: cada palabra en un bloque que no se parte; las palabras sí bajan de línea. `--longest` (las piezas
 * de la palabra más larga) deja que el CSS escale los glifos para que esa palabra quepa a lo ancho.
 */
function UnownMessage({ tokens }: { tokens: readonly UnownToken[] }) {
  const words = splitWords(tokens);
  const longest = Math.max(1, ...words.map((word) => word.length));
  return <div className={s.message} data-testid="unown-message" style={{ '--longest': longest } as CSSProperties}>
    {words.map((word, index) => <span key={index} className={s.word}>
      {word.map((token, position) => <MessageToken key={position} token={token} />)}
    </span>)}
  </div>;
}

/** Leyenda «Alfabeto»: los 26 glifos en orden de índice, con la letra de los que ya se conocen. */
function UnownAlphabet({ alphabet }: { alphabet: readonly UnownAlphabetEntry[] }) {
  const known = new Map(alphabet.map((entry) => [entry.glyph, entry.letter]));
  return <section className={s.alphabet} aria-labelledby="unown-alphabet-title" data-testid="unown-alphabet">
    <h2 id="unown-alphabet-title" className={s.alphabetTitle}>Alfabeto</h2>
    <ol className={s.legend}>
      {Array.from({ length: UNOWN_GLYPH_COUNT }, (_, glyph) => {
        const letter = known.get(glyph);
        return <li key={glyph}><UnownGlyph glyph={glyph} size="sm" className={s.legendGlyph ?? ''} {...(letter ? { letter } : {})} /></li>;
      })}
    </ol>
  </section>;
}

/** Campo de respuesta con Enviar: desactivado mientras dura el bloqueo tras un fallo; se vacía al enviarse. */
function UnownAnswerForm({ roundNumber, cooling, fieldRef, onGuess }: { roundNumber: number; cooling: boolean; fieldRef: RefObject<HTMLInputElement | null>; onGuess(text: string): Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // Con ratón o teclado, el campo toma el foco al empezar la ronda (sin desplazar); en táctil abriría el teclado.
  useEffect(() => { if (guessSearchAutoFocus()) fieldRef.current?.focus({ preventScroll: true }); }, [fieldRef]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy || cooling) return;
    setBusy(true);
    void onGuess(value).then(() => setText(''), ignoreFailure).finally(() => setBusy(false));
  };
  return <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
    <div className="min-w-0 flex-1 basis-56">
      <Field ref={fieldRef} label={`Respuesta para la ronda ${roundNumber}`} value={text} maxLength={UNOWN_MAX_GUESS_LENGTH} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        enterKeyHint="send" placeholder="Escribe lo que dice el mensaje" onChange={(event) => setText(event.target.value.slice(0, UNOWN_MAX_GUESS_LENGTH))} />
    </div>
    <Pill type="submit" variant="yellow" icon={Send} loading={busy} disabled={cooling || busy || !text.trim()} data-testid="unown-send">Enviar</Pill>
  </form>;
}

/**
 * Lo que anuncia la única región viva: «Nueva letra: P.» por cada letra nueva del alfabeto, «¡Descifrado!» al acertar
 * uno mismo, «Respuesta incorrecta (N intentos).» tras cada fallo (con la cuenta, para que dos seguidos se anuncien) y,
 * al revelar, lo que decía el mensaje. Al montarse (o al volver a conectar) no anuncia las letras que ya había.
 */
function useUnownAnnouncement(game: UnownTranslatorPublicState, player: UnownTranslatorPlayerState | null, answer: string | null): string {
  const [text, setText] = useState('');
  const previous = useRef({ alphabet: game.alphabet, solved: player?.solved ?? false, attempts: player?.attemptCount ?? 0, answer });
  useEffect(() => {
    const before = previous.current;
    const solved = player?.solved ?? false;
    const attempts = player?.attemptCount ?? 0;
    const parts: string[] = [];
    const letters = newLetters(before.alphabet, game.alphabet);
    if (letters.length > 0) parts.push(newLettersAnnouncement(letters));
    if (solved && !before.solved) parts.push('¡Descifrado!');
    else if (attempts > before.attempts && player?.lastAttempt?.outcome === 'INCORRECT') parts.push(`Respuesta incorrecta (${attemptsText(attempts)}).`);
    if (answer && answer !== before.answer) parts.push(`Ronda ${game.roundNumber} terminada: decía ${answer}.`);
    previous.current = { alphabet: game.alphabet, solved, attempts, answer };
    if (parts.length > 0) setText(parts.join(' '));
  }, [game.alphabet, game.roundNumber, player?.solved, player?.attemptCount, player?.lastAttempt?.outcome, answer]);
  return text;
}

/**
 * Traductor Unown con el marco del kit de adivinar. Arriba: la placa de la ronda, el mensaje en glifos (con cuándo
 * llega la siguiente letra) y la leyenda del alfabeto; en la revelación, lo que decía. Abajo, el campo de respuesta, el
 * acierto o el veredicto. Al lado, quién lo ha descifrado con sus puntos de la ronda o, al revelar, los aciertos en
 * orden con las letras que seguían ocultas y quién no lo descifró.
 *
 * Privacidad: el mensaje llega como piezas (el servidor solo traduce los glifos del alfabeto). La respuesta solo llega
 * en `lastRound` y en la `answer` propia de quien ya acertó; `lastRound` solo se lee en `ROUND_RESULTS`.
 */
export function UnownTranslatorGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as UnownTranslatorPublicState;
  const player = room.gamePlayerState as UnownTranslatorPlayerState | null;
  const config = room.selectedGameConfig as Partial<UnownTranslatorConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const active = game.phase === 'ROUND_ACTIVE';
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const participating = player?.role === 'PLAYER';
  const solved = active && participating && player.solved;
  const canGuess = active && participating && player.canGuess && !player.solved;
  const cooldownMs = useRemainingMs(canGuess ? player.cooldownUntil : null, offset);
  const transitionMs = useRemainingMs(lastRound ? game.nextTransitionAt : null, offset);
  const serverNow = useNow(active && game.nextHintAt !== null, 250) + offset;
  const last = game.roundNumber >= game.totalRounds;
  const next = last ? 'Clasificación' : 'Siguiente ronda';

  const titleRef = useRef<HTMLHeadingElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  useFocusOnTransition(solved ? `solved-${game.roundNumber}` : lastRound ? `reveal-${game.roundNumber}` : null, titleRef);
  useSfxCue('hit', solved ? game.roundNumber : null);
  const announcement = useUnownAnnouncement(game, player, lastRound?.answer ?? null);

  const mode = gameModeName('unown-translator', lastRound?.mode ?? game.mode);
  const meta = mode ? <Chip tone="info">{mode}</Chip> : null;
  const timer: GuessTimer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Tiempo', totalMs: config?.roundSeconds ? config.roundSeconds * 1_000 : undefined }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: next };

  const clue = lastRound
    ? <UnownRoundReveal round={lastRound} />
    : <GuessClue label="Mensaje cifrado" className={s.stage}>
      <UnownMessage tokens={game.tokens} />
      {active && <span className={s.next}><Chip tone="neutral" icon={<Icon icon={Clock3} size={18} />}>{hintCountdownLabel(game.nextHintAt, serverNow)}</Chip></span>}
    </GuessClue>;
  const hints = active ? <UnownAlphabet alphabet={game.alphabet} /> : null;

  const side = lastRound
    ? (() => {
      const solves = new Map(lastRound.solves.map((solve, index) => [solve.playerId, { ...solve, order: index + 1 }]));
      const ids = [...lastRound.solves.map((solve) => solve.playerId), ...lastRound.missingPlayerIds.filter((id) => !solves.has(id))];
      return <ResponseProgress title="Puntos de la ronda" members={room.members} playerIds={ids} doneIds={[...solves.keys()]} selfId={selfId} count={false}
        status={(id) => {
          const solve = solves.get(id);
          return solve ? { tone: 'ok', text: `${ordinal(solve.order)} · ${hiddenLettersText(solve.hiddenLetters)}`, icon: CheckCircle2 } : { tone: 'bad', text: 'No lo descifró', icon: X };
        }}
        value={(id) => `+${solves.get(id)?.points ?? 0}`} />;
    })()
    : <ResponseProgress title="Descifrado" members={room.members} playerIds={game.playerIds} doneIds={game.solvedPlayerIds} selfId={selfId}
      doneText="Descifrado" pendingText="Descifrando…" note="La respuesta sigue oculta hasta el final de la ronda."
      value={(id) => (game.solvedPlayerIds.includes(id) ? `+${game.roundPointsByPlayer[id] ?? 0}` : null)} />;

  const points = (value: number) => <strong>+{value} {pointsWord(value)}</strong>;
  let content: SocialPlateContent;
  if (canGuess) {
    const wrong = player.lastAttempt?.outcome === 'INCORRECT';
    content = {
      icon: Languages, tone: 'info', kicker: player.attemptCount > 0 ? `Tu respuesta · ${attemptsText(player.attemptCount)}` : 'Tu respuesta', title: '¿Qué dice el mensaje?',
      text: unownTranslatorScoringLabel(),
      ...(wrong ? { aside: <Chip tone={cooldownMs > 0 ? 'warn' : 'bad'} icon={<Icon icon={cooldownMs > 0 ? Hourglass : X} size={18} />}>{cooldownMs > 0 ? `No es eso · otra en ${guessSeconds(cooldownMs)}` : 'No es eso'}</Chip> } : {}),
    };
  } else if (solved) {
    content = {
      icon: CheckCircle2, tone: 'ok', kicker: 'Tu respuesta', title: '¡Descifrado!',
      text: <>Decía <span className={s.answerText}>{player.answer}</span>. Sigue oculto para los demás.</>, aside: points(game.roundPointsByPlayer[selfId] ?? 0),
    };
  } else if (active && !participating) {
    content = { icon: Eye, tone: 'info', kicker: 'No descifras en esta ronda', title: 'Estás observando', text: 'Las letras y los aciertos aparecen en directo.' };
  } else if (active) {
    content = { icon: Eye, tone: 'info', kicker: 'Estás observando', title: 'No juegas esta partida', text: 'Entraste con la partida empezada: jugarás en la siguiente.' };
  } else if (lastRound) {
    const index = lastRound.solves.findIndex((solve) => solve.playerId === selfId);
    const own = index >= 0 ? lastRound.solves[index] : undefined;
    const verdict = own ? `¡Descifrado! ${ordinal(index + 1)} en acertar` : participating || game.playerIds.includes(selfId) ? 'Esta vez no lo descifraste' : 'Estás observando';
    content = {
      icon: own ? Trophy : Eye, tone: own ? 'ok' : 'info', kicker: verdict, title: `${next} en ${Math.max(1, Math.ceil(transitionMs / 1_000))}s`,
      text: unownTranslatorScoringLabel(), ...(own ? { aside: points(own.points) } : {}),
    };
  } else {
    content = { icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Esperando al servidor…', text: 'La ronda empieza en un momento.' };
  }
  const bottom = <SocialPlate titleRef={titleRef} content={content}>
    {canGuess && <UnownAnswerForm key={game.roundNumber} roundNumber={game.roundNumber} cooling={cooldownMs > 0} fieldRef={fieldRef}
      onGuess={(text) => onAction({ type: 'GUESS_UNOWN', text })} />}
  </SocialPlate>;

  const heading = lastRound ? `¡Decía ${lastRound.answer}!` : QUESTION;
  return <GuessScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={heading} meta={meta} timer={timer}
    announcement={announcement} clue={clue} hints={hints} side={side} bottom={bottom} testId="unown-screen" />;
}
