import type { WhoAmIConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { secondsLabel } from '../../lib/format';
import c from '../ConfigPanel.module.css';

/**
 * Ajustes de ¿Quién soy? con los controles del catálogo (sin modos): generaciones de los Pokémon que se reparten,
 * cuántas vueltas como mucho y lo que dura preguntar y responder (`ConfigRange`).
 */
export function WhoAmIConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as WhoAmIConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="A cada jugador le toca un Pokémon de estas generaciones, y solo puede adivinar entre ellos." onChange={(generations) => void onChange({ ...value, generations })} />
    <ConfigRange label="Número de vueltas" value={value.maxLaps} min={3} max={20} disabled={disabled} formatValue={(laps) => `${laps} vueltas`} onCommit={(maxLaps) => onChange({ ...value, maxLaps })} />
    <div className={c.pair}>
      <ConfigRange label="Tiempo para preguntar" value={value.askSeconds} min={20} max={90} disabled={disabled} formatValue={secondsLabel} onCommit={(askSeconds) => onChange({ ...value, askSeconds })} />
      <ConfigRange label="Tiempo para responder" value={value.answerSeconds} min={10} max={60} disabled={disabled} formatValue={secondsLabel} onCommit={(answerSeconds) => onChange({ ...value, answerSeconds })} />
    </div>
  </fieldset>;
}
