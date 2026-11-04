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
export function TextCard({ name, text, detail, media, selected = false, ariaLabel, onSelect, forced, children }: TextCardProps) {
  const body = <>
    {media != null && <span className={s.media} aria-hidden="true">{media}</span>}
    <span className={s.body}>
      <span className={s.name}>{name}</span>
      {text != null && <span className={s.text}>{text}</span>}
      {detail != null && <span className={s.detail}>{detail}</span>}
      {children}
    </span>
  </>;
  const cls = cx(s.card, selected && s.selected, onSelect && s.button, forced && s[forced]);
  if (onSelect) {
    return <button type="button" className={cls} aria-pressed={selected} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})} onClick={() => { uiSound('tap'); onSelect(); }}>{body}</button>;
  }
  return <div className={cls}>{body}</div>;
}
