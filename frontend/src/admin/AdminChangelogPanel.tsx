import {
  CHANGELOG_CATEGORIES,
  CHANGELOG_CATEGORY_LABELS,
  CHANGELOG_SUMMARY_MAX,
  MAX_CHANGELOG_HIGHLIGHTS,
  type ChangelogCategory,
  type ChangelogChange,
  type ChangelogEntry,
} from '@pokemon-universe/shared/public';
import { FilePlus2, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useChangelog } from '../changelog/ChangelogContext';
import { formatChangelogDate } from '../changelog/ChangelogEntryView';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/api-errors';
import { Chip, ConfirmDialog, cx, Field, Panel, Pill, SelectField, TextArea, ToastStack, Toggle, useToasts, type StateBoxProps } from '../ui';
import { ListDetail, rowControlId, SelectRow, useListDetail } from './AdminParts';
import tone from '../styles/tones.module.css';
import shape from '../styles/shapes.module.css';

export interface ChangelogForm {
  id: string | null;
  version: string;
  title: string;
  /** Resumen de la portada del parche; vacío = sin resumen. */
  summary: string;
  date: string;
  published: boolean;
  /** Sin claves `highlight: false`: la comparación de «cambios sin guardar» es por JSON. */
  content: ChangelogChange[];
}

/** Cambio normalizado: `highlight` solo aparece si es `true`. */
export function normalizedChange({ type, text, highlight }: ChangelogChange): ChangelogChange {
  return highlight === true ? { type, text, highlight: true } : { type, text };
}

/** Número de cambios destacados del formulario. */
export function highlightCount(content: readonly ChangelogChange[]): number {
  return content.filter((change) => change.highlight === true).length;
}

export function newChangelogForm(now = new Date()): ChangelogForm {
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return { id: null, version: '', title: '', summary: '', date: localDate, published: false, content: [{ type: 'NEW', text: '' }] };
}

export function formFromEntry(entry: ChangelogEntry): ChangelogForm {
  return { id: entry.id, version: entry.version, title: entry.title, summary: entry.summary ?? '', date: entry.date.slice(0, 10), published: entry.published, content: entry.content.map(normalizedChange) };
}

