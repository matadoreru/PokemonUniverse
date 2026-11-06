import { TYPE_DUEL_COOP_SECONDS_RANGE, type TypeDuelConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { GameModeField } from '../../room/GameModeField';
import s from './ConfigPanel.module.css';

/**
 * Ajustes de Type Duel: el modo (`GameModeField`), generaciones y los tiempos de elegir tipo y de buscar (en
 * «Cooperativo», el tiempo de búsqueda conjunta de cada combinación), más el número de rondas (en «Cooperativo», una
 * combinación por ronda), con `ConfigRange` (el `Slider` del
 * catálogo). El enfriamiento entre intentos fallidos lo fija el servidor.
 */
export function TypeDuelConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TypeDuelConfig;
  const coop = value.mode === 'COOP';
  return <fieldset disabled={disabled} className={s.panel}>
    <GameModeField gameId="type-duel" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} />
    <div className={s.ranges}>
      {!coop && <ConfigRange label="Tiempo para elegir tipo" value={value.typeSelectSeconds} min={5} max={60} step={5} disabled={disabled} accent="electric" formatValue={(seconds) => `${seconds} segundos`} hint="Los dos tipos se revelan a la vez." onCommit={(typeSelectSeconds) => onChange({ ...value, typeSelectSeconds })} />}
      {!coop && <ConfigRange label="Tiempo para buscar" value={value.searchSeconds} min={10} max={60} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} hint="Tras un intento fallido, 1 segundo de espera." onCommit={(searchSeconds) => onChange({ ...value, searchSeconds })} />}
      {coop && <ConfigRange label="Tiempo de búsqueda conjunta" value={value.coopSeconds} min={TYPE_DUEL_COOP_SECONDS_RANGE.min} max={TYPE_DUEL_COOP_SECONDS_RANGE.max} step={5} disabled={disabled} accent="aqua" formatValue={(seconds) => `${seconds} segundos`} hint="Lo que dura cada ronda: todos buscan a la vez los Pokémon con esos tipos." onCommit={(coopSeconds) => onChange({ ...value, coopSeconds })} />}
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={50} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} {...(coop ? { hint: 'Cada ronda, una combinación de tipos nueva para todo el grupo.' } : {})} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
  </fieldset>;
}
