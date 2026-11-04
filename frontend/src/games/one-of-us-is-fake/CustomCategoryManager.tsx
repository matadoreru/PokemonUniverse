import type { CustomCategoryView } from '@pokemon-universe/shared/public';
import { CheckCircle2, Pencil, Plus, Power, Save, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Chip, cx, Dialog, Field, Icon, Pill, StateBox } from '../../ui';
import s from './CustomCategoryManager.module.css';

const MIN = 4;
const MAX = 160;

/** Frases que `api()` usa cuando la respuesta no trae un `error` propio (en inglés): nunca se enseñan tal cual. */
const ENGLISH_STATUS = /^(Request failed|Failed to fetch|NetworkError.*|Load failed|Bad Request|Unauthorized|Forbidden|Not Found|Conflict|Request Timeout|Too Many Requests|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)$/i;

/**
 * Mensaje de error en castellano: el `error` que manda el servidor (ya en castellano) tal cual; un fallo de red, un
 * mensaje vacío o una frase de estado HTTP en inglés, el texto de reserva.
 */
export function categoryErrorMessage(caught: unknown, fallback: string): string {
  if (!(caught instanceof Error) || caught instanceof TypeError) return fallback;
  const message = caught.message.trim();
  return !message || ENGLISH_STATUS.test(message) ? fallback : message;
}

interface CustomCategoryManagerProps {
  disabled: boolean;
  title?: string;
  description?: string;
  placeholder?: string;
  emptyText?: string;
  /** Activas necesarias para jugar solo con las propias (el chip sale en verde a partir de aquí). */
  minimumActive?: number;
  /** Etiqueta del campo de alta («Nueva categoría»; Most Likely To: «Nueva pregunta»). */
  newLabel?: string;
  /** Etiqueta del campo al editar. */
  editLabel?: string;
  /** Nombre de una entrada en el diálogo de borrado («categoría», «pregunta»). */
  noun?: string;
}

/**
 * Categorías personales del host (One of Us Is Fake; Most Likely To las usa como preguntas) con los controles del
 * catálogo: alta con un `Field` y «Añadir», y la lista con activar/desactivar, editar y eliminar (con confirmación en un
 * `Dialog`). Se guardan en la cuenta del host. Los errores salen en castellano bajo el alta.
 */
