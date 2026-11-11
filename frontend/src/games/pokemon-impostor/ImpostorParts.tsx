import { IMPOSTOR_SKIP_TARGET, type ImpostorEliminationReveal, type ImpostorVoteResult, type PokemonImpostorPlayerState, type PokemonImpostorPublicState, type RoomMemberView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Brain, Check, CircleDashed, Eye, ShieldCheck, Skull, SkipForward, UserX, Users } from 'lucide-react';
import { Fragment, type CSSProperties, type ReactNode, type Ref } from 'react';
import { Avatar } from '../../components/Avatar';
import { playerColor } from '../../lib/player-color';
import { Badge, Card, Chip, cx, Icon, Panel, Pill, Row } from '../../ui';
import { impostorClueGroupLabel, impostorClueLine, impostorTallies, votesLabel } from './presentation';
import { impostorFellowsLead, impostorFellowsShort, impostorVoteHeadline, impostorVoteTargetLabel } from './pokemon-impostor-texts';
import s from './PokemonImpostor.module.css';

export type NameOf = (id: string) => string;

/** Datos de la sala que necesitan las piezas: nombre, avatar, color y si es uno mismo. */
export interface ImpostorPeople {
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  selfId: string;
  nameOf: NameOf;
  /** Jugadores expulsados (`eliminatedIds` de la partida): los aliados que estén aquí llevan «(fuera)». */
  outIds?: ReadonlySet<string>;
}

function personRow(people: ImpostorPeople, id: string) {
  const member = people.members.get(id);
  const name = people.nameOf(id);
  return {
    name,
    color: playerColor(people.colors.get(id) ?? 0),
    self: id === people.selfId,
    disconnected: member?.presence !== undefined && member.presence !== 'CONNECTED',
    avatar: <span className={s.rowAvatar}><Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" /></span>,
  };
}

/** Placa de la ronda (pantalla superior): ronda, vivos y desempate; el título de la fase y el tiempo a la derecha. */
export function ImpostorHud({ roundLabel, alive, tiebreak, title, timer, strip }: { roundLabel: string; alive: number; tiebreak: boolean; title: string; timer: ReactNode; /** Rol compacto (solo en el móvil). */ strip?: ReactNode }) {
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>{roundLabel}</Badge>
        <Chip tone="neutral" icon={<Icon icon={Users} size={18} />}>{alive} {alive === 1 ? 'vivo' : 'vivos'}</Chip>
        {tiebreak && <Chip tone="warn">Desempate</Chip>}
      </div>
      <h1 className={cx(s.title, 'ol')}>{title}</h1>
    </div>
    <div className={s.hudTimer}>{timer}</div>
    {strip}
  </Panel>;
}

/** Icono y texto de un rol propio. */
function roleLook(role: PokemonImpostorPlayerState['role']): { icon: LucideIcon; label: string; tone: string | undefined } {
  if (role === 'IMPOSTOR') return { icon: Skull, label: 'IMPOSTOR', tone: s.impostor };
  if (role === 'INNOCENT') return { icon: ShieldCheck, label: 'INOCENTE', tone: s.innocent };
  return { icon: Eye, label: 'Espectador', tone: s.watcher };
}

/** El Pokémon secreto (solo llega a quien puede verlo: inocentes y expulsados) o el aviso del impostor. */
function SecretPokemon({ player, box }: { player: PokemonImpostorPlayerState; box: 'reveal' | 'side' }) {
  // Carta llena en una caja que crece con la pantalla (en escritorio grande el sprite se ve en grande).
  if (player.secretPokemon) return <div className={cx(s.secret, box === 'reveal' ? s.secretReveal : s.secretSide)} data-impostor-secret={player.secretPokemon.name}><Card size="fill" name={player.secretPokemon.name} sprite={player.secretPokemon.sprite} decorativeSprite /></div>;
  if (!player.role) return <p className={s.help}>Observas la partida en directo.</p>;
  return <p className={s.help}>No conoces el Pokémon. Intenta disimular.</p>;
}

