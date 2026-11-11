import { defaultWhoAmIConfig, type RoomView, type WhoAmIPlayerState, type WhoAmIPokemon, type WhoAmIPublicState } from '@pokemon-universe/shared/public';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WhoAmIConfigPanel } from '../games/who-am-i/ConfigPanel';
import s from '../games/who-am-i/WhoAmI.module.css';
import { WhoAmIGame } from './WhoAmIGame';
import { WhoAmIResults } from './WhoAmIResults';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [{ id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' }], error: '', loading: false, retry: () => undefined }) }));

const NAMES = ['Eru', 'Ana', 'Leo'];
const poke = (id: string, name: string, nationalDexNumber: number, types: string[]): WhoAmIPokemon => ({ id, name, sprite: `/${id}.png`, nationalDexNumber, types });
const MEWTWO = poke('mewtwo', 'Mewtwo', 150, ['psychic']);
const BULBASAUR = poke('bulbasaur', 'Bulbasaur', 1, ['grass', 'poison']);
const SQUIRTLE = poke('squirtle', 'Squirtle', 7, ['water']);
const CHARMANDER = poke('charmander', 'Charmander', 4, ['fire']);

function publicGame(overrides: Partial<WhoAmIPublicState> = {}): WhoAmIPublicState {
  return {
    gameId: 'who-am-i', phase: 'TURN_ACTIVE', lap: 2, maxLaps: 10, playerIds: ['p1', 'p2', 'p3'], turnPlayerId: 'p1', turnStep: 'ASKING',
    currentQuestion: null,
    history: {
      p1: [
        { kind: 'QUESTION', text: '¿Tengo alas?', answers: [{ playerId: 'p2', answer: 'NO' }, { playerId: 'p3', answer: 'PARTLY' }] },
        { kind: 'GUESS', pokemon: CHARMANDER },
      ],
      p2: [{ kind: 'QUESTION', text: '¿Soy azul?', answers: [{ playerId: 'p1', answer: 'YES' }] }],
    },
    solvedPlayerIds: [], questionsAsked: { p1: 1, p2: 1 }, scores: { p1: 0, p2: 0, p3: 0 }, turnEndsAt: 46_000, results: null, ...overrides,
  };
}

/** Estado de p1: ve los Pokémon de p2 y p3, nunca el suyo (Mewtwo). */
function playerState(overrides: Partial<WhoAmIPlayerState> = {}): WhoAmIPlayerState {
  return { role: 'PLAYER', others: { p2: BULBASAUR, p3: SQUIRTLE }, self: null, canAsk: false, canAnswer: false, canGuess: false, canPass: false, ownAnswer: null, ...overrides };
}

function room(game: WhoAmIPublicState, player: WhoAmIPlayerState | null): RoomView {
  const members = NAMES.map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[`p${index + 1}`] ?? 0 }));
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'who-am-i', name: '¿Quién soy?', icon: '🎭', description: 'Adivina', minPlayers: 2, profileStats: { metrics: [] } }], selectedGameId: 'who-am-i', selectedGameConfig: defaultWhoAmIConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['who-am-i'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], daily: null, serverNow: 1_000, game, gamePlayerState: player, members } as RoomView;
}

const render = (game: WhoAmIPublicState, player: WhoAmIPlayerState | null, selfId = 'p1') => renderToStaticMarkup(createElement(WhoAmIGame, { room: room(game, player), selfId, onAction: async () => undefined }));
const results = (game: WhoAmIPublicState, selfId = 'p1') => renderToStaticMarkup(createElement(WhoAmIResults, { room: room(game, null), selfId, onLobby: () => undefined, onEnd: () => undefined }));
/** El trozo del HTML desde un bloque marcado con `data-testid` hasta su cierre (`</ul>`: sus entradas no llevan listas). */
function block(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  if (start < 0) return '';
  return html.slice(start, html.indexOf('</ul>', start));
}
const count = (html: string, text: string) => html.split(text).length - 1;

