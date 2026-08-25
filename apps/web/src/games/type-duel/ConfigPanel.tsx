import { type TypeDuelConfig } from '@pokemon-universe/shared';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';

export function TypeDuelConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TypeDuelConfig;
  return (
    <fieldset disabled={disabled} className="space-y-6">
      <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <ConfigRange label="Tiempo para elegir tipo" value={value.typeSelectSeconds} min={5} max={60} step={5} disabled={disabled} accent="electric" formatValue={(seconds) => `${seconds} segundos`} onCommit={(typeSelectSeconds) => onChange({ ...value, typeSelectSeconds })} />
        <ConfigRange label="Tiempo para buscar" value={value.searchSeconds} min={10} max={60} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} onCommit={(searchSeconds) => onChange({ ...value, searchSeconds })} />
        <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} />
      </div>
      <p className="text-sm font-bold text-ink/65">Cooldown autoritativo entre intentos incorrectos: 1 segundo.</p>
    </fieldset>
  );
}
