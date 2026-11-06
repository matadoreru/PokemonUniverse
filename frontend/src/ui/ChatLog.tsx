import { ChevronDown, Shield } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import { Pill } from './Pill';
import s from './ChatLog.module.css';

export interface ChatLogItem {
  id: string;
  author: string;
  /** Color del jugador (un token, p. ej. `var(--info)`): la banda de la izquierda; el nombre nunca depende solo del color. */
  authorTone?: string;
  /** Hora ya formateada (`HH:mm`). */
  time: string;
  text: string;
  /** Mensaje propio: fondo del jugador propio y etiqueta «Tú». */
  own: boolean;
}

export interface ChatLogProps {
  items: ChatLogItem[];
  /** Nombre de la lista para lectores de pantalla. */
  label: string;
  /** Qué se ve sin mensajes (un `StateBox`). */
  empty: ReactNode;
  /** Con esta función cada mensaje lleva un botón de moderar. */
  onModerate?: (id: string) => void;
  moderateLabel?: (item: ChatLogItem) => string;
  newMessagesLabel?: string;
  className?: string;
  /** Solo galería: enseña «Ver mensajes nuevos» sin tener que desplazar la lista. */
  forceUnseen?: boolean;
}

/** Distancia al final (px) hasta la que la lista sigue al último mensaje. */
const NEAR_BOTTOM_PX = 48;

export function isNearBottom(m: { scrollHeight: number; clientHeight: number; scrollTop: number }, threshold = NEAR_BOTTOM_PX): boolean {
  return m.scrollHeight - m.clientHeight - m.scrollTop <= threshold;
}

function scrollToEnd(el: HTMLElement, smooth: boolean) {
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? 'smooth' : 'auto' });
}

/**
 * Lista de mensajes de un chat. No es una región viva: los avisos de mensajes nuevos los da otro sitio. Baja sola al
 * último mensaje si ya estaba abajo; si quien lee había subido, no se mueve y ofrece «Ver mensajes nuevos».
 */
export function ChatLog({ items, label, empty, onModerate, moderateLabel, newMessagesLabel = 'Ver mensajes nuevos', className, forceUnseen }: ChatLogProps) {
  const list = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const seen = useRef<Set<string> | null>(null);
  const [unseen, setUnseen] = useState(false);

  useLayoutEffect(() => {
    const el = list.current;
    const previous = seen.current;
    seen.current = new Set(items.map((i) => i.id));
    if (!el) return;
    const last = items[items.length - 1];
    if (!previous) {
      scrollToEnd(el, false);
      return;
    }
    if (!last || previous.has(last.id)) return;
    // Un mensaje propio se ve siempre; los ajenos solo si ya se estaba abajo.
    if (atBottom.current || last.own) scrollToEnd(el, true);
    else setUnseen(true);
  }, [items]);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    atBottom.current = isNearBottom(el);
    if (atBottom.current) setUnseen(false);
  };

  const showUnseen = unseen || Boolean(forceUnseen);

  return (
    <div className={cx(s.log, className)}>
      {items.length === 0 ? (
        empty
      ) : (
        <ol ref={list} className={s.list} aria-label={label} onScroll={onScroll}>
          {items.map((item) => (
            <li key={item.id} className={cx(s.msg, item.own && s.own)} style={item.authorTone ? ({ '--player': item.authorTone } as CSSProperties) : undefined}>
              {item.authorTone && <span className={s.band} aria-hidden="true" />}
              <div className={s.body}>
                <div className={s.head}>
                  <span className={s.author} title={item.author}>
                    {item.author}
                  </span>
                  {item.own && <span className={s.me}>Tú</span>}
                  <span className={s.time}>{item.time}</span>
                </div>
                <p className={s.text}>{item.text}</p>
              </div>
              {onModerate && (
                <Pill variant="cream" size="round" icon={Shield} aria-label={moderateLabel ? moderateLabel(item) : item.author} onClick={() => onModerate(item.id)} />
              )}
            </li>
          ))}
        </ol>
      )}
      {showUnseen && (
        <div className={s.unseen}>
          <Pill
            variant="yellow"
            size="small"
            icon={ChevronDown}
            onClick={() => {
              if (list.current) scrollToEnd(list.current, true);
              setUnseen(false);
            }}
          >
            {newMessagesLabel}
          </Pill>
        </div>
      )}
    </div>
  );
}
