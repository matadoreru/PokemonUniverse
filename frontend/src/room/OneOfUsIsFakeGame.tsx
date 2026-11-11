import { ONE_OF_US_IS_FAKE_FAKE_ROUND_POINTS, ONE_OF_US_IS_FAKE_NORMAL_ROUND_POINTS, type FakePokemonChoice, type FakeRoundResult, type OneOfUsIsFakeConfig, type OneOfUsIsFakePlayerState, type OneOfUsIsFakePublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Clock3, Eye, HelpCircle, Search, ShieldAlert, Sparkles, Trophy, UserRoundX, X } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '../components/Avatar';
import { fakeAnnouncement, fakeCurrentStep, fakeHeading, fakeSteps, fakeTallySummary, fakeVerdict, FAKE_ROUND_LABELS } from '../games/one-of-us-is-fake/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Card, Chip, cx, Icon, Panel } from '../ui';
import { useFocusOnTransition } from './game-kit/focus-transition';
import { guessSprite, pointsWord } from './guess-kit';
import { useRoomMembers, type RoomMembers } from './room-members';
import { PokemonSelector } from './game-kit/PokemonSelector';
import {
  PhaseRail, ResponseProgress, SocialPlate, SocialPrompt, SocialScreen, VoteBallot, VoteTally, socialFocusKey, tallyOutcome,
  type BallotOption, type SocialPlateContent, type TallyOption,
} from './social-kit';
import { type ActiveGameProps, ignoreFailure } from './room-command';
import s from '../games/one-of-us-is-fake/OneOfUsIsFake.module.css';

const GAME_NAME = 'One of Us Is Fake';
const EMPTY_LOCKED = new Set<string>();


/**
 * Las elecciones del grupo (escena de la revelación, del debate y de la segunda vuelta): una `Card` por jugador con su
 * Pokémon y su nombre. En la revelación, las que faltan salen tapadas («Por revelar») y cada una gira al descubrirse.
 * `flip` sigue puesto en el debate: el motor descubre la última elección en el mismo paso en que abre el debate, así
 * que esa carta (a menudo la tuya, la que miras) llega ya en `DISCUSSION` y también tiene que girar; las ya giradas
 * conservan la clase y no repiten la animación. Encima, la categoría propia para debatir (o, a quien observa, que siguen en secreto).
 */
function ChoiceBoard({ playerIds, picked, choices, revealing, flip, category, seats }: {
  playerIds: readonly string[];
  /** Quién eligió (`selectionCompletedIds`, público): quien no eligió sale «Sin elección» desde el principio. */
  picked: ReadonlySet<string>;
  choices: ReadonlyMap<string, FakePokemonChoice>;
  revealing: boolean;
  /** Las cartas destapadas giran (revelación y debate). */
  flip: boolean;
  category: string | null;
  seats: RoomMembers;
}) {
  return <Panel variant="cream" title="Las elecciones" className={cx(s.board, !revealing && s.voting)} bodyClassName={cx(s.boardBody)} right={<span className={s.count}>{`${choices.size}/${picked.size}`}</span>}>
    <p className={s.category} data-testid="fake-category">
      {category !== null
        ? <><span className={s.categoryKicker}>Tu categoría</span> <span className={s.categoryText}>{category}</span></>
        : <span className={s.categoryKicker}>Las categorías siguen en secreto hasta el resultado</span>}
    </p>
    <ul className={s.grid} data-testid="fake-choices">{playerIds.map((id) => {
      const pokemon = choices.get(id);
      const name = seats.nameOf(id);
      const owner = <span className={s.owner} title={name} style={{ ['--seat' as string]: seats.colorOf(id) }}>{name}</span>;
      return <li key={id} className={s.cell} data-fake-choice={id}>
        {pokemon
          ? <Card name={pokemon.name} sprite={guessSprite(pokemon.sprite)} decorativeSprite size="fill" flip={flip}>{owner}</Card>
          : revealing && picked.has(id)
            ? <Card name="Por revelar" size="fill" art={<Icon icon={HelpCircle} size={32} />}>{owner}</Card>
            : <Card name="Sin elección" size="fill" art={<Icon icon={X} size={32} />}>{owner}</Card>}
      </li>;
    })}</ul>
  </Panel>;
}

