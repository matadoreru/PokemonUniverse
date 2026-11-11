import { Bar, Chip, cx } from '../../ui';
import { higherLowerBars } from './higher-lower-labels';
import s from './HigherLower.module.css';

export interface HigherLowerBarsProps {
  previous: { name: string; value: number };
  current: { name: string; value: number };
  /** Nombre de la stat comparada (va en el nombre accesible del grupo). */
  category?: string;
}

/**
 * Barras del revelado: anterior y actual sobre el mayor de los dos (`Bar` del catálogo, gruesa y creciendo al montarse).
 * Solo se monta en `ROUND_RESULTS`, cuando el valor del actual ya es público. El que va por delante en verde (`ok`), el
 * otro en azul; en un empate, las dos amarillas. El color nunca va solo: cada barra lleva su valor escrito y la del
 * actual, la diferencia («+40», «−12» o «=»). Las barras son decorativas: el texto ya da los valores.
 */
export function HigherLowerBars({ previous, current, category }: HigherLowerBarsProps) {
  const bars = higherLowerBars(previous.value, current.value);
  const max = Math.max(previous.value, current.value);
  const rows = [
    { side: 'previous' as const, label: 'Anterior', ...previous },
    { side: 'current' as const, label: 'Actual', ...current },
  ];
  const tone = (side: 'previous' | 'current') => bars.leader === 'tie' ? 'yellow' : bars.leader === side ? 'ok' : 'info';
  return <div className={s.bars} data-testid="higher-lower-bars" role="group" aria-label={category ? `Comparación de ${category}` : 'Comparación'}>
    {rows.map(({ side, label, name, value }) => <div key={side} className={s.barRow}>
      <div className={s.barHead}>
        <span className={s.barName} title={`${label}: ${name}`}><span className={s.barLabel}>{label} · </span>{name}</span>
        {side === 'current' && <span className={s.barDiff}><Chip tone={bars.leader === 'tie' ? 'warn' : bars.leader === 'current' ? 'ok' : 'info'}><span className={cx(s.diff)}><span className="sr-only">Diferencia </span>{bars.diffLabel}</span></Chip></span>}
        <strong className={s.barValue}>{value}</strong>
      </div>
      <span className={s.barTrack} data-bar={side}>
        <Bar value={value} max={max} tone={tone(side)} label={`${label}: ${name}`} decorative grow size="lg" />
      </span>
    </div>)}
  </div>;
}
