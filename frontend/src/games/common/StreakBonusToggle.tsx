import { SPEED_PODIUM_MAX_STREAK_BONUS } from '@pokemon-universe/shared/public';
import { Toggle } from '../../ui';

/**
 * Ajuste «Rachas» de los juegos que puntúan por rapidez y podio (¿Quién es ese Pokémon?, Adivina el Grito y Adivina por
 * la Paleta). Apagado por defecto: encendido, cada acierto seguido suma +1 más que el anterior, hasta el tope.
 */
export function StreakBonusToggle({ checked, disabled, onChange }: { checked: boolean | undefined; disabled: boolean; onChange(streakBonus: boolean): void }) {
  return <Toggle label="Rachas" hint={`Cada acierto seguido suma +1 más, hasta +${SPEED_PODIUM_MAX_STREAK_BONUS}; fallar una ronda la corta.`} checked={checked === true} disabled={disabled} onChange={onChange} />;
}
