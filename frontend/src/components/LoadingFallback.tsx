import { Suspense, type ReactNode } from 'react';
import { Panel, StateBox } from '../ui';
import { LoadErrorBoundary, loadErrorView } from './LoadErrorBoundary';
import s from './LoadingFallback.module.css';

/** Carga de una pantalla perezosa: el esqueleto de `StateBox` dentro de un `Panel`, a lo ancho del armazón. */
export function RouteLoadingFallback() {
  return (
    <div className={s.frame}>
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
    <div className={s.frame}>
      <Panel status={{ kind: 'loading', title: 'Cargando minijuego…' }} />
    </div>
  );
}

/**
 * Error de carga de una pantalla: el `StateBox` de error dentro de un `Panel`, en el mismo hueco que la carga, con
 * «Reintentar» (o «Recargar página», ver `loadErrorView`).
 */
export function RouteLoadError({ attempts, retry }: { attempts: number; retry(): void }) {
  const view = loadErrorView('pantalla', attempts);
  return (
    <div className={s.frame}>
      <Panel status={{ kind: 'error', title: view.title, text: view.text, action: { label: view.actionLabel, onClick: retry } }} />
    </div>
  );
}

/** Error de carga del código de un minijuego; compacto (en los ajustes, sobre crema) o a pantalla, como su carga. */
export function GameLoadError({ attempts, retry, compact = false }: { attempts: number; retry(): void; compact?: boolean }) {
  const view = loadErrorView('minijuego', attempts);
  const status = { kind: 'error', title: view.title, text: view.text, action: { label: view.actionLabel, onClick: retry } } as const;
  if (compact) return <StateBox {...status} onCream />;
  return (
    <div className={s.frame}>
      <Panel status={status} />
    </div>
  );
}

/** Carga perezosa de un minijuego con su error: `Suspense` con `GameLoadingFallback` dentro de `LoadErrorBoundary`. */
export function GameLoad({ children, resetKey, compact = false }: { children: ReactNode; resetKey: string; compact?: boolean }) {
  return (
    <LoadErrorBoundary resetKey={resetKey} fallback={(props) => <GameLoadError {...props} compact={compact} />}>
      <Suspense fallback={<GameLoadingFallback compact={compact} />}>{children}</Suspense>
    </LoadErrorBoundary>
  );
}
