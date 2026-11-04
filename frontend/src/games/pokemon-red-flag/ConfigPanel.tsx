import type { PokemonRedFlagConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Segmented, Toggle } from '../../ui';
import s from './ConfigPanel.module.css';

const modes: Array<{ id: PokemonRedFlagConfig['mode']; title: string; detail: string }> = [
  { id: 'RED', title: 'Red Flag', detail: 'Algo negativo sobre el Pokémon.' },
  { id: 'GREEN', title: 'Green Flag', detail: 'Algo positivo sobre el Pokémon.' },
  { id: 'MIXED', title: '50/50 aleatorio', detail: 'El servidor sortea el modo cada ronda.' },
];

const seconds = (value: number) => `${value} segundos`;

/**
 * Ajustes de Pokémon Red Flag / Green Flag con los controles del catálogo: generaciones (el selector heredado, F9), modo
 * de respuestas (`Segmented`, con el detalle del elegido), rondas y tiempo por fase (`ConfigRange`) y formas alternativas
 * (`Toggle`).
 */
export function PokemonRedFlagConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonRedFlagConfig;
  const mode = modes.find((entry) => entry.id === value.mode) ?? modes[0]!;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones disponibles" description="El Pokémon protagonista de cada ronda se elige del pool configurado." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={s.field}>
      <span className={s.label}>Modo de respuestas</span>
      <Segmented label="Modo de respuestas" value={value.mode} options={modes.map((entry) => ({ value: entry.id, label: entry.title, disabled }))} onChange={(next) => void onChange({ ...value, mode: next })} />
      <p className={s.help}>{mode.detail} Define si el grupo busca una señal negativa, positiva o una sorpresa por ronda.</p>
    </div>
    <div className={s.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo por fase" value={value.phaseSeconds} min={15} max={120} disabled={disabled} formatValue={seconds} hint="Se aplica por separado a escribir, votar y, si hace falta, revotar." onCommit={(phaseSeconds) => onChange({ ...value, phaseSeconds })} />
    </div>
    <Toggle label="Incluir formas alternativas" hint="Las formas regionales y alternativas pueden protagonizar su propia ronda." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
  </fieldset>;
}
