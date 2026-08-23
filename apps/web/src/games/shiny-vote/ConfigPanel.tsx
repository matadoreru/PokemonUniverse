import { GENERATIONS, type ShinyVoteConfig } from '@pokemon-universe/shared';

export function ShinyVoteConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as ShinyVoteConfig;
  function updateGeneration(generation: number) {
    const generations = value.generations.includes(generation)
      ? value.generations.filter((item) => item !== generation)
      : [...value.generations, generation];
    if (generations.length > 0) void onChange({ ...value, generations });
  }
  return <fieldset disabled={disabled}>
    <legend className="label">Generaciones disponibles</legend>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{GENERATIONS.map((generation) => <button type="button" key={generation} className={`rounded-xl border-2 px-2 py-2 font-extrabold transition ${value.generations.includes(generation) ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/45'}`} onClick={() => updateGeneration(generation)}>Gen {generation}</button>)}</div>
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <label><span className="label">Tiempo por ronda · {value.roundSeconds}s</span><input className="w-full accent-berry" type="range" min={10} max={60} step={5} value={value.roundSeconds} onChange={(event) => void onChange({ ...value, roundSeconds: Number(event.target.value) })} /></label>
      <label><span className="label">Número de rondas · {value.rounds}</span><input className="w-full accent-berry" type="range" min={1} max={20} step={1} value={value.rounds} onChange={(event) => void onChange({ ...value, rounds: Number(event.target.value) })} /></label>
    </div>
  </fieldset>;
}
