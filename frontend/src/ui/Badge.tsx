import { Check } from 'lucide-react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { uiSound } from '../audio/uiSound';
import type { PokemonType } from '../styles/tokens';
import { typeInk } from '../styles/tokens';
import { cx } from './cx';
import type { ForcedState } from './cx';
import { Icon } from './Icon';
import s from './Badge.module.css';

export interface BadgeProps {
  children: ReactNode;
  tone?: 'yellow' | 'navy' | 'cream';
}

/** Insignia numérica o de estado. */
export function Badge({ children, tone = 'yellow' }: BadgeProps) {
  return <span className={cx(s.badge, s[tone])}>{children}</span>;
}

export interface TypeBadgeProps {
  type: PokemonType;
  label: string;
  /**
   * Grande (`lg`): la insignia protagonista de una revelación (26 px; quien la usa puede cambiar el tamaño de letra con
   * `--type-badge-fs`, p. ej. en escritorio grande).
   */
  size?: 'sm' | 'md' | 'lg';
}

const typeStyle = (type: PokemonType) => ({ '--type-bg': `var(--type-${type})`, '--type-fg': `var(--type-${type}-ink)` }) as CSSProperties;
const whiteInk = (type: PokemonType) => typeInk[type] === '#FFFFFF';

/** Insignia de tipo: fondo y tinta salen de los tokens del tipo; con tinta blanca lleva anillo blanco de 2 px. */
export function TypeBadge({ type, label, size = 'md' }: TypeBadgeProps) {
  return (
    <span className={cx(s.type, size === 'sm' && s.sm, size === 'lg' && s.lg, whiteInk(type) && s.ring)} style={typeStyle(type)} data-type={type}>
      {label}
    </span>
  );
}

export interface TypeOptionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  type: PokemonType;
  label: string;
  /** Elegido: `aria-pressed`, contorno amarillo grueso y ✓ (el color nunca va solo). */
  pressed: boolean;
  /** Enviado y a la espera del servidor (`aria-busy`; no se puede volver a pulsar). */
  loading?: boolean;
  /** Solo galería: estado forzado. */
  forced?: ForcedState;
}

/**
 * Tipo seleccionable (botón conmutador de 48 px): la insignia de tipo con relieve de píldora. Sube al pasar por encima,
 * baja 4 px al pulsar, suena como una píldora de acción y, elegido, lleva ✓ y contorno amarillo además de su color.
 */
export function TypeOption({ type, label, pressed, loading = false, forced, disabled, className, onClick, ...rest }: TypeOptionProps) {
  const off = Boolean(disabled || loading);
  return (
    <button
      {...rest}
      type="button"
      className={cx(s.option, whiteInk(type) && s.optionWhite, pressed && s.pressed, loading && s.optionLoading, forced && s[forced], className)}
      style={typeStyle(type)}
      data-type={type}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      disabled={off}
      onClick={off ? undefined : (event) => { uiSound('confirm'); onClick?.(event); }}
    >
      <span className={s.optionLabel} title={label}>{label}</span>
      {pressed && <Icon icon={Check} size={18} className={s.optionCheck} />}
    </button>
  );
}

export interface ChipProps {
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
  children: ReactNode;
  icon?: ReactNode;
}

/** Chip de estado: texto azul noche sobre el tono. */
export function Chip({ tone = 'neutral', children, icon }: ChipProps) {
  return (
    <span className={cx(s.chip, s[tone])}>
      {icon}
      {children}
    </span>
  );
}
