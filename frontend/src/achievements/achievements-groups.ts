import type { AchievementResponse } from '../lib/api-contract';

export type AchievementGroupKey = 'GENERAL' | 'GAME' | 'SECRET';

export interface AchievementGroup {
  key: AchievementGroupKey;
  title: 'Generales' | 'Minijuegos' | 'Secretos';
  items: AchievementResponse[];
}

const GROUPS: { key: AchievementGroupKey; title: AchievementGroup['title'] }[] = [
  { key: 'GENERAL', title: 'Generales' },
  { key: 'GAME', title: 'Minijuegos' },
  { key: 'SECRET', title: 'Secretos' },
];

/** Agrupa por familia en el orden fijo Generales, Minijuegos, Secretos (conserva el orden del servidor dentro de cada una); omite los grupos vacíos. */
export function groupAchievements(list: AchievementResponse[]): AchievementGroup[] {
  return GROUPS
    .map((group) => ({ ...group, items: list.filter((achievement) => achievement.family === group.key) }))
    .filter((group) => group.items.length > 0);
}

const date = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' });

/** «Conseguido el 7 nov 2026» (sin el punto final que `es-ES` pone a veces a los meses abreviados). */
export function unlockedDate(iso: string): string {
  return `Conseguido el ${date.format(new Date(iso)).replace(/\./g, '')}`;
}
