import { MOST_LIKELY_TO_WIN_POINTS, type MostLikelyToConfig, type MostLikelyToPlayerState, type MostLikelyToPublicState } from '@pokemon-universe/shared/public';
import { Check, CheckCircle2, Clock3, Eye, Search, Trophy, X } from 'lucide-react';
import { useRef } from 'react';
import { mostLikelyAnnouncement, mostLikelyCurrentStep, mostLikelyHeading, mostLikelySteps, mostLikelyVerdict } from '../games/most-likely-to/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Chip, Icon } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { guessSprite, pointsWord } from './guess-kit';
import { useRoomMembers } from './room-members';
import { PokemonSelector } from './PokemonSelector';
import {
  PhaseRail, ResponseProgress, SocialPlate, SocialPrompt, SocialScreen, VoteBallot, VoteTally, socialFocusKey, votesText,
  type BallotOption, type SocialPlateContent, type TallyOption,
} from './social-kit';
import { type ActiveGameProps, ignoreFailure } from './room-command';
import s from '../games/most-likely-to/MostLikelyTo.module.css';

const GAME_NAME = 'Most Likely To';
const EMPTY_LOCKED = new Set<string>();

/**
 * Most Likely To con el kit social (spec §2 y §6 «Juegos»). Arriba: la placa de la ronda con el plazo y «Saltar», las
 * fases y la pregunta del grupo en un `Panel` (al revelar, el recuento de votos con sus vueltas). Abajo, la acción: el
 * buscador de Pokémon para responder, la papeleta secreta (con segunda vuelta solo entre los empatados) o el veredicto.
 * Al lado, quién ha respondido o votado (en texto, nunca el qué) o, al revelar, los puntos de la ronda.
 *
 * Privacidad: las respuestas de los demás solo llegan en `revealedAnswers` (votación) y los votos solo en `lastRound`,
 * que la pantalla lee únicamente en `ROUND_RESULTS`.
 */
