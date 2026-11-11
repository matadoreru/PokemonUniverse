import type { ReactNode } from 'react';
import { cx } from './cx';
import s from './Kbd.module.css';

export interface KbdProps {
  children: ReactNode;
  /**
   * Solo con puntero fino (ratón o panel táctil, `@media (pointer: fine)`): en táctil un atajo de teclado no sirve. Es
   * decorativa (`aria-hidden`): el control ya dice su atajo con `aria-keyshortcuts` y su nombre no cambia.
   */
  fineOnly?: boolean;
  className?: string | undefined;
}

/**
 * Tecla de un atajo (`<kbd>`): una tecla pequeña crema con contorno navy, a 13 px. Es decorativa junto a un control que
 * ya lleva `aria-keyshortcuts`; en la ayuda de atajos es el texto de la tecla.
 */
export function Kbd({ children, fineOnly = false, className }: KbdProps) {
  return <kbd className={cx(s.kbd, fineOnly && s.fine, className)} {...(fineOnly ? { 'aria-hidden': true } : {})}>{children}</kbd>;
}
