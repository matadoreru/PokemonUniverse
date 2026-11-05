import { defaultWouldYouRatherConfig, type RoomView, type WouldYouRatherPlayerState, type WouldYouRatherPublicState, type WouldYouRatherRoundResult } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WouldYouRatherConfigPanel } from '../games/would-you-rather/ConfigPanel';
import { CustomWouldYouRatherPromptManager } from '../games/would-you-rather/CustomPromptManager';
import { wouldYouRatherAnnouncement, wouldYouRatherHeading, wouldYouRatherSummary, wouldYouRatherVerdict } from '../games/would-you-rather/presentation';
import { WouldYouRatherGame } from './WouldYouRatherGame';
import { WouldYouRatherResults } from './WouldYouRatherResults';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { kind: 'GUEST' } }) }));

const LEGACY = /class="[^"]*\b(btn-primary|btn-secondary|btn-ghost|card|chip|label|field|panel|reveal-pop|timer-pulse|text-electric|text-leaf|text-berry|text-aqua|empty-state|status-error)\b/;
const PROMPT = { optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' };

const majorityResult: WouldYouRatherRoundResult = {
  prompt: PROMPT, totals: { A: 2, B: 1 }, majority: 'A',
  players: [
    { playerId: 'p1', preference: 'A', prediction: 'A', majorityPoint: 1, predictionPoints: 2, totalPoints: 3 },
    { playerId: 'p2', preference: 'A', prediction: 'B', majorityPoint: 1, predictionPoints: 0, totalPoints: 1 },
    { playerId: 'p3', preference: 'B', prediction: 'A', majorityPoint: 0, predictionPoints: 2, totalPoints: 2 },
  ], missingPlayerIds: [],
};

type Phase = 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS';
function publicGame(phase: Phase = 'ROUND_ACTIVE', lastRound: WouldYouRatherRoundResult | null = null): WouldYouRatherPublicState {
  return {
    gameId: 'would-you-rather', phase, roundNumber: 1, totalRounds: 5,
    prompt: PROMPT, playerIds: ['p1', 'p2', 'p3'], submittedPlayerIds: ['p1'],
    scores: { p1: 3, p2: 1, p3: 2 }, roundEndsAt: phase === 'ROUND_ACTIVE' ? 46_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 9_000 : null, lastRound,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 3, won: true, stats: { roundsPlayed: 1, ballotsSubmitted: 1, roundsMissed: 0, majorityChoices: 1, correctPredictions: 1, perfectRounds: 1, pointsFromRounds: 3 } },
      { playerId: 'p3', position: 2, points: 2, won: false, stats: { roundsPlayed: 1, ballotsSubmitted: 1, roundsMissed: 0, majorityChoices: 0, correctPredictions: 1, perfectRounds: 0, pointsFromRounds: 2 } },
      { playerId: 'p2', position: 3, points: 1, won: false, stats: { roundsPlayed: 1, ballotsSubmitted: 1, roundsMissed: 0, majorityChoices: 1, correctPredictions: 0, perfectRounds: 0, pointsFromRounds: 1 } },
    ] } : null,
  };
}

function room(game: WouldYouRatherPublicState, player: WouldYouRatherPlayerState | null, disconnected: string[] = []): RoomView {
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => {
    const id = `p${index + 1}`;
    const off = disconnected.includes(id);
    return { id, displayName, avatar: { type: 'DEFAULT' as const }, connected: !off, presence: off ? 'TEMPORARILY_DISCONNECTED' as const : 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[id] ?? 0 };
  });
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'would-you-rather', name: 'Would You Rather Pokémon', icon: '⚖️', description: 'Dilemas', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'would-you-rather', selectedGameConfig: defaultWouldYouRatherConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['would-you-rather'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members };
}