/** Aliados del impostor (`fellowImpostorIds`) con su nombre y si están fuera. Vacío para el resto. */
function fellowsOf(player: PokemonImpostorPlayerState, people: ImpostorPeople): { name: string; out: boolean }[] {
  if (player.role !== 'IMPOSTOR') return [];
  return (player.fellowImpostorIds ?? []).map((id) => ({ name: people.nameOf(id), out: people.outIds?.has(id) ?? false }));
}

/** Línea «Otro impostor: Ana» / «Otros impostores: Ana y Bea», con los nombres en negrita; nada sin aliados. */
function FellowsLine({ player, people }: { player: PokemonImpostorPlayerState; people: ImpostorPeople }) {
  const fellows = fellowsOf(player, people);
  if (fellows.length === 0) return null;
  return <p className={s.help} data-testid="impostor-fellows">
    {impostorFellowsLead(fellows.length)}
    {fellows.map((fellow, index) => <Fragment key={index}>
      {index === 0 ? '' : index === fellows.length - 1 ? ' y ' : ', '}
      <strong>{fellow.name}</strong>{fellow.out ? ' (fuera)' : ''}
    </Fragment>)}
  </p>;
}

/** Reparto de roles (pantalla superior en `ROLE_REVEAL`): el rol grande y el Pokémon secreto, solo a quien le toca. */
export function ImpostorRoleReveal({ player, people }: { player: PokemonImpostorPlayerState; people: ImpostorPeople }) {
  const look = roleLook(player.role);
  return <Panel variant="cream" as="section" aria-labelledby="impostor-role-title" bodyClassName={cx(s.reveal)}>
    <span className={cx(s.roleIcon, s.roleIconLg, look.tone)}><Icon icon={look.icon} size={32} /></span>
    <span className={s.kicker}>Tu rol</span>
    <h2 id="impostor-role-title" className={cx(s.roleName, look.tone && s.roleNameTone, look.tone)}>{look.label}</h2>
    <SecretPokemon player={player} box="reveal" />
    <FellowsLine player={player} people={people} />
  </Panel>;
}

/**
 * Tu rol en una línea dentro de la placa de la ronda, solo en el móvil (la columna lateral queda bajo el pliegue): el
 * sprite y el nombre del Pokémon secreto o, al impostor, que no lo conoce.
 */
export function ImpostorRoleStrip({ player, people }: { player: PokemonImpostorPlayerState; people: ImpostorPeople }) {
  if (!player.role) return null;
  const fellows = impostorFellowsShort(fellowsOf(player, people).map((fellow) => fellow.name));
  const note = fellows ?? (player.role === 'IMPOSTOR' ? 'Impostor · no conoces el Pokémon' : 'Sin Pokémon');
  const look = roleLook(player.role);
  return <p className={s.roleStrip} data-testid="impostor-role-strip">
    <span className={cx(s.roleTag, look.tone)}><Icon icon={look.icon} size={18} />{look.label}</span>
    {player.secretPokemon
      ? <><img className={s.stripSprite} src={player.secretPokemon.sprite} alt="" /><span className={s.stripName} title={player.secretPokemon.name}>{player.secretPokemon.name}</span></>
      : <span className={s.stripNote} title={note}>{note}</span>}
  </p>;
}

/**
 * Tu rol en la columna lateral (todas las fases salvo el reparto): rol, Pokémon secreto y, al impostor durante las
 * pistas, su único intento de adivinar el Pokémon.
 */
