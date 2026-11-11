import { POKEMON_TYPES, type PokemonType, type RoomMemberView, type TypeDuelAttempt, type TypeDuelPublicState, type TypeDuelRoundResult } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Check, CircleDashed, Clock3, Equal, Eye, Hourglass, LockKeyhole, Search, Swords, Target, Trophy, X, XCircle, Zap } from 'lucide-react';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { Avatar } from '../../components/Avatar';
import { ScorePop } from '../../components/ScorePop';
import { apiAsset } from '../../lib/api';
import { playerColor } from '../../room/player-color';
import { Badge, Card, Chip, cx, Icon, Panel, Pill, Row, TypeBadge, TypeOption } from '../../ui';
import { sharesPosition } from '../../room/results-ties';
import { higherLowerRanking } from '../higher-lower/presentation';
import { typeDuelMemberStatus, typeGridMove, typeLabel, type TypeDuelPlateKind } from './presentation';
import { UNKNOWN_PLAYER_NAME } from '../../room/room-members';
import s from './TypeDuel.module.css';

// Los sprites llegan como ruta del proxy opaco (`/api/pokemon/{id}/sprite`); se sirven desde el origen de la API.
export const typeDuelSprite = (sprite: string) => sprite.startsWith('/api/') ? apiAsset(sprite) : sprite;

/** Placa de la ronda (pantalla superior): ronda y fase, el título y, a la derecha, el plazo del servidor. */
export function TypeDuelHud({ roundNumber, totalRounds, phaseLabel, heading, timer }: { roundNumber: number; totalRounds: number; phaseLabel: string; heading: string; timer: ReactNode }) {
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>Ronda {roundNumber} de {totalRounds}</Badge>
        <Chip tone="neutral" icon={<Icon icon={Swords} size={18} />}>{phaseLabel}</Chip>
      </div>
      <h1 className={cx(s.heading, 'ol')} title={heading}>{heading}</h1>
    </div>
    <div className={s.hudTimer}>{timer}</div>
  </Panel>;
}

export interface PickDuelist { id: string; name: string; member: RoomMemberView | undefined; color: string; locked: boolean; ownType: PokemonType | null }

/**
 * Elección secreta (pantalla superior): los dos duelistas frente a frente con su tipo tapado («?») y si ya han
 * bloqueado. Solo el tipo propio se ve (`ownType`, del estado del jugador); el del rival no llega al cliente.
 */
export function TypeDuelPickBoard({ duelists, selfId }: { duelists: readonly [PickDuelist, PickDuelist]; selfId: string }) {
  return <section className={s.pickBoard} aria-labelledby="type-duel-pick-title">
    <div className={s.pickHead}>
      <span className={s.pickIcon}><Icon icon={LockKeyhole} size={24} /></span>
      <div>
        <h2 id="type-duel-pick-title" className={s.pickTitle}>Elegid un tipo en secreto</h2>
        <p className={s.pickHelp}>Las elecciones se revelarán simultáneamente.</p>
      </div>
    </div>
    <div className={s.pickRow}>
      <PickSide duelist={duelists[0]} self={duelists[0].id === selfId} />
      <span className={s.vsDisc} aria-hidden="true"><span className="ol">VS</span></span>
      <PickSide duelist={duelists[1]} self={duelists[1].id === selfId} />
    </div>
  </section>;
}

function PickSide({ duelist, self }: { duelist: PickDuelist; self: boolean }) {
  const shown = self ? duelist.ownType : null;
  return <div className={cx(s.pickSide, duelist.locked && s.pickSideLocked)} style={{ '--player': duelist.color } as CSSProperties} data-duelist={duelist.id}>
    <span className={s.pickAvatar}><Avatar name={duelist.name} avatar={duelist.member?.avatar} size="md" /></span>
    <strong className={s.pickName} title={duelist.name}>{duelist.name}{self && <span className={s.you}> (tú)</span>}</strong>
    {shown
      ? <TypeBadge type={shown} label={typeLabel(shown)} size="lg" />
      : <span className={s.hiddenType} aria-label="Tipo oculto"><span aria-hidden="true">?</span></span>}
    <Chip tone={duelist.locked ? 'ok' : 'neutral'} icon={<Icon icon={duelist.locked ? Check : Hourglass} size={18} />}>{duelist.locked ? 'Tipo bloqueado' : 'Eligiendo…'}</Chip>
  </div>;
}

/**
 * Resultado del duelo (pantalla superior): título y motivo, la combinación, la carta del Pokémon ganador (gira al
 * aparecer) y los que también valían. `data-testid="type-duel-result"`.
 */
