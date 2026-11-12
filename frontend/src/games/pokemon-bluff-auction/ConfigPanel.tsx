import type { PokemonBluffAuctionConfig } from '@pokemon-universe/shared/public';
import { ShieldCheck } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { Icon, Segmented } from '../../ui';
import c from '../ConfigPanel.module.css';
import s from './BluffAuction.module.css';
import { PaceField } from '../common/PaceField';

const times = [20, 30, 45, 60] as const;
const rounds = [5, 10, 15, 20] as const;

/**
 * Ajustes de Pokémon Bluff Auction con los controles del catálogo: generaciones (el selector heredado, F9), tiempo
 * inicial para demostrar y rondas (`Segmented` con las opciones del motor), tiempo por puja (`ConfigRange` de 0 a 120,
 * 0 sin límite) y la nota de las especies normales.
 */
export function PokemonBluffAuctionConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonBluffAuctionConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <PaceField gameId="pokemon-bluff-auction" config={value} disabled={disabled} onChange={(next) => void onChange(next)} />
    <GenerationSelector selected={value.generations} label="Generaciones" description="La condición y el buscador usarán únicamente especies normales de estas generaciones." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <Segmented label="Tiempo inicial para demostrar" showLabel hint="Cada acierto añade 5 segundos y cada fallo quita 3." value={value.demonstrationSeconds}
        options={times.map((seconds) => ({ value: seconds, label: `${seconds} s`, disabled }))}
        onChange={(demonstrationSeconds) => void onChange({ ...value, demonstrationSeconds })} />
      <Segmented label="Rondas" showLabel hint="Cada ronda renueva condición y orden de puja." value={value.rounds} options={rounds.map((count) => ({ value: count, label: String(count), disabled }))}
        onChange={(count) => void onChange({ ...value, rounds: count })} />
    </div>
    <ConfigRange label="Tiempo por puja" value={value.bidSeconds ?? 20} min={0} max={120} disabled={disabled}
      formatValue={(seconds) => (seconds === 0 ? 'Sin límite' : `${seconds} s`)} hint="Al agotarse el tiempo, pasas. Usa 0 para jugar sin límite."
      onCommit={(bidSeconds) => onChange({ ...value, bidSeconds })} />
    <div className={s.info}>
      <Icon icon={ShieldCheck} size={22} />
      <div>
        <strong className={s.infoTitle}>Solo especies normales</strong>
        <p className={c.help}>Este modo excluye regionales, Mega, Gigamax y cualquier variante que comparta número de Pokédex. Las condiciones se verifican con datos autoritativos.</p>
      </div>
    </div>
  </fieldset>;
}
