import type { HigherLowerAnswerVisibility, HigherLowerChoice, HigherLowerOutcome, HigherLowerPokemonView, HigherLowerPublicState, RoomMemberView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, Check, CheckCircle2, CircleDashed, Clock3, Equal, Eye, Flame, MousePointerClick, TimerOff, XCircle } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Avatar } from '../../components/Avatar';
import { ScorePop } from '../../components/ScorePop';
import { apiAsset } from '../../lib/api';
import { higherLowerChoiceLabels, higherLowerOutcomeLine, higherLowerOutcomeStatus, higherLowerVisibilityLabels } from '../../room/higher-lower-labels';
import { playerColor } from '../../room/player-color';
import { sharesPosition } from '../../room/results-ties';
import { Badge, Card, Chip, cx, Icon, Panel, Pill, Row } from '../../ui';
import { HIGHER_LOWER_CHOICE_ORDER, higherLowerMemberStatus, higherLowerRanking, type HigherLowerPlateKind } from './presentation';
import s from './HigherLower.module.css';

// Los sprites llegan como ruta del proxy opaco (`/api/pokemon/{id}/sprite`, sin el número de Pokédex); se sirven desde
// el origen de la API.
export const higherLowerSprite = (sprite: string) => sprite.startsWith('/api/') ? apiAsset(sprite) : sprite;

export const CHOICE_ICONS: Record<HigherLowerChoice, LucideIcon> = { HIGHER: ArrowUp, SAME: Equal, LOWER: ArrowDown };

/**
 * Placa de la ronda (pantalla superior): ronda y visibilidad de las respuestas, la stat que se compara y, a la derecha,
 * el tiempo del servidor (al revelar, el de la siguiente ronda en el mismo hueco: la placa no cambia de alto).
 */
export function HigherLowerHud({ roundNumber, totalRounds, category, visibility, timer }: {
  roundNumber: number;
  totalRounds: number;
  category: string;
  /** Visibilidad de las respuestas ajenas (de la configuración de la partida); sin ella, no se pinta el chip. */
  visibility: HigherLowerAnswerVisibility | null;
  timer: ReactNode;
}) {
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>Ronda {roundNumber} de {totalRounds}</Badge>
        {visibility && <Chip tone="neutral" icon={<Icon icon={Eye} size={18} />}>Respuestas {higherLowerVisibilityLabels[visibility].toLowerCase()}</Chip>}
      </div>
      <div className={s.hudTitle}>
        <span className={s.hudKicker}>Se compara</span>
        <h1 className={cx(s.category, 'ol')}>{category}</h1>
      </div>
    </div>
    <div className={s.hudTimer}>{timer}</div>
  </Panel>;
}

/**
 * Carta de un Pokémon del duelo (`Card` llena del catálogo). Nunca lleva el número de Pokédex (`number`): con la
 * categoría «N.º Pokédex» sería la respuesta. El valor solo sale si el servidor lo proyecta; si no, «???».
 */
export function HigherLowerDuelCard({ side, pokemon, category, flip, leader }: {
  side: 'previous' | 'current';
  pokemon: HigherLowerPokemonView;
  category: string;
  flip: boolean;
  /** Al revelar: esta carta tiene el valor mayor (o empatan). */
  leader: boolean;
}) {
  const hidden = pokemon.value === null;
  return <Card size="fill" sprite={higherLowerSprite(pokemon.sprite)} name={pokemon.name} decorativeSprite flip={flip} attrs={{ 'data-hl-card': side }}>
    <span className={cx(s.side, side === 'current' && s.sideCurrent)}>{side === 'previous' ? 'Anterior' : '¿Su valor es…?'}</span>
    <span className={s.stat}>
      <span className={s.statLabel} title={category}>{category}</span>
      <strong className={cx(s.value, hidden && s.valueHidden, leader && s.valueLeader)}>{pokemon.value ?? '???'}</strong>
    </span>
  </Card>;
}

function memberName(member: RoomMemberView | undefined, id: string) {
  return member?.displayName ?? id;
}

