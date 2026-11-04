import type { LearnsetGuessAttempt, LearnsetGuessPublicState, LearnsetMoveGroup, LearnsetMoveHint, LearnsetRoundResult, MoveCategory, RoomMemberView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { AlarmClock, BookOpen, Check, CheckCircle2, CircleDashed, Clock3, Coins, Equal, Eye, EyeOff, Hourglass, Lightbulb, Search, Sparkles, Swords, WifiOff, X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Avatar } from '../../components/Avatar';
import { ScorePop } from '../../components/ScorePop';
import { apiAsset } from '../../lib/api';
import { playerColor } from '../../room/player-color';
import { learnsetRevealStatus } from '../../room/learnset-texts';
import { revealedLearnsetFlags } from '../../room/learnset-reveal';
import { Badge, Card, Chip, cx, Icon, Panel, Row, TypeBadge } from '../../ui';
import { categoryLabel, learnsetClueOrder, learnsetStageText, moveText, ordinal, typeLabel, type LearnsetPlateKind } from './presentation';
import s from './LearnsetGuess.module.css';

// Los sprites llegan como ruta del proxy opaco (`/api/pokemon/{id}/sprite`); se sirven desde el origen de la API.
export const learnsetSprite = (sprite: string) => sprite.startsWith('/api/') ? apiAsset(sprite) : sprite;

const categoryIcons: Record<MoveCategory, LucideIcon> = { physical: Swords, special: Sparkles, status: CircleDashed };

/** Placa de la ronda (pantalla superior): ronda, learnset de referencia, pista evolutiva, el título y el plazo. */
export function LearnsetHud({ roundNumber, totalRounds, referenceGeneration, referenceSource, evolutionHint, heading, timer }: { roundNumber: number; totalRounds: number; referenceGeneration: number; referenceSource: string; evolutionHint: string | null; heading: string; timer: ReactNode }) {
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>Ronda {roundNumber} de {totalRounds}</Badge>
        <Chip tone="neutral" icon={<Icon icon={BookOpen} size={18} />}>Learnset de Gen {referenceGeneration}<span className={s.source}> · {referenceSource}</span></Chip>
        {evolutionHint && <span className={s.evolution}><Chip tone="warn" icon={<Icon icon={Sparkles} size={18} />}>Pista evolutiva: {evolutionHint}</Chip></span>}
      </div>
      <h1 className={cx(s.heading, 'ol')} title={heading}>{heading}</h1>
    </div>
    <div className={s.hudTimer}>{timer}</div>
  </Panel>;
}

/**
 * La única región viva de la pantalla (siempre montada): el último aviso, quién acaba de acertar y, solo para lectores,
 * la pista nueva, el acierto propio o la revelación. Sin avisos visibles no ocupa sitio.
 */
export function LearnsetNotices({ lastWarning, lastWarningAnnouncement, solver, announcement }: { lastWarning: string | null; /** Texto fijo del último aviso para lectores (el chip visible cuenta los segundos y no se anuncia). */ lastWarningAnnouncement: string | null; solver: { key: string; member: RoomMemberView; text: string } | null; announcement: string }) {
  const visible = Boolean(lastWarning || solver);
  return <div role="status" aria-live="polite" className={cx(s.notices, !visible && s.noticesIdle)}>
    {lastWarning && <span className={s.warning} aria-hidden="true"><Chip tone="bad" icon={<Icon icon={AlarmClock} size={18} />}>{lastWarning}</Chip></span>}
    {lastWarningAnnouncement && <span className="sr-only">{lastWarningAnnouncement}</span>}
    {solver && <span key={solver.key} className={cx(s.solver, 'motion-bump')}><Chip tone="ok" icon={<Avatar name={solver.member.displayName} avatar={solver.member.avatar} size="xs" />}>{solver.text}</Chip></span>}
    <span className="sr-only">{announcement}</span>
  </div>;
}

/** Un movimiento: nivel, nombre, tipo (con su nombre: el color nunca va solo) y categoría con icono. */
function MoveRow({ move, fresh }: { move: LearnsetMoveHint; fresh: boolean }) {
  return <Row name={move.name}
    // Recién llegada: franja destacada (azul cielo) y además lo dice el Badge «Nueva».
    highlight={fresh}
    // «Nueva» va bajo el nivel (no a la derecha): así la línea del tipo y la categoría no se parte y la franja no crece.
    avatar={<span className={s.level}>{move.level !== null ? <Badge tone="navy">Nv. {move.level}</Badge> : <Badge tone="navy">Mov.</Badge>}{fresh && <span className={s.fresh}><Badge>Nueva</Badge></span>}</span>}
    meta={<span className={s.moveMeta}><TypeBadge type={move.type} label={typeLabel(move.type)} size="sm" /><Chip tone="neutral" icon={<Icon icon={categoryIcons[move.category]} size={18} />}>{categoryLabel[move.category]}</Chip></span>} />;
}

/**
 * Pistas reveladas (pantalla superior): una franja por movimiento, la última pista arriba (entra con `motion-enter-up`
 * y va marcada «Nueva»). En la cabecera, lo que vale ahora un acierto y cuándo llega la siguiente pista.
 */
export function LearnsetClues({ groups, latestStage, stake, nextClueIn }: { groups: readonly LearnsetMoveGroup[]; latestStage: number; stake: string | null; nextClueIn: number | null }) {
  const ordered = learnsetClueOrder(groups);
  const moveCount = groups.reduce((total, group) => total + group.moves.length, 0);
  return <Panel title="Pistas reveladas" variant="dark" scroll scrollLabel="Pistas reveladas" className={cx(s.cluesPanel)}
    right={<span className={s.cluesRight}>
      {stake && <span key={stake} className={cx(s.stake, 'motion-bump')} data-testid="learnset-stake"><Badge><Icon icon={Coins} size={18} />{stake}</Badge></span>}
      {nextClueIn !== null && <Chip tone="info" icon={<Icon icon={Lightbulb} size={18} />}>Nueva pista en {nextClueIn}s</Chip>}
      {stake === null && nextClueIn === null && <Badge tone="cream">{`${moveCount} ${moveCount === 1 ? 'movimiento' : 'movimientos'}`}</Badge>}
    </span>}>
    {ordered.length === 0
      ? <p className={s.empty}><Icon icon={Hourglass} size={24} /><span><strong>Preparando las pistas…</strong> Llegan los movimientos que aprende el Pokémon por nivel.</span></p>
      : <ul className={s.clues} aria-label="Movimientos conocidos">{ordered.flatMap((group) => group.moves.map((move, index) => {
        const fresh = group.stage > 0 && group.stage === latestStage;
        return <li key={`${group.stage}-${move.moveId}-${move.level ?? 'x'}-${index}`} className={cx(group.stage > 0 && 'motion-enter-up')} data-stage={group.stage}><MoveRow move={move} fresh={fresh} /></li>;
      }))}</ul>}
  </Panel>;
}

/** Fila del marcador en vivo. */
export interface ScoreLine { member: RoomMemberView; points: number; position: number; colorIndex: number; solveOrder: number | undefined; tied: boolean }

/** Marcador en vivo (columna lateral): puntos, quién ha acertado ya (con su orden) y empates. */
export function LearnsetScoreboard({ lines, selfId, className }: { lines: readonly ScoreLine[]; selfId: string; className?: string | undefined }) {
  return <Panel title="Marcador" variant="dark" scroll scrollLabel="Marcador de la partida" {...(className ? { className } : {})} right={<Badge tone="cream">{`${lines.length} jugadores`}</Badge>}>
    <ol className={s.rows} aria-label="Marcador">{lines.map(({ member, points, position, colorIndex, solveOrder, tied }) => <li key={member.id} data-testid="learnset-score-row" aria-current={member.id === selfId ? 'true' : undefined}>
      <Row rank={position} name={member.displayName} color={playerColor(colorIndex)} self={member.id === selfId} disconnected={member.presence !== undefined && member.presence !== 'CONNECTED'}
        avatar={<Avatar name={member.displayName} avatar={member.avatar} size="sm" />}
        meta={<span className={s.rowMeta}>
          {solveOrder ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Acertó · {ordinal(solveOrder)}</Chip> : <Chip tone="neutral" icon={<Icon icon={Search} size={18} />}>Buscando…</Chip>}
          {tied && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
        </span>}
        value={<span key={points} className={cx(s.score, 'motion-bump')} data-testid="learnset-score">{points}<small> pts</small></span>} />
    </li>)}</ol>
  </Panel>;
}

/** Intentos públicos (columna lateral): los fallos de la ronda, el último arriba. */
export function LearnsetAttempts({ attempts, members, colors, className }: { attempts: readonly LearnsetGuessAttempt[]; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; className?: string | undefined }) {
  const ordered = [...attempts].reverse();
  return <Panel title="Intentos públicos" variant="dark" scroll scrollLabel="Intentos públicos de la ronda" {...(className ? { className } : {})} right={<Badge tone="cream">{attempts.length}</Badge>}>
    {/* Vacío sin región viva propia (la pantalla ya tiene la suya): enseña a jugar. */}
    {ordered.length === 0
      ? <p className={s.empty}><Icon icon={Search} size={24} /><span><strong>Todavía no hay intentos incorrectos.</strong> Cuanto antes aciertes, más puntos: cada pista nueva resta uno.</span></p>
      : <ul className={s.rows} aria-label="Intentos de la ronda">{ordered.map((attempt, index) => {
        const name = members.get(attempt.playerId)?.displayName ?? attempt.playerId;
        return <li key={`${attempt.playerId}-${attempt.attemptedAt}-${index}`}>
          <Row name={attempt.pokemonName} color={playerColor(colors.get(attempt.playerId) ?? 0)}
            avatar={<img className={s.attemptSprite} src={learnsetSprite(attempt.sprite)} alt="" />}
            meta={<span className={s.rowMeta}><span className={s.attemptBy}>{name} probó</span><Chip tone="bad" icon={<Icon icon={X} size={18} />}>No era</Chip></span>} />
        </li>;
      })}</ul>}
  </Panel>;
}

/**
 * Revelación (pantalla superior): la carta del Pokémon (gira al aparecer), sus datos y el learnset entero partido en lo
 * que llegó a verse y lo que quedó sin revelar (con icono y texto, no solo atenuado).
 */
export function LearnsetRevealScene({ result }: { result: LearnsetRoundResult }) {
  const flags = revealedLearnsetFlags(result.learnset, result.revealedMoves);
  const seen = result.learnset.filter((_, index) => flags[index]);
  const hidden = result.learnset.filter((_, index) => !flags[index]);
  return <Panel variant="cream" as="section" aria-labelledby="learnset-reveal-title" className={cx(s.revealPanel)} bodyClassName={cx(s.reveal)}>
    <div className={s.revealCard}>
      <Card sprite={learnsetSprite(result.pokemon.sprite)} name={result.pokemon.name} number={result.pokemon.nationalDexNumber} state="correct" flip eager attrs={{ 'data-answer-card': 'true' }} />
    </div>
    <div className={s.revealText}>
      <span className={s.kicker}>Resultado de la ronda</span>
      <h2 id="learnset-reveal-title" className={s.revealTitle}>{result.pokemon.name}</h2>
      <p className={s.help}>Generación {result.pokemon.generation} · Learnset Gen {result.referenceGeneration}</p>
      <p className={s.help}>{result.referenceSource}</p>
    </div>
    <div className={s.learnset}>
      <h3 className={s.kicker}>Learnset utilizado · {result.revealedMoves.length} pistas llegaron a verse</h3>
      <ul className={s.moveChips} aria-label="Pistas que llegaron a verse">{seen.map((move, index) => <li key={`seen-${move.moveId}-${index}`}><Chip tone="info" icon={<Icon icon={Eye} size={18} />}>{moveText(move)}</Chip></li>)}</ul>
      {hidden.length > 0 && <>
        <h3 className={s.kicker}>Sin revelar · {hidden.length}</h3>
        <ul className={s.moveChips} aria-label="Pistas sin revelar">{hidden.map((move, index) => <li key={`hidden-${move.moveId}-${index}`}><Chip tone="neutral" icon={<Icon icon={EyeOff} size={18} />}>{moveText(move)}</Chip></li>)}</ul>
      </>}
    </div>
  </Panel>;
}

/** Cómo acabó cada jugador en la revelación (columna lateral): por orden de acierto, con sus puntos de la ronda. */
export function LearnsetRevealBoard({ result, members, colors, selfId, className }: { result: LearnsetRoundResult; members: readonly RoomMemberView[]; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  const ordered = members.filter((member) => member.role !== 'SPECTATOR').sort((left, right) => (result.solves[left.id]?.solveOrder ?? Infinity) - (result.solves[right.id]?.solveOrder ?? Infinity));
  return <Panel title="Puntos de la ronda" variant="dark" scroll scrollLabel="Puntos de la ronda" {...(className ? { className } : {})}>
    <ol className={s.rows} aria-label="Resultado de cada jugador">{ordered.map((member) => {
      const solve = result.solves[member.id];
      const status = learnsetRevealStatus(Boolean(solve), !result.absentIds.includes(member.id));
      return <li key={member.id} data-testid="learnset-reveal-row">
        <Row {...(solve ? { rank: solve.solveOrder } : {})} name={member.displayName} color={playerColor(colors.get(member.id) ?? 0)} self={member.id === selfId}
          avatar={<Avatar name={member.displayName} avatar={member.avatar} size="sm" />}
          meta={<span className={s.rowMeta}>{solve
            ? <><Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Acertó · {ordinal(solve.solveOrder)}</Chip><span className={s.attemptBy}>{learnsetStageText(solve.revealStage)}</span></>
            : status === 'offline' ? <Chip tone="neutral" icon={<Icon icon={WifiOff} size={18} />}>Sin conexión</Chip> : <Chip tone="bad">✗ No acertó</Chip>}</span>}
          value={<span className={s.score}>+{solve?.points ?? 0}</span>} />
      </li>;
    })}</ol>
  </Panel>;
}

interface PlateContent { icon: LucideIcon; tone: 'ok' | 'bad' | 'info' | 'warn'; kicker: string; title: string; text?: ReactNode; aside?: ReactNode }

export interface LearnsetPlateProps {
  kind: LearnsetPlateKind;
  /** Adivinar: el buscador (o su estado) y el aviso de la espera o del último fallo propio. */
  search?: ReactNode;
  searchNote?: ReactNode;
  solveOrder: number | null;
  roundPoints: number;
  /** Revelación: veredicto propio y la cuenta atrás. */
  verdict?: { tone: 'ok' | 'bad' | 'info'; text: string; points: number } | null;
  countdown: string;
  titleRef: Ref<HTMLHeadingElement>;
}

/** Pantalla inferior: el buscador, el acierto con sus puntos, observar o el veredicto de la revelación. */
export function LearnsetPlate(props: LearnsetPlateProps) {
  const { kind, titleRef } = props;
  const content = plateContent(props);
  return <Panel variant="cream" as="section" bodyClassName={cx(s.plate, kind === 'guess' && s.plateSearch)} aria-labelledby="learnset-plate-title">
    <div className={s.plateRow}>
      <span className={cx(s.plateIcon, s[`tone_${content.tone}`])}><Icon icon={content.icon} size={32} /></span>
      <div className={s.plateText}>
        <span className={s.kicker}>{content.kicker}</span>
        <h2 id="learnset-plate-title" ref={titleRef} tabIndex={-1} className={s.plateTitle}>{content.title}</h2>
        {content.text && <p className={s.help}>{content.text}</p>}
      </div>
      {content.aside && <div className={s.plateAside}>{content.aside}</div>}
    </div>
    {kind === 'guess' && props.search}
  </Panel>;
}

function points(value: number, pop: boolean) {
  return <strong className={s.points}>{pop && <ScorePop points={value} tone="leaf" self />}+{value}<small> {value === 1 ? 'punto' : 'puntos'}</small></strong>;
}

function plateContent({ kind, searchNote, solveOrder, roundPoints, verdict, countdown }: LearnsetPlateProps): PlateContent {
  switch (kind) {
    case 'guess': return { icon: Search, tone: 'info', kicker: 'Tu respuesta', title: '¿Qué Pokémon aprende estos movimientos?', aside: searchNote };
    case 'solved': return {
      icon: CheckCircle2, tone: 'ok', kicker: `${solveOrder ? ordinal(solveOrder) : ''} en acertar`, title: '¡Has acertado!',
      text: 'La respuesta sigue oculta para los demás.', aside: points(roundPoints, true),
    };
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'No adivinas en esta ronda', title: 'Estás observando', text: 'Las pistas y los aciertos aparecen en directo.' };
    case 'reveal': return {
      icon: verdict?.tone === 'ok' ? CheckCircle2 : verdict?.tone === 'bad' ? X : Eye, tone: verdict?.tone ?? 'info', kicker: verdict?.text ?? 'Resultado de la ronda', title: countdown,
      ...(verdict && verdict.points > 0 ? { aside: points(verdict.points, false) } : {}),
    };
    default: return { icon: Clock3, tone: 'info', kicker: 'Learnset Guess', title: 'Preparando la ronda…', text: 'El servidor elige el Pokémon.' };
  }
}

/** Aviso junto al buscador: la espera tras un fallo o el último intento propio. */
export function LearnsetSearchNote({ cooldownMs, lastAttempt }: { cooldownMs: number; lastAttempt: LearnsetGuessAttempt | null }) {
  if (cooldownMs > 0) return <Chip tone="warn" icon={<Icon icon={Hourglass} size={18} />}>Espera {(cooldownMs / 1000).toFixed(1)}s para confirmar otro intento.</Chip>;
  if (lastAttempt) return <Chip tone="bad" icon={<Icon icon={X} size={18} />}><span className={s.noteName}>{lastAttempt.pokemonName}</span> no era</Chip>;
  return null;
}

/** El último intento (fallido) propio de la ronda. */
export const learnsetOwnLastAttempt = (game: Pick<LearnsetGuessPublicState, 'attempts'>, selfId: string) => [...game.attempts].reverse().find((attempt) => attempt.playerId === selfId) ?? null;
