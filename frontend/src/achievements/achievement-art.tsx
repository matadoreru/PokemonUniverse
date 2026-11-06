import type { AchievementUnlock } from '@pokemon-universe/shared/public';
import { Medal, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { GameArt } from '../games/GameArt';
import { Icon } from '../ui';

/** Ilustración de un logro: el arte del minijuego si es de uno, chispas si es secreto y una medalla si es general. */
export function achievementArt(unlock: Pick<AchievementUnlock, 'family' | 'gameId'>): ReactNode {
  if (unlock.gameId) return <GameArt gameId={unlock.gameId} />;
  return <Icon icon={unlock.family === 'SECRET' ? Sparkles : Medal} size={32} />;
}
