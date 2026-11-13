import { type OddOneOutConfig, type OddOneOutOption, type OddOneOutOptionId, type OddOneOutPlayerState, type OddOneOutPublicState, type RoomMemberView, ODD_ONE_OUT_OPTION_IDS } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Check, CheckCircle2, CircleDashed, Clock3, Eye, MousePointerClick, SearchCheck, TimerOff, XCircle } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { AvatarStack, avatarStackLabel } from '../../components/AvatarStack';
import { useServerOffset } from '../../hooks/useServerTime';
import { apiAsset } from '../../lib/api';
import { playerColor } from '../../lib/player-color';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { GAME_SIDE_FIT, GameScreen, type GameTimer } from '../../room/game-kit/GameScreen';
import { useChoiceShortcuts } from '../../room/game-kit/useChoiceShortcuts';
import { useOutcomeCue } from '../../room/game-kit/useOutcomeCue';
import { usePendingAction } from '../../room/game-kit/usePendingAction';
import type { ActiveGameProps } from '../../room/room-command';
import { UNKNOWN_PLAYER_NAME, useRoomMembers } from '../../room/room-members';
import { ActionPlate, Badge, Card, Chip, cx, Icon, Panel, Row, ScoreValue, type ActionPlateTone, type CardState } from '../../ui';
import { roundOutcome, votedCountText } from './presentation';
import s from './OddOneOut.module.css';

/** Estado de la carta: al votar, la elegida; al revelar, el intruso como respuesta y las otras tres como miembros de la categoría. */
export function oddCardState({ reveal, selected, intruder }: { reveal: boolean; selected: boolean; intruder: boolean }): CardState {
  if (reveal) return intruder ? 'wrong' : 'correct';
  return selected ? 'selected' : 'idle';
}

/** Opción elegida con una tecla: 1–4 o A–D. */
function optionFromKey(key: string): OddOneOutOptionId | null {
  const index = /^[1-4]$/.test(key) ? Number(key) - 1 : ODD_ONE_OUT_OPTION_IDS.findIndex((id) => id === key.toUpperCase());
  return ODD_ONE_OUT_OPTION_IDS[index] ?? null;
}

function OptionCard({ option, voters, selected, interactive, reveal, intruder, onSelect }: {
  option: OddOneOutOption;
  voters: RoomMemberView[];
  selected: boolean;
  interactive: boolean;
  reveal: boolean;
  intruder: boolean;
  onSelect(): void;
}) {
  const role = reveal ? intruder ? ', el intruso' : ', pertenece a la categoría' : selected ? ', voto bloqueado' : '';
  const label = `Opción ${option.id}: ${option.pokemonName}${role}`;
  return <Card size="fill" name={option.pokemonName} sprite={apiAsset(option.sprite)} decorativeSprite state={oddCardState({ reveal, selected, intruder })} marks="corner" action
    attrs={{ 'data-odd-option': option.id, ...(reveal && intruder ? { 'data-intruder': 'true' } : {}), ...(interactive ? { 'aria-label': label, 'aria-keyshortcuts': `${option.id} ${option.id.charCodeAt(0) - 64}` } : {}) }}
    {...(interactive ? { onSelect } : {})}>
    {reveal && <span className={s.voters}>
      {voters.length > 0
        ? <AvatarStack testId={`odd-voters-${option.id}`} max={4} members={voters.map((member) => ({ id: member.id, name: member.displayName, avatar: member.avatar }))}
          label={avatarStackLabel(voters.map((member) => member.displayName), `${voters.length === 1 ? '1 voto' : `${voters.length} votos`}:`)} />
        : <span className="sr-only" data-testid={`odd-voters-${option.id}`}>Sin votos</span>}
    </span>}
    {!interactive && <span className="sr-only">{label}</span>}
  </Card>;
}

interface PlateContent { icon: LucideIcon; tone: ActionPlateTone; kicker: string; title: ReactNode; text?: ReactNode; aside?: ReactNode }

function Plate({ content, focusKey }: { content: PlateContent; focusKey: string | null }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  // Al votar o revelar el foco, si se ha perdido con el botón, va al título de la placa.
  useFocusOnTransition(focusKey, titleRef);
  return <ActionPlate titleId={titleId} titleRef={titleRef} icon={content.icon} tone={content.tone} kicker={content.kicker} title={content.title} text={content.text} aside={content.aside} />;
}

