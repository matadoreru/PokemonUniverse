import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer, submitChat } from './ChatComposer';

const base = { value: 'Hola', onChange: () => undefined, onSubmit: () => undefined, label: 'Escribe un mensaje', maxLength: 200 };
const render = (extra: object = {}) => renderToStaticMarkup(createElement(ChatComposer, { ...base, ...extra }));

describe('ChatComposer', () => {
  it('es un formulario con campo de una línea y botón de enviar', () => {
    const html = render();
    expect(html).toContain('<form');
    expect(html).toContain('maxLength="200"');
    expect(html).toContain('enterKeyHint="send"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('Enviar');
  });

  it('el contador aparece desde 160 caracteres y no antes', () => {
    expect(render({ value: 'x'.repeat(159) })).not.toMatch(/\d\/200/);
    const html = render({ value: 'x'.repeat(160) });
    expect(html).toContain('160/200');
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).not.toContain('aria-live');
  });

  it('con disabledReason muestra el motivo en lugar del campo y del botón', () => {
    const html = render({ disabledReason: 'Un moderador te ha silenciado.' });
    expect(html).toContain('Un moderador te ha silenciado.');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
  });

  it('busy deshabilita el envío', () => {
    expect(render({ busy: true })).toContain('aria-busy="true"');
    expect(render({ busy: true })).toMatch(/<button[^>]*disabled/);
  });
});

describe('submitChat', () => {
  it('envía el texto con valor', () => {
    const send = vi.fn();
    expect(submitChat('Hola', false, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('no envía en blanco', () => {
    const send = vi.fn();
    expect(submitChat('   ', false, send)).toBe(false);
    expect(submitChat('', false, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('no envía mientras espera el ack (busy)', () => {
    const send = vi.fn();
    expect(submitChat('Hola', true, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
