import type { PokemonType, WhoAmIAnswer, WhoAmIConfig, WhoAmICurrentQuestion, WhoAmIHistoryEntry, WhoAmIPlayerState, WhoAmIPokemon, WhoAmIPublicState } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS, WHO_AM_I_ANSWERS, WHO_AM_I_MAX_QUESTION_LENGTH } from '@pokemon-universe/shared/public';
import { ArrowLeft, Check, CheckCircle2, Clock3, Eye, Hourglass, MessageCircleQuestion, Search, Send, SkipForward, Target, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { answerLabel, freshAnnouncement, lockedGuessIds, questionsText, turnHeadline, WHO_AM_I_NAME, whoAmIAnnouncement, type WhoAmIAnnounceSnapshot } from './presentation';
import { useDraft, type DraftKey } from '../../hooks/useDraft';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { useServerOffset } from '../../hooks/useServerTime';
import { Card, Chip, cx, Field, Icon, Panel, Pill, StateBox } from '../../ui';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { gameDraftKey } from '../../room/game-kit/game-draft';
import { roomTurnKey, useTurnCue } from '../../room/game-kit/useTurnCue';
import { guessSprite } from '../../room/guess-kit';
import { PokemonSelector } from '../../room/game-kit/PokemonSelector';
import { SocialPlate, SocialScreen, type SocialPlateContent } from '../../room/social-kit';
import { type ActiveGameProps, ignoreFailure, sendWithBusy } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './WhoAmI.module.css';

/** Plazo de `DECIDING` (`DECIDE_MS` del motor): no es configurable. */
const DECIDE_MS = 20_000;
/** Tono del chip de cada respuesta en las pistas; la respuesta va siempre también en texto. */
const ANSWER_TONES: Readonly<Record<WhoAmIAnswer, 'ok' | 'bad' | 'warn' | 'neutral'>> = { YES: 'ok', NO: 'bad', PARTLY: 'warn', UNKNOWN: 'neutral' };
const typeLabel = (type: string) => POKEMON_TYPE_LABELS[type as PokemonType] ?? type;
const cardTypes = (pokemon: WhoAmIPokemon) => pokemon.types.map((type) => ({ type: type as PokemonType, label: typeLabel(type) }));

/** Historial de un jugador, de la pista más reciente a la más antigua: cada pregunta con sus respuestas y cada fallo. */
export function WhoAmIHistory({ entries, nameOf, testId, emptyText }: { entries: readonly WhoAmIHistoryEntry[]; nameOf(id: string): string; testId?: string; emptyText: string }) {
  if (entries.length === 0) return <StateBox kind="empty" live={false} title={emptyText} />;
  return <ul className={s.clues} {...(testId ? { 'data-testid': testId } : {})}>
    {[...entries].reverse().map((entry, index) => entry.kind === 'GUESS'
      ? <li key={index} className={cx(s.clue, s.guess)}><Icon icon={X} size={18} />{`Probó con ${entry.pokemon.name}`}</li>
      : <li key={index} className={s.clue}>
        <p className={cx(s.question, s.clueQuestion)}>{entry.text}</p>
        <p className={s.answers}>
          {entry.answers.length === 0
            ? <span>Sin respuestas</span>
            : entry.answers.map((answer) => <span key={answer.playerId} className={s.answer}><Chip tone={ANSWER_TONES[answer.answer]}>{nameOf(answer.playerId)}: <strong>{answerLabel(answer.answer)}</strong></Chip></span>)}
        </p>
      </li>)}
  </ul>;
}

/**
 * Quién ha respondido a la pregunta en curso: en `ANSWERING`, solo el hecho («Respondió» o «Sin respuesta»; el servidor
 * no publica qué respondió nadie hasta `DECIDING`); en `DECIDING`, la respuesta de cada uno. Responden todos los
 * jugadores salvo el del turno; un desconectado no responde nunca, de ahí «Sin respuesta» y no «Pendiente».
 */
function AnswerProgress({ question, responderIds, showAnswers, nameOf }: { question: WhoAmICurrentQuestion; responderIds: readonly string[]; showAnswers: boolean; nameOf(id: string): string }) {
  const answers = new Map(question.answers.map((entry) => [entry.playerId, entry.answer]));
  const answered = new Set(question.answeredPlayerIds);
  return <ul className={s.progress} aria-label="Respuestas">
    {responderIds.map((id) => {
      const answer = answers.get(id);
      const done = answered.has(id) || answer !== undefined;
      const text = showAnswers ? (answer ? answerLabel(answer) : 'Sin respuesta') : done ? 'Respondió' : 'Sin respuesta';
      return <li key={id}><Chip tone={showAnswers && answer ? ANSWER_TONES[answer] : done ? 'ok' : 'neutral'} icon={<Icon icon={done ? Check : Hourglass} size={18} />}>{`${nameOf(id)} · ${text}`}</Chip></li>;
    })}
  </ul>;
}

/** Campo de la pregunta: contador `n/120`, «Enviar» y, al lado, «Adivinar» (abre el buscador). */
function AskForm({ fieldRef, canGuess, draft, onAsk, onGuess }: { fieldRef: RefObject<HTMLInputElement | null>; canGuess: boolean; draft: DraftKey | null; onAsk(text: string): Promise<void>; onGuess(): void }) {
  // La pregunta a medio escribir es un borrador del turno: vuelve tras recargar y se borra al enviarla.
  const [text, setText, clearText] = useDraft(draft, { maxLength: WHO_AM_I_MAX_QUESTION_LENGTH });
  const [busy, setBusy] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    void sendWithBusy(setBusy, () => onAsk(value), clearText);
  };
  return <form className={s.ask} onSubmit={submit}>
    <div className={s.askField}>
      <Field ref={fieldRef} label="Escribe una pregunta de sí o no" value={text} maxLength={WHO_AM_I_MAX_QUESTION_LENGTH} autoComplete="off" enterKeyHint="send"
        placeholder="¿Soy de tipo fuego?" hint={`${text.length}/${WHO_AM_I_MAX_QUESTION_LENGTH}`} onChange={(event) => setText(event.target.value.slice(0, WHO_AM_I_MAX_QUESTION_LENGTH))} />
    </div>
    <div className={s.buttons}>
      <Pill type="submit" variant="yellow" icon={Send} loading={busy} disabled={busy || !text.trim()}>Enviar</Pill>
      <Pill variant="blue" icon={Target} disabled={!canGuess || busy} onClick={onGuess}>Adivinar</Pill>
    </div>
  </form>;
}

