import type { AchievementUnlock, AchievementsUnlocked, PersonalRecord } from '@pokemon-universe/shared/public';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AchievementNotice } from './AchievementNotice';
import { emptyAchievementsQueue, enqueue, phaseChanged, type AchievementsQueue } from './achievements-state';
import { AchievementsContext, achievementsValue } from './AchievementsContext';

const unlock = (id: string): AchievementUnlock => ({ id, family: 'GENERAL', gameId: null, name: `Logro ${id}`, description: `Descripción ${id}` });
const streak: PersonalRecord = { gameId: 'higher-or-lower', key: 'endless-streak', label: 'Racha infinita', value: 14, previous: 9 };
const atResults = (payload: AchievementsUnlocked, from: AchievementsQueue = emptyAchievementsQueue) => phaseChanged(enqueue(from, payload), 'GAME_RESULTS');
const render = (queue: AchievementsQueue, phase: Parameters<typeof achievementsValue>[1] = 'GAME_RESULTS') => renderToStaticMarkup(
  <MemoryRouter><AchievementsContext.Provider value={achievementsValue(queue, phase, () => undefined)}><AchievementNotice /></AchievementsContext.Provider></MemoryRouter>,
);

describe('AchievementNotice', () => {
  it('showsUpToThreeAndMore', () => {
    const html = render(atResults({ achievements: ['a', 'b', 'c', 'd', 'e'].map(unlock), records: [] }));
    expect(html).toContain('¡Logros desbloqueados!');
    expect(html.match(/<li/g)).toHaveLength(3);
    for (const id of ['a', 'b', 'c']) expect(html).toContain(`Logro ${id}`);
    expect(html).not.toContain('Logro d');
    expect(html).toContain('y 2 más');
    expect(html).toContain('href="/profile?tab=logros"');
    expect(html).toContain('Ver mis logros');
    // El recuadro no es región viva: anuncia la de `ResultsShell`.
    expect(html).not.toMatch(/aria-live|role="(status|alert)"/);
  });

  it('un solo logro: título en singular, sin «más»', () => {
    const html = render(atResults({ achievements: [unlock('a')], records: [] }));
    expect(html).toContain('¡Logro desbloqueado!');
    expect(html).not.toContain('más');
  });

  it('showsRecordLine', () => {
    const html = render(atResults({ achievements: [unlock('a')], records: [streak] }));
    expect(html).toContain('Nuevo récord personal en Racha infinita: 14 (antes 9)');
  });

  it('rendersNothingWhenEmpty', () => {
    expect(render(emptyAchievementsQueue)).toBe('');
    // Retenida a mitad de partida (aún no se ha mostrado): nada.
    const held = phaseChanged(enqueue(emptyAchievementsQueue, { achievements: [unlock('a')], records: [] }), 'ROUND_ACTIVE');
    expect(render(held, 'ROUND_ACTIVE')).toBe('');
    // Fuera del proveedor (galería, tests de ResultsShell): nada.
    expect(renderToStaticMarkup(<MemoryRouter><AchievementNotice /></MemoryRouter>)).toBe('');
  });

  it('remountKeepsQueue', () => {
    const shown = atResults({ achievements: [unlock('a')], records: [] });
    expect(render(shown)).toContain('Logro a');
    // StrictMode desmonta y vuelve a montar con la misma fase: el proveedor vuelve a avisar del cambio de fase y la cola sigue.
    const remounted = phaseChanged(shown, 'GAME_RESULTS');
    expect(render(remounted)).toContain('Logro a');
  });
});
