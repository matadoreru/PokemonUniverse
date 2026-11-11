import { defaultPokemonBingoConfig, type RoomMemberView, type RoomView } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { clientGameRegistry } from './registry';

function member(id: string, presence: RoomMemberView['presence'] = 'CONNECTED'): RoomMemberView {
  return {
    id, displayName: id, avatar: { type: 'DEFAULT' }, connected: presence === 'CONNECTED', presence,
    roomRole: id === 'p1' ? 'HOST' : 'MEMBER', role: 'PLAYER', isHost: id === 'p1', ready: true, sessionPoints: 0,
  };
}

function roomWith(members: RoomMemberView[], extra: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABC234', phase: 'LOBBY', hostId: 'p1', maxPlayers: 8, members, availableGames: [],
    selectedGameId: 'pokemon-impostor', selectedGameConfig: { impostorCount: 2 },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['pokemon-impostor'] }, nextGameVote: null,
    gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: null, gamePlayerState: null, daily: null, serverNow: 1_000,
    ...extra,
  };
}

const players = (count: number) => Array.from({ length: count }, (_, index) => member(`p${index + 1}`));
const validate = (gameId: string, config: unknown, room?: RoomView) => clientGameRegistry.get(gameId).validateConfig(config, room);

describe('client minigame registry', () => {
  it('registers one presentation strategy for every minigame', () => {
    expect(clientGameRegistry.list().map(({ id }) => id)).toEqual([
      'pokedex-distance', 'shiny-vote', 'pokemon-impostor', 'higher-lower', 'type-duel', 'learnset-guess',
      'pokeddle-race', 'pokemon-bingo', 'whos-that-pokemon', 'pokedex-entry-guess', 'type-chain',
      'guess-from-stats', 'zoomed-pokemon',
      'poke-taboo',
      'one-of-us-is-fake',
      'pokemon-bluff-auction',
      'sketchmon',
      'pokemon-connections',
      'pokemon-team-auction',
      'secret-ranking',
      'most-likely-to',
      'would-you-rather',
      'pokemon-red-flag',
      'tcg-higher-lower',
      'pokemon-cry-quiz',
      'pokemon-trivia',
      'pokemon-palette-guess',
      'who-is-who-pokemon',
      'absurd-pokedex',
      'unown-translator',
      'who-am-i',
    ]);
  });

  it('keeps configuration, gameplay and results behind React lazy boundaries', () => {
    for (const module of clientGameRegistry.list()) {
      expect(module.ConfigPanel).toHaveProperty('$$typeof', Symbol.for('react.lazy'));
      expect(module.ActiveGame).toHaveProperty('$$typeof', Symbol.for('react.lazy'));
      expect(module.Results).toHaveProperty('$$typeof', Symbol.for('react.lazy'));
    }
  });

  it('can preload every dynamically registered component export', async () => {
    await Promise.all(clientGameRegistry.list().flatMap((module) => [module.preloadConfig(), module.preloadGameplay()]));
    // Importa y transforma todas las pantallas de los minijuegos: con la suite en paralelo supera los 5 s por defecto.
  }, 60_000);

  describe('validateConfig', () => {
    it('cuenta solo a los jugadores conectados para la paridad de impostores', () => {
      expect(validate('pokemon-impostor', { impostorCount: 2 }, roomWith(players(4)))).toBe('Demasiados impostores: con 4 jugadores el máximo es 1.');
      expect(validate('pokemon-impostor', { impostorCount: 2 }, roomWith(players(5)))).toBeNull();
      expect(validate('pokemon-impostor', { impostorCount: 2 }, roomWith([...players(4), member('p5', 'TEMPORARILY_DISCONNECTED')])))
        .toBe('Demasiados impostores: con 4 jugadores el máximo es 1.');
    });

    it('sin sala no comprueba nada que dependa de ella', () => {
      expect(validate('pokemon-impostor', { impostorCount: 2 })).toBeNull();
      expect(validate('one-of-us-is-fake', { categorySource: 'CUSTOM' })).toBe('El host necesita al menos 2 categorías personales activas; ahora hay 0.');
    });

    it('usa el contenido personal del host de la sala', () => {
      const room = roomWith(players(3), { hostCustomCategoryCount: 1, hostWouldYouRatherPromptCount: 0 });
      expect(validate('one-of-us-is-fake', { categorySource: 'CUSTOM' }, room)).toBe('El host necesita al menos 2 categorías personales activas; ahora hay 1.');
      expect(validate('secret-ranking', { promptSource: 'CUSTOM' }, room)).toBeNull();
      expect(validate('most-likely-to', { promptSource: 'CUSTOM' }, room)).toBeNull();
      expect(validate('would-you-rather', { promptSource: 'CUSTOM' }, room))
        .toBe('El host necesita al menos un dilema personal activo para usar solo dilemas personalizados.');
    });

    it('aplica la preparación de shared a Pokémon Bingo y Pokédle Race', () => {
      const families = Object.fromEntries(Object.keys(defaultPokemonBingoConfig.families).map((key) => [key, false]));
      expect(validate('pokemon-bingo', defaultPokemonBingoConfig)).toBeNull();
      expect(validate('pokemon-bingo', { ...defaultPokemonBingoConfig, families })).toBe('Selecciona al menos una familia de condiciones.');
      expect(validate('pokemon-bingo', { ...defaultPokemonBingoConfig, width: 3, height: 3, generations: [1, 2], families: { ...families, generation: true } }))
        .toBe('No hay suficientes condiciones distintas de “Generación” para un tablero 3×3.');
      expect(validate('pokeddle-race', { clues: {} })).toBe('Selecciona al menos una pista.');
    });

    it('no lanza con una config nula en los juegos con preparación', () => {
      for (const gameId of ['pokeddle-race', 'pokemon-bingo', 'pokemon-impostor', 'one-of-us-is-fake', 'secret-ranking', 'most-likely-to', 'would-you-rather']) {
        expect(() => validate(gameId, null, roomWith(players(4)))).not.toThrow();
      }
    });

    it('mantiene las comprobaciones propias de la web', () => {
      expect(validate('zoomed-pokemon', { generations: [] })).toBe('Selecciona al menos una generación.');
      expect(validate('type-chain', {})).toBeNull();
    });
  });
});