/** Resultado de un jugador con texto (además del ✓/✗ y del color): «✓ +2 acierto», «✗ Fallo» o «✗ Sin respuesta». */
export function HigherLowerOutcomeChip({ outcome }: { outcome: HigherLowerOutcome | undefined }) {
  return <Chip tone={outcome?.correct ? 'ok' : 'bad'}>
    <span className={s.outcome} data-outcome={outcome?.correct ? 'hit' : 'miss'}>{outcome?.correct
      ? <><span aria-hidden="true">✓</span> +{outcome.awardedPoints}<span className="sr-only"> {higherLowerOutcomeStatus(outcome)}</span></>
      : <><span aria-hidden="true">✗</span> {higherLowerOutcomeStatus(outcome)}</>}</span>
  </Chip>;
}

/**
 * Marcador (columna lateral): una franja por jugador con su color, los puntos, la racha (salta al crecer) y el estado de
 * la ronda. Con «Al revelar» solo se ve quién ha respondido; con «En directo», también qué; al revelar, el resultado.
 */
export function HigherLowerSidebar({ game, members, colors, selfId, className }: {
  game: HigherLowerPublicState;
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  selfId: string;
  className?: string | undefined;
}) {
  const reveal = game.phase === 'ROUND_RESULTS' && game.lastRound !== null;
  const answered = game.answeredIds.filter((id) => game.playerIds.includes(id)).length;
  const privateAnswers = !reveal && Object.keys(game.answers).length === 0 && game.answeredIds.length > 0;
  const ranking = higherLowerRanking(game, (id) => memberName(members.get(id), id));
  const points = (id: string) => game.scores[id] ?? 0;
  return <Panel title="Marcador" variant="dark" scroll scrollLabel="Marcador de la partida" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${answered} / ${game.playerIds.length} respuestas`}</Badge>}>
    <p className={s.sideHint}>{reveal ? 'Resultado de la ronda' : answered < game.playerIds.length ? `Pendientes · ${game.playerIds.length - answered}` : 'Todos han respondido'}{privateAnswers && <> · <strong>Respuestas privadas</strong> hasta revelar</>}</p>
    <ol className={s.rows} aria-label="Clasificación de la partida">{ranking.map(({ id, position }) => {
      const member = members.get(id);
      const name = memberName(member, id);
      const streak = game.streaks[id] ?? 0;
      const status = higherLowerMemberStatus(game, id);
      const chip = status.kind === 'outcome'
        ? <HigherLowerOutcomeChip outcome={status.outcome} />
        : status.kind === 'choice'
          ? <Chip tone="info" icon={<Icon icon={CHOICE_ICONS[status.choice]} size={18} />}>{higherLowerChoiceLabels[status.choice]}</Chip>
          : status.kind === 'answered'
            ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Respondió</Chip>
            : <Chip tone="neutral" icon={<Icon icon={CircleDashed} size={18} />}>Pendiente</Chip>;
      const line = status.kind === 'outcome' && status.outcome?.correct ? higherLowerOutcomeLine(status.outcome) : null;
      return <li key={id} aria-current={id === selfId ? 'true' : undefined}>
        <Row rank={position} name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
          meta={<span className={s.rowMeta}>
            {chip}
            {sharesPosition(ranking, id, points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
            <span key={streak} className={cx(s.streak, streak > 0 && 'motion-bump')} data-streak={id}><Badge tone={streak > 0 ? 'yellow' : 'cream'}><Icon icon={Flame} size={18} />Racha {streak}</Badge></span>
            {line && <span className={s.outcomeLine} data-outcome-line>{line}</span>}
          </span>}
          value={<span className={s.score}>{game.scores[id] ?? 0}<small> pts</small></span>} />
      </li>;
    })}</ol>
  </Panel>;
}

interface PlateContent {
  icon: LucideIcon;
  tone: 'ok' | 'bad' | 'info' | 'warn';
  kicker: string;
  title: ReactNode;
  text?: ReactNode;
  aside?: ReactNode;
}

/**
 * Pantalla inferior: elegir (tres píldoras con su atajo 1–3 como insignia), la respuesta bloqueada, observar o, al
 * revelar, la respuesta correcta con el veredicto propio y los puntos («+N»). El aviso para lectores de pantalla va en
 * una región `status` siempre montada (solo cambia su texto). El título admite foco por programa (`tabIndex={-1}`).
 */
export function HigherLowerPlate({ kind, answer, pending, correctAnswer, outcome, participant, countdown, verdict, announcement, titleRef, onAnswer }: {
  kind: HigherLowerPlateKind;
  answer: HigherLowerChoice | null;
  /** Respuesta enviada a la espera del servidor. */
  pending: HigherLowerChoice | null;
  correctAnswer: HigherLowerChoice | null;
  outcome: HigherLowerOutcome | null;
  participant: boolean;
  countdown: string;
  verdict: string;
  announcement: string;
  titleRef: Ref<HTMLHeadingElement>;
  onAnswer(choice: HigherLowerChoice): void;
}) {
  const content = plateContent({ kind, answer, pending, correctAnswer, outcome, participant, countdown, verdict, onAnswer });
  return <Panel variant="cream" as="section" bodyClassName={cx(s.plate, kind === 'answer' && s.plateAnswer)} {...(kind === 'answer' ? { 'aria-label': 'Tu respuesta' } : {})}>
    <span className={cx(s.plateIcon, s[`tone_${content.tone}`])}><Icon icon={content.icon} size={32} /></span>
    <div className={s.plateText}>
      <span className={s.kicker}>{content.kicker}</span>
      <h2 ref={titleRef} tabIndex={-1} className={s.plateTitle}>{content.title}</h2>
      {content.text && <p className={s.help}>{content.text}</p>}
    </div>
    {content.aside && <div className={cx(s.plateAside, kind === 'answer' && s.plateChoices)}>{content.aside}</div>}
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  </Panel>;
}

function plateContent({ kind, answer, pending, correctAnswer, outcome, participant, countdown, verdict, onAnswer }: {
  kind: HigherLowerPlateKind;
  answer: HigherLowerChoice | null;
  pending: HigherLowerChoice | null;
  correctAnswer: HigherLowerChoice | null;
  outcome: HigherLowerOutcome | null;
  participant: boolean;
  countdown: string;
  verdict: string;
  onAnswer(choice: HigherLowerChoice): void;
}): PlateContent {
  switch (kind) {
    case 'reveal': {
      const correct = outcome?.correct === true;
      const points = correct ? outcome.awardedPoints : 0;
      return {
        icon: !participant ? Eye : correct ? CheckCircle2 : outcome?.choice ? XCircle : TimerOff,
        tone: !participant ? 'info' : correct ? 'ok' : 'bad',
        kicker: verdict,
        title: `Respuesta: ${correctAnswer ? higherLowerChoiceLabels[correctAnswer] : '—'}`,
        text: <>{correct && outcome && <span className={s.helpStrong}>{higherLowerOutcomeLine(outcome)}</span>}<span className={s.countdown}>{countdown}</span></>,
        aside: participant ? <strong className={s.points}>{correct && <ScorePop points={points} tone="leaf" self />}+{points}<small> puntos</small></strong> : undefined,
      };
    }
    case 'locked': return { icon: Check, tone: 'ok', kicker: 'Respuesta bloqueada', title: `Respuesta ${higherLowerChoiceLabels[answer!]} bloqueada.`, text: 'Esperando al resto de entrenadores.' };
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'Sin respuesta esta ronda', title: 'Estás observando', text: 'Ves la ronda como espectador.' };
    case 'waiting': return { icon: Clock3, tone: 'info', kicker: 'Higher or Lower', title: 'Preparando la ronda…', text: 'El servidor elige los dos Pokémon.' };
    default: return {
      icon: MousePointerClick, tone: 'warn', kicker: 'Tu respuesta', title: '¿Mayor, igual o menor?',
      text: <span className={s.shortcuts}>Atajos: 1, 2 y 3 · Igual vale más puntos</span>,
      aside: <>{HIGHER_LOWER_CHOICE_ORDER.map((choice, index) => <Pill key={choice} variant={choice === 'SAME' ? 'yellow' : 'blue'} icon={CHOICE_ICONS[choice]} badge={String(index + 1)}
        aria-label={higherLowerChoiceLabels[choice]} aria-keyshortcuts={String(index + 1)} className={s.choice}
        loading={pending === choice} disabled={pending !== null && pending !== choice} onClick={() => onAnswer(choice)}>{higherLowerChoiceLabels[choice]}</Pill>)}</>,
    };
  }
}
