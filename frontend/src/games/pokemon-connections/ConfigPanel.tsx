import type { PokemonConnectionsConfig } from '@pokemon-universe/shared/public';
import { Lightbulb } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { Icon, Segmented } from '../../ui';
import { CONNECTIONS_TIME, connectionsSnapSeconds, connectionsTimeLabel } from './presentation';
import c from '../ConfigPanel.module.css';
import s from './ConfigPanel.module.css';
import { PaceField } from '../common/PaceField';

const groupSizes = [3, 4, 5] as const;
const groupCounts = [3, 4, 5] as const;

/**
 * Ajustes de Pokémon Connections con los controles del catálogo: generaciones, Pokémon por grupo y tamaño del tablero
 * (`Segmented`; el tablero siempre forma grupos completos), errores permitidos, tiempo por puzle y número de puzles
 * (`ConfigRange`, con todo el rango del contrato).
 */
export function PokemonConnectionsConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonConnectionsConfig;
  const groupCount = Math.min(5, Math.max(3, Math.round(value.pokemonCount / value.groupSize)));
  return <fieldset disabled={disabled} className={c.panel}>
    <PaceField gameId="pokemon-connections" config={value} disabled={disabled} onChange={(next) => void onChange(next)} />
    <GenerationSelector selected={value.generations} label="Generaciones del tablero" description="Cada puzle se genera al azar solo con Pokémon de estas generaciones." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <Segmented label="Pokémon por grupo" showLabel value={value.groupSize} options={groupSizes.map((size) => ({ value: size, label: String(size), disabled }))}
        onChange={(groupSize) => void onChange({ ...value, groupSize, pokemonCount: groupSize * groupCount })} />
      <Segmented label="Total del tablero" showLabel value={value.pokemonCount} options={groupCounts.map((count) => ({ value: count * value.groupSize, label: `${count * value.groupSize} (${count} grupos)`, disabled }))}
        onChange={(pokemonCount) => void onChange({ ...value, pokemonCount })} />
    </div>
    <div className={c.pair}>
      <ConfigRange label="Errores permitidos" value={value.mistakesAllowed} min={1} max={10} disabled={disabled} formatValue={(mistakes) => (mistakes === 1 ? '1 error' : `${mistakes} errores`)} onCommit={(mistakesAllowed) => onChange({ ...value, mistakesAllowed })} />
      <ConfigRange label="Tiempo por puzle" value={connectionsSnapSeconds(value.roundSeconds)} min={CONNECTIONS_TIME.min} max={CONNECTIONS_TIME.max} step={CONNECTIONS_TIME.step} disabled={disabled} formatValue={connectionsTimeLabel} hint="El puzle se cierra antes si todos terminan." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
    </div>
    <ConfigRange label="Número de puzles" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 puzle' : `${rounds} puzles`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    <p className={s.note}><Icon icon={Lightbulb} size={22} /> Un intento con todos menos uno del mismo grupo mostrará «Te falta uno».</p>
  </fieldset>;
}