function sortEntries(entries: ChangelogEntry[]): ChangelogEntry[] {
  return entries.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

/** Índices de los cambios sin texto (el antiguo `required` del área de texto: no se envía con un cambio vacío). */
export function emptyChanges(content: readonly ChangelogChange[]): number[] {
  return content.flatMap((change, index) => (change.text.trim() === '' ? [index] : []));
}

const NEW_ID = 'new';
const CATEGORY_OPTIONS = CHANGELOG_CATEGORIES.map((type) => ({ value: type, label: CHANGELOG_CATEGORY_LABELS[type] }));

/** Lista de versiones (borradores y publicadas) con su estado de datos. */
export function ChangelogVersionList({ entries, currentId, status, onOpen }: { entries: ChangelogEntry[]; currentId: string | null; status: StateBoxProps | null; onOpen(entry: ChangelogEntry): void }) {
  return (
    <Panel title="Versiones" right={status ? undefined : `${entries.length} ${entries.length === 1 ? 'registro' : 'registros'}`} status={status} scroll scrollLabel="Lista de versiones" className="lg:min-h-0 lg:flex-1">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 p-1" aria-label="Versiones">
        {entries.map((entry) => (
          <li key={entry.id}>
            <SelectRow id={rowControlId('changelog', entry.id)} current={entry.id === currentId} openLabel={`Editar v${entry.version}`} onOpen={() => onOpen(entry)} name={`v${entry.version}`} meta={<span className="truncate" title={entry.title}>{entry.title}</span>}>
              <Chip tone={entry.published ? 'ok' : 'neutral'}>{entry.published ? 'Publicada' : 'Borrador'}</Chip>
            </SelectRow>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Editor del changelog: la lista de versiones y el formulario de la abierta, cada uno con su scroll. Descartar cambios y
 * eliminar una versión piden confirmación en un diálogo. Mismas llamadas que antes (`/admin/changelog`).
 */
export function AdminChangelogPanel({ onDirtyChange }: { onDirtyChange?(dirty: boolean): void }) {
  const { refresh: refreshPublicChangelog } = useChangelog();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [form, setForm] = useState<ChangelogForm>(() => newChangelogForm());
  const [savedForm, setSavedForm] = useState<ChangelogForm>(() => form);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [invalid, setInvalid] = useState<number[]>([]);
  const [pending, setPending] = useState<ChangelogForm | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { toasts, push, close } = useToasts();
  const detail = useListDetail('changelog');
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const highlights = highlightCount(form.content);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);

  function applyForm(next: ChangelogForm) {
    setForm(next); setSavedForm(next); setInvalid([]);
    detail.open(next.id ?? NEW_ID);
  }

  /** Abre otra versión (o una nueva); con cambios sin guardar, primero pregunta. */
  function switchForm(next: ChangelogForm) {
    if (dirty) setPending(next);
    else applyForm(next);
  }

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { setEntries((await api<{ entries: ChangelogEntry[] }>('/admin/changelog')).entries); }
    catch (caught) { setLoadError(apiErrorMessage(caught, { fallback: 'No se pudo cargar el changelog.' })); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function updateChange(index: number, patch: Partial<ChangelogChange>) {
    setForm((current) => ({ ...current, content: current.content.map((change, changeIndex) => changeIndex === index ? normalizedChange({ ...change, ...patch }) : change) }));
    if (patch.text !== undefined) setInvalid((current) => current.filter((i) => i !== index));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const missing = emptyChanges(form.content);
    setInvalid(missing);
    if (missing.length) return;
    setSaving(true);
    try {
      const body = JSON.stringify({
        version: form.version,
        title: form.title,
        // Vacío borra el resumen guardado.
        summary: form.summary,
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
      detail.setSelectedId(result.entry.id);
      await refreshPublicChangelog();
      push('ok', result.entry.published ? `v${result.entry.version} está publicada.` : `Borrador v${result.entry.version} guardado.`);
    } catch (caught) { push('error', apiErrorMessage(caught, { fallback: 'No se pudo guardar la versión.' })); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!form.id) return;
    setSaving(true);
    try {
      await api(`/admin/changelog/${form.id}`, { method: 'DELETE' });
      setEntries((current) => current.filter((entry) => entry.id !== form.id));
      await refreshPublicChangelog();
      const next = newChangelogForm();
      setForm(next); setSavedForm(next); setInvalid([]);
      detail.setSelectedId(NEW_ID);
      push('ok', 'Versión eliminada.');
    } catch (caught) { push('error', apiErrorMessage(caught, { fallback: 'No se pudo eliminar la versión.' })); }
    finally { setSaving(false); }
  }

  const listStatus: StateBoxProps | null = loadError
    ? { kind: 'error', title: 'No se pudo cargar el changelog', text: loadError, action: { label: 'Reintentar', onClick: () => void load() } }
    : loading ? { kind: 'loading', title: 'Cargando versiones' }
      : entries.length === 0 ? { kind: 'empty', title: 'No hay versiones todavía', text: 'Crea el primer borrador desde el editor.' } : null;

  return (
    <section className="flex flex-col lg:min-h-0 lg:flex-1" aria-label="Changelog">
      <ListDetail
        detailOpen={detail.detailOpen}
        onBack={detail.back}
        list={<>
          <ChangelogVersionList entries={entries} currentId={form.id} status={listStatus} onOpen={(entry) => { if (entry.id !== form.id) switchForm(formFromEntry(entry)); else detail.open(entry.id); }} />
          <Pill id={rowControlId('changelog', NEW_ID)} variant="yellow" icon={FilePlus2} className="self-start" onClick={() => switchForm(newChangelogForm())}>Nueva versión</Pill>
        </>}
        detail={
          <form className="flex flex-col gap-3 lg:min-h-0 lg:flex-1" onSubmit={(event) => void save(event)} aria-label={form.id ? `Editar v${form.version}` : 'Nueva versión'}>
            <Panel variant="cream" title={form.id ? `Editar v${form.version}` : 'Nueva versión'} titleRef={detail.titleRef} right={form.id ? <Chip tone={form.published ? 'ok' : 'neutral'}>{form.published ? 'Publicada' : 'Borrador'}</Chip> : undefined} scroll className="lg:min-h-0 lg:flex-1" bodyClassName="flex flex-col gap-5 lg:px-6 lg:py-5">
              <p className={cx('text-15 font-bold', tone.textInk2)}>Los borradores solo son visibles para administradores.</p>
              <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
                <Field label="Versión" value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} placeholder="0.8.0" required />
                <Field label="Título" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Pokémon Bingo Update" required />
                <Field label="Fecha" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required />
                <Toggle label="Publicar esta versión" checked={form.published} onChange={(published) => setForm((current) => ({ ...current, published }))} className="self-end" />
                <TextArea label="Resumen (opcional)" className="sm:col-span-2" rows={2} maxLength={CHANGELOG_SUMMARY_MAX} value={form.summary} onChange={(summary) => setForm((current) => ({ ...current, summary }))} placeholder="Una o dos frases sobre lo más importante del parche" hint="Sale en la portada del parche, bajo el título." />
              </div>
              <fieldset className="flex flex-col gap-3">
                <legend className="font-display text-22 font-extrabold">Cambios</legend>
                <p className={cx('text-15 font-bold', tone.textInk2)}>Agrupa cada nota por su tipo. Marca como destacados hasta {MAX_CHANGELOG_HIGHLIGHTS} cambios: salen arriba, en «Lo destacado».</p>
                {form.content.map((change, index) => (
                  <div className={cx('grid gap-2 p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start', shape.franja, tone.borderNavy, tone.bgCream2)} key={index}>
                    <SelectField label={`Tipo del cambio ${index + 1}`} hideLabel value={change.type} onChange={(value) => updateChange(index, { type: value as ChangelogCategory })} options={CATEGORY_OPTIONS} />
                    <TextArea label={`Texto del cambio ${index + 1}`} hideLabel rows={3} value={change.text} onChange={(text) => updateChange(index, { text })} placeholder="Describe el cambio para los jugadores" error={invalid.includes(index) ? 'Describe el cambio antes de guardar.' : null} />
                    <Pill size="round" variant="danger" icon={Trash2} disabled={form.content.length === 1} aria-label={`Eliminar cambio ${index + 1}`} title="Eliminar cambio" onClick={() => { setForm((current) => ({ ...current, content: current.content.filter((_, changeIndex) => changeIndex !== index) })); setInvalid([]); }} />
                    <Toggle label={`Destacar el cambio ${index + 1}`} className="sm:col-start-2" checked={change.highlight === true} disabled={change.highlight !== true && highlights >= MAX_CHANGELOG_HIGHLIGHTS} {...(change.highlight !== true && highlights >= MAX_CHANGELOG_HIGHLIGHTS ? { hint: `Ya hay ${MAX_CHANGELOG_HIGHLIGHTS} destacados, el máximo` } : {})} onChange={(highlight) => updateChange(index, { highlight })} />
                  </div>
                ))}
                <Pill icon={Plus} className="self-start" onClick={() => setForm((current) => ({ ...current, content: [...current.content, { type: 'NEW', text: '' }] }))}>Añadir cambio</Pill>
              </fieldset>
              {form.id && <p className={cx('text-13 font-bold', tone.textInk2)}>Fecha visible: {formatChangelogDate(`${form.date}T12:00:00.000Z`)}</p>}
            </Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>{form.id && <Pill variant="danger" icon={Trash2} disabled={saving} onClick={() => setConfirmRemove(true)}>Eliminar versión</Pill>}</div>
              <Pill variant="yellow" type="submit" icon={Save} loading={saving}>{form.published ? 'Guardar y publicar' : 'Guardar borrador'}</Pill>
            </div>
          </form>
        }
      />
      <ConfirmDialog open={pending !== null} title="¿Descartar los cambios?" onClose={() => setPending(null)} width={520}
        cancelLabel="Seguir editando" confirmLabel="Descartar" onConfirm={() => { if (pending) applyForm(pending); }}>
        <p>Hay cambios sin guardar en v{form.version || 'nueva'}. Si abres otra versión, se perderán.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirmRemove} title={`¿Eliminar la versión v${form.version}?`} onClose={() => setConfirmRemove(false)} width={520}
        confirmLabel="Eliminar" onConfirm={() => void remove()}>
        <p>Se borra definitivamente, también de las Novedades públicas si estaba publicada. No se puede deshacer.</p>
      </ConfirmDialog>
      {toasts.length > 0 && <ToastStack toasts={toasts} onClose={close} />}
    </section>
  );
}
