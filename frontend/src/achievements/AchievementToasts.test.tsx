import type { AchievementUnlock, PersonalRecord } from '@pokemon-universe/shared/public';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ActionToastStack } from '../ui';
import { emptyAchievementsQueue, enqueue, phaseChanged, toastText, type AchievementsPhase, type AchievementsQueue } from './achievements-state';
import { AchievementsContext, achievementsValue } from './AchievementsContext';
import { useAchievementToasts } from './AchievementToasts';

const unlock = (id: string): AchievementUnlock => ({ id, family: 'GENERAL', gameId: null, name: `Logro ${id}`, description: `Descripción ${id}` });
const streak: PersonalRecord = { gameId: 'higher-or-lower', key: 'endless-streak', label: 'Racha infinita', value: 14, previous: 9 };

function Toasts() {
  const toasts: ReactElement[] = useAchievementToasts();
  return <ActionToastStack label="Avisos">{toasts}</ActionToastStack>;
}
const render = (queue: AchievementsQueue, phase: AchievementsPhase, path = '/') => renderToStaticMarkup(
  <MemoryRouter initialEntries={[path]}><AchievementsContext.Provider value={achievementsValue(queue, phase, () => undefined)}><Toasts /></AchievementsContext.Provider></MemoryRouter>,
);
const shownIn = (phase: AchievementsPhase, payload = { achievements: [unlock('a'), unlock('b')], records: [] as PersonalRecord[] }) => phaseChanged(enqueue(emptyAchievementsQueue, payload), phase);

describe('useAchievementToasts', () => {
  it('fuera de partida: aviso educado (role="status") con los nombres y las dos acciones', () => {
    const html = render(shownIn('LOBBY'), 'LOBBY');
    expect(html).toContain('¡Logros desbloqueados!');
    expect(html).toContain('Logro a, Logro b');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Ver mis logros');
    expect(html).toContain('Cerrar');
  });

  it('en los resultados de la sala manda el recuadro; fuera de /room, el aviso', () => {
    expect(render(shownIn('GAME_RESULTS'), 'GAME_RESULTS', '/room')).toBe('');
    expect(render(shownIn('GAME_RESULTS'), 'GAME_RESULTS', '/profile')).toContain('Logro a');
  });

  it('retenida a mitad de partida o vacía: nada', () => {
    expect(render(shownIn('ROUND_ACTIVE'), 'ROUND_ACTIVE', '/room')).toBe('');
    expect(render(emptyAchievementsQueue, 'NO_ROOM')).toBe('');
  });

  it('solo récords: título y texto del récord', () => {
    const queue = shownIn('NO_ROOM', { achievements: [], records: [streak] });
    expect(toastText(queue)).toBe('Nuevo récord personal en Racha infinita: 14 (antes 9)');
    const html = render(queue, 'NO_ROOM');
    expect(html).toContain('¡Nuevo récord personal!');
    expect(html).toContain('Nuevo récord personal en Racha infinita: 14 (antes 9)');
  });
});
