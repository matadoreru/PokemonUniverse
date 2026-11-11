import type { WhosThatPokemonConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { PublicAttemptsToggle } from '../../room/guess-kit/PublicAttemptsToggle';
import { Toggle } from '../../ui';
import c from '../ConfigPanel.module.css';

/**
 * Ajustes de ¿Quién es ese Pokémon? con los controles del catálogo: generaciones del pool, pistas adicionales y formas
 * regionales (`Toggle`) y los tiempos (`ConfigRange`, en los límites del contrato: 10–60 s y 1–20 rondas).
 */
export function WhosThatPokemonConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as WhosThatPokemonConfig;
  return <fieldset disabled={disabled} className={c.panelLoose}>
    <GenerationSelector selected={value.generations} label="Generaciones del pool" description="La generación normalizada del catálogo compartido también se aplica a las formas regionales." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <Toggle label="Pistas adicionales" hint={value.hintsEnabled ? 'Generación, tipo y evolución aparecen poco a poco.' : 'Solo se muestra la silueta.'} checked={value.hintsEnabled} disabled={disabled} onChange={(hintsEnabled) => void onChange({ ...value, hintsEnabled })} />
      <Toggle label="Formas regionales" hint="Incluye las formas diferenciadas y con sprite propio del catálogo." checked={value.includeRegionalForms} disabled={disabled} onChange={(includeRegionalForms) => void onChange({ ...value, includeRegionalForms })} />
    </div>
    <div className={c.pair}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} hint="Cuanto antes aciertes, más puntos; tras un fallo hay una breve espera." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
    <p className={c.note}>Las formas Gigamax y otras variantes no se activan: el catálogo solo normaliza de forma fiable las formas regionales.</p>
    <PublicAttemptsToggle checked={value.publicAttempts} disabled={disabled} onChange={(publicAttempts) => void onChange({ ...value, publicAttempts })} />
  </fieldset>;
}