describe('¿Quién soy?: pantalla', () => {
  it.each([
    ['en tu turno', publicGame(), playerState({ canAsk: true, canGuess: true })],
    ['desconectado (sin poder preguntar ni responder)', publicGame({ turnPlayerId: 'p2', turnStep: 'ANSWERING', currentQuestion: { text: '¿Soy azul?', answers: [], answeredPlayerIds: [] } }), playerState()],
  ])('la carta propia muestra «?» y nunca el propio Pokémon %s, aunque el estado lo traiga de más', (_label, game, player) => {
    // Un estado mal formado: el propio Pokémon colado en `others` y unos resultados sobrantes en plena partida.
    const leaky = { ...player, others: { ...player.others, p1: MEWTWO } };
    const stale = { ...game, results: [{ playerId: 'p1', pokemon: MEWTWO, solved: false, questionsAsked: 1, points: 0, rank: 3 }] };
    const html = render(stale, leaky);
    expect(html).not.toContain('Mewtwo');
    expect(html).not.toContain('/mewtwo.png');
    const cards = block(html, 'who-am-i-cards');
    expect(cards).toContain('Bulbasaur');
    expect(cards).toContain('Squirtle');
    expect(cards).toContain('Nº 001');
    expect(cards).toContain('>?<');
  });

  it('quien ya acertó ve su propio Pokémon en su carta', () => {
    const html = render(publicGame({ turnPlayerId: 'p2', solvedPlayerIds: ['p1'] }), playerState({ self: MEWTWO }));
    expect(block(html, 'who-am-i-cards')).toContain('Mewtwo');
  });

  it('en DECIDING la pregunta en curso no sale también en «Tus pistas»', () => {
    const html = render(publicGame({ turnStep: 'DECIDING', currentQuestion: { text: '¿Soy legendario?', answers: [{ playerId: 'p2', answer: 'YES' }], answeredPlayerIds: ['p2'] } }), playerState({ canGuess: true, canPass: true }));
    const clues = block(html, 'who-am-i-clues');
    expect(html).toContain('Tus pistas');
    expect(clues).toContain('¿Tengo alas?');
    expect(clues).not.toContain('¿Soy legendario?');
    expect(html).toContain('¿Soy legendario?');
  });

  it('en tu ASKING salen el contador 0/120 y «Adivinar»', () => {
    const html = render(publicGame(), playerState({ canAsk: true, canGuess: true }));
    expect(html).toContain('0/120');
    expect(html).toContain('maxLength="120"');
    expect(html).toContain('Escribe una pregunta de sí o no');
    expect(html).toContain('Adivinar');
    expect(html).toContain('Pregunta sobre tu Pokémon');
  });

  it('con canAnswer salen las cuatro respuestas', () => {
    const html = render(publicGame({ turnPlayerId: 'p2', turnStep: 'ANSWERING', currentQuestion: { text: '¿Soy azul?', answers: [], answeredPlayerIds: [] } }), playerState({ canAnswer: true }));
    for (const label of ['>Sí<', '>No<', '>A medias<', '>No lo sé<']) expect(html).toContain(label);
  });

  it('tras responder, tu respuesta queda marcada', () => {
    const html = render(publicGame({ turnPlayerId: 'p2', turnStep: 'ANSWERING', currentQuestion: { text: '¿Soy azul?', answers: [{ playerId: 'p1', answer: 'PARTLY' }], answeredPlayerIds: ['p1'] } }), playerState({ ownAnswer: 'PARTLY' }));
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:<[^>]+>)*A medias/);
  });

  it('en tu DECIDING salen «Adivinar» y «Pasar» con las respuestas recibidas', () => {
    const html = render(publicGame({ turnStep: 'DECIDING', currentQuestion: { text: '¿Soy legendario?', answers: [{ playerId: 'p2', answer: 'YES' }, { playerId: 'p3', answer: 'UNKNOWN' }], answeredPlayerIds: ['p2', 'p3'] } }), playerState({ canGuess: true, canPass: true }));
    expect(html).toContain('Adivinar');
    expect(html).toContain('Pasar');
    expect(html).toContain('No lo sé');
  });

  it('si no es tu turno ni respondes, ves la pregunta en curso y quién ha respondido', () => {
    const html = render(publicGame({ turnPlayerId: 'p2', turnStep: 'ANSWERING', currentQuestion: { text: '¿Soy azul?', answers: [{ playerId: 'p3', answer: 'NO' }], answeredPlayerIds: ['p3'] } }), null, 'p9');
    expect(html).toContain('¿Soy azul?');
    expect(html).toContain('Respondió');
  });

  it('el historial muestra los intentos fallidos como «Probó con …» y las respuestas con su autor', () => {
    const clues = block(render(publicGame(), playerState({ canAsk: true, canGuess: true })), 'who-am-i-clues');
    expect(clues).toContain('Probó con Charmander');
    expect(clues).toContain('Ana');
    expect(clues).toContain('A medias');
  });

  it('longQuestionWraps: una pregunta de 120 caracteres sin espacios lleva la clase que parte palabras', () => {
    const text = 'M'.repeat(120);
    const html = render(publicGame({ turnPlayerId: 'p2', turnStep: 'ANSWERING', currentQuestion: { text, answers: [], answeredPlayerIds: [] } }), playerState({ canAnswer: true }));
    expect(s.question).toBeTruthy();
    expect(html).toMatch(new RegExp(`class="[^"]*\\b${s.question}\\b[^"]*"[^>]*>${text}<`));
    expect(readFileSync(new URL('../games/who-am-i/WhoAmI.module.css', import.meta.url), 'utf8')).toMatch(/\.question\s*\{[^}]*overflow-wrap: anywhere/);
  });

  it.each([
    ['tu ASKING', publicGame(), playerState({ canAsk: true, canGuess: true })],
    ['respondiendo', publicGame({ turnPlayerId: 'p2', turnStep: 'ANSWERING', currentQuestion: { text: '¿Soy azul?', answers: [], answeredPlayerIds: [] } }), playerState({ canAnswer: true })],
    ['al empezar', publicGame({ phase: 'GAME_STARTING', turnPlayerId: null, turnStep: null, turnEndsAt: null }), playerState()],
  ] as const)('%s: hay exactamente una región viva', (_label, game, player) => {
    const html = render(game, player);
    expect(count(html, 'aria-live')).toBe(1);
    expect(count(html, 'role="alert"')).toBe(0);
  });

  it('los resultados revelan el Pokémon de cada jugador, si acertó, sus preguntas y sus puntos', () => {
    const html = results(publicGame({
      phase: 'GAME_RESULTS', turnPlayerId: null, turnStep: null, turnEndsAt: null, results: [
        { playerId: 'p2', pokemon: BULBASAUR, solved: true, questionsAsked: 2, points: 11, rank: 1 },
        { playerId: 'p1', pokemon: MEWTWO, solved: true, questionsAsked: 5, points: 7, rank: 2 },
        { playerId: 'p3', pokemon: SQUIRTLE, solved: false, questionsAsked: 4, points: 0, rank: 3 },
      ],
    }));
    for (const name of ['Bulbasaur', 'Mewtwo', 'Squirtle']) expect(html).toContain(name);
    expect(html).toContain('/mewtwo.png');
    expect(html).toContain('5 preguntas');
    expect(html).toContain('No acertó');
    expect(html).toContain('11 pts');
    expect(html.indexOf('Ana')).toBeLessThan(html.indexOf('Leo'));
  });

  it('el panel de ajustes no tiene selector de modo', () => {
    const html = renderToStaticMarkup(createElement(WhoAmIConfigPanel, { config: defaultWhoAmIConfig, disabled: false, onChange: async () => undefined }));
    expect(html).toContain('Generaciones');
    expect(html).not.toContain('Modo');
  });
});
