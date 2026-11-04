import type { ChipProps, StateBoxProps } from '../ui';

/** Secciones de la administración, en el orden de las pestañas. */
export type AdminTab = 'rooms' | 'changelog' | 'feedback' | 'games' | 'users' | 'sync';
export type RoomMode = 'active' | 'history';

export const ADMIN_TABS: readonly AdminTab[] = ['rooms', 'changelog', 'feedback', 'games', 'users', 'sync'];

/** Pestaña pedida en la URL (`?tab=`); cualquier otro valor abre «Salas». */
export function initialAdminTab(search: string): AdminTab {
  const requested = new URLSearchParams(search).get('tab');
  return ADMIN_TABS.find((tab) => tab === requested) ?? 'rooms';
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa', CLOSED: 'Cerrada', IN_PROGRESS: 'En progreso', RUNNING: 'Sincronizando', COMPLETED: 'Disponible', NOT_READY: 'Pendiente',
  FAILED: 'Error', IDLE: 'En espera', ABANDONED: 'Abandonada', INTERRUPTED: 'Interrumpida', USER: 'Usuario', ADMIN: 'Administrador',
};

/** En las partidas, `COMPLETED` es una partida terminada (en las fuentes de datos, un dataset disponible). */
const GAME_LABELS: Record<string, string> = { COMPLETED: 'Completada' };

/** Etiqueta en castellano de un estado o rol del servidor; uno desconocido se enseña tal cual. */
export function adminStatusLabel(value: string, scope?: 'game'): string {
  return (scope === 'game' ? GAME_LABELS[value] : undefined) ?? STATUS_LABELS[value] ?? value;
}

/** Tono del chip de un estado: en marcha (info), correcto (ok), con problema (warn), administrador (bad) o neutro. */
export function adminStatusTone(value: string): NonNullable<ChipProps['tone']> {
  if (value === 'ACTIVE' || value === 'IN_PROGRESS' || value === 'RUNNING') return 'info';
  if (value === 'COMPLETED') return 'ok';
  if (value === 'FAILED' || value === 'INTERRUPTED' || value === 'ABANDONED') return 'warn';
  if (value === 'ADMIN') return 'bad';
  return 'neutral';
}

/** Opciones del filtro de estado (o de rol, en usuarios) de cada sección con tabla. */
export function adminStatusOptions(tab: AdminTab): { value: string; label: string }[] {
  if (tab === 'users') return [{ value: '', label: 'Todos los roles' }, { value: 'USER', label: 'Usuarios' }, { value: 'ADMIN', label: 'Administradores' }];
  if (tab === 'games') {
    return [
      { value: '', label: 'Todos los estados' }, { value: 'IN_PROGRESS', label: 'En progreso' }, { value: 'COMPLETED', label: 'Completadas' },
      { value: 'ABANDONED', label: 'Abandonadas' }, { value: 'INTERRUPTED', label: 'Interrumpidas' },
    ];
  }
  return [{ value: '', label: 'Todos los estados' }, { value: 'ACTIVE', label: 'Activas' }, { value: 'CLOSED', label: 'Cerradas' }, { value: 'INTERRUPTED', label: 'Interrumpidas' }];
}

/** Página actual y total para la paginación: «Página 2 de 5 · 87 registros» (el singular, con un solo registro). */
export function paginationText(page: number, totalPages: number, total: number): string {
  return `Página ${page} de ${Math.max(1, totalPages)} · ${total} ${total === 1 ? 'registro' : 'registros'}`;
}

/** Hay página anterior o siguiente. */
export function pageBounds(page: number, totalPages: number): { prev: boolean; next: boolean } {
  return { prev: page > 1, next: page < totalPages };
}

/**
 * Estado de datos de una lista: el error manda (con «Reintentar»), luego la carga sin datos y luego el vacío. Con datos
 * (también mientras se refrescan) no hay aviso.
 */
export function adminListStatus({ error, loading, count, retry, what, empty }: { error: string; loading: boolean; count: number; retry(): void; what: string; empty: { title: string; text: string } }): StateBoxProps | null {
  if (error) return { kind: 'error', title: `No se pudieron cargar ${what}`, text: error, action: { label: 'Reintentar', onClick: retry } };
  if (loading && count === 0) return { kind: 'loading', title: `Cargando ${what}` };
  if (count === 0 && !loading) return { kind: 'empty', ...empty };
  return null;
}

/** Elemento elegido: el pedido si sigue en la lista; si no, el primero (o ninguno). */
export function pickSelected<T extends { id: string }>(items: readonly T[], id: string | null): T | null {
  return items.find((item) => item.id === id) ?? items[0] ?? null;
}

export function formatAdminDate(value: string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function formatAdminTime(value: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeStyle: 'short' }).format(new Date(value));
}

export function formatDuration(value: number): string {
  if (value < 1_000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)} min ${Math.round((value % 60_000) / 1_000)} s`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('es-ES');
}
