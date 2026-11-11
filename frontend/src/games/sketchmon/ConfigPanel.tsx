import type { SketchmonConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { PublicAttemptsToggle } from '../../room/guess-kit/PublicAttemptsToggle';
import { Segmented, Toggle } from '../../ui';
import s from './ConfigPanel.module.css';

/** Los únicos tiempos por dibujo que admite el motor (`sketchmonConfigSchema`): por eso un `Segmented`. */
const roundTimes = [60, 90, 120] as const;

/**
 * Ajustes de Sketchmon con los controles del catálogo: generaciones (el selector heredado, F9), tiempo por dibujo
 * (`Segmented` con los tres valores del motor), vueltas (`ConfigRange` de 1 a 3), los tres interruptores (memoria de 3
 * segundos, pistas automáticas y formas compatibles) con su explicación y la nota de privacidad.
 */
export function SketchmonConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as SketchmonConfig;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="El Pokémon secreto y todas las respuestas pertenecerán a estas generaciones." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={s.pair}>
      <Segmented label="Tiempo por dibujo" showLabel hint="Lo que tiene quien dibuja para que el grupo acierte; acertar antes da más puntos." value={value.roundSeconds} options={roundTimes.map((seconds) => ({ value: seconds, label: `${seconds} s`, disabled }))} onChange={(roundSeconds) => void onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Vueltas" value={value.laps} min={1} max={3} disabled={disabled} formatValue={(laps) => (laps === 1 ? '1 vuelta' : `${laps} vueltas`)} hint="Cada jugador dibuja una vez por vuelta, en un orden nuevo." onCommit={(laps) => onChange({ ...value, laps })} />
    </div>
    <Toggle label="Memoria de 3 segundos" hint="Muestra el sprite 3 segundos y después deja únicamente el nombre." checked={value.memoryPreviewEnabled} disabled={disabled} onChange={(memoryPreviewEnabled) => void onChange({ ...value, memoryPreviewEnabled })} />
    <Toggle label="Pistas automáticas" hint="Revela generación, tipos y evolución durante la ronda. Desactivadas por defecto." checked={value.hintsEnabled} disabled={disabled} onChange={(hintsEnabled) => void onChange({ ...value, hintsEnabled })} />
    <Toggle label="Formas compatibles" hint="Incluye formas regionales; hay que acertar la forma exacta." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
    <p className={s.note}>El Pokémon secreto solo se envía a quien dibuja. Con el modo memoria, el servidor retira el sprite tras 3 segundos; los demás nunca reciben su identidad.</p>
    <PublicAttemptsToggle checked={value.publicAttempts} disabled={disabled} onChange={(publicAttempts) => void onChange({ ...value, publicAttempts })} />
  </fieldset>;
}