export function CustomCategoryManager({
  disabled,
  title = 'Mis categorías',
  description = 'Se guardan en tu cuenta y sirven para futuras salas.',
  placeholder = 'Pokémon que llevarías al gimnasio',
  emptyText = 'Todavía no has creado categorías personales.',
  minimumActive = 2,
  newLabel = 'Nueva categoría',
  editLabel = 'Editar categoría',
  noun = 'categoría',
}: CustomCategoryManagerProps) {
  const [categories, setCategories] = useState<CustomCategoryView[]>([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<CustomCategoryView | null>(null);
  // Al borrar, el botón pulsado desaparece: el foco va al campo de alta en vez de caer al `body`.
  const newRef = useRef<HTMLInputElement>(null);
  // Al guardar o cancelar una edición, sus botones desaparecen: el foco vuelve al «Editar» de esa fila.
  const sectionRef = useRef<HTMLElement>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    if (editingId !== null || returnTo === null) return;
    sectionRef.current?.querySelector<HTMLButtonElement>(`[data-edit-id="${CSS.escape(returnTo)}"]`)?.focus();
    setReturnTo(null);
  }, [editingId, returnTo]);
  const stopEditing = (id: string) => { setReturnTo(id); setEditingId(null); };

  useEffect(() => {
    let active = true;
    void api<{ categories: CustomCategoryView[] }>('/categories').then((body) => { if (active) setCategories(body.categories); })
      .catch((caught: unknown) => { if (active) setError(categoryErrorMessage(caught, 'No se pudieron cargar tus textos personales. Comprueba la conexión.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const run = async (id: string, operation: () => Promise<void>) => {
    setBusyId(id); setError('');
    try { await operation(); } catch (caught) { setError(categoryErrorMessage(caught, 'No se pudo guardar el cambio. Inténtalo de nuevo.')); }
    finally { setBusyId(''); }
  };
  const create = async () => {
    const trimmed = text.trim(); if (trimmed.length < MIN) return;
    await run('new', async () => {
      const body = await api<{ category: CustomCategoryView }>('/categories', { method: 'POST', body: JSON.stringify({ text: trimmed }) });
      setCategories((current) => [...current, body.category]); setText('');
    });
  };
  const update = async (id: string, patch: { text?: string; enabled?: boolean }) => run(id, async () => {
    const body = await api<{ category: CustomCategoryView }>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setCategories((current) => current.map((category) => (category.id === id ? body.category : category)));
    if (patch.text !== undefined) stopEditing(id);
  });
  const remove = async (category: CustomCategoryView) => run(category.id, async () => {
    await api(`/categories/${category.id}`, { method: 'DELETE' });
    setCategories((current) => current.filter((item) => item.id !== category.id));
    newRef.current?.focus();
  });
  const enabledCount = categories.filter((category) => category.enabled).length;
  const locked = disabled || Boolean(busyId);

  return <section ref={sectionRef} className={s.manager} aria-labelledby="custom-categories-title">
    <div className={s.head}>
      <div className={s.headText}>
        <span className={s.kicker}>Cuenta del host</span>
        <h3 id="custom-categories-title" className={s.title}>{title}</h3>
        <p className={s.help}>{description}</p>
      </div>
      <Chip tone={enabledCount >= minimumActive ? 'ok' : 'warn'} icon={<Icon icon={CheckCircle2} size={18} />}>{enabledCount} activas</Chip>
    </div>

    <div className={s.create}>
      <Field ref={newRef} label={newLabel} maxLength={MAX} value={text} placeholder={placeholder} onChange={(event) => setText(event.target.value)} disabled={disabled || busyId === 'new'} className={cx(s.grow)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }} />
      <Pill icon={Plus} loading={busyId === 'new'} disabled={locked || text.trim().length < MIN} onClick={() => void create()} className={s.add}>Añadir</Pill>
    </div>
    {error && <p className={s.error} role="alert">{error}</p>}

    {loading
      ? <StateBox kind="loading" title="Cargando textos…" onCream live={false} />
      : categories.length === 0
        ? <p className={s.empty}>{emptyText}</p>
        : <ul className={s.list}>{categories.map((category) => <li key={category.id} className={category.enabled ? s.item : s.itemOff}>
          {editingId === category.id
            ? <div className={s.editRow}>
              <Field label={editLabel} maxLength={MAX} value={editingText} onChange={(event) => setEditingText(event.target.value)} autoFocus className={cx(s.grow)}
                onKeyDown={(event) => { if (event.key === 'Escape') stopEditing(category.id); }} />
              <div className={s.editActions}>
                <Pill size="small" icon={Save} disabled={locked || editingText.trim().length < MIN} onClick={() => void update(category.id, { text: editingText.trim() })}>Guardar</Pill>
                <Pill variant="cream" size="small" icon={X} onClick={() => stopEditing(category.id)}>Cancelar</Pill>
              </div>
            </div>
            : <div className={s.row}>
              <Pill size="round" variant={category.enabled ? 'yellow' : 'cream'} icon={Power} aria-pressed={category.enabled} aria-label={category.enabled ? `Desactivar ${category.text}` : `Activar ${category.text}`} title={category.enabled ? 'Desactivar' : 'Activar'} disabled={locked} onClick={() => void update(category.id, { enabled: !category.enabled })} />
              <p className={s.text}>{category.text}{!category.enabled && <span className={s.off}> (desactivada)</span>}</p>
              <Pill size="round" variant="cream" icon={Pencil} data-edit-id={category.id} aria-label={`Editar ${category.text}`} title="Editar" disabled={locked} onClick={() => { setEditingId(category.id); setEditingText(category.text); }} />
              <Pill size="round" variant="cream" icon={Trash2} aria-label={`Eliminar ${category.text}`} title="Eliminar" disabled={locked} onClick={() => setRemoving(category)} />
            </div>}
        </li>)}</ul>}

    <Dialog open={removing !== null} title={`¿Eliminar esta ${noun}?`} onClose={() => setRemoving(null)}
      actions={[{ label: 'Eliminar', variant: 'danger', onClick: () => { if (removing) void remove(removing); } }, { label: 'Cancelar', variant: 'cream', autoFocus: true, onClick: () => undefined }]}>
      {removing && <p>«{removing.text}». No se puede deshacer.</p>}
    </Dialog>
  </section>;
}
