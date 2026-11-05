import { type AvatarRef, type PresenceStatus } from '@pokemon-universe/shared/public';
import { useEffect, useState } from 'react';
import { apiAsset } from '../lib/api';
import { cx } from '../ui';
import s from './Avatar.module.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
const presenceLabel: Record<PresenceStatus, string> = { CONNECTED: 'Conectado', TEMPORARILY_DISCONNECTED: 'Reconectando', LEFT: 'Desconectado' };
const presenceClass: Record<PresenceStatus, string | undefined> = { CONNECTED: s.connected, TEMPORARILY_DISCONNECTED: s.reconnecting, LEFT: s.left };

export function avatarSource(avatar: AvatarRef | undefined): string | null {
  if (avatar?.type === 'CUSTOM') return apiAsset(`/api/auth/avatars/${avatar.value}?v=${avatar.version}`);
  return null;
}

/** Nivel que se pinta: solo enteros positivos (los invitados llegan con `null`). */
export function visibleLevel(level: number | null | undefined): number | null {
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 ? level : null;
}

/**
 * Avatar redondo: la imagen del jugador o, sin ella, su inicial con contorno sobre el degradado azul de los tokens.
 * Con `level` (cuentas registradas) lleva arriba a la izquierda la insignia amarilla del nivel; abajo a la derecha
 * queda la presencia.
 */
export function Avatar({ name, avatar, size = 'md', presence, level, className = '' }: { name: string; avatar?: AvatarRef | undefined; size?: AvatarSize; presence?: PresenceStatus | undefined; level?: number | null | undefined; className?: string }) {
  const source = avatarSource(avatar); const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  const shownLevel = visibleLevel(level);
  return <span className={cx(s.avatar, s[size], className)} aria-label={shownLevel === null ? `Avatar de ${name}` : `Avatar de ${name}, nivel ${shownLevel}`}>
    {source && !failed ? <img className={s.img} src={source} alt="" onError={() => setFailed(true)} /> : <span className={cx(s.initial, 'ol')} aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || '?'}</span>}
    {presence && <span className={cx(s.presence, presenceClass[presence])} title={presenceLabel[presence]} />}
    {shownLevel !== null && <span className={s.level} title={`Nivel ${shownLevel}`} aria-hidden="true" data-level={shownLevel}>{shownLevel}</span>}
  </span>;
}
