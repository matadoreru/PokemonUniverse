import { BINGO_FAMILY_KEYS, type BingoFamilyKey, type PokemonBingoConfig } from '@pokemon-universe/shared';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { bingoFamilyLabels, validatePokemonBingoConfig } from './validation';
export { validatePokemonBingoConfig } from './validation';

const groups: Array<{ title: string; keys: BingoFamilyKey[] }> = [
  { title: 'Básicas', keys: ['generation', 'dexNumber', 'type', 'typeCombination', 'typeCount'] },
  { title: 'Stats', keys: ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal'] },
  { title: 'Físicas y evolución', keys: ['height', 'weight', 'evolutionStage'] },
  { title: 'Otras', keys: ['legendaryStatus', 'color', 'abilities'] },
];
function Stepper({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange(value: number): void }) {
  return <div><span className="label">{label}</span><div className="grid grid-cols-[3rem_1fr_3rem] overflow-hidden rounded-2xl border border-ink/10 bg-surface-raised"><button type="button" className="min-h-12 text-xl font-black hover:bg-aqua/10 disabled:opacity-30" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button><strong className="grid place-items-center border-x-2 border-ink/10 font-display text-2xl">{value}</strong><button type="button" className="min-h-12 text-xl font-black hover:bg-aqua/10 disabled:opacity-30" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button></div></div>;
}

export function PokemonBingoConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonBingoConfig; const validation = validatePokemonBingoConfig(value);
  const toggleFamily = (key: BingoFamilyKey) => void onChange({ ...value, families: { ...value.families, [key]: !value.families[key] } });
  return <fieldset disabled={disabled} className="space-y-6">
    <div><span className="label">Tablero</span><div className="grid gap-3 sm:grid-cols-2"><Stepper label="Anchura" value={value.width} min={2} max={6} disabled={disabled} onChange={(width) => void onChange({ ...value, width })} /><Stepper label="Altura" value={value.height} min={2} max={6} disabled={disabled} onChange={(height) => void onChange({ ...value, height })} /></div><p className="mt-2 text-sm font-bold text-ink/65">{value.width} × {value.height} · {value.width * value.height} casillas</p></div>
    <ConfigRange label="Tiempo total" value={value.durationSeconds} min={60} max={300} step={30} disabled={disabled} formatValue={(seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} minutos`} onCommit={(durationSeconds) => onChange({ ...value, durationSeconds })} />
    <GenerationSelector selected={value.generations} label="Generaciones válidas" onChange={(generations) => void onChange({ ...value, generations })} />
    <div><div className="mb-3 flex items-end justify-between gap-2"><div><span className="label !mb-0">Familias de condiciones</span><p className="text-sm font-bold text-ink/65">Los valores numéricos se generan desde la distribución del pool.</p></div><span className="chip">{BINGO_FAMILY_KEYS.filter((key) => value.families[key]).length} activas</span></div><div className="grid gap-4 lg:grid-cols-2">{groups.map((group) => <section key={group.title} className="rounded-2xl border border-ink/10 bg-surface-raised p-3"><h3 className="mb-2 font-display text-lg">{group.title}</h3><div className="grid gap-2 sm:grid-cols-2">{group.keys.map((key) => <button type="button" key={key} aria-pressed={value.families[key]} onClick={() => toggleFamily(key)} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left font-extrabold ${value.families[key] ? 'border-leaf bg-leaf/10' : 'border-ink/10 bg-night/20 text-ink/65'}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-xs ${value.families[key] ? 'bg-leaf text-night' : 'bg-ink/10'}`}>{value.families[key] ? '✓' : ''}</span>{bingoFamilyLabels[key]}</button>)}</div></section>)}</div></div>
    <div><span className="label">Máximo de condiciones por casilla</span><div className="grid grid-cols-2 gap-2">{([1, 2] as const).map((count) => <button type="button" key={count} aria-pressed={value.maxConditionsPerCell === count} onClick={() => void onChange({ ...value, maxConditionsPerCell: count })} className={`min-h-12 rounded-2xl border font-extrabold ${value.maxConditionsPerCell === count ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised'}`}>{count} condición{count === 1 ? '' : 'es'}</button>)}</div><p className="mt-2 text-sm font-bold text-ink/65">Con máximo 2 se mantiene una mezcla de casillas simples y combinadas.</p></div>
    {validation && <p className="rounded-xl border border-berry/30 bg-berry/10 p-3 font-extrabold text-berry" role="alert">{validation}</p>}
  </fieldset>;
}
