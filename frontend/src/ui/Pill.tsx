import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import type { ForcedState } from './cx';
import { Icon } from './Icon';
import s from './Pill.module.css';

export type PillVariant = 'blue' | 'yellow' | 'red' | 'danger' | 'ghost' | 'cream';
export type PillSize = 'std' | 'small' | 'main' | 'round';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
  size?: PillSize;
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
  /** Insignia de número en la esquina (atajos 1–4). */
  badge?: string;
  /** Solo galería: estado forzado. */
  forced?: ForcedState;
}

/** Manejador de pulsación: no existe si la píldora está deshabilitada o cargando; si no, suena y llama a onClick. */
export function pillClickHandler(props: Pick<PillProps, 'variant' | 'disabled' | 'loading' | 'onClick'>) {
  if (props.disabled || props.loading) return undefined;
  const { variant = 'blue', onClick } = props;
  return (e: MouseEvent<HTMLButtonElement>) => {
    uiSound(variant === 'ghost' || variant === 'cream' ? 'tap' : 'confirm');
    onClick?.(e);
  };
}

export function Pill(props: PillProps) {
  const { variant = 'blue', size = 'std', icon, loading, block, badge, forced, className, children, type = 'button', disabled, ...rest } = props;
  const off = Boolean(disabled || loading);
  return (
    <button
      {...rest}
      type={type}
      className={cx(s.pill, s[variant], size !== 'std' && s[size], block && s.block, loading && s.loading, forced && s[forced], className)}
      disabled={off}
      aria-busy={loading || undefined}
      tabIndex={off ? -1 : rest.tabIndex}
      onClick={pillClickHandler(props)}
    >
      {icon && <Icon icon={icon} size={size === 'small' ? 18 : size === 'round' ? 22 : 24} className={s.icon} />}
      {children != null && children !== false && <span className={s.label}>{children}</span>}
      {badge && <span className={s.badge}>{badge}</span>}
      {loading && (
        <span className={s.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </button>
  );
}
