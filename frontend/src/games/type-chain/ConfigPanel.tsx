import type { TypeChainConfig } from '@pokemon-universe/shared/public';
import { Clock3, Link2 } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { Icon, Segmented } from '../../ui';
import { typeChainCooldownText } from './presentation';
import s from './ConfigPanel.module.css';

const turnTimes = [10, 15, 20, 30, 45] as const;

/** Ajustes de Type Chain con los controles del catálogo: generaciones del pool y el tiempo por turno (`Segmented`). */
export function TypeChainConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TypeChainConfig;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones del pool" description="Limita el starter, las respuestas y el cálculo de continuaciones." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={s.field}>
      <span className={s.label}>Tiempo por turno</span>
      <Segmented label="Tiempo por turno" value={value.turnSeconds} options={turnTimes.map((seconds) => ({ value: seconds, label: `${seconds}s`, disabled }))} onChange={(turnSeconds) => void onChange({ ...value, turnSeconds })} />
    </div>
    <div className={s.rule}>
      <span className={s.ruleIcon}><Icon icon={Link2} size={24} /></span>
      <div>
        <strong className={s.ruleTitle}>Exactamente un tipo compartido</strong>
        <p className={s.help}>Los Pokémon usados quedan bloqueados globalmente. Si la cadena se atasca, el servidor crea otra sin eliminar a nadie.</p>
        <span className={s.note}><Icon icon={Clock3} size={18} /> Cooldown de {typeChainCooldownText} tras cada fallo</span>
      </div>
    </div>
  </fieldset>;
}
