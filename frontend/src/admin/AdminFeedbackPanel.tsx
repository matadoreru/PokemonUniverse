import {
  FEEDBACK_REFERENCE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  type FeedbackItem,
  type FeedbackOverview,
  type FeedbackReference,
  type FeedbackStatus,
  type FeedbackType,
  type PaginatedAdminResponse,
} from '@pokemon-universe/shared/public';
import { Search } from 'lucide-react';
import { useEffect, useState, type Ref } from 'react';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/api-errors';
import { Badge, Chip, cx, Field, Panel, SelectField, StateBox, type ChipProps } from '../ui';
import { adminListStatus, pickSelected } from './admin-format';
import { Detail, DetailGrid, ListDetail, MetaParts, Pagination, rowControlId, SelectRow, useListDetail } from './AdminParts';
import tone from '../styles/tones.module.css';

interface FeedbackPageResponse extends PaginatedAdminResponse<FeedbackItem> { overview: FeedbackOverview }
const emptyOverview: FeedbackOverview = { newBugs: 0, newSuggestions: 0, reviewing: 0, resolved: 0 };

const STATUS_TONE: Record<FeedbackStatus, NonNullable<ChipProps['tone']>> = { NEW: 'bad', REVIEWING: 'info', RESOLVED: 'ok' };
const STATUS_OPTIONS = [{ value: '', label: 'Todos los estados' }, { value: 'NEW', label: 'Nuevos' }, { value: 'REVIEWING', label: 'Revisando' }, { value: 'RESOLVED', label: 'Solucionados' }];
const TYPE_OPTIONS = [{ value: '', label: 'Todos los tipos' }, { value: 'BUG', label: 'Problemas' }, { value: 'SUGGESTION', label: 'Sugerencias' }];
const REFERENCE_OPTIONS = [{ value: '', label: 'Todos los temas' }, ...Object.entries(FEEDBACK_REFERENCE_LABELS).map(([value, label]) => ({ value, label }))];

/** Tema de un feedback: el minijuego si lo hay; si no, el tema elegido. */
export function feedbackSubject(item: FeedbackItem): string {
  return item.gameName ?? FEEDBACK_REFERENCE_LABELS[item.reference];
}

function formatDate(value: string): string { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function formatShortDate(value: string): string { return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(value)); }

export interface AdminFeedbackViewProps {
  items: FeedbackItem[];
  overview: FeedbackOverview;
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  saving: boolean;
  error: string;
  search: string;
  reference: FeedbackReference | '';
  status: FeedbackStatus | '';
  type: FeedbackType | '';
  selectedId: string | null;
  detailOpen: boolean;
  titleRef?: Ref<HTMLHeadingElement>;
  onSearch(value: string): void;
  onReference(value: FeedbackReference | ''): void;
  onStatus(value: FeedbackStatus | ''): void;
  onType(value: FeedbackType | ''): void;
  onPage(page: number): void;
  onRetry(): void;
  onOpen(id: string): void;
  onBack(): void;
  onChangeStatus(status: FeedbackStatus): void;
}

/**
 * Bandeja de feedback: el resumen en insignias, los filtros y, debajo, la lista paginada y la ficha del mensaje abierto
 * (con su cambio de estado), cada una con su scroll.
 */
