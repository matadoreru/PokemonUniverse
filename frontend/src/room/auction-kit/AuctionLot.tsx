import { Gavel, PackageX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Chip, cx, Icon, Panel } from '../../ui';
import { amountText, safeAmount } from './presentation';
import s from './AuctionLot.module.css';

/** Quien va ganando la puja actual. */
export interface AuctionLeader {
  name: string;
  /** Avatar decorativo (el nombre ya va escrito). */
  avatar?: ReactNode;
  self?: boolean;
}

export interface AuctionLotProps {
  /** Kicker del lote («Lote 3 · en subasta»); también es el nombre accesible del panel. */
  kicker: string;
  /** Lo que se subasta: la `Card` del Pokémon (Team Auction) o la condición de la ronda (Bluff). `null`: `emptyText`. */
  item: ReactNode;
  /** Datos del lote bajo el objeto (chips: «BST 534», «Legendario»). */
  facts?: ReactNode;
  currentBid: number | null;
  leader: AuctionLeader | null;
  minimumBid: number;
  /** Unidad de la puja («monedas» por defecto, «Pokémon» en Bluff). */
  unit?: string;
  /** Quién tiene el turno, en texto («Turno de Ana», «Tu turno»). */
  turn?: ReactNode;
  /** Banda de la adjudicación del lote anterior (`AuctionAward`), encima del lote. */
  award?: ReactNode;
  /** Sin objeto (la subasta terminó). */
  emptyText?: string;
  className?: string | undefined;
}

/**
 * Escena de la subasta: un `Panel` crema con, arriba, la banda de la última adjudicación; a la izquierda, lo que se
 * subasta (la carta del Pokémon con sus datos) y, a la derecha, la puja actual en grande, quién va ganando, la siguiente
 * mínima y de quién es el turno. Todo en texto (el color nunca va solo). La cifra rebota al cambiar (solo `transform`,
 * quieta con la reducción de movimiento). En escritorio llena el alto libre; en el móvil es una franja compacta.
 * `data-testid`: `auction-lot`, `auction-current-bid`, `auction-leader`.
 */
export function AuctionLot({ kicker, item, facts, currentBid, leader, minimumBid, unit = 'monedas', turn, award, emptyText = 'La subasta ha terminado.', className }: AuctionLotProps) {
  const bid = currentBid === null ? null : safeAmount(currentBid);
  return <Panel variant="cream" as="section" aria-label={kicker} className={cx(s.panel, className)} bodyClassName={cx(s.body)}>
    {award}
    <div className={s.lot} data-testid="auction-lot">
      {item != null ? <>
        <div className={s.item}>
          <span className={s.kicker}>{kicker}</span>
          <div className={s.media}>{item}</div>
          {facts && <div className={s.facts}>{facts}</div>}
        </div>
        <dl className={s.figures}>
          <div className={s.current}>
            <dt>Puja actual</dt>
            <dd data-testid="auction-current-bid">
              {bid === null
                ? <span className={s.none}>Sin pujas</span>
                : <span key={bid} className={s.amount}><strong>{bid}</strong> <small>{unit === 'monedas' && bid === 1 ? 'moneda' : unit}</small></span>}
            </dd>
          </div>
          <div className={s.leader}>
            <dt>Va ganando</dt>
            <dd data-testid="auction-leader">
              {leader
                ? <span className={s.leaderName}>{leader.avatar}<span className={s.name} title={leader.name}>{leader.name}</span>{leader.self && <Chip tone="ok">Tú</Chip>}</span>
                : <span className={s.muted}>Nadie todavía</span>}
            </dd>
          </div>
          <div className={s.minimum}>
            <dt>Siguiente mínima</dt>
            <dd><Icon icon={Gavel} size={18} />{amountText(minimumBid, unit)}</dd>
          </div>
          {turn && <div className={s.turn}><dt className="sr-only">Turno</dt><dd>{turn}</dd></div>}
        </dl>
      </> : <p className={s.empty}>{emptyText}</p>}
    </div>
  </Panel>;
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
 * cantidad. Sin región viva propia (lo anuncia la de `AuctionScreen`): por eso no es un `Cutin`, que monta la suya.
 * Se queda hasta la siguiente adjudicación. `data-testid="auction-award"`.
 */
export function AuctionAward({ tone, kicker, title, detail, sprite, fresh = false }: AuctionAwardProps) {
  return <div className={cx(s.award, tone === 'unsold' && s.unsold, fresh && s.fresh)} data-testid="auction-award" data-fresh={fresh || undefined}>
    {sprite ? <img src={sprite} alt="" className={s.awardSprite} /> : <span className={s.awardIcon}><Icon icon={tone === 'won' ? Gavel : PackageX} size={24} /></span>}
    <span className={s.awardText}>
      <span className={s.awardKicker}>{kicker}{fresh && <span className={s.awardNew}>Nuevo</span>}</span>
      <strong className={cx(s.awardTitle, 'ol')} title={title}>{title}</strong>
    </span>
    {detail && <span className={s.awardDetail}>{detail}</span>}
  </div>;
}
