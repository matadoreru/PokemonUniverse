import type { AdminActiveRoom, AdminDataSyncItem, AdminGameHistoryItem, AdminRoomHistoryItem, AdminSummary, AdminUserItem, PaginatedAdminResponse } from '@pokemon-universe/shared/public';
import { Activity, CircleAlert, Database, DoorOpen, FileClock, Gamepad2, MessageSquareWarning, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { initialAdminTab, formatAdminTime, type AdminTab, type RoomMode } from '../admin/admin-format';
import { AdminChangelogPanel } from '../admin/AdminChangelogPanel';
import { AdminFeedbackPanel } from '../admin/AdminFeedbackPanel';
import { useListDetail } from '../admin/AdminParts';
import { AdminRecordsView, type AdminRecords } from '../admin/AdminRecords';
import { AdminSyncView, type SyncSource } from '../admin/AdminSyncPanel';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/api-errors';
import { ConfirmDialog, cx, HudPlate, Icon, Screen, TabPanel, Tabs, type TabItem } from '../ui';
import tone from '../styles/tones.module.css';

const emptyPage = <T,>(): PaginatedAdminResponse<T> => ({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
const TAB_ID = 'admin';
const TABS: TabItem<AdminTab>[] = [
  { key: 'rooms', label: 'Salas', icon: DoorOpen },
  { key: 'changelog', label: 'Changelog', icon: FileClock },
  { key: 'feedback', label: 'Feedback', icon: MessageSquareWarning },
  { key: 'games', label: 'Partidas', icon: Gamepad2 },
  { key: 'users', label: 'Usuarios', icon: Users },
  { key: 'sync', label: 'Datos', icon: Database },
];

/** Cifra del resumen en la placa: icono, número grande con numerales tabulares y su etiqueta. */
function SummaryFigure({ icon, label, value }: { icon: LucideIcon; label: string; value: number | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon icon={icon} size={22} className={cx('shrink-0', tone.textSky2)} />
      {/* El número va encima de su etiqueta: en el DOM, `dt` y luego `dd` (orden válido de `<dl>`). */}
      <div className="flex min-w-0 flex-col-reverse">
        <dt className={cx('text-13 font-extrabold', tone.textSky2)}>{label}</dt>
        <dd className={cx('ol font-display text-26 font-extrabold leading-none tabular-nums', tone.textYellow)}>{value ?? '—'}</dd>
      </div>
    </div>
  );
}

/**
 * Administración (spec §2, página larga): la placa con el título y las cifras del resumen; debajo, las secciones en
 * pestañas. Cada sección es una lista y una ficha con su propio scroll (en el móvil, la lista y luego la ficha con
 * «Volver»). Hace las mismas llamadas a `/api/admin/*` que antes.
 */
export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>(() => (typeof window === 'undefined' ? 'rooms' : initialAdminTab(window.location.search)));
  const [roomMode, setRoomMode] = useState<RoomMode>('active');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [rooms, setRooms] = useState<PaginatedAdminResponse<AdminActiveRoom>>(emptyPage);
  const [roomHistory, setRoomHistory] = useState<PaginatedAdminResponse<AdminRoomHistoryItem>>(emptyPage);
  const [games, setGames] = useState<PaginatedAdminResponse<AdminGameHistoryItem>>(emptyPage);
  const [users, setUsers] = useState<PaginatedAdminResponse<AdminUserItem>>(emptyPage);
  const [syncSources, setSyncSources] = useState<AdminDataSyncItem[]>([]);
  const [syncing, setSyncing] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [changelogDirty, setChangelogDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<AdminTab | null>(null);
  const records = useListDetail(tab === 'rooms' ? roomMode : tab);
  const { reset: resetDetail } = records;

  function changeTab(next: AdminTab) {
    if (next === tab) return;
    if (tab === 'changelog' && changelogDirty) { setPendingTab(next); return; }
    setTab(next);
  }

  useEffect(() => { setPage(1); setStatus(''); setSearch(''); resetDetail(); }, [tab, roomMode, resetDetail]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (tab === 'changelog' || tab === 'feedback') {
        setLoading(false); setError('');
        void api<AdminSummary>('/admin/summary').then((data) => { if (active) setSummary(data); }).catch((caught: unknown) => { if (active) setError(apiErrorMessage(caught)); });
        return;
      }
      if (tab === 'sync') {
        setLoading(true); setError('');
        void api<{ sources: AdminDataSyncItem[] }>('/admin/data-sync').then((data) => { if (active) setSyncSources(data.sources); }).catch((caught: unknown) => { if (active) setError(apiErrorMessage(caught)); }).finally(() => { if (active) setLoading(false); });
        return;
      }
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set('search', search);
      if (status) params.set(tab === 'users' ? 'role' : 'status', status);
      const path = tab === 'rooms' ? (roomMode === 'active' ? '/admin/active-rooms' : '/admin/rooms') : `/admin/${tab}`;
      setLoading(true); setError('');
      void Promise.all([api<AdminSummary>('/admin/summary'), api<PaginatedAdminResponse<AdminActiveRoom | AdminRoomHistoryItem | AdminGameHistoryItem | AdminUserItem>>(`${path}?${params}`)])
        .then(([nextSummary, data]) => {
          if (!active) return;
          setSummary(nextSummary);
          if (tab === 'rooms' && roomMode === 'active') setRooms(data as PaginatedAdminResponse<AdminActiveRoom>);
          else if (tab === 'rooms') setRoomHistory(data as PaginatedAdminResponse<AdminRoomHistoryItem>);
          else if (tab === 'games') setGames(data as PaginatedAdminResponse<AdminGameHistoryItem>);
          else setUsers(data as PaginatedAdminResponse<AdminUserItem>);
        })
        .catch((caught: unknown) => { if (active) setError(apiErrorMessage(caught)); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [page, reload, roomMode, search, status, tab]);

  useEffect(() => {
    if (tab !== 'sync') return;
    const interval = window.setInterval(() => void api<{ sources: AdminDataSyncItem[] }>('/admin/data-sync').then((data) => setSyncSources(data.sources)).catch(() => undefined), 5_000);
    return () => window.clearInterval(interval);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'rooms' || roomMode !== 'active') return;
    const interval = window.setInterval(() => {
      void Promise.all([api<AdminSummary>('/admin/summary'), api<PaginatedAdminResponse<AdminActiveRoom>>(`/admin/active-rooms?page=${page}&search=${encodeURIComponent(search)}`)])
        .then(([nextSummary, data]) => { setSummary(nextSummary); setRooms(data); })
        .catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [page, roomMode, search, tab]);

  async function triggerSync(source: SyncSource, full = false) {
    setSyncing(source); setError('');
    try {
      await api(`/admin/data-sync/${source}`, { method: 'POST', body: JSON.stringify({ full, confirmFull: full }) });
      const data = await api<{ sources: AdminDataSyncItem[] }>('/admin/data-sync'); setSyncSources(data.sources);
    } catch (caught) { setError(apiErrorMessage(caught, { fallback: 'No se pudo iniciar la sincronización' })); }
    finally { setSyncing(''); }
  }

  const retry = () => setReload((current) => current + 1);
  const recordsData: AdminRecords = tab === 'rooms'
    ? (roomMode === 'active' ? { kind: 'active', items: rooms.items } : { kind: 'history', items: roomHistory.items })
    : tab === 'games' ? { kind: 'games', items: games.items } : { kind: 'users', items: users.items };
  const currentPage = tab === 'rooms' ? (roomMode === 'active' ? rooms : roomHistory) : tab === 'games' ? games : users;

  return (
    <Screen fill>
      <HudPlate size="header">
        <div className="min-w-0">
          <h1 className={cx('ol2 font-display text-26 font-extrabold leading-tight 2xl:text-34', tone.textWhite)}>Administración de Pokémon Universe</h1>
          <p className={cx('text-13 font-extrabold', tone.textSky2)}>{summary ? `Actualizado ${formatAdminTime(summary.updatedAt)}` : 'Versiones, feedback, salas, partidas y cuentas'}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4" aria-label="Resumen">
          <SummaryFigure icon={DoorOpen} label="Salas activas" value={summary?.activeRooms} />
          <SummaryFigure icon={Activity} label="En juego" value={summary?.gamesInProgress} />
          <SummaryFigure icon={Users} label="Usuarios" value={summary?.registeredUsers} />
          <SummaryFigure icon={CircleAlert} label="Interrumpidas hoy" value={summary?.interruptedToday} />
        </dl>
      </HudPlate>

      <div className="flex flex-col lg:min-h-0 lg:flex-1">
        <Tabs items={TABS} active={tab} onChange={changeTab} label="Secciones de administración" idBase={TAB_ID} className="max-sm:!gap-1.5 max-sm:!px-1 max-sm:[&_svg]:hidden" />
        <TabPanel idBase={TAB_ID} tabKey={tab} className="flex flex-col lg:min-h-0 lg:flex-1">
          {tab === 'sync' ? (
            <AdminSyncView items={syncSources} loading={loading} error={error} syncing={syncing} onSync={(source, full) => void triggerSync(source, full)} onRetry={retry} />
          ) : tab === 'changelog' ? (
            <AdminChangelogPanel onDirtyChange={setChangelogDirty} />
          ) : tab === 'feedback' ? (
            <AdminFeedbackPanel />
          ) : (
            <AdminRecordsView
              tab={tab} roomMode={roomMode} records={recordsData} page={currentPage.page} totalPages={currentPage.totalPages} total={currentPage.total}
              loading={loading} error={error} search={search} status={status} selectedId={records.selectedId} detailOpen={records.detailOpen} titleRef={records.titleRef}
              onRoomMode={setRoomMode} onSearch={setSearch} onStatus={(value) => { setStatus(value); setPage(1); }} onPage={setPage} onRetry={retry} onOpen={records.open} onBack={records.back}
            />
          )}
        </TabPanel>
      </div>

      <ConfirmDialog open={pendingTab !== null} title="¿Descartar los cambios del changelog?" onClose={() => setPendingTab(null)} width={520}
        cancelLabel="Seguir editando" confirmLabel="Descartar" onConfirm={() => { if (pendingTab) setTab(pendingTab); }}>
        <p>Hay cambios del changelog sin guardar. Si cambias de sección, se perderán.</p>
      </ConfirmDialog>
    </Screen>
  );
}
