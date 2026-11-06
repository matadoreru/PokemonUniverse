import type { PokemonCryQuizConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { PublicAttemptsToggle } from '../../room/guess-kit/PublicAttemptsToggle';
import { Segmented, Toggle } from '../../ui';
import s from './ConfigPanel.module.css';

const VERSION_LABEL = 'Versión del grito';
const versions: Array<{ value: PokemonCryQuizConfig['cryVersion']; label: string; detail: string }> = [
  { value: 'LATEST', label: 'Actual', detail: 'El grito moderno de cada Pokémon.' },
  { value: 'LEGACY', label: 'Clásico', detail: 'La versión histórica del grito, si existe.' },
  { value: 'RANDOM', label: 'Aleatorio', detail: 'Cada ronda, una de las versiones disponibles.' },
];

/**
 * Ajustes de Adivina el Grito con los controles del catálogo: generaciones, versión del grito (`Segmented`), formas
 * regionales (`Toggle`) y los tiempos (`ConfigRange`, en los límites del contrato: 10–60 s y 1–20 rondas).
 */
export function PokemonCryQuizConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonCryQuizConfig;
  const update = (next: Partial<PokemonCryQuizConfig>) => void onChange({ ...value, ...next });
  const version = versions.find((option) => option.value === value.cryVersion) ?? versions[0]!;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="Solo entrarán Pokémon con un grito persistido en el catálogo local." onChange={(generations) => update({ generations })} />
    <div className={s.group}>
      <span className={s.label} aria-hidden="true">{VERSION_LABEL}</span>
      <Segmented<PokemonCryQuizConfig['cryVersion']> label={VERSION_LABEL} value={value.cryVersion} options={versions.map((option) => ({ value: option.value, label: option.label, disabled }))} onChange={(cryVersion) => update({ cryVersion })} />
      <p className={s.help}>{version.detail}</p>
    </div>
    <Toggle label="Formas regionales" hint="Incluye únicamente formas con grito propio disponible." checked={value.includeRegionalForms} disabled={disabled} onChange={(includeRegionalForms) => update({ includeRegionalForms })} />
    <div className={s.ranges}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} hint="Cuanto antes aciertes, más puntos; tras un fallo hay una breve espera." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
    <PublicAttemptsToggle checked={value.publicAttempts} disabled={disabled} onChange={(publicAttempts) => void onChange({ ...value, publicAttempts })} />
  </fieldset>;
}
