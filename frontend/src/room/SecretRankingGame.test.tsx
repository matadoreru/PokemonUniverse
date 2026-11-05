import { defaultSecretRankingConfig, type RoomView, type SecretRankingPlayerState, type SecretRankingPokemon, type SecretRankingPublicState, type SecretRankingRoundResult } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SecretRankingConfigPanel } from '../games/secret-ranking/ConfigPanel';
import { SecretRankingGame } from './SecretRankingGame';
import { SecretRankingResults } from './SecretRankingResults';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { kind: 'GUEST' } }) }));

const LEGACY = /class="[^"]*\b(btn-primary|btn-secondary|btn-ghost|icon-button|card|chip|label|field|panel|reveal-pop|timer-pulse|text-electric|text-leaf|text-berry|text-aqua|empty-state|status-error|page-shell)\b/;
const MEDALS = /🥇|🥈|🥉|🏆/;

const pokemon: SecretRankingPokemon[] = ['Pikachu', 'Eevee', 'Snorlax', 'Gengar', 'Psyduck'].map((name) => ({ id: name.toLowerCase(), name, sprite: `/${name.toLowerCase()}.png` }));
const reversed = [...pokemon].reverse();
const PROMPT = 'De más adorable a menos adorable';

const lastRound: SecretRankingRoundResult = {
  prompt: PROMPT, pokemon, consensus: pokemon.map((entry, index) => ({ pokemon: entry, averagePosition: index + 1.25 })),
  players: {
    p1: { ranking: pokemon, distance: 2, position: 1, pointsAwarded: 6 },
    p2: { ranking: reversed, distance: 8, position: 2, pointsAwarded: 3 },
    p3: { ranking: null, distance: null, position: null, pointsAwarded: 0 },
  },
};

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', round: SecretRankingRoundResult | null = phase === 'ROUND_ACTIVE' ? null : lastRound): SecretRankingPublicState {
  return {
    gameId: 'secret-ranking', phase, roundNumber: 1, totalRounds: 3, prompt: PROMPT, pokemon,
    submittedPlayerIds: ['p2'], scores: { p1: 6, p2: 3, p3: 0 }, roundEndsAt: phase === 'ROUND_ACTIVE' ? 46_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 9_000 : null, lastRound: round,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 6, won: true, stats: { roundsPlayed: 1, rankingsSubmitted: 1, roundsMissed: 0, roundWins: 1, perfectMatches: 0, distanceTotal: 2, pointsFromRounds: 6 } },
      { playerId: 'p2', position: 2, points: 3, won: false, stats: { roundsPlayed: 1, rankingsSubmitted: 1, roundsMissed: 0, roundWins: 0, perfectMatches: 0, distanceTotal: 8, pointsFromRounds: 3 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { roundsPlayed: 1, rankingsSubmitted: 0, roundsMissed: 1, roundWins: 0, perfectMatches: 0, distanceTotal: 0, pointsFromRounds: 0 } },
    ] } : null,
  };
}

function room(game: SecretRankingPublicState, player: SecretRankingPlayerState | null): RoomView {
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[`p${index + 1}`] ?? 0 }));
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'secret-ranking', name: 'Secret Ranking', icon: '📋', description: 'Ranking', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'secret-ranking', selectedGameConfig: defaultSecretRankingConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['secret-ranking'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members };
}

const render = (game: SecretRankingPublicState, player: SecretRankingPlayerState | null, selfId = 'p1') => renderToStaticMarkup(createElement(SecretRankingGame, { room: room(game, player), selfId, onAction: async () => undefined }));
/** Texto visible y nombres accesibles (alt, title, aria-label). */
const visible = (html: string) => html.replace(/<[^>]*?(?:alt|title|aria-label)="([^"]*)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, ' ');
/** Nombres de la lista que se ordena, en su orden. */
const listOrder = (html: string) => [...html.matchAll(/data-ranking-item="([^"]+)"/g)].map((match) => match[1]);
const liveRegions = (html: string) => html.match(/aria-live=/g)?.length ?? 0;

