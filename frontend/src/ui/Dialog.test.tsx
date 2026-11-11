import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setUiSoundSink } from '../audio/uiSound';
import { ConfirmDialog, confirmDialogActions, createDialogController, Dialog, dialogCloseReason, isOutsideRect } from './Dialog';

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

describe('isOutsideRect', () => {
  it('el borde de la caja no es el fondo', () => {
    const rect = { left: 10, top: 10, right: 110, bottom: 60 };
    expect(isOutsideRect(rect, 10, 30)).toBe(false);
    expect(isOutsideRect(rect, 60, 60)).toBe(false);
    expect(isOutsideRect(rect, 9, 30)).toBe(true);
    expect(isOutsideRect(rect, 60, 61)).toBe(true);
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

  it('un evento close tras reabrir no avisa', () => {
    // StrictMode: el efecto cierra (encola un `close` nativo) y vuelve a abrir antes de que llegue el evento.
    const dialog = fakeDialog();
    const ctrl = createDialogController(dialog, () => null);
    const onClose = vi.fn();
    ctrl.open();
    ctrl.close();
    ctrl.open();
    ctrl.nativeClose(onClose);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
  });

  it('el close nativo con el diálogo ya cerrado por el navegador avisa una vez como escape', () => {
    const dialog = fakeDialog();
    const ctrl = createDialogController(dialog, () => null);
    const onClose = vi.fn();
    ctrl.open();
    ctrl.dismiss('escape', onClose);
    dialog.open = false;
    ctrl.nativeClose(onClose);
    expect(onClose.mock.calls).toEqual([['escape']]);
    const other = vi.fn();
    const ctrl2 = createDialogController(fakeDialog(), () => null);
    ctrl2.open();
    ctrl2.nativeClose(other);
    expect(other).not.toHaveBeenCalled();
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

describe('ConfirmDialog', () => {
  it('puts «Cancelar» first with the focus and the dangerous action last', () => {
    const onConfirm = vi.fn();
    const [cancel, confirm] = confirmDialogActions({ confirmLabel: 'Expulsar', onConfirm });
    expect(cancel).toMatchObject({ label: 'Cancelar', variant: 'blue', autoFocus: true });
    expect(confirm).toMatchObject({ label: 'Expulsar', variant: 'danger', autoFocus: false });
    confirm!.onClick();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps the order for a safe action that takes the focus', () => {
    const actions = confirmDialogActions({ confirmLabel: 'Mover aquí', cancelLabel: 'Volver', tone: 'yellow', focus: 'confirm', onConfirm: () => undefined });
    expect(actions.map((action) => [action.label, action.variant, action.autoFocus])).toEqual([['Volver', 'blue', false], ['Mover aquí', 'yellow', true]]);
  });

  it('renders the cancel button before the action, with data-autofocus on cancel', () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, { open: true, title: '¿Quitar a Misty?', onClose: () => undefined, confirmLabel: 'Quitar', onConfirm: () => undefined }, 'Dejaréis de ser amigos.'));
    expect(html.indexOf('>Cancelar<')).toBeGreaterThan(-1);
    expect(html.indexOf('>Cancelar<')).toBeLessThan(html.indexOf('>Quitar<'));
    expect(html).toMatch(/<button[^>]*data-autofocus=""[^>]*>(?:(?!<\/button>).)*Cancelar/);
  });
});
