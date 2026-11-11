import { describe, expect, it } from 'vitest';
import { connectedCount, filterGames, lobbyActionStatus, lobbyStartReason, normalizeSearch, playerRangeLabel, withDoubleLastGame, withGameCountTarget } from './lobby-state';

describe('la última partida vale doble', () => {
  it('cambiar el número de partidas conserva la opción', () => {
    expect(withGameCountTarget({ type: 'GAME_COUNT', target: 5, doubleLastGame: true }, 7)).toEqual({ type: 'GAME_COUNT', target: 7, doubleLastGame: true });
    expect(withGameCountTarget({ type: 'GAME_COUNT', target: 5 }, 7)).toEqual({ type: 'GAME_COUNT', target: 7 });
    expect(withGameCountTarget({ type: 'INFINITE' }, 3)).toEqual({ type: 'GAME_COUNT', target: 3 });
  });

  it('solo el modo por partidas tiene la opción', () => {
    expect(withDoubleLastGame({ type: 'GAME_COUNT', target: 5 }, true)).toEqual({ type: 'GAME_COUNT', target: 5, doubleLastGame: true });
    expect(withDoubleLastGame({ type: 'GAME_COUNT', target: 5, doubleLastGame: true }, false)).toEqual({ type: 'GAME_COUNT', target: 5, doubleLastGame: false });
    expect(withDoubleLastGame({ type: 'POINT_TARGET', target: 50 }, true)).toBeNull();
    expect(withDoubleLastGame({ type: 'INFINITE' }, true)).toBeNull();
  });
});

const games = [
  { name: 'Pokédex Distance', description: 'Elige el número más cercano.' },
  { name: 'Shiny Quiz', description: 'Encuentra el shiny verdadero.' },
];

describe('búsqueda de minijuegos', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizeSearch('  PoKÉDEX ')).toBe('pokedex');
    expect(filterGames(games, 'pokedex').map((game) => game.name)).toEqual(['Pokédex Distance']);
  });
  it('busca también en la descripción', () => {
    expect(filterGames(games, 'número').map((game) => game.name)).toEqual(['Pokédex Distance']);
  });
  it('sin búsqueda devuelve todos (copia) y sin coincidencias, ninguno', () => {
    const all = filterGames(games, '  ');
    expect(all).toEqual(games);
    expect(all).not.toBe(games);
    expect(filterGames(games, 'zzzz')).toEqual([]);
  });
});

describe('playerRangeLabel', () => {
  it('con y sin máximo', () => {
    // Nunca se enseña el máximo: solo el mínimo con «+».
    expect(playerRangeLabel({ minPlayers: 2, maxPlayers: 8 })).toBe('+2 jugadores');
    expect(playerRangeLabel({ minPlayers: 1 })).toBe('+1 jugadores');
  });
});

describe('connectedCount', () => {
  it('solo cuenta los conectados', () => {
    expect(connectedCount([{ presence: 'CONNECTED' }, { presence: 'TEMPORARILY_DISCONNECTED' }, { presence: 'CONNECTED' }])).toBe(2);
  });
});

describe('lobbyActionStatus', () => {
  it('el host ve qué falta o que la sala está lista', () => {
    expect(lobbyActionStatus({ canStart: true, ready: false, startReason: 'Falta por confirmar: Ana.', hostName: 'Eru' })).toEqual({ kicker: 'Falta algo', title: 'Iniciar partida', text: 'Falta por confirmar: Ana.', ok: false });
    expect(lobbyActionStatus({ canStart: true, ready: false, startReason: null, hostName: 'Eru' })).toEqual({ kicker: 'Todo listo', title: 'Iniciar partida', text: 'La sala está lista.', ok: true });
  });
  it('un invitado ve su propio estado y a quién espera', () => {
    expect(lobbyActionStatus({ canStart: false, ready: false, startReason: 'Solo el host puede iniciar la partida.', hostName: 'Eru' }).text).toBe('Márcate listo para que Eru pueda empezar.');
    expect(lobbyActionStatus({ canStart: false, ready: true, startReason: null, hostName: 'Eru' })).toMatchObject({ title: 'Estás listo', ok: true });
    expect(lobbyActionStatus({ canStart: false, ready: true, startReason: null, hostName: undefined }).text).toBe('El host empezará la partida cuando esté todo preparado.');
    expect(lobbyActionStatus({ canStart: false, ready: false, startReason: null, hostName: undefined }).text).toBe('Márcate listo para que el host pueda empezar.');
  });
});

describe('lobbyStartReason', () => {
  const base = { canStart: true, selectedGames: [{ minPlayers: 2, maxPlayers: 8 }], compatibleCount: 1, pendingReadyNames: [], connectedPlayers: 3, configReason: null };
  it('sin motivo, se puede empezar', () => {
    expect(lobbyStartReason(base)).toBeNull();
  });
  it('en orden: permiso, juego elegido y pendientes de confirmar', () => {
    expect(lobbyStartReason({ ...base, canStart: false, selectedGames: [] })).toBe('Solo el host puede iniciar la partida.');
    expect(lobbyStartReason({ ...base, selectedGames: [], pendingReadyNames: ['Ana'] })).toBe('Elige al menos un minijuego para empezar.');
    expect(lobbyStartReason({ ...base, pendingReadyNames: ['Ana', 'Eru'], connectedPlayers: 1 })).toBe('Falta por confirmar: Ana, Eru.');
  });
  it('un solo juego: el mínimo o el máximo exacto, antes que la configuración', () => {
    expect(lobbyStartReason({ ...base, connectedPlayers: 1, configReason: 'Mal' })).toBe('Se necesitan al menos 2 jugadores conectados.');
    expect(lobbyStartReason({ ...base, connectedPlayers: 9 })).toBe('Este juego admite un máximo de 8 jugadores.');
    expect(lobbyStartReason({ ...base, configReason: 'Elige al menos una generación.' })).toBe('Elige al menos una generación.');
  });
  it('varios juegos (o uno que la sala no conoce): solo si ninguno admite a los conectados', () => {
    const two = { ...base, selectedGames: [{ minPlayers: 4 }, { minPlayers: 2 }] };
    expect(lobbyStartReason({ ...two, compatibleCount: 1, connectedPlayers: 2 })).toBeNull();
    expect(lobbyStartReason({ ...two, compatibleCount: 0, connectedPlayers: 1 })).toBe('Ningún minijuego elegido admite el número actual de jugadores.');
    expect(lobbyStartReason({ ...base, selectedGames: [undefined], compatibleCount: 0 })).toBe('Ningún minijuego elegido admite el número actual de jugadores.');
  });
});
