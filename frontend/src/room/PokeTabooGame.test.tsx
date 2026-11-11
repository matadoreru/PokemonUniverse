import { defaultPokeTabooConfig, type PokeTabooPlayerState, type PokeTabooPublicState, type PokeTabooRoundResult, type PokeTabooSecretPokemon, type RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokeTabooConfigPanel } from '../games/poke-taboo/ConfigPanel';
import { PokeTabooGame } from './PokeTabooGame';
import { PokeTabooResults } from './PokeTabooResults';
import { expectSingleLiveRegion } from './test-support/live-regions';
import { member, roomView } from './test-support/room-view';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
// El pool del buscador nunca contiene el secreto (si lo tuviera, el test de privacidad fallaría en falso).
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [{ id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png', generation: 1, types: ['electric'] }], loading: false, error: '', retry: () => undefined }) }));

const LEGACY = /class="[^"]*\b(btn-primary|btn-secondary|btn-ghost|icon-button|card|chip|label|field|panel|reveal-pop|timer-pulse|text-electric|text-leaf|text-berry|text-aqua|empty-state|status-error|page-shell|type-badge)\b/;
const MEDALS = /🥇|🥈|🥉|🏆/;

const secret: PokeTabooSecretPokemon = {
  id: 'lucario', name: 'Lucario', sprite: '/lucario.png', generation: 4, types: ['fighting', 'steel'], hp: 70, attack: 110,
  defense: 70, specialAttack: 115, specialDefense: 70, speed: 90, baseStatTotal: 525, evolutionStage: 2,
  evolutionStageCount: 2, heightDecimeters: 12, weightHectograms: 540, legendaryStatus: 'NORMAL', abilities: ['inner-focus'],
};
const lastRound: PokeTabooRoundResult = {
  reason: 'GUESSED', pokemon: { id: 'lucario', name: 'Lucario', sprite: '/lucario.png', generation: 4, types: ['fighting', 'steel'] },
  descriptorId: 'p1', winnerId: 'p2', guesserPoints: 4, descriptorPoints: 2, winnerAttemptCount: 2,
};
const LONG_HINT = `Tiene un aura que siente las emociones ${'y'.repeat(120)}`;

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', round: PokeTabooRoundResult | null = lastRound): PokeTabooPublicState {
  return {
    gameId: 'poke-taboo', phase, roundNumber: 1, totalRounds: 3, lapNumber: 1, totalLaps: 1,
    descriptorId: 'p1', nextDescriptorId: 'p2', descriptorOrder: ['p1', 'p2', 'p3'],
    hints: [{ id: 1, text: 'Es de tipo lucha', sentAt: 2_000 }, { id: 2, text: LONG_HINT, sentAt: 3_000 }],
    attempts: [{ playerId: 'p3', guessedPokemon: { id: 'riolu', name: 'Riolu', sprite: '/riolu.png' }, attemptedAt: 2_500 }],
    scores: { p1: 2, p2: 4, p3: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 61_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 5_000 : null,
    // Un `lastRound` sobrante en la ronda: la pantalla no debe leerlo fuera de la revelación.
    lastRound: round,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 4, won: true, stats: { guessedPokemon: 1, firstTry: 0, totalAttempts: 2, firstCorrectResponses: 1, descriptorRounds: 1, descriptorSuccesses: 0, descriptorFailures: 1, pointsFromGuessing: 4, pointsFromDescribing: 0 } },
      { playerId: 'p1', position: 2, points: 2, won: false, stats: { guessedPokemon: 0, firstTry: 0, totalAttempts: 0, firstCorrectResponses: 0, descriptorRounds: 1, descriptorSuccesses: 1, descriptorFailures: 0, pointsFromGuessing: 0, pointsFromDescribing: 2 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { guessedPokemon: 0, firstTry: 0, totalAttempts: 1, firstCorrectResponses: 0, descriptorRounds: 1, descriptorSuccesses: 0, descriptorFailures: 1, pointsFromGuessing: 0, pointsFromDescribing: 0 } },
    ] } : null,
  };
}

function room(player: PokeTabooPlayerState | null, game: PokeTabooPublicState = publicGame(), config: Record<string, unknown> = {}): RoomView {
  return roomView({ phase: game.phase,
    members: [
      member({ id: 'p1', displayName: 'Ana', roomRole: 'HOST', isHost: true }),
      member({ id: 'p2', displayName: 'Pedro' }),
      member({ id: 'p3', displayName: 'Carlos' }),
      member({ id: 'p4', displayName: 'Eru', role: 'SPECTATOR' }),
    ],
    availableGames: [{ id: 'poke-taboo', name: 'PokéTaboo', icon: '🎙️', description: 'Describe', minPlayers: 2, profileStats: { metrics: [] } }],
    selectedGameId: 'poke-taboo', selectedGameConfig: { ...config, generations: [1, 4], roundSeconds: 60, laps: 1, includeRegionalForms: true }, game, gamePlayerState: player,
  });
}

