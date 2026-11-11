import type { PokemonTeamAuctionConfig } from '@pokemon-universe/shared/public';
import { useEffect, useRef, useState } from 'react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { cx, Field, Segmented, Toggle } from '../../ui';
import c from '../ConfigPanel.module.css';
import s from './TeamAuction.module.css';

const budgets = [10, 20, 30, 50] as const;
const CUSTOM = 'custom';

/** Presupuesto válido para el motor (`initialBudget`: entero de 1 a 100) o `null`. */
export function parseBudget(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return value >= 1 && value <= 100 ? value : null;
}

/**
 * Ajustes de Pokémon Team Auction con los controles del catálogo: generaciones (el selector heredado, F9), presupuesto
 * inicial (`Segmented` con los cuatro de siempre y «Otro», más el campo libre de 1 a 100), tiempo por turno
 * (`ConfigRange` de 0 a 120, 0 sin límite) y el interruptor de las formas alternativas.
 */
export function PokemonTeamAuctionConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonTeamAuctionConfig;
  const [draft, setDraft] = useState(String(value.initialBudget));
  const customRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(String(value.initialBudget)); }, [value.initialBudget]);
  const preset = (budgets as readonly number[]).includes(value.initialBudget) ? String(value.initialBudget) : CUSTOM;
  const draftValid = parseBudget(draft) !== null;
  return <fieldset disabled={disabled} className={c.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones disponibles" description="La pool contiene exactamente seis lotes por jugador. Las formas alternativas cuentan como Pokémon independientes." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <div className={c.group}>
        <span className={c.label} id="team-auction-budget">Presupuesto inicial por jugador</span>
        <div className={s.budgetRow}>
          <Segmented label="Presupuesto inicial por jugador" value={preset}
            options={[...budgets.map((budget) => ({ value: String(budget), label: String(budget), disabled })), { value: CUSTOM, label: 'Otro', disabled }]}
            onChange={(next) => { if (next === CUSTOM) customRef.current?.focus(); else void onChange({ ...value, initialBudget: Number(next) }); }} />
          <Field ref={customRef} label="Presupuesto personalizado" type="number" inputMode="numeric" min={1} max={100} step={1} value={draft} className={cx(s.custom)} disabled={disabled}
            aria-invalid={draftValid ? undefined : true} {...(draftValid ? {} : { hint: 'Entre 1 y 100.' })}
            onChange={(event) => { setDraft(event.target.value); const initialBudget = parseBudget(event.target.value); if (initialBudget !== null && initialBudget !== value.initialBudget) void onChange({ ...value, initialBudget }); }}
            onBlur={() => setDraft(String(value.initialBudget))} />
        </div>
        <p className={c.help}>Las pujas empiezan en 1 y pueden saltar directamente a cualquier cantidad que puedas pagar.</p>
      </div>
      <ConfigRange label="Tiempo por turno" value={value.bidSeconds ?? 20} min={0} max={120} disabled={disabled}
        formatValue={(seconds) => (seconds === 0 ? 'Sin límite' : `${seconds} s`)} hint="Al agotarse el tiempo, pasas ese lote. Usa 0 para jugar sin límite."
        onCommit={(bidSeconds) => onChange({ ...value, bidSeconds })} />
    </div>
    <Toggle label="Incluir formas alternativas" hint="Las formas regionales ocupan su propio lote y se valoran con su BST." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
  </fieldset>;
}