export function TypeDuelResultScene({ lastRound, title, detail, types, winningAttempt, winnerName }: { lastRound: TypeDuelRoundResult; title: string; detail: string | null; types: readonly PokemonType[]; winningAttempt: TypeDuelAttempt | null; winnerName: string | null }) {
  const solutions = lastRound.solutions;
  return <Panel variant="cream" as="section" aria-labelledby="type-duel-result-title" className={cx(s.resultPanel)} bodyClassName={cx(s.result)}>
    <div className={s.resultMain} data-testid="type-duel-result">
      <span className={cx(s.resultIcon, winnerName ? s.tone_warn : s.tone_info)}><Icon icon={winnerName ? Trophy : Hourglass} size={32} /></span>
      <div className={s.resultText}>
        <span className={s.kicker}>Resultado del duelo</span>
        <h2 id="type-duel-result-title" className={s.resultTitle}>{title}</h2>
        {detail && <p className={s.help}>{detail}</p>}
        {types.length > 0 && <span className={s.resultTypes}>{types.map((type, index) => <TypeBadge key={`${type}-${index}`} type={type} label={typeLabel(type)} />)}</span>}
      </div>
      {winningAttempt && <div className={s.winner}>
        <Card size="sm" sprite={typeDuelSprite(winningAttempt.sprite)} name={winningAttempt.pokemonName} state="correct" flip attrs={{ 'data-winning-card': 'true' }} />
        <span className={s.winnerLabel}>Respuesta ganadora</span>
      </div>}
    </div>
    {solutions.length > 0 && <div className={s.solutionsBlock}>
      <h3 className={s.kicker}>{lastRound.reason === 'WINNER' ? 'También podíais haber elegido' : 'Podíais haber elegido'}</h3>
      <ul className={s.solutionGrid} style={{ '--count': solutions.length } as CSSProperties}>
        {solutions.map((solution) => <li key={solution.id}><Card size="sm" sprite={typeDuelSprite(solution.sprite)} name={solution.name} decorativeSprite /></li>)}
      </ul>
    </div>}
  </Panel>;
}

/** Línea de un jugador del marcador: duelista u observador y, en la ronda, su estado (sin el tipo hasta la revelación). */
function MemberChip({ game, id }: { game: TypeDuelPublicState; id: string }) {
  const status = typeDuelMemberStatus(game, id);
  switch (status.kind) {
    case 'watching': return <Chip tone="neutral" icon={<Icon icon={Eye} size={18} />}>Observa</Chip>;
    case 'choosing': return <Chip tone="neutral" icon={<Icon icon={CircleDashed} size={18} />}>Eligiendo…</Chip>;
    case 'locked': return <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Tipo bloqueado</Chip>;
    case 'type': return <TypeBadge type={status.type} label={typeLabel(status.type)} size="sm" />;
    case 'won': return <Chip tone="ok" icon={<Icon icon={Trophy} size={18} />}>Gana +5</Chip>;
    case 'lost': return <Chip tone="bad" icon={<Icon icon={X} size={18} />}>Pierde</Chip>;
    default: return <Chip tone="neutral">Sin puntos</Chip>;
  }
}

/**
 * Marcador (columna lateral): una franja por jugador con su color, los puntos y su papel en el duelo (duelista con su
 * estado, u observador). Los empates con puntos llevan su chip.
 */
