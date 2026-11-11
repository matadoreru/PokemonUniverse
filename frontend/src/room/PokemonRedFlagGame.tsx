import { RED_FLAG_WIN_POINTS, type PokemonRedFlagConfig, type PokemonRedFlagPlayerState, type PokemonRedFlagPublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Clock3, Eye, PenLine, ThumbsDown, ThumbsUp, Trophy, X } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '../components/Avatar';
import { redFlagAnnouncement, sendRedFlagDraft, redFlagCurrentStep, redFlagHeading, redFlagQuestion, redFlagSteps, redFlagVerdict } from '../games/pokemon-red-flag/presentation';
import { RedFlagWriter } from '../games/pokemon-red-flag/RedFlagWriter';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Card, Chip, cx, Icon } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import type { ActiveGameProps } from './room-command';
import { guessSprite, pointsWord } from './guess-kit';
import { useRoomMembers } from './room-members';
import {
  PhaseRail, ResponseProgress, SocialPlate, SocialPrompt, SocialScreen, VoteBallot, VoteTally, socialFocusKey, votesText,
  type BallotOption, type TallyOption,
} from './social-kit';
import s from '../games/pokemon-red-flag/PokemonRedFlag.module.css';

const GAME_NAME = 'La Frase Pokémon';

/**
 * La Frase Pokémon con el kit social (spec §2 y §6 «Juegos»). Arriba: la placa de la ronda (con el modo en
 * un chip), las fases y la consigna con la carta del Pokémon de la ronda (al revelar, el recuento con los autores). Abajo,
 * la acción: el campo de escritura con su contador, la papeleta anónima (con segunda vuelta solo entre las empatadas) o
 * el veredicto. Al lado, quién ha escrito o votado (en texto, nunca el qué) o, al revelar, los puntos de la ronda.
 *
 * Anónimo: durante la votación las respuestas son «Respuesta N» con su texto, sin autor en el DOM (ni en `aria-label` ni
 * en `data-*`); los autores y los votos solo llegan en `lastRound`, que la pantalla lee únicamente en `ROUND_RESULTS`.
 */