const OPEN: WouldYouRatherPlayerState = { role: 'PLAYER', canSubmit: true, ownBallot: null };
const LOCKED: WouldYouRatherPlayerState = { role: 'PLAYER', canSubmit: false, ownBallot: { preference: 'A', prediction: 'B' } };
const SPECTATOR: WouldYouRatherPlayerState = { role: 'SPECTATOR', canSubmit: false, ownBallot: null };
const render = (game: WouldYouRatherPublicState, player: WouldYouRatherPlayerState | null, selfId = 'p1', disconnected: string[] = []) =>
  renderToStaticMarkup(createElement(WouldYouRatherGame, { room: room(game, player, disconnected), selfId, onAction: async () => undefined }));
const visible = (html: string) => `${html.replace(/<[^>]+>/g, ' ')} ${[...html.matchAll(/(?:alt|title|aria-label)="([^"]*)"/g)].map((match) => match[1]).join(' ')}`;

describe('Would You Rather: pantalla', () => {
  it('papeleta: el dilema en dos cartas con atajos 1 y 2, la predicción, «Bloquear papeleta» y solo quién ha enviado', () => {
    const html = render(publicGame(), OPEN, 'p1', ['p3']);
    expect(html).toContain('¿Qué preferirías?');
    expect(html).toContain('Vivir con Gengar');
    expect(html).toContain('Viajar con Magikarp');
    expect(html).toContain('aria-keyshortcuts="1"');
    expect(html).toContain('aria-keyshortcuts="2"');
    expect(html).toContain('aria-label="Opción A: Vivir con Gengar"');
    expect(html).toContain('¿Cuál será la mayoría?');
    expect(html).toContain('Mayoría A');
    expect(html).toContain('Mayoría B');
    expect(html).toContain('Bloquear papeleta');
    expect(html).toContain('Elige primero una opción arriba (1 o 2).');
    expect(html).toContain('Elección y predicción permanecen secretas hasta el resultado.');
    expect(html).toContain('Lista');
    expect(html).toContain('Pensando…');
    expect(html).toContain('Sin conexión');
    expect(html).toContain('Para decidir');
    expect(html).toMatch(/aria-current="step" data-phase="ballot"/);
    expect(html.match(/aria-live/g)).toHaveLength(1);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(LEGACY);
  });

  it('bloqueada: solo la papeleta propia, sin botones', () => {
    const html = render(publicGame(), LOCKED);
    expect(html).toContain('Papeleta bloqueada');
    expect(html).toContain('predijiste');
    expect(html).toContain('Elegiste A');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('Bloquear papeleta');
  });

  it('privacidad: antes de revelar no hay papeletas ajenas ni recuentos, aunque llegue un `lastRound` sobrante', () => {
    for (const player of [OPEN, LOCKED, SPECTATOR]) {
      const html = render(publicGame('ROUND_ACTIVE', majorityResult), player);
      const text = visible(html);
      expect(text).not.toMatch(/Eligió|Predijo|\d+ votos?\b|Votos de|Mayoría<|La mayoría eligió|\+[123]\b|de 3 papeletas/);
      expect(html).not.toMatch(/tally-row|tally-votes|tally-summary/);
    }
  });

  it('observar: el dilema sin botones', () => {
    const html = render(publicGame(), SPECTATOR, 's1');
    expect(html).toContain('Estás observando');
    expect(html).not.toContain('aria-pressed');
  });

  it('revelar: barras por opción, quién eligió qué, la mayoría, lo que predijo cada uno y los puntos; «Sin papeleta»', () => {
    const missing: WouldYouRatherRoundResult = { ...majorityResult, totals: { A: 2, B: 0 }, players: majorityResult.players.slice(0, 2), missingPlayerIds: ['p3'] };
    const html = render(publicGame('ROUND_RESULTS', missing), LOCKED);
    expect(html).toContain('La mayoría eligió A');
    expect(html).toContain('La mayoría eligió A con 2 de 2 papeletas.');
    expect(html).toContain('Votos de Eru y Ana');
    expect(html).toContain('role="meter"');
    expect(html).toContain('Mayoría');
    expect(html).toContain('Eligió A · Predijo A');
    expect(html).toContain('Sin papeleta');
    expect(html).toContain('+3');
    expect(html).toContain('¡Ronda perfecta!');
    expect(html).toContain('Siguiente ronda en');
    expect(html).toMatch(/aria-current="step" data-phase="result"/);
    expect(html.match(/aria-live/g)).toHaveLength(1);
    expect(html).not.toMatch(LEGACY);
  });

  it('revelar con la sala dividida: empate sin mayoría ni «Mayoría»', () => {
    const tie: WouldYouRatherRoundResult = { ...majorityResult, totals: { A: 1, B: 1 }, majority: null, players: majorityResult.players.slice(1).map((entry) => ({ ...entry, majorityPoint: 0, predictionPoints: 0, totalPoints: 0 })) };
    const html = render(publicGame('ROUND_RESULTS', tie), SPECTATOR, 's1');
    expect(html).toContain('La sala quedó dividida');
    expect(html).toContain('Empate a 1: la sala quedó dividida y no se reparten puntos.');
    expect(html).toContain('Empate');
    expect(html).not.toContain('>Mayoría<');
  });
});