/** Marcador de la partida (columna lateral): una fila por jugador con su voto de la ronda y sus puntos. */
function Sidebar({ game, members, colors, selfId, className }: {
  game: OddOneOutPublicState;
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  selfId: string;
  className?: string | undefined;
}) {
  const reveal = game.phase === 'ROUND_RESULTS';
  const voted = new Set(game.votedPlayerIds);
  const score = (id: string) => game.scores[id] ?? 0;
  const name = (id: string) => members.get(id)?.displayName ?? UNKNOWN_PLAYER_NAME;
  const ranking = [...game.playerIds].sort((left, right) => score(right) - score(left) || name(left).localeCompare(name(right)));
  return <Panel title="Marcador" variant="dark" scroll scrollLabel="Marcador de la partida" {...(className ? { className } : {})}
    right={<Badge tone="cream">{votedCountText(game.votedPlayerIds.length, game.playerIds.length)}</Badge>}>
    <ol className={s.rows} aria-label="Clasificación de la partida">{ranking.map((id) => {
      const member = members.get(id);
      const vote = reveal ? game.lastRound?.votes[id] : undefined;
      const correct = vote !== undefined && vote.optionId === game.lastRound?.intruderOptionId;
      const gained = reveal ? game.lastRound?.points[id] ?? 0 : 0;
      const status = member?.role === 'SPECTATOR'
        ? <Chip tone="neutral" icon={<Icon icon={Eye} size={18} />}>Espectador</Chip>
        : reveal
          ? vote
            ? <Chip tone={correct ? 'ok' : 'bad'} icon={<Icon icon={correct ? Check : XCircle} size={18} />}>{correct ? `+${gained}` : '+0'}<span className="sr-only">{correct ? ': acertó' : ': falló'}</span></Chip>
            : <Chip tone="neutral" icon={<Icon icon={TimerOff} size={18} />}>Sin voto</Chip>
          : voted.has(id)
            ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Votó</Chip>
            : <Chip tone="neutral" icon={<Icon icon={CircleDashed} size={18} />}>Pendiente</Chip>;
      return <li key={id} aria-current={id === selfId ? 'true' : undefined}>
        <Row name={name(id)} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name(id)} avatar={member?.avatar} level={member?.level} size="sm" />}
          meta={<span className={s.rowMeta}>{status}</span>}
          value={<ScoreValue value={score(id)} self={id === selfId} quiet color={playerColor(colors.get(id) ?? 0)} className={s.score}><small> pts</small></ScoreValue>} />
      </li>;
    })}</ol>
  </Panel>;
}

/**
 * El Intruso, en el marco de juego (`GameScreen`): cuatro cartas grandes y un voto por ronda, que se bloquea al pulsar.
 * Mientras la ronda está abierta no se sabe la categoría ni qué votó nadie (solo quién ha votado); al revelar, la
 * categoría con su explicación, las tres cartas que la comparten, el intruso y los votantes de cada carta. Los fallos
 * del servidor los publica la sala: `usePendingAction` no los repite aquí.
 */
