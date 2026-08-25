import type { CustomCategoryView } from '@pokemon-universe/shared';
import { Check, Pencil, Plus, Power, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export function CustomCategoryManager({ disabled }: { disabled: boolean }) {
  const [categories, setCategories] = useState<CustomCategoryView[]>([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api<{ categories: CustomCategoryView[] }>('/categories').then((body) => { if (active) setCategories(body.categories); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar tus categorías.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const run = async (id: string, operation: () => Promise<void>) => {
    setBusyId(id); setError('');
    try { await operation(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar el cambio.'); }
    finally { setBusyId(''); }
  };
  const create = async () => {
    const trimmed = text.trim(); if (!trimmed) return;
    await run('new', async () => {
      const body = await api<{ category: CustomCategoryView }>('/categories', { method: 'POST', body: JSON.stringify({ text: trimmed }) });
      setCategories((current) => [...current, body.category]); setText('');
    });
  };
  const update = async (id: string, patch: { text?: string; enabled?: boolean }) => run(id, async () => {
    const body = await api<{ category: CustomCategoryView }>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setCategories((current) => current.map((category) => category.id === id ? body.category : category)); setEditingId(null);
  });
  const remove = async (category: CustomCategoryView) => {
    if (!window.confirm(`¿Eliminar “${category.text}”?`)) return;
    await run(category.id, async () => { await api(`/categories/${category.id}`, { method: 'DELETE' }); setCategories((current) => current.filter((item) => item.id !== category.id)); });
  };
  const enabledCount = categories.filter((category) => category.enabled).length;

  return <section className="rounded-2xl border border-ink/10 bg-surface-raised/70 p-4" aria-labelledby="custom-categories-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><span className="label !mb-0">Cuenta del host</span><h3 id="custom-categories-title" className="font-display text-xl">Mis categorías</h3><p className="mt-1 text-sm font-bold text-ink/60">Se guardan en tu cuenta y sirven para futuras salas.</p></div>
      <span className={`chip ${enabledCount >= 2 ? '!bg-leaf/10 !text-leaf' : '!bg-electric/10 !text-electric'}`}><Check size={14} /> {enabledCount} activas</span>
    </div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <label className="min-w-0 flex-1"><span className="sr-only">Nueva categoría personal</span><input className="field min-h-11" maxLength={160} value={text} onChange={(event) => setText(event.target.value)} placeholder="Pokémon que llevarías al gimnasio" disabled={disabled || busyId === 'new'} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }} /></label>
      <button type="button" className="btn-secondary shrink-0" disabled={disabled || text.trim().length < 4 || Boolean(busyId)} onClick={() => void create()}><Plus size={18} /> Añadir</button>
    </div>
    {error && <p className="mt-3 rounded-xl bg-berry/10 px-3 py-2 text-sm font-bold text-berry" role="alert">{error}</p>}
    {loading ? <p className="py-5 text-sm font-bold text-ink/60">Cargando categorías…</p> : categories.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-ink/15 p-4 text-center text-sm font-bold text-ink/55">Todavía no has creado categorías personales.</p> : <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
      {categories.map((category) => <li key={category.id} className={`rounded-xl border p-2.5 ${category.enabled ? 'border-aqua/20 bg-aqua/[.04]' : 'border-ink/10 bg-ink/[.025] opacity-70'}`}>
        {editingId === category.id ? <div className="flex flex-col gap-2 sm:flex-row"><input className="field min-h-10 flex-1" maxLength={160} value={editingText} onChange={(event) => setEditingText(event.target.value)} aria-label="Editar categoría" autoFocus /><button className="btn-ghost min-h-10 !px-3" disabled={editingText.trim().length < 4 || Boolean(busyId)} onClick={() => void update(category.id, { text: editingText.trim() })}><Save size={17} /> Guardar</button><button className="btn-ghost min-h-10 !px-3" onClick={() => setEditingId(null)}><X size={17} /> Cancelar</button></div> : <div className="flex items-center gap-2"><button type="button" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${category.enabled ? 'bg-leaf/15 text-leaf' : 'bg-ink/10 text-ink/50'}`} aria-label={category.enabled ? `Desactivar ${category.text}` : `Activar ${category.text}`} disabled={disabled || Boolean(busyId)} onClick={() => void update(category.id, { enabled: !category.enabled })}><Power size={17} /></button><span className="min-w-0 flex-1 font-bold leading-snug">{category.text}</span><button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink/55 hover:bg-aqua/10 hover:text-aqua" aria-label={`Editar ${category.text}`} disabled={disabled || Boolean(busyId)} onClick={() => { setEditingId(category.id); setEditingText(category.text); }}><Pencil size={17} /></button><button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink/55 hover:bg-berry/10 hover:text-berry" aria-label={`Eliminar ${category.text}`} disabled={disabled || Boolean(busyId)} onClick={() => void remove(category)}><Trash2 size={17} /></button></div>}
      </li>)}
    </ul>}
  </section>;
}
