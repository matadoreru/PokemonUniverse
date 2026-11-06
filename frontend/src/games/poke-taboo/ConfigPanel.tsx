import type { PokeTabooConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { PublicAttemptsToggle } from '../../room/guess-kit/PublicAttemptsToggle';
import { Segmented, Toggle } from '../../ui';
import s from './ConfigPanel.module.css';

/** Los únicos tiempos por turno que admite el motor (`pokeTabooConfigSchema`): por eso un `Segmented` y no un deslizador. */
const roundTimes = [30, 45, 60, 90, 120] as const;

/**
 * Ajustes de Poké Taboo con los controles del catálogo: generaciones (el selector heredado, F9), tiempo por turno
 * (`Segmented` con los cinco valores del motor), vueltas (`ConfigRange` de 1 a 5) y formas regionales (`Toggle`), con
 * la nota de las variantes que aún no se incluyen.
 */
export function PokeTabooConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokeTabooConfig;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="El Pokémon secreto y todas las respuestas pertenecerán a este pool." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={s.pair}>
      <div className={s.field}>
        <span className={s.label}>Tiempo por turno</span>
        <Segmented label="Tiempo por turno" value={value.roundSeconds} options={roundTimes.map((seconds) => ({ value: seconds, label: `${seconds} s`, disabled }))} onChange={(roundSeconds) => void onChange({ ...value, roundSeconds })} />
        <p className={s.help}>Lo que tiene quien describe para que el grupo acierte; acertar antes da más puntos.</p>
      </div>
      <ConfigRange label="Vueltas" value={value.laps} min={1} max={5} disabled={disabled} formatValue={(laps) => (laps === 1 ? '1 vuelta' : `${laps} vueltas`)} hint="Cada jugador describe una vez por vuelta." onCommit={(laps) => onChange({ ...value, laps })} />
    </div>
    <Toggle label="Formas regionales" hint="La forma exacta será obligatoria al responder." checked={value.includeRegionalForms} disabled={disabled} onChange={(includeRegionalForms) => void onChange({ ...value, includeRegionalForms })} />
    <p className={s.note}>El catálogo actual admite de forma fiable las formas regionales. Mega, Gigamax y otras variantes no se incluyen hasta que el repositorio las normalice.</p>
    <PublicAttemptsToggle checked={value.publicAttempts} disabled={disabled} onChange={(publicAttempts) => void onChange({ ...value, publicAttempts })} />
  </fieldset>;
}
