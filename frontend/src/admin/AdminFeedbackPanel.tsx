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
import { Bug, CheckCircle2, Clock3, Lightbulb, LoaderCircle, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface FeedbackPageResponse extends PaginatedAdminResponse<FeedbackItem> { overview: FeedbackOverview }
const emptyOverview: FeedbackOverview = { newBugs: 0, newSuggestions: 0, reviewing: 0, resolved: 0 };

export function AdminFeedbackPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [overview, setOverview] = useState(emptyOverview);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

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
        .catch((caught: Error) => { if (active) setError(caught.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, reference, reloadVersion, search, status, type]);

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
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo actualizar el estado.'); }
    finally { setSaving(false); }
  }

  return <section className="space-y-5" aria-labelledby="feedback-admin-title">
    <div><h2 id="feedback-admin-title" className="font-display text-2xl font-bold">Feedback de jugadores</h2><p className="mt-1 max-w-3xl text-sm font-semibold text-ink/65">Revisa problemas y sugerencias sobre cualquier parte de Pokémon Universe.</p></div>
    <dl className="panel grid grid-cols-2 divide-x divide-y divide-ink/10 overflow-hidden lg:grid-cols-4 lg:divide-y-0">
      <FeedbackMetric icon={Bug} label="Problemas nuevos" value={overview.newBugs} tone="text-berry" />
      <FeedbackMetric icon={Lightbulb} label="Sugerencias nuevas" value={overview.newSuggestions} tone="text-electric" />
      <FeedbackMetric icon={Clock3} label="En revisión" value={overview.reviewing} tone="text-aqua" />
      <FeedbackMetric icon={CheckCircle2} label="Solucionados" value={overview.resolved} tone="text-leaf" />
    </dl>

    <div className="panel overflow-hidden">
      <div className="grid gap-3 border-b border-ink/10 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <label className="relative"><span className="sr-only">Buscar feedback</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" size={18} /><input className="field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar texto, jugador, sala o minijuego" /></label>
        <label><span className="sr-only">Filtrar tema</span><select className="field" value={reference} onChange={(event) => setReference(event.target.value as FeedbackReference | '')}><option value="">Todos los temas</option>{Object.entries(FEEDBACK_REFERENCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">Filtrar tipo</span><select className="field" value={type} onChange={(event) => setType(event.target.value as FeedbackType | '')}><option value="">Todos los tipos</option><option value="BUG">Problemas</option><option value="SUGGESTION">Sugerencias</option></select></label>
        <label><span className="sr-only">Filtrar estado</span><select className="field" value={status} onChange={(event) => setStatus(event.target.value as FeedbackStatus | '')}><option value="">Todos los estados</option><option value="NEW">Nuevos</option><option value="REVIEWING">Revisando</option><option value="RESOLVED">Solucionados</option></select></label>
      </div>
      {error && <div className="status-error m-4 flex flex-wrap items-center justify-between gap-3" role="alert"><span>{error}</span><button className="btn-ghost text-sm" type="button" onClick={() => setReloadVersion((current) => current + 1)}>Volver a intentar</button></div>}
      {loading && items.length === 0 ? <div className="space-y-2 p-4" role="status" aria-label="Cargando feedback">{Array.from({ length: 4 }, (_, index) => <span className="skeleton block h-20" key={index} />)}</div>
        : items.length === 0 ? <div className="empty-state m-4"><CheckCircle2 className="mx-auto mb-2 text-leaf" /><strong className="font-display text-lg text-ink">No hay feedback con estos filtros</strong><p className="mt-1 text-sm font-semibold">Prueba con otro estado o término de búsqueda.</p></div>
          : <div className="grid min-h-[30rem] lg:grid-cols-[minmax(18rem,.78fr)_minmax(0,1.22fr)]">
            <div className="divide-y divide-ink/10 border-b border-ink/10 lg:border-b-0 lg:border-r">
              {items.map((item) => <button type="button" className={`flex min-h-24 w-full items-start gap-3 p-4 text-left transition-colors hover:bg-ink/[.035] ${selected?.id === item.id ? 'bg-aqua/[.08]' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}><FeedbackTypeIcon type={item.type} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate font-display">{feedbackSubject(item)}</strong><span className="shrink-0 text-xs font-bold text-ink/45">{formatShortDate(item.createdAt)}</span></span><span className="mt-1 block line-clamp-2 text-sm font-semibold text-ink/65">{item.description}</span><span className="mt-2 flex flex-wrap items-center gap-2"><FeedbackStatusBadge status={item.status} /><span className="text-xs font-bold text-ink/50">{item.author.displayName}</span></span></span></button>)}
            </div>
            {selected && <article className="p-4 sm:p-6"><div className="flex flex-col gap-4 border-b border-ink/10 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><FeedbackTypeIcon type={selected.type} /><h3 className="font-display text-2xl font-bold">{FEEDBACK_TYPE_LABELS[selected.type]}</h3><FeedbackStatusBadge status={selected.status} /></div><p className="mt-2 font-extrabold text-ink/70">{feedbackSubject(selected)}</p></div><label className="shrink-0"><span className="label">Estado</span><select className="field min-w-40" value={selected.status} disabled={saving} onChange={(event) => void changeStatus(event.target.value as FeedbackStatus)}>{(['NEW', 'REVIEWING', 'RESOLVED'] as const).map((value) => <option value={value} key={value}>{FEEDBACK_STATUS_LABELS[value]}</option>)}</select></label></div>
              <p className="whitespace-pre-wrap py-6 text-base font-semibold leading-relaxed">{selected.description}</p>
              <dl className="grid gap-3 border-t border-ink/10 pt-5 text-sm sm:grid-cols-2"><Detail label="Tema">{FEEDBACK_REFERENCE_LABELS[selected.reference]}</Detail><Detail label="Enviado por">{selected.author.displayName} · {selected.author.kind === 'USER' ? 'Cuenta registrada' : 'Invitado'}</Detail><Detail label="Fecha">{formatDate(selected.createdAt)}</Detail><Detail label="Sala">{selected.roomCode ?? 'Sin sala asociada'}</Detail><Detail label="Identificador">{selected.id}</Detail></dl>
              {saving && <p className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-aqua" role="status"><LoaderCircle className="animate-spin" size={17} />Actualizando estado…</p>}
            </article>}
          </div>}
      {total > 0 && <div className="flex items-center justify-between gap-3 border-t border-ink/10 px-3 py-3 sm:px-4"><span className="text-sm font-bold text-ink/55">{total} registros</span><div className="flex items-center gap-2"><button className="btn-ghost min-h-11 !px-3 text-sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span className="min-w-16 text-center text-sm font-extrabold">{page} / {totalPages}</span><button className="btn-ghost min-h-11 !px-3 text-sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></div>}
    </div>
  </section>;
}

function FeedbackMetric({ icon: Icon, label, value, tone }: { icon: typeof Bug; label: string; value: number; tone: string }) { return <div className="flex min-h-20 items-center gap-3 p-3 sm:p-4"><Icon className={tone} size={20} /><div><dt className="text-xs font-extrabold text-ink/55">{label}</dt><dd className="font-display text-2xl font-bold tabular-nums">{value}</dd></div></div>; }
function FeedbackTypeIcon({ type }: { type: FeedbackType }) { return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${type === 'BUG' ? 'bg-berry/10 text-berry' : 'bg-electric/10 text-electric'}`} aria-hidden="true">{type === 'BUG' ? <Bug size={18} /> : <Lightbulb size={18} />}</span>; }
function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) { const tone = status === 'NEW' ? 'bg-berry/10 text-berry' : status === 'REVIEWING' ? 'bg-aqua/10 text-aqua' : 'bg-leaf/10 text-leaf'; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${tone}`}>{FEEDBACK_STATUS_LABELS[status]}</span>; }
function feedbackSubject(item: FeedbackItem): string { return item.gameName ?? FEEDBACK_REFERENCE_LABELS[item.reference]; }
function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div><dt className="font-extrabold text-ink/50">{label}</dt><dd className="mt-0.5 break-words font-semibold">{children}</dd></div>; }
function formatDate(value: string): string { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function formatShortDate(value: string): string { return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(value)); }
