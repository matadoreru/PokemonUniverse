import type { AdminActiveRoom, AdminGameHistoryItem, AdminRoomHistoryItem, AdminUserItem } from '@pokemon-universe/shared/public';
import { Search } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { cx, Field, Panel, Row, Segmented, SelectField } from '../ui';
import { adminListStatus, adminStatusOptions, formatAdminDate, formatCount, pickSelected, type AdminTab, type RoomMode } from './admin-format';
import { Detail, DetailGrid, ListDetail, MetaParts, Pagination, rowControlId, SelectRow, StatusChip } from './AdminParts';

/** Registros de una sección con tabla, según su tipo. */
export type AdminRecords =
  | { kind: 'active'; items: AdminActiveRoom[] }
  | { kind: 'history'; items: AdminRoomHistoryItem[] }
  | { kind: 'games'; items: AdminGameHistoryItem[] }
  | { kind: 'users'; items: AdminUserItem[] };

export interface AdminRecordsViewProps {
  tab: Extract<AdminTab, 'rooms' | 'games' | 'users'>;
  roomMode: RoomMode;
  records: AdminRecords;
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  error: string;
  search: string;
  status: string;
  selectedId: string | null;
  detailOpen: boolean;
  titleRef?: Ref<HTMLHeadingElement>;
  onRoomMode(mode: RoomMode): void;
  onSearch(value: string): void;
  onStatus(value: string): void;
  onPage(page: number): void;
  onRetry(): void;
  onOpen(id: string): void;
  onBack(): void;
}

const dash = (value: string | null) => (value ? formatAdminDate(value) : '—');

/** Franja y ficha de un registro, comunes a todos los tipos. */
interface RecordView {
  id: string;
  name: string;
  meta: ReactNode;
  status: string;
  title: string;
  detail: ReactNode;
}

function activeRoom(room: AdminActiveRoom): RecordView {
  const status = room.gameId ? 'IN_PROGRESS' : 'ACTIVE';
  return {
    id: room.id, name: room.code, status, title: `Sala ${room.code}`,
    meta: <MetaParts parts={[room.hostDisplayName, `${room.connectedPlayers}/${room.maxPlayers} conectados`]} />,
    detail: <>
      <DetailGrid>
        <Detail label="Estado"><StatusChip value={status} /></Detail>
        <Detail label="Anfitrión">{room.hostDisplayName}</Detail>
        <Detail label="Jugadores">{room.connectedPlayers}/{room.maxPlayers} conectados</Detail>
        <Detail label="Minijuego">{room.gameName ?? 'En el lobby'}</Detail>
        <Detail label="Fase">{room.phase}</Detail>
        <Detail label="Creada">{formatAdminDate(room.createdAt)}</Detail>
        <Detail label="Actualizada">{formatAdminDate(room.updatedAt)}</Detail>
      </DetailGrid>
      <h3 className="mt-6 font-display text-18 font-extrabold">Participantes</h3>
      {room.participants.length === 0
        ? <p className="mt-2 text-15 font-bold text-[color:var(--ink-2)]">Ninguno</p>
        : <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2" aria-label="Participantes">
          {room.participants.map((participant) => (
            <li key={participant.id}>
              <Row name={participant.displayName} meta={`${participant.kind === 'USER' ? 'Cuenta registrada' : 'Invitado'}${participant.roomRole === 'HOST' ? ' · Anfitrión' : participant.roomRole === 'CO_HOST' ? ' · Coanfitrión' : ''}`} disconnected={participant.presence !== 'CONNECTED'} />
            </li>
          ))}
        </ul>}
    </>,
  };
}

function roomHistory(room: AdminRoomHistoryItem): RecordView {
  return {
    id: room.id, name: room.code, status: room.status, title: `Sala ${room.code}`,
    meta: <MetaParts parts={[room.hostDisplayName, `${room.gamesStarted} partidas`]} />,
    detail: <DetailGrid>
      <Detail label="Estado"><StatusChip value={room.status} /></Detail>
      <Detail label="Anfitrión">{room.hostDisplayName}</Detail>
      <Detail label="Capacidad">{room.maxPlayers}</Detail>
      <Detail label="Partidas">{room.gamesStarted}</Detail>
      <Detail label="Creada">{formatAdminDate(room.createdAt)}</Detail>
      <Detail label="Finalizada">{dash(room.endedAt)}</Detail>
      <Detail label="Motivo de cierre" wide>{room.closeReason ?? '—'}</Detail>
    </DetailGrid>,
  };
}

function game(item: AdminGameHistoryItem): RecordView {
  return {
    id: item.id, name: item.gameName, status: item.status, title: item.gameName,
    meta: <MetaParts parts={[`Sala ${item.roomCode}`, `${item.playerCount} jugadores`]} />,
    detail: <>
      <DetailGrid>
        <Detail label="Estado"><StatusChip value={item.status} scope="game" /></Detail>
        <Detail label="Sala">{item.roomCode}</Detail>
        <Detail label="Jugadores">{item.playerCount}</Detail>
        <Detail label="Inicio">{formatAdminDate(item.startedAt)}</Detail>
        <Detail label="Final">{dash(item.endedAt)}</Detail>
      </DetailGrid>
      <h3 className="mt-6 font-display text-18 font-extrabold">Resultados</h3>
      {item.participants.length === 0
        ? <p className="mt-2 text-15 font-bold text-[color:var(--ink-2)]">Sin resultado final</p>
        : <ol className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2" aria-label="Resultados">
          {item.participants.map((participant) => (
            <li key={`${participant.position}-${participant.displayName}`}>
              <Row rank={participant.position} name={participant.displayName} value={`${participant.points} pt`} />
            </li>
          ))}
        </ol>}
    </>,
  };
}

