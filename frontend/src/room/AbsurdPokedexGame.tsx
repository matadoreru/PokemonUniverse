import type { AbsurdPokedexConfig, AbsurdPokedexPlayerState, AbsurdPokedexPokemon, AbsurdPokedexPublicState, PokemonType } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS, ABSURD_POKEDEX_MAX_ENTRY_LENGTH, absurdPokedexScoringLabel } from '@pokemon-universe/shared/public';
import { CheckCircle2, Clock3, Eye, PenLine, Send, Trophy, Vote, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { Avatar } from '../components/Avatar';
import { absurdAnnouncement, absurdCurrentStep, absurdHeading, absurdModeTitle, absurdSteps, absurdVotePayload, createDraftScheduler, fooledNames, sendAbsurdDraft, sortedRoundEntries, toggleFunny } from '../games/absurd-pokedex/presentation';
import { autoSendDelay, createAnswerSender } from '../games/pokemon-red-flag/RedFlagWriter';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Card, Chip, cx, Icon, Panel, Pill, TextArea } from '../ui';
import { useFocusOnTransition, useRefocusAfterReject } from './focus-transition';
import { guessSprite, pointsWord } from './guess-kit';
import { useRoomMembers } from './room-members';
import { type ActiveGameProps, type GameAction, ignoreFailure } from './room-command';
import { PhaseRail, ResponseProgress, SocialPlate, SocialPrompt, SocialScreen, socialFocusKey, votesText } from './social-kit';
import s from '../games/absurd-pokedex/AbsurdPokedex.module.css';

const GAME_NAME = 'Pokédex Absurda';

const typeLabel = (type: string) => POKEMON_TYPE_LABELS[type as PokemonType] ?? type;

/** La ficha del Pokémon de la ronda: sprite, nombre, `#número` y tipos. */
function PokemonSheet({ pokemon, className }: { pokemon: AbsurdPokedexPokemon; className?: string }) {
  return <span className={cx(s.pokemon, className)}>
    <Card name={pokemon.name} sprite={guessSprite(pokemon.sprite)} number={pokemon.nationalDexNumber} decorativeSprite size="sm" eager
      types={pokemon.types.map((type) => ({ type: type as PokemonType, label: typeLabel(type) }))} />
  </span>;
}

/** Campo de escritura: contador `n / 150`, borrador con debounce, envío manual y automático antes del plazo. */
function AbsurdWriter({ label, initialDraft, canSubmit, roundEndsAt, serverOffset, fieldRef, onDraft, onSubmit }: {
  label: string;
  initialDraft: string;
  canSubmit: boolean;
  roundEndsAt: number | null;
  serverOffset: number;
  fieldRef: Ref<HTMLTextAreaElement>;
  onDraft(text: string): Promise<void>;
  onSubmit(text: string): Promise<void>;
}) {
  const [text, setText] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const textRef = useRef(text);
  textRef.current = text;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  const [sender] = useState(() => createAnswerSender((value) => onSubmitRef.current(value), setBusy));

  // Borrador: se guarda al dejar de teclear y, si el campo se desmonta antes (fin del tiempo), se envía lo pendiente.
  const [draft] = useState(() => createDraftScheduler((value) => { void onDraftRef.current(value).catch(ignoreFailure); }, initialDraft));
  useEffect(() => { draft.schedule(text); }, [text, draft]);
  useEffect(() => () => draft.flush(), [draft]);

  useEffect(() => {
    if (!canSubmit || !roundEndsAt) return undefined;
    const timer = window.setTimeout(() => { void sender.send(textRef.current); }, autoSendDelay(roundEndsAt, Date.now(), serverOffset));
    return () => window.clearTimeout(timer);
  }, [roundEndsAt, canSubmit, serverOffset, sender]);

  const sendRef = useRef<HTMLButtonElement>(null);
  useRefocusAfterReject(0, busy, canSubmit, sendRef);

  return <div className={s.writer}>
    <TextArea ref={fieldRef} label={label} value={text} maxLength={ABSURD_POKEDEX_MAX_ENTRY_LENGTH} rows={3} disabled={!canSubmit || busy} className={s.writerField ?? ''}
      onChange={(value) => { setText(value); textRef.current = value; }} />
    <Pill ref={sendRef} variant="yellow" icon={Send} loading={busy} disabled={!canSubmit || !text.trim()} className={s.writerSend} onClick={() => void sender.send(textRef.current)} data-testid="absurd-send">Enviar</Pill>
  </div>;
}

