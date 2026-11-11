import type { ButtonHTMLAttributes } from 'react';
import { uiSound } from '../audio/uiSound';
import { cx, type ForcedState } from './cx';
import s from './HelpDot.module.css';

export interface HelpDotProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Nombre accesible (obligatorio: el botón solo enseña «?»), p. ej. «Cómo se juega: Shiny Quiz». */
  'aria-label': string;
  /** Solo galería: estado forzado. */
  forced?: ForcedState;
}

/**
 * Botón «?» pequeño para la esquina de una carta o una cabecera: un disco crema de 28 px con contorno navy, pero con un
 * área pulsable de 44 px. Abre una ayuda (normalmente un diálogo), así que lleva `aria-haspopup="dialog"` por defecto.
 * Va como hermano del control que tenga al lado, nunca dentro de otro botón.
 */
export function HelpDot({ forced, className, type = 'button', onClick, ...rest }: HelpDotProps) {
  return <button aria-haspopup="dialog" {...rest} type={type} title={rest.title ?? rest['aria-label']}
    className={cx(s.dot, forced && s[forced], className)}
    onClick={(event) => { uiSound('tap'); onClick?.(event); }}>
    <span aria-hidden="true">?</span>
  </button>;
}
