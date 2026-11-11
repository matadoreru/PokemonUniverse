import type { CustomWouldYouRatherPromptView } from '@pokemon-universe/shared/public';
import { CheckCircle2, FileJson, Pencil, Plus, Power, Save, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/api-errors';
import { Chip, ConfirmDialog, cx, Field, Icon, Pill, StateBox, TextArea } from '../../ui';
import { parseWouldYouRatherImportJson, WOULD_YOU_RATHER_JSON_EXAMPLE } from './json-import';
import s from './CustomPromptManager.module.css';

const MIN = 4;
const MAX = 180;
const valid = (a: string, b: string) => a.trim().length >= MIN && b.trim().length >= MIN;

/**
 * Dilemas personales del host (Would You Rather) con los controles del catálogo: alta con dos `Field` y «Añadir»,
 * importación JSON (con los errores en castellano bajo el campo), y la lista con activar/desactivar, editar y eliminar
 * (con confirmación en un `Dialog`). Se guardan en la cuenta del host.
 */
export function CustomWouldYouRatherPromptManager({ disabled }: { disabled: boolean }) {
  const [prompts, setPrompts] = useState<CustomWouldYouRatherPromptView[]>([]);
  const [optionA, setOptionA] = useState(''); const [optionB, setOptionB] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingA, setEditingA] = useState(''); const [editingB, setEditingB] = useState('');
  const [busyId, setBusyId] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState(''); const [importError, setImportError] = useState('');
  const [removing, setRemoving] = useState<CustomWouldYouRatherPromptView | null>(null);

  useEffect(() => {
    let active = true;
    void api<{ prompts: CustomWouldYouRatherPromptView[] }>('/would-you-rather-prompts').then((body) => { if (active) setPrompts(body.prompts); })
      .catch((caught: unknown) => { if (active) setError(apiErrorMessage(caught, { fallback: 'No se pudieron cargar tus dilemas.' })); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const run = async (id: string, operation: () => Promise<void>) => {
    setBusyId(id); setError('');
    try { await operation(); } catch (caught) { setError(apiErrorMessage(caught, { fallback: 'No se pudo guardar el cambio.' })); }
    finally { setBusyId(''); }
  };
  const create = async () => {
    const a = optionA.trim(); const b = optionB.trim(); if (!valid(a, b)) return;
    await run('new', async () => {
      const body = await api<{ prompt: CustomWouldYouRatherPromptView }>('/would-you-rather-prompts', { method: 'POST', body: JSON.stringify({ optionA: a, optionB: b }) });
      setPrompts((current) => [...current, body.prompt]); setOptionA(''); setOptionB('');
    });
  };
  const update = async (id: string, patch: { optionA?: string; optionB?: string; enabled?: boolean }) => run(id, async () => {
    const body = await api<{ prompt: CustomWouldYouRatherPromptView }>(`/would-you-rather-prompts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setPrompts((current) => current.map((prompt) => (prompt.id === id ? body.prompt : prompt))); setEditingId(null);
  });
  const remove = async (prompt: CustomWouldYouRatherPromptView) => run(prompt.id, async () => {
    await api(`/would-you-rather-prompts/${prompt.id}`, { method: 'DELETE' });
    setPrompts((current) => current.filter((item) => item.id !== prompt.id));
  });
  const importPrompts = async () => {
    let payload;
    try { payload = parseWouldYouRatherImportJson(importJson); } catch (caught) { setImportError(caught instanceof Error ? caught.message : 'No se pudo leer el JSON.'); return; }
    setImportError('');
    await run('import', async () => {
      const body = await api<{ prompts: CustomWouldYouRatherPromptView[] }>('/would-you-rather-prompts/import', { method: 'POST', body: JSON.stringify(payload) });
      setPrompts((current) => [...current, ...body.prompts]); setImportJson('');
    });
  };
  const enabledCount = prompts.filter((prompt) => prompt.enabled).length;
  const locked = disabled || Boolean(busyId);

  return <section className={s.manager} aria-labelledby="custom-wyr-title">
    <div className={s.head}>
      <div className={s.headText}>
        <span className={s.kicker}>Cuenta del host</span>
        <h3 id="custom-wyr-title" className={s.title}>Mis dilemas</h3>
        <p className={s.help}>Se guardan en tu cuenta y solo se usan en Would You Rather.</p>
      </div>
      <Chip tone={enabledCount >= 1 ? 'ok' : 'warn'} icon={<Icon icon={CheckCircle2} size={18} />}>{enabledCount} activos</Chip>
    </div>

    <div className={s.create}>
      <Field label="Nueva opción A" maxLength={MAX} value={optionA} onChange={(event) => setOptionA(event.target.value)} disabled={disabled || busyId === 'new'} className={cx(s.grow)} />
      <span className={s.versus} aria-hidden="true">VS</span>
      <Field label="Nueva opción B" maxLength={MAX} value={optionB} onChange={(event) => setOptionB(event.target.value)} disabled={disabled || busyId === 'new'} className={cx(s.grow)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }} />
      <Pill icon={Plus} loading={busyId === 'new'} disabled={locked || !valid(optionA, optionB)} onClick={() => void create()} className={s.add}>Añadir</Pill>
    </div>
    {error && <p className={s.error} role="alert">{error}</p>}

    <div className={s.import}>
      <Pill variant="cream" size="small" icon={FileJson} aria-expanded={importOpen} aria-controls="wyr-import" onClick={() => setImportOpen((value) => !value)}>Importar dilemas desde JSON</Pill>
      {importOpen && <div id="wyr-import" className={s.importBody}>
        <p className={s.help}>Formato: objeto con <code>version: 1</code> y <code>prompts</code> (1–100 elementos). Cada elemento necesita <code>optionA</code> y <code>optionB</code>, textos distintos de 4–180 caracteres.</p>
        <TextArea label="JSON para importar" value={importJson} rows={8} onChange={(value) => { setImportJson(value); setImportError(''); }} disabled={locked} error={importError || null} className={cx(s.json)} />
        <div className={s.importActions}>
          <Pill variant="cream" size="small" disabled={locked} onClick={() => { setImportJson(WOULD_YOU_RATHER_JSON_EXAMPLE); setImportError(''); }}>Cargar ejemplo</Pill>
          <Pill size="small" icon={Upload} loading={busyId === 'import'} disabled={locked || !importJson.trim()} onClick={() => void importPrompts()}>Validar e importar</Pill>
        </div>
      </div>}
    </div>

    {loading
      ? <StateBox kind="loading" title="Cargando dilemas…" onCream live={false} />
      : prompts.length === 0
        ? <p className={s.empty}>Todavía no has creado dilemas personales.</p>
        : <ul className={s.list}>{prompts.map((prompt) => <li key={prompt.id} className={prompt.enabled ? s.item : s.itemOff}>
          {editingId === prompt.id
            ? <div className={s.editRow}>
              <Field label="Editar opción A" maxLength={MAX} value={editingA} onChange={(event) => setEditingA(event.target.value)} autoFocus className={cx(s.grow)} />
              <Field label="Editar opción B" maxLength={MAX} value={editingB} onChange={(event) => setEditingB(event.target.value)} className={cx(s.grow)} />
              <div className={s.editActions}>
                <Pill size="small" icon={Save} disabled={locked || !valid(editingA, editingB)} onClick={() => void update(prompt.id, { optionA: editingA.trim(), optionB: editingB.trim() })}>Guardar</Pill>
                <Pill variant="cream" size="small" icon={X} onClick={() => setEditingId(null)}>Cancelar</Pill>
              </div>
            </div>
            : <div className={s.row}>
              <Pill size="round" variant={prompt.enabled ? 'yellow' : 'cream'} icon={Power} aria-pressed={prompt.enabled} aria-label={prompt.enabled ? 'Desactivar dilema' : 'Activar dilema'} title={prompt.enabled ? 'Desactivar dilema' : 'Activar dilema'} disabled={locked} onClick={() => void update(prompt.id, { enabled: !prompt.enabled })} />
              <p className={s.text}><strong>A.</strong> {prompt.optionA} <span className={s.vs}>VS</span> <strong>B.</strong> {prompt.optionB}{!prompt.enabled && <span className={s.off}> (desactivado)</span>}</p>
              <Pill size="round" variant="cream" icon={Pencil} aria-label="Editar dilema" title="Editar dilema" disabled={locked} onClick={() => { setEditingId(prompt.id); setEditingA(prompt.optionA); setEditingB(prompt.optionB); }} />
              <Pill size="round" variant="cream" icon={Trash2} aria-label="Eliminar dilema" title="Eliminar dilema" disabled={locked} onClick={() => setRemoving(prompt)} />
            </div>}
        </li>)}</ul>}

    <ConfirmDialog open={removing !== null} title="¿Eliminar este dilema?" onClose={() => setRemoving(null)} width={520}
      confirmLabel="Eliminar" onConfirm={() => { if (removing) void remove(removing); }}>
      {removing && <p>«{removing.optionA}» contra «{removing.optionB}». No se puede deshacer.</p>}
    </ConfirmDialog>
  </section>;
}