export function MostLikelyToGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as MostLikelyToPublicState;
  const player = room.gamePlayerState as MostLikelyToPlayerState | null;
  const config = room.selectedGameConfig as Partial<MostLikelyToConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const participating = player?.role === 'PLAYER';
  const choosing = game.phase === 'ROUND_ACTIVE';
  const voting = game.phase === 'VOTING' || game.phase === 'REVOTE';
  const runoff = game.phase === 'REVOTE';
  // La revelación (votos y ganadores) solo en su fase: un `lastRound` sobrante nunca llega al DOM.
  const result = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const { pokemon, error: loadError, loading: poolLoading, retry } = usePokemonPool({ generations: config?.generations ?? [], includeForms: config?.includeForms ?? false, enabled: choosing && participating });
  const transitionMs = useRemainingMs(result ? game.nextTransitionAt : null, offset);

  const members = useRoomMembers(room); const { nameOf, colorOf } = members;
  const ownVote = participating ? player.ownVotePlayerId : null;
  const locked = voting && ownVote !== null;

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(socialFocusKey(game.phase, game.roundNumber, game.voteRoundNumber, locked), titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const timer = choosing
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Para responder', totalMs: config?.selectionSeconds ? config.selectionSeconds * 1_000 : undefined }
    : voting
      ? { deadline: game.roundEndsAt, serverOffset: offset, label: runoff ? 'Para revotar' : 'Para votar', totalMs: config?.votingSeconds ? config.votingSeconds * 1_000 : undefined }
      : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  const answerName = (playerId: string) => {
    const answer = result?.answers.find((entry) => entry.playerId === playerId);
    return answer ? `${answer.pokemon.name} de ${nameOf(playerId)}` : nameOf(playerId);
  };
  const announcement = mostLikelyAnnouncement({
    phase: game.phase, roundNumber: game.roundNumber, ownChoice: choosing && participating ? player.ownChoice?.name ?? null : null, locked,
    tiedNames: runoff ? game.voteCandidates.map(nameOf) : [], result, nameOf: answerName,
  });

  const prompt = <SocialPrompt kicker="La pregunta del grupo" text={game.prompt} help={choosing ? 'Cada jugador elige en secreto el Pokémon que mejor encaja. Se pueden repetir.' : voting ? 'Los Pokémon repetidos siguen siendo candidaturas distintas.' : undefined} />;

  const tallyOptions: TallyOption[] = (result?.answers ?? []).map((answer) => ({
    id: answer.playerId, name: answer.pokemon.name, detail: `Respuesta de ${nameOf(answer.playerId)}`, color: colorOf(answer.playerId), self: answer.playerId === selfId,
    media: <img className={s.sprite} src={guessSprite(answer.pokemon.sprite)} alt="" />,
  }));
  const stage = result
    ? <VoteTally idBase="most-likely-tally" options={tallyOptions} rounds={result.voteRounds} winnerIds={result.winnerIds} voterName={nameOf} voterAvatar={(id) => members.get(id)?.avatar} intro={result.prompt}
      summaryName={answerName} emptyText="Nadie envió una respuesta a tiempo." className={s.tally} />
    : prompt;

  const side = result
    ? <ResponseProgress title="Puntos de la ronda" members={room.members} playerIds={game.playerIds} doneIds={[]} selfId={selfId} count={false}
      status={(id) => {
        const answer = result.answers.find((entry) => entry.playerId === id);
        if (!answer) return { tone: 'bad', text: 'Sin respuesta', icon: X };
        if (answer.won) return { tone: 'ok', text: result.winnerIds.length > 1 ? 'Victoria compartida' : 'Ganó', icon: Trophy };
        if (result.voteRounds.length > 1 && !result.voteRounds.at(-1)?.candidateIds.includes(id)) return { tone: 'neutral', text: 'Fuera de la segunda vuelta' };
        return { tone: 'neutral', text: votesText(answer.votesReceived) };
      }}
      value={(id) => `+${result.pointsAwarded[id] ?? 0}`} />
    : <ResponseProgress members={room.members} playerIds={game.playerIds} doneIds={voting ? game.votedPlayerIds : game.selectionCompletedIds} selfId={selfId}
      doneText={voting ? 'Votó' : 'Respondió'} note={voting ? 'El destino de cada voto es secreto hasta el resultado.' : 'Las respuestas no se muestran hasta que termina la selección.'} />;

  const ballotOptions: BallotOption[] = game.revealedAnswers.map((answer) => ({
    id: answer.playerId, name: answer.pokemon.name, ariaLabel: `${answer.pokemon.name}, respuesta de ${nameOf(answer.playerId)}`, sprite: guessSprite(answer.pokemon.sprite), detail: `de ${nameOf(answer.playerId)}`,
  }));

  let bottom;
  if (voting) {
    bottom = <VoteBallot key={`${game.roundNumber}:${game.voteRoundNumber}`} titleRef={titleRef} roundNumber={game.roundNumber} voteRound={game.voteRoundNumber} options={ballotOptions}
      candidateIds={game.voteCandidates} runoff={runoff} ownId={participating ? selfId : null} ownVote={ownVote} canVote={participating && player.canVote} participating={participating}
      onVote={(playerId) => onAction({ type: 'VOTE_ANSWER', playerId })}
      help="Elige la respuesta que mejor encaja con la pregunta. No puedes votar la tuya." runoffHelp="Hubo empate: solo se vota entre las respuestas empatadas." />;
  } else if (choosing && participating) {
    const own = player.ownChoice;
    const content: SocialPlateContent = own
      ? { icon: CheckCircle2, tone: 'ok', kicker: 'Respuesta guardada', title: own.name, aside: <span className={s.saved}><Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Guardada</Chip><img className={s.ownSprite} src={guessSprite(own.sprite)} alt="" /></span> }
      : { icon: Search, tone: 'info', kicker: 'Tu respuesta secreta', title: 'Elige un Pokémon' };
    bottom = <SocialPlate titleRef={titleRef} content={content} search>
      <PokemonSelector key={game.roundNumber} pokemon={pokemon} loading={poolLoading} loadError={loadError} onRetry={retry} locked={EMPTY_LOCKED} disabled={!player.canSelect}
        variant="embedded" autoFocus={false} inputLabel="Buscar Pokémon para responder" onSelect={(pokemonId) => onAction({ type: 'SELECT_POKEMON', pokemonId }).catch(ignoreFailure)} />
    </SocialPlate>;
  } else if (choosing) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Eye, tone: 'info', kicker: 'No respondes en esta ronda', title: 'Estás observando', text: 'Verás las respuestas en la votación y los votos al final.' }} />;
  } else if (result) {
    const verdict = mostLikelyVerdict(result, selfId, participating);
    const seconds = Math.max(1, Math.ceil(transitionMs / 1_000));
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={{
      icon: verdict.tone === 'ok' ? Trophy : verdict.tone === 'bad' ? X : Eye, tone: verdict.tone, kicker: verdict.text, title: `${last ? 'Clasificación' : 'Siguiente ronda'} en ${seconds}s`,
      text: `Cada victoria vale ${MOST_LIKELY_TO_WIN_POINTS} puntos; en un empate, los ${MOST_LIKELY_TO_WIN_POINTS} puntos van a cada autor empatado.`,
      ...(verdict.points > 0 ? { aside: <strong className={s.points}>+{verdict.points}<small> {pointsWord(verdict.points)}</small></strong> } : {}),
    }} />;
  } else {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Preparando el resultado…', text: 'La ronda sigue en un momento.' }} />;
  }

  return <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={mostLikelyHeading(game.phase, result)} timer={timer}
    announcement={announcement} phases={<PhaseRail steps={mostLikelySteps(game.phase)} current={mostLikelyCurrentStep(game.phase)} />} stage={stage} side={side} bottom={bottom} />;
}