export function TypeDuelSidebar({ game, members, colors, selfId, className }: { game: TypeDuelPublicState; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  const nameOf = (id: string) => members.get(id)?.displayName ?? UNKNOWN_PLAYER_NAME;
  const ranking = higherLowerRanking(game, nameOf);
  const points = (id: string) => game.scores[id] ?? 0;
  return <Panel title="Marcador" variant="dark" scroll scrollLabel="Marcador de la partida" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${game.playerIds.length} jugadores`}</Badge>}>
    <ol className={s.rows} aria-label="Clasificación de la partida">{ranking.map(({ id, position }) => {
      const member = members.get(id);
      const name = nameOf(id);
      const duelist = game.participants.includes(id);
      return <li key={id} aria-current={id === selfId ? 'true' : undefined} data-duelist={duelist || undefined}>
        <Row rank={position} name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
          meta={<span className={s.rowMeta}>
            {duelist && <span className={s.duelTag}><Icon icon={Swords} size={18} />Duelista</span>}
            <MemberChip game={game} id={id} />
            {sharesPosition(ranking, id, points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
          </span>}
          value={<span className={s.score}>{points(id)}<small> pts</small></span>} />
      </li>;
    })}</ol>
  </Panel>;
}

/** Intentos públicos de la carrera (columna lateral): quién probó qué y si valía; el último arriba. */
export function TypeDuelAttempts({ attempts, members, colors, className }: { attempts: readonly TypeDuelAttempt[]; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; className?: string | undefined }) {
  const ordered = [...attempts].reverse();
  return <Panel title="Intentos públicos" variant="dark" scroll scrollLabel="Intentos públicos del duelo" {...(className ? { className } : {})} right={<Badge tone="cream">{attempts.length}</Badge>}>
    {/* Vacío sin región viva propia (la pantalla ya tiene la suya): enseña a jugar. */}
    {attempts.length === 0 && <p className={s.empty}><Icon icon={Search} size={24} /><span><strong>Todavía no hay intentos.</strong> El primero que dé con un Pokémon de la combinación exacta gana.</span></p>}
    {ordered.length > 0 && <ul className={s.rows} aria-label="Intentos del duelo">{ordered.map((attempt, index) => {
      const name = members.get(attempt.playerId)?.displayName ?? UNKNOWN_PLAYER_NAME;
      return <li key={`${attempt.playerId}-${attempt.attemptedAt}-${index}`}>
        <Row name={attempt.pokemonName} color={playerColor(colors.get(attempt.playerId) ?? 0)}
          avatar={<img className={s.attemptSprite} src={typeDuelSprite(attempt.sprite)} alt="" />}
          meta={<span className={s.rowMeta}><span className={s.attemptBy}>{name} probó</span>
            <Chip tone={attempt.correct ? 'ok' : 'bad'} icon={<Icon icon={attempt.correct ? Check : X} size={18} />}>{attempt.correct ? 'Combinación válida' : 'No coincide con los tipos'}</Chip></span>} />
      </li>;
    })}</ul>}
  </Panel>;
}

/**
 * Los 18 tipos para elegir (`TypeOption`, conmutadores con `aria-pressed`). Foco itinerante: un solo tipo en el orden
 * de tabulación y las flechas, Inicio y Fin se mueven por la rejilla.
 */
export function TypePicker({ pending, onPick }: { pending: PokemonType | null; onPick(type: PokemonType): void }) {
  const [focusIndex, setFocusIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const top = buttons[0]?.offsetTop;
    let columns = 0;
    while (columns < buttons.length && buttons[columns]!.offsetTop === top) columns++;
    const next = typeGridMove(index, event.key, columns, buttons.length);
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    buttons[next]?.focus();
  }
  return <div ref={gridRef} className={s.typeGrid} role="group" aria-label="Tipos" onKeyDown={onKeyDown}>
    {POKEMON_TYPES.map((type, index) => <TypeOption key={type} type={type} label={typeLabel(type)} aria-label={`Elegir tipo ${typeLabel(type)}`}
      pressed={pending === type} loading={pending === type} disabled={pending !== null && pending !== type}
      tabIndex={index === focusIndex ? 0 : -1} onFocus={() => setFocusIndex(index)} onClick={() => onPick(type)} />)}
  </div>;
}

interface PlateContent {
  icon: LucideIcon;
  tone: 'ok' | 'bad' | 'info' | 'warn';
  kicker: string;
  title: ReactNode;
  text?: ReactNode;
  aside?: ReactNode;
}

export interface TypeDuelPlateProps {
  kind: TypeDuelPlateKind;
  ownType: PokemonType | null;
  /** Tipo enviado a la espera del servidor. */
  pendingType: PokemonType | null;
  phase: TypeDuelPublicState['phase'];
  countdown: string;
  verdict: string;
  /** Resultado: puntos propios ganados (0 si no). */
  wonPoints: number;
  /** Combinación imposible: ¿vuelven a elegir? */
  willRetry: boolean;
  /** Búsqueda: el buscador (o su estado) y el aviso del último intento o de la espera. */
  search?: ReactNode;
  searchNote?: ReactNode;
  /** Resultado: la acción del host. */
  hostAction?: ReactNode;
  titleRef: Ref<HTMLHeadingElement>;
  onPick(type: PokemonType): void;
}

/**
 * Pantalla inferior: elegir tipo (los 18), el tipo bloqueado, observar, la revelación, la carrera con el buscador, la
 * combinación imposible o el resultado con los puntos y la acción del host. El título admite foco por programa.
 */
export function TypeDuelPlate(props: TypeDuelPlateProps) {
  const { kind, titleRef } = props;
  const content = plateContent(props);
  const wide = kind === 'pick' || kind === 'search';
  return <Panel variant="cream" as="section" bodyClassName={cx(s.plate, wide && s.plateWide, kind === 'search' && s.plateSearch)} aria-labelledby="type-duel-plate-title">
    <div className={s.plateRow}>
      <span className={cx(s.plateIcon, s[`tone_${content.tone}`])}><Icon icon={content.icon} size={32} /></span>
      <div className={s.plateText}>
        <span className={s.kicker}>{content.kicker}</span>
        <h2 id="type-duel-plate-title" ref={titleRef} tabIndex={-1} className={s.plateTitle}>{content.title}</h2>
        {content.text && <p className={s.help}>{content.text}</p>}
      </div>
      {content.aside && <div className={s.plateAside}>{content.aside}</div>}
    </div>
    {kind === 'pick' && <TypePicker pending={props.pendingType} onPick={props.onPick} />}
    {kind === 'search' && props.search}
  </Panel>;
}

function plateContent({ kind, ownType, phase, countdown, verdict, wonPoints, willRetry, searchNote, hostAction }: TypeDuelPlateProps): PlateContent {
  switch (kind) {
    case 'pick': return { icon: LockKeyhole, tone: 'warn', kicker: 'Tu tipo', title: '¿Qué tipo eliges?', text: <span className={s.pickHint}>Se bloquea al pulsarlo · flechas para moverte</span> };
    case 'locked': return {
      icon: Check, tone: 'ok', kicker: 'Tipo bloqueado',
      title: <span className={s.lockedTitle}>Elegiste {ownType && <TypeBadge type={ownType} label={typeLabel(ownType)} />}</span>,
      text: 'El tipo rival sigue oculto.',
    };
    case 'reveal': return { icon: Zap, tone: 'warn', kicker: '¡Tipos revelados!', title: 'Prepárate para buscar', text: countdown };
    case 'search': return { icon: Target, tone: 'info', kicker: 'Carrera activa', title: 'Encuentra la combinación exacta', aside: searchNote };
    case 'watching': return phase === 'SELECTING_TYPES'
      ? { icon: Eye, tone: 'info', kicker: 'No te toca este duelo', title: 'Estás observando la selección.', text: 'Los tipos se revelan a la vez.' }
      : { icon: Eye, tone: 'info', kicker: 'No te toca este duelo', title: 'Observas este duelo', text: 'Los intentos aparecerán en directo.' };
    case 'invalid': return { icon: XCircle, tone: 'bad', kicker: 'Sin Pokémon válido', title: willRetry ? 'Los mismos jugadores eligen de nuevo' : 'El duelo cuenta sin puntos', text: countdown };
    case 'result': return {
      icon: wonPoints > 0 ? Trophy : verdict === 'Estás observando' ? Eye : Clock3, tone: wonPoints > 0 ? 'ok' : verdict === 'Perdiste el duelo' ? 'bad' : 'info',
      kicker: verdict, title: countdown,
      aside: <span className={s.resultAside}>
        {wonPoints > 0 && <strong className={s.points}><ScorePop points={wonPoints} tone="leaf" self />+{wonPoints}<small> puntos</small></strong>}
        {hostAction}
      </span>,
    };
    default: return { icon: Clock3, tone: 'info', kicker: 'Type Duel', title: 'Preparando el duelo…', text: 'El servidor elige a los duelistas.' };
  }
}

/** Aviso bajo el título de la carrera: la espera tras un fallo o el último intento propio. */
export function TypeDuelSearchNote({ cooldownMs, lastAttempt }: { cooldownMs: number; lastAttempt: TypeDuelAttempt | null }) {
  if (cooldownMs > 0) return <Chip tone="warn" icon={<Icon icon={Hourglass} size={18} />}>Espera {(cooldownMs / 1000).toFixed(1)}s antes de volver a intentar.</Chip>;
  if (lastAttempt && !lastAttempt.correct) return <Chip tone="bad" icon={<Icon icon={X} size={18} />}><span className={s.noteName}>{lastAttempt.pokemonName}</span> no coincide</Chip>;
  return null;
}

/** Acción del host en el resultado: pasar ya a la siguiente ronda o a la clasificación. */
export function TypeDuelContinue({ last, pending, onContinue }: { last: boolean; pending: boolean; onContinue(): void }) {
  return <Pill variant="yellow" icon={ArrowRight} loading={pending} onClick={onContinue}>{last ? 'Ver clasificación' : 'Siguiente ronda'}</Pill>;
}
