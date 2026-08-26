import type { AdminActiveRoom, AdminGameHistoryItem, AdminRoomHistoryItem, AdminSummary, AdminUserItem, PaginatedAdminResponse } from '@pokemon-universe/shared';
import { Activity, CircleAlert, DoorOpen, Gamepad2, Search, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type Tab = 'rooms' | 'games' | 'users';
type RoomMode = 'active' | 'history';
const emptyPage = <T,>(): PaginatedAdminResponse<T> => ({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('rooms');
  const [roomMode, setRoomMode] = useState<RoomMode>('active');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [rooms, setRooms] = useState<PaginatedAdminResponse<AdminActiveRoom>>(emptyPage);
  const [roomHistory, setRoomHistory] = useState<PaginatedAdminResponse<AdminRoomHistoryItem>>(emptyPage);
  const [games, setGames] = useState<PaginatedAdminResponse<AdminGameHistoryItem>>(emptyPage);
  const [users, setUsers] = useState<PaginatedAdminResponse<AdminUserItem>>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setPage(1); setStatus(''); setSearch(''); }, [tab, roomMode]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
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
        .catch((caught: Error) => { if (active) setError(caught.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [page, roomMode, search, status, tab]);

  useEffect(() => {
    if (tab !== 'rooms' || roomMode !== 'active') return;
    const interval = window.setInterval(() => {
      void Promise.all([api<AdminSummary>('/admin/summary'), api<PaginatedAdminResponse<AdminActiveRoom>>(`/admin/active-rooms?page=${page}&search=${encodeURIComponent(search)}`)])
        .then(([nextSummary, data]) => { setSummary(nextSummary); setRooms(data); })
        .catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [page, roomMode, search, tab]);

  const currentPage = tab === 'rooms' ? (roomMode === 'active' ? rooms : roomHistory) : tab === 'games' ? games : users;
  const statusOptions = useMemo(() => tab === 'users'
    ? [['', 'Todos los roles'], ['USER', 'Usuarios'], ['ADMIN', 'Administradores']]
    : tab === 'games'
      ? [['', 'Todos los estados'], ['IN_PROGRESS', 'En progreso'], ['COMPLETED', 'Completadas'], ['ABANDONED', 'Abandonadas'], ['INTERRUPTED', 'Interrumpidas']]
      : [['', 'Todos los estados'], ['ACTIVE', 'Activas'], ['CLOSED', 'Cerradas'], ['INTERRUPTED', 'Interrumpidas']], [tab]);

  return <section className="page-shell">
    <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><span className="label">Acceso restringido</span><h1 className="font-display text-3xl font-bold sm:text-4xl">Actividad del universo</h1><p className="mt-1 font-semibold text-ink/65">Consulta operativa de salas, partidas y cuentas registradas.</p></div>
      {summary && <p className="text-sm font-bold text-ink/55">Actualizado {formatTime(summary.updatedAt)}</p>}
    </header>

    <dl className="panel mb-5 grid grid-cols-2 divide-x divide-y divide-ink/10 overflow-hidden md:grid-cols-4 md:divide-y-0">
      <Summary icon={DoorOpen} label="Salas activas" value={summary?.activeRooms} tone="text-aqua" />
      <Summary icon={Activity} label="En juego" value={summary?.gamesInProgress} tone="text-leaf" />
      <Summary icon={Users} label="Usuarios" value={summary?.registeredUsers} tone="text-berry" />
      <Summary icon={CircleAlert} label="Interrumpidas hoy" value={summary?.interruptedToday} tone="text-electric" />
    </dl>

    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-ink/10" role="tablist" aria-label="Secciones de administración">
      {([['rooms', 'Salas', DoorOpen], ['games', 'Partidas', Gamepad2], ['users', 'Usuarios', Users]] as const).map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex min-h-11 min-w-max items-center gap-2 border-b-2 px-4 text-sm font-extrabold transition ${tab === id ? 'border-berry text-ink' : 'border-transparent text-ink/55 hover:text-ink'}`}><Icon size={18} />{label}</button>)}
    </div>

    {tab === 'rooms' && <div className="mb-4 inline-flex rounded-xl bg-ink/[.06] p-1" aria-label="Tipo de salas">
      <button className={`min-h-11 rounded-lg px-4 text-sm font-extrabold ${roomMode === 'active' ? 'bg-surface shadow-card' : 'text-ink/60'}`} onClick={() => setRoomMode('active')}>Activas</button>
      <button className={`min-h-11 rounded-lg px-4 text-sm font-extrabold ${roomMode === 'history' ? 'bg-surface shadow-card' : 'text-ink/60'}`} onClick={() => setRoomMode('history')}>Historial</button>
    </div>}

    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink/10 p-3 sm:flex-row sm:items-center">
        <label className="relative flex-1"><span className="sr-only">Buscar</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" size={18} /><input className="field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'users' ? 'Buscar usuario o email' : 'Buscar sala, anfitrión o jugador'} /></label>
        {!(tab === 'rooms' && roomMode === 'active') && <label><span className="sr-only">Filtrar estado</span><select className="field min-w-48" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      </div>
      {error ? <p className="status-error m-4" role="alert">{error}</p> : loading ? <LoadingRows /> : currentPage.total === 0 ? <div className="empty-state m-4"><ShieldCheck className="mx-auto mb-2" /><strong>No hay registros con estos filtros.</strong></div> : <>
        {tab === 'rooms' && roomMode === 'active' && <ActiveRooms items={rooms.items} />}
        {tab === 'rooms' && roomMode === 'history' && <RoomHistory items={roomHistory.items} />}
        {tab === 'games' && <Games items={games.items} />}
        {tab === 'users' && <UsersTable items={users.items} />}
        <Pagination page={currentPage.page} totalPages={currentPage.totalPages} total={currentPage.total} onPage={setPage} />
      </>}
    </div>
  </section>;
}

function Summary({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number | undefined; tone: string }) {
  return <div className="flex min-h-20 items-center gap-3 p-3 sm:p-4"><Icon className={tone} size={20} /><div><dt className="text-xs font-extrabold text-ink/55">{label}</dt><dd className="font-display text-2xl font-bold">{value ?? '—'}</dd></div></div>;
}

function Status({ value }: { value: string }) {
  const labels: Record<string, string> = { ACTIVE: 'Activa', CLOSED: 'Cerrada', IN_PROGRESS: 'En progreso', COMPLETED: 'Completada', ABANDONED: 'Abandonada', INTERRUPTED: 'Interrumpida', USER: 'Usuario', ADMIN: 'Administrador' };
  const tone = value === 'ACTIVE' || value === 'IN_PROGRESS' ? 'bg-aqua/10 text-aqua' : value === 'COMPLETED' ? 'bg-leaf/10 text-leaf' : value === 'INTERRUPTED' || value === 'ABANDONED' ? 'bg-electric/10 text-electric' : value === 'ADMIN' ? 'bg-berry/10 text-berry' : 'bg-ink/[.07] text-ink/65';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${tone}`}>{labels[value] ?? value}</span>;
}

function ActiveRooms({ items }: { items: AdminActiveRoom[] }) {
  return <ResponsiveRows headers={['Sala', 'Estado', 'Anfitrión', 'Jugadores', 'Minijuego', 'Actualizada']} rows={items.map((room) => ({
    key: room.id,
    cells: [<strong className="font-display text-base" key="code">{room.code}</strong>, <Status key="status" value={room.gameId ? 'IN_PROGRESS' : 'ACTIVE'} />, room.hostDisplayName, `${room.connectedPlayers}/${room.maxPlayers}`, room.gameName ?? 'En el lobby', formatDate(room.updatedAt)],
    title: `Sala ${room.code}`, meta: `${room.connectedPlayers}/${room.maxPlayers} conectados · ${room.gameName ?? 'Lobby'}`,
    details: <><Detail label="Estado"><Status value={room.gameId ? 'IN_PROGRESS' : 'ACTIVE'} /></Detail><Detail label="Anfitrión">{room.hostDisplayName}</Detail><Detail label="Fase">{room.phase}</Detail><Detail label="Participantes">{room.participants.map((participant) => `${participant.displayName}${participant.presence !== 'CONNECTED' ? ' (desconectado)' : ''}`).join(', ') || 'Ninguno'}</Detail><Detail label="Creada">{formatDate(room.createdAt)}</Detail></>,
  }))} />;
}

function RoomHistory({ items }: { items: AdminRoomHistoryItem[] }) {
  return <ResponsiveRows headers={['Sala', 'Estado', 'Anfitrión', 'Partidas', 'Creada', 'Finalizada']} rows={items.map((room) => ({ key: room.id, cells: [<strong key="code">{room.code}</strong>, <Status key="status" value={room.status} />, room.hostDisplayName, room.gamesStarted, formatDate(room.createdAt), room.endedAt ? formatDate(room.endedAt) : '—'], title: `Sala ${room.code}`, meta: `${room.hostDisplayName} · ${room.gamesStarted} partidas`, details: <><Detail label="Estado"><Status value={room.status} /></Detail><Detail label="Capacidad">{room.maxPlayers}</Detail><Detail label="Motivo de cierre">{room.closeReason ?? '—'}</Detail><Detail label="Creada">{formatDate(room.createdAt)}</Detail><Detail label="Finalizada">{room.endedAt ? formatDate(room.endedAt) : '—'}</Detail></> }))} />;
}

function Games({ items }: { items: AdminGameHistoryItem[] }) {
  return <ResponsiveRows headers={['Minijuego', 'Sala', 'Estado', 'Jugadores', 'Inicio', 'Final']} rows={items.map((game) => ({ key: game.id, cells: [<strong key="game">{game.gameName}</strong>, game.roomCode, <Status key="status" value={game.status} />, game.playerCount, formatDate(game.startedAt), game.endedAt ? formatDate(game.endedAt) : '—'], title: game.gameName, meta: `Sala ${game.roomCode} · ${game.playerCount} jugadores`, details: <><Detail label="Estado"><Status value={game.status} /></Detail><Detail label="Inicio">{formatDate(game.startedAt)}</Detail><Detail label="Final">{game.endedAt ? formatDate(game.endedAt) : '—'}</Detail><Detail label="Resultados">{game.participants.length ? game.participants.map((participant) => `${participant.position}. ${participant.displayName} (${participant.points} pt)`).join(' · ') : 'Sin resultado final'}</Detail></> }))} />;
}

function UsersTable({ items }: { items: AdminUserItem[] }) {
  return <ResponsiveRows headers={['Usuario', 'Email', 'Rol', 'Partidas', 'Victorias', 'Registro']} rows={items.map((user) => ({ key: user.id, cells: [<strong key="user">{user.username}</strong>, user.email, <Status key="role" value={user.role} />, user.gamesPlayed, user.gamesWon, formatDate(user.createdAt)], title: user.username, meta: user.email, details: <><Detail label="Rol"><Status value={user.role} /></Detail><Detail label="Partidas">{user.gamesPlayed}</Detail><Detail label="Victorias">{user.gamesWon}</Detail><Detail label="Puntos">{user.totalPoints}</Detail><Detail label="Registro">{formatDate(user.createdAt)}</Detail></> }))} />;
}

interface Row { key: string; cells: React.ReactNode[]; title: string; meta: string; details: React.ReactNode }
function ResponsiveRows({ headers, rows }: { headers: string[]; rows: Row[] }) {
  return <><div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left"><thead className="bg-ink/[.035] text-xs font-extrabold text-ink/55"><tr>{headers.map((header) => <th className="px-4 py-3" key={header} scope="col">{header}</th>)}</tr></thead><tbody className="divide-y divide-ink/10 text-sm font-semibold">{rows.map((row) => <tr className="hover:bg-ink/[.025]" key={row.key}>{row.cells.map((cell, index) => <td className="px-4 py-3" key={headers[index]}>{cell}</td>)}</tr>)}</tbody></table></div><div className="divide-y divide-ink/10 md:hidden">{rows.map((row) => <details className="group" key={row.key}><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><span className="min-w-0"><strong className="block truncate font-display">{row.title}</strong><span className="block truncate text-sm font-semibold text-ink/55">{row.meta}</span></span><span className="text-ink/45 transition group-open:rotate-180">⌄</span></summary><dl className="grid gap-3 bg-ink/[.025] px-4 py-4 text-sm">{row.details}</dl></details>)}</div></>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="font-extrabold text-ink/55">{label}</dt><dd className="break-words font-semibold">{children}</dd></div>; }
function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage(page: number): void }) { return <div className="flex items-center justify-between gap-3 border-t border-ink/10 px-3 py-3 sm:px-4"><span className="text-sm font-bold text-ink/55">{total} registros</span><div className="flex items-center gap-2"><button className="btn-ghost min-h-11 !px-3 text-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><span className="min-w-16 text-center text-sm font-extrabold">{page} / {totalPages}</span><button className="btn-ghost min-h-11 !px-3 text-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Siguiente</button></div></div>; }
function LoadingRows() { return <div className="space-y-px" role="status" aria-label="Cargando registros">{Array.from({ length: 5 }, (_, index) => <div className="flex h-14 items-center gap-4 px-4" key={index}><span className="skeleton h-4 w-20" /><span className="skeleton h-4 flex-1" /><span className="skeleton h-4 w-24" /></div>)}</div>; }
function formatDate(value: string): string { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
function formatTime(value: string): string { return new Intl.DateTimeFormat('es-ES', { timeStyle: 'short' }).format(new Date(value)); }
