import type { CustomWouldYouRatherPromptView } from '@pokemon-universe/shared';
import { Check, Pencil, Plus, Power, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export function CustomWouldYouRatherPromptManager({ disabled }: { disabled: boolean }) {
  const [prompts, setPrompts] = useState<CustomWouldYouRatherPromptView[]>([]);
  const [optionA, setOptionA] = useState(''); const [optionB, setOptionB] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingA, setEditingA] = useState(''); const [editingB, setEditingB] = useState('');
  const [busyId, setBusyId] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api<{ prompts: CustomWouldYouRatherPromptView[] }>('/would-you-rather-prompts').then((body) => { if (active) setPrompts(body.prompts); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar tus parejas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const run = async (id: string, operation: () => Promise<void>) => {
    setBusyId(id); setError('');
    try { await operation(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar el cambio.'); }
    finally { setBusyId(''); }
  };
  const create = async () => {
    const a = optionA.trim(); const b = optionB.trim(); if (a.length < 4 || b.length < 4) return;
    await run('new', async () => {
      const body = await api<{ prompt: CustomWouldYouRatherPromptView }>('/would-you-rather-prompts', { method: 'POST', body: JSON.stringify({ optionA: a, optionB: b }) });
      setPrompts((current) => [...current, body.prompt]); setOptionA(''); setOptionB('');
    });
  };
  const update = async (id: string, patch: { optionA?: string; optionB?: string; enabled?: boolean }) => run(id, async () => {
    const body = await api<{ prompt: CustomWouldYouRatherPromptView }>(`/would-you-rather-prompts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setPrompts((current) => current.map((prompt) => prompt.id === id ? body.prompt : prompt)); setEditingId(null);
  });
  const remove = async (prompt: CustomWouldYouRatherPromptView) => {
    if (!window.confirm(`¿Eliminar “${prompt.optionA}” vs “${prompt.optionB}”?`)) return;
    await run(prompt.id, async () => { await api(`/would-you-rather-prompts/${prompt.id}`, { method: 'DELETE' }); setPrompts((current) => current.filter((item) => item.id !== prompt.id)); });
  };
  const enabledCount = prompts.filter((prompt) => prompt.enabled).length;

  return <section className="rounded-2xl border border-ink/10 bg-surface-raised/70 p-4" aria-labelledby="custom-wyr-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="label !mb-0">Cuenta del host</span><h3 id="custom-wyr-title" className="font-display text-xl">Mis dilemas</h3><p className="mt-1 text-sm font-bold text-ink/60">Se guardan en tu cuenta y solo se usan en Would You Rather.</p></div><span className={`chip ${enabledCount >= 1 ? '!bg-leaf/10 !text-leaf' : '!bg-electric/10 !text-electric'}`}><Check size={14} /> {enabledCount} activos</span></div>
    <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto]"><label><span className="sr-only">Nueva opción A</span><input className="field min-h-11" maxLength={180} value={optionA} onChange={(event) => setOptionA(event.target.value)} placeholder="Opción A" disabled={disabled || busyId === 'new'} /></label><strong className="self-center text-center font-display text-berry">VS</strong><label><span className="sr-only">Nueva opción B</span><input className="field min-h-11" maxLength={180} value={optionB} onChange={(event) => setOptionB(event.target.value)} placeholder="Opción B" disabled={disabled || busyId === 'new'} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }} /></label><button type="button" className="btn-secondary shrink-0" disabled={disabled || optionA.trim().length < 4 || optionB.trim().length < 4 || Boolean(busyId)} onClick={() => void create()}><Plus size={18} /> Añadir</button></div>
    {error && <p className="mt-3 rounded-xl bg-berry/10 px-3 py-2 text-sm font-bold text-berry" role="alert">{error}</p>}
    {loading ? <p className="py-5 text-sm font-bold text-ink/60">Cargando dilemas…</p> : prompts.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-ink/15 p-4 text-center text-sm font-bold text-ink/55">Todavía no has creado dilemas personales.</p> : <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">{prompts.map((prompt) => <li key={prompt.id} className={`rounded-xl border p-2.5 ${prompt.enabled ? 'border-aqua/20 bg-aqua/[.04]' : 'border-ink/10 bg-ink/[.025] opacity-70'}`}>
      {editingId === prompt.id ? <div className="grid gap-2 lg:grid-cols-[1fr_1fr_auto_auto]"><input className="field min-h-10" maxLength={180} value={editingA} onChange={(event) => setEditingA(event.target.value)} aria-label="Editar opción A" autoFocus /><input className="field min-h-10" maxLength={180} value={editingB} onChange={(event) => setEditingB(event.target.value)} aria-label="Editar opción B" /><button type="button" className="btn-ghost min-h-10 !px-3" disabled={editingA.trim().length < 4 || editingB.trim().length < 4 || Boolean(busyId)} onClick={() => void update(prompt.id, { optionA: editingA.trim(), optionB: editingB.trim() })}><Save size={17} /> Guardar</button><button type="button" className="btn-ghost min-h-10 !px-3" onClick={() => setEditingId(null)}><X size={17} /> Cancelar</button></div> : <div className="flex items-center gap-2"><button type="button" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${prompt.enabled ? 'bg-leaf/15 text-leaf' : 'bg-ink/10 text-ink/50'}`} aria-label={prompt.enabled ? 'Desactivar dilema' : 'Activar dilema'} disabled={disabled || Boolean(busyId)} onClick={() => void update(prompt.id, { enabled: !prompt.enabled })}><Power size={17} /></button><p className="min-w-0 flex-1 text-sm font-bold leading-snug"><span className="text-aqua">A.</span> {prompt.optionA} <span className="mx-1 text-berry">VS</span> <span className="text-electric">B.</span> {prompt.optionB}</p><button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink/55 hover:bg-aqua/10 hover:text-aqua" aria-label="Editar dilema" disabled={disabled || Boolean(busyId)} onClick={() => { setEditingId(prompt.id); setEditingA(prompt.optionA); setEditingB(prompt.optionB); }}><Pencil size={17} /></button><button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink/55 hover:bg-berry/10 hover:text-berry" aria-label="Eliminar dilema" disabled={disabled || Boolean(busyId)} onClick={() => void remove(prompt)}><Trash2 size={17} /></button></div>}
    </li>)}</ul>}
  </section>;
}
