import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setUiSoundSink } from '../audio/uiSound';
import { createDialogController, Dialog, dialogCloseReason } from './Dialog';

afterEach(() => setUiSoundSink(null));

/** `<dialog>` simulado: `showModal` y `close` espiados que cambian `open`. */
function fakeDialog() {
  const dialog = {
    open: false,
    showModal: vi.fn(() => {
      dialog.open = true;
    }),
    close: vi.fn(() => {
      dialog.open = false;
    }),
  };
  return dialog;
}

describe('dialogCloseReason', () => {
  it('Esc (cancel) es escape', () => {
    expect(dialogCloseReason({ type: 'cancel', target: {}, currentTarget: {} })).toBe('escape');
  });

  it('un clic en el propio <dialog> es el fondo; dentro no cierra', () => {
    const el = {};
    expect(dialogCloseReason({ type: 'click', target: el, currentTarget: el })).toBe('backdrop');
    expect(dialogCloseReason({ type: 'click', target: {}, currentTarget: el })).toBeNull();
    expect(dialogCloseReason({ type: 'keydown', target: el, currentTarget: el })).toBeNull();
  });
});

describe('createDialogController', () => {
  it('devuelve el foco y avisa una vez', () => {
    const sink = vi.fn();
    setUiSoundSink(sink);
    const dialog = fakeDialog();
    const opener = { focus: vi.fn() };
    const ctrl = createDialogController(dialog, () => opener);
    const onClose = vi.fn();

    ctrl.open();
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenLastCalledWith('open');
    // Un segundo `open` (re-render) no vuelve a abrir.
    ctrl.open();
    expect(dialog.showModal).toHaveBeenCalledTimes(1);

    // Esc y clic en el fondo antes de que React cierre: un solo aviso, con el primer motivo.
    ctrl.dismiss('escape', onClose);
    ctrl.dismiss('backdrop', onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('escape');

    ctrl.close();
    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(opener.focus).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenLastCalledWith('close');
    // El evento `close` nativo que llega después ya no avisa.
    ctrl.dismiss('escape', onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cerrar sin estar abierto no hace nada', () => {
    const sink = vi.fn();
    setUiSoundSink(sink);
    const dialog = fakeDialog();
    const opener = { focus: vi.fn() };
    const ctrl = createDialogController(dialog, () => opener);
    ctrl.close();
    expect(dialog.close).not.toHaveBeenCalled();
    expect(opener.focus).not.toHaveBeenCalled();
    expect(sink).not.toHaveBeenCalled();
  });

  it('si el navegador ya lo cerró, igualmente devuelve el foco', () => {
    const dialog = fakeDialog();
    const opener = { focus: vi.fn() };
    const ctrl = createDialogController(dialog, () => opener);
    ctrl.open();
    dialog.open = false;
    ctrl.close();
    expect(dialog.close).not.toHaveBeenCalled();
    expect(opener.focus).toHaveBeenCalledTimes(1);
  });

  it('al reabrir vuelve a avisar', () => {
    const ctrl = createDialogController(fakeDialog(), () => null);
    const onClose = vi.fn();
    ctrl.open();
    ctrl.dismiss('action', onClose);
    ctrl.close();
    ctrl.open();
    ctrl.dismiss('backdrop', onClose);
    expect(onClose.mock.calls).toEqual([['action'], ['backdrop']]);
  });
});

describe('Dialog', () => {
  it('es un <dialog> nativo con título y acciones', () => {
    const html = renderToStaticMarkup(
      createElement(Dialog, { open: true, title: 'Salir de la sala', onClose: () => undefined, actions: [{ label: 'Salir', variant: 'yellow', onClick: () => undefined }, { label: 'Cancelar', variant: 'ghost', onClick: () => undefined }] }, '¿Seguro?'),
    );
    expect(html).toMatch(/^<dialog/);
    expect(html).toContain('aria-labelledby');
    expect(html).toContain('Salir de la sala');
    expect(html).toContain('¿Seguro?');
    expect(html).toContain('Cancelar');
  });

  it('cerrado no pinta el contenido', () => {
    const html = renderToStaticMarkup(createElement(Dialog, { open: false, title: 'Ajustes', onClose: () => undefined }, 'Cuerpo'));
    expect(html).not.toContain('Cuerpo');
  });
});
