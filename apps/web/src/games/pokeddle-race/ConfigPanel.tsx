import { POKEDDLE_CLUE_KEYS, type PokeddleClueKey, type PokeddleRaceConfig } from '@pokemon-universe/shared';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { validatePokeddleConfig } from './validation';
export { validatePokeddleConfig } from './validation';

const groups: Array<{ title: string; keys: PokeddleClueKey[] }> = [
  { title: 'Básicas', keys: ['generation', 'dexNumber', 'types', 'typeCount'] },
  { title: 'Stats', keys: ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal'] },
  { title: 'Físico', keys: ['height', 'weight'] },
  { title: 'Otros', keys: ['evolutionStage', 'legendaryStatus', 'color', 'abilities'] },
];
const labels: Record<PokeddleClueKey, string> = {
  generation: 'Generación', dexNumber: 'N.º Pokédex', types: 'Tipos', typeCount: 'Número de tipos', hp: 'HP', attack: 'Ataque', defense: 'Defensa', specialAttack: 'At. Especial', specialDefense: 'Def. Especial', speed: 'Velocidad', baseStatTotal: 'Total stats', height: 'Altura', weight: 'Peso', evolutionStage: 'Etapa evolutiva', legendaryStatus: 'Legendario / Mítico', color: 'Color oficial', abilities: 'Habilidades',
};

export function PokeddleRaceConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokeddleRaceConfig; const validation = validatePokeddleConfig(value);
  function toggleClue(key: PokeddleClueKey) { void onChange({ ...value, clues: { ...value.clues, [key]: !value.clues[key] } }); }
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector selected={value.generations} label="Generaciones del pool" onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="grid gap-4 md:grid-cols-2"><ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} /><ConfigRange label="Máximo de rondas" value={value.maxRounds} min={5} max={15} disabled={disabled} accent="aqua" formatValue={(rounds) => `${rounds} rondas`} onCommit={(maxRounds) => onChange({ ...value, maxRounds })} /></div>
    <div><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><span className="label !mb-0">Pistas</span><p className="text-sm font-bold text-ink/65">Las pistas desactivadas no se calculan ni aparecen en los tableros.</p></div><span className="chip">{POKEDDLE_CLUE_KEYS.filter((key) => value.clues[key]).length} activas</span></div>
      <div className="grid gap-4 lg:grid-cols-2">{groups.map((group) => <section key={group.title} className="rounded-2xl border border-ink/10 bg-surface-raised p-3"><h3 className="mb-2 font-display text-lg font-bold">{group.title}</h3><div className="grid gap-2 sm:grid-cols-2">{group.keys.map((key) => <button type="button" key={key} aria-pressed={value.clues[key]} onClick={() => toggleClue(key)} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left font-extrabold ${value.clues[key] ? 'border-leaf bg-leaf/10 text-ink' : 'border-ink/10 bg-night/20 text-ink/65'}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-xs ${value.clues[key] ? 'bg-leaf text-night' : 'bg-ink/10'}`}>{value.clues[key] ? '✓' : ''}</span>{labels[key]}</button>)}</div></section>)}</div>
      {validation && <p className="mt-3 rounded-xl border border-berry/30 bg-berry/10 p-3 font-extrabold text-berry" role="alert">{validation}</p>}
    </div>
  </fieldset>;
}
