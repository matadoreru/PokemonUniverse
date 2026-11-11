import { WifiOff } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  it('pinta título, línea e insignia del tono, sin región viva propia', () => {
    const html = renderToStaticMarkup(createElement(Notice, { icon: WifiOff, tone: 'warn', title: 'El host está reconectando.', text: 'La sala espera.' }));
    expect(html).toContain('El host está reconectando.');
    expect(html).toContain('La sala espera.');
    expect(html).toMatch(/tone_warn/);
    expect(html).not.toContain('role=');
    expect(html).not.toContain('aria-live');
    expect(html).not.toContain('spinner');
  });

  it('con `busy` lleva el anillo decorativo, y `floating` marca la ventana flotante', () => {
    const html = renderToStaticMarkup(createElement(Notice, { icon: WifiOff, tone: 'bad', title: 'Conexión perdida', busy: true, floating: true, className: 'gancho' }));
    expect(html).toMatch(/class="[^"]*spinner[^"]*" aria-hidden="true"/);
    expect(html).toMatch(/class="[^"]*floating[^"]* gancho"/);
    expect(html).toMatch(/tone_bad/);
  });
});
