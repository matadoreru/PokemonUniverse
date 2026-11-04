import { cx } from './cx';
import s from './Bar.module.css';

/** Proporción rellena: 0 si max ≤ 0 o el valor no es finito; recortada a [0, 1]. */
export function barRatio(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export interface BarProps {
  value: number;
  max: number;
  tone?: 'yellow' | 'ok' | 'bad' | 'info' | 'player';
  label: string;
  showValue?: boolean;
  /** Texto del valor si no es «value/max». */
  valueText?: string;
  /** Oculta la barra a las tecnologías de apoyo cuando otro texto ya da el valor. */
  decorative?: boolean;
  /**
   * El relleno crece desde 0 al montarse (la transición solo anima los cambios, no el primer pintado): barras que
   * aparecen con un dato recién revelado. Sin animación con la reducción de movimiento.
   */
  grow?: boolean;
  /** Gruesa (`lg`, 20 px): barras protagonistas de una pantalla de juego. */
  size?: 'md' | 'lg';
}

/** Barra de medida; el relleno se escala con transform. */
export function Bar({ value, max, tone = 'yellow', label, showValue, valueText, decorative, grow, size = 'md' }: BarProps) {
  const ratio = barRatio(value, max);
  return (
    <span className={s.wrap} aria-hidden={decorative || undefined}>
      <span
        className={cx(s.bar, size === 'lg' && s.lg)}
        role="meter"
        aria-label={label}
        aria-valuenow={Math.min(Math.max(value, 0), Math.max(max, 0))}
        aria-valuemin={0}
        aria-valuemax={max}
        {...(valueText ? { 'aria-valuetext': valueText } : {})}
      >
        <i className={cx(s.fill, s[tone], grow && s.grow)} style={{ '--ratio': ratio } as React.CSSProperties} />
      </span>
      {showValue && <span className={s.val}>{valueText ?? `${value}/${max}`}</span>}
    </span>
  );
}
