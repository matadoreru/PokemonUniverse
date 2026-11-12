import { type PokemonImpostorConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { GameModeField } from '../common/GameModeField';
import { secondsLabel } from '../../lib/format';
import c from '../ConfigPanel.module.css';
import { PaceField } from '../common/PaceField';

/**
 * Ajustes de Pokémon Impostor: el modo (`GameModeField`), generaciones, impostores (con el mínimo de jugadores que piden) y los tiempos de pista y
 * de votación, con `ConfigRange` (el `Slider` del catálogo).
 */
export function PokemonImpostorConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonImpostorConfig;
  return <fieldset disabled={disabled} className={c.panelLoose}>
    <PaceField gameId="pokemon-impostor" config={value} disabled={disabled} onChange={(next) => void onChange(next)} />
    <GameModeField gameId="pokemon-impostor" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <div className={c.pair}>
      <ConfigRange label="Impostores" value={value.impostorCount} min={1} max={10} disabled={disabled} formatValue={(count) => (count === 1 ? '1 impostor' : `${count} impostores`)} hint={`Con ${value.impostorCount === 1 ? '1 impostor' : `${value.impostorCount} impostores`} hacen falta al menos ${value.impostorCount * 2 + 1} jugadores.`} onCommit={(impostorCount) => onChange({ ...value, impostorCount })} />
      <ConfigRange label="Tiempo por pista" value={value.clueSeconds} min={10} max={120} step={5} disabled={disabled} formatValue={secondsLabel} hint="Cada jugador dispone de su propio turno." onCommit={(clueSeconds) => onChange({ ...value, clueSeconds })} />
      <ConfigRange label="Tiempo de votación" value={value.voteSeconds} min={10} max={90} step={5} disabled={disabled} formatValue={secondsLabel} onCommit={(voteSeconds) => onChange({ ...value, voteSeconds })} />
    </div>
  </fieldset>;
}
