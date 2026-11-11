import type { WhoAmIPublicState } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { answerCounts, answerLabel, freshAnnouncement, lockedGuessIds, turnHeadline, whoAmIAnnouncement, type WhoAmIAnnounceSnapshot } from './presentation';

const NAMES: Record<string, string> = { p1: 'Eru', p2: 'Ana', p3: 'Leo' };
const nameOf = (id: string) => NAMES[id] ?? 'Entrenador';

function game(overrides: Partial<WhoAmIPublicState> = {}): WhoAmIPublicState {
  return {
    gameId: 'who-am-i', phase: 'TURN_ACTIVE', lap: 1, maxLaps: 10, playerIds: ['p1', 'p2', 'p3'], turnPlayerId: 'p1', turnStep: 'ASKING',
    currentQuestion: null, history: {}, solvedPlayerIds: [], questionsAsked: {}, scores: {}, turnEndsAt: 10_000, results: null, ...overrides,
  };
}

describe('¿Quién soy?: textos', () => {
  it('las cuatro respuestas', () => {
    expect(answerLabel('YES')).toBe('Sí');
    expect(answerLabel('NO')).toBe('No');
    expect(answerLabel('PARTLY')).toBe('A medias');
    expect(answerLabel('UNKNOWN')).toBe('No lo sé');
  });

  it('answerCounts cuenta cada respuesta, con las cuatro claves aunque falte alguna', () => {
    expect(answerCounts([])).toEqual({ YES: 0, NO: 0, PARTLY: 0, UNKNOWN: 0 });
    expect(answerCounts([
      { playerId: 'p2', answer: 'YES' }, { playerId: 'p3', answer: 'YES' }, { playerId: 'p4', answer: 'UNKNOWN' },
    ])).toEqual({ YES: 2, NO: 0, PARTLY: 0, UNKNOWN: 1 });
  });

  it('turnHeadline: tu ASKING, la pregunta en ANSWERING y el turno de otro', () => {
    expect(turnHeadline(game(), 'p1', nameOf)).toBe('Pregunta sobre tu Pokémon');
    const question = { text: '¿Soy de tipo fuego?', answers: [], answeredPlayerIds: [] };
    expect(turnHeadline(game({ turnStep: 'ANSWERING', currentQuestion: question }), 'p1', nameOf)).toBe('¿Soy de tipo fuego?');
    expect(turnHeadline(game({ turnStep: 'ANSWERING', currentQuestion: question }), 'p2', nameOf)).toBe('¿Soy de tipo fuego?');
    expect(turnHeadline(game(), 'p2', nameOf)).toBe('Turno de Eru');
    expect(turnHeadline(game({ turnStep: 'DECIDING', currentQuestion: question }), 'p3', nameOf)).toBe('Turno de Eru');
  });

  it('turnHeadline sin turno (al empezar) no falla', () => {
    expect(turnHeadline(game({ phase: 'GAME_STARTING', turnPlayerId: null, turnStep: null, turnEndsAt: null }), 'p1', nameOf)).toBe('¿Quién soy?');
  });

  it('la región viva anuncia el turno, cada pregunta nueva y «¡Eras X!», y nada si no cambia', () => {
    const idle: WhoAmIAnnounceSnapshot = { turnKey: '1:p1', turnPlayerId: 'p1', questionKey: null, questionText: null, solvedAs: null };
    expect(whoAmIAnnouncement(idle, idle, nameOf)).toBe('');
    expect(whoAmIAnnouncement(idle, { ...idle, turnKey: '1:p2', turnPlayerId: 'p2' }, nameOf)).toBe('Turno de Ana.');
    expect(whoAmIAnnouncement(idle, { ...idle, questionKey: '1:p1|¿Vuelo?', questionText: '¿Vuelo?' }, nameOf)).toBe('Pregunta: ¿Vuelo?');
    expect(whoAmIAnnouncement(idle, { ...idle, turnKey: '1:p2', turnPlayerId: 'p2', solvedAs: 'Mewtwo' }, nameOf)).toBe('¡Eras Mewtwo! Turno de Ana.');
  });
});

describe('freshAnnouncement', () => {
  it('un anuncio nuevo sale tal cual', () => {
    expect(freshAnnouncement('', 'Turno de Ana.')).toBe('Turno de Ana.');
    expect(freshAnnouncement('Turno de Ana.', 'Turno de Leo.')).toBe('Turno de Leo.');
    expect(freshAnnouncement('Turno de Ana.\u200b', 'Turno de Leo.')).toBe('Turno de Leo.');
  });

  it('el mismo anuncio seguido cambia el texto alternando un espacio de ancho cero', () => {
    const first = freshAnnouncement('', 'Turno de Ana.');
    const second = freshAnnouncement(first, 'Turno de Ana.');
    const third = freshAnnouncement(second, 'Turno de Ana.');
    expect(second).not.toBe(first);
    expect(second).toBe('Turno de Ana.\u200b');
    expect(third).toBe('Turno de Ana.');
    expect(third).not.toBe(second);
  });
});

describe('lockedGuessIds', () => {
  it('bloquea los Pokémon ya probados y los de los demás jugadores', () => {
    const pokemon = (id: string) => ({ id, name: id, sprite: `${id}.png`, nationalDexNumber: 1, types: ['normal'] });
    const locked = lockedGuessIds(
      [{ kind: 'QUESTION', text: '¿Vuelo?', answers: [] }, { kind: 'GUESS', pokemon: pokemon('rapidash') }],
      { p2: pokemon('ponyta'), p3: pokemon('dugtrio') },
    );
    expect([...locked].sort()).toEqual(['dugtrio', 'ponyta', 'rapidash']);
  });
});
