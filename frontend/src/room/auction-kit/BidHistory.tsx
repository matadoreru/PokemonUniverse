import { Gavel, PackageX, SkipForward, Trophy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, Chip, cx, Icon, Panel, Row, StateBox, TabPanel, Tabs } from '../../ui';
import { GAME_SIDE_FIT } from '../game-kit/GameScreen';
import type { BidLogEntry } from './presentation';
import s from './AuctionSide.module.css';

const TONE_ICON = { bid: Gavel, pass: SkipForward, win: Trophy, none: PackageX } as const;
const TONE_CHIP = { bid: 'info', pass: 'neutral', win: 'ok', none: 'bad' } as const;

/** Una vista del historial (una pestaña si hay varias). */
export interface BidHistoryView {
  key: string;
  /** Texto de la pestaña («Este lote», «Lotes cerrados»). */
  label: string;
  /** Insignia de la pestaña («3/12»). */
  badge?: ReactNode;
  /** Franjas, la más reciente primero (`bidLog(...)`). */
  entries: readonly BidLogEntry[];
  emptyText: string;
}

export interface BidHistoryProps {
  title?: string;
  /** Una vista: lista simple; varias: `Tabs` del catálogo, una por vista. */
  views: readonly BidHistoryView[];
  /** Prefijo de los ids de las pestañas. */
  idBase?: string;
  className?: string | undefined;
}

/** Lista de franjas del historial: quién, qué hizo (en texto, con icono) y la cantidad. La última, «Nueva». */
export function BidHistoryList({ entries, emptyText, label, onCream = false }: { entries: readonly BidLogEntry[]; emptyText: string; label: string; /** Sobre crema (dentro de una pestaña). */ onCream?: boolean }) {
  if (entries.length === 0) return <StateBox kind="empty" title={emptyText} live={false} onCream={onCream} />;
  return <ol className={s.rows} aria-label={label}>{entries.map((entry) => <li key={entry.key} data-testid="bid-history-row" data-tone={entry.tone}>
    <Row name={entry.name} self={Boolean(entry.self)} highlight={Boolean(entry.fresh)} {...(entry.color ? { color: entry.color } : {})}
      {...(entry.sprite ? { avatar: <img src={entry.sprite} alt="" className={s.sprite} /> } : {})}
      meta={<span className={s.rowMeta}><Chip tone={TONE_CHIP[entry.tone]} icon={<Icon icon={TONE_ICON[entry.tone]} size={18} />}>{entry.text}</Chip>{entry.fresh && <span className={s.fresh}>Nueva</span>}</span>}
      {...(entry.value != null ? { value: <span className={s.value}><strong>{entry.value}</strong></span> } : {})} />
  </li>)}</ol>;
}

/**
 * Historial de la puja (columna lateral, el último panel: llena el alto que quede y se desplaza por dentro): un `Panel
 * dark scroll` con las franjas de la más reciente a la más antigua. Con varias vistas (Team Auction: «Este lote» y
 * «Lotes cerrados»), `Tabs` del catálogo. Todo lo que pinta es público. `data-testid="bid-history-row"`.
 */
export function BidHistory({ title = 'Historial de pujas', views, idBase = 'bid-history', className }: BidHistoryProps) {
  const [active, setActive] = useState(views[0]?.key ?? '');
  const current = views.find((view) => view.key === active) ?? views[0];
  const many = views.length > 1;
  // Sin ninguna puja en ninguna vista no llena el alto de la columna (a 1920 sería una columna vacía de ~640 px).
  const idle = views.every((view) => view.entries.length === 0);
  const panelClass = cx(idle && GAME_SIDE_FIT, className);
  return <Panel title={title} variant="dark" scroll scrollLabel={title} {...(panelClass ? { className: panelClass } : {})} {...(!many && current?.badge != null ? { right: <Badge tone="cream">{current.badge}</Badge> } : {})}>
    {many && current
      ? <>
        <Tabs idBase={idBase} label={title} active={current.key} onChange={setActive} items={views.map((view) => ({ key: view.key, label: view.label, ...(view.badge != null ? { badge: view.badge } : {}) }))} />
        <TabPanel idBase={idBase} tabKey={current.key} className={cx(s.tabPanel)}><BidHistoryList entries={current.entries} emptyText={current.emptyText} label={current.label} onCream /></TabPanel>
      </>
      : current && <BidHistoryList entries={current.entries} emptyText={current.emptyText} label={current.label} />}
  </Panel>;
}
