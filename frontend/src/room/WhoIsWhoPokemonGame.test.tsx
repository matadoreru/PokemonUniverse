import { defaultWhoIsWhoPokemonConfig, type RoomView, type WhoIsWhoPlayerState, type WhoIsWhoPublicState } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WhoIsWhoPokemonConfigPanel } from '../games/who-is-who-pokemon/ConfigPanel';
import { WhoIsWhoPokemonGame } from './WhoIsWhoPokemonGame';
import { WhoIsWhoPokemonResults } from './WhoIsWhoPokemonResults';
import { expectSingleLiveRegion } from './test-support/live-regions';
import { labelledRadiogroup } from '../ui/segmented-markup';
import { member, roomView } from './test-support/room-view';
import { LEGACY } from '../styles/legacy-classes';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const MEDALS = /🥇|🥈|🥉|🏆/;

const board = [
  { id: 'forretress', nationalDexNumber: 205, name: 'Forretress', sprite: '/forretress.png' },
  { id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', sprite: '/pikachu.png' },
  { id: 'bulbasaur', nationalDexNumber: 1, name: 'Bulbasaur', sprite: '/bulbasaur.png' },
];
const members: RoomView['members'] = ['blue-1', 'blue-2', 'red-1'].map((id, index) => member({ id, displayName: ['Jose', 'Pepe', 'Eru'][index]!, roomRole: index === 0 ? 'HOST' : 'MEMBER', isHost: index === 0 }));

function game(overrides: Partial<WhoIsWhoPublicState> = {}): WhoIsWhoPublicState {
  return {
    gameId: 'who-is-who-pokemon', phase: 'TURN_ACTIVE', board,
    teams: { BLUE: { playerIds: ['blue-1', 'blue-2'], secretReady: true }, RED: { playerIds: ['red-1'], secretReady: true } }, currentTeam: 'BLUE',
    roundNumber: 2, turnNumber: 3, totalRounds: 25, roundStartedAt: 1_000, roundEndsAt: 31_000,
    guesses: [], winnerTeam: null, revealedSecrets: { BLUE: null, RED: null }, results: null,
    ...overrides,
  };
}

function room(player: WhoIsWhoPlayerState | null, state = game()): RoomView {
  return roomView({ phase: state.phase, hostId: 'blue-1', members, selectedGameId: 'who-is-who-pokemon', selectedGameConfig: { ...defaultWhoIsWhoPokemonConfig, boardSize: 24, turnSeconds: 30 }, game: state, gamePlayerState: player, serverNow: 2_000 });
}

const bluePlayer: WhoIsWhoPlayerState = { role: 'PLAYER', team: 'BLUE', ownSecret: board[0]!, discardedPokemonIds: ['pikachu'], canChooseSecret: false, canManageBoard: true, canAct: true, canGuess: true, guessUsed: false, lastGuess: null };
const redPlayer: WhoIsWhoPlayerState = { role: 'PLAYER', team: 'RED', ownSecret: board[2]!, discardedPokemonIds: [], canChooseSecret: false, canManageBoard: true, canAct: false, canGuess: false, guessUsed: false, lastGuess: null };
const spectator: WhoIsWhoPlayerState = { role: 'SPECTATOR', team: null, ownSecret: null, discardedPokemonIds: [], canChooseSecret: false, canManageBoard: false, canAct: false, canGuess: false, guessUsed: false, lastGuess: null };

const render = (player: WhoIsWhoPlayerState | null, state = game(), selfId = 'blue-1') => renderToStaticMarkup(createElement(WhoIsWhoPokemonGame, { room: room(player, state), selfId, onAction: async () => undefined }));
/** El panel del secreto (del `data-testid` hasta el final de su envoltorio). */
const secretPanel = (html: string) => { const start = html.indexOf('data-testid="who-secret"'); return start < 0 ? '' : html.slice(start, html.indexOf('</section></div>', start)); };

describe('Quién es Quién: tablero, secreto y turno', () => {
  it('el equipo con el turno: tablero de cartas conmutadoras con el estado en texto, su secreto y «Adivinar Pokémon»', () => {
    const html = render(bluePlayer);
    expect(html).toContain('Tablero del Equipo Azul');
    // Pikachu está bajada: `aria-pressed`, nombre fijo y la marca escrita.
    expect(html).toMatch(/aria-label="Bajar Pikachu"[^>]*tabindex="-1"[^>]*data-pokemon-id="pikachu" data-down="true"|data-pokemon-id="pikachu" data-down="true"[^>]*aria-label="Bajar Pikachu"/);
    expect(html).toMatch(/<button[^>]*data-pokemon-id="pikachu"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/<button[^>]*data-pokemon-id="forretress"[^>]*aria-pressed="false"/);
    expect(html.match(/>Bajada</g)).toHaveLength(1);
    expect(html).toContain('1 de 3 bajadas');
    // Foco itinerante: una sola carta en el orden de tabulación.
    expect(html.match(/<button[^>]*data-pokemon-id="[^"]+"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(secretPanel(html)).toContain('Forretress');
    expect(secretPanel(html)).toContain('Secreto');
    expect(html).toContain('Vuestro turno');
    expect(html).toContain('Turno 3 · Tu equipo');
    expect(html).toContain('Preguntad y bajad cartas');
    expect(html).toContain('por voz (sí o no)');
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>).)*Adivinar Pokémon/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Adivinar Pokémon/);
    expect(html).toContain('Terminar turno');
    expect(html).toContain('Ronda 2 de 25 · Turno 3');
    // Los cursores del equipo: una capa sin puntero.
    expect(html).toContain('data-layer="team-cursors"');
  });

  it('una sola región viva, sin errores locales ni clases heredadas', () => {
    for (const html of [render(bluePlayer), render(redPlayer, game(), 'red-1'), render(spectator, game(), 'spectator')]) {
      expectSingleLiveRegion(html);
      expect(html).not.toContain('role="alert"');
      expect(html).not.toMatch(LEGACY);
    }
  });

  it('privacidad: el rival y quien observa no tienen el secreto del Equipo Azul en el DOM', () => {
    const rival = render(redPlayer, game(), 'red-1');
    // El rival solo ve SU secreto (Bulbasaur), nunca el de Azul; y no recibe las cartas bajadas de Azul.
    expect(secretPanel(rival)).toContain('Bulbasaur');
    expect(secretPanel(rival)).not.toContain('Forretress');
    expect(rival.match(/data-testid="who-secret"/g)).toHaveLength(1);
    expect(rival).not.toContain('data-down="true"');
    const watcher = render(spectator, game(), 'spectator');
    expect(watcher).not.toContain('who-secret');
    expect(watcher).not.toContain('Vuestro secreto');
    expect(watcher).not.toContain('aria-pressed');
    expect(watcher).not.toContain('Adivinar Pokémon');
    expect(watcher).not.toContain('team-cursors');
  });

  it('el equipo que espera: responde por voz, puede bajar cartas, «Adivinar» deshabilitado y sin «Terminar turno»', () => {
    const html = render(redPlayer, game(), 'red-1');
    expect(html).toContain('Turno del Equipo Azul');
    expect(html).toContain('Os toca responder');
    expect(html).toContain('responded por voz con sí o no');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Adivinar Pokémon/);
    expect(html).not.toContain('Terminar turno');
    expect(html).toContain('aria-label="Bajar Pikachu"');
  });

  it('el fallo que cerró el turno anterior se cuenta en la placa y en la región viva', () => {
    const missed = game({ currentTeam: 'RED', turnNumber: 4, guesses: [{ team: 'BLUE', playerId: 'blue-1', pokemonId: 'pikachu', correct: false, attemptedAt: 1_500, turnNumber: 3 }] });
    const html = render({ ...bluePlayer, canAct: false, canGuess: false }, missed);
    expect(html).toContain('Tu intento con Pikachu no era: turno terminado.');
    expect(html).toContain('Jose (Equipo Azul) probó Pikachu: no era. Turno 4: le toca al Equipo Rojo.');
    expect(html).toContain('data-testid="who-guess"');
    expect(html).toContain('No era');
  });

  it('antes de empezar: elegir el secreto del equipo o esperar al otro', () => {
    const choosing = game({ teams: { BLUE: { playerIds: ['blue-1', 'blue-2'], secretReady: false }, RED: { playerIds: ['red-1'], secretReady: true } }, roundStartedAt: null });
    const html = render({ ...bluePlayer, ownSecret: null, canChooseSecret: true, canManageBoard: false, canAct: false, canGuess: false }, choosing);
    expect(html).toContain('Elegid vuestro Pokémon secreto');
    expect(html).toContain('Elegir nuestro Pokémon');
    expect(html).toContain('Eligiendo secreto');
    expect(html).toContain('Secreto elegido');
    expect(html).not.toContain('who-secret');
    // Sin secretos no se baja nada: cartas quietas.
    expect(html).not.toContain('aria-pressed');
    const waiting = render(redPlayer, choosing, 'red-1');
    expect(waiting).toContain('Esperando los secretos');
    expect(waiting).toContain('Falta el del otro equipo.');
  });
});