/** Las cuatro respuestas; tras responder, la propia queda marcada (`aria-pressed`) y no se puede cambiar. */
function AnswerButtons({ ownAnswer, canAnswer, onAnswer }: { ownAnswer: WhoAmIAnswer | null; canAnswer: boolean; onAnswer(answer: WhoAmIAnswer): Promise<void> }) {
  const [sending, setSending] = useState<WhoAmIAnswer | null>(null);
  const answer = (value: WhoAmIAnswer) => {
    if (sending || !canAnswer) return;
    void sendWithBusy((busy) => setSending(busy ? value : null), () => onAnswer(value));
  };
  return <div className={s.answerButtons} role="group" aria-label="Tu respuesta">
    {WHO_AM_I_ANSWERS.map((value) => <Pill key={value} variant={ownAnswer === value ? 'yellow' : 'cream'} aria-pressed={ownAnswer === value} loading={sending === value}
      disabled={!canAnswer || sending !== null} onClick={() => answer(value)}>{answerLabel(value)}</Pill>)}
  </div>;
}

/**
 * El Pokémon del que pregunta, encima de las respuestas: en el móvil la placa va antes que las cartas y así se responde
 * sin buscar su carta. Viene de `others[turnPlayerId]`, que nunca trae el Pokémon propio.
 */
function AskerPokemon({ name, pokemon }: { name: string; pokemon: WhoAmIPokemon }) {
  return <p className={s.asker} data-testid="who-am-i-asker">
    <img className={s.askerSprite} src={guessSprite(pokemon.sprite)} alt="" />
    <span className={s.askerText}>{`El Pokémon de ${name}: `}<strong>{pokemon.name}</strong></span>
  </p>;
}

