import { Flame } from 'lucide-react';
import { Chip, Icon } from '../../ui';
import { guessStreakLabel } from './presentation';

/**
 * «Racha ×N» en la placa de la ronda (`GameScreen` `meta`) para quien la lleva: solo en los juegos con rachas
 * (`streakBonus`) y desde el segundo acierto seguido. Sin racha, nada.
 */
export function GuessStreakChip({ streak }: { streak: number | null | undefined }) {
  const label = guessStreakLabel(streak);
  return label ? <Chip tone="warn" icon={<Icon icon={Flame} size={18} />}>{label}</Chip> : null;
}