describe('Quién es Quién: resultados', () => {
  const final = (winnerTeam: WhoIsWhoPublicState['winnerTeam']) => game({
    phase: 'GAME_RESULTS', winnerTeam, revealedSecrets: { BLUE: board[0]!, RED: board[2]! },
    guesses: winnerTeam ? [{ team: winnerTeam, playerId: winnerTeam === 'BLUE' ? 'blue-1' : 'red-1', pokemonId: winnerTeam === 'BLUE' ? 'bulbasaur' : 'forretress', correct: true, attemptedAt: 2_000, turnNumber: 3 }] : [],
    results: { winnerId: winnerTeam === 'BLUE' ? 'blue-1' : winnerTeam === 'RED' ? 'red-1' : null, standings: [
      { playerId: 'blue-1', position: 1, points: winnerTeam === 'BLUE' ? 10 : 0, won: winnerTeam === 'BLUE', stats: { wins: winnerTeam === 'BLUE' ? 1 : 0, turnsPlayed: 1, correctGuesses: winnerTeam === 'BLUE' ? 1 : 0, incorrectGuesses: 0 } },
      { playerId: 'blue-2', position: 1, points: winnerTeam === 'BLUE' ? 10 : 0, won: winnerTeam === 'BLUE', stats: { wins: 0, turnsPlayed: 0, correctGuesses: 0, incorrectGuesses: 0 } },
      { playerId: 'red-1', position: winnerTeam === 'BLUE' ? 3 : 1, points: winnerTeam === 'RED' ? 10 : 0, won: winnerTeam === 'RED', stats: { wins: 0, turnsPlayed: 1, correctGuesses: 0, incorrectGuesses: 1 } },
    ] },
  });
  const renderResults = (state: WhoIsWhoPublicState) => renderToStaticMarkup(createElement(WhoIsWhoPokemonResults, { room: room(null, state), selfId: 'blue-1', onLobby: () => undefined, onEnd: () => undefined }));

  it('el equipo ganador, los secretos revelados y las estadísticas en texto, sin medallas', () => {
    const html = renderResults(final('BLUE'));
    expect(html).toContain('¡Ganó el Equipo Azul!');
    expect(html).toContain('Secreto: Forretress');
    expect(html).toContain('Secreto: Bulbasaur');
    expect(html).toContain('1 acierto · 0 fallos');
    expect(html).toContain('El Equipo Azul adivinó el secreto rival: cada uno de sus jugadores suma 10 puntos.');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(MEDALS);
    expect(html).not.toMatch(LEGACY);
  });

  it('empate por rondas: nadie suma y nadie se corona', () => {
    const html = renderResults(final(null));
    expect(html).toContain('>Empate</h1>');
    expect(html).toContain('nadie suma puntos');
    expect(html).not.toContain('Ganador');
  });
});

describe('Quién es Quién: ajustes', () => {
  it('controles del catálogo con los valores del motor', () => {
    const html = renderToStaticMarkup(createElement(WhoIsWhoPokemonConfigPanel, { config: defaultWhoIsWhoPokemonConfig, disabled: false, onChange: async () => undefined }));
    expect(html).toMatch(labelledRadiogroup('Pokémon secreto'));
    expect(html).toMatch(labelledRadiogroup('Tiempo por turno'));
    expect(html).toMatch(labelledRadiogroup('Rondas máximas'));
    expect(html).toContain('Pokémon en el tablero');
    expect(html).toContain('Tiempo para elegir secreto');
    expect(html).toContain('role="switch"');
    // `GenerationSelector` sigue siendo el heredado (F9): se mira lo que viene después.
    expect(html.slice(html.indexOf('</section>'))).not.toMatch(LEGACY);
  });
});
