import { describe, expect, it } from 'vitest';
import { connectedCount, filterGames, lobbyActionStatus, normalizeSearch, playerRangeLabel } from './lobby-state';

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
    expect(playerRangeLabel({ minPlayers: 2, maxPlayers: 8 })).toBe('2–8 jugadores');
    expect(playerRangeLabel({ minPlayers: 3 })).toBe('3+ jugadores');
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
