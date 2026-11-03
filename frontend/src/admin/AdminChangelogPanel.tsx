import {
  CHANGELOG_CATEGORIES,
  CHANGELOG_CATEGORY_LABELS,
  type ChangelogCategory,
  type ChangelogChange,
  type ChangelogEntry,
} from '@pokemon-universe/shared/public';
import { Eye, EyeOff, FilePlus2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useChangelog } from '../changelog/ChangelogContext';
import { formatChangelogDate } from '../changelog/ChangelogEntryView';
import { api } from '../lib/api';

interface ChangelogForm {
  id: string | null;
  version: string;
  title: string;
  date: string;
  published: boolean;
  content: ChangelogChange[];
}

function newForm(): ChangelogForm {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return { id: null, version: '', title: '', date: localDate, published: false, content: [{ type: 'NEW', text: '' }] };
}

function formFromEntry(entry: ChangelogEntry): ChangelogForm {
  return { id: entry.id, version: entry.version, title: entry.title, date: entry.date.slice(0, 10), published: entry.published, content: entry.content.map((change) => ({ ...change })) };
}

function sortEntries(entries: ChangelogEntry[]): ChangelogEntry[] {
  return entries.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

export function AdminChangelogPanel({ onDirtyChange }: { onDirtyChange?(dirty: boolean): void }) {
  const { refresh: refreshPublicChangelog } = useChangelog();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [form, setForm] = useState<ChangelogForm>(newForm);
  const [savedForm, setSavedForm] = useState<ChangelogForm>(newForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);

  function switchForm(next: ChangelogForm) {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    setForm(next); setSavedForm(next); setError(''); setNotice('');
  }

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setEntries((await api<{ entries: ChangelogEntry[] }>('/admin/changelog')).entries); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo cargar el changelog.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function updateChange(index: number, patch: Partial<ChangelogChange>) {
    setForm((current) => ({ ...current, content: current.content.map((change, changeIndex) => changeIndex === index ? { ...change, ...patch } : change) }));
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const body = JSON.stringify({
        version: form.version,
        title: form.title,
        date: `${form.date}T12:00:00.000Z`,
        published: form.published,
        content: form.content,
      });
      const result = form.id
        ? await api<{ entry: ChangelogEntry }>(`/admin/changelog/${form.id}`, { method: 'PATCH', body })
        : await api<{ entry: ChangelogEntry }>('/admin/changelog', { method: 'POST', body });
      setEntries((current) => sortEntries([...current.filter((entry) => entry.id !== result.entry.id), result.entry]));
      const next = formFromEntry(result.entry);
      setForm(next); setSavedForm(next);
      await refreshPublicChangelog();
      setNotice(result.entry.published ? `v${result.entry.version} está publicada.` : `Borrador v${result.entry.version} guardado.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar la versión.'); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!form.id || !window.confirm(`¿Eliminar definitivamente la versión v${form.version}?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api(`/admin/changelog/${form.id}`, { method: 'DELETE' });
      setEntries((current) => current.filter((entry) => entry.id !== form.id));
      await refreshPublicChangelog();
      const next = newForm();
      setForm(next); setSavedForm(next); setNotice('Versión eliminada.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo eliminar la versión.'); }
    finally { setSaving(false); }
  }

  return <section className="grid items-start gap-5 xl:grid-cols-[minmax(18rem,.72fr)_minmax(0,1.28fr)]" aria-labelledby="admin-changelog-title">
    <aside className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 p-4"><div><h2 id="admin-changelog-title" className="font-display text-xl font-bold">Versiones</h2><p className="mt-1 text-sm font-semibold text-ink/55">{entries.length} registros</p></div><button className="icon-button" onClick={() => switchForm(newForm())} title="Nueva versión" aria-label="Crear nueva versión"><FilePlus2 size={19} /></button></div>
      {loading ? <div className="space-y-3 p-4" role="status" aria-label="Cargando versiones">{Array.from({ length: 4 }, (_, index) => <span className="skeleton block h-16" key={index} />)}</div>
        : entries.length === 0 ? <div className="empty-state m-4"><strong>No hay versiones todavía.</strong><p className="mt-1 text-sm font-semibold">Crea el primer borrador desde el editor.</p></div>
          : <div className="divide-y divide-ink/10">{entries.map((entry) => <button className={`flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[.04] ${form.id === entry.id ? 'bg-aqua/10' : ''}`} key={entry.id} onClick={() => switchForm(formFromEntry(entry))}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${entry.published ? 'bg-leaf/10 text-leaf' : 'bg-ink/[.07] text-ink/55'}`} aria-hidden="true">{entry.published ? <Eye size={18} /> : <EyeOff size={18} />}</span><span className="min-w-0 flex-1"><strong className="block truncate font-display">v{entry.version}</strong><span className={`block text-xs font-extrabold ${entry.published ? 'text-leaf' : 'text-ink/55'}`}>{entry.published ? 'Publicada' : 'Borrador'}</span><span className="block truncate text-sm font-semibold text-ink/55">{entry.title}</span></span><Pencil className="shrink-0 text-ink/35" size={16} aria-hidden="true" /></button>)}</div>}
    </aside>

    <form className="panel p-4 sm:p-6" onSubmit={(event) => void save(event)}>
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-display text-2xl font-bold">{form.id ? `Editar v${form.version}` : 'Nueva versión'}</h2><p className="mt-1 text-sm font-semibold text-ink/60">Los borradores solo son visibles para administradores.</p></div>{form.id && <span className={`self-start rounded-full px-2.5 py-1 text-xs font-extrabold ${form.published ? 'bg-leaf/10 text-leaf' : 'bg-ink/[.07] text-ink/60'}`}>{form.published ? 'Publicada' : 'Borrador'}</span>}</header>
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <label><span className="label">Versión</span><input className="field" value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} placeholder="0.8.0" required /></label>
        <label><span className="label">Título</span><input className="field" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Pokémon Bingo Update" required /></label>
        <label><span className="label">Fecha</span><input className="field" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required /></label>
        <label className="flex min-h-11 items-center gap-3 self-end rounded-xl bg-ink/[.045] px-3.5 py-2.5 font-extrabold"><input type="checkbox" checked={form.published} onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))} /><span>Publicar esta versión</span></label>
      </div>

      <fieldset className="mt-7"><legend className="font-display text-xl font-bold">Cambios</legend><p className="mt-1 text-sm font-semibold text-ink/55">Agrupa cada nota por su tipo para que el historial sea fácil de recorrer.</p>
        <div className="mt-4 space-y-3">{form.content.map((change, index) => <div className="grid gap-2 rounded-xl bg-ink/[.035] p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start" key={index}>
          <label><span className="sr-only">Tipo del cambio {index + 1}</span><select className="field" value={change.type} onChange={(event) => updateChange(index, { type: event.target.value as ChangelogCategory })}>{CHANGELOG_CATEGORIES.map((type) => <option value={type} key={type}>{CHANGELOG_CATEGORY_LABELS[type]}</option>)}</select></label>
          <label><span className="sr-only">Texto del cambio {index + 1}</span><textarea className="field min-h-24 resize-y" value={change.text} onChange={(event) => updateChange(index, { text: event.target.value })} placeholder="Describe el cambio para los jugadores" required /></label>
          <button className="icon-button text-berry" type="button" disabled={form.content.length === 1} onClick={() => setForm((current) => ({ ...current, content: current.content.filter((_, changeIndex) => changeIndex !== index) }))} aria-label={`Eliminar cambio ${index + 1}`} title="Eliminar cambio"><Trash2 size={18} /></button>
        </div>)}</div>
        <button className="btn-ghost mt-3 text-sm" type="button" onClick={() => setForm((current) => ({ ...current, content: [...current.content, { type: 'NEW', text: '' }] }))}><Plus size={17} />Añadir cambio</button>
      </fieldset>

      {error && <p className="status-error mt-5" role="alert">{error}</p>}
      {notice && <p className="mt-5 rounded-xl bg-leaf/10 px-3.5 py-3 text-sm font-extrabold text-leaf" role="status">{notice}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div>{form.id && <button className="btn-ghost text-sm text-berry" type="button" disabled={saving} onClick={() => void remove()}><Trash2 size={17} />Eliminar versión</button>}</div><button className="btn-primary text-sm" type="submit" disabled={saving}><Save size={17} />{saving ? 'Guardando…' : form.published ? 'Guardar y publicar' : 'Guardar borrador'}</button></div>
      {form.id && <p className="mt-4 text-xs font-bold text-ink/45">Fecha visible: {formatChangelogDate(`${form.date}T12:00:00.000Z`)}</p>}
    </form>
  </section>;
}
