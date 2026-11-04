import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import s from './Screen.module.css';

export type ScreenWidth = 'narrow' | 'medium' | 'form' | 'wide';

export interface ScreenProps {
  children: ReactNode;
  /** Ancho máximo del contenido: tarjeta (520→640 px), lectura (760→960), formulario (1100→1200) o completo (1600). */
  width?: ScreenWidth;
  /** El contenido llena el alto en vez de centrarse (pantallas con paneles de scroll interno). */
  fill?: boolean;
  /** Pie fijo al fondo de la pantalla en escritorio (la línea legal). */
  footer?: ReactNode;
  /** Alto que ya ocupa otra fila encima en el mismo `main` (CSS, p. ej. `3.5rem`); se descuenta para no hacer scroll. */
  reserve?: string;
  className?: string;
  contentClassName?: string;
}

/**
 * Pantalla pública (spec §2): en escritorio llena el alto del `main`, centra su contenido en los dos ejes con los
 * mismos márgenes en todas las pantallas y lo deja crecer por pasos a 1536 y 1920 px; en móvil apila arriba.
 */
export function Screen({ children, width = 'wide', fill = false, footer, reserve, className, contentClassName }: ScreenProps) {
  const style = reserve ? ({ '--screen-reserve': reserve } as CSSProperties) : undefined;
  return (
    <div className={cx(s.screen, s[width], fill && s.fill, footer == null && s.bare, className)} style={style}>
      <div className={cx(s.content, contentClassName)}>{children}</div>
      {footer != null && <div className={s.footer}>{footer}</div>}
    </div>
  );
}

export interface ScreenHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Acción a la derecha del título (p. ej. «Volver»). */
  aside?: ReactNode;
  /** Centrada en móvil y tableta (a la izquierda desde 1024 px). */
  centerOnMobile?: boolean;
  id?: string;
}

/** Cabecera de pantalla: el `h1` (34 → 44 → 68 px), su entradilla y una acción opcional. */
export function ScreenHeader({ title, subtitle, aside, centerOnMobile = false, id }: ScreenHeaderProps) {
  return (
    <header className={cx(s.header, centerOnMobile && s.headerCenter)}>
      <div className={s.heading}>
        <h1 id={id} className={cx('ol2', s.title)}>{title}</h1>
        {subtitle != null && <p className={s.subtitle}>{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}
