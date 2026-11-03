import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastStack, toastRole } from './Toast';

describe('ToastStack', () => {
  it('es un popover manual con un aviso por elemento', () => {
    const html = renderToStaticMarkup(createElement(ToastStack, { toasts: [{ id: 1, kind: 'ok', text: 'Guardado' }, { id: 2, kind: 'error', text: 'Sin conexión' }], onClose: () => undefined }));
    expect(html).toContain('popover="manual"');
    expect(html).toContain('role="status"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Guardado');
    expect(html.match(/aria-label="Cerrar aviso"/g)).toHaveLength(2);
  });

  it('el error es una alerta; el resto, estado', () => {
    expect(toastRole('error')).toBe('alert');
    expect(toastRole('ok')).toBe('status');
    expect(toastRole('info')).toBe('status');
  });
});
