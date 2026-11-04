import { defaultTypeChainConfig, type RoomView, type TypeChainPlayerState, type TypeChainPublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TypeChainConfigPanel } from '../games/type-chain/ConfigPanel';
import { typeChainAnnouncement, typeChainEventView, typeChainFocusKey, typeChainMemberStatus, typeChainPlateKind, typeChoiceText } from '../games/type-chain/presentation';
import { TypeChainGame } from './TypeChainGame';
import { TypeChainResults } from './TypeChainResults';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
// El buscador de verdad necesita el pool: aquí se pinta un sustituto que enseña su etiqueta y los bloqueados.
vi.mock('./PokemonSelector', () => ({
  PokemonSelector: ({ inputLabel, locked }: { inputLabel: string; locked: ReadonlySet<string> }) => createElement('input', { 'aria-label': inputLabel, 'data-locked': [...locked].join(',') }),
}));

const charizard = { id: 'charizard', name: 'Charizard', sprite: '/charizard.png', types: ['fire', 'flying'] as ['fire', 'flying'] };
const staraptor = { id: 'staraptor', name: 'Staraptor', sprite: '/staraptor.png', types: ['normal', 'flying'] as ['normal', 'flying'] };

function publicGame(phase: 'TURN_ACTIVE' | 'GAME_RESULTS' = 'TURN_ACTIVE'): TypeChainPublicState {
  return {
    gameId: 'type-chain', phase, turnOrder: ['p1', 'p2', 'p3'], activePlayerIds: phase === 'TURN_ACTIVE' ? ['p1', 'p2'] : ['p1'], eliminatedPlayerIds: phase === 'TURN_ACTIVE' ? ['p3'] : ['p3', 'p2'], currentPlayerId: phase === 'TURN_ACTIVE' ? 'p1' : null, nextPlayerId: phase === 'TURN_ACTIVE' ? 'p2' : null,
    turnNumber: 4, chainNumber: 1, chain: [
      { pokemon: { ...charizard, types: [...charizard.types] }, playedBy: null, sharedType: null, turnNumber: 0 },
      { pokemon: { ...staraptor, types: [...staraptor.types] }, playedBy: 'p2', sharedType: 'flying', turnNumber: 3 },
    ], usedPokemonIds: ['charizard', 'staraptor'], longestChain: 7, turnStartedAt: 1_000, roundEndsAt: phase === 'TURN_ACTIVE' ? Date.now() + 15_000 : null,
    invalidAttempts: [{ playerId: 'p2', pokemon: { id: 'talonflame', name: 'Talonflame', sprite: '/talonflame.png', types: ['fire', 'flying'] }, reason: 'MULTIPLE_SHARED_TYPES', attemptedAt: 900 }],
    eliminations: [{ playerId: 'p3', reason: 'TIMEOUT', turnNumber: 2, eliminatedAt: 800, eliminationOrder: 1 }, ...(phase === 'GAME_RESULTS' ? [{ playerId: 'p2', reason: 'DISCONNECTED' as const, turnNumber: 5, eliminatedAt: 1_200, eliminationOrder: 2 }] : [])],
    events: [{ kind: 'SUCCESS', playerId: 'p2', from: { ...charizard, types: [...charizard.types] }, to: { ...staraptor, types: [...staraptor.types] }, sharedType: 'flying', at: 950 }],
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 8, won: true, stats: { validSubmissions: 3, invalidAttempts: 1, turnsSurvived: 3, timeoutEliminations: 0, longestChain: 7 } },
      { playerId: 'p2', position: 2, points: 5, won: false, stats: { validSubmissions: 2, invalidAttempts: 2, turnsSurvived: 2, timeoutEliminations: 0, longestChain: 7 } },
      { playerId: 'p3', position: 3, points: 2, won: false, stats: { validSubmissions: 0, invalidAttempts: 1, turnsSurvived: 0, timeoutEliminations: 1, longestChain: 7 } },
    ] } : null,
  };
}

function room(game: TypeChainPublicState, player: TypeChainPlayerState | null): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'type-chain', selectedGameConfig: defaultTypeChainConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 8 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 5 },
    { id: 'p3', displayName: 'Marta', avatar: { type: 'DEFAULT' }, connected: false, presence: 'TEMPORARILY_DISCONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 2 },
    { id: 's1', displayName: 'Sara', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'SPECTATOR', isHost: false, ready: false, sessionPoints: 0 },
  ] };
}

