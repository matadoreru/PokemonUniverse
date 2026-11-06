/** Contrato del evento `achievements:unlocked` del `/ws` de la cuenta: logros nuevos y récords personales batidos. */
export type AchievementFamily = 'GENERAL' | 'GAME' | 'SECRET';

export interface AchievementUnlock {
  id: string;
  family: AchievementFamily;
  gameId: string | null;
  name: string;
  description: string;
}

export interface PersonalRecord {
  gameId: string;
  key: string;
  label: string;
  value: number;
  previous: number;
}

export interface AchievementsUnlocked {
  achievements: AchievementUnlock[];
  records: PersonalRecord[];
}

/** Logros del catálogo (el catálogo vive en Java). */
export const ACHIEVEMENT_TOTAL = 48;
