import type { OddOneOutConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { PaceField } from '../common/PaceField';
import { roundsLabel, secondsLabel } from '../../lib/format';
import c from '../ConfigPanel.module.css';

/**
 * Ajustes de El Intruso con los controles del catálogo (sin modos): ritmo, generaciones de los Pokémon que salen,
 * número de rondas y tiempo por ronda (`ConfigRange`).
 */
export function OddOneOutConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as OddOneOutConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <PaceField gameId="odd-one-out" config={value} disabled={disabled} onChange={(next) => void onChange(next)} />
    <GenerationSelector selected={value.generations} label="Generaciones" description="Los cuatro Pokémon de cada ronda salen de estas generaciones." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={3} max={30} disabled={disabled} formatValue={roundsLabel} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} disabled={disabled} formatValue={secondsLabel} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
    </div>
  </fieldset>;
}
