import type { AvatarRef } from '@pokemon-universe/shared';

type AvatarListener = (userId: string, avatar: AvatarRef) => void;
const avatarListeners = new Set<AvatarListener>();

export function onAvatarUpdated(listener: AvatarListener): () => void {
  avatarListeners.add(listener);
  return () => avatarListeners.delete(listener);
}

export function notifyAvatarUpdated(userId: string, avatar: AvatarRef): void {
  for (const listener of avatarListeners) listener(userId, avatar);
}