/** Quién era el fake y las dos categorías (encima del recuento, solo en `ROUND_RESULTS`). */
function FakeReveal({ result, seats }: { result: FakeRoundResult; seats: RoomMembers }) {
  const fake = seats.get(result.fakePlayerId);
  const name = fake?.displayName ?? 'Entrenador';
  return <Panel variant="cream" as="section" aria-label="El fake era" className={cx(s.reveal)} bodyClassName={cx(s.revealBody)}>
    <div className={s.revealWho}>
      <Avatar name={name} avatar={fake?.avatar} size="md" />
      <span className={s.revealCopy}>
        <span className={s.categoryKicker}>El fake era</span>
        <strong className={s.revealName} title={name} data-testid="fake-player">{name}</strong>
        <span className={s.revealHow}>{result.selectedPlayerId === result.fakePlayerId ? 'Descubierto por el grupo' : 'Engañó al grupo'}</span>
      </span>
    </div>
    <dl className={s.categories}>
      <div className={s.categoryBox}><dt className={s.categoryKicker}>Categoría del grupo</dt><dd className={s.categoryText}>{result.mainCategory}</dd></div>
      <div className={cx(s.categoryBox, s.categoryFake)}><dt className={s.categoryKicker}>Categoría del fake</dt><dd className={s.categoryText}>{result.fakeCategory}</dd></div>
    </dl>
  </Panel>;
}

/**
 * One of Us Is Fake con el kit social (spec §2 y §6 «Juegos»). Arriba: la placa de la ronda con el plazo y «Saltar», las
 * fases y la escena: la categoría propia al elegir, las elecciones del grupo en `Card`s al revelarlas y al debatir y, en
 * el resultado, quién era el fake con las dos categorías y el recuento de la votación. Abajo, la acción: el buscador, la
 * papeleta secreta (con segunda vuelta solo entre los empatados) o el veredicto. Al lado, quién ha elegido o votado (en
 * texto, nunca el qué) o, al revelar, los puntos de la ronda.
 *
 * Privacidad: cada jugador solo recibe su categoría (`myCategory`; el fake, la suya, y solo con `fakeKnows` sabe que lo
 * es); las elecciones ajenas llegan en `revealedChoices` (desde la revelación), y el fake, la otra categoría y los votos
 * solo en `lastRound`, que la pantalla lee únicamente en `ROUND_RESULTS`.
 */
