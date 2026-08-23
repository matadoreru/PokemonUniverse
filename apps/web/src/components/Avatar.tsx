import { avatarPreset, type AvatarRef, type PresenceStatus } from '@pokemon-universe/shared';
import { useEffect, useState } from 'react';
import { apiAsset } from '../lib/api';

const sizeClasses = { xs: 'h-5 w-5 text-[9px]', sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-xl', xl: 'h-24 w-24 text-3xl' } as const;
const presenceClasses: Record<PresenceStatus, string> = { CONNECTED: 'bg-leaf', TEMPORARILY_DISCONNECTED: 'animate-pulse bg-electric', LEFT: 'bg-ink/30' };

export function avatarSource(avatar: AvatarRef | undefined): string | null {
  if (avatar?.type === 'PRESET') return avatarPreset(avatar.value)?.asset ?? null;
  if (avatar?.type === 'CUSTOM') return apiAsset(`/api/auth/avatars/${avatar.value}?v=${avatar.version}`);
  return null;
}

export function Avatar({ name, avatar, size = 'md', presence, className = '' }: { name: string; avatar?: AvatarRef | undefined; size?: keyof typeof sizeClasses; presence?: PresenceStatus | undefined; className?: string }) {
  const source = avatarSource(avatar); const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return <span className={`relative inline-grid shrink-0 place-items-center overflow-visible rounded-full bg-gradient-to-br from-aqua to-electric font-display font-bold text-night ${sizeClasses[size]} ${className}`} aria-label={`Avatar de ${name}`}>
    {source && !failed ? <img className="h-full w-full rounded-full object-cover" src={source} alt="" onError={() => setFailed(true)} /> : <span aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || '?'}</span>}
    {presence && <span className={`absolute -bottom-0.5 -right-0.5 h-[28%] min-h-2 min-w-2 w-[28%] rounded-full border-2 border-surface-raised ${presenceClasses[presence]}`} title={presence === 'CONNECTED' ? 'Conectado' : presence === 'TEMPORARILY_DISCONNECTED' ? 'Reconectando' : 'Desconectado'} />}
  </span>;
}