/**
 * La carta de un jugador: los demás con su Pokémon; la propia con «?» (o con `self` si ya acertó). La de otro sin
 * Pokémon a la vista (un espectador nunca los recibe) dice «Pokémon oculto», no «Tu Pokémon».
 */
function PlayerCard({ name, self, pokemon, turn, solved, viewing, wide, onView }: { name: string; self: boolean; pokemon: WhoAmIPokemon | null; turn: boolean; solved: boolean; viewing: boolean; wide: boolean; onView?: (() => void) | undefined }) {
  // En escritorio con alto la carta llena su celda (el sprite crece con ella); si no, sigue pequeña.
  const size = wide ? 'fill' : 'sm';
  const label = self ? `${name} (tú)` : name;
  const extra = <span className={s.player}>
    {label}
    {turn && <Chip tone="warn">Turno</Chip>}
    {solved && <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Acertó</Chip>}
  </span>;
  const card = pokemon
    ? <Card name={pokemon.name} sprite={guessSprite(pokemon.sprite)} number={pokemon.nationalDexNumber} types={cardTypes(pokemon)} decorativeSprite size={size} eager
      state={viewing ? 'selected' : 'idle'} {...(onView ? { onSelect: onView, attrs: { 'aria-label': `${pokemon.name}, de ${label}: ver sus pistas` } } : {})}>{extra}</Card>
    : <Card name={self ? 'Tu Pokémon' : 'Pokémon oculto'} size={size} {...(wide ? { art: <span className={s.mystery}>?</span> } : {})}>{extra}</Card>;
  return <li className={cx(s.seat, turn && s.turn)} data-turn={turn || undefined}>{card}</li>;
}

/**
 * Lo que anuncia la única región viva: «Turno de X.» al cambiar el turno, cada pregunta nueva y «¡Eras X!» al acertar
 * uno mismo. Al montarse (o al volver a conectar) no anuncia nada de lo que ya había.
 */
function useWhoAmIAnnouncement(game: WhoAmIPublicState, player: WhoAmIPlayerState | null, nameOf: (id: string) => string): string {
  const turnKey = game.phase === 'TURN_ACTIVE' && game.turnPlayerId ? `${game.lap}:${game.turnPlayerId}` : null;
  const snapshot: WhoAmIAnnounceSnapshot = {
    turnKey, turnPlayerId: game.turnPlayerId,
    questionKey: turnKey && game.currentQuestion ? `${turnKey}|${game.currentQuestion.text}` : null, questionText: game.currentQuestion?.text ?? null,
    solvedAs: player?.role === 'PLAYER' ? player.self?.name ?? null : null,
  };
  const [text, setText] = useState('');
  const previous = useRef(snapshot);
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;
  useEffect(() => {
    const next = whoAmIAnnouncement(previous.current, snapshot, nameRef.current);
    previous.current = snapshot;
    // Un anuncio igual al anterior cambia por dentro (espacio de ancho cero) para que se vuelva a leer.
    if (next) setText((current) => freshAnnouncement(current, next));
    // `snapshot` se rehace en cada render: basta con los campos que cambian lo que se anuncia.
  }, [snapshot.turnKey, snapshot.questionKey, snapshot.solvedAs]);
  return text;
}

/**
 * ¿Quién soy? con el kit social. Arriba: la placa («Vuelta N de M», el título del turno y el plazo) y una carta por
 * jugador en el orden de `playerIds`, con el del turno destacado; al tocar otra carta se ven sus pistas. Abajo, la
 * acción del turno: preguntar (o adivinar), responder, adivinar o pasar, o la pregunta en curso con quién ha respondido.
 * Al lado, «Tus pistas» siempre a la vista.
 *
 * Privacidad: la carta propia solo enseña un Pokémon si llega `player.self` (tras acertar); nunca se lee el propio de
 * `others` ni de ningún otro sitio, y los resultados (`game.results`) solo los lee `WhoAmIResults`. Un jugador original
 * desconectado sigue siendo `PLAYER` con `self` nulo: ve «?» igual.
 */