describe('Secret Ranking: ordenar', () => {
  it('lista de cinco con «Subir X» y «Bajar X», el primero sin subir y el último sin bajar, y «Bloquear ranking»', () => {
    const html = render(publicGame(), { role: 'PLAYER', canSubmit: true, ownRanking: null });
    expect(html).toContain('data-testid="social-screen"');
    expect(html).toContain(PROMPT);
    expect(html).toContain('Ordena el ranking');
    expect(html).toContain('Bloquear ranking');
    for (const entry of pokemon) {
      expect(html).toContain(`aria-label="Subir ${entry.name}"`);
      expect(html).toContain(`aria-label="Bajar ${entry.name}"`);
    }
    expect(html).toMatch(/aria-label="Subir Pikachu"[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="Bajar Psyduck"[^>]*disabled=""/);
    expect(html).not.toMatch(/aria-label="Bajar Pikachu"[^>]*disabled=""/);
    expect(html).toContain('Tu posición 1 debe ser la que mejor encaja con el primer extremo.');
    expect(html).toContain('Después de enviarlo no podrás cambiar el orden.');
    // El aviso de que no hay vuelta atrás va en el título de la placa: se ve a todos los tamaños.
    expect(html).toContain('Una vez bloqueado, no se cambia');
    // El botón lleva el aviso como descripción (sr-only, no se oculta con la ayuda de la placa).
    expect(html).toMatch(/data-testid="ranking-submit"[^>]*aria-describedby="ranking-submit-warning"|aria-describedby="ranking-submit-warning"[^>]*data-testid="ranking-submit"/);
    expect(html).toMatch(/id="ranking-submit-warning" class="sr-only">Después de bloquearlo no podrás cambiar el orden\./);
    expect(html).toContain('Rankings recibidos');
    expect(html).toContain('Ordenando…');
    expect(html).toContain('Listo');
    expect(html).toContain('Solo se muestra quién ha terminado');
    expect(html).toContain('Ordenar');
    expect(html).toContain('Para ordenar');
    expect(liveRegions(html)).toBe(1);
    expect(html).not.toMatch(LEGACY);
  });

  it('privacidad: con un `lastRound` sobrante, ni distancias, ni consenso, ni rankings ajenos ni puntos', () => {
    for (const player of [
      { role: 'PLAYER', canSubmit: true, ownRanking: null },
      { role: 'PLAYER', canSubmit: false, ownRanking: pokemon },
      { role: 'SPECTATOR', canSubmit: false, ownRanking: null },
    ] as SecretRankingPlayerState[]) {
      const html = render(publicGame('ROUND_ACTIVE', lastRound), player);
      const text = visible(html);
      expect(text).not.toMatch(/Distancia|Posición media|consenso|Consenso|Cercanía|Sin ranking|No envió|\+\d|Orden de/);
      expect(html).not.toMatch(/data-testid="ranking-(consensus|players|closeness|player)"/);
      // La lista es la propia (o la de la ronda), nunca el orden invertido de Ana.
      expect(listOrder(html)).toEqual(pokemon.map((entry) => entry.id));
    }
  });

  it('bloqueado: el orden propio sin botones y «Ranking bloqueado»', () => {
    const html = render(publicGame(), { role: 'PLAYER', canSubmit: false, ownRanking: reversed });
    expect(html).toContain('Ranking bloqueado');
    expect(html).toContain('Esperando a los demás jugadores');
    expect(html).not.toContain('Bloquear ranking');
    expect(html).not.toContain('Subir Eevee');
    expect(listOrder(html)).toEqual(reversed.map((entry) => entry.id));
  });

  it('sin tiempo y sin ranking: «Se acabó el tiempo»; quien observa: «Estás observando»', () => {
    expect(render(publicGame(), { role: 'PLAYER', canSubmit: false, ownRanking: null })).toContain('Se acabó el tiempo');
    const watching = render(publicGame(), { role: 'SPECTATOR', canSubmit: false, ownRanking: null });
    expect(watching).toContain('Estás observando');
    expect(watching).toContain('Los rankings se revelarán al cerrar la ronda.');
    expect(watching).not.toContain('Subir Eevee');
  });
});

describe('Secret Ranking: revelación', () => {
  it('consenso con posición media, cómo ordenó cada uno, distancia con barra, «Sin ranking» y puntos', () => {
    const html = render(publicGame('ROUND_RESULTS'), { role: 'PLAYER', canSubmit: false, ownRanking: pokemon });
    expect(html).toContain('El consenso del grupo');
    expect(html).toContain('Ranking promedio del grupo');
    expect(html).toContain('Posición media 1,25');
    expect(html).toContain('Eru 1.º · Ana 5.º');
    expect(html).not.toContain('Leo 1.º');
    expect(html).toContain('Cómo ordenó cada uno');
    expect(html).toContain('aria-label="Orden de Ana"');
    expect(html).toContain('1. Psyduck');
    expect(html).toContain('No envió ranking');
    expect(html).toContain('Cercanía de la ronda');
    expect(html).toContain('Distancia 2,00');
    expect(html).toContain('Distancia 8,00');
    expect(html).toContain('Sin ranking');
    expect(html).toContain('El más cercano');
    expect(html).toContain('2.º puesto');
    expect(html).toContain('+6');
    expect(html).toContain('¡Fuiste quien más se acercó!');
    expect(html).toContain('Siguiente ronda en');
    expect(html).toContain('excluye siempre su propio ranking');
    expect(html.match(/role="meter" aria-label="Cercanía de/g)?.length).toBe(2);
    expect(liveRegions(html)).toBe(1);
    expect(html).not.toMatch(LEGACY);
    expect(html).not.toMatch(MEDALS);
  });

  it('nadie completó el ranking', () => {
    const empty: SecretRankingRoundResult = { ...lastRound, consensus: [], players: { p1: { ranking: null, distance: null, position: null, pointsAwarded: 0 } } };
    const html = render(publicGame('ROUND_RESULTS', empty), { role: 'PLAYER', canSubmit: false, ownRanking: null });
    expect(html).toContain('Sin rankings');
    expect(html).toContain('Nadie completó el ranking a tiempo.');
    expect(html).toContain('No enviaste ranking');
  });
});

describe('Secret Ranking: resultados y ajustes', () => {
  it('clasificación con métricas, récords, la regla y la acción del host, sin medallas', () => {
    const html = renderToStaticMarkup(createElement(SecretRankingResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('La mente más sincronizada');
    expect(html).toContain('1 victoria · 0 coincidencias perfectas · 1/1 rankings · distancia media 2,00');
    expect(html).toContain('0/1 rankings · distancia media —');
    expect(html).toContain('Más rondas ganadas');
    expect(html).toContain('Mente más sincronizada');
    expect(html).toContain('La media de referencia de cada persona excluye siempre su propio ranking.');
    expect(html).toContain('Continuar sesión');
    expect(html).toContain('Terminar sesión');
    expect(html).not.toMatch(LEGACY);
    expect(html).not.toMatch(MEDALS);
  });

  it('quien no es host espera', () => {
    const html = renderToStaticMarkup(createElement(SecretRankingResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p2', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Esperando a que el host continúe la sesión…');
    expect(html).not.toContain('Continuar sesión');
  });

  it('ajustes con los controles del catálogo', () => {
    const html = renderToStaticMarkup(createElement(SecretRankingConfigPanel, { config: defaultSecretRankingConfig, disabled: false, room: room(publicGame(), null), selfId: 'p1', onChange: async () => undefined }));
    expect(html).toContain('Número de rondas');
    expect(html).toContain('Tiempo para ordenar');
    expect(html).toContain('Fuente de preguntas');
    expect(html).toContain('Preguntas direccionales incluidas y listas para jugar.');
    expect(html).not.toContain('Solo las preguntas activas guardadas por el host.');
    expect(html).toContain('Incluir formas alternativas');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Crea una cuenta para guardar preguntas personales');
    expect(html).not.toMatch(/class="[^"]*\b(field|btn-primary)\b/);
  });
});
