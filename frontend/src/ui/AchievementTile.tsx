import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useReducedMotion } from '../lib/motion';
import { cx } from './cx';
import { Icon } from './Icon';
import s from './AchievementTile.module.css';

export interface AchievementTileProps {
  name: string;
  description: string;
  state: 'unlocked' | 'locked' | 'secret';
  /** Ilustración del logro (la pantalla decide qué dibujar). */
  art: ReactNode;
  /** Fecha ya formateada de cuando se desbloqueó. */
  date?: string;
  /** Recién desbloqueado: entra con una animación (una vez, y ninguna con movimiento reducido). */
  fresh?: boolean;
}

/**
 * Casilla de un logro. Desbloqueada va en color; bloqueada o secreta, en gris con candado y `aria-label`
 * «Bloqueado: <nombre>». En un logro secreto, quien la usa pasa el texto de relleno en `name` y `description`.
 */
export function AchievementTile({ name, description, state, art, date, fresh = false }: AchievementTileProps) {
  const reduced = useReducedMotion();
  const locked = state !== 'unlocked';
  return (
    <li className={cx(s.tile, locked && s.locked, state === 'secret' && s.secret, fresh && !reduced && s.fresh)} {...(locked ? { 'aria-label': `Bloqueado: ${name}` } : {})}>
      <span className={s.art} aria-hidden="true">
        {art}
      </span>
      <div className={s.body}>
        <h3 className={s.name}>{name}</h3>
        <p className={s.desc}>{description}</p>
        {date && <p className={s.date}>{date}</p>}
      </div>
      {locked && <Icon icon={Lock} size={18} className={s.lock} />}
    </li>
  );
}
