import { BINGO_FAMILY_KEYS, bingoFamilyLabels, validateGameConfigReadiness, type BingoFamilyKey, type PokemonBingoConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Chip, Segmented, Toggle } from '../../ui';
import { bingoClock } from './presentation';
import s from './ConfigPanel.module.css';

const groups: Array<{ title: string; keys: BingoFamilyKey[] }> = [
  { title: 'Básicas', keys: ['generation', 'dexNumber', 'type', 'typeCombination', 'typeCount'] },
  { title: 'Stats', keys: ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal'] },
  { title: 'Físicas y evolución', keys: ['height', 'weight', 'evolutionStage'] },
  { title: 'Otras', keys: ['legendaryStatus', 'color', 'abilities'] },
];
/** Lados del tablero que admite el contrato (2–6). */
const SIDES = [2, 3, 4, 5, 6] as const;

/**
 * Ajustes de Pokémon Bingo con los controles del catálogo: anchura y altura del tablero (`Segmented`, 2–6), el tiempo
 * total (`ConfigRange`, 1–5 minutos), las generaciones, qué familias de condiciones se usan (`Toggle` por familia en sus
 * grupos, con la cuenta en un `Chip`; al menos una) y cuántas condiciones puede tener una casilla (`Segmented`).
 */
export function PokemonBingoConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonBingoConfig; const validation = validateGameConfigReadiness('pokemon-bingo', value);
  const active = BINGO_FAMILY_KEYS.filter((key) => value.families[key]).length;
  const side = (key: 'width' | 'height', label: string) => <Segmented label={label} showLabel value={value[key]} options={SIDES.map((size) => ({ value: size, label: String(size), disabled }))} onChange={(size) => void onChange({ ...value, [key]: size })} />;
  return <fieldset disabled={disabled} className={s.panel}>
    <div className={s.pair}>
      {side('width', 'Anchura del tablero')}
      {side('height', 'Altura del tablero')}
    </div>
    <p className={s.help}>{value.width} × {value.height} · {value.width * value.height} casillas</p>
    <ConfigRange label="Tiempo total" value={value.durationSeconds} min={60} max={300} step={30} disabled={disabled} formatValue={(seconds) => `${bingoClock(seconds * 1_000)} minutos`} onCommit={(durationSeconds) => onChange({ ...value, durationSeconds })} />
    <GenerationSelector selected={value.generations} label="Generaciones válidas" onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={s.head}>
      <span className={s.label}>Familias de condiciones</span>
      <Chip tone={active === 0 ? 'bad' : 'ok'}>{active} activas</Chip>
    </div>
    <p className={s.help}>Los valores numéricos se generan desde la distribución del pool.</p>
    <div className={s.groups}>{groups.map((group) => <div key={group.title} className={s.group} role="group" aria-label={`Familias: ${group.title}`}>
      <span className={s.label} aria-hidden="true">{group.title}</span>
      <div className={s.kinds}>{group.keys.map((key) => <Toggle key={key} label={bingoFamilyLabels[key]} checked={value.families[key]} disabled={disabled} onChange={(on) => void onChange({ ...value, families: { ...value.families, [key]: on } })} />)}</div>
    </div>)}</div>
    <Segmented label="Máximo de condiciones por casilla" showLabel hint="Con máximo 2 se mantiene una mezcla de casillas simples y combinadas." value={value.maxConditionsPerCell} options={([1, 2] as const).map((count) => ({ value: count, label: count === 1 ? '1 condición' : '2 condiciones', disabled }))} onChange={(maxConditionsPerCell) => void onChange({ ...value, maxConditionsPerCell })} />
    {validation && <p className={s.note} role="alert">{validation}</p>}
  </fieldset>;
}
