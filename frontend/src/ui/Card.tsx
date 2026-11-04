import { Check, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { audio } from '../audio';
import type { PokemonType } from '../styles/tokens';
import { TypeBadge } from './Badge';
import { cx } from './cx';
import { Icon } from './Icon';
import s from './Card.module.css';

export type CardState = 'idle' | 'selected' | 'correct' | 'wrong' | 'revealing';

/** Atributos extra del elemento de la carta (botón o caja): nombre accesible, atajos y `data-*` de quien la usa. */
export type CardAttrs = { 'aria-label'?: string; 'aria-keyshortcuts'?: string } & { [key: `data-${string}`]: string | undefined };

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
  /**
   * Pequeña (`sm`): sprite de 56 px y menos relleno (rejillas de resultados). Llena (`fill`): ocupa toda su celda y el
   * hueco del sprite crece con ella (rejillas de opciones de un juego, donde el sprite es lo que se mira).
   */
  size?: 'md' | 'sm' | 'fill';
  /**
   * Gira al montarse o al pasar a `true` (como `revealing`), con cualquier estado: la carta correcta se descubre y queda
   * marcada como correcta. Suena igual que `revealing`.
   */
  flip?: boolean;
  /** Ver `CardAttrs`. */
  attrs?: CardAttrs;
  /** Sprite decorativo (`alt=""`) cuando el nombre escrito basta, para que el nombre accesible sea solo el nombre. */
  decorativeSprite?: boolean;
  /** Con `onSelect`: botón de acción (elegir) en vez de conmutador, sin `aria-pressed`. */
  action?: boolean;
  /** Con `onSelect`: botón deshabilitado. */
  disabled?: boolean;
  /**
   * Arte decorativo en el hueco del sprite cuando no hay imagen (p. ej. el icono de un minijuego). Va oculto a los
   * lectores de pantalla: el nombre de la carta ya lo dice.
   */
  art?: ReactNode;
  onSelect?: () => void;
  children?: ReactNode;
}

/** Carta de Pokémon; con `onSelect` es un botón conmutador. Correcta/incorrecta llevan icono y texto además del color. */
export function Card({ sprite, name, number, types, state = 'idle', photo, size = 'md', flip = false, attrs, decorativeSprite, action, disabled, art, onSelect, children }: CardProps) {
  // Suena al empezar a girar (`revealing` o `flip`): la carta se da la vuelta.
  const turning = state === 'revealing' || flip;
  const before = useRef(turning);
  useEffect(() => {
    if (turning && !before.current) audio.play('game.flip');
    before.current = turning;
  }, [turning]);
  const body = (
    <>
      <span className={cx(s.art, photo && s.photoArt)}>
        {sprite ? (
          <img src={sprite} alt={photo || decorativeSprite ? '' : name} loading="lazy" decoding="async" className={cx(s.img, photo && s.photo)} />
        ) : art != null ? (
          <span className={s.glyph} aria-hidden="true">
            {art}
          </span>
        ) : (
          <span className={s.placeholder} aria-hidden="true">?</span>
        )}
      </span>
      {/* Llena, el nombre largo se recorta con elipsis: `title` deja leerlo entero. */}
      <span className={s.name} {...(size === 'fill' ? { title: name } : {})}>{name}</span>
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
  const cls = cx(s.card, s[state], size === 'sm' && s.sm, size === 'fill' && s.fill, flip && s.flip, onSelect && s.button);
  if (onSelect) {
    return (
      <button type="button" {...attrs} className={cls} aria-pressed={action ? undefined : state === 'selected'} disabled={disabled} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return <div {...attrs} className={cls}>{body}</div>;
}
