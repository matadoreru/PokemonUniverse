import { defaultPokemonBluffAuctionConfig, type BluffAuctionRoundResult, type GameResults, type PokemonBluffAuctionPlayerState, type PokemonBluffAuctionPublicState, type RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokemonBluffAuctionConfigPanel } from '../games/pokemon-bluff-auction/ConfigPanel';
import { bluffAnnouncement, bluffBlockInput, bluffHeading, bluffMetrics, bluffResultReason, bluffResultTimerLabel, bluffRoundLines, bluffTimerLabel, bluffSelfVerdict, bluffStatsLine } from '../games/pokemon-bluff-auction/presentation';
import { bidBlock } from './auction-kit';
import { PokemonBluffAuctionGame } from './PokemonBluffAuctionGame';
import { PokemonBluffAuctionResults } from './PokemonBluffAuctionResults';
import { expectSingleLiveRegion } from './test-support/live-regions';
import { labelledRadiogroup } from '../ui/segmented-markup';
import { member, roomView } from './test-support/room-view';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala); el `ConfigPanel` usa el selector de generaciones.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { kind: 'GUEST' } }) }));

const players = ['Ana', 'Pedro', 'Carlos'].map((displayName, index) => member({ id: `p${index + 1}`, displayName, roomRole: index === 0 ? 'HOST' : 'MEMBER', isHost: index === 0 }));
const nameOf = (id: string) => players.find((player) => player.id === id)?.displayName ?? id;

function game(phase: PokemonBluffAuctionPublicState['phase'] = 'ROUND_ACTIVE'): PokemonBluffAuctionPublicState {
  return {
    gameId: 'pokemon-bluff-auction', phase, roundNumber: 2, totalRounds: 10, playerIds: ['p1', 'p2', 'p3'],
    condition: { description: 'Tipo Agua + Velocidad > 80', clauses: ['Tipo Agua', 'Velocidad > 80'] },
    bidOrder: ['p2', 'p1', 'p3'], currentTurnPlayerId: phase === 'ROUND_ACTIVE' ? 'p1' : null,
    passedPlayerIds: ['p2'], currentBid: 5, minimumBid: 6, currentBidderId: 'p3',
    bidHistory: [{ playerId: 'p2', type: 'PASS' }, { playerId: 'p3', type: 'BID', amount: 5 }],
    maxBid: 1025, bidderId: phase === 'ROUND_ACTIVE' ? null : 'p3', targetBid: phase === 'ROUND_ACTIVE' ? null : 5,
    attempts: [], correctCount: 0, incorrectCount: 0, remainingCount: phase === 'ROUND_ACTIVE' ? 0 : 5,
    scores: { p1: 2, p2: 0, p3: 5 }, roundEndsAt: phase === 'POKEMON_SEARCH' ? 31_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 6_000 : null, lastRound: null, results: null,
  };
}

/** Resultado de ronda con un número que no debe salir antes de su revelación (cuántas respuestas válidas había). */
const impossible: BluffAuctionRoundResult = {
  bidderId: 'p3', bid: 9000, success: false, reason: 'IMPOSSIBLE', condition: { description: 'Tipo Agua + Velocidad > 80', clauses: ['Tipo Agua', 'Velocidad > 80'] },
  attempts: [], correctCount: 0, incorrectCount: 0, validPokemonCount: 4321, pointsAwarded: { p1: 2, p2: 2, p3: 0 },
};

function room(publicGame: PokemonBluffAuctionPublicState, player: PokemonBluffAuctionPlayerState): RoomView {
  return roomView({ phase: publicGame.phase, members: players,
    availableGames: [{ id: 'pokemon-bluff-auction', name: 'Pokémon Bluff Auction', icon: '🔨', description: 'Pujas', minPlayers: 2, profileStats: { metrics: [] } }],
    selectedGameId: 'pokemon-bluff-auction', selectedGameConfig: { generations: [1, 2, 3], demonstrationSeconds: 30, rounds: 10, bidSeconds: 20 }, game: publicGame, gamePlayerState: player,
  });
}

