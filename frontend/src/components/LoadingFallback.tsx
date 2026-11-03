import { Panel } from '../ui';

/** Carga de una pantalla perezosa: el esqueleto de `StateBox` dentro de un `Panel`, a lo ancho del armazón. */
export function RouteLoadingFallback() {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 lg:p-6">
      <Panel status={{ kind: 'loading', title: 'Cargando pantalla…' }} />
    </div>
  );
}

export function GameLoadingFallback({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? 'space-y-3 py-2' : 'page-shell'} role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">Cargando minijuego…</span>
    <div className={`${compact ? '' : 'panel p-5'} space-y-4`} aria-hidden="true">
      <div className="skeleton h-6 w-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="skeleton h-20" />
        <div className="skeleton h-20" />
      </div>
    </div>
  </div>;
}
