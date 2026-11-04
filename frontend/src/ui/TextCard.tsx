import type { ReactNode } from 'react';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import type { ForcedState } from './cx';
import s from './TextCard.module.css';

export interface TextCardProps {
  /** Lo que se lee primero («Respuesta 2», el nombre del jugador). Corto. */
  name: string;
  /** El texto largo (una respuesta escrita): se parte en líneas, nunca se recorta. */
  text?: ReactNode;
  /** Línea pequeña bajo el texto (p. ej. «de Ana»). */
  detail?: ReactNode;
  /** Imagen a la izquierda (avatar, sprite); decorativa: el nombre ya va escrito. */
  media?: ReactNode;
  /** Elegida: fondo amarillo claro y contorno grueso (con `onSelect`, además `aria-pressed`). */
  selected?: boolean;
  /** Nombre accesible del botón si no basta el texto visible. */
  ariaLabel?: string;
  /** Con él es un botón conmutador (`aria-pressed`); sin él, una caja fija. */
  onSelect?: () => void;
  /**
   * Atajo de teclado de la opción («1», «2»): va en `aria-keyshortcuts` y se ve como insignia de número en la esquina
   * (como la de `Pill`). Quien la usa escucha la tecla (la carta no lo hace).
   */
  shortcut?: string;
  /** Grande (`lg`): texto de 22 px (26 px en escritorio grande) para dos opciones enfrentadas (Would You Rather). */
  size?: 'md' | 'lg';
  /** Solo galería: estado forzado. */
  forced?: ForcedState;
  /** Chips o notas bajo el texto («Tu respuesta», «Empate»). */
  children?: ReactNode;
}

/**
 * Carta de texto: la hermana de `Card` para lo que no es un Pokémon (respuestas escritas, jugadores). Crema con contorno
 * y sombra dura; con `onSelect` es un botón conmutador que sube al pasar, baja 4 px al pulsar y suena como `Card`. El
 * texto se parte en líneas (respuestas de hasta 100 caracteres) y la elegida lleva contorno, no solo color.
 */
export function TextCard({ name, text, detail, media, selected = false, ariaLabel, onSelect, shortcut, size = 'md', forced, children }: TextCardProps) {
  const body = <>
    {shortcut && <span className={s.shortcut} aria-hidden="true">{shortcut}</span>}
    {media != null && <span className={s.media} aria-hidden="true">{media}</span>}
    <span className={s.body}>
      <span className={s.name}>{name}</span>
      {text != null && <span className={s.text}>{text}</span>}
      {detail != null && <span className={s.detail}>{detail}</span>}
      {children}
    </span>
  </>;
  const cls = cx(s.card, size === 'lg' && s.lg, shortcut && s.withShortcut, selected && s.selected, onSelect && s.button, forced && s[forced]);
  if (onSelect) {
    return <button type="button" className={cls} aria-pressed={selected} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})} {...(shortcut ? { 'aria-keyshortcuts': shortcut } : {})} onClick={() => { uiSound('tap'); onSelect(); }}>{body}</button>;
  }
  return <div className={cls}>{body}</div>;
}