const turn: PokemonBluffAuctionPlayerState = { role: 'PLAYER', canRaise: true, canPass: true, canSubmitPokemon: false };
const idle: PokemonBluffAuctionPlayerState = { role: 'PLAYER', canRaise: false, canPass: false, canSubmitPokemon: false };
const searcher: PokemonBluffAuctionPlayerState = { role: 'PLAYER', canRaise: false, canPass: false, canSubmitPokemon: true };
const spectator: PokemonBluffAuctionPlayerState = { role: 'SPECTATOR', canRaise: false, canPass: false, canSubmitPokemon: false };
const play = (publicGame: PokemonBluffAuctionPublicState, player: PokemonBluffAuctionPlayerState, selfId = 'p1') => renderToStaticMarkup(createElement(PokemonBluffAuctionGame, { room: room(publicGame, player), selfId, onAction: async () => undefined }));
/** Texto visible más `alt`, `title` y `aria-label` (lo que un lector o la vista pueden sacar del DOM). */
const visible = (html: string) => [html.replace(/<[^>]+>/g, ' '), ...[...html.matchAll(/(?:alt|title|aria-label|aria-valuetext)="([^"]*)"/g)].map((match) => match[1])].join(' ');

describe('Pokémon Bluff Auction: subasta', () => {
  it('con el kit: la condición, la puja actual, el turno, la mesa con quien pasó y una sola región viva', () => {
    const html = play(game(), turn);
    expect(html).toContain('data-testid="auction-screen"');
    expectSingleLiveRegion(html);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('Ronda 2 de 10 · Subasta');
    expect(html).toContain('Tipo Agua + Velocidad &gt; 80');
    expect(html).toContain('data-testid="bluff-condition"');
    expect(html).toMatch(/data-testid="auction-current-bid"><span[^>]*><strong>5<\/strong> <small>Pokémon<\/small>/);
    expect(html).toMatch(/data-testid="auction-leader">.*Carlos/);
    expect(html).toMatch(/Mínimo para superarla.*<strong>6<\/strong>/);
    // El título es la ronda (la condición va en grande en la escena); el turno, solo en el reloj, el orden de turno y la placa.
    expect(html).toContain('>Ronda 2 de 10</h1>');
    expect(html).toContain('aria-label="Orden de turno"');
    expect(html).toMatch(/data-state="passed"[^>]*>.*Pedro/);
    expect(html).toMatch(/data-state="turn"[^>]*>.*Ana \(Tú\)/);
    expect(html).toMatch(/data-state="leading"[^>]*>.*Carlos/);
    expect(html).not.toContain('Está pujando');
    // El líder lleva su avatar (decorativo) junto al nombre.
    expect(html).toMatch(/data-testid="auction-leader">.*<span class="[^"]*avatar/i);
    expect(html).toContain('Bluff por voz externa');
    // La mesa: orden, estado en texto y la última puja o «Pasó».
    expect(html).toContain('Mesa de pujas');
    expect(html.match(/data-testid="budget-row"/g)).toHaveLength(3);
    expect(html).toContain('Orden 1 · 0 pts');
    expect(html).toContain('Fuera de la ronda');
    expect(html).toContain('Va ganando');
    expect(html).toContain('Pasó');
    // Historial y controles: sin «Todo» (el máximo es el pool entero), «Pasar esta ronda».
    expect(html).toContain('Pujó 5 Pokémon');
    expect(html).toContain('Mínima: 6');
    expect(html).toContain('+2: 8');
    expect(html).toContain('+5: 11');
    expect(html).not.toContain('Todo:');
    expect(html).toContain('Pujar 6');
    expect(html).toContain('Pasar esta ronda');
    expect(html).not.toContain('Tu presupuesto');
    expect(html).not.toMatch(/class="[^"]*\b(btn-|card\b|chip\b|label\b|field\b|status-error|empty-state|ranking-row)/);
  });

  it('pasar pide confirmación con un `Dialog` del catálogo (nunca `window.confirm`)', () => {
    const block = bidBlock(bluffBlockInput(game(), turn, 'p1', nameOf));
    expect(block).toMatchObject({ reason: 'open', canRaise: true, canPass: true, title: 'Tu turno' });
    expect(play(game(), turn)).toContain('data-testid="bid-pass"');
  });

  it('con la puja en el máximo, quien tiene el turno no sube pero puede pasar («Puja máxima»)', () => {
    const top = { ...game(), currentBid: 1025, minimumBid: 1026 };
    const block = bidBlock(bluffBlockInput(top, turn, 'p1', nameOf));
    expect(block).toMatchObject({ reason: 'noBudget', canRaise: false, canPass: true, title: 'Puja máxima' });
    const html = play(top, turn);
    expect(html).toContain('>Puja máxima</h2>');
    // Con la puja en el máximo no hay «mínimo para superarla» imposible (1026 con un máximo de 1025).
    expect(html).toContain('Puja máxima alcanzada');
    expect(html).not.toContain('bid-submit');
    expect(html).not.toContain('value="1026"');
    expect(html).not.toContain('Mínimo para superarla');
    expect(html).toMatch(/<button[^>]*data-testid="bid-pass"[^>]*>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="bid-pass"|data-testid="bid-pass"[^>]*disabled=""/);
    expect(html).not.toContain('NaN');
  });

  it('los textos del bloqueo hablan de rondas, no de lotes ni presupuestos', () => {
    for (const [publicGame, player, selfId, title] of [
      [game(), idle, 'p2', 'Has pasado'],
      [game(), idle, 'p3', 'Le toca a Ana'],
      [game(), spectator, 'x', 'Estás observando'],
    ] as const) {
      const block = bidBlock(bluffBlockInput(publicGame, player, selfId, nameOf));
      expect(block.title).toBe(title);
      expect(block.text).not.toMatch(/lote|presupuesto|equipo/i);
    }
  });

  it('sin tu turno, la placa dice a quién le toca y cómo va la puja, sin controles grises', () => {
    expect(bidBlock(bluffBlockInput(game(), idle, 'p3', nameOf))).toMatchObject({ reason: 'leading', title: 'Le toca a Ana', text: 'Tú vas ganando con 5 Pokémon.' });
    const waiting = { ...game(), passedPlayerIds: [] };
    expect(bidBlock(bluffBlockInput(waiting, idle, 'p2', nameOf))).toMatchObject({ reason: 'waiting', title: 'Le toca a Ana', text: 'Puja actual: 5 de Carlos.' });
    const html = play(game(), idle, 'p3');
    expect(html).toContain('>Le toca a Ana</h2>');
    expect(html).not.toContain('bid-submit');
    expect(bluffTimerLabel(game(), 'p1', nameOf)).toBe('Tu turno');
    expect(bluffTimerLabel(game(), 'p2', nameOf)).toBe('Turno de Ana');
    expect(play({ ...game(), roundEndsAt: 21_000 }, idle, 'p3')).toContain('aria-label="Turno de Ana: ');
  });

  it('la región viva dice la última puja y el turno', () => {
    expect(bluffAnnouncement(game(), 'p1', nameOf)).toBe('Carlos puja 5 Pokémon. Es tu turno.');
    expect(bluffAnnouncement({ ...game(), bidHistory: [] }, 'p2', nameOf)).toBe('Ronda 2 de 10: Tipo Agua + Velocidad > 80. Turno de Ana.');
    expect(bluffHeading(game(), 'p2', nameOf)).toBe('Ronda 2 de 10');
  });
});