export function OneOfUsIsFakeGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as OneOfUsIsFakePublicState;
  const player = room.gamePlayerState as OneOfUsIsFakePlayerState | null;
  const config = room.selectedGameConfig as Partial<OneOfUsIsFakeConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const participating = player?.role === 'PLAYER';
  const choosing = game.phase === 'ROUND_ACTIVE';
  const revealing = game.phase === 'CHOICE_REVEAL';
  const voting = game.phase === 'DISCUSSION' || game.phase === 'REVOTE';
  const runoff = game.phase === 'REVOTE';
  // La revelación (el fake, su categoría y los votos) solo en su fase: un `lastRound` sobrante nunca llega al DOM.
  const result = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const { pokemon, error: loadError, loading: poolLoading, retry } = usePokemonPool({ generations: config?.generations ?? [], includeForms: config?.includeRegionalForms ?? false, enabled: choosing && participating });
  const transitionMs = useRemainingMs(result ? game.nextTransitionAt : null, offset);

  const seats = useRoomMembers(room); const { nameOf } = seats;
  const avatarRefOf = (id: string) => seats.get(id)?.avatar;
  const avatarOf = (id: string) => <Avatar name={nameOf(id)} avatar={avatarRefOf(id)} size="sm" />;
  const ownVote = participating ? player.ownVotePlayerId : null;
  const locked = voting && ownVote !== null;
  const informedFake = participating && player.isFake === true && !result;

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(socialFocusKey(game.phase, game.roundNumber, game.voteRoundNumber, locked), titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const timer = choosing
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Para elegir', totalMs: config?.selectionSeconds ? config.selectionSeconds * 1_000 : undefined }
    : voting
      ? { deadline: game.roundEndsAt, serverOffset: offset, label: runoff ? 'Para revotar' : 'Para debatir y votar', totalMs: config?.discussionSeconds ? config.discussionSeconds * 1_000 : undefined }
      // La revelación de cada elección dura menos de un segundo: sin plazo en la placa (no parpadea a cero).
      : { deadline: revealing ? null : game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  const announcement = fakeAnnouncement({
    phase: game.phase, roundNumber: game.roundNumber, voteRound: game.voteRoundNumber, ownChoice: choosing && participating ? player.ownChoice?.name ?? null : null, locked,
    tiedNames: runoff ? game.voteCandidates.map(nameOf) : [], result, nameOf,
  });

  // Las elecciones ajenas solo desde la revelación (al elegir, el servidor no las manda; aquí tampoco se leen).
  const choices = new Map(revealing || voting ? game.revealedChoices.map((choice) => [choice.playerId, choice.pokemon]) : []);
  const ownCategory = participating ? player.myCategory : null;
  const picked = new Set(game.selectionCompletedIds);

  let stage;
  if (result) {
    const tallyOptions: TallyOption[] = result.players.map((entry) => ({
      id: entry.playerId, name: nameOf(entry.playerId), media: avatarOf(entry.playerId), color: seats.colorOf(entry.playerId), self: entry.playerId === selfId,
      ...(entry.pokemon ? { pick: { name: entry.pokemon.name, sprite: guessSprite(entry.pokemon.sprite) } } : { detail: 'Sin elección' }),
      ...(entry.isFake ? { tags: [{ key: 'fake', label: 'Fake', icon: ShieldAlert }] } : {}),
    }));
    stage = <div className={s.resultStage}>
      <FakeReveal result={result} seats={seats} />
      <VoteTally idBase="fake-tally" title="Recuento de votos" options={tallyOptions} rounds={result.voteRounds} winnerIds={[result.selectedPlayerId]} voterName={nameOf} voterAvatar={avatarRefOf}
        winnerLabel={tallyOutcome([result.selectedPlayerId], result.voteRounds) === 'lot' ? 'Sale por sorteo' : 'Más votado'} winnerIcon={UserRoundX} verb="Sale" selfLabel="Tú" roundLabels={FAKE_ROUND_LABELS} summary={fakeTallySummary(result, nameOf)}
        emptyText="Nadie jugó esta ronda." className={s.tally} />
    </div>;
  } else if (choosing) {
    stage = participating
      ? <SocialPrompt kicker={informedFake ? 'Tu categoría (diferente) · solo la ves tú' : 'Tu categoría · solo la ves tú'} text={player.myCategory}
        help={informedFake ? 'Tienes una categoría diferente al resto y no conoces la principal. Elige algo que puedas defender.' : 'No hay respuesta correcta: elige un Pokémon que puedas justificar después. Uno del grupo tiene otra categoría.'} />
      : <SocialPrompt kicker="Categorías secretas" text="Cada jugador elige un Pokémon para su categoría" help="Uno recibió una categoría diferente. Verás las elecciones al revelarse." />;
  } else {
    stage = <ChoiceBoard playerIds={game.playerIds} picked={picked} choices={choices} revealing={revealing} flip={revealing || voting} category={ownCategory} seats={seats} />;
  }

  const side = result
    ? <ResponseProgress title="Puntos de la ronda" members={room.members} playerIds={game.playerIds} doneIds={[]} selfId={selfId} count={false}
      status={(id) => {
        const entry = result.players.find((candidate) => candidate.playerId === id);
        if (!entry) return { tone: 'neutral', text: 'No jugó' };
        if (entry.isFake) return { tone: result.winner === 'FAKE' ? 'ok' : 'bad', text: result.winner === 'FAKE' ? 'Fake · ganó' : 'Fake · descubierto', icon: ShieldAlert };
        if (id === result.selectedPlayerId) return { tone: 'bad', text: 'Expulsado siendo normal', icon: UserRoundX };
        return { tone: result.winner === 'NORMALS' ? 'ok' : 'neutral', text: result.winner === 'NORMALS' ? 'Normal · ganó' : 'Normal', ...(result.winner === 'NORMALS' ? { icon: Trophy } : {}) };
      }}
      value={(id) => `+${result.pointsAwarded[id] ?? 0}`} />
    : revealing
      ? <ResponseProgress members={room.members} playerIds={game.playerIds} doneIds={[...choices.keys()]} selfId={selfId} doneText="Revelada" pendingText="Por revelar"
        status={(id) => (picked.has(id) ? null : { tone: 'bad', text: 'Sin elección', icon: X })} note="Las categorías siguen en secreto hasta el resultado." />
      : <ResponseProgress members={room.members} playerIds={game.playerIds}
        doneIds={voting ? game.votedPlayerIds : game.selectionCompletedIds} selfId={selfId} doneText={voting ? 'Votó' : 'Eligió'} pendingText={voting ? 'Votando…' : 'Eligiendo…'}
        note={voting ? 'El destino de cada voto es secreto hasta el resultado.' : 'Las elecciones no se muestran hasta que todos eligen o se acaba el tiempo.'} />;

  const ballotOptions: BallotOption[] = game.playerIds.map((id) => ({ id, name: nameOf(id), ariaLabel: nameOf(id), media: avatarOf(id), ...(choices.get(id) ? { detail: `eligió ${choices.get(id)!.name}` } : {}) }));

  let bottom;
  if (voting) {
    bottom = <VoteBallot key={`${game.roundNumber}:${game.voteRoundNumber}`} kind="text" titleRef={titleRef} roundNumber={game.roundNumber} voteRound={game.voteRoundNumber}
      options={ballotOptions} candidateIds={game.voteCandidates} runoff={runoff} ownId={participating ? selfId : null} ownVote={ownVote}
      canVote={participating && player.canVote} participating={participating} ownLabel="Eres tú"
      onVote={(playerId) => onAction({ type: 'VOTE_PLAYER', playerId })}
      className={s.ballot} title="¿Quién es el fake?" runoffTitle="Vota entre los empatados"
      help="Defended vuestra elección en voz alta: explicad, acusad y escuchad. No puedes votarte." runoffHelp="Hubo empate: solo se vota entre los empatados. Si vuelven a empatar, decide el sorteo."
      watchingText="Puedes seguir el debate, pero no votas en esta ronda." />;
  } else if (choosing && participating) {
    const own = player.ownChoice;
    const content: SocialPlateContent = own
      ? { icon: CheckCircle2, tone: 'ok', kicker: 'Elección guardada', title: own.name, aside: <span className={s.saved}><Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Guardada</Chip><img className={s.ownSprite} src={guessSprite(own.sprite)} alt="" /></span> }
      : { icon: Search, tone: 'info', kicker: 'Tu elección secreta', title: 'Elige cualquier Pokémon' };
    bottom = <SocialPlate titleRef={titleRef} content={content} search>
      <PokemonSelector key={game.roundNumber} pokemon={pokemon} loading={poolLoading} loadError={loadError} onRetry={retry} locked={EMPTY_LOCKED} disabled={!player.canSelect}
        variant="embedded" autoFocus={false} inputLabel="Buscar Pokémon para tu categoría" onSelect={(pokemonId) => onAction({ type: 'SELECT_POKEMON', pokemonId }).catch(ignoreFailure)} />
    </SocialPlate>;
  } else if (choosing) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Eye, tone: 'info', kicker: 'No juegas en esta ronda', title: 'Estás observando', text: 'Puedes seguir las elecciones, el debate y el resultado, pero no participar.' }} />;
  } else if (revealing) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Sparkles, tone: 'info', kicker: 'Revelación en orden aleatorio', title: `Elecciones reveladas: ${choices.size} de ${picked.size}`, text: 'Se muestran una a una. Después se abre el debate y la votación.' }} />;
  } else if (result) {
    const verdict = fakeVerdict(result, selfId, participating);
    const seconds = Math.max(1, Math.ceil(transitionMs / 1_000));
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={{
      icon: verdict.tone === 'ok' ? Trophy : verdict.tone === 'bad' ? X : Eye, tone: verdict.tone, kicker: verdict.text, title: `${last ? 'Clasificación' : 'Siguiente ronda'} en ${seconds}s`,
      text: `Si el grupo expulsa al fake, cada normal gana ${ONE_OF_US_IS_FAKE_NORMAL_ROUND_POINTS} puntos; si no, el fake gana ${ONE_OF_US_IS_FAKE_FAKE_ROUND_POINTS}.`,
      ...(verdict.points > 0 ? { aside: <strong className={s.points}>+{verdict.points}<small> {pointsWord(verdict.points)}</small></strong> } : {}),
    }} />;
  } else {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Preparando el resultado…', text: 'La ronda sigue en un momento.' }} />;
  }

  const meta = informedFake ? <Chip tone="bad" icon={<Icon icon={ShieldAlert} size={18} />}>Eres el fake</Chip> : undefined;
  return <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={fakeHeading(game.phase, game.voteRoundNumber, result)} {...(meta ? { meta } : {})} timer={timer}
    announcement={announcement} phases={<PhaseRail steps={fakeSteps(game.phase, game.voteRoundNumber, result?.voteRounds.length ?? 0)} current={fakeCurrentStep(game.phase)} />}
    stage={stage} side={side} bottom={bottom} />;
}

