import { TYPE_CHAIN_MIN_TYPE_POKEMON, type TypeChainConfig } from '@pokemon-universe/shared/public';
import { Clock3, Link2 } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { Icon, Segmented } from '../../ui';
import { typeChainCooldownText } from './presentation';
import c from '../ConfigPanel.module.css';
import s from './ConfigPanel.module.css';

const turnTimes = [10, 15, 20, 30, 45] as const;

/** Ajustes de Type Chain con los controles del catálogo: generaciones del pool y el tiempo por turno (`Segmented`). */
export function TypeChainConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TypeChainConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones del pool" description={`Limita los Pokémon que valen y los tipos que pueden salir (solo los que tienen al menos ${TYPE_CHAIN_MIN_TYPE_POKEMON} Pokémon en el pool).`} onChange={(generations) => void onChange({ ...value, generations })} />
    <Segmented label="Tiempo por turno" showLabel value={value.turnSeconds} options={turnTimes.map((seconds) => ({ value: seconds, label: `${seconds}s`, disabled }))} onChange={(turnSeconds) => void onChange({ ...value, turnSeconds })} />
    <div className={s.rule}>
      <span className={s.ruleIcon}><Icon icon={Link2} size={24} /></span>
      <div>
        <strong className={s.ruleTitle}>Un tipo por cadena</strong>
        <p className={s.help}>Por turnos, cada uno nombra un Pokémon de ese tipo sin repetir; quien no llega a tiempo queda eliminado. Si se acaban los de ese tipo, empieza otra cadena con otro tipo. Gana quien más Pokémon nombre.</p>
        <span className={s.note}><Icon icon={Clock3} size={18} /> Cooldown de {typeChainCooldownText} tras cada fallo</span>
      </div>
    </div>
  </fieldset>;
}
