import type { ReactNode } from 'react';
import { cx } from './cx';
import s from './Panel.module.css';
import { StateBox } from './StateBox';
import type { StateBoxProps } from './StateBox';

export interface PanelProps {
  title?: ReactNode;
  /** Hueco derecho de la cabecera: subtítulo o acción. */
  right?: ReactNode;
  variant?: 'blue' | 'cream' | 'dark';
  /** Cuerpo con desplazamiento interior. */
  scroll?: boolean;
  /** Sin relleno en el cuerpo. */
  flush?: boolean;
  /** Vacío, carga o error en lugar del contenido. */
  status?: StateBoxProps | null;
  className?: string;
  bodyClassName?: string;
  as?: 'section' | 'div';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  children?: ReactNode;
}

export function Panel({ title, right, variant = 'blue', scroll, flush, status, className, bodyClassName, as: Tag = 'section', children, ...aria }: PanelProps) {
  return (
    <Tag className={cx(s.panel, s[variant], status?.kind === 'error' && s.error, className)} {...aria}>
      {(title || right) && (
        <header className={s.head}>
          {/* Si el título es texto y no cabe, se recorta con elipsis: `title` deja leer el texto completo. */}
          {title && <h2 className={s.title} {...(typeof title === 'string' ? { title } : {})}>{title}</h2>}
          {right && <div className={s.right}>{right}</div>}
        </header>
      )}
      <div className={cx(s.body, scroll && s.scroll, flush && s.flush, bodyClassName)}>{status ? <StateBox {...status} onCream={variant === 'cream'} /> : children}</div>
    </Tag>
  );
}
