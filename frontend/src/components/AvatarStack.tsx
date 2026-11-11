import type { AvatarRef } from '@pokemon-universe/shared/public';
import { cx } from '../ui';
import { Avatar } from './Avatar';
import { joinNames } from '../lib/format';
import s from './AvatarStack.module.css';

export interface AvatarStackMember {
  id: string;
  name: string;
  avatar?: AvatarRef | undefined;
}

/** Texto para lectores de pantalla de una pila de avatares: «Elegida por Ana y Leo». */
export function avatarStackLabel(names: readonly string[], prefix: string): string {
  if (names.length === 0) return '';
  return `${prefix} ${joinNames(names)}`;
}

/**
 * Avatares apilados de quién eligió algo (hasta `max`, con «+N» para el resto), en una pastilla crema con contorno:
 * va encima del sprite de una carta (`Card` con `artOverlay`) sin ocupar alto. Los avatares son decorativos; la lista
 * entera va en `label`, solo para lectores de pantalla.
 */
export function AvatarStack({ members, label, max = 3, className, testId }: { members: readonly AvatarStackMember[]; label: string; max?: number; className?: string | undefined; testId?: string | undefined }) {
  if (members.length === 0) return null;
  const visible = members.slice(0, max);
  const hidden = members.length - visible.length;
  return <span className={cx(s.stack, className)} {...(testId ? { 'data-testid': testId } : {})}>
    <span className={s.avatars} aria-hidden="true">{visible.map((member) => <Avatar key={member.id} name={member.name} avatar={member.avatar} size="sm" />)}</span>
    {hidden > 0 && <span className={s.more} aria-hidden="true">+{hidden}</span>}
    <span className="sr-only">{label}</span>
  </span>;
}
