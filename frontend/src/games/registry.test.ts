import { defaultPokemonBingoConfig, type RoomMemberView, type RoomView } from '@pokemon-universe/shared/public';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isRetryableLazy } from '../lib/retryable-lazy';
import { clientGameRegistry, webConfigChecks } from './registry';
import { member, roomView } from '../room/test-support/room-view';

function seat(id: string, presence: RoomMemberView['presence'] = 'CONNECTED'): RoomMemberView {
  return member({ id, displayName: id, connected: presence === 'CONNECTED', presence, roomRole: id === 'p1' ? 'HOST' : 'MEMBER', isHost: id === 'p1', ready: true });
}

function roomWith(members: RoomMemberView[], extra: Partial<RoomView> = {}): RoomView {
  return roomView({
    members, selectedGameId: 'pokemon-impostor', selectedGameConfig: { impostorCount: 2 },
    gameSelectionMode: { type: 'ORDER', gameIds: ['pokemon-impostor'] }, ...extra,
  });
}

const players = (count: number) => Array.from({ length: count }, (_, index) => seat(`p${index + 1}`));
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
      'odd-one-out',
    ]);
  });

  it('keeps configuration, gameplay and results behind retryable lazy boundaries', () => {
    for (const module of clientGameRegistry.list()) {
      expect(isRetryableLazy(module.ConfigPanel)).toBe(true);
      expect(isRetryableLazy(module.ActiveGame)).toBe(true);
      expect(isRetryableLazy(module.Results)).toBe(true);
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
      expect(validate('pokemon-impostor', { impostorCount: 2 }, roomWith([...players(4), seat('p5', 'TEMPORARILY_DISCONNECTED')])))
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

    it('ningún juego con regla de preparación en el servidor tiene además comprobación propia en la web', () => {
      // Los casos que graba GameConfigReadinessTest: un juego con algún mensaje tiene regla en Java y en shared.
      const cases = JSON.parse(readFileSync(new URL('../../../backend/src/test/resources/web-contracts/readiness-cases.json', import.meta.url), 'utf8')) as { gameId: string; message: string | null }[];
      const ruled = new Set(cases.filter(({ message }) => message !== null).map(({ gameId }) => gameId));
      expect(ruled.size).toBeGreaterThan(0);
      expect(Object.keys(webConfigChecks).filter((gameId) => ruled.has(gameId))).toEqual([]);
      for (const gameId of Object.keys(webConfigChecks)) expect(() => clientGameRegistry.get(gameId)).not.toThrow();
    });

    it('mantiene las comprobaciones propias de la web', () => {
      expect(validate('zoomed-pokemon', { generations: [] })).toBe('Selecciona al menos una generación.');
      expect(validate('type-chain', {})).toBeNull();
    });
  });
});
