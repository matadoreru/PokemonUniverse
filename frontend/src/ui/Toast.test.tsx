import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hasNewToast, latestStatusText, ToastStack, toastHost, toastRole } from './Toast';

describe('ToastStack', () => {
  it('es un popover manual con un aviso por elemento', () => {
    const html = renderToStaticMarkup(createElement(ToastStack, { toasts: [{ id: 1, kind: 'ok', text: 'Guardado' }, { id: 2, kind: 'error', text: 'Sin conexión' }], onClose: () => undefined }));
    expect(html).toContain('popover="manual"');
    expect(html).toContain('role="status"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Guardado');
    expect(html.match(/aria-label="Cerrar aviso"/g)).toHaveLength(2);
  });

  it('una región status fija, fuera del popover, repite el último aviso que no es error', () => {
    const html = renderToStaticMarkup(createElement(ToastStack, { toasts: [{ id: 1, kind: 'info', text: 'Hola' }, { id: 2, kind: 'ok', text: 'Guardado' }, { id: 3, kind: 'error', text: 'Fallo' }], onClose: () => undefined }));
    expect(html).toMatch(/^<div[^>]*role="status"[^>]*>Guardado<\/div><div popover="manual"/);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    const empty = renderToStaticMarkup(createElement(ToastStack, { toasts: [], onClose: () => undefined }));
    expect(empty).toMatch(/role="status"[^>]*><\/div>/);
    expect(latestStatusText([{ id: 1, kind: 'error', text: 'x' }])).toBe('');
  });

  it('detecta avisos nuevos (para volver a subir la pila)', () => {
    const list = [{ id: 1, kind: 'ok' as const, text: 'a' }];
    expect(hasNewToast(list, new Set())).toBe(true);
    expect(hasNewToast(list, new Set([1]))).toBe(false);
  });

  it('el error es una alerta; el resto, estado', () => {
    expect(toastRole('error')).toBe('alert');
    expect(toastRole('ok')).toBe('status');
    expect(toastRole('info')).toBe('status');
  });

  it('el aviso se monta en el último diálogo modal abierto, o en su sitio si no hay ninguno', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const doc = (open: object[]) => ({
      querySelectorAll: (sel: string) => {
        expect(sel).toBe('dialog[open]:modal');
        return open as unknown as NodeListOf<Element>;
      },
    });
    expect(toastHost(doc([]))).toBeNull();
    expect(toastHost(doc([a]))).toBe(a);
    expect(toastHost(doc([a, b]))).toBe(b);
  });
});
