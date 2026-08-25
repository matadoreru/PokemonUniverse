import { type PokemonImpostorConfig } from '@pokemon-universe/shared';
import { Eye } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';

export function PokemonImpostorConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonImpostorConfig;
  return <fieldset disabled={disabled}>
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div><span className="label flex items-center gap-2"><Eye size={16} /> Impostores</span><div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((count) => <button type="button" key={count} className={`rounded-xl border py-2 font-extrabold ${value.impostorCount === count ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised'}`} onClick={() => void onChange({ ...value, impostorCount: count })}>{count}</button>)}</div><p className="mt-2 text-xs font-bold text-ink/65">2 necesitan 5 jugadores; 3 necesitan 7.</p></div>
      <ConfigRange label="Tiempo por pista" value={value.clueSeconds} min={10} max={45} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} hint="Cada jugador dispone de su propio turno." onCommit={(clueSeconds) => onChange({ ...value, clueSeconds })} />
      <ConfigRange label="Tiempo de votación" value={value.voteSeconds} min={10} max={90} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(voteSeconds) => onChange({ ...value, voteSeconds })} />
    </div>
  </fieldset>;
}
