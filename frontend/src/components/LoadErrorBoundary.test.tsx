import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LoadErrorBoundary, loadErrorView, loadRetryAction, type LoadErrorBoundaryProps } from './LoadErrorBoundary';
import { GameLoadError, RouteLoadError } from './LoadingFallback';

/** El límite sin DOM: el estado se aplica a mano (el render en servidor no ejecuta límites de error). */
function boundary(props: Partial<LoadErrorBoundaryProps> = {}) {
  const instance = new LoadErrorBoundary({ children: 'contenido', fallback: ({ attempts }) => `error ${attempts}`, ...props });
  instance.setState = ((update: unknown) => {
    const patch = typeof update === 'function' ? (update as (s: typeof instance.state) => object)(instance.state) : update;
    instance.state = { ...instance.state, ...(patch as object) };
  }) as typeof instance.setState;
  return instance;
}

describe('LoadErrorBoundary', () => {
  it('retries the import first and reloads the page if the same load fails again', () => {
    expect(loadRetryAction(0)).toBe('reimport');
    expect(loadRetryAction(1)).toBe('reload');
    expect(loadErrorView('pantalla', 0)).toEqual({ title: 'No se pudo cargar la pantalla', text: 'Comprueba la conexión y vuelve a intentarlo.', actionLabel: 'Reintentar' });
    expect(loadErrorView('minijuego', 1).actionLabel).toBe('Recargar página');
  });

  it('shows the fallback on error, clears it on retry and reloads on the second failure', () => {
    const reload = vi.fn();
    const instance = boundary({ reload });
    instance.state = { ...instance.state, ...LoadErrorBoundary.getDerivedStateFromError() };
    expect(instance.render()).toBe('error 0');
    instance.retry();
    expect(instance.state).toEqual({ failed: false, attempts: 1 });
    expect(instance.render()).toBe('contenido');
    expect(reload).not.toHaveBeenCalled();
    instance.state = { ...instance.state, ...LoadErrorBoundary.getDerivedStateFromError() };
    expect(instance.render()).toBe('error 1');
    instance.retry();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('forgets the error when the reset key changes (another route or room phase)', () => {
    const instance = boundary({ resetKey: 'b' });
    instance.state = { failed: true, attempts: 1 };
    instance.componentDidUpdate({ ...instance.props, resetKey: 'a' });
    expect(instance.state).toEqual({ failed: false, attempts: 0 });
  });

  it('renders its children while nothing failed', () => {
    expect(renderToStaticMarkup(<LoadErrorBoundary fallback={() => 'error'}>contenido</LoadErrorBoundary>)).toBe('contenido');
  });

  it('paints the Arcade DS error state with its action, as an alert', () => {
    const route = renderToStaticMarkup(createElement(RouteLoadError, { attempts: 0, retry: () => undefined }));
    expect(route).toContain('role="alert"');
    expect(route).toContain('No se pudo cargar la pantalla');
    expect(route).toContain('>Reintentar<');
    expect(route).toMatch(/<section class="[^"]*panel/);
    const game = renderToStaticMarkup(createElement(GameLoadError, { attempts: 1, retry: () => undefined, compact: true }));
    expect(game).toContain('No se pudo cargar el minijuego');
    expect(game).toContain('>Recargar página<');
    expect(game).not.toContain('<section');
  });
});