export function OddOneOutGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as OddOneOutPublicState;
  const config = room.selectedGameConfig as OddOneOutConfig;
  const playerState = room.gamePlayerState as OddOneOutPlayerState | null;
  const { pending, submit } = usePendingAction(onAction);
  const serverOffset = useServerOffset(room.serverNow);
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  const active = game.phase === 'ROUND_ACTIVE';
  const reveal = game.phase === 'ROUND_RESULTS' && game.lastRound !== null;
  const participant = game.playerIds.includes(selfId);
  const ownVote = playerState?.vote ?? null;
  const interactive = active && participant && !ownVote && playerState?.canVote === true;
  const round = reveal ? game.lastRound : null;
  const intruder = round ? game.options.find((option) => option.id === round.intruderOptionId) ?? null : null;
  const outcome = round && participant ? roundOutcome(round, selfId) : null;
  const points = round?.points[selfId] ?? 0;
  useOutcomeCue(round && participant ? Boolean(round.votes[selfId] && round.votes[selfId]?.optionId === round.intruderOptionId) : null, game.roundNumber);

  const vote = (optionId: OddOneOutOptionId) => {
    if (interactive && pending === null) void submit({ type: 'VOTE', optionId });
  };
  // 1–4 o A–D votan al instante, como el clic.
  useChoiceShortcuts(interactive && pending === null, (key) => {
    const optionId = optionFromKey(key);
    if (!optionId) return false;
    vote(optionId);
    return true;
  });

  const transitionLabel = game.roundNumber >= game.totalRounds ? 'Resultados finales' : 'Siguiente ronda';
  const timer: GameTimer = active
    ? { deadline: game.roundEndsAt, serverOffset, totalMs: Math.max(1, config.roundSeconds * 1_000), label: 'Tiempo' }
    : { deadline: reveal ? game.nextTransitionAt : null, serverOffset, label: transitionLabel };

  const grid = game.options.length > 0
    ? <div className={s.grid} data-count={game.options.length} role="group" aria-label="Opciones de Pokémon">{game.options.map((option) => {
      const voters = Object.entries(round?.votes ?? {})
        .filter(([, entry]) => entry.optionId === option.id)
        .map(([playerId]) => members.get(playerId))
        .filter((member): member is RoomMemberView => Boolean(member));
      return <OptionCard key={option.id} option={option} voters={voters} selected={ownVote?.optionId === option.id} interactive={interactive} reveal={reveal}
        intruder={round?.intruderOptionId === option.id} onSelect={() => vote(option.id)} />;
    })}</div>
    : <div className={s.grid} data-count={4} aria-busy="true"><span className="sr-only">Cargando opciones</span></div>;

  const side = <Sidebar game={game} members={members} colors={colors} selfId={selfId} className={cx(s.sidePanel, GAME_SIDE_FIT)} />;

  let plate: PlateContent;
  let announcement: string;
  let focusKey: string | null = null;
  if (round && intruder) {
    const found = outcome?.tone === 'ok';
    focusKey = `reveal-${round.roundNumber}`;
    plate = {
      icon: found ? CheckCircle2 : outcome?.tone === 'bad' ? XCircle : outcome ? TimerOff : SearchCheck,
      tone: outcome?.tone ?? 'info', kicker: 'Revelación', title: outcome?.title ?? `El intruso era ${intruder.pokemonName}`,
      text: <>
        <span className={s.category}>{`Categoría: ${round.category.label}`}</span>
        <span className={s.explanation}>{round.category.explanation}</span>
        <strong className={s.intruderLine}>{`El intruso era ${intruder.pokemonName}`}</strong>
      </>,
      aside: outcome ? <strong className={s.points}>+{points}<small> puntos</small></strong> : null,
    };
    announcement = `Revelación. Categoría: ${round.category.label}. El intruso era ${intruder.pokemonName}. ${outcome ? `${outcome.title} +${points} puntos.` : ''}`.trim();
  } else if (!active) {
    plate = { icon: Clock3, tone: 'info', kicker: 'El Intruso', title: 'Preparando la ronda…', text: 'El servidor reparte los Pokémon de la siguiente ronda.' };
    announcement = 'Preparando la ronda.';
  } else if (!participant) {
    plate = { icon: Eye, tone: 'info', kicker: 'Sin voto esta ronda', title: 'Estás observando', text: 'Estás viendo la votación como espectador.' };
    announcement = '';
  } else if (ownVote) {
    const chosen = game.options.find((option) => option.id === ownVote.optionId);
    focusKey = `vote-${game.roundNumber}`;
    plate = { icon: Check, tone: 'ok', kicker: 'Voto bloqueado', title: `Has votado: ${chosen?.pokemonName ?? ownVote.optionId}`, text: 'Esperando al resto de entrenadores.',
      aside: <span>{votedCountText(game.votedPlayerIds.length, game.playerIds.length)}</span> };
    announcement = `Voto registrado: opción ${ownVote.optionId}. Esperando al resto de entrenadores.`;
  } else {
    plate = { icon: MousePointerClick, tone: 'info', kicker: 'Tu voto', title: 'Pulsa al Pokémon que no encaja',
      text: <span className={s.shortcuts}>Atajos: A–D o 1–4 · el voto es inmediato</span>,
      aside: <span>{votedCountText(game.votedPlayerIds.length, game.playerIds.length)}</span> };
    announcement = 'Elige al intruso: uno de los cuatro no comparte la categoría de los otros tres.';
  }

  return <GameScreen gameName="El Intruso" roundNumber={game.roundNumber} totalRounds={game.totalRounds} phase={game.phase} heading="¿Quién es el intruso?"
    timer={timer} announcement={announcement} clue={grid} side={side} bottom={<Plate content={plate} focusKey={focusKey} />} />;
}