describe('Pokémon Bluff Auction: demostración', () => {
  const searching = () => {
    const publicGame = game('POKEMON_SEARCH'); publicGame.attempts = [
      { pokemon: { id: 'dragonite', name: 'Dragonite', sprite: '/dragonite.png' }, result: 'CORRECT', submittedAt: 2_000 },
      { pokemon: { id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' }, result: 'INCORRECT', submittedAt: 3_000 },
      { pokemon: { id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' }, result: 'DUPLICATE', submittedAt: 4_000 },
    ]; publicGame.correctCount = 1; publicGame.incorrectCount = 1; publicGame.remainingCount = 4;
    return publicGame;
  };

  it('quien apostó ve el buscador; las métricas son `Bar`s con la cifra en texto; una sola región viva', () => {
    const html = play(searching(), searcher, 'p3');
    expect(html).toContain('Ronda 2 de 10 · Demostración');
    expect(html).toContain('>Demuestra tu apuesta</h1>');
    expect(html).toContain('Nombra Pokémon');
    // Junto al buscador la placa no lleva descripción (solo el kicker y el título).
    expect(html).not.toContain('Acierto: +5 segundos · Fallo: −3 segundos.');
    expect(html).toContain('Buscar Pokémon para demostrar la apuesta');
    // En el móvil el buscador no va pegado al fondo (con la bandeja abierta taparía las métricas).
    expect(html).toMatch(/data-testid="auction-screen"/);
    expect(html).toMatch(/class="[^"]*unpinned[^"]*"[^>]*data-testid="auction-screen"/);
    expect(play(game(), turn)).not.toContain('unpinned');
    expectSingleLiveRegion(html);
    expect(html.match(/data-testid="bluff-metric"/g)).toHaveLength(3);
    for (const label of ['Correctos', 'Faltan', 'Incorrectos']) expect(html).toContain(`role="meter" aria-label="${label}"`);
    expect(html).toContain('1 de 5');
    expect(html).toContain('4 de 5');
    // Los fallos, sobre la apuesta (1 de 5 llena una quinta parte), con la cifra en texto.
    expect(html).toContain('1 fallo');
    expect(html).toMatch(/role="meter" aria-label="Incorrectos" aria-valuenow="1" aria-valuemin="0" aria-valuemax="5"/);
    // El buscador muestra como mucho 5 resultados (como antes del rediseño).
    expect(html).toContain('Buscar Pokémon para demostrar la apuesta');
    expect(html).toContain('Apostó 5 Pokémon');
    // Los intentos, públicos, con el veredicto en texto (y el repetido explicado).
    expect(html.match(/data-testid="bluff-attempt"/g)).toHaveLength(3);
    expect(html).toContain('Correcto');
    expect(html).toContain('Incorrecto');
    expect(html).toContain('Ya utilizado');
    expect(html).toContain('No cambia el tiempo');
  });

  it('los demás ven quién busca, los intentos y las métricas, sin buscador', () => {
    for (const [player, selfId] of [[idle, 'p1'], [spectator, 'x']] as const) {
      const html = play(searching(), player, selfId);
      expect(html).not.toContain('Buscar Pokémon para demostrar la apuesta');
      expect(html).toContain('Carlos está buscando');
      expect(html).toContain('Todos veis los intentos en tiempo real.');
      expect(html).toContain('>Carlos demuestra</h1>');
      expect(html).toContain('Dragonite');
      expectSingleLiveRegion(html);
    }
    // Quien apostó y recarga sin su permiso de búsqueda todavía: lo dice.
    expect(play(searching(), idle, 'p3')).toContain('Reconectando con la demostración…');
  });
});

describe('Pokémon Bluff Auction: privacidad', () => {
  it('cuántos Pokémon cumplen la condición no entra en el DOM antes del resultado, ni con un `lastRound` rancio', () => {
    for (const phase of ['ROUND_ACTIVE', 'POKEMON_SEARCH'] as const) {
      const poisoned = { ...game(phase), lastRound: impossible };
      for (const [player, selfId] of [[phase === 'ROUND_ACTIVE' ? turn : searcher, phase === 'ROUND_ACTIVE' ? 'p1' : 'p3'], [idle, 'p2'], [spectator, 'x']] as const) {
        const text = visible(play(poisoned, player, selfId));
        expect(text, `${phase} ${selfId}`).not.toContain('4321');
        expect(text).not.toContain('9000');
        expect(text).not.toMatch(/respuestas válidas|Apuesta imposible|Farol|Cumplió/);
      }
    }
  });

  it('el resultado sí lo dice, en su fase', () => {
    const text = visible(play({ ...game('ROUND_RESULTS'), lastRound: impossible }, idle, 'p1'));
    expect(text).toContain('Apuesta imposible');
    expect(text).toContain('Carlos apostó 9000, pero solo existían 4321 respuestas válidas.');
  });
});

describe('Pokémon Bluff Auction: resultado de la ronda', () => {
  const timeout: BluffAuctionRoundResult = {
    bidderId: 'p3', bid: 2, success: false, reason: 'TIMEOUT', condition: { description: 'Tipo Agua', clauses: ['Tipo Agua'] },
    attempts: [{ pokemon: { id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' }, result: 'INCORRECT', submittedAt: 3_000 }],
    correctCount: 0, incorrectCount: 1, validPokemonCount: null, pointsAwarded: { p1: 2, p2: 2, p3: 0 },
  };
  const completed: BluffAuctionRoundResult = { ...timeout, success: true, reason: 'COMPLETED', correctCount: 2, incorrectCount: 0, attempts: [], pointsAwarded: { p1: 0, p2: 0, p3: 5 } };

  it('quién cumplió y quién se marcó un farol, con los puntos de cada uno y una sola región viva', () => {
    const html = play({ ...game('ROUND_RESULTS'), lastRound: timeout }, idle, 'p1');
    expect(html).toContain('Ronda 2 de 10 · Resultado');
    expect(html).toContain('>Carlos no lo consiguió</h1>');
    expect(html).toContain('Ronda 2 · Farol');
    expect(html).toContain('Se agotó el tiempo: 0 de 2 correctos.');
    expect(html.match(/data-testid="bluff-round-row"/g)).toHaveLength(3);
    expect(html).toContain('Gana la ronda');
    expect(html).toContain('El farol te da puntos');
    expect(html).toContain('+2');
    expect(html.match(/data-testid="bluff-metric"/g)).toHaveLength(3);
    expectSingleLiveRegion(html);
    expect(html).toContain('Siguiente ronda');
    expect(html).not.toContain('Clasificación');
    // En la última ronda, el plazo lleva a la clasificación, no a otra ronda.
    const last = play({ ...game('ROUND_RESULTS'), roundNumber: 10, lastRound: timeout }, idle, 'p1');
    expect(last).toContain('Clasificación');
    expect(last).not.toContain('Siguiente ronda');
    expect(last).toContain('Era la última ronda: después, la clasificación.');
    const done = play({ ...game('ROUND_RESULTS'), lastRound: completed }, idle, 'p3');
    expect(done).toContain('>Carlos lo consiguió</h1>');
    expect(done).toContain('Cumpliste tu apuesta');
    expect(done).toContain('Ronda 2 · Cumplió');
  });

  it('textos puros del resultado', () => {
    expect(bluffResultReason(completed, nameOf)).toBe('Carlos nombró 2 Pokémon correctos: cumplió su apuesta.');
    expect(bluffResultReason({ ...timeout, reason: 'BIDDER_LEFT' }, nameOf)).toBe('Carlos abandonó la demostración.');
    expect(bluffRoundLines(timeout, ['p1', 'p2', 'p3']).map((line) => [line.playerId, line.text, line.points])).toEqual([['p3', 'Farol', 0], ['p1', 'Gana la ronda', 2], ['p2', 'Gana la ronda', 2]]);
    expect(bluffSelfVerdict(completed, 'p1', true)).toMatchObject({ tone: 'bad', points: 0 });
    expect(bluffSelfVerdict(completed, 'x', false)).toMatchObject({ tone: 'info', text: 'Resultado de la ronda' });
    expect(bluffAnnouncement({ ...game('ROUND_RESULTS'), lastRound: timeout }, 'p1', nameOf)).toBe('Carlos no lo consiguió. Se agotó el tiempo: 0 de 2 correctos. +2 para cada rival.');
    // Las métricas nunca dan NaN ni dividen por cero.
    expect(bluffMetrics({ correct: 0, incorrect: 0, target: 0 }).map((metric) => metric.max)).toEqual([1, 1, 1]);
    // Más fallos que la apuesta: la barra llena, la cifra real en texto.
    expect(bluffMetrics({ correct: 0, incorrect: 4, target: 2 })[2]).toMatchObject({ value: 2, max: 2, text: '4 fallos' });
    expect(bluffResultTimerLabel({ roundNumber: 4, totalRounds: 5 })).toBe('Siguiente ronda');
    expect(bluffResultTimerLabel({ roundNumber: 5, totalRounds: 5 })).toBe('Clasificación');
  });
});

describe('Pokémon Bluff Auction: resultados finales y ajustes', () => {
  const results: GameResults = {
    winnerId: 'p3', standings: [
      { playerId: 'p3', position: 1, points: 7, won: true, stats: { roundsWon: 2, bidderRounds: 2, completedBids: 1, failedBids: 1, correctPokemon: 4, incorrectPokemon: 1, highestCompletedBid: 3, highestAttemptedBid: 5, impossibleBids: 0 } },
      { playerId: 'p1', position: 2, points: 2, won: false, stats: { roundsWon: 1, bidderRounds: 0, completedBids: 0, failedBids: 0, correctPokemon: 0, incorrectPokemon: 0, highestCompletedBid: 0, highestAttemptedBid: 0, impossibleBids: 0 } },
      { playerId: 'p2', position: 2, points: 2, won: false, stats: { roundsWon: 1, bidderRounds: 1, completedBids: 0, failedBids: 1, correctPokemon: 0, incorrectPokemon: 2, highestCompletedBid: 0, highestAttemptedBid: 9, impossibleBids: 1 } },
    ],
  };

  it('la clasificación del catálogo, la línea de métricas en texto, los récords y sin medallas', () => {
    const publicGame = { ...game('GAME_RESULTS'), results };
    const html = renderToStaticMarkup(createElement(PokemonBluffAuctionResults, { room: room(publicGame, idle), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('La mesa final');
    expect(html).toContain('2 rondas ganadas · 1/2 apuestas cumplidas · récord 3 · 4 correctos · 0 imposibles');
    expect(html).toContain('Empate');
    expect(html).toContain('Mayor apuesta cumplida');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(/🏆|🥇|🥈|🥉/u);
    expect(bluffStatsLine({ roundsWon: 1, impossibleBids: 1, correctPokemon: 1 })).toBe('1 ronda ganada · 0/0 apuestas cumplidas · récord 0 · 1 correcto · 1 imposible');
  });

  it('ajustes con los controles del catálogo', () => {
    const html = renderToStaticMarkup(createElement(PokemonBluffAuctionConfigPanel, { config: defaultPokemonBluffAuctionConfig, disabled: false, onChange: async () => undefined }));
    expect(html).toMatch(labelledRadiogroup('Tiempo inicial para demostrar'));
    expect(html).toMatch(labelledRadiogroup('Rondas'));
    expect(html).toContain('Tiempo por puja');
    expect(html).toContain('Solo especies normales');
    // Lo rediseñado (todo menos el selector de generaciones heredado, F9) sin clases heredadas.
    expect(html.slice(html.indexOf('</section>'))).not.toMatch(/class="[^"]*\b(btn-|field\b|label\b|text-ink|bg-surface)/);
  });
});