function user(item: AdminUserItem): RecordView {
  return {
    id: item.id, name: item.username, status: item.role, title: item.username,
    meta: <span className="truncate" title={item.email}>{item.email}</span>,
    detail: <DetailGrid>
      <Detail label="Rol"><StatusChip value={item.role} /></Detail>
      <Detail label="Email">{item.email}</Detail>
      <Detail label="Partidas">{formatCount(item.gamesPlayed)}</Detail>
      <Detail label="Victorias">{formatCount(item.gamesWon)}</Detail>
      <Detail label="Puntos">{formatCount(item.totalPoints)}</Detail>
      <Detail label="Registro">{formatAdminDate(item.createdAt)}</Detail>
    </DetailGrid>,
  };
}

export function recordViews(records: AdminRecords): RecordView[] {
  switch (records.kind) {
    case 'active': return records.items.map(activeRoom);
    case 'history': return records.items.map(roomHistory);
    case 'games': return records.items.map(game);
    case 'users': return records.items.map(user);
  }
}

const LIST_TITLES: Record<AdminRecords['kind'], string> = { active: 'Salas activas', history: 'Historial de salas', games: 'Partidas', users: 'Usuarios' };
const WHAT: Record<AdminRecords['kind'], string> = { active: 'las salas', history: 'las salas', games: 'las partidas', users: 'los usuarios' };

/**
 * Salas (activas o historial), partidas y usuarios: filtros arriba; debajo, la lista paginada en franjas y la ficha del
 * registro abierto, cada una con su scroll. Sin registros, un único panel con el vacío, la carga o el error.
 */
export function AdminRecordsView(props: AdminRecordsViewProps) {
  const { tab, roomMode, records, page, totalPages, total, loading, error, search, status, selectedId, detailOpen, titleRef } = props;
  const views = recordViews(records);
  const listStatus = adminListStatus({
    error, loading, count: loading ? 0 : views.length, retry: props.onRetry, what: WHAT[records.kind],
    empty: { title: 'No hay registros con estos filtros', text: 'Prueba con otra búsqueda u otro estado.' },
  });
  const selected = pickSelected(views, selectedId);
  const scope = records.kind;

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
      {/* En el móvil, con la ficha abierta, solo se ven la ficha y «Volver». */}
      <div className={cx('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end', detailOpen && 'max-lg:hidden')}>
        {tab === 'rooms' && <Segmented label="Tipo de salas" className="sm:min-w-[15rem]" value={roomMode} onChange={props.onRoomMode} options={[{ value: 'active', label: 'Activas' }, { value: 'history', label: 'Historial' }]} />}
        <Field label="Buscar" hideLabel icon={Search} className="min-w-0 flex-1" value={search} onChange={(event) => props.onSearch(event.target.value)} placeholder={tab === 'users' ? 'Buscar usuario o email' : 'Buscar sala, anfitrión o jugador'} />
        {!(tab === 'rooms' && roomMode === 'active') && <SelectField label="Filtrar estado" hideLabel className="sm:w-60" value={status} onChange={props.onStatus} options={adminStatusOptions(tab)} />}
      </div>
      {listStatus || !selected ? (
        <Panel title={LIST_TITLES[scope]} status={listStatus} className="lg:min-h-0 lg:flex-1" />
      ) : (
        <ListDetail
          detailOpen={detailOpen}
          onBack={props.onBack}
          list={<>
            <Panel title={LIST_TITLES[scope]} right={`${total} ${total === 1 ? 'registro' : 'registros'}`} scroll scrollLabel={`Lista de ${LIST_TITLES[scope].toLowerCase()}`} className="lg:min-h-0 lg:flex-1">
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 p-1" aria-label={LIST_TITLES[scope]}>
                {views.map((view) => (
                  <li key={view.id}>
                    <SelectRow id={rowControlId(scope, view.id)} current={view.id === selected.id} openLabel={`Ver ${view.title}`} onOpen={() => props.onOpen(view.id)} name={view.name} meta={view.meta}>
                      {/* En usuarios solo se marca el rol de administrador: el email necesita el sitio. */}
                      {view.status !== 'USER' && <StatusChip value={view.status} {...(records.kind === 'games' ? { scope: 'game' as const } : {})} />}
                    </SelectRow>
                  </li>
                ))}
              </ul>
            </Panel>
            <Pagination label={`Páginas de ${LIST_TITLES[scope].toLowerCase()}`} page={page} totalPages={totalPages} total={total} onPage={props.onPage} />
          </>}
          detail={<Panel variant="cream" title={selected.title} {...(titleRef ? { titleRef } : {})} scroll className="lg:min-h-0 lg:flex-1" bodyClassName="lg:px-6 lg:py-5">{selected.detail}</Panel>}
        />
      )}
    </div>
  );
}
