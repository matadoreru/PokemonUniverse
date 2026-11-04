import { Check, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { audio } from '../audio';
import type { PokemonType } from '../styles/tokens';
import { TypeBadge } from './Badge';
import { cx } from './cx';
import { Icon } from './Icon';
import s from './Card.module.css';

export type CardState = 'idle' | 'selected' | 'correct' | 'wrong' | 'revealing';

export interface CardProps {
  sprite?: string;
  name: string;
  number?: number;
  types?: { type: PokemonType; label: string }[];
  state?: CardState;
  /**
   * La imagen es una ilustración o foto (avatar), no un sprite: se escala suave, va en círculo y es decorativa
   * (`alt=""`), porque el nombre ya va escrito debajo.
   */
  photo?: boolean;
  /** Pequeña: sprite de 56 px y menos relleno (rejillas de resultados). */
  size?: 'md' | 'sm';
  /** Sprite decorativo (`alt=""`) cuando el nombre escrito basta, para que el nombre accesible sea solo el nombre. */
  decorativeSprite?: boolean;
  /** Con `onSelect`: botón de acción (elegir) en vez de conmutador, sin `aria-pressed`. */
  action?: boolean;
  /** Con `onSelect`: botón deshabilitado. */
  disabled?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
}

/** Carta de Pokémon; con `onSelect` es un botón conmutador. Correcta/incorrecta llevan icono y texto además del color. */
export function Card({ sprite, name, number, types, state = 'idle', photo, size = 'md', decorativeSprite, action, disabled, onSelect, children }: CardProps) {
  // Suena al pasar a `revealing` (la carta se da la vuelta).
  const before = useRef<CardState>(state);
  useEffect(() => {
    if (state === 'revealing' && before.current !== 'revealing') audio.play('game.flip');
    before.current = state;
  }, [state]);
  const body = (
    <>
      <span className={cx(s.art, photo && s.photoArt)}>
        {sprite ? <img src={sprite} alt={photo || decorativeSprite ? '' : name} loading="lazy" decoding="async" className={cx(s.img, photo && s.photo)} /> : <span className={s.placeholder} aria-hidden="true">?</span>}
      </span>
      <span className={s.name}>{name}</span>
      {number != null && <span className={s.num}>Nº {String(number).padStart(3, '0')}</span>}
      {types && types.length > 0 && (
        <span className={s.types}>
          {types.map((t) => (
            <TypeBadge key={t.type} type={t.type} label={t.label} size="sm" />
          ))}
        </span>
      )}
      {state === 'correct' && (
        <span className={cx(s.verdict, s.okText)}>
          <Icon icon={Check} size={18} />
          Correcta
        </span>
      )}
      {state === 'wrong' && (
        <span className={cx(s.verdict, s.badText)}>
          <Icon icon={X} size={18} />
          Incorrecta
        </span>
      )}
      {children}
    </>
  );
  const cls = cx(s.card, s[state], size === 'sm' && s.sm, onSelect && s.button);
  if (onSelect) {
    return (
      <button type="button" className={cls} aria-pressed={action ? undefined : state === 'selected'} disabled={disabled} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
