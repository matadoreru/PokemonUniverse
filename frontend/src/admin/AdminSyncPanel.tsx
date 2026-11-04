import type { AdminDataSyncItem } from '@pokemon-universe/shared/public';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Dialog, Panel, Pill, StateBox } from '../ui';
import { adminListStatus, formatAdminDate, formatCount, formatDuration } from './admin-format';
import { Detail, DetailGrid, StatusChip } from './AdminParts';

export type SyncSource = 'pokemon' | 'tcg' | 'all';

export interface AdminSyncViewProps {
  items: AdminDataSyncItem[];
  loading: boolean;
  error: string;
  /** Fuente cuya sincronización se está pidiendo ahora mismo ('' si ninguna). */
  syncing: string;
  onSync(source: SyncSource, full?: boolean): void;
  onRetry(): void;
}

const sourceName = (item: AdminDataSyncItem) => (item.source === 'POKEAPI' ? 'PokéAPI' : 'TCGdex');

/**
 * Fuentes de datos: las acciones globales arriba («Forzar Full Sync» pide confirmación en un diálogo) y una ficha por
 * fuente con su píldora de sincronizar arriba, sus cifras y su último error, con scroll propio.
 */
export function AdminSyncView({ items, loading, error, syncing, onSync, onRetry }: AdminSyncViewProps) {
  const [confirmFull, setConfirmFull] = useState(false);
  const active = items.some((item) => item.status === 'RUNNING') || Boolean(syncing);
  const status = adminListStatus({
    error, loading, count: items.length, retry: onRetry, what: 'las fuentes de datos',
    empty: { title: 'No hay fuentes de datos', text: 'El servidor todavía no ha registrado ninguna fuente para sincronizar.' },
  });

  return (
    <section className="flex flex-col gap-4 lg:min-h-0 lg:flex-1" aria-labelledby="data-sync-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 id="data-sync-title" className="font-display text-22 font-extrabold">Fuentes de datos</h2>
          <p className="mt-1 max-w-3xl text-15 font-bold text-[color:var(--ink-2)]">PostgreSQL es la fuente de verdad. Las APIs externas solo actualizan estos datasets y un fallo conserva la última versión válida.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0 lg:flex-nowrap">
          <Pill icon={RefreshCw} disabled={active} onClick={() => onSync('all')}>Sincronizar todo</Pill>
          <Pill variant="danger" icon={TriangleAlert} disabled={active} onClick={() => setConfirmFull(true)}>Forzar Full Sync</Pill>
        </div>
      </div>
      {/* Un fallo al pedir una sincronización, con las fichas ya cargadas: el aviso va encima y las fichas siguen. */}
      {error && items.length > 0 && <StateBox kind="error" title="No se pudo completar la acción" text={error} action={{ label: 'Reintentar', onClick: onRetry }} onCream />}
      {status && !(error && items.length > 0) ? (
        <Panel title="Fuentes" status={status} />
      ) : (
        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] 2xl:gap-6">
          {items.map((item) => (
            <Panel key={item.source} variant="cream" title={sourceName(item)} right={<StatusChip value={item.status} />} scroll className="lg:min-h-0" bodyClassName="flex flex-col gap-5 lg:px-6 lg:py-5">
              {/* La acción de la fuente va arriba: a 1280×720 se alcanza sin desplazar las cifras. */}
              <Pill variant="yellow" icon={RefreshCw} className="self-start" loading={item.status === 'RUNNING'} disabled={active} onClick={() => onSync(item.source === 'POKEAPI' ? 'pokemon' : 'tcg')}>
                {item.source === 'POKEAPI' ? 'Sincronizar Pokémon' : 'Sincronizar TCG'}
              </Pill>
              <DetailGrid>
                <Detail label="Última sync">{item.lastSyncAt ? formatAdminDate(item.lastSyncAt) : 'Nunca'}</Detail>
                <Detail label="Duración">{item.durationMs === null ? '—' : formatDuration(item.durationMs)}</Detail>
                <Detail label="Procesados">{formatCount(item.recordsProcessed)}</Detail>
                <Detail label="Disponibles">{formatCount(item.recordsAvailable)}</Detail>
                <Detail label="Insertados">{formatCount(item.inserted)}</Detail>
                <Detail label="Actualizados">{formatCount(item.updated)}</Detail>
                <Detail label="Omitidos">{formatCount(item.skipped)}</Detail>
                <Detail label="Próxima">{formatAdminDate(item.nextSyncAt)}</Detail>
              </DetailGrid>
              {item.error && <p className="rounded-[var(--r-franja)] border-[2.5px] border-[color:var(--red-text)] bg-[var(--cream-2)] px-3 py-2 text-15 font-bold text-[color:var(--red-text)]" role="status">{item.error}</p>}
            </Panel>
          ))}
        </div>
      )}
      <Dialog
        open={confirmFull}
        title="¿Forzar el Full Sync?"
        onClose={() => setConfirmFull(false)}
        actions={[{ label: 'Forzar Full Sync', variant: 'danger', onClick: () => onSync('all', true) }, { label: 'Cancelar', variant: 'cream', autoFocus: true, onClick: () => undefined }]}
      >
        <p>El Full Sync vuelve a consultar todo el dataset. Los datos actuales se conservarán si la fuente falla.</p>
      </Dialog>
    </section>
  );
}