const render = (player: PokeTabooPlayerState | null, selfId: string, game?: PokeTabooPublicState, config?: Record<string, unknown>) => renderToStaticMarkup(createElement(PokeTabooGame, { room: room(player, game, config), selfId, onAction: async () => undefined }));
const describer = () => render({ role: 'DESCRIPTOR', canSendHint: true, secretPokemon: secret }, 'p1');
const guesser = () => render({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 1 }, 'p2');
const spectator = () => render({ role: 'SPECTATOR' }, 'p4');

/** El texto visible más `alt`, `title` y `aria-label`: lo que un jugador o un lector de pantalla podría leer. */
function visible(html: string): string {
  const attrs = [...html.matchAll(/(?:alt|title|aria-label)="([^"]*)"/g)].map((match) => match[1]);
  return `${html.replace(/<[^>]+>/g, ' ')} ${attrs.join(' ')}`;
}

describe('PokéTaboo: quien describe', () => {
  it('ve su Pokémon secreto con las palabras prohibidas y la ficha completa en un Panel', () => {
    const html = describer();
    expect(html).toContain('data-testid="taboo-secret"');
    expect(html).toContain('Tu Pokémon secreto');
    expect(html).toContain('Solo lo ves tú');
    expect(html).toMatch(/data-testid="taboo-forbidden"[^]*Lucario/);
    expect(html).toContain('Palabras prohibidas');
    for (const text of ['Generación 4', 'Etapa 2 de 2', '1,2 m', '54,0 kg', 'Total de stats', '525', 'inner-focus', 'Lucha', 'Acero']) expect(html).toContain(text);
  });

  it('escribe pistas con el campo del catálogo, el contador y «Enviar pista», y ve las que ha enviado', () => {
    const html = describer();
    expect(html).toContain('Escribe una pista');
    expect(html).toContain('Pista para los que adivinan');
    expect(html).toContain('0 / 180');
    expect(html).toContain('maxLength="180"');
    expect(html).toContain('Enviar pista');
    expect(html).toContain('Tus pistas');
    expect(html).toContain('2/24');
    expect(html).toContain('Es de tipo lucha');
    expect(html).toContain('Describes tú');
  });

  it('pinta la insignia del turno, el título y una sola región viva, sin alertas locales ni clases heredadas', () => {
    const html = describer();
    expect(html).toContain('Turno 1 de 3 · Vuelta 1 de 1');
    expect(html).toContain('Describe tu Pokémon');
    expectSingleLiveRegion(html);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(LEGACY);
  });
});

describe('PokéTaboo: privacidad del secreto', () => {
  it.each([['quien adivina', guesser], ['quien observa', spectator]])('%s no recibe en el DOM el secreto, sus palabras prohibidas ni su ficha', (_role, view) => {
    const text = visible(view());
    for (const leak of ['Lucario', 'Palabras prohibidas', 'Tu Pokémon secreto', 'Total de stats', 'inner-focus', '¡Era', 'acertó', 'Puntos del turno', 'taboo-secret']) expect(text).not.toContain(leak);
    expect(view()).not.toContain('taboo-secret');
  });

  it('quien adivina ve las pistas en franjas (la última destacada y entera), el buscador y su intento', () => {
    const html = guesser();
    expect(html).toContain('¿Qué Pokémon describe Ana?');
    expect(html).toContain('Pistas de Ana');
    expect(html.match(/data-testid="taboo-hint"/g)).toHaveLength(2);
    expect(html).toMatch(/data-highlight="true"[^]*Pista 2[^]*Nueva/);
    expect(html).toContain(LONG_HINT);
    expect(html).toContain('Buscar respuesta para la ronda 1');
    expect(html).toContain('Tu respuesta · 1 intento');
    expect(html).toContain('Riolu');
    expectSingleLiveRegion(html);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(LEGACY);
  });

  it('quien observa sigue las pistas y los intentos sin buscador', () => {
    const html = spectator();
    expect(html).toContain('Estás observando');
    expect(html).toContain('Puedes seguir las pistas y los intentos.');
    expect(html).toContain('Pistas de Ana');
    expect(html).not.toContain('Buscar respuesta para la ronda');
  });

  it('el orden de turnos dice en texto quién describe, quién va después y los puntos', () => {
    const html = guesser();
    expect(html).toContain('Orden de turnos');
    expect(html).toMatch(/Ana[^]*Describe ahora[^]*2 pts/);
    expect(html).toMatch(/Pedro[^]*Siguiente[^]*4 pts/);
    expect(html).toMatch(/Carlos[^]*Le toca después/);
  });

  it('sin pistas escritas explica que la descripción va por voz', () => {
    const html = render({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 0 }, 'p2', { ...publicGame(), hints: [], attempts: [] });
    expect(html).toContain('La descripción se escucha fuera del juego');
    expect(html).toContain('Si Ana necesita texto, sus pistas aparecerán aquí.');
    expect(html).toContain('Todavía no hay intentos incorrectos.');
  });
});

