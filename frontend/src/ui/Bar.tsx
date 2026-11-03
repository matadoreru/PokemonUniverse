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
}

/** Barra de medida; el relleno se escala con transform. */
export function Bar({ value, max, tone = 'yellow', label, showValue, valueText }: BarProps) {
  const ratio = barRatio(value, max);
  return (
    <span className={s.wrap}>
      <span
        className={s.bar}
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        {...(valueText ? { 'aria-valuetext': valueText } : {})}
      >
        <i className={cx(s.fill, s[tone])} style={{ '--ratio': ratio } as React.CSSProperties} />
      </span>
      {showValue && <span className={s.val}>{valueText ?? `${value}/${max}`}</span>}
    </span>
  );
}
