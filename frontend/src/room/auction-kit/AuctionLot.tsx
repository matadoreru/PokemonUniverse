import type { LucideIcon } from 'lucide-react';
import { Crown, Gavel, PackageX, SkipForward } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cx, Icon, Panel } from '../../ui';
import { safeAmount, type TurnOrderEntry, type TurnOrderState } from './presentation';
import s from './AuctionLot.module.css';

const SEAT_ICON: Partial<Record<TurnOrderState, LucideIcon>> = { turn: Gavel, leading: Crown, passed: SkipForward };

/** Quien va ganando la puja actual (en texto: «va ganando Ana (Tú)»). */
export interface AuctionLeader {
  name: string;
  /** Avatar decorativo junto al nombre (el nombre ya va escrito); en el móvil no se pinta. */
  avatar?: ReactNode;
  self?: boolean;
}

export interface AuctionLotProps {
  /** Kicker del lote («Lote 3 · en subasta»); también es el nombre accesible del panel. */
  kicker: string;
  /** Lo que se subasta: la `Card` del Pokémon (Team Auction) o la condición de la ronda (Bluff). `null`: `emptyText`. */
  item: ReactNode;
  /** Datos del lote bajo el objeto (chips: «Legendario»; la regla en Bluff). */
  facts?: ReactNode;
  currentBid: number | null;
  leader: AuctionLeader | null;
  minimumBid: number;
  /** Tope de la puja (Bluff: el pool entero): con la mínima por encima, «Puja máxima alcanzada» en vez de la mínima. */
  maximumBid?: number | undefined;
  /** Unidad de la puja («monedas» por defecto, «Pokémon» en Bluff). */
  unit?: string;
  /** Fila del orden de turno (`turnOrderEntries`) al pie de la tarjeta; sin ella no se pinta. */
  order?: readonly TurnOrderEntry[] | undefined;
  /** Quién tiene el turno, en texto («Turno de Ana»), al pie de la tarjeta (para quien no lleva el turno en el reloj). */
  turn?: ReactNode;
  /** Línea pequeña del lote anterior (`AuctionPrevious`), sobre la tarjeta. */
  previous?: ReactNode;
  /** Sin objeto (la subasta terminó). */
  emptyText?: string;
  className?: string | undefined;
}

/**
 * Escena de la subasta: un `Panel` crema con lo que se subasta a la izquierda (la carta del Pokémon con sus datos) y, a
 * la derecha, una sola tarjeta «Estado de la puja»: en grande la cifra y quién va ganando («3 monedas · va ganando
 * Ana»), debajo el mínimo para superarla y, al pie, la fila del orden de turno (el actual marcado; quien pasó, tachado
 * con icono y texto). Sobre la tarjeta, la línea pequeña del lote anterior. Todo en texto (el color nunca va solo). La
 * cifra rebota al cambiar (solo `transform`/`opacity`, quieta con la reducción de movimiento).
 * `data-testid`: `auction-lot`, `auction-status`, `auction-current-bid`, `auction-leader`, `turn-order-entry`.
 */
export function AuctionLot({ kicker, item, facts, currentBid, leader, minimumBid, maximumBid, unit = 'monedas', order, turn, previous, emptyText = 'La subasta ha terminado.', className }: AuctionLotProps) {
  const titleId = useId();
  const bid = currentBid === null ? null : safeAmount(currentBid);
  const atMaximum = maximumBid !== undefined && safeAmount(minimumBid) > safeAmount(maximumBid);
  return <Panel variant="cream" as="section" aria-label={kicker} className={cx(s.panel, className)} bodyClassName={cx(s.body)}>
    <div className={s.lot} data-testid="auction-lot">
      {item != null ? <>
        <div className={s.item}>
          <span className={s.kicker}>{kicker}</span>
          <div className={s.media}>{item}</div>
          {facts && <div className={s.facts}>{facts}</div>}
        </div>
        <div className={s.state}>
          {previous}
          <section className={s.card} aria-labelledby={titleId} data-testid="auction-status">
            <h2 id={titleId} className={s.cardTitle}>Estado de la puja</h2>
            <p className={s.headline}>
              {bid === null
                ? <span className={cx(s.bid, s.none)} data-testid="auction-current-bid">Sin pujas</span>
                : <span className={s.bid} data-testid="auction-current-bid"><span key={bid} className={s.amount}><strong>{bid}</strong> <small>{unit === 'monedas' && bid === 1 ? 'moneda' : unit}</small></span></span>}
              {bid !== null && leader && <span className={s.leader} data-testid="auction-leader">
                <span className={s.leaderLabel}><span aria-hidden="true">· </span>va ganando</span>
                <span className={s.leaderName}>{leader.avatar && <span className={s.avatar}>{leader.avatar}</span>}<span className={s.name} title={leader.name}>{leader.name}</span>{leader.self && <span className={s.self}>(Tú)</span>}</span>
              </span>}
            </p>
            {atMaximum
              ? <p className={s.minimum}><Icon icon={Gavel} size={18} /><strong>Puja máxima alcanzada</strong></p>
              : <p className={s.minimum}><Icon icon={Gavel} size={18} /><span>{bid === null ? 'Puja mínima' : 'Mínimo para superarla'}: <strong>{safeAmount(minimumBid)}</strong></span></p>}
            {order && order.length > 0 && <ol className={s.order} aria-label="Orden de turno">{order.map((entry, index) => {
              const icon = SEAT_ICON[entry.state];
              return <li key={entry.id} className={cx(s.seat, s[`seat_${entry.state}`])} data-testid="turn-order-entry" data-state={entry.state} aria-current={entry.state === 'turn' ? 'true' : undefined}>
                {index > 0 && <span className={s.arrow} aria-hidden="true">→</span>}
                <span className={s.seatTag}>
                  {icon && <Icon icon={icon} size={18} />}
                  <span className={s.seatName} title={entry.name}>{entry.self ? `${entry.name} (Tú)` : entry.name}</span>
                  <span className="sr-only">{`: ${entry.stateText}`}</span>
                </span>
              </li>;
            })}</ol>}
            {turn && <p className={s.turn}>{turn}</p>}
          </section>
        </div>
      </> : <p className={s.empty}>{emptyText}</p>}
    </div>
  </Panel>;
}

