import type { ChangelogEntry } from '@pokemon-universe/shared/public';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatChangelogDate, PatchNotes } from '../changelog/ChangelogEntryView';
import { useChangelog } from '../changelog/ChangelogContext';
import { selectedChangelogEntry, unreadVersions } from '../changelog/changelog-state';
import { Badge, cx, Panel, PillLink, Screen, ScreenHeader, Timeline, TimelineLink, type StateBoxProps } from '../ui';

const NONE: ReadonlySet<string> = new Set();

/**
 * Versiones sin leer al llegar a la página. Se guardan una sola vez, con la primera lista cargada, antes de
 * `markAllRead()`: después el contador del contexto baja a 0 y las insignias «Nueva» desaparecerían.
 */
function useUnreadOnArrival(entries: readonly ChangelogEntry[], loading: boolean, unreadCount: number, markAllRead: () => void): ReadonlySet<string> {
  const snapshot = useRef<ReadonlySet<string> | null>(null);
  if (snapshot.current === null && !loading && entries.length > 0) snapshot.current = unreadVersions(entries, unreadCount);
  useEffect(() => { if (!loading && entries.length) markAllRead(); }, [entries.length, loading, markAllRead]);
  return snapshot.current ?? NONE;
}

/**
 * Novedades como página de lista y detalle (spec §2). En escritorio, la lista de versiones a la izquierda y la versión
 * abierta en un panel crema a la derecha, cada uno con su scroll y sin scroll de página. En móvil se ve la lista y, al
 * tocar una versión, solo su detalle con «Volver». La versión abierta va en la URL (`?v=0.9.0`), así que el botón atrás
 * del navegador también vuelve a la lista; sin `?v` (o con una que no existe) el escritorio enseña la última.
 */
export function ChangelogPage() {
  const { entries, loading, error, unreadCount, markAllRead, refresh } = useChangelog();
  const unread = useUnreadOnArrival(entries, loading, unreadCount, markAllRead);
  const [params] = useSearchParams();
  const selected = selectedChangelogEntry(entries, params.get('v'));
  const shown = selected ?? entries[0];

  // El error del servidor puede llegar en inglés («Failed to fetch»): el texto es fijo y en español.
  const status: StateBoxProps | null = error
    ? { kind: 'error', title: 'No se pudieron cargar las novedades', text: 'Comprueba la conexión y vuelve a intentarlo.', action: { label: 'Reintentar', onClick: () => void refresh() } }
    : loading
      ? { kind: 'loading', title: 'Cargando novedades' }
      : !shown
        ? { kind: 'empty', title: 'Todavía no hay notas publicadas', text: 'Las próximas versiones aparecerán aquí en cuanto estén listas. Mientras tanto, crea una sala y juega con tus amigos.' }
        : null;

  return (
    // Con versiones llena el alto (dos paneles con scroll propio); sin ellas, el aviso va centrado.
    <Screen width={status || !shown ? 'medium' : 'wide'} fill={!status && Boolean(shown)}>
      <ScreenHeader title="Novedades" subtitle="Las notas de cada parche: lo nuevo, los ajustes y las correcciones." />
      {status || !shown ? (
        <Panel title="Versiones publicadas" status={status} className="w-full" />
      ) : (
        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-6 2xl:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)] 2xl:gap-8">
          <Panel title="Versiones" right={`${entries.length} ${entries.length === 1 ? 'versión' : 'versiones'}`} scroll className={cx(selected && 'max-lg:hidden')}>
            <Timeline label="Versiones publicadas">
              {entries.map((entry) => (
                <TimelineLink key={entry.id} to={`/changelog?v=${encodeURIComponent(entry.version)}`} current={entry.id === shown.id} version={entry.version} title={entry.title} date={formatChangelogDate(entry.date)} dateTime={entry.date}>
                  {unread.has(entry.version) && <Badge tone="navy">Nueva</Badge>}
                </TimelineLink>
              ))}
            </Timeline>
          </Panel>
          <div className={cx('flex min-h-0 flex-col gap-3', !selected && 'max-lg:hidden')}>
            <PillLink to="/changelog" variant="cream" icon={ArrowLeft} className="self-start lg:hidden">Volver</PillLink>
            <Panel variant="cream" title="Notas del parche" scroll className="lg:min-h-0 lg:flex-1" bodyClassName="p-4 lg:px-6 lg:py-6">
              <PatchNotes entry={shown} latest={shown.id === entries[0]?.id} />
            </Panel>
          </div>
        </div>
      )}
    </Screen>
  );
}
