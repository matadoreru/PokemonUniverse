import type { Pokemon } from '@pokemon-universe/shared';
import { Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function PokemonSelector({ pokemon, locked, disabled, onSelect }: { pokemon: Pokemon[]; locked: Set<string>; disabled: boolean; onSelect(id: string): Promise<void> }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const results = useMemo(() => {
    const needle = normalize(deferred);
    if (!needle) return [];
    return pokemon.filter((entry) => normalize(entry.name).includes(needle)).slice(0, 40);
  }, [deferred, pokemon]);
  async function select(id: string) { setPending(id); setError(''); try { await onSelect(id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Selección rechazada'); } finally { setPending(''); } }
  return <div className="card !p-4 md:!p-5"><label className="relative block"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" size={20} /><input className="field pl-11" placeholder="Buscar Pokémon por nombre…" value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled} autoFocus /></label>
    {error && <p className="mt-2 rounded-xl bg-berry/10 p-2 text-sm font-bold text-berry">{error}</p>}
    {normalize(deferred) && results.length === 0 && <p className="py-12 text-center font-bold text-ink/40">No hay coincidencias.</p>}
    <div className="mt-3 grid max-h-[360px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">{results.map((entry) => { const unavailable = locked.has(entry.id); return <button key={entry.id} disabled={disabled || unavailable || Boolean(pending)} onClick={() => void select(entry.id)} className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left transition ${unavailable ? 'border-transparent bg-ink/5 opacity-35 grayscale' : 'border-ink/10 bg-white hover:border-aqua hover:bg-aqua/5'}`}><img className="h-12 w-12 object-contain" loading="lazy" src={entry.sprite} alt="" /><span className="min-w-0"><strong className="block truncate text-sm">{entry.name}</strong><small className="font-extrabold text-ink/40">Generación {entry.generation}</small></span></button>; })}</div>
  </div>;
}
