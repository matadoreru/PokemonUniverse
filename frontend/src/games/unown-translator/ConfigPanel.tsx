import type { UnownTranslatorConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { GameModeField } from '../../room/GameModeField';
import s from './UnownTranslator.module.css';

const seconds = (value: number) => `${value} segundos`;

/**
 * Ajustes de Traductor Unown con los controles del catálogo: modo (`GameModeField`: Pokémon o Movimientos),
 * generaciones, rondas, lo que dura cada ronda y cada cuánto se revela una letra (`ConfigRange`).
 */
export function UnownTranslatorConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as UnownTranslatorConfig;
  return <fieldset disabled={disabled} className={s.panel}>
    <GameModeField gameId="unown-translator" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <GenerationSelector selected={value.generations} label="Generaciones disponibles" description="Los nombres (o los movimientos que aprenden) salen de los Pokémon de estas generaciones." onChange={(generations) => void onChange({ ...value, generations })} />
    <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    <div className={s.pair}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={30} max={120} disabled={disabled} formatValue={seconds} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Tiempo entre letras" value={value.hintSeconds} min={3} max={15} disabled={disabled} formatValue={seconds} onCommit={(hintSeconds) => onChange({ ...value, hintSeconds })} />
    </div>
  </fieldset>;
}
