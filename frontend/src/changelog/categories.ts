import type { ChangelogCategory } from '@pokemon-universe/shared/public';
import { Bug, Code2, Gamepad2, Palette, Scale, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import type { ChipProps, PatchTone } from '../ui';

/** Icono, acento de las notas de parche y tono del chip (vista previa de la portada) de cada categoría. */
export const changelogCategories: Record<ChangelogCategory, { icon: LucideIcon; tone: PatchTone; chip: NonNullable<ChipProps['tone']> }> = {
  NEW: { icon: Sparkles, tone: 'ok', chip: 'ok' },
  MINIGAMES: { icon: Gamepad2, tone: 'yellow', chip: 'warn' },
  BALANCE: { icon: Scale, tone: 'orange', chip: 'warn' },
  INTERFACE: { icon: Palette, tone: 'info', chip: 'info' },
  IMPROVEMENTS: { icon: Wrench, tone: 'blue', chip: 'neutral' },
  BUGS: { icon: Bug, tone: 'red', chip: 'bad' },
  TECHNICAL: { icon: Code2, tone: 'neutral', chip: 'neutral' },
};
