import { defaultTypeChainConfig, type RoomView, type TypeChainPlayerState, type TypeChainPublicState } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TypeChainConfigPanel } from '../games/type-chain/ConfigPanel';
import { chainTypeText, typeChainAnnouncement, typeChainEventView, typeChainFocusKey, typeChainMemberStatus, typeChainNamed, typeChainPlateKind, typeChainSearchAutoFocus } from '../games/type-chain/presentation';
import { TypeChainGame } from './TypeChainGame';
import { TypeChainResults } from './TypeChainResults';
import { expectSingleLiveRegion } from './test-support/live-regions';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
// El buscador de verdad necesita el pool: aquí se pinta un sustituto que enseña su etiqueta, los bloqueados y si se enfoca solo.
vi.mock('./PokemonSelector', () => ({
  PokemonSelector: ({ inputLabel, locked, autoFocus }: { inputLabel: string; locked: ReadonlySet<string>; autoFocus?: boolean }) => createElement('input', { 'aria-label': inputLabel, 'data-locked': [...locked].join(','), 'data-autofocus': String(Boolean(autoFocus)) }),
}));

const charizard = { id: 'charizard', name: 'Charizard', sprite: '/charizard.png', types: ['fire', 'flying'] as ['fire', 'flying'] };
const staraptor = { id: 'staraptor', name: 'Staraptor', sprite: '/staraptor.png', types: ['normal', 'flying'] as ['normal', 'flying'] };
const blastoise = { id: 'blastoise', name: 'Blastoise', sprite: '/blastoise.png', types: ['water'] as ['water'] };

function publicGame(phase: 'TURN_ACTIVE' | 'GAME_RESULTS' = 'TURN_ACTIVE'): TypeChainPublicState {
  return {
    gameId: 'type-chain', phase, turnOrder: ['p1', 'p2', 'p3'], activePlayerIds: phase === 'TURN_ACTIVE' ? ['p1', 'p2'] : ['p1'], eliminatedPlayerIds: phase === 'TURN_ACTIVE' ? ['p3'] : ['p3', 'p2'], currentPlayerId: phase === 'TURN_ACTIVE' ? 'p1' : null, nextPlayerId: phase === 'TURN_ACTIVE' ? 'p2' : null,
    turnNumber: 4, chainNumber: 1, chainType: 'flying', chain: [
      { pokemon: { ...charizard, types: [...charizard.types] }, playedBy: 'p1', turnNumber: 1 },
      { pokemon: { ...staraptor, types: [...staraptor.types] }, playedBy: 'p2', turnNumber: 3 },
    ], usedPokemonIds: ['charizard', 'staraptor'], longestChain: 7, namedCounts: { p1: 3, p2: 2, p3: 0 }, turnStartedAt: 1_000, roundEndsAt: phase === 'TURN_ACTIVE' ? Date.now() + 15_000 : null,
    invalidAttempts: [{ playerId: 'p2', pokemon: { ...blastoise, types: [...blastoise.types] }, reason: 'WRONG_TYPE', attemptedAt: 900 }],
    eliminations: [{ playerId: 'p3', reason: 'TIMEOUT', turnNumber: 2, eliminatedAt: 800, eliminationOrder: 1 }, ...(phase === 'GAME_RESULTS' ? [{ playerId: 'p2', reason: 'DISCONNECTED' as const, turnNumber: 5, eliminatedAt: 1_200, eliminationOrder: 2 }] : [])],
    events: [{ kind: 'SUCCESS', playerId: 'p2', pokemon: { ...staraptor, types: [...staraptor.types] }, chainType: 'flying', at: 950 }],
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 8, won: true, stats: { validSubmissions: 3, invalidAttempts: 1, turnsSurvived: 3, timeoutEliminations: 0, longestChain: 7 } },
      { playerId: 'p2', position: 2, points: 5, won: false, stats: { validSubmissions: 2, invalidAttempts: 2, turnsSurvived: 2, timeoutEliminations: 0, longestChain: 7 } },
      { playerId: 'p3', position: 3, points: 2, won: false, stats: { validSubmissions: 0, invalidAttempts: 1, turnsSurvived: 0, timeoutEliminations: 1, longestChain: 7 } },
    ] } : null,
  };
}

