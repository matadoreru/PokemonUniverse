import { Panel, StateBox } from '../ui';

/** Carga de una pantalla perezosa: el esqueleto de `StateBox` dentro de un `Panel`, a lo ancho del armazón. */
export function RouteLoadingFallback() {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 lg:p-6">
      <Panel status={{ kind: 'loading', title: 'Cargando pantalla…' }} />
    </div>
  );
}

/**
 * Carga del código de un minijuego: el esqueleto de `StateBox` (su única región viva, `role="status"`). Compacto, tal
 * cual (dentro de los ajustes, sobre crema); a pantalla, dentro de un `Panel` como el de las rutas.
 */
export function GameLoadingFallback({ compact = false }: { compact?: boolean }) {
  if (compact) return <StateBox kind="loading" title="Cargando minijuego…" onCream />;
  return (
    <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 lg:p-6">
      <Panel status={{ kind: 'loading', title: 'Cargando minijuego…' }} />
    </div>
  );
}