export function WhoAmIGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as WhoAmIPublicState;
  const player = room.gamePlayerState as WhoAmIPlayerState | null;
  const config = room.selectedGameConfig as Partial<WhoAmIConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const { nameOf } = useRoomMembers(room);
  const participating = player?.role === 'PLAYER' && game.playerIds.includes(selfId);
  const active = game.phase === 'TURN_ACTIVE' && game.turnPlayerId !== null && game.turnStep !== null;
  const ownTurn = active && game.turnPlayerId === selfId;
  const step = active ? game.turnStep : null;
  const question = active ? game.currentQuestion : null;
  const turnKey = active ? `${game.lap}:${game.turnPlayerId}:${step}` : null;
  const canGuess = Boolean(participating && player.canGuess);
  // «¡Te toca!» al empezar tu turno (una vez por turno, no en cada paso).
  const turnCue = useTurnCue(ownTurn, roomTurnKey(room, active ? `${game.lap}:${game.turnPlayerId}` : null));

  // «Adivinar» abre el buscador en la placa; se cierra solo al cambiar el turno o el paso, o si ya no se puede adivinar.
  const [guessingKey, setGuessingKey] = useState<string | null>(null);
  const guessing = guessingKey !== null && guessingKey === turnKey && canGuess;
  // Las cartas de los demás se tocan para ver sus pistas. Un espectador (sin pistas propias) ve las del turno.
  const [viewedId, setViewedId] = useState<string | null>(null);
  // La misma consulta que `WhoAmI.module.css`: escritorio con alto para cartas grandes (a 720 px de alto siguen pequeñas).
  const wide = useMediaQuery('(min-width: 1024px) and (min-height: 860px)');
  // Móvil y tableta: la placa de la acción va en el DOM justo después de la placa de la ronda (ver el final).
  const narrow = useMediaQuery('(max-width: 1023px)');
  const viewed = viewedId && viewedId !== selfId && game.playerIds.includes(viewedId) ? viewedId : !participating ? game.turnPlayerId : null;

  const settings = config ?? {};
  const { pokemon, error: loadError, loading: poolLoading, retry } = usePokemonPool({ generations: settings.generations ?? [], includeForms: false, enabled: canGuess });
  const ownHistory = useMemo(() => (participating ? game.history[selfId] ?? [] : []), [participating, game.history, selfId]);
  // Bloqueados: los ya probados y los de los demás (el servidor no deja adivinar con el Pokémon de otro).
  const others = participating ? player.others : null;
  const lockedIds = useMemo(() => lockedGuessIds(ownHistory, others ?? {}), [ownHistory, others]);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const askOpen = ownTurn && step === 'ASKING' && Boolean(player?.canAsk) && !guessing;
  useFocusOnTransition(turnKey ? `${turnKey}:${guessing ? 'guess' : ''}` : null, askOpen ? fieldRef : titleRef);
  const announcement = useWhoAmIAnnouncement(game, player, nameOf);

  const send = (action: unknown) => onAction(action).catch(ignoreFailure);
  // Un intento por turno: el segundo toque sobre el buscador no manda otro `GUESS_SELF` (el servidor lo rechazaría con
  // un aviso de error, porque el turno ya pasó). Si el envío falla, se puede volver a intentar.
  const guessSentFor = useRef<string | null>(null);
  const guess = (pokemonId: string) => {
    if (turnKey === null || guessSentFor.current === turnKey) return;
    guessSentFor.current = turnKey;
    void onAction({ type: 'GUESS_SELF', pokemonId }).catch((error: unknown) => { guessSentFor.current = null; ignoreFailure(error); });
  };
  const responderIds = game.playerIds.filter((id) => id !== game.turnPlayerId);
  const turnName = game.turnPlayerId ? nameOf(game.turnPlayerId) : '';

  const timerLabel = step === 'ASKING' ? 'Para preguntar' : step === 'ANSWERING' ? 'Para responder' : 'Para decidir';
  const totalSeconds = step === 'ASKING' ? settings.askSeconds : step === 'ANSWERING' ? settings.answerSeconds : undefined;
  const timer = { deadline: active ? game.turnEndsAt : null, serverOffset: offset, label: timerLabel, totalMs: step === 'DECIDING' ? DECIDE_MS : totalSeconds ? totalSeconds * 1_000 : undefined };
  const asked = participating ? game.questionsAsked[selfId] ?? 0 : 0;
  const meta = participating ? <Chip tone="info" icon={<Icon icon={MessageCircleQuestion} size={18} />}>{`Has hecho ${questionsText(asked)}`}</Chip> : <Chip tone="info" icon={<Icon icon={Eye} size={18} />}>Observando</Chip>;

  const solvedIds = new Set(game.solvedPlayerIds);
  // Hasta cuatro cartas, una fila; con más, dos filas.
  const columns = game.playerIds.length <= 4 ? game.playerIds.length : Math.ceil(game.playerIds.length / 2);
  const stage = <Panel variant="cream" as="section" title="Jugadores" scroll scrollLabel="Cartas de los jugadores" className={s.stage ?? ''}>
    <ul className={s.cards} data-testid="who-am-i-cards" style={{ ['--cols' as string]: columns }}>
      {game.playerIds.map((id) => {
        const own = id === selfId;
        // La propia, solo con `self`; nunca con `others[selfId]` aunque llegara.
        const card = own ? (player?.role === 'PLAYER' ? player.self : null) : player?.others[id] ?? null;
        return <PlayerCard key={id} name={nameOf(id)} self={own} pokemon={card} turn={active && game.turnPlayerId === id} solved={solvedIds.has(id)} viewing={viewed === id} wide={wide}
          onView={own || !card ? undefined : () => setViewedId((current) => (current === id ? null : id))} />;
      })}
    </ul>
  </Panel>;

  const side = <>
    {viewed && <Panel title={`Pistas de ${nameOf(viewed)}`} variant="dark" scroll scrollLabel={`Pistas de ${nameOf(viewed)}`}>
      <WhoAmIHistory entries={game.history[viewed] ?? []} nameOf={nameOf} emptyText="Aún no ha preguntado nada." />
    </Panel>}
    {participating && <Panel title="Tus pistas" variant="dark" scroll scrollLabel="Tus pistas">
      <WhoAmIHistory entries={ownHistory} nameOf={nameOf} testId="who-am-i-clues" emptyText="Aún no tienes pistas: pregunta sobre tu Pokémon en tu turno." />
    </Panel>}
  </>;

  const questionText = question ? <span className={cx(s.question, s.plateQuestion)}>{question.text}</span> : null;
  let content: SocialPlateContent;
  let body: ReactNode = null;
  let search = false;
  if (guessing) {
    search = true;
    content = { icon: Search, tone: 'info', kicker: 'Adivinar', title: '¿Qué Pokémon eres?', text: 'Un solo intento: acertar o fallar pasa el turno.', aside: <Pill variant="cream" icon={ArrowLeft} onClick={() => setGuessingKey(null)}>Volver</Pill> };
    body = <PokemonSelector key={turnKey} pokemon={pokemon} loading={poolLoading} loadError={loadError} onRetry={retry} locked={lockedIds} disabled={!canGuess} variant="embedded" autoFocus={false}
      inputLabel="Buscar tu Pokémon" onSelect={guess} />;
  } else if (ownTurn && step === 'ASKING' && player?.canAsk) {
    content = { icon: MessageCircleQuestion, tone: 'warn', kicker: 'Tu turno', title: 'Pregunta sobre tu Pokémon', text: 'Los demás responden con Sí, No, A medias o No lo sé. Cuantas menos preguntas, más puntos.' };
    body = <AskForm key={turnKey} fieldRef={fieldRef} canGuess={canGuess} draft={gameDraftKey(room, 'who-am-i-question', turnKey)} onAsk={(text) => send({ type: 'ASK_QUESTION', text })} onGuess={() => setGuessingKey(turnKey)} />;
  } else if (ownTurn && step === 'DECIDING' && question) {
    content = {
      icon: Target, tone: 'warn', kicker: 'Tu pregunta', title: '¿Adivinas o pasas?', text: questionText,
      aside: <div className={s.buttons}>
        <Pill variant="yellow" icon={Target} disabled={!canGuess} onClick={() => setGuessingKey(turnKey)}>Adivinar</Pill>
        <Pill variant="blue" icon={SkipForward} disabled={!player?.canPass} onClick={() => void send({ type: 'PASS_TURN' })}>Pasar</Pill>
      </div>,
    };
    body = <AnswerProgress question={question} responderIds={responderIds} showAnswers nameOf={nameOf} />;
  } else if (ownTurn && question) {
    content = { icon: Hourglass, tone: 'info', kicker: 'Tu pregunta', title: 'Esperando las respuestas', text: questionText };
    body = <AnswerProgress question={question} responderIds={responderIds} showAnswers={false} nameOf={nameOf} />;
  } else if (active && step === 'ANSWERING' && question && participating && (player.canAnswer || player.ownAnswer)) {
    content = { icon: MessageCircleQuestion, tone: player.ownAnswer ? 'ok' : 'warn', kicker: player.ownAnswer ? 'Respuesta enviada' : `Pregunta de ${turnName} sobre su Pokémon`, title: player.ownAnswer ? 'Esperando a los demás' : `Responde a ${turnName}`, text: questionText };
    // Nunca el propio: solo si el turno es de otro, y de `others`.
    const asker = game.turnPlayerId && game.turnPlayerId !== selfId ? player.others[game.turnPlayerId] ?? null : null;
    body = <div className={s.answering}>
      {asker && <AskerPokemon name={turnName} pokemon={asker} />}
      <AnswerButtons key={turnKey} ownAnswer={player.ownAnswer} canAnswer={player.canAnswer} onAnswer={(answer) => send({ type: 'ANSWER_QUESTION', answer })} />
    </div>;
  } else if (active) {
    const offline = participating && !ownTurn && step === 'ANSWERING' && !player.canAnswer;
    content = {
      // En el turno propio sin nada que hacer (sin conexión al empezar, o ya sin poder preguntar): en segunda persona.
      icon: Eye, tone: 'info', kicker: participating ? (offline ? 'Sin conexión: vuelve para responder' : ownTurn ? 'Tu turno' : `Turno de ${turnName}`) : 'Estás observando',
      title: ownTurn ? (question ? 'Tu pregunta' : 'Es tu turno') : question ? `Pregunta de ${turnName}` : `Turno de ${turnName}`,
      text: questionText ?? (step === 'ASKING' ? (ownTurn ? 'Ahora mismo no puedes preguntar.' : `${turnName} está pensando su pregunta.`) : undefined),
    };
    if (question) body = <AnswerProgress question={question} responderIds={responderIds} showAnswers={step === 'DECIDING'} nameOf={nameOf} />;
  } else {
    content = { icon: Clock3, tone: 'info', kicker: WHO_AM_I_NAME, title: 'Repartiendo los Pokémon…', text: 'Todos verán tu Pokémon menos tú.' };
  }
  const plate = <SocialPlate titleRef={titleRef} content={content} search={search}>{body}</SocialPlate>;

  // En el móvil nada queda debajo de la placa de la acción: va en el flujo, después de la placa de la ronda y antes de
  // las cartas y de las pistas (en el hueco de las fases del marco), y la pantalla inferior queda vacía. Así el orden
  // de lectura y de tabulación es el que se ve, sin `order` en el CSS.
  return <SocialScreen gameName={WHO_AM_I_NAME} roundNumber={game.lap} phase={game.phase} totalRounds={game.maxLaps} roundLabel={`Vuelta ${Math.max(1, game.lap)} de ${game.maxLaps}`}
    heading={turnHeadline(game, selfId, nameOf)} meta={meta} timer={timer} announcement={announcement} stage={stage} side={side} className={s.screen} turnCue={turnCue}
    {...(narrow ? { phases: plate, bottom: null } : { bottom: plate })} />;
}