function room(game: TypeChainPublicState, player: TypeChainPlayerState | null): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'type-chain', selectedGameConfig: defaultTypeChainConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['type-chain'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], daily: null, serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 8 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 5 },
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
    expect(typeChainPlateKind({ game: { ...game, chainType: null }, player: turn, spectator: false })).toBe('starting');
    // Una cadena recién empezada (sin Pokémon aún) ya es un turno: el tipo basta.
    expect(typeChainPlateKind({ game: { phase: 'TURN_ACTIVE', chainType: 'water' }, player: turn, spectator: false })).toBe('turn');
    expect(typeChainFocusKey('turn', 4)).toBe('turn-4');
    expect(typeChainFocusKey('starting', 4)).toBeNull();
  });

  it('solo enfoca el buscador en tu turno (también el primero: se monta de nuevo en cada turno propio)', () => {
    expect(typeChainSearchAutoFocus('turn')).toBe(true);
    for (const kind of ['waiting', 'eliminated', 'spectator', 'starting'] as const) expect(typeChainSearchAutoFocus(kind)).toBe(false);
  });

  it('dice en texto el tipo de la cadena, el último movimiento y el estado de cada jugador', () => {
    expect(chainTypeText('psychic')).toBe('Psíquico'); expect(chainTypeText(null)).toBe('la cadena');
    const names = (id: string) => ({ p1: 'Eru', p2: 'Ana' })[id] ?? id;
    expect(typeChainEventView(publicGame().events[0], names)).toEqual({ tone: 'ok', title: 'Ana nombra a Staraptor', text: 'Es de tipo Volador: suma un Pokémon a la cadena' });
    expect(typeChainEventView({ kind: 'ELIMINATION', playerId: 'p1', reason: 'TIMEOUT', at: 1 }, names)?.title).toBe('Eru queda eliminado');
    expect(typeChainEventView({ kind: 'CHAIN_RESET', previousLength: 9, previousType: 'fire', chainType: 'water', at: 1 }, names)).toEqual({ tone: 'warn', title: 'No quedan Pokémon de tipo Fuego · nueva cadena', text: 'La anterior llegó a 9 Pokémon. Nadie queda eliminado; ahora el tipo es Agua.' });
    expect(typeChainNamed(publicGame(), 'p1')).toBe(3); expect(typeChainNamed(publicGame(), 's1')).toBe(0);
    const game = publicGame();
    expect(typeChainMemberStatus(game, 'p1')).toEqual({ kind: 'current' });
    expect(typeChainMemberStatus(game, 'p2')).toEqual({ kind: 'next' });
    expect(typeChainMemberStatus(game, 'p3')).toEqual({ kind: 'eliminated', reason: 'TIMEOUT', order: 1 });
  });

  it('anuncia el movimiento, el turno y, en tu turno, por qué no valió tu intento', () => {
    const game = publicGame();
    const nameOf = (id: string) => ({ p1: 'Eru', p2: 'Ana' })[id] ?? id;
    expect(typeChainAnnouncement({ game, player: turn, kind: 'turn', nameOf })).toBe('Ana nombra a Staraptor. Es de tipo Volador: suma un Pokémon a la cadena. Tu turno: nombra un Pokémon de tipo Volador.');
    const failed = typeChainAnnouncement({ game, player: { ...turn, lastAttempt: { reason: 'WRONG_TYPE', pokemonName: 'Pikachu', attemptedAt: 1_500 } }, kind: 'turn', nameOf });
    expect(failed).toMatch(/^Incorrecto: Pikachu\. No es del tipo de la cadena\. Nuevo intento en 1 segundo\./);
    // Un fallo de un turno anterior ya no se anuncia.
    expect(typeChainAnnouncement({ game, player: { ...turn, lastAttempt: { reason: 'WRONG_TYPE', pokemonName: 'Pikachu', attemptedAt: 500 } }, kind: 'turn', nameOf })).not.toContain('Pikachu');
    expect(typeChainAnnouncement({ game, player: waitingState, kind: 'waiting', nameOf })).toContain('Turno 4: le toca a Eru.');
    expect(typeChainAnnouncement({ game, player: null, kind: 'starting', nameOf })).toBe('');
  });
});

