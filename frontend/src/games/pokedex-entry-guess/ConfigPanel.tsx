import type { PokedexEntryGuessConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { PublicAttemptsToggle } from '../../room/guess-kit/PublicAttemptsToggle';
import { Toggle } from '../../ui';
import s from './ConfigPanel.module.css';

const HINT_KINDS_LABEL = 'Qué pistas salen';
const hintOptions: Array<{ key: keyof PokedexEntryGuessConfig['hints']; label: string }> = [
  { key: 'generation', label: 'Generación' }, { key: 'type', label: 'Tipo' }, { key: 'evolution', label: 'Etapa evolutiva' },
  { key: 'typeCount', label: 'Nº de tipos' }, { key: 'category', label: 'Legendario / Mítico' },
];

/**
 * Ajustes de Pokédex Entry Guess con los controles del catálogo: generaciones (y la de referencia de la entrada, en
 * una nota), los tiempos (`ConfigRange`, en los límites del contrato: 15–60 s y 1–20 rondas) y las pistas adicionales
 * con sus tipos (`Toggle`; siempre queda al menos uno).
 */
export function PokedexEntryGuessConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokedexEntryGuessConfig;
  const update = (next: Partial<PokedexEntryGuessConfig>) => void onChange({ ...value, ...next });
  function toggleHint(key: keyof PokedexEntryGuessConfig['hints'], on: boolean) {
    const hints = { ...value.hints, [key]: on };
    if (Object.values(hints).some(Boolean)) update({ hints });
  }
  const reference = Math.max(...value.generations);
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones del objetivo" onChange={(generations) => update({ generations })} />
    <p className={s.note}><strong>Generación de referencia: {reference}</strong>Se prioriza una entrada de esta generación o la más reciente anterior. Si aún no existía en español, como ocurre en Gen 1 y 2, se usa la primera posterior disponible.</p>
    <div className={s.ranges}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={15} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} hint="Cuanto antes aciertes, más puntos; tras un fallo hay una breve espera." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
    <Toggle label="Pistas adicionales" hint={value.hintsEnabled ? 'Visibles desde el inicio de cada ronda.' : 'Solo se mostrará la entrada Pokédex.'} checked={value.hintsEnabled} disabled={disabled} onChange={(hintsEnabled) => update({ hintsEnabled })} />
    {value.hintsEnabled && <div className={s.group} role="group" aria-label={HINT_KINDS_LABEL}>
      <span className={s.label} aria-hidden="true">{HINT_KINDS_LABEL}</span>
      <div className={s.kinds}>{hintOptions.map((hint) => <Toggle key={hint.key} label={hint.label} checked={value.hints[hint.key]} disabled={disabled} onChange={(on) => toggleHint(hint.key, on)} />)}</div>
    </div>}
    <p className={s.note}>Solo se usan formas base: el dataset actual no ofrece entradas españolas propias y distinguibles para regionales o Gigamax.</p>
    <PublicAttemptsToggle checked={value.publicAttempts} disabled={disabled} onChange={(publicAttempts) => void onChange({ ...value, publicAttempts })} />
  </fieldset>;
}
