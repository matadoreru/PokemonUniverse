import { GENERATIONS, type PokedexDistanceConfig } from '@pokemon-universe/shared';

export function PokedexDistanceConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokedexDistanceConfig;
  function updateGeneration(generation: number) {
    const generations = value.generations.includes(generation) ? value.generations.filter((item) => item !== generation) : [...value.generations, generation];
    if (generations.length) void onChange({ ...value, generations });
  }
  return <fieldset disabled={disabled}><legend className="label">Generaciones disponibles</legend><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{GENERATIONS.map((generation) => <button type="button" key={generation} className={`rounded-xl border-2 px-2 py-2 font-extrabold transition ${value.generations.includes(generation) ? 'border-ink bg-electric' : 'border-ink/10 bg-white text-ink/35'}`} onClick={() => updateGeneration(generation)}>Gen {generation}</button>)}</div>
    <label className="mt-5 block"><span className="label">Tiempo por ronda · {value.roundSeconds}s</span><input className="w-full accent-berry" type="range" min={10} max={60} step={5} value={value.roundSeconds} onChange={(event) => void onChange({ ...value, roundSeconds: Number(event.target.value) })} /></label>
  </fieldset>;
}