export function ImpostorRolePanel({ player, phase, guessOpen, onToggleGuess, people }: { player: PokemonImpostorPlayerState; phase: PokemonImpostorPublicState['phase']; guessOpen: boolean; onToggleGuess(): void; people: ImpostorPeople }) {
  const look = roleLook(player.role);
  const guessing = phase === 'CLUE_PHASE' && player.role === 'IMPOSTOR';
  return <Panel title="Tu rol" variant="cream" as="section" bodyClassName={cx(s.rolePanel)}
    right={<span className={cx(s.roleTag, look.tone)}><Icon icon={look.icon} size={18} />{look.label}</span>}>
    <SecretPokemon player={player} box="side" />
    <FellowsLine player={player} people={people} />
    {!player.alive && player.role && <p className={s.help}><strong>Eliminado</strong> · ahora eres espectador</p>}
    {guessing && <div className={s.guess}>
      <span className={s.guessTitle}><Icon icon={Brain} size={18} />Adivinar el Pokémon</span>
      {player.canGuessPokemon
        ? <><p className={s.help}>Un único intento en toda la partida, aunque no sea tu turno.</p>
          <Pill variant={guessOpen ? 'ghost' : 'blue'} size="small" block aria-expanded={guessOpen} onClick={onToggleGuess}>{guessOpen ? 'Cerrar buscador' : 'Adivinar Pokémon'}</Pill></>
        : <p className={cx(s.help, s.strong)}>{player.guessCorrect ? '¡Adivinaste el Pokémon!' : 'Ya utilizaste tu intento.'}</p>}
    </div>}
  </Panel>;
}

/** Orden de turnos con las pistas de cada ronda (pantalla superior en `CLUE_PHASE`). */
export function ImpostorClueBoard({ game, people, orderedIds }: { game: PokemonImpostorPublicState; people: ImpostorPeople; orderedIds: readonly string[] }) {
  const rounds = Array.from({ length: Math.max(1, game.roundNumber) }, (_, index) => index + 1);
  return <Panel title="Orden y pistas" variant="dark" scroll scrollLabel="Orden y pistas" className={cx(s.board)} bodyClassName={cx(s.boardBody)}
    right={<Badge tone="cream">{`${game.clueOrder.length} en el orden`}</Badge>}>
    {game.clueOrder.length === 0 && <p className={s.sideHint}>Nadie puede dar pistas ahora. La votación empezará cuando se acabe el tiempo.</p>}
    <ol className={s.clueList} aria-label="Orden de turnos" style={{ '--n': orderedIds.length } as CSSProperties}>{orderedIds.map((id) => {
      const order = game.clueOrder.indexOf(id);
      const eliminated = game.eliminatedIds.includes(id);
      const turn = game.phase === 'CLUE_PHASE' && game.currentCluePlayerId === id;
      const row = personRow(people, id);
      return <li key={id} className={cx(eliminated && s.out)} aria-current={turn ? 'step' : undefined}>
        <Row {...row} {...(order >= 0 ? { rank: order + 1 } : {})}
          meta={<span className={s.clues}>{rounds.map((round) => {
            const line = impostorClueLine(game, id, round);
            return <span key={round} className={cx(s.clue, line.tone === 'clue' ? s.sent : s[line.tone])}><span className={s.clueRound}>{impostorClueGroupLabel(game.mode, round)}</span><span className={s.clueText} title={line.text}>{line.text}</span></span>;
          })}</span>}
          value={eliminated ? <Chip tone="bad" icon={<Icon icon={UserX} size={18} />}>Eliminado</Chip>
            : turn ? <Chip tone="warn">{row.self ? 'Tu turno' : 'Su turno'}</Chip> : null} />
      </li>;
    })}</ol>
  </Panel>;
}

/** Última pista enviada por un jugador (la de la ronda más reciente que la tenga). */
function lastClue(game: PokemonImpostorPublicState, id: string): string | null {
  for (let round = game.roundNumber; round >= 1; round--) {
    const entry = game.clues[round]?.[id];
    if (entry?.status === 'SUBMITTED' && entry.text) return entry.text;
  }
  return null;
}

/**
 * Candidatos de la votación (pantalla superior en `VOTING`): una carta por jugador con su última pista y la de «Saltar».
 * Se pulsan mientras puedes votar; con el voto dado o sin voto son cartas fijas (sin apagar), con la tuya marcada.
 */
