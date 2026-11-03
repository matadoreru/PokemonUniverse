import { type PokemonImpostorConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';

export function PokemonImpostorConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonImpostorConfig;
  return <fieldset disabled={disabled}>
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <ConfigRange label="Impostores" value={value.impostorCount} min={1} max={10} disabled={disabled} formatValue={(count) => (count === 1 ? '1 impostor' : `${count} impostores`)} hint="Debe haber más inocentes que impostores." onCommit={(impostorCount) => onChange({ ...value, impostorCount })} />
      <ConfigRange label="Tiempo por pista" value={value.clueSeconds} min={10} max={120} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} hint="Cada jugador dispone de su propio turno." onCommit={(clueSeconds) => onChange({ ...value, clueSeconds })} />
      <ConfigRange label="Tiempo de votación" value={value.voteSeconds} min={10} max={90} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(voteSeconds) => onChange({ ...value, voteSeconds })} />
    </div>
  </fieldset>;
}
