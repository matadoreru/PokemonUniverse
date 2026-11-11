import { createElement, lazy, type ComponentType, type LazyExoticComponent } from 'react';

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;

/** Cargas que han fallado desde el último reintento: `retryFailedLoads` les da un `lazy` nuevo. */
const failed = new Set<() => void>();
/** Los envoltorios creados por `retryableLazy`. */
const retryables = new WeakSet<object>();

/**
 * Componente perezoso que se puede reintentar. `React.lazy` guarda el rechazo para siempre (volver a pintarlo lanza el
 * mismo error), así que cada carga fallida se apunta y `retryFailedLoads` la cambia por un `lazy` nuevo, que repite el
 * `import()`. `preload` comparte la carga en curso con el componente y, si falla, la suelta para el siguiente intento.
 */
export function retryableLazy<P extends object>(loader: Loader<P>): { Component: ComponentType<P>; preload(): Promise<unknown> } {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const reset = () => { current = lazy(load); };
  const load = () => {
    pending ??= loader().catch((error: unknown) => { pending = null; failed.add(reset); throw error; });
    return pending;
  };
  let current: LazyExoticComponent<ComponentType<P>> = lazy(load);
  // El envoltorio lee el `lazy` vigente en cada pintado: tras un reintento monta el nuevo.
  function Retryable(props: P) {
    return createElement(current as ComponentType<P>, props);
  }
  retryables.add(Retryable);
  return { Component: Retryable, preload: load };
}

/** El componente sale de `retryableLazy` (lo vigila `registry.test.ts`: ningún juego entra en el bundle principal). */
export function isRetryableLazy(component: unknown): boolean {
  return typeof component === 'function' && retryables.has(component);
}

/** Prepara un nuevo intento de todas las cargas fallidas (lo llama «Reintentar» de `LoadErrorBoundary`). */
export function retryFailedLoads(): void {
  for (const reset of failed) reset();
  failed.clear();
}

/** Cargas fallidas pendientes de reintento (para las pruebas). */
export function failedLoadCount(): number {
  return failed.size;
}
