import { POKEDEX_DISTANCE_SELECTION_VISIBILITIES, type PokedexDistanceConfig, type PokedexDistanceSelectionVisibility } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { LIVE_VISIBILITY_WARNING } from '../../room/live-visibility';
import { DISTANCE_SELECTION_VISIBILITY_LABEL, distanceSelectionVisibilityLabels } from '../../room/pokedex-distance-selection';
import { Segmented } from '../../ui';
import s from './ConfigPanel.module.css';

/**
 * Ajustes de Pokédex Distance: generaciones, si las elecciones de los rivales se ven al momento (`Segmented`, con el
 * aviso de copia en «Visibles») y el tiempo por ronda (`ConfigRange`, el `Slider` del catálogo).
 */
export function PokedexDistanceConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokedexDistanceConfig;
  const options = POKEDEX_DISTANCE_SELECTION_VISIBILITIES.map((visibility) => ({ value: visibility, label: distanceSelectionVisibilityLabels[visibility], disabled }));
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <div className={s.group}>
      <span className={s.label} aria-hidden="true">{DISTANCE_SELECTION_VISIBILITY_LABEL}</span>
      <Segmented<PokedexDistanceSelectionVisibility> label={DISTANCE_SELECTION_VISIBILITY_LABEL} value={value.selectionVisibility} options={options} onChange={(selectionVisibility) => void onChange({ ...value, selectionVisibility })} />
      {value.selectionVisibility === 'LIVE' && <p className={s.warning}>{LIVE_VISIBILITY_WARNING}</p>}
    </div>
    <div className={s.group}><ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} /></div>
  </fieldset>;
}