describe('Type Chain: pantalla', () => {
  it('pinta el tipo de la cadena en grande, la regla, la cadena, los fallos y el buscador con los usados bloqueados y enfocado', () => {
    const markup = render(publicGame(), turn);
    expect(markup).toContain('aria-label="Tipo de la cadena"'); expect(markup).toMatch(/data-testid="type-chain-type".*?data-type="flying"[^>]*>Volador</);
    expect(markup).toContain('2 Pokémon nombrados'); expect(markup).toContain('Nombra un Pokémon de tipo <strong>Volador</strong>, solo o con otro tipo.');
    expect(markup).not.toContain('exactamente un tipo');
    expect(markup).toContain('Lo nombró <strong>Ana</strong>'); expect(markup).toContain('Lo nombró <strong>Eru</strong>');
    expect(markup).toContain('Blastoise'); expect(markup).toContain('Otro tipo');
    expect(markup).toContain('aria-label="Buscar Pokémon de tipo Volador"'); expect(markup).toContain('data-autofocus="true"');
    expect(markup).toContain('data-locked="charizard,staraptor"');
    expect(markup).toContain('¡Tu turno!'); expect(markup).toContain('Nombra un Pokémon de tipo Volador');
    expect(markup).toContain('Cadena 1 · Volador · 2 Pokémon');
    expect(markup).toContain('Siguiente'); expect(markup).toContain('Marta'); expect(markup).toContain('Eliminado</span><span'); expect(markup).toContain('Se le acabó el tiempo');
    expect(markup).toMatch(/3<small> nombrados<\/small>/);
    expect(markup).toContain('Ana nombra a Staraptor'); expect(markup).toContain('role="timer"');
  });

  it('una cadena nueva sin Pokémon dice que aún no hay ninguno', () => {
    const markup = render({ ...publicGame(), chainNumber: 2, chainType: 'water', chain: [], usedPokemonIds: [] }, turn);
    expect(markup).toContain('Aún sin Pokémon'); expect(markup).toContain('Nadie ha nombrado aún un Pokémon en esta cadena.');
    expect(markup).toContain('aria-label="Buscar Pokémon de tipo Agua"'); expect(markup).toContain('data-autofocus="true"');
  });

  it('tiene una sola región viva y ningún error propio', () => {
    const markup = render(publicGame(), { ...turn, lastAttempt: { reason: 'WRONG_TYPE', pokemonName: 'Pikachu', attemptedAt: 1_500 }, cooldownUntil: Date.now() + 800 });
    expectSingleLiveRegion(markup);
    expect(markup).not.toContain('role="alert"');
    // La espera tras el fallo se ve (oculta a los lectores: ya la dice la región viva).
    expect(markup).toContain('data-testid="type-chain-cooldown"'); expect(markup).toContain('Nuevo intento en');
  });

  it('fuera de tu turno espera, eliminado observa y el espectador sin estado de jugador no rompe', () => {
    const waiting = render(publicGame(), waitingState, 'p2');
    expect(waiting).toContain('Esperando a Eru…'); expect(waiting).toContain('Turno de Eru'); expect(waiting).not.toContain('Buscar Pokémon de tipo');
    const observing = render(publicGame(), { ...waitingState, eliminated: true }, 'p3');
    expect(observing).toContain('Observas la cadena'); expect(observing).toContain('Eliminado: se le acabó el tiempo'); expect(observing).not.toContain('Buscar Pokémon de tipo');
    const spectator = render(publicGame(), null, 's1');
    expect(spectator).toContain('Espectador'); expect(spectator).toContain('Observas la cadena'); expect(spectator).not.toContain('Buscar Pokémon de tipo');
  });

  it('ajustes con el catálogo: tiempo por turno en un Segmented', () => {
    const config = renderToStaticMarkup(createElement(TypeChainConfigPanel, { config: defaultTypeChainConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Tiempo por turno'); expect(config).toContain('role="radiogroup"'); expect(config).toMatch(/aria-checked="true"[^>]*>15s</);
    expect(config).toContain('Un tipo por cadena'); expect(config).toContain('al menos 10 Pokémon'); expect(config).not.toContain('type="range"');
  });

  it('resultados: clasificación con estadísticas, cómo cayó cada uno, récords y continuar sesión', () => {
    const markup = renderToStaticMarkup(createElement(TypeChainResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(markup).toContain('Clasificación final'); expect(markup).toContain('gana quien más Pokémon nombra · cadena más larga: 7 Pokémon');
    expect(markup).toContain('3 Pokémon nombrados'); expect(markup).toContain('1 fallo');
    expect(markup).toContain('Sigue en pie'); expect(markup).toContain('Eliminado 1.º'); expect(markup).toContain('Cayó: se le acabó el tiempo'); expect(markup).toContain('Eliminado 2.º'); expect(markup).toContain('Cayó: se desconectó en su turno');
    expect(markup).toContain('Más Pokémon nombrados'); expect(markup).not.toContain('turnos superados'); expect(markup).toContain('Menos fallos');
    expect(markup).toContain('Continuar sesión'); expect(markup).toContain('Avatar de Eru');
    expect(markup).not.toMatch(/🥇|🥈|🥉/);
  });
});
