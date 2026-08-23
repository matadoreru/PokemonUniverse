import { GENERATIONS, type PokemonImpostorConfig } from '@pokemon-universe/shared';
import { Eye } from 'lucide-react';
import { ConfigRange } from '../../room/ConfigRange';

export function PokemonImpostorConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonImpostorConfig;
  function updateGeneration(generation: number) {
    const generations = value.generations.includes(generation)
      ? value.generations.filter((item) => item !== generation)
      : [...value.generations, generation];
    if (generations.length > 0) void onChange({ ...value, generations });
  }
  return <fieldset disabled={disabled}>
    <span className="label">Generaciones disponibles</span>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{GENERATIONS.map((generation) => <button type="button" key={generation} className={`rounded-xl border-2 px-2 py-2 font-extrabold transition ${value.generations.includes(generation) ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/45'}`} onClick={() => updateGeneration(generation)}>Gen {generation}</button>)}</div>
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div><span className="label flex items-center gap-2"><Eye size={16} /> Impostores</span><div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((count) => <button type="button" key={count} className={`rounded-xl border-2 py-2 font-extrabold ${value.impostorCount === count ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised'}`} onClick={() => void onChange({ ...value, impostorCount: count })}>{count}</button>)}</div><p className="mt-2 text-xs font-bold text-ink/45">2 necesitan 5 jugadores; 3 necesitan 7.</p></div>
      <ConfigRange label="Tiempo por pista" value={value.clueSeconds} min={10} max={45} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} hint="Cada jugador dispone de su propio turno." onCommit={(clueSeconds) => onChange({ ...value, clueSeconds })} />
      <ConfigRange label="Tiempo de votación" value={value.voteSeconds} min={10} max={90} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(voteSeconds) => onChange({ ...value, voteSeconds })} />
    </div>
  </fieldset>;
}