describe('Would You Rather: textos', () => {
  it('títulos, resumen, región viva y veredicto', () => {
    expect(wouldYouRatherHeading('ROUND_ACTIVE', null)).toBe('¿Qué preferirías?');
    expect(wouldYouRatherSummary({ ...majorityResult, totals: { A: 0, B: 0 }, majority: null, players: [] })).toBe('Nadie envió su papeleta a tiempo: no hay mayoría.');
    expect(wouldYouRatherAnnouncement({ phase: 'ROUND_ACTIVE', roundNumber: 1, locked: true, result: null })).toContain('Papeleta bloqueada');
    expect(wouldYouRatherAnnouncement({ phase: 'ROUND_RESULTS', roundNumber: 2, locked: false, result: majorityResult })).toBe('Ronda 2 terminada. La mayoría eligió A con 2 de 3 papeletas.');
    expect(wouldYouRatherVerdict(majorityResult, 'p3', true)).toMatchObject({ tone: 'ok', text: 'Sumas por predicción acertada', points: 2 });
    expect(wouldYouRatherVerdict(majorityResult, 'p9', true).text).toBe('No enviaste papeleta');
  });
});

describe('Would You Rather: resultados, ajustes y dilemas propios', () => {
  it('clasificación del catálogo con métricas en texto, récords, la regla y la acción del host', () => {
    const html = renderToStaticMarkup(createElement(WouldYouRatherResults, { room: room(publicGame('GAME_RESULTS'), SPECTATOR), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Quien mejor leyó la sala');
    expect(html).toContain('1 predicción · 1 en mayoría · 1/1 papeletas · 1 ronda perfecta');
    expect(html).toContain('Mejor lectura de la sala');
    expect(html).toContain('1 por formar parte de la mayoría y 2 por predecirla');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
    expect(html).not.toMatch(LEGACY);
  });

  it('ajustes con controles del catálogo', () => {
    const html = renderToStaticMarkup(createElement(WouldYouRatherConfigPanel, { config: defaultWouldYouRatherConfig, disabled: false, room: room(publicGame(), null), selfId: 'p2', onChange: async () => undefined }));
    expect(html).toContain('Número de rondas');
    expect(html).toContain('Tiempo para votar y predecir');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('Dilemas normales, adultos y de humor oscuro.');
    expect(html).toContain('Los dilemas personales pertenecen al host.');
    expect(html).not.toMatch(LEGACY);
  });

  it('gestor de dilemas con el catálogo: campos, «Añadir», importación plegada y sin `window.confirm`', () => {
    const html = renderToStaticMarkup(createElement(CustomWouldYouRatherPromptManager, { disabled: false }));
    expect(html).toContain('aria-labelledby="custom-wyr-title"');
    expect(html).toContain('Nueva opción A');
    expect(html).toContain('Nueva opción B');
    expect(html).toContain('Añadir');
    expect(html).toContain('Importar dilemas desde JSON');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('0 activos');
    expect(html).not.toMatch(LEGACY);
  });
});
