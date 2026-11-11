import type { ReactNode } from 'react';
import { Badge, Chip, cx, Icon, Panel, Row, ScoreValue } from '../../ui';
import type { ProgressStatus } from '../social-kit';
import { safeAmount } from './presentation';
import s from './AuctionSide.module.css';

/** Franja de un jugador en los presupuestos. */
export interface BudgetEntry {
  id: string;
  name: string;
  /** Avatar decorativo. */
  avatar?: ReactNode;
  /** Color del jugador (`playerColor` de su orden en la sala). */
  color?: string;
  /** Lo que le queda para pujar; `null`: no se pinta (juegos sin presupuesto). */
  budget: number | null;
  /** Valor propio a la derecha en lugar del presupuesto (Bluff: su última puja, «PASÓ»). */
  value?: ReactNode;
  /** Estado en texto («Turno», «Va ganando», «Pasó», «Sin presupuesto»…); el color del chip nunca va solo. */
  status?: ProgressStatus | null;
  /** Línea extra bajo el estado («Equipo 2/6 · BST 812») o los sprites del equipo. */
  detail?: ReactNode;
  self?: boolean;
  disconnected?: boolean;
  /** Acción al final de la franja (p. ej. la `Pill` redonda «Ver equipo de Ana», que abre un `Dialog`). */
  action?: ReactNode;
}

export interface BudgetPlateProps {
  title?: string;
  entries: readonly BudgetEntry[];
  /** Unidad del presupuesto («monedas»). */
  unit?: string;
  /** Insignia de la cabecera (p. ej. «3 jugadores»); sin ella, nada. */
  badge?: ReactNode;
  /** Nota bajo la lista. */
  note?: ReactNode;
  className?: string | undefined;
}

/**
 * Presupuestos y estado de cada jugador (columna lateral): un `Panel dark scroll` con una franja por jugador (su color,
 * avatar, nombre y, en texto, el estado y el presupuesto). La propia va en amarillo; el desconectado dice «Sin
 * conexión». Todo lo que pinta es público. `data-testid="budget-row"` con `data-player`.
 */
export function BudgetPlate({ title = 'Presupuestos', entries, unit = 'monedas', badge, note, className }: BudgetPlateProps) {
  const list = <ol className={s.rows} aria-label={title}>{entries.map((entry) => <li key={entry.id} data-testid="budget-row" data-player={entry.id} aria-current={entry.self ? 'true' : undefined}>
    <Row name={entry.name} self={Boolean(entry.self)} disconnected={Boolean(entry.disconnected)} {...(entry.color ? { color: entry.color } : {})} {...(entry.avatar ? { avatar: entry.avatar } : {})}
      meta={(entry.status || entry.detail) ? <span className={s.rowMeta}>
        {entry.status && <Chip tone={entry.status.tone} {...(entry.status.icon ? { icon: <Icon icon={entry.status.icon} size={18} /> } : {})}>{entry.status.text}</Chip>}
        {entry.detail && <span className={s.detail}>{entry.detail}</span>}
      </span> : undefined}
      {...(entry.value != null ? { value: <span className={s.value}>{entry.value}</span> } : entry.budget !== null ? { value: <span className={s.value}><strong><ScoreValue value={safeAmount(entry.budget)} self={Boolean(entry.self)} color={entry.color} /></strong><small>{unit === 'monedas' && safeAmount(entry.budget) === 1 ? 'moneda' : unit}</small></span> } : {})}>
      {entry.action && <span className={cx(s.action)}>{entry.action}</span>}
    </Row>
  </li>)}</ol>;
  const head = { title, ...(className ? { className } : {}), ...(badge != null ? { right: <Badge tone="cream">{badge}</Badge> } : {}) };
  if (!note) return <Panel {...head} variant="dark" scroll scrollLabel={title}>{list}</Panel>;
  // Con nota: solo la lista se desplaza; la nota queda fija al pie y siempre entera (nunca cortada por el borde del scroll).
  return <Panel {...head} variant="dark" flush bodyClassName={cx(s.plateBody)}>
    <div className={s.plateList} tabIndex={0} role="region" aria-label={title}>{list}</div>
    <p className={s.note}>{note}</p>
  </Panel>;
}