const turn: TypeChainPlayerState = { canSubmit: true, isCurrentPlayer: true, eliminated: false, cooldownUntil: null, lastAttempt: null };
const waitingState: TypeChainPlayerState = { canSubmit: false, isCurrentPlayer: false, eliminated: false, cooldownUntil: null, lastAttempt: null };
const render = (game: TypeChainPublicState, player: TypeChainPlayerState | null, selfId = 'p1') => renderToStaticMarkup(createElement(TypeChainGame, { room: room(game, player), selfId, onAction: async () => undefined }));

describe('Type Chain: presentación', () => {
  it('elige la placa según el turno, la eliminación y el rol', () => {
    const game = publicGame();
    expect(typeChainPlateKind({ game, player: turn, spectator: false })).toBe('turn');
    expect(typeChainPlateKind({ game, player: waitingState, spectator: false })).toBe('waiting');
    expect(typeChainPlateKind({ game, player: { ...waitingState, eliminated: true }, spectator: false })).toBe('eliminated');
    expect(typeChainPlateKind({ game, player: null, spectator: true })).toBe('spectator');
    expect(typeChainPlateKind({ game, player: null, spectator: false })).toBe('spectator');
    expect(typeChainPlateKind({ game: { ...game, phase: 'GAME_STARTING' }, player: turn, spectator: false })).toBe('starting');
    expect(typeChainFocusKey('turn', 4)).toBe('turn-4');
    expect(typeChainFocusKey('starting', 4)).toBeNull();
  });

  it('dice en texto los tipos que valen, el último movimiento y el estado de cada jugador', () => {
    expect(typeChoiceText(['normal', 'flying'])).toBe('Normal o Volador');
    expect(typeChoiceText(['fire'])).toBe('Fuego');
    const names = (id: string) => ({ p1: 'Eru', p2: 'Ana' })[id] ?? id;
    expect(typeChainEventView(publicGame().events[0], names)).toEqual({ tone: 'ok', title: 'Ana continúa la cadena', text: 'Charizard → Staraptor · comparten Volador' });
    expect(typeChainEventView({ kind: 'ELIMINATION', playerId: 'p1', reason: 'TIMEOUT', at: 1 }, names)?.title).toBe('Eru queda eliminado');
    expect(typeChainEventView({ kind: 'CHAIN_RESET', previousLength: 9, starter: charizard, at: 1 }, names)?.text).toContain('llegó a 9 Pokémon');
    const game = publicGame();
    expect(typeChainMemberStatus(game, 'p1')).toEqual({ kind: 'current' });
    expect(typeChainMemberStatus(game, 'p2')).toEqual({ kind: 'next' });
    expect(typeChainMemberStatus(game, 'p3')).toEqual({ kind: 'eliminated', reason: 'TIMEOUT', order: 1 });
  });

  it('anuncia el movimiento, el turno y, en tu turno, por qué no valió tu intento', () => {
    const game = publicGame();
    const nameOf = (id: string) => ({ p1: 'Eru', p2: 'Ana' })[id] ?? id;
    expect(typeChainAnnouncement({ game, player: turn, kind: 'turn', nameOf })).toBe('Ana continúa la cadena. Charizard → Staraptor · comparten Volador. Tu turno: continúa desde Staraptor.');
    const failed = typeChainAnnouncement({ game, player: { ...turn, lastAttempt: { reason: 'NO_SHARED_TYPE', pokemonName: 'Pikachu', attemptedAt: 1_500 } }, kind: 'turn', nameOf });
    expect(failed).toMatch(/^Incorrecto: Pikachu\. No comparte ningún tipo\. Nuevo intento en 1 segundo\./);
    // Un fallo de un turno anterior ya no se anuncia.
    expect(typeChainAnnouncement({ game, player: { ...turn, lastAttempt: { reason: 'NO_SHARED_TYPE', pokemonName: 'Pikachu', attemptedAt: 500 } }, kind: 'turn', nameOf })).not.toContain('Pikachu');
    expect(typeChainAnnouncement({ game, player: waitingState, kind: 'waiting', nameOf })).toContain('Turno 4: le toca a Eru.');
    expect(typeChainAnnouncement({ game, player: null, kind: 'starting', nameOf })).toBe('');
  });
});

