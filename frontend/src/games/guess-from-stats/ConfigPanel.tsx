import type { GuessFromStatsConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Chip, Toggle } from '../../ui';
import s from './ConfigPanel.module.css';
export { validateGuessFromStatsConfig } from './validation';

const STATS_LABEL = 'Stats mostradas';
const HINT_KINDS_LABEL = 'Qué pistas salen';
const statOptions: Array<{ key: keyof GuessFromStatsConfig['stats']; label: string }> = [
  { key: 'hp', label: 'PS' }, { key: 'attack', label: 'Ataque' }, { key: 'defense', label: 'Defensa' }, { key: 'specialAttack', label: 'At. Especial' }, { key: 'specialDefense', label: 'Def. Especial' }, { key: 'speed', label: 'Velocidad' }, { key: 'bst', label: 'Total de Stats (BST)' },
];
const hintOptions: Array<{ key: keyof GuessFromStatsConfig['hints']; label: string }> = [
  { key: 'generation', label: 'Generación' }, { key: 'types', label: 'Tipos' }, { key: 'typeCount', label: 'Nº de tipos' }, { key: 'evolution', label: 'Etapa evolutiva' }, { key: 'height', label: 'Altura' }, { key: 'weight', label: 'Peso' }, { key: 'category', label: 'Legendario / Mítico' },
];

/**
 * Ajustes de Guess from Stats con los controles del catálogo: generaciones, los tiempos (`ConfigRange`, en los límites
 * del contrato: 15–60 s y 1–20 rondas), qué estadísticas se ven (`Toggle`, al menos 2, con su cuenta en un `Chip`) y
 * las pistas adicionales con sus tipos.
 */
export function GuessFromStatsConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as GuessFromStatsConfig;
  const update = (next: Partial<GuessFromStatsConfig>) => void onChange({ ...value, ...next });
  const statCount = Object.values(value.stats).filter(Boolean).length;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones del pool" onChange={(generations) => update({ generations })} />
    <div className={s.ranges}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={15} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} hint="Cuanto antes aciertes, más puntos; tras un fallo hay una breve espera." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
    <div className={s.group} role="group" aria-label={STATS_LABEL}>
      <div className={s.head}>
        <span className={s.label} aria-hidden="true">{STATS_LABEL}</span>
        <Chip tone={statCount < 2 ? 'bad' : 'ok'}>{statCount} activas</Chip>
      </div>
      <p className={s.help}>Los valores visibles definen todas las respuestas correctas.</p>
      <div className={s.kinds}>{statOptions.map((stat) => <Toggle key={stat.key} label={stat.label} checked={value.stats[stat.key]} disabled={disabled} onChange={(on) => update({ stats: { ...value.stats, [stat.key]: on } })} />)}</div>
      {statCount < 2 && <p className={s.note} role="alert">Selecciona al menos 2 estadísticas.</p>}
    </div>
    <Toggle label="Pistas adicionales" hint={value.hintsEnabled ? 'También forman parte de la equivalencia.' : 'Solo se mostrarán las stats seleccionadas.'} checked={value.hintsEnabled} disabled={disabled} onChange={(hintsEnabled) => update({ hintsEnabled })} />
    {value.hintsEnabled && <div className={s.group} role="group" aria-label={HINT_KINDS_LABEL}>
      <span className={s.label} aria-hidden="true">{HINT_KINDS_LABEL}</span>
      <div className={s.kinds}>{hintOptions.map((hint) => <Toggle key={hint.key} label={hint.label} checked={value.hints[hint.key]} disabled={disabled} onChange={(on) => update({ hints: { ...value.hints, [hint.key]: on } })} />)}</div>
    </div>}
    <p className={s.note}>Las formas con ID y Base Stats propios participan. Si dos formas son indistinguibles por la información pública, ambas se aceptan.</p>
  </fieldset>;
}
