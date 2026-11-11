import { type TcgFilterOptions, type TcgHigherLowerConfig } from '@pokemon-universe/shared/public';
import { CheckCircle2, CircleDashed, Search, XCircle } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/api-errors';
import { ConfigRange } from '../common/ConfigRange';
import { Chip, Field, Icon, StateBox, Toggle } from '../../ui';
import { secondsLabel } from '../../lib/format';
import c from '../ConfigPanel.module.css';
import s from './ConfigPanel.module.css';

interface FilterOption { value: string; label: string; count: number }

/**
 * Filtro múltiple (sets o rarezas): un buscador y un interruptor por opción con su número de cartas, en una lista con
 * desplazamiento interior. «Todos» equivale a no elegir ninguno.
 */
function MultiFilter({ label, allLabel, options, selected, disabled, onChange }: { label: string; allLabel: string; options: FilterOption[]; selected: string[]; disabled: boolean; onChange(value: string[]): void }) {
  const [query, setQuery] = useState('');
  const headingId = useId();
  const needle = query.trim().toLocaleLowerCase('es');
  const visible = options.filter((option) => option.label.toLocaleLowerCase('es').includes(needle));
  return <section className={s.filter} aria-labelledby={headingId}>
    <div className={c.head}>
      <span id={headingId} className={c.label}>{label}</span>
      <Chip tone={selected.length ? 'info' : 'neutral'}>{selected.length === 0 ? allLabel : `${selected.length} ${selected.length === 1 ? 'elegido' : 'elegidos'}`}</Chip>
    </div>
    <Field label={`Buscar ${label.toLocaleLowerCase('es')}`} hideLabel icon={Search} value={query} placeholder="Buscar" disabled={disabled} onChange={(event) => setQuery(event.target.value)} />
    <div className={s.options} role="group" aria-label={label}>
      <Toggle label={allLabel} checked={selected.length === 0} disabled={disabled || selected.length === 0} onChange={() => onChange([])} />
      {visible.map((option) => {
        const active = selected.includes(option.value);
        return <Toggle key={option.value} label={`${option.label} · ${option.count.toLocaleString('es-ES')}`} checked={active} disabled={disabled}
          onChange={(next) => onChange(next ? [...selected, option.value] : selected.filter((item) => item !== option.value))} />;
      })}
      {visible.length === 0 && needle && <p className={c.help}>Ninguna opción contiene «{query.trim()}».</p>}
    </div>
  </section>;
}

/**
 * Ajustes de Higher or Lower: Cartas con los controles del catálogo: generaciones, sets y rarezas (`MultiFilter`), el
 * rango de precio (`Field`), mostrar la rareza (`Toggle`), los tiempos (`ConfigRange`) y cuántas cartas cumplen los
 * filtros, en texto. El catálogo TCG se vuelve a pedir cada 10 s (por si la sincronización lo amplía).
 */
export function TcgHigherLowerConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TcgHigherLowerConfig;
  const [options, setOptions] = useState<TcgFilterOptions | null>(null);
  const [loadError, setLoadError] = useState('');
  const [eligible, setEligible] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void api<TcgFilterOptions>('/tcg/options').then((data) => { if (alive) { setOptions(data); setLoadError(''); } }).catch((error: unknown) => { if (alive) setLoadError(apiErrorMessage(error, { fallback: 'No se pudo cargar el catálogo TCG.' })); });
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  const filterKey = JSON.stringify(value);
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      void api<{ cardCount: number }>('/tcg/eligibility', { method: 'POST', body: JSON.stringify(value) }).then((data) => { if (alive) setEligible(data.cardCount); }).catch(() => { if (alive) setEligible(null); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
    // `filterKey` resume `value`: se vuelve a comprobar al cambiar un filtro o el catálogo.
  }, [filterKey, options?.cardCount]);
  const sets = useMemo(() => options?.sets.map((set) => ({ value: set.id, label: set.name, count: set.cardCount })) ?? [], [options]);
  const rarities = useMemo(() => options?.rarities.map((rarity) => ({ value: rarity.value, label: rarity.value, count: rarity.cardCount })) ?? [], [options]);
  const updatePrice = (key: 'minPrice' | 'maxPrice', raw: string) => void onChange({ ...value, [key]: raw.trim() === '' ? null : raw });
  const enough = eligible !== null && eligible >= 2;
  return <fieldset disabled={disabled} className={c.panel}>
    {loadError && <StateBox kind="error" title="Catálogo TCG no disponible" text={loadError} />}
    <GenerationSelector selected={value.generations} label="Generaciones de Pokémon" description="Incluye cartas protagonizadas por al menos un Pokémon de las generaciones elegidas. Las cartas de Entrenador sin Pokémon quedan fuera." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <MultiFilter label="Sets" allLabel="Todos los sets" options={sets} selected={value.setIds} disabled={disabled} onChange={(setIds) => void onChange({ ...value, setIds })} />
      <MultiFilter label="Rareza" allLabel="Todas las rarezas" options={rarities} selected={value.rarities} disabled={disabled} onChange={(raritiesValue) => void onChange({ ...value, rarities: raritiesValue })} />
    </div>
    <div className={s.field}>
      <span className={c.label}>Rango de precio</span>
      <div className={c.pair}>
        <Field label="Mínimo" type="number" min="0" step="0.01" value={value.minPrice ?? ''} placeholder="Sin límite" disabled={disabled} onChange={(event) => updatePrice('minPrice', event.target.value)} />
        <Field label="Máximo" type="number" min="0" step="0.01" value={value.maxPrice ?? ''} placeholder="Sin límite" disabled={disabled} onChange={(event) => updatePrice('maxPrice', event.target.value)} />
      </div>
    </div>
    <Toggle label="Mostrar rareza de las cartas" hint="Si se oculta, la rareza se desvela después de responder." checked={value.showRarity} disabled={disabled} onChange={(showRarity) => void onChange({ ...value, showRarity })} />
    <div className={c.pair}>
      <ConfigRange label="Tiempo por comparación" value={value.roundSeconds} min={5} max={60} step={5} disabled={disabled} formatValue={secondsLabel} hint="La ronda se revela antes si todos han respondido." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={5} max={50} disabled={disabled} formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
    <p className={s.eligible}>{eligible === null
      ? <Chip tone="neutral" icon={<Icon icon={CircleDashed} size={18} />}>Comprobando cartas disponibles…</Chip>
      : enough
        ? <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>{eligible.toLocaleString('es-ES')} cartas elegibles</Chip>
        : <Chip tone="bad" icon={<Icon icon={XCircle} size={18} />}>No hay suficientes cartas</Chip>}
      {eligible !== null && !enough && <span className={c.help}>Hacen falta dos cartas con una misma fuente, variante y moneda. Amplía los filtros antes de iniciar.</span>}
    </p>
  </fieldset>;
}
