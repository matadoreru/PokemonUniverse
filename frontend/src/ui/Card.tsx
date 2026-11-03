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
  onSelect?: () => void;
  children?: ReactNode;
}

/** Carta de Pokémon; con `onSelect` es un botón conmutador. Correcta/incorrecta llevan icono y texto además del color. */
export function Card({ sprite, name, number, types, state = 'idle', onSelect, children }: CardProps) {
  // Suena al pasar a `revealing` (la carta se da la vuelta).
  const before = useRef<CardState>(state);
  useEffect(() => {
    if (state === 'revealing' && before.current !== 'revealing') audio.play('game.flip');
    before.current = state;
  }, [state]);
  const body = (
    <>
      <span className={s.art}>
        {sprite ? <img src={sprite} alt={name} loading="lazy" decoding="async" className={s.img} /> : <span className={s.placeholder} aria-hidden="true">?</span>}
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
  const cls = cx(s.card, s[state], onSelect && s.button);
  if (onSelect) {
    return (
      <button type="button" className={cls} aria-pressed={state === 'selected'} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
