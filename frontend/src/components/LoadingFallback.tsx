export function RouteLoadingFallback() {
  return <section className="page-shell" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">Cargando pantalla…</span>
    <div className="panel space-y-4 p-5" aria-hidden="true">
      <div className="skeleton h-7 w-48" />
      <div className="skeleton h-4 max-w-2xl" />
      <div className="skeleton h-32" />
    </div>
  </section>;
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
