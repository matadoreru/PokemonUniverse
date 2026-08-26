import type { Pokemon } from '@pokemon-universe/shared';
import { Search } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { normalizePokemonQuery, searchPokemonOptions } from './pokemon-search';

export function PokemonSelector({ pokemon, locked, disabled, confirmationDisabled = false, variant = 'card', autoFocus = true, inputLabel = 'Buscar Pokémon', maxResults = 40, onSelect }: { pokemon: Pokemon[]; locked: Set<string>; disabled: boolean; confirmationDisabled?: boolean; variant?: 'card' | 'embedded'; autoFocus?: boolean; inputLabel?: string; maxResults?: number; onSelect(id: string): Promise<void> }) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const hintId = useId();
  const submitting = useRef(false);
  const results = useMemo(() => searchPokemonOptions(pokemon, query, maxResults), [maxResults, pokemon, query]);
  const firstSelectableId = results.find((entry) => !locked.has(entry.id))?.id;
  async function select(id: string) {
    if (submitting.current || disabled || confirmationDisabled || locked.has(id)) return;
    submitting.current = true; setPending(id); setError('');
    try { await onSelect(id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Selección rechazada'); }
    finally { submitting.current = false; setPending(''); }
  }
  return <div className={variant === 'card' ? 'card !p-4 md:!p-5' : ''}><label className="relative block"><span className="sr-only">{inputLabel}</span><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/55" size={21} aria-hidden="true" /><input aria-label={inputLabel} aria-describedby={hintId} className="field min-h-12 pl-12 text-base" placeholder="Buscar Pokémon…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter' || event.nativeEvent.isComposing) return; event.preventDefault(); const first = results.find((entry) => !locked.has(entry.id)); if (first) void select(first.id); }} disabled={disabled} autoFocus={autoFocus} autoComplete="off" /></label>
    <span id={hintId} className="sr-only">Pulsa Enter para elegir la primera coincidencia disponible.</span>
    {error && <p className="mt-2 rounded-xl bg-berry/10 p-2 text-sm font-bold text-berry" role="alert">{error}</p>}
    {normalizePokemonQuery(query) && results.length === 0 && <p className="py-8 text-center font-bold text-ink/60">No hay coincidencias.</p>}
    <div className="pokemon-selector-results mt-3 grid max-h-96 gap-2 overflow-y-auto overscroll-contain pr-1">{results.map((entry) => { const unavailable = locked.has(entry.id); const primary = entry.id === firstSelectableId; return <button type="button" key={entry.id} disabled={disabled || confirmationDisabled || unavailable || Boolean(pending)} onClick={() => void select(entry.id)} className={`flex min-h-24 items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${unavailable || confirmationDisabled ? 'border-transparent bg-ink/5 opacity-45' : primary ? 'border-aqua/60 bg-aqua/[.07] hover:bg-aqua/10' : 'border-ink/10 bg-surface-raised hover:border-aqua hover:bg-aqua/10'}`}><img className="h-20 w-20 shrink-0 object-contain [image-rendering:auto] sm:h-24 sm:w-24" loading="lazy" src={entry.sprite} alt="" /><strong className="min-w-0 flex-1 truncate text-base">{entry.name}</strong>{primary && <small className="shrink-0 rounded-lg bg-aqua/10 px-2 py-1 font-black text-aqua" aria-hidden="true">Enter ↵</small>}</button>; })}</div>
  </div>;
}
