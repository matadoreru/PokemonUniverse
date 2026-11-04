import { type PokemonImpostorConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import s from './ConfigPanel.module.css';

/**
 * Ajustes de Pokémon Impostor: generaciones, impostores (con el mínimo de jugadores que piden) y los tiempos de pista y
 * de votación, con `ConfigRange` (el `Slider` del catálogo).
 */
export function PokemonImpostorConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonImpostorConfig;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <div className={s.ranges}>
      <ConfigRange label="Impostores" value={value.impostorCount} min={1} max={10} disabled={disabled} formatValue={(count) => (count === 1 ? '1 impostor' : `${count} impostores`)} hint={`Con ${value.impostorCount === 1 ? '1 impostor' : `${value.impostorCount} impostores`} hacen falta al menos ${value.impostorCount * 2 + 1} jugadores.`} onCommit={(impostorCount) => onChange({ ...value, impostorCount })} />
      <ConfigRange label="Tiempo por pista" value={value.clueSeconds} min={10} max={120} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} hint="Cada jugador dispone de su propio turno." onCommit={(clueSeconds) => onChange({ ...value, clueSeconds })} />
      <ConfigRange label="Tiempo de votación" value={value.voteSeconds} min={10} max={90} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(voteSeconds) => onChange({ ...value, voteSeconds })} />
    </div>
  </fieldset>;
}
