import type { AchievementUnlock, PersonalRecord } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { acknowledge, announcement, canShow, emptyAchievementsQueue, enqueue, isVisible, noticeTitle, phaseChanged, recordLine } from './achievements-state';

const unlock = (id: string, name = id): AchievementUnlock => ({ id, family: 'GENERAL', gameId: null, name, description: `Descripción de ${name}` });
const streak: PersonalRecord = { gameId: 'higher-or-lower', key: 'endless-streak', label: 'Racha infinita', value: 14, previous: 9 };

describe('achievements-state', () => {
  it('enqueueDeduplicates', () => {
    const once = enqueue(emptyAchievementsQueue, { achievements: [unlock('a'), unlock('b')], records: [streak] });
    const twice = enqueue(once, { achievements: [unlock('b'), unlock('c')], records: [{ ...streak, value: 16, previous: 14 }] });
    expect(twice.achievements.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(twice.records).toEqual([{ ...streak, value: 16, previous: 9 }]);
  });

  it('canShowOnlyOutsidePlay', () => {
    for (const phase of ['GAME_STARTING', 'ROUND_ACTIVE', 'ROUND_RESULTS', 'CLUE_PHASE', 'NEXT_GAME_VOTE', 'NEXT_GAME_VOTE_RESULTS'] as const) expect(canShow(phase)).toBe(false);
    for (const phase of ['NO_ROOM', 'LOBBY', 'GAME_RESULTS', 'SESSION_RESULTS'] as const) expect(canShow(phase)).toBe(true);
  });

  it('heldDuringPlayShownAtResults', () => {
    // 1. Llega a mitad de partida: se guarda, pero no se ve.
    const held = phaseChanged(enqueue(emptyAchievementsQueue, { achievements: [unlock('a')], records: [] }), 'ROUND_ACTIVE');
    expect(held.shownIn).toBeNull();
    expect(isVisible(held, 'ROUND_ACTIVE')).toBe(false);
    // 2. Resultados: se ve y queda anotada la fase.
    const shown = phaseChanged(held, 'GAME_RESULTS');
    expect(shown.shownIn).toBe('GAME_RESULTS');
    expect(isVisible(shown, 'GAME_RESULTS')).toBe(true);
    // 3. La misma fase otra vez (doble efecto de StrictMode): sigue igual.
    const again = phaseChanged(shown, 'GAME_RESULTS');
    expect(again).toBe(shown);
    expect(again.achievements).toHaveLength(1);
    // 4. La siguiente partida: ya se vio, se vacía.
    const next = phaseChanged(again, 'GAME_STARTING');
    expect(next.achievements).toEqual([]);
    expect(next.shownIn).toBeNull();
    expect(isVisible(next, 'GAME_STARTING')).toBe(false);
  });

  it('llega con los resultados ya en pantalla: sale al instante', () => {
    const atResults = phaseChanged(emptyAchievementsQueue, 'GAME_RESULTS');
    expect(atResults.shownIn).toBeNull();
    const arrived = phaseChanged(enqueue(atResults, { achievements: [unlock('a')], records: [] }), 'GAME_RESULTS');
    expect(isVisible(arrived, 'GAME_RESULTS')).toBe(true);
  });

  it('una cola vacía no fija la fase y «Cerrar» la vacía', () => {
    expect(phaseChanged(emptyAchievementsQueue, 'LOBBY')).toBe(emptyAchievementsQueue);
    const shown = phaseChanged(enqueue(emptyAchievementsQueue, { achievements: [unlock('a')], records: [] }), 'LOBBY');
    expect(isVisible(shown, 'LOBBY')).toBe(true);
    expect(isVisible(shown, 'NO_ROOM')).toBe(false);
    expect(acknowledge()).toEqual(emptyAchievementsQueue);
  });

  it('recordLineText', () => {
    expect(recordLine(streak)).toBe('Nuevo récord personal en Racha infinita: 14 (antes 9)');
  });

  it('noticeTitle', () => {
    expect(noticeTitle(1)).toBe('¡Logro desbloqueado!');
    expect(noticeTitle(3)).toBe('¡Logros desbloqueados!');
  });

  it('announcementJoinsNames', () => {
    expect(announcement(emptyAchievementsQueue)).toBe('');
    expect(announcement(enqueue(emptyAchievementsQueue, { achievements: [unlock('a', 'Primera partida'), unlock('b', 'Fiel')], records: [] }))).toBe('Logro desbloqueado: Primera partida, Fiel');
    expect(announcement(enqueue(emptyAchievementsQueue, { achievements: [], records: [streak] }))).toBe('Nuevo récord personal en Racha infinita: 14 (antes 9)');
  });
});
