import type { RoomMemberView, TcgCardPublicView, TcgHigherLowerChoice, TcgHigherLowerOutcome, TcgHigherLowerPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, Check, CheckCircle2, CircleDashed, Clock3, Equal, Eye, Flame, MousePointerClick, TimerOff, XCircle } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Avatar } from '../../components/Avatar';
import { ScorePop } from '../../components/ScorePop';
import { playerColor } from '../../room/player-color';
import { sharesPosition } from '../../room/results-ties';
import { Badge, Card, Chip, cx, Icon, Panel, Pill, Row } from '../../ui';
import { higherLowerRanking } from '../higher-lower/presentation';
import { formatTcgPrice, TCG_CHOICE_ORDER, tcgChoiceLabels, tcgCurrencySymbol, tcgMemberStatus, tcgOutcomeStatus, tcgPriceDiff, type TcgPlateKind } from './presentation';
import hl from '../higher-lower/HigherLower.module.css';
import s from './TcgHigherLower.module.css';

export const TCG_CHOICE_ICONS: Record<TcgHigherLowerChoice, LucideIcon> = { HIGHER: ArrowUp, SAME: Equal, LOWER: ArrowDown };

/**
 * Carta TCG del duelo (`Card` llena del catálogo): la imagen de la carta (decorativa, el nombre va escrito), el set con
 * su número, la rareza si se proyecta y el precio. El de la nueva carta es «¿? €» hasta revelar: `price` solo llega
 * con valor si el juego ya está revelado (lo decide quien la pinta).
 */
export function TcgDuelCard({ side, card, price, currency, flip, leader }: {
  side: 'previous' | 'current';
  card: TcgCardPublicView;
  /** Precio que se puede pintar, o `null` («¿?»). */
  price: string | null;
  currency: string;
  flip: boolean;
  /** Al revelar: esta carta vale más (o empatan). */
  leader: boolean;
}) {
  const hidden = price === null;
  return <Card size="fill" sprite={card.imageUrl} name={card.name} decorativeSprite flip={flip} attrs={{ 'data-tcg-card': side }}>
    <span className={cx(hl.side, side === 'current' && hl.sideCurrent)}>{side === 'previous' ? 'Anterior' : '¿Vale más?'}</span>
    <span className={s.set} title={`${card.setName} · ${card.localId}`}>{card.setName} · {card.localId}</span>
    {card.rarity && <span className={s.rarity} title={card.rarity}>{card.rarity}</span>}
    <span className={s.price}>
      <span className={s.priceLabel}>Precio</span>
      <strong className={cx(s.priceValue, hidden && s.priceHidden, leader && s.priceLeader)} data-tcg-price={side}>{hidden ? `¿? ${tcgCurrencySymbol(currency)}` : formatTcgPrice(price, currency)}</strong>
    </span>
  </Card>;
}

/** Franja del revelado bajo el duelo: los dos precios, la diferencia y la respuesta correcta, en texto. */
export function TcgPriceStrip({ previous, current, currency, correctAnswer }: { previous: string; current: string; currency: string; correctAnswer: TcgHigherLowerChoice }) {
  return <div className={s.strip} data-testid="tcg-prices">
    <span className={s.stripItem}><span className={s.stripLabel}>Anterior</span><strong data-tcg-strip="previous">{formatTcgPrice(previous, currency)}</strong></span>
    <span className={s.stripItem}><span className={s.stripLabel}>Nueva</span><strong data-tcg-strip="current">{formatTcgPrice(current, currency)}</strong></span>
    <span className={s.stripItem}><span className={s.stripLabel}>Diferencia</span><strong>{tcgPriceDiff(previous, current, currency)}</strong></span>
    <Chip tone="ok" icon={<Icon icon={TCG_CHOICE_ICONS[correctAnswer]} size={18} />}>Correcta: {tcgChoiceLabels[correctAnswer]}</Chip>
  </div>;
}

/**
 * Resultado de un jugador al revelar, con texto: qué eligió (`Chip` con su flecha) y si acertó («✓ +1», «✗ Fallo» o
 * «✗ Sin respuesta»), en dos chips que bajan de línea si no caben.
 */
