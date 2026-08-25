import type { Pokemon } from '@pokemon-universe/shared';
import { Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { normalizePokemonQuery, searchPokemonOptions } from './pokemon-search';

export function PokemonSelector({ pokemon, locked, disabled, confirmationDisabled = false, variant = 'card', autoFocus = true, inputLabel = 'Buscar Pokémon', onSelect }: { pokemon: Pokemon[]; locked: Set<string>; disabled: boolean; confirmationDisabled?: boolean; variant?: 'card' | 'embedded'; autoFocus?: boolean; inputLabel?: string; onSelect(id: string): Promise<void> }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const results = useMemo(() => searchPokemonOptions(pokemon, deferred), [deferred, pokemon]);
  async function select(id: string) { setPending(id); setError(''); try { await onSelect(id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Selección rechazada'); } finally { setPending(''); } }
  return <div className={variant === 'card' ? 'card !p-4 md:!p-5' : ''}><label className="relative block"><span className="sr-only">{inputLabel}</span><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/55" size={21} aria-hidden="true" /><input aria-label={inputLabel} className="field min-h-12 pl-12 text-base" placeholder="Buscar Pokémon…" value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled} autoFocus={autoFocus} autoComplete="off" /></label>
    {error && <p className="mt-2 rounded-xl bg-berry/10 p-2 text-sm font-bold text-berry" role="alert">{error}</p>}
    {normalizePokemonQuery(deferred) && results.length === 0 && <p className="py-8 text-center font-bold text-ink/60">No hay coincidencias.</p>}
    <div className="pokemon-selector-results mt-3 grid max-h-96 gap-2 overflow-y-auto overscroll-contain pr-1">{results.map((entry) => { const unavailable = locked.has(entry.id); return <button key={entry.id} disabled={disabled || confirmationDisabled || unavailable || Boolean(pending)} onClick={() => void select(entry.id)} className={`flex min-h-24 items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${unavailable || confirmationDisabled ? 'border-transparent bg-ink/5 opacity-45' : 'border-ink/10 bg-surface-raised hover:border-aqua hover:bg-aqua/10'}`}><img className="h-20 w-20 shrink-0 object-contain [image-rendering:pixelated] sm:h-24 sm:w-24" loading="lazy" src={entry.sprite} alt="" /><strong className="min-w-0 truncate text-base">{entry.name}</strong></button>; })}</div>
  </div>;
}
