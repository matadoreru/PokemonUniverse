import type { AbsurdPokedexConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { GameModeField } from '../../room/GameModeField';
import s from './ConfigPanel.module.css';

const seconds = (value: number) => `${value} segundos`;

/**
 * Ajustes de Pokédex Absurda con los controles del catálogo: modo (`GameModeField`), generaciones, rondas y los tiempos
 * de escritura y de votación (`ConfigRange`).
 */
export function AbsurdPokedexConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as AbsurdPokedexConfig;
  return <fieldset disabled={disabled} className={s.panel}>
    <GameModeField gameId="absurd-pokedex" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <GenerationSelector selected={value.generations} label="Generaciones disponibles" description="El Pokémon de cada ronda se elige del pool configurado." onChange={(generations) => void onChange({ ...value, generations })} />
    <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    <div className={s.pair}>
      <ConfigRange label="Tiempo para escribir" value={value.writeSeconds} min={30} max={120} disabled={disabled} formatValue={seconds} onCommit={(writeSeconds) => onChange({ ...value, writeSeconds })} />
      <ConfigRange label="Tiempo para votar" value={value.voteSeconds} min={15} max={60} disabled={disabled} formatValue={seconds} onCommit={(voteSeconds) => onChange({ ...value, voteSeconds })} />
    </div>
  </fieldset>;
}