export function TcgOutcomeChips({ outcome }: { outcome: TcgHigherLowerOutcome | undefined }) {
  return <>
    {outcome?.choice && <span data-tcg-choice><Chip tone="info" icon={<Icon icon={TCG_CHOICE_ICONS[outcome.choice]} size={18} />}>Eligió {tcgChoiceLabels[outcome.choice]}</Chip></span>}
    <Chip tone={outcome?.correct ? 'ok' : 'bad'}>
      <span className={hl.outcome} data-outcome={outcome?.correct ? 'hit' : 'miss'}>{outcome?.correct
        ? <><span aria-hidden="true">✓</span> +{outcome.awardedPoints}<span className="sr-only"> {tcgOutcomeStatus(outcome)}</span></>
        : <><span aria-hidden="true">✗</span> {tcgOutcomeStatus(outcome)}</>}</span>
    </Chip>
  </>;
}

/**
 * Marcador (columna lateral): una franja por jugador con su color, el puesto, los puntos y la racha (`Badge`, salta al
 * crecer). En la ronda solo se sabe quién ha respondido; al revelar, qué eligió cada uno y si acertó.
 */
export function TcgSidebar({ game, lastRound, members, colors, selfId, className }: {
  game: TcgHigherLowerPublicState;
  /** Solo en `ROUND_RESULTS` (si no, `null`). */
  lastRound: TcgHigherLowerPublicState['lastRound'];
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  selfId: string;
  className?: string | undefined;
}) {
  const answered = game.answeredIds.filter((id) => game.playerIds.includes(id)).length;
  const nameOf = (id: string) => members.get(id)?.displayName ?? id;
  const ranking = higherLowerRanking(game, nameOf);
  const points = (id: string) => game.scores[id] ?? 0;
  return <Panel title="Marcador" variant="dark" scroll scrollLabel="Marcador de la partida" {...(className ? { className } : {})}
    right={<Badge tone="cream">{lastRound ? `${Object.values(lastRound.outcomes).filter((outcome) => outcome.correct).length} / ${game.playerIds.length} aciertos` : `${answered} / ${game.playerIds.length} respuestas`}</Badge>}>
    <p className={hl.sideHint}>{lastRound ? 'Qué eligió cada uno' : answered < game.playerIds.length ? `Pendientes · ${game.playerIds.length - answered}` : 'Todos han respondido'}{!lastRound && <> · <strong>Respuestas privadas</strong> hasta revelar</>}</p>
    <ol className={hl.rows} aria-label="Clasificación de la partida">{ranking.map(({ id, position }) => {
      const member = members.get(id);
      const name = nameOf(id);
      const streak = game.streaks[id] ?? 0;
      const status = tcgMemberStatus(game.answeredIds, lastRound, id);
      const chip = status.kind === 'outcome'
        ? <TcgOutcomeChips outcome={status.outcome} />
        : status.kind === 'answered'
          ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Respondió</Chip>
          : <Chip tone="neutral" icon={<Icon icon={CircleDashed} size={18} />}>Pendiente</Chip>;
      return <li key={id} aria-current={id === selfId ? 'true' : undefined}>
        <Row rank={position} name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name} avatar={member?.avatar} size="sm" />}
          meta={<span className={hl.rowMeta}>
            {chip}
            {sharesPosition(ranking, id, points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
            <span key={streak} className={cx(hl.streak, streak > 0 && 'motion-bump')} data-streak={id}><Badge tone={streak > 0 ? 'yellow' : 'cream'}><Icon icon={Flame} size={18} />Racha {streak}</Badge></span>
          </span>}
          value={<span className={hl.score}>{points(id)}<small> pts</small></span>} />
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
 * revelar, la respuesta correcta con el veredicto y los puntos («+N»). Sin región viva: la de la pantalla es la única.
 * El título admite foco por programa (`tabIndex={-1}`).
 */
export function TcgPlate({ kind, answer, pending, correctAnswer, outcome, participant, countdown, verdict, titleRef, onAnswer }: {
  kind: TcgPlateKind;
  answer: TcgHigherLowerChoice | null;
  pending: TcgHigherLowerChoice | null;
  correctAnswer: TcgHigherLowerChoice | null;
  outcome: TcgHigherLowerOutcome | null;
  participant: boolean;
  countdown: string;
  verdict: string;
  titleRef: Ref<HTMLHeadingElement>;
  onAnswer(choice: TcgHigherLowerChoice): void;
}) {
  const content = plateContent({ kind, answer, pending, correctAnswer, outcome, participant, countdown, verdict, onAnswer });
  return <Panel variant="cream" as="section" bodyClassName={cx(hl.plate, kind === 'answer' && hl.plateAnswer)} {...(kind === 'answer' ? { 'aria-label': 'Tu respuesta' } : {})}>
    <span className={cx(hl.plateIcon, hl[`tone_${content.tone}`])}><Icon icon={content.icon} size={32} /></span>
    <div className={hl.plateText}>
      <span className={hl.kicker}>{content.kicker}</span>
      <h2 ref={titleRef} tabIndex={-1} className={hl.plateTitle}>{content.title}</h2>
      {content.text && <p className={hl.help}>{content.text}</p>}
    </div>
    {content.aside && <div className={cx(hl.plateAside, kind === 'answer' && hl.plateChoices)}>{content.aside}</div>}
  </Panel>;
}

function plateContent({ kind, answer, pending, correctAnswer, outcome, participant, countdown, verdict, onAnswer }: {
  kind: TcgPlateKind;
  answer: TcgHigherLowerChoice | null;
  pending: TcgHigherLowerChoice | null;
  correctAnswer: TcgHigherLowerChoice | null;
  outcome: TcgHigherLowerOutcome | null;
  participant: boolean;
  countdown: string;
  verdict: string;
  onAnswer(choice: TcgHigherLowerChoice): void;
}): PlateContent {
  switch (kind) {
    case 'reveal': {
      const correct = outcome?.correct === true;
      const points = correct ? outcome.awardedPoints : 0;
      return {
        icon: !participant ? Eye : correct ? CheckCircle2 : outcome?.choice ? XCircle : TimerOff,
        tone: !participant ? 'info' : correct ? 'ok' : 'bad',
        kicker: verdict,
        title: `Respuesta: ${correctAnswer ? tcgChoiceLabels[correctAnswer] : '—'}`,
        text: <>{correct && outcome && <span className={hl.helpStrong}>Racha {outcome.streak}</span>}<span className={hl.countdown}>{countdown}</span></>,
        aside: participant ? <strong className={hl.points}>{correct && <ScorePop points={points} tone="leaf" self />}+{points}<small> {points === 1 ? 'punto' : 'puntos'}</small></strong> : undefined,
      };
    }
    case 'locked': return { icon: Check, tone: 'ok', kicker: 'Respuesta bloqueada', title: `Respuesta ${tcgChoiceLabels[answer!]} bloqueada.`, text: 'Esperando al resto de entrenadores.' };
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'Sin respuesta esta ronda', title: 'Estás observando', text: 'Ves la ronda como espectador: el precio se descubre al revelar.' };
    case 'waiting': return { icon: Clock3, tone: 'info', kicker: 'Higher or Lower: Cartas', title: 'Preparando la ronda…', text: 'El servidor elige las dos cartas.' };
    default: return {
      icon: MousePointerClick, tone: 'warn', kicker: 'Tu respuesta', title: '¿La nueva carta vale más, igual o menos?',
      text: <span className={hl.shortcuts}>Atajos: 1, 2 y 3 · Igual vale 2 puntos</span>,
      aside: <>{TCG_CHOICE_ORDER.map((choice, index) => <Pill key={choice} variant={choice === 'SAME' ? 'yellow' : 'blue'} icon={TCG_CHOICE_ICONS[choice]} badge={String(index + 1)}
        aria-label={tcgChoiceLabels[choice]} aria-keyshortcuts={String(index + 1)} className={hl.choice}
        loading={pending === choice} disabled={pending !== null && pending !== choice} onClick={() => onAnswer(choice)}>{tcgChoiceLabels[choice]}</Pill>)}</>,
    };
  }
}