export function AdminFeedbackView(props: AdminFeedbackViewProps) {
  const { items, overview, page, totalPages, total, loading, saving, error, search, reference, status, type, selectedId, detailOpen, titleRef } = props;
  const listStatus = adminListStatus({
    error: items.length ? '' : error, loading, count: items.length, retry: props.onRetry, what: 'el feedback',
    empty: { title: 'No hay feedback con estos filtros', text: 'Prueba con otro estado o término de búsqueda.' },
  });
  const selected = pickSelected(items, selectedId);

  return (
    <section className="flex flex-col gap-4 lg:min-h-0 lg:flex-1" aria-labelledby="feedback-admin-title">
      <div className={cx('flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between', detailOpen && 'max-lg:hidden')}>
        <h2 id="feedback-admin-title" className="font-display text-22 font-extrabold">Feedback de jugadores</h2>
        <dl className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Resumen del feedback">
          {([['Problemas nuevos', overview.newBugs], ['Sugerencias nuevas', overview.newSuggestions], ['En revisión', overview.reviewing], ['Solucionados', overview.resolved]] as const).map(([label, value]) => (
            <div key={label} className="flex items-center gap-2">
              <dt className={cx('text-13 font-extrabold', tone.textInk2)}>{label}</dt>
              <dd><Badge tone="navy">{value}</Badge></dd>
            </div>
          ))}
        </dl>
      </div>
      <div className={cx('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end', detailOpen && 'max-lg:hidden')}>
        <Field label="Buscar feedback" hideLabel icon={Search} className="min-w-0 flex-1 sm:min-w-[16rem]" value={search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Buscar texto, jugador, sala o minijuego" />
        <SelectField label="Filtrar tema" hideLabel className="sm:w-60" value={reference} onChange={(value) => props.onReference(value as FeedbackReference | '')} options={REFERENCE_OPTIONS} />
        <SelectField label="Filtrar tipo" hideLabel className="sm:w-52" value={type} onChange={(value) => props.onType(value as FeedbackType | '')} options={TYPE_OPTIONS} />
        <SelectField label="Filtrar estado" hideLabel className="sm:w-52" value={status} onChange={(value) => props.onStatus(value as FeedbackStatus | '')} options={STATUS_OPTIONS} />
      </div>
      {/* Un fallo con la bandeja ya cargada (p. ej. al cambiar un estado): el aviso va encima y la lista sigue. */}
      {error && items.length > 0 && <StateBox kind="error" title="No se pudo actualizar el feedback" text={error} action={{ label: 'Reintentar', onClick: props.onRetry }} onCream />}
      {listStatus || !selected ? (
        <Panel title="Bandeja" status={listStatus} className="lg:min-h-0 lg:flex-1" />
      ) : (
        <ListDetail
          detailOpen={detailOpen}
          onBack={props.onBack}
          list={<>
            <Panel title="Bandeja" right={`${total} ${total === 1 ? 'mensaje' : 'mensajes'}`} scroll scrollLabel="Lista de feedback" className="lg:min-h-0 lg:flex-1">
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 p-1" aria-label="Feedback">
                {items.map((item) => (
                  <li key={item.id}>
                    <SelectRow
                      id={rowControlId('feedback', item.id)}
                      current={item.id === selected.id}
                      openLabel={`Ver feedback de ${item.author.displayName}`}
                      onOpen={() => props.onOpen(item.id)}
                      name={feedbackSubject(item)}
                      meta={<MetaParts parts={[FEEDBACK_TYPE_LABELS[item.type], item.author.displayName, formatShortDate(item.createdAt)]} />}
                    >
                      <Chip tone={STATUS_TONE[item.status]}>{FEEDBACK_STATUS_LABELS[item.status]}</Chip>
                    </SelectRow>
                  </li>
                ))}
              </ul>
            </Panel>
            <Pagination label="Páginas de feedback" page={page} totalPages={totalPages} total={total} onPage={props.onPage} />
          </>}
          detail={
            <Panel variant="cream" title={`${FEEDBACK_TYPE_LABELS[selected.type]} · ${feedbackSubject(selected)}`} {...(titleRef ? { titleRef } : {})} scroll className="lg:min-h-0 lg:flex-1" bodyClassName="flex flex-col gap-5 lg:px-6 lg:py-5">
              <div className="flex flex-wrap items-end gap-3">
                <SelectField label="Estado" className="w-full sm:w-60" value={selected.status} disabled={saving} onChange={(value) => props.onChangeStatus(value as FeedbackStatus)} options={(['NEW', 'REVIEWING', 'RESOLVED'] as const).map((value) => ({ value, label: FEEDBACK_STATUS_LABELS[value] }))} />
                {saving && <span className={cx('pb-3 text-15 font-extrabold', tone.textInk2)} role="status">Actualizando estado…</span>}
              </div>
              <p className="whitespace-pre-wrap text-18 font-bold leading-relaxed">{selected.description}</p>
              <DetailGrid>
                <Detail label="Tema">{FEEDBACK_REFERENCE_LABELS[selected.reference]}</Detail>
                <Detail label="Enviado por">{selected.author.displayName} · {selected.author.kind === 'USER' ? 'Cuenta registrada' : 'Invitado'}</Detail>
                <Detail label="Fecha">{formatDate(selected.createdAt)}</Detail>
                <Detail label="Sala">{selected.roomCode ?? 'Sin sala asociada'}</Detail>
                <Detail label="Identificador" wide>{selected.id}</Detail>
              </DetailGrid>
            </Panel>
          }
        />
      )}
    </section>
  );
}

/** Bandeja de feedback de la administración: mismas llamadas que antes (`GET /admin/feedback`, `PATCH …/status`). */
export function AdminFeedbackPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [overview, setOverview] = useState(emptyOverview);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [reference, setReference] = useState<FeedbackReference | ''>('');
  const [status, setStatus] = useState<FeedbackStatus | ''>('NEW');
  const [type, setType] = useState<FeedbackType | ''>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const detail = useListDetail('feedback');
  const { setSelectedId } = detail;
  const selected = pickSelected(items, detail.selectedId);

  useEffect(() => { setPage(1); }, [reference, search, status, type]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set('search', search);
      if (reference) params.set('reference', reference);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      setLoading(true); setError('');
      void api<FeedbackPageResponse>(`/admin/feedback?${params}`)
        .then((response) => {
          if (!active) return;
          setItems(response.items); setOverview(response.overview); setTotal(response.total); setTotalPages(response.totalPages);
          setSelectedId((current) => response.items.some((item) => item.id === current) ? current : response.items[0]?.id ?? null);
        })
        .catch((caught: unknown) => { if (active) setError(apiErrorMessage(caught)); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, reference, reloadVersion, search, setSelectedId, status, type]);

  async function changeStatus(nextStatus: FeedbackStatus) {
    if (!selected || selected.status === nextStatus) return;
    setSaving(true); setError('');
    try {
      const response = await api<{ feedback: FeedbackItem }>(`/admin/feedback/${selected.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      setItems((current) => current.map((item) => item.id === response.feedback.id ? response.feedback : item));
      const refreshed = await api<FeedbackPageResponse>('/admin/feedback?page=1');
      setOverview(refreshed.overview);
      if (status && status !== nextStatus) {
        setItems((current) => current.filter((item) => item.id !== response.feedback.id));
        setTotal((current) => Math.max(0, current - 1));
      }
    } catch (caught) { setError(apiErrorMessage(caught, { fallback: 'No se pudo actualizar el estado.' })); }
    finally { setSaving(false); }
  }

  return (
    <AdminFeedbackView
      items={items} overview={overview} page={page} totalPages={totalPages} total={total} loading={loading} saving={saving} error={error}
      search={search} reference={reference} status={status} type={type} selectedId={detail.selectedId} detailOpen={detail.detailOpen} titleRef={detail.titleRef}
      onSearch={setSearch} onReference={setReference} onStatus={setStatus} onType={setType} onPage={setPage}
      onRetry={() => setReloadVersion((current) => current + 1)} onOpen={detail.open} onBack={detail.back}
      onChangeStatus={(next) => void changeStatus(next)}
    />
  );
}
