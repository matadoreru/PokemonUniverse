import { GENERATION_LEARNSET_SOURCES, type LearnsetGuessConfig } from '@pokemon-universe/shared/public';
import { BookOpenCheck } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { GameModeField, useModeShown } from '../../room/GameModeField';
import { Badge, Icon, Toggle } from '../../ui';
import c from '../ConfigPanel.module.css';
import s from './ConfigPanel.module.css';

/**
 * Ajustes de Learnset Guess con los controles del catálogo: el modo (`GameModeField`), generaciones (el learnset de referencia sale de la más
 * alta), niveles e información evolutiva (`Toggle`) y los tiempos (`ConfigRange`). El ritmo de las pistas y el
 * enfriamiento entre intentos los fija el servidor.
 */
export function LearnsetGuessConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as LearnsetGuessConfig; const reference = Math.max(...value.generations) as keyof typeof GENERATION_LEARNSET_SOURCES;
  const shown = useModeShown('learnset-guess', value.mode);
  return <fieldset disabled={disabled} className={c.panelLoose}>
    <GameModeField gameId="learnset-guess" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <GenerationSelector selected={value.generations} label="Generaciones de Pokémon" onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={s.reference}>
      <span className={s.referenceIcon}><Icon icon={BookOpenCheck} size={24} /></span>
      <div className={s.referenceText}>
        <span className={s.label}>Generación de learnset automática</span>
        <strong className={s.referenceName}><Badge tone="navy">Gen {reference}</Badge> {GENERATION_LEARNSET_SOURCES[reference].label}</strong>
        <p className={s.hint}>Se utiliza la generación más alta que hayas activado.</p>
      </div>
    </div>
    <div className={c.pair}>
      <Toggle label="Mostrar niveles" hint="Indica el nivel exacto de cada movimiento." checked={value.showLevels} disabled={disabled} onChange={(showLevels) => void onChange({ ...value, showLevels })} />
      <Toggle label="Información evolutiva" hint="Muestra únicamente la etapa, nunca nombres." checked={value.showEvolution} disabled={disabled} onChange={(showEvolution) => void onChange({ ...value, showEvolution })} />
    </div>
    <div className={c.pair}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={15} max={120} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} hint={shown('MANUAL_REVEAL') && !shown('CLASSIC') ? 'Tope de la ronda · cada fallo enseña un grupo más · 1 segundo de espera tras un fallo.' : 'Nuevas pistas cada 7 segundos · 1 segundo de espera tras un fallo.'} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
  </fieldset>;
}
