import { POKEDEX_DISTANCE_SELECTION_VISIBILITIES, type PokedexDistanceConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { LIVE_VISIBILITY_WARNING } from '../../room/live-visibility';
import { DISTANCE_SELECTION_VISIBILITY_LABEL, distanceSelectionVisibilityLabels } from '../../room/pokedex-distance-selection';

export function PokedexDistanceConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokedexDistanceConfig;
  return <fieldset disabled={disabled}><GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <div className="mt-5 max-w-xl">
      <span className="label">{DISTANCE_SELECTION_VISIBILITY_LABEL}</span>
      <div className="grid grid-cols-2 gap-2">{POKEDEX_DISTANCE_SELECTION_VISIBILITIES.map((visibility) => <button type="button" key={visibility} aria-pressed={value.selectionVisibility === visibility} className={`rounded-xl border px-3 py-3 font-extrabold transition ${value.selectionVisibility === visibility ? 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised text-ink/70'}`} onClick={() => void onChange({ ...value, selectionVisibility: visibility })}>{distanceSelectionVisibilityLabels[visibility]}</button>)}</div>
      {value.selectionVisibility === 'LIVE' && <p className="mt-2 text-sm font-bold text-ink/65">{LIVE_VISIBILITY_WARNING}</p>}
    </div>
    <div className="mt-5 max-w-xl"><ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} /></div>
  </fieldset>;
}
