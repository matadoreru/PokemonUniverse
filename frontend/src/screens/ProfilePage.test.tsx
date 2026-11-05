import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../components/Layout';
import { LevelMeter } from './ProfilePage';

vi.mock('../components/feedback-target', () => ({ useFeedbackHref: () => '/feedback' }));

describe('LevelMeter', () => {
  it('mide solo el tramo del nivel actual y dice cuánto falta', () => {
    const html = renderToStaticMarkup(createElement(LevelMeter, { progress: { level: 3, xp: 260, levelXp: 250, nextLevelXp: 450 } }));
    expect(html).toContain('Nivel 3');
    expect(html).toContain('260 XP en total');
    expect(html).toContain('aria-label="Experiencia hacia el nivel 4"');
    expect(html).toContain('aria-valuenow="10"');
    expect(html).toContain('aria-valuemax="200"');
    expect(html).toContain('10/200 XP');
    expect(html).toContain('Faltan 190 XP para el nivel 4');
  });
});

describe('AppHeader', () => {
  const user = { id: 'u1', displayName: 'Ana', kind: 'USER', email: 'a@b.c', role: 'USER', avatar: { type: 'DEFAULT' } } as const;
  const render = (level: number | null) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AppHeader, { user, level, onLogout: () => undefined })));

  it('el botón de perfil lleva la insignia del nivel', () => {
    const html = render(5);
    expect(html).toContain('aria-label="Abrir perfil de Ana (nivel 5)"');
    expect(html).toContain('data-level="5"');
  });
  it('sin nivel (aún cargando) no pinta insignia', () => {
    const html = render(null);
    expect(html).toContain('aria-label="Abrir perfil de Ana"');
    expect(html).not.toContain('data-level');
  });
});