describe('Type Chain: pantalla', () => {
  it('pinta el Pokémon actual con sus tipos, la regla, la cadena, los fallos y el buscador con los usados bloqueados', () => {
    const markup = render(publicGame(), turn);
    expect(markup).toContain('Pokémon actual'); expect(markup).toContain('Staraptor'); expect(markup).toContain('exactamente un tipo');
    expect(markup).toContain('data-type="normal"'); expect(markup).toContain('data-type="flying"');
    expect(markup).toContain('Enlaza por <strong>Volador</strong>'); expect(markup).toContain('Inicio de la cadena');
    expect(markup).toContain('Talonflame'); expect(markup).toContain('Comparte los dos tipos');
    expect(markup).toContain('aria-label="Buscar Pokémon para continuar desde Staraptor"');
    expect(markup).toContain('data-locked="charizard,staraptor"');
    expect(markup).toContain('¡Tu turno!'); expect(markup).toContain('Continúa desde Staraptor');
    expect(markup).toContain('Siguiente'); expect(markup).toContain('Marta'); expect(markup).toContain('Eliminado</span><span'); expect(markup).toContain('Se le acabó el tiempo');
    expect(markup).toContain('Ana continúa la cadena'); expect(markup).toContain('role="timer"');
  });

  it('tiene una sola región viva y ningún error propio', () => {
    const markup = render(publicGame(), { ...turn, lastAttempt: { reason: 'NO_SHARED_TYPE', pokemonName: 'Pikachu', attemptedAt: 1_500 }, cooldownUntil: Date.now() + 800 });
    expect(markup.match(/aria-live/g)).toHaveLength(1);
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).not.toContain('role="alert"');
    // La espera tras el fallo se ve (oculta a los lectores: ya la dice la región viva).
    expect(markup).toContain('data-testid="type-chain-cooldown"'); expect(markup).toContain('Nuevo intento en');
  });

  it('fuera de tu turno espera, eliminado observa y el espectador sin estado de jugador no rompe', () => {
    const waiting = render(publicGame(), waitingState, 'p2');
    expect(waiting).toContain('Esperando a Eru…'); expect(waiting).toContain('Turno de Eru'); expect(waiting).not.toContain('Buscar Pokémon para continuar');
    const observing = render(publicGame(), { ...waitingState, eliminated: true }, 'p3');
    expect(observing).toContain('Observas la cadena'); expect(observing).toContain('Eliminado: se le acabó el tiempo'); expect(observing).not.toContain('Buscar Pokémon para continuar');
    const spectator = render(publicGame(), null, 's1');
    expect(spectator).toContain('Espectador'); expect(spectator).toContain('Observas la cadena'); expect(spectator).not.toContain('Buscar Pokémon para continuar');
  });

  it('ajustes con el catálogo: tiempo por turno en un Segmented', () => {
    const config = renderToStaticMarkup(createElement(TypeChainConfigPanel, { config: defaultTypeChainConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Tiempo por turno'); expect(config).toContain('role="radiogroup"'); expect(config).toMatch(/aria-checked="true"[^>]*>15s</);
    expect(config).toContain('Exactamente un tipo compartido'); expect(config).not.toContain('type="range"');
  });

  it('resultados: clasificación con estadísticas, cómo cayó cada uno, récords y continuar sesión', () => {
    const markup = renderToStaticMarkup(createElement(TypeChainResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(markup).toContain('Clasificación final'); expect(markup).toContain('cadena más larga: 7 Pokémon');
    expect(markup).toContain('3 válidos'); expect(markup).toContain('1 eliminación por tiempo');
    expect(markup).toContain('Sigue en pie'); expect(markup).toContain('Eliminado 1.º'); expect(markup).toContain('Cayó: se le acabó el tiempo'); expect(markup).toContain('Eliminado 2.º'); expect(markup).toContain('Cayó: se desconectó en su turno');
    expect(markup).toContain('Más eslabones'); expect(markup).toContain('Menos fallos');
    expect(markup).toContain('Continuar sesión'); expect(markup).toContain('Avatar de Eru');
    expect(markup).not.toMatch(/🥇|🥈|🥉/);
  });
});