export function ImpostorVoteGrid({ game, people, selectedId, interactive, onSelect }: { game: PokemonImpostorPublicState; people: ImpostorPeople; selectedId: string | null; interactive: boolean; onSelect(id: string): void }) {
  const card = (id: string, name: string, art: ReactNode, extra: ReactNode, disabled = false) => {
    const state = selectedId === id ? 'selected' : 'idle';
    return <Card key={id} size="fill" name={name} art={art} state={state} attrs={{ 'aria-label': name, 'data-impostor-target': id }}
      {...(interactive ? { onSelect: () => onSelect(id), disabled } : {})}>
      <span className={s.voteExtra}>{extra}</span>
    </Card>;
  };
  return <Panel title={game.votingRound > 1 ? 'Vota entre los jugadores empatados' : 'Elige a quién quieres expulsar'} variant="dark" as="section" scroll scrollLabel="Candidatos" bodyClassName={cx(s.voteBody)}>
    <div className={s.voteGrid} role="group" aria-label="Candidatos a la expulsión" style={{ '--count': game.voteCandidateIds.length + 1 } as CSSProperties}>
      {game.voteCandidateIds.map((id) => {
        const self = id === people.selfId;
        const clue = lastClue(game, id);
        const member = people.members.get(id);
        return card(id, people.nameOf(id), <span className={s.bigAvatar}><Avatar name={people.nameOf(id)} avatar={member?.avatar} size="lg" /></span>,
          self ? <Chip tone="neutral">Eres tú</Chip> : clue ? <span className={s.voteClue} title={`«${clue}»`}>«{clue}»</span> : <span className={s.voteClue}>Sin pista</span>, self);
      })}
      {card(IMPOSTOR_SKIP_TARGET, 'Saltar', <span className={s.skipArt}><Icon icon={SkipForward} size={32} /></span>, <span className={s.voteClue}>Nadie es expulsado</span>)}
    </div>
  </Panel>;
}

/** Resultado de la votación (pantalla superior en `VOTE_RESULTS`): titular, recuento y quién votó a quién. */
export function ImpostorVoteResultPanel({ result, aliveIds, people }: { result: ImpostorVoteResult; aliveIds: readonly string[]; people: ImpostorPeople }) {
  const eliminated = result.kind === 'ELIMINATION';
  return <Panel variant="cream" as="section" aria-labelledby="impostor-vote-headline" bodyClassName={cx(s.result)}>
    <h2 id="impostor-vote-headline" className={s.headline}>{impostorVoteHeadline(result, people.nameOf)}</h2>
    <ul className={s.tallies} aria-label="Recuento de votos">{impostorTallies(result, people.nameOf).map((tally) => <li key={tally.id}>
      <Chip tone={eliminated && tally.id === result.eliminatedId ? 'bad' : 'neutral'}>{tally.label} · {votesLabel(tally.count)}</Chip>
    </li>)}</ul>
    <ul className={s.ballots} aria-label="Votos de la ronda">{aliveIds.map((voterId) => {
      const vote = result.votes[voterId];
      return <li key={voterId} className={s.ballot}>
        <span className={s.ballotName} title={people.nameOf(voterId)}>{people.nameOf(voterId)}</span>
        <span className={s.ballotArrow} aria-hidden="true">→</span>
        <span className="sr-only">votó a</span>
        <span className={s.ballotTarget} title={vote ? impostorVoteTargetLabel(vote.targetId, people.nameOf) : 'Sin voto'}>{vote ? impostorVoteTargetLabel(vote.targetId, people.nameOf) : 'Sin voto'}</span>
      </li>;
    })}</ul>
  </Panel>;
}

/**
 * Placa de la expulsión (pantalla superior en `ELIMINATION`). Hasta `roleShown` (1 s, al momento con reducción de
 * movimiento) no lleva nada que dependa del rol: ni texto, ni tono, ni clase; la línea del rol guarda su hueco.
 */
