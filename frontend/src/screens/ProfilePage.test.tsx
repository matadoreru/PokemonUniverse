import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../components/Layout';
import type { AchievementsResponse } from '../lib/api-contract';
import { LevelMeter, ProfileDetail, tabFromParam, type AchievementsState } from './ProfilePage';

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

describe('ProfileDetail', () => {
  const data: AchievementsResponse = {
    unlocked: 1,
    total: 3,
    achievements: [
      { id: 'general.first-game', family: 'GENERAL', gameId: null, name: 'Primera partida', description: 'Juega una partida.', unlockedAt: '2026-11-07T10:00:00Z' },
      { id: 'game.x', family: 'GAME', gameId: 'higher-or-lower', name: 'Racha', description: 'Gana.', unlockedAt: null },
      { id: 'secret.1', family: 'SECRET', gameId: null, name: 'Logro secreto', description: 'Sigue jugando para descubrirlo.', unlockedAt: null },
    ],
  };
  const render = (tab: 'estadisticas' | 'logros', achievements: AchievementsState) =>
    renderToStaticMarkup(createElement(ProfileDetail, { tab, onTab: () => undefined, achievements, onRetry: () => undefined, children: createElement('p', null, 'LISTA DE JUEGOS') }));

  it('logrosTabShowsBadge', () => {
    const html = render('logros', { status: 'ready', data });
    expect(html).toContain('Estadísticas');
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>(?:(?!<\/button>).)*Logros(?:(?!<\/button>).)*1\/3/);
    expect(html).toContain('Generales');
    expect(html).toContain('Minijuegos');
    expect(html).toContain('Secretos');
    expect(html).toContain('Conseguido el 7 nov 2026');
    expect(html).not.toContain('LISTA DE JUEGOS');
  });

  it('tabParamOpensLogros', () => {
    expect(tabFromParam('logros')).toBe('logros');
    expect(tabFromParam(null)).toBe('estadisticas');
    expect(tabFromParam('otra')).toBe('estadisticas');
    expect(render('logros', { status: 'ready', data })).toContain('id="perfil-panel-logros"');
    expect(render('estadisticas', { status: 'ready', data })).toContain('id="perfil-panel-estadisticas"');
  });

  it('lockedSecretShowsPlaceholder', () => {
    const html = render('logros', { status: 'ready', data });
    expect(html).toContain('aria-label="Bloqueado: Logro secreto"');
    expect(html).toContain('Sigue jugando para descubrirlo.');
    expect(html).toContain('aria-label="Bloqueado: Racha"');
  });

  it('achievementsErrorKeepsStats', () => {
    const stats = render('estadisticas', { status: 'error' });
    expect(stats).toContain('LISTA DE JUEGOS');
    expect(stats).not.toContain('No se pudieron cargar tus logros');
    const logros = render('logros', { status: 'error' });
    expect(logros).toContain('No se pudieron cargar tus logros');
    expect(logros).toContain('Reintentar');
    expect(logros).not.toContain('LISTA DE JUEGOS');
  });

  it('sin logros, el vacío de quien llama en lugar de los grupos', () => {
    const none = { ...data, unlocked: 0, achievements: [] };
    const html = renderToStaticMarkup(createElement(ProfileDetail, {
      tab: 'logros', onTab: () => undefined, achievements: { status: 'ready', data: none }, onRetry: () => undefined,
      emptyAchievements: createElement('p', null, 'NINGUNO'), children: null,
    }));
    expect(html).toContain('NINGUNO');
    expect(html).toContain('0/3');
    expect(html).not.toContain('Generales');
  });
});