/**
 * La papeleta anónima: una tarjeta por entrada. La propia lleva «Tu entrada» y no se vota. En `REAL_ENTRY`, «😂 La más
 * graciosa» es un conmutador local (nunca en la propia) y «Es la real» envía el voto con la graciosa marcada; en
 * Clásico, un solo botón «La más absurda». El voto es uno solo y final.
 */
function AbsurdBallot({ game, player, titleRef, onAction }: { game: AbsurdPokedexPublicState; player: AbsurdPokedexPlayerState | null; titleRef: Ref<HTMLHeadingElement>; onAction: GameAction }) {
  const [funny, setFunny] = useState<string | null>(null);
  const real = game.mode === 'REAL_ENTRY';
  const ownId = player?.ownEntry?.id ?? null;
  const ownVote = player?.ownVoteEntryId ?? null;
  const ownFunny = player?.ownFunnyEntryId ?? null;
  const locked = ownVote !== null;
  const canVote = player?.canVote === true && !locked;
  // Un toque, un voto: hasta que el servidor confirme (o falle) no se puede votar otra vez.
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const vote = (entryId: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    void onAction(absurdVotePayload(game.mode, entryId, funny)).catch(() => { sendingRef.current = false; setSending(false); });
  };
  return <SocialPlate titleRef={titleRef} bodyClassName={s.ballotBody} content={{
    icon: locked ? CheckCircle2 : Vote, tone: locked ? 'ok' : 'info', kicker: 'Votación anónima', title: locked ? 'Voto enviado' : absurdModeTitle(game.mode),
    text: locked ? 'El resultado sale cuando vote todo el grupo.' : real ? 'Una de estas entradas es la oficial. No puedes votar la tuya.' : 'Vota la entrada más absurda. No puedes votar la tuya.',
  }} textClassName={s.help}>
    <ul className={s.entries} data-testid="absurd-entries">
      {game.entries.map((entry, index) => {
        const own = entry.id === ownId;
        return <li key={entry.id} className={s.entryItem}>
          <Panel variant="cream" as="div" className={s.entry ?? ''} bodyClassName={s.entryBody ?? ''}>
            <p className={s.entryText}><span className={s.entryNumber}>Entrada {index + 1}</span>“{entry.text}”</p>
            <div className={s.entryActions}>
              {own && <Chip tone="info" icon={<Icon icon={PenLine} size={18} />}>Tu entrada</Chip>}
              {!own && locked && entry.id === ownVote && <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>{real ? 'Tu elección' : 'Tu voto'}</Chip>}
              {!own && locked && entry.id === ownFunny && <Chip tone="warn">😂 Tu graciosa</Chip>}
              {!own && canVote && real && <Pill variant="cream" aria-pressed={funny === entry.id} className={cx(s.funny, funny === entry.id && s.funnyOn)} disabled={sending} onClick={() => setFunny(toggleFunny(funny, entry.id))}>{funny === entry.id ? '✓ ' : ''}😂 La más graciosa</Pill>}
              {!own && canVote && <Pill variant="yellow" loading={sending} onClick={() => vote(entry.id)}>{real ? 'Es la real' : 'La más absurda'}</Pill>}
            </div>
          </Panel>
        </li>;
      })}
    </ul>
  </SocialPlate>;
}

/**
 * Pokédex Absurda con el kit social. Arriba: la placa de la ronda, las fases y la ficha del Pokémon (al revelar, las
 * entradas con autor, votos y, en `REAL_ENTRY`, la oficial). Abajo, la acción: escribir, votar o el veredicto. Al lado,
 * quién ha escrito o votado (nunca el qué) o, al revelar, los puntos.
 *
 * Anónimo: antes de `ROUND_RESULTS` no se pinta ningún autor ni cuál es la oficial; el `lastRound` solo se lee en su fase.
 */
