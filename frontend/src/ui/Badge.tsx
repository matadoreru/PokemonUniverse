import type { CSSProperties, ReactNode } from 'react';
import type { PokemonType } from '../styles/tokens';
import { typeInk } from '../styles/tokens';
import { cx } from './cx';
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
  size?: 'sm' | 'md';
}

/** Insignia de tipo: fondo y tinta salen de los tokens del tipo; con tinta blanca lleva anillo blanco de 2 px. */
export function TypeBadge({ type, label, size = 'md' }: TypeBadgeProps) {
  const style = { '--type-bg': `var(--type-${type})`, '--type-fg': `var(--type-${type}-ink)` } as CSSProperties;
  const whiteInk = typeInk[type] === '#FFFFFF';
  return (
    <span className={cx(s.type, size === 'sm' && s.sm, whiteInk && s.ring)} style={style} data-type={type}>
      {label}
    </span>
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
