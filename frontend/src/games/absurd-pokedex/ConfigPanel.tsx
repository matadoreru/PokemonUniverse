import type { AbsurdPokedexConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { GameModeField } from '../common/GameModeField';
import { roundsLabel, secondsLabel } from '../../lib/format';
import c from '../ConfigPanel.module.css';

/**
 * Ajustes de Pokédex Absurda con los controles del catálogo: modo (`GameModeField`), generaciones, rondas y los tiempos
 * de escritura y de votación (`ConfigRange`).
 */
export function AbsurdPokedexConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as AbsurdPokedexConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <GameModeField gameId="absurd-pokedex" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <GenerationSelector selected={value.generations} label="Generaciones disponibles" description="El Pokémon de cada ronda se elige del pool configurado." onChange={(generations) => void onChange({ ...value, generations })} />
    <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={roundsLabel} onCommit={(rounds) => onChange({ ...value, rounds })} />
    <div className={c.pair}>
      <ConfigRange label="Tiempo para escribir" value={value.writeSeconds} min={30} max={120} disabled={disabled} formatValue={secondsLabel} onCommit={(writeSeconds) => onChange({ ...value, writeSeconds })} />
      <ConfigRange label="Tiempo para votar" value={value.voteSeconds} min={15} max={60} disabled={disabled} formatValue={secondsLabel} onCommit={(voteSeconds) => onChange({ ...value, voteSeconds })} />
    </div>
  </fieldset>;
}
