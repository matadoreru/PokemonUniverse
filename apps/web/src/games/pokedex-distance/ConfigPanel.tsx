import { GENERATIONS, type PokedexDistanceConfig } from '@pokemon-universe/shared';
import { ConfigRange } from '../../room/ConfigRange';

export function PokedexDistanceConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokedexDistanceConfig;
  function updateGeneration(generation: number) {
    const generations = value.generations.includes(generation) ? value.generations.filter((item) => item !== generation) : [...value.generations, generation];
    if (generations.length) void onChange({ ...value, generations });
  }
  return <fieldset disabled={disabled}><legend className="label">Generaciones disponibles</legend><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{GENERATIONS.map((generation) => <button type="button" key={generation} className={`rounded-xl border-2 px-2 py-2 font-extrabold transition ${value.generations.includes(generation) ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/45'}`} onClick={() => updateGeneration(generation)}>Gen {generation}</button>)}</div>
    <div className="mt-5 max-w-xl"><ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} /></div>
  </fieldset>;
}
