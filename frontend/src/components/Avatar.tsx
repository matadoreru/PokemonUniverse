import { type AvatarRef, type PresenceStatus } from '@pokemon-universe/shared/public';
import { useEffect, useState } from 'react';
import { apiAsset } from '../lib/api';
import { cx } from '../ui';
import s from './Avatar.module.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
const presenceLabel: Record<PresenceStatus, string> = { CONNECTED: 'Conectado', TEMPORARILY_DISCONNECTED: 'Reconectando', LEFT: 'Desconectado' };
const presenceClass: Record<PresenceStatus, string | undefined> = { CONNECTED: s.connected, TEMPORARILY_DISCONNECTED: s.reconnecting, LEFT: s.left };

export function avatarSource(avatar: AvatarRef | undefined): string | null {
  // Los avatares predefinidos ya no existen: un PRESET guardado se muestra como la inicial (sin pedir imagen).
  if (avatar?.type === 'CUSTOM') return apiAsset(`/api/auth/avatars/${avatar.value}?v=${avatar.version}`);
  return null;
}

/** Avatar redondo: la imagen del jugador o, sin ella, su inicial con contorno sobre el degradado azul de los tokens. */
export function Avatar({ name, avatar, size = 'md', presence, className = '' }: { name: string; avatar?: AvatarRef | undefined; size?: AvatarSize; presence?: PresenceStatus | undefined; className?: string }) {
  const source = avatarSource(avatar); const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return <span className={cx(s.avatar, s[size], className)} aria-label={`Avatar de ${name}`}>
    {source && !failed ? <img className={s.img} src={source} alt="" onError={() => setFailed(true)} /> : <span className={cx(s.initial, 'ol')} aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || '?'}</span>}
    {presence && <span className={cx(s.presence, presenceClass[presence])} title={presenceLabel[presence]} />}
  </span>;
}
