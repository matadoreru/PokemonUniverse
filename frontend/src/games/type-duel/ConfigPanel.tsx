import { type TypeDuelConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import s from './ConfigPanel.module.css';

/**
 * Ajustes de Type Duel: generaciones y los tiempos de elegir tipo y de buscar, más el número de rondas, con `ConfigRange`
 * (el `Slider` del catálogo). El enfriamiento entre intentos fallidos lo fija el servidor.
 */
export function TypeDuelConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TypeDuelConfig;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} />
    <div className={s.ranges}>
      <ConfigRange label="Tiempo para elegir tipo" value={value.typeSelectSeconds} min={5} max={60} step={5} disabled={disabled} accent="electric" formatValue={(seconds) => `${seconds} segundos`} hint="Los dos tipos se revelan a la vez." onCommit={(typeSelectSeconds) => onChange({ ...value, typeSelectSeconds })} />
      <ConfigRange label="Tiempo para buscar" value={value.searchSeconds} min={10} max={60} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} hint="Tras un intento fallido, 1 segundo de espera." onCommit={(searchSeconds) => onChange({ ...value, searchSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={50} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
  </fieldset>;
}
