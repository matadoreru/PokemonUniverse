import { GENERATIONS, type TypeDuelConfig } from '@pokemon-universe/shared';
import { ConfigRange } from '../../room/ConfigRange';

export function TypeDuelConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TypeDuelConfig;
  const toggleGeneration = (generation: number) => {
    const generations = value.generations.includes(generation)
      ? value.generations.filter((item) => item !== generation)
      : [...value.generations, generation];
    if (generations.length) void onChange({ ...value, generations });
  };

  return (
    <fieldset disabled={disabled} className="space-y-6">
      <div>
        <span className="label">Generaciones</span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {GENERATIONS.map((generation) => (
            <button type="button" key={generation} onClick={() => toggleGeneration(generation)} className={`min-h-11 rounded-xl border-2 py-2 font-bold ${value.generations.includes(generation) ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised'}`}>
              Gen {generation}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <ConfigRange label="Tiempo para elegir tipo" value={value.typeSelectSeconds} min={5} max={60} step={5} disabled={disabled} accent="electric" formatValue={(seconds) => `${seconds} segundos`} onCommit={(typeSelectSeconds) => onChange({ ...value, typeSelectSeconds })} />
        <ConfigRange label="Tiempo para buscar" value={value.searchSeconds} min={10} max={60} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} onCommit={(searchSeconds) => onChange({ ...value, searchSeconds })} />
        <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} />
      </div>
      <p className="text-sm font-bold text-ink/45">Cooldown autoritativo entre intentos incorrectos: 1 segundo.</p>
    </fieldset>
  );
}
