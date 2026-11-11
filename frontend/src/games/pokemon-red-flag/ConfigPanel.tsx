import type { PokemonRedFlagConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Segmented, Toggle } from '../../ui';
import s from './ConfigPanel.module.css';

const modes: Array<{ id: PokemonRedFlagConfig['mode']; title: string; detail: string }> = [
  { id: 'RED', title: 'Lo peor', detail: 'La frase muestra su lado malo.' },
  { id: 'GREEN', title: 'Lo mejor', detail: 'La frase muestra su lado bueno.' },
  { id: 'MIXED', title: 'Mixto', detail: 'Cada ronda, lo peor o lo mejor.' },
];

const seconds = (value: number) => `${value} segundos`;

/**
 * Ajustes de La Frase Pokémon con los controles del catálogo: generaciones (el selector heredado, F9), tono
 * de las frases (`Segmented`, con el detalle del elegido), rondas y tiempo por fase (`ConfigRange`) y formas alternativas
 * (`Toggle`).
 */
export function PokemonRedFlagConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonRedFlagConfig;
  const mode = modes.find((entry) => entry.id === value.mode) ?? modes[0]!;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones disponibles" description="El Pokémon protagonista de cada ronda se elige del pool configurado." onChange={(generations) => void onChange({ ...value, generations })} />
    <Segmented label="Tono de las frases" showLabel hint={`${mode.detail} Define si las frases buscan el lado malo, el bueno o una sorpresa por ronda.`} value={value.mode} options={modes.map((entry) => ({ value: entry.id, label: entry.title, disabled }))} onChange={(next) => void onChange({ ...value, mode: next })} />
    <div className={s.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo por fase" value={value.phaseSeconds} min={15} max={120} disabled={disabled} formatValue={seconds} hint="Se aplica por separado a escribir, votar y, si hace falta, revotar." onCommit={(phaseSeconds) => onChange({ ...value, phaseSeconds })} />
    </div>
    <Toggle label="Incluir formas alternativas" hint="Las formas regionales y alternativas pueden protagonizar su propia ronda." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
  </fieldset>;
}
