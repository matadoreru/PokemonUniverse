import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_GAME_IDS, DAILY_RULE_TEXT, dailyShareText, formatDailyDate, isDailyGameId, type DailyGameId } from './daily.js';
import { gameModeLabel } from './games/modes.js';

const origin = 'https://pokemon.example';

describe('reto diario compartido', () => {
  it('reconoce los juegos del reto y su regla', () => {
    expect(isDailyGameId('higher-lower')).toBe(true);
    expect(isDailyGameId('type-duel')).toBe(false);
    expect(isDailyGameId(3)).toBe(false);
    expect(DAILY_RULE_TEXT['learnset-guess']).toBe('3 Pokémon · Revelación manual');
  });

  it('convierte la fecha', () => {
    expect(formatDailyDate('2026-11-07')).toBe('07/11/2026');
  });

  it('Distance', () => {
    expect(dailyShareText({ gameId: 'pokedex-distance', date: '2026-11-07', score: 612, correct: 1, roundCount: 5, rounds: [0, 3, 12, 1, 7], origin }))
      .toBe('Pokémon Universe · Reto diario 07/11/2026\n🎯 Pokédex Distance · 612 pts\n0·3·12·1·7\nhttps://pokemon.example/play');
  });

  it('Distance sin elección muestra ✖', () => {
    expect(dailyShareText({ gameId: 'pokedex-distance', date: '2026-11-07', score: 1240, correct: 0, roundCount: 5, rounds: [4, -1, 2, -1, 0], origin }))
      .toBe('Pokémon Universe · Reto diario 07/11/2026\n🎯 Pokédex Distance · 1.240 pts\n4·✖·2·✖·0\nhttps://pokemon.example/play');
  });

  it('Higher or Lower', () => {
    expect(dailyShareText({ gameId: 'higher-lower', date: '2026-11-07', score: 340, correct: 7, roundCount: 10, rounds: [1, 1, 0, 1, -1, 1, 1, 0, 1, 1], origin }))
      .toBe('Pokémon Universe · Reto diario 07/11/2026\n📈 Higher or Lower · 7/10 · 340 pts\n✅✅❌✅⌛✅✅❌✅✅\nhttps://pokemon.example/play');
  });

  it('Shiny Quiz', () => {
    expect(dailyShareText({ gameId: 'shiny-vote', date: '2026-11-07', score: 90, correct: 2, roundCount: 10, rounds: [1, 0, -1, 1, 0, 0, 0, 0, 0, 0], origin }))
      .toBe('Pokémon Universe · Reto diario 07/11/2026\n✨ Shiny Quiz · 2/10 · 90 pts\n✨❌⌛✨❌❌❌❌❌❌\nhttps://pokemon.example/play');
  });

  it('Learnset Guess', () => {
    expect(dailyShareText({ gameId: 'learnset-guess', date: '2026-11-07', score: 40, correct: 2, roundCount: 3, rounds: [3, 1, 0], origin }))
      .toBe('Pokémon Universe · Reto diario 07/11/2026\n📚 Learnset Guess · 2/3 · 40 pts\n⬛⬛🟩 🟩 🟥\nhttps://pokemon.example/play');
  });
});

/**
 * `web-contracts/daily-games.json` lo graba `DailyGamesTest` desde Java (aquí solo se lee): los juegos del sorteo en su
 * orden, sus rondas y las claves fijas de su configuración. La regla que muestra la web tiene que decir lo mismo.
 */
describe('reto diario frente a Java', () => {
  const games = JSON.parse(readFileSync(new URL('../../../backend/src/test/resources/web-contracts/daily-games.json', import.meta.url), 'utf8')) as { gameId: DailyGameId; roundCount: number; config: { mode: string; optionCount?: number } }[];

  it('los mismos juegos en el mismo orden', () => {
    expect([...DAILY_GAME_IDS]).toEqual(games.map(({ gameId }) => gameId));
  });

  it.each(games)('$gameId: la regla lleva sus rondas, su modo y sus candidatos', ({ gameId, roundCount, config }) => {
    const rule = DAILY_RULE_TEXT[gameId];
    expect(rule.startsWith(`${roundCount} `), rule).toBe(true);
    const mode = gameModeLabel(gameId, config);
    if (mode) expect(rule).toContain(mode);
    if (config.optionCount !== undefined) expect(rule).toContain(`${config.optionCount} candidatos`);
  });
});