export function ImpostorEliminationPlate({ reveal, roleShown, reducedMotion, winnerTeam, people }: { reveal: ImpostorEliminationReveal; roleShown: boolean; reducedMotion: boolean; winnerTeam: PokemonImpostorPublicState['winnerTeam']; people: ImpostorPeople }) {
  const impostor = reveal.role === 'IMPOSTOR';
  const tone = roleShown ? impostor ? s.impostor : s.innocent : s.pending;
  const member = people.members.get(reveal.playerId);
  const name = people.nameOf(reveal.playerId);
  return <Panel variant="dark" as="section" aria-labelledby="impostor-eliminated-name" bodyClassName={cx(s.elimination, 'motion-enter-up')}>
    <span className={cx(s.eliminationBand, tone)} aria-hidden="true" />
    <span className={s.bigAvatar}><Avatar name={name} avatar={member?.avatar} size="lg" /></span>
    <strong id="impostor-eliminated-name" className={cx(s.eliminatedName, 'ol2')}>{name}</strong>
    <p className={cx(s.eliminatedRole, tone, roleShown && !reducedMotion && 'motion-enter-up')}>{roleShown ? `era ${impostor ? 'IMPOSTOR' : 'INOCENTE'}` : ' '}</p>
    {roleShown && winnerTeam && <p className={s.finish}>Partida terminada: ganan {winnerTeam === 'IMPOSTORS' ? 'los impostores' : 'los inocentes'}.</p>}
  </Panel>;
}

/** Jugadores de la partida (columna lateral fuera de las pistas): vivos y expulsados y, al votar, quién ya ha votado. */
export function ImpostorPlayersPanel({ game, people, className }: { game: PokemonImpostorPublicState; people: ImpostorPeople; className?: string | undefined }) {
  const voting = game.phase === 'VOTING';
  const voted = new Set(game.voteCompletedIds);
  return <Panel title="Jugadores" variant="dark" scroll scrollLabel="Jugadores de la partida" {...(className ? { className } : {})}
    right={<Badge tone="cream">{voting ? `${game.voteCompletedIds.length} / ${game.aliveIds.length} votos` : `${game.aliveIds.length} vivos`}</Badge>}>
    <ol className={s.rows} aria-label="Jugadores">{game.playerIds.map((id) => {
      const eliminated = game.eliminatedIds.includes(id);
      const status = eliminated ? <Chip tone="bad" icon={<Icon icon={UserX} size={18} />}>Eliminado</Chip>
        : voting ? voted.has(id) ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Votó</Chip> : <Chip tone="neutral" icon={<Icon icon={CircleDashed} size={18} />}>Pendiente</Chip>
          : null;
      return <li key={id} className={cx(eliminated && s.out)}><Row {...personRow(people, id)} {...(status ? { meta: <span className={s.rowMeta}>{status}</span> } : {})} /></li>;
    })}</ol>
  </Panel>;
}

export interface PlateProps {
  icon: LucideIcon;
  tone: 'ok' | 'bad' | 'info' | 'warn';
  kicker: string;
  title: ReactNode;
  text?: ReactNode;
  aside?: ReactNode;
  label?: string;
}

/**
 * Placa crema de la pantalla inferior: icono, kicker, título (admite foco por programa, `tabIndex={-1}`) y, a la
 * derecha, la acción.
 */
export function ImpostorPlate({ icon, tone, kicker, title, text, aside, label, titleRef }: PlateProps & { titleRef: Ref<HTMLHeadingElement> }) {
  return <Panel variant="cream" as="section" bodyClassName={cx(s.action)} {...(label ? { 'aria-label': label } : {})}>
    <span className={cx(s.actionIcon, s[tone])}><Icon icon={icon} size={32} /></span>
    <div className={s.actionText}>
      <span className={s.kicker}>{kicker}</span>
      <h2 ref={titleRef} tabIndex={-1} className={s.actionTitle}>{title}</h2>
      {text && <p className={s.help}>{text}</p>}
    </div>
    {aside && <div className={s.actionAside}>{aside}</div>}
  </Panel>;
}