export interface AuctionPreviousProps {
  /** «Lote 1». */
  kicker: string;
  /** Lo que se adjudicó («Vulpix»). */
  item: string;
  /** Quién lo ganó; `null`: sin dueño. */
  winner: string | null;
  /** «2 monedas» o «sin dueño». */
  detail: string;
  /** Sprite decorativo. */
  sprite?: string;
}

/**
 * Línea pequeña del lote anterior, sobre el estado de la puja: «Lote 1 · Vulpix → Ana · 2 monedas» (la flecha se lee
 * «para»). Ya pasó: no compite con el lote en juego; el detalle sigue en el historial. `data-testid="auction-previous"`.
 */
export function AuctionPrevious({ kicker, item, winner, detail, sprite }: AuctionPreviousProps) {
  return <p className={s.previous} data-testid="auction-previous">
    {sprite && <img src={sprite} alt="" className={s.previousSprite} />}
    <span className={s.previousKicker}>{kicker}</span>
    <span className={s.previousText} title={winner ? `${item} para ${winner} · ${detail}` : `${item} · ${detail}`}>
      {item}{winner ? <> <span aria-hidden="true">→</span><span className="sr-only"> para</span> {winner} · {detail}</> : <> · {detail}</>}
    </span>
  </p>;
}

export interface AuctionAwardProps {
  /** `won`: con dueño; `unsold`: sin pujas (sin dueño). */
  tone: 'won' | 'unsold';
  /** «Lote 2 adjudicado», «Lote 2 sin dueño». */
  kicker: string;
  /** «Charizard para Ana». */
  title: string;
  /** «por 6 monedas». */
  detail?: string;
  /** Sprite decorativo del lote. */
  sprite?: string;
  /** Recién adjudicado (el lote nuevo aún sin pujas): entra con una animación y lleva «Nuevo» en texto. */
  fresh?: boolean;
}

/**
 * Banda de la adjudicación: azul noche con bordes del tono, a todo el ancho del lote, con el kicker, el título y la
 * cantidad. Sin región viva propia (lo anuncia la de `AuctionScreen`). No es un `Cutin` (ni un `MomentCutin`): se queda
 * en su sitio hasta la siguiente adjudicación, y un cut-in es una capa que se va sola. `data-testid="auction-award"`.
 */
export function AuctionAward({ tone, kicker, title, detail, sprite, fresh = false }: AuctionAwardProps) {
  return <div className={cx(s.award, tone === 'unsold' && s.unsold, fresh && s.fresh)} data-testid="auction-award" data-fresh={fresh || undefined}>
    {sprite ? <img src={sprite} alt="" className={s.awardSprite} /> : <span className={s.awardIcon}><Icon icon={tone === 'won' ? Gavel : PackageX} size={24} /></span>}
    <span className={s.awardText}>
      <span className={s.awardKicker}><span className={s.awardKickerText}>{kicker}</span>{fresh && <span className={s.awardNew}>Nuevo</span>}</span>
      <strong className={cx(s.awardTitle, 'ol')} title={title}>{title}</strong>
    </span>
    {detail && <span className={s.awardDetail}>{detail}</span>}
  </div>;
}
