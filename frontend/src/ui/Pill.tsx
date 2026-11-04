import type { LucideIcon } from 'lucide-react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import type { ForcedState } from './cx';
import { Icon } from './Icon';
import s from './Pill.module.css';

export type PillVariant = 'blue' | 'yellow' | 'red' | 'danger' | 'ghost' | 'cream';
export type PillSize = 'std' | 'small' | 'main' | 'round';

/** Tonos con tinta blanca: su etiqueta lleva el contorno de texto `.ol` (spec §3.1, texto blanco sobre degradado). */
export const WHITE_INK_PILLS: readonly PillVariant[] = ['blue', 'red', 'danger', 'ghost'];

interface PillBase extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** El botón (React 19 pasa `ref` como prop): para devolverle el foco tras un envío rechazado. */
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
  /** Insignia de número en la esquina (atajos 1–4). */
  badge?: string;
  /** Solo galería: estado forzado. */
  forced?: ForcedState;
}

/** Regla del sistema: la roja solo con texto de 24 px o más (tamaño `main`), y `main` solo para roja o amarilla. */
export type PillProps = PillBase &
  (
    | { variant: 'red'; size: 'main' }
    | { variant: 'yellow'; size?: PillSize }
    | { variant?: 'blue' | 'danger' | 'ghost' | 'cream'; size?: Exclude<PillSize, 'main'> }
  );

/** Manejador de pulsación: no existe si la píldora está deshabilitada o cargando; si no, suena y llama a onClick. */
export function pillClickHandler(props: Pick<PillBase, 'disabled' | 'loading' | 'onClick'> & { variant?: PillVariant }) {
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
      {children != null && children !== false && <span className={cx(s.label, WHITE_INK_PILLS.includes(variant) && 'ol')}>{children}</span>}
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

interface PillLinkBase extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href'> {
  /** Ruta de la aplicación (enlace de React Router). */
  to: string;
  children?: ReactNode;
  icon?: LucideIcon;
  block?: boolean;
  /**
   * Enlace de navegación (cabecera): en su página lleva `aria-current="page"` y se ve elegida, en amarillo y con una
   * barra debajo (no solo el color). Cuenta también en sus subrutas (`/admin/...`).
   */
  nav?: boolean;
  /** Solo galería: estado forzado. */
  forced?: ForcedState;
}

/** Mismas reglas de tono y tamaño que `Pill`. */
export type PillLinkProps = PillLinkBase &
  (
    | { variant: 'red'; size: 'main' }
    | { variant: 'yellow'; size?: PillSize }
    | { variant?: 'blue' | 'danger' | 'ghost' | 'cream'; size?: Exclude<PillSize, 'main'> }
  );

/** Píldora que navega: el mismo relieve y sonido que `Pill`, pero es un enlace (se abre en otra pestaña, se anuncia como enlace). */
export function PillLink(props: PillLinkProps) {
  const { to, variant = 'blue', size = 'std', icon, block, nav, forced, className, children, onClick, ...rest } = props;
  const classes = (current: boolean) => cx(s.pill, s.link, s[variant], size !== 'std' && s[size], block && s.block, current && s.current, forced && s[forced], className);
  const body = (current: boolean) => (
    <>
      {icon && <Icon icon={icon} size={size === 'small' ? 18 : size === 'round' ? 22 : 24} className={s.icon} />}
      {children != null && children !== false && <span className={cx(s.label, !current && WHITE_INK_PILLS.includes(variant) && 'ol')}>{children}</span>}
    </>
  );
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    uiSound(variant === 'ghost' || variant === 'cream' ? 'tap' : 'confirm');
    onClick?.(e);
  };
  if (nav) {
    // `exactOptionalPropertyTypes`: NavLink no acepta `style={undefined}`.
    const { style, ...navRest } = rest;
    return (
      // El inicio (`/`) solo cuenta como página actual en sí mismo, no en todas las rutas que cuelgan de él.
      <NavLink {...navRest} {...(style ? { style } : {})} to={to} end={to === '/'} className={({ isActive }) => classes(isActive)} onClick={handleClick}>
        {({ isActive }) => body(isActive)}
      </NavLink>
    );
  }
  return (
    <Link {...rest} to={to} className={classes(false)} onClick={handleClick}>
      {body(false)}
    </Link>
  );
}