describe('PokéTaboo: revelación', () => {
  const reveal = (player: PokeTabooPlayerState, selfId: string) => render(player, selfId, publicGame('ROUND_RESULTS'));

  it('revela el Pokémon, quién acertó y las pistas que hubo, con los puntos del turno', () => {
    const html = reveal({ role: 'GUESSER', canGuess: false, cooldownUntil: null, attemptCount: 2 }, 'p2');
    expect(html).toContain('¡Era Lucario!');
    expect(html).toContain('Pedro acertó Lucario en 2 intentos.');
    for (const text of ['Lucha', 'Acero', 'Generación 4']) expect(html).toContain(text);
    expect(html).toContain('Puntos del turno');
    expect(html).toMatch(/Pedro[^]*Acertó · 2 intentos[^]*\+4/);
    expect(html).toMatch(/Ana[^]*Describió[^]*\+2/);
    expect(html).toContain('¡Lo adivinaste en 2 intentos!');
    expect(html).toContain('Es de tipo lucha');
    expectSingleLiveRegion(html);
    expect(html).not.toMatch(LEGACY);
  });

  it('sin acierto lo dice en texto y quien describía no suma', () => {
    const html = reveal({ role: 'GUESSER', canGuess: false, cooldownUntil: null, attemptCount: 0 }, 'p1');
    const timeout = render({ role: 'GUESSER', canGuess: false, cooldownUntil: null, attemptCount: 0 }, 'p1', publicGame('ROUND_RESULTS', { ...lastRound, reason: 'TIMEOUT', winnerId: null, guesserPoints: 0, descriptorPoints: 0, winnerAttemptCount: null }));
    expect(html).toContain('Tu descripción funcionó');
    expect(timeout).toContain('Nadie lo adivinó: era Lucario.');
    expect(timeout).toContain('Describió · nadie acertó');
    expect(timeout).toContain('Nadie adivinó tu Pokémon');
  });
});

describe('PokéTaboo: resultados y ajustes', () => {
  it('la clasificación del catálogo con las métricas en texto y los récords, sin medallas', () => {
    const html = renderToStaticMarkup(createElement(PokeTabooResults, { room: room(null, publicGame('GAME_RESULTS')), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Así ha ido la partida');
    expect(html).toContain('1 adivinado · 0 al primer intento · 0/1 turnos describiendo con acierto · +4 adivinando · +0 describiendo');
    expect(html).toContain('Mejor descriptor');
    expect(html).toContain('Más Pokémon adivinados');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(MEDALS);
    expect(html).not.toMatch(LEGACY);
  });

  it('los ajustes usan los controles del catálogo con los valores del motor', () => {
    const html = renderToStaticMarkup(createElement(PokeTabooConfigPanel, { config: defaultPokeTabooConfig, disabled: false, onChange: async () => undefined }));
    for (const text of ['Tiempo por turno', '30 s', '120 s', 'Vueltas', 'Cada jugador describe una vez por vuelta.', 'Formas regionales', 'La forma exacta será obligatoria al responder.', 'Mega, Gigamax']) expect(html).toContain(text);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="switch"');
  });
});

describe('PokeTaboo: intentos públicos apagados', () => {
  const off = { publicAttempts: false };
  const hiddenGame = { ...publicGame(), attempts: [] };
  const miss = { playerId: 'p3', guessedPokemon: { id: 'riolu', name: 'Riolu', sprite: '/riolu.png' }, attemptedAt: 2_500 };

  it('quien describe sigue viendo los fallos de los demás', () => {
    const html = render({ role: 'DESCRIPTOR', canSendHint: true, secretPokemon: null, attempts: [miss] }, 'p1', hiddenGame, off);
    expect(html).toContain('Riolu');
    expect(html).toContain('Carlos');
  });

  it('quien adivina no ve el panel de intentos', () => {
    const html = render({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 0, attempts: [] }, 'p2', hiddenGame, off);
    expect(html).not.toContain('Todavía no hay intentos incorrectos.');
    expect(html).not.toContain('Riolu');
  });

  it('quien observa no ve el panel de intentos', () => {
    const html = render({ role: 'SPECTATOR' }, 'p4', hiddenGame, off);
    expect(html).not.toContain('Todavía no hay intentos incorrectos.');
  });
});
