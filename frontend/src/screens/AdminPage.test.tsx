import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEGACY } from '../styles/legacy-classes';
import { AdminPage } from './AdminPage';

describe('AdminPage', () => {
  it('placa con el título y el resumen, y las secciones en pestañas', () => {
    const html = renderToStaticMarkup(<AdminPage />);
    expect(html).toContain('<h1');
    expect(html).toContain('Administración de Pokémon Universe');
    for (const label of ['Salas activas', 'En juego', 'Usuarios', 'Interrumpidas hoy']) expect(html).toContain(label);
    expect(html).toContain('role="tablist" aria-label="Secciones de administración"');
    for (const tab of ['Salas', 'Changelog', 'Feedback', 'Partidas', 'Datos']) expect(html).toContain(`<span>${tab}</span>`);
    expect(html).toMatch(/aria-selected="true"[^>]*>.*?<span>Salas<\/span>/);
    expect(html).toContain('role="tabpanel"');
    expect(html).not.toMatch(LEGACY);
  });
});
