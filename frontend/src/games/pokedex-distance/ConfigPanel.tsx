import { POKEDEX_DISTANCE_POINTS_ROUNDS_RANGE, POKEDEX_DISTANCE_SELECTION_VISIBILITIES, type PokedexDistanceConfig, type PokedexDistanceSelectionVisibility } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { GameModeField, useModeShown } from '../../room/GameModeField';
import { LIVE_VISIBILITY_WARNING } from '../../room/live-visibility';
import { DISTANCE_SELECTION_VISIBILITY_LABEL, distanceSelectionVisibilityLabels } from '../../room/pokedex-distance-selection';
import { Segmented } from '../../ui';
import c from '../ConfigPanel.module.css';
import s from './ConfigPanel.module.css';

/**
 * Ajustes de Pokédex Distance: el modo (`GameModeField`; «Por puntos» añade el número de rondas), generaciones, si las elecciones de los rivales se ven al momento (`Segmented`, con el
 * aviso de copia en «Visibles») y el tiempo por ronda (`ConfigRange`, el `Slider` del catálogo).
 */
export function PokedexDistanceConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokedexDistanceConfig;
  const shown = useModeShown('pokedex-distance', value.mode);
  const options = POKEDEX_DISTANCE_SELECTION_VISIBILITIES.map((visibility) => ({ value: visibility, label: distanceSelectionVisibilityLabels[visibility], disabled }));
  return <fieldset disabled={disabled} className={c.panelLoose}>
    <GameModeField gameId="pokedex-distance" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <Segmented<PokedexDistanceSelectionVisibility> label={DISTANCE_SELECTION_VISIBILITY_LABEL} showLabel hint={value.selectionVisibility === 'LIVE' ? LIVE_VISIBILITY_WARNING : undefined} className={s.group ?? ''} value={value.selectionVisibility} options={options} onChange={(selectionVisibility) => void onChange({ ...value, selectionVisibility })} />
    <div className={s.group}><ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} /></div>
    {shown('POINTS') && <div className={s.group}><ConfigRange label="Número de rondas" value={value.pointsRounds} min={POKEDEX_DISTANCE_POINTS_ROUNDS_RANGE.min} max={POKEDEX_DISTANCE_POINTS_ROUNDS_RANGE.max} disabled={disabled} formatValue={(rounds) => `${rounds} rondas`} onCommit={(pointsRounds) => onChange({ ...value, pointsRounds })} /></div>}
  </fieldset>;
}
