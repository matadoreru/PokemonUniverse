import { Component, type ErrorInfo, type ReactNode } from 'react';
import { retryFailedLoads } from '../lib/retryable-lazy';

/**
 * Qué hace «Reintentar». El primer intento repite el `import()` (un corte de red). Si la misma carga vuelve a fallar,
 * lo más probable es un fragmento caducado tras un despliegue (su fichero ya no existe): solo lo arregla recargar la
 * página, que trae el `index.html` nuevo. Las dos causas no se distinguen por el error, así que manda el número de intentos.
 */
export function loadRetryAction(attempts: number): 'reimport' | 'reload' {
  return attempts === 0 ? 'reimport' : 'reload';
}

/** Lo que enseña el estado de error de una carga según los intentos ya hechos. */
export interface LoadErrorView {
  title: string;
  text: string;
  actionLabel: string;
}

export function loadErrorView(what: 'pantalla' | 'minijuego', attempts: number): LoadErrorView {
  const title = what === 'pantalla' ? 'No se pudo cargar la pantalla' : 'No se pudo cargar el minijuego';
  return loadRetryAction(attempts) === 'reimport'
    ? { title, text: 'Comprueba la conexión y vuelve a intentarlo.', actionLabel: 'Reintentar' }
    : { title, text: 'Puede que haya una versión nueva de la web. Recarga la página para seguir.', actionLabel: 'Recargar página' };
}

export interface LoadErrorBoundaryProps {
  children: ReactNode;
  /** Pinta el error con su acción. `attempts` son los reintentos ya hechos (ver `loadErrorView`). */
  fallback(props: { attempts: number; retry(): void }): ReactNode;
  /** Al cambiar (otra ruta, otra fase de la sala), el error se olvida y se vuelve a pintar el contenido. */
  resetKey?: string;
  /** Recarga la página (en las pruebas, un doble). */
  reload?: () => void;
}

interface State {
  failed: boolean;
  attempts: number;
}

/**
 * Límite de error de las cargas perezosas (rutas, pantallas y ajustes de los minijuegos): si un `import()` falla, en
 * lugar de dejar la pantalla en blanco pinta `fallback` con «Reintentar» (ver `loadRetryAction`). También recoge
 * cualquier error al pintar lo que envuelve, que deja el mismo estado.
 */
export class LoadErrorBoundary extends Component<LoadErrorBoundaryProps, State> {
  override state: State = { failed: false, attempts: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Fallo al cargar o pintar una pantalla', error, info.componentStack);
  }

  override componentDidUpdate(previous: LoadErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && (this.state.failed || this.state.attempts > 0)) this.setState({ failed: false, attempts: 0 });
  }

  retry = (): void => {
    if (loadRetryAction(this.state.attempts) === 'reload') {
      (this.props.reload ?? (() => window.location.reload()))();
      return;
    }
    retryFailedLoads();
    this.setState((state) => ({ failed: false, attempts: state.attempts + 1 }));
  };

  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback({ attempts: this.state.attempts, retry: this.retry });
    return this.props.children;
  }
}