export function PokemonRedFlagGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokemonRedFlagPublicState;
  const player = room.gamePlayerState as PokemonRedFlagPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonRedFlagConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const participating = player?.role === 'PLAYER';
  const writing = game.phase === 'ROUND_ACTIVE';
  const voting = game.phase === 'VOTING' || game.phase === 'REVOTE';
  const runoff = game.phase === 'REVOTE';
  // La revelación (autores y votos) solo en su fase: un `lastRound` sobrante nunca llega al DOM.
  const result = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const mode = result?.flagMode ?? game.flagMode;
  const green = mode === 'GREEN';
  const transitionMs = useRemainingMs(result ? game.nextTransitionAt : null, offset);

  const members = useRoomMembers(room); const { nameOf } = members;
  const ownAnswer = participating ? player.ownAnswer : null;
  const ownVote = participating ? player.ownVoteAnswerId : null;
  const voteLocked = voting && ownVote !== null;
  const canWrite = writing && participating && player.canSubmit && !ownAnswer;

  const titleRef = useRef<HTMLHeadingElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Al empezar a escribir, el foco va al campo (como el `autoFocus` de antes); en el resto, al título de la placa.
  useFocusOnTransition(socialFocusKey(game.phase, game.roundNumber, game.voteRoundNumber, writing ? Boolean(ownAnswer) : voteLocked), canWrite ? fieldRef : titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const totalMs = config?.phaseSeconds ? config.phaseSeconds * 1_000 : undefined;
  const timer = writing
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Para escribir', totalMs }
    : voting
      ? { deadline: game.roundEndsAt, serverOffset: offset, label: runoff ? 'Para revotar' : 'Para votar', totalMs }
      : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  const authorOf = (answerId: string) => result?.answers.find((answer) => answer.id === answerId)?.authorId ?? null;
  const announcement = redFlagAnnouncement({
    phase: game.phase, roundNumber: game.roundNumber, answerLocked: writing && Boolean(ownAnswer), voteLocked, tiedCount: runoff ? game.voteCandidateIds.length : 0,
    result, nameOf: (answerId) => { const author = authorOf(answerId); return author ? nameOf(author) : 'Una respuesta'; },
  });

  const pokemon = result?.pokemon ?? game.pokemon;
  const modeChip = <Chip tone={green ? 'ok' : 'bad'} icon={<Icon icon={green ? ThumbsUp : ThumbsDown} size={18} />}>{green ? 'Lo mejor' : 'Lo peor'}</Chip>;
  const prompt = <SocialPrompt kicker={green ? 'Lo mejor de esta ronda' : 'Lo peor de esta ronda'} className={cx(s.prompt, voting && s.promptVoting)}
    text={pokemon ? redFlagQuestion(mode, pokemon.name) : 'Preparando el Pokémon de la ronda…'}
    help={writing ? 'Escribe en secreto. Nadie verá quién escribió qué hasta el resultado.' : voting ? 'Las respuestas están barajadas y sin autor.' : undefined}
    {...(pokemon ? { media: <span className={cx(s.pokemon, voting && s.pokemonVoting)}><Card name={pokemon.name} sprite={guessSprite(pokemon.sprite)} decorativeSprite size="sm" eager /></span> } : {})} />;

  const tallyOptions: TallyOption[] = (result?.answers ?? []).map((answer) => ({
    id: answer.id, name: nameOf(answer.authorId), text: <>“{answer.text}”</>, color: members.colorOf(answer.authorId), self: answer.authorId === selfId,
    media: <Avatar name={nameOf(answer.authorId)} avatar={members.get(answer.authorId)?.avatar} size="sm" />,
  }));
  const stage = result
    ? <VoteTally idBase="red-flag-tally" title="Autores revelados" options={tallyOptions} rounds={result.voteRounds} winnerIds={result.winningAnswerIds} voterName={nameOf} voterAvatar={(id) => members.get(id)?.avatar}
      winnerLabel={'Frase ganadora'} intro={pokemon ? redFlagQuestion(mode, pokemon.name) : undefined}
      emptyText="Nadie escribió una respuesta a tiempo." className={s.tally} />
    : prompt;

  const side = result
    ? <ResponseProgress title="Puntos de la ronda" members={room.members} playerIds={game.playerIds} doneIds={[]} selfId={selfId} count={false}
      status={(id) => {
        const answer = result.answers.find((entry) => entry.authorId === id);
        if (!answer) return { tone: 'bad', text: 'Sin respuesta', icon: X };
        if (answer.won) return { tone: 'ok', text: result.winningAnswerIds.length > 1 ? 'Victoria compartida' : 'Ganó', icon: Trophy };
        if (result.voteRounds.length > 1 && !result.voteRounds.at(-1)?.candidateIds.includes(answer.id)) return { tone: 'neutral', text: 'Fuera de la segunda vuelta' };
        return { tone: 'neutral', text: votesText(answer.votesReceived) };
      }}
      value={(id) => `+${result.pointsAwarded[id] ?? 0}`} />
    : <ResponseProgress members={room.members} playerIds={game.playerIds} doneIds={voting ? game.votedPlayerIds : game.submittedPlayerIds} selfId={selfId}
      doneText="Listo" pendingText={voting ? 'Votando…' : 'Escribiendo…'}
      note={voting ? 'Los votos permanecen secretos hasta el resultado.' : 'Ningún texto ni autor se revela antes de la votación.'} />;

  // Anónimas: «Respuesta N» (por el orden barajado del servidor) con el texto; nada del autor.
  const ballotOptions: BallotOption[] = game.revealedAnswers.map((answer, index) => ({
    id: answer.id, name: `Respuesta ${index + 1}`, ariaLabel: `Respuesta ${index + 1}: ${answer.text}`, text: <>“{answer.text}”</>,
  }));

  let bottom;
  if (voting) {
    bottom = <VoteBallot key={`${game.roundNumber}:${game.voteRoundNumber}`} kind="text" titleRef={titleRef} roundNumber={game.roundNumber} voteRound={game.voteRoundNumber}
      options={ballotOptions} candidateIds={game.voteCandidateIds} runoff={runoff} ownId={participating ? player.ownAnswerId : null} ownVote={ownVote}
      canVote={participating && player.canVote} participating={participating} ownLabel="Tu respuesta"
      onVote={(answerId) => onAction({ type: 'VOTE_RED_FLAG', answerId })}
      className={s.ballot} title={'Vota la frase que mejor lo representa'} runoffTitle="Vota entre las empatadas"
      help="No puedes votar la tuya. Los autores se revelarán después." runoffHelp="Hubo empate: solo se vota entre las respuestas empatadas." />;
  } else if (writing && participating && ownAnswer) {
    bottom = <SocialPlate titleRef={titleRef} content={{
      icon: CheckCircle2, tone: 'ok', kicker: 'Tu respuesta secreta', title: 'Respuesta bloqueada',
      text: <><span className={s.ownText}>“{ownAnswer.text}”</span> Solo tú puedes verla hasta la votación.</>,
      aside: <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Enviada</Chip>,
    }} textClassName={s.lockedText} />;
  } else if (writing && participating) {
    bottom = <SocialPlate titleRef={titleRef} content={{
      icon: PenLine, tone: 'info', kicker: 'Tu respuesta secreta', title: green ? 'Escribe su mejor frase' : 'Escribe su peor frase',
      text: 'Se enviará automáticamente al terminar el tiempo si contiene texto. Máximo 100 caracteres.',
    }} textClassName={s.writeHelp}>
      <RedFlagWriter key={game.roundNumber} label={`Tu frase para ${pokemon?.name ?? 'el Pokémon'}`}
        initialDraft={player.ownDraft} canSubmit={player.canSubmit} roundEndsAt={game.roundEndsAt} serverOffset={offset} fieldRef={fieldRef}
        onDraft={(text) => sendRedFlagDraft(onAction, text)} onSubmit={(text) => onAction({ type: 'SUBMIT_RED_FLAG', text })} />
    </SocialPlate>;
  } else if (writing) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Eye, tone: 'info', kicker: 'No escribes en esta ronda', title: 'Estás observando', text: 'Verás las respuestas, sin autor, en la votación.' }} />;
  } else if (result) {
    const verdict = redFlagVerdict(result, selfId, participating);
    const seconds = Math.max(1, Math.ceil(transitionMs / 1_000));
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={{
      icon: verdict.tone === 'ok' ? Trophy : verdict.tone === 'bad' ? X : Eye, tone: verdict.tone, kicker: verdict.text, title: `${last ? 'Clasificación' : 'Siguiente ronda'} en ${seconds}s`,
      text: `Cada victoria vale ${RED_FLAG_WIN_POINTS} puntos, también cuando el empate persiste tras la segunda vuelta.`,
      ...(verdict.points > 0 ? { aside: <strong className={s.points}>+{verdict.points}<small> {pointsWord(verdict.points)}</small></strong> } : {}),
    }} />;
  } else {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Preparando el resultado…', text: 'La ronda sigue en un momento.' }} />;
  }

  return <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={redFlagHeading(game.phase, game.flagMode, result)} meta={modeChip} timer={timer}
    announcement={announcement} phases={<PhaseRail steps={redFlagSteps(game.phase)} current={redFlagCurrentStep(game.phase)} />} stage={stage} side={side} bottom={bottom} />;
}