export function AbsurdPokedexGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as AbsurdPokedexPublicState;
  const player = room.gamePlayerState as AbsurdPokedexPlayerState | null;
  const config = room.selectedGameConfig as Partial<AbsurdPokedexConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const participating = player?.role === 'PLAYER';
  const writing = game.phase === 'ROUND_ACTIVE';
  const voting = game.phase === 'VOTING';
  // La revelación (autores, oficial) solo en su fase: un `lastRound` sobrante nunca llega al DOM.
  const result = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const transitionMs = useRemainingMs(result ? game.nextTransitionAt : null, offset);

  const members = useRoomMembers(room); const { nameOf } = members;
  const ownEntry = participating ? player.ownEntry : null;
  const voteLocked = voting && participating && player.ownVoteEntryId !== null;
  const canWrite = writing && participating && player.canSubmit && !ownEntry;

  const titleRef = useRef<HTMLHeadingElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useFocusOnTransition(socialFocusKey(game.phase, game.roundNumber, 1, writing ? Boolean(ownEntry) : voteLocked), canWrite ? fieldRef : titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const totalMs = writing && config?.writeSeconds ? config.writeSeconds * 1_000 : voting && config?.voteSeconds ? config.voteSeconds * 1_000 : undefined;
  const timer = writing
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Para escribir', totalMs }
    : voting
      ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Para votar', totalMs }
      : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  const announcement = absurdAnnouncement({ phase: game.phase, roundNumber: game.roundNumber, entryLocked: writing && Boolean(ownEntry), voteLocked, result, nameOf });
  const pokemon = result?.pokemon ?? game.pokemon;
  const mode = result?.mode ?? game.mode;
  const modeChip = <Chip tone="info">{absurdModeTitle(mode)}</Chip>;

  const prompt = <SocialPrompt kicker={absurdModeTitle(mode)} className={s.prompt}
    text={pokemon ? `Entrada de Pokédex de ${pokemon.name}` : 'Preparando el Pokémon de la ronda…'}
    help={writing ? (mode === 'REAL_ENTRY' ? 'Escribe una entrada creíble: la oficial se mezclará con las vuestras.' : 'Inventa la entrada más absurda. Nadie verá quién escribió qué hasta el resultado.') : voting ? 'Las entradas están barajadas y sin autor.' : undefined}
    {...(pokemon ? { media: <PokemonSheet pokemon={pokemon} /> } : {})} />;

  let stage = prompt;
  if (result?.skipped) {
    stage = <SocialPrompt kicker={GAME_NAME} className={s.prompt} text="Ronda sin suficientes entradas" help="Hacen falta al menos dos entradas para votar. Esta ronda no puntúa."
      {...(pokemon ? { media: <PokemonSheet pokemon={pokemon} /> } : {})} />;
  } else if (result) {
    stage = <Panel variant="cream" as="section" scroll scrollLabel="Entradas de la ronda" className={s.reveal ?? ''} aria-label="Entradas reveladas">
      <ul className={s.entries}>
        {sortedRoundEntries(result).map((entry) => {
          const author = entry.authorId;
          const fooled = result.mode === 'REAL_ENTRY' ? fooledNames(entry, nameOf) : '';
          return <li key={entry.id} className={cx(s.entryItem, entry.isReal && s.official)}>
            <Panel variant="cream" as="div" className={s.entry ?? ''} bodyClassName={s.entryBody ?? ''}>
              <p className={s.entryText}>“{entry.text}”</p>
              <div className={s.entryActions}>
                {entry.isReal
                  ? <span className={s.officialChip}><Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>{`Entrada oficial · ${result.realEntry?.versionLabel ?? ''}`}</Chip></span>
                  : author && <span className={s.author}><Avatar name={nameOf(author)} avatar={members.get(author)?.avatar} size="sm" /><strong style={{ '--player': members.colorOf(author) } as CSSProperties} className={s.authorName}>{nameOf(author)}</strong>{author === selfId && <Chip tone="info">Tu entrada</Chip>}</span>}
                <Chip tone={entry.votesReceived > 0 ? 'ok' : 'neutral'}>{votesText(entry.votesReceived)}</Chip>
                {entry.funnyVotesReceived > 0 && <Chip tone="warn">{`😂 ${entry.funnyVotesReceived}`}</Chip>}
                {fooled && <span className={s.fooled}>{fooled}</span>}
              </div>
            </Panel>
          </li>;
        })}
      </ul>
    </Panel>;
  }

  const side = result
    ? <ResponseProgress title="Puntos de la ronda" members={room.members} playerIds={game.playerIds} doneIds={[]} selfId={selfId} count={false}
      status={(id) => {
        // Primero la victoria: en `REAL_ENTRY` se puede ganar acertando la oficial sin haber escrito entrada.
        if (result.winnerPlayerIds.includes(id)) return { tone: 'ok', text: 'Ganó', icon: Trophy };
        if (result.missingPlayerIds.includes(id)) return { tone: 'bad', text: 'Sin entrada', icon: X };
        if (result.skipped) return { tone: 'neutral', text: 'No puntúa' };
        const own = result.entries.find((entry) => entry.authorId === id);
        return { tone: 'neutral', text: votesText(own?.votesReceived ?? 0) };
      }}
      value={(id) => `+${result.pointsAwarded[id] ?? 0}`} />
    : <ResponseProgress members={room.members} playerIds={game.playerIds} doneIds={voting ? game.votedPlayerIds : game.submittedPlayerIds} selfId={selfId}
      doneText="Listo" pendingText={voting ? 'Votando…' : 'Escribiendo…'}
      note={voting ? 'Los votos permanecen secretos hasta el resultado.' : 'Ninguna entrada ni autor se revela antes de la votación.'} />;

  let bottom;
  if (voting) {
    bottom = <AbsurdBallot key={game.roundNumber} game={game} player={player} titleRef={titleRef} onAction={onAction} />;
  } else if (writing && participating && ownEntry) {
    bottom = <SocialPlate titleRef={titleRef} content={{
      icon: CheckCircle2, tone: 'ok', kicker: 'Tu entrada secreta', title: 'Entrada enviada',
      text: <><span className={s.ownText}>“{ownEntry.text}”</span> Solo tú puedes verla hasta la votación.</>,
      aside: <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Enviada</Chip>,
    }} textClassName={s.lockedText} />;
  } else if (writing && participating) {
    bottom = <SocialPlate titleRef={titleRef} content={{
      icon: PenLine, tone: 'info', kicker: 'Tu entrada secreta', title: 'Escribe su entrada de Pokédex',
      text: `Se enviará sola al acabar el tiempo si tiene texto. Máximo ${ABSURD_POKEDEX_MAX_ENTRY_LENGTH} caracteres.`,
    }} textClassName={s.help}>
      <AbsurdWriter key={game.roundNumber} label={`Tu entrada para ${pokemon?.name ?? 'el Pokémon'}`} initialDraft={player.ownDraft} canSubmit={player.canSubmit} roundEndsAt={game.roundEndsAt} serverOffset={offset} fieldRef={fieldRef}
        onDraft={(text) => sendAbsurdDraft(onAction, text)} onSubmit={(text) => onAction({ type: 'SUBMIT_ABSURD_ENTRY', text })} />
    </SocialPlate>;
  } else if (writing) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Eye, tone: 'info', kicker: 'No escribes en esta ronda', title: 'Estás observando', text: 'Verás las entradas, sin autor, en la votación.' }} />;
  } else if (result) {
    const points = result.pointsAwarded[selfId] ?? 0;
    const seconds = Math.max(1, Math.ceil(transitionMs / 1_000));
    const own = result.entries.find((entry) => entry.authorId === selfId);
    const verdict = !participating ? 'Estás observando' : result.skipped ? 'Esta ronda no puntúa' : !own ? 'No enviaste entrada' : `Tu entrada: ${votesText(own.votesReceived)}`;
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.help} content={{
      icon: result.winnerPlayerIds.includes(selfId) ? Trophy : Eye, tone: result.winnerPlayerIds.includes(selfId) ? 'ok' : 'info', kicker: verdict, title: `${last ? 'Clasificación' : 'Siguiente ronda'} en ${seconds}s`,
      text: absurdPokedexScoringLabel(result.mode),
      ...(points > 0 ? { aside: <strong className={s.points}>+{points}<small> {pointsWord(points)}</small></strong> } : {}),
    }} />;
  } else {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Preparando el resultado…', text: 'La ronda sigue en un momento.' }} />;
  }

  return <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={absurdHeading(game.phase, game.mode, result)} meta={modeChip} timer={timer}
    announcement={announcement} phases={<PhaseRail steps={absurdSteps()} current={absurdCurrentStep(game.phase)} />} stage={stage} side={side} bottom={bottom} />;
}
