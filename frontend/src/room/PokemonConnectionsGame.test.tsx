import { defaultPokemonConnectionsConfig, type ConnectionAnswerGroup, type PokemonConnectionsPlayerState, type PokemonConnectionsPublicState, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokemonConnectionsConfigPanel } from '../games/pokemon-connections/ConfigPanel';
import { connectionsSnapSeconds, nextAttemptFocus, connectionsAnnouncement, connectionsFeedbackText, connectionsFocusKey, connectionsLivesText, connectionsPlateKind, connectionsRevealOrder, connectionsRoundLine, connectionsStatsLine, connectionsTimeLabel } from '../games/pokemon-connections/presentation';
import { PokemonConnectionsGame } from './PokemonConnectionsGame';
import { PokemonConnectionsResults } from './PokemonConnectionsResults';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const pokemon = Array.from({ length: 16 }, (_, index) => ({ id: `pokemon-${index + 1}`, name: `Pokémon ${index + 1}`, sprite: `/pokemon-${index + 1}.png` }));
const LABELS = ['Pokémon fósiles', 'Evoluciones de Eevee', 'Aspecto canino', 'Roedores eléctricos'];
const groups: ConnectionAnswerGroup[] = LABELS.map((label, index) => ({
  id: `group-${index + 1}`,
  categoryId: `secret-${index + 1}`,
  label,
  explanation: `Explicación secreta ${index + 1}`,
  pokemon: pokemon.slice(index * 4, index * 4 + 4),
}));
const result = {
  source: 'CURATED' as const,
  groups,
  players: {
    p1: { status: 'SOLVED' as const, foundGroups: 4, foundGroupIds: groups.map((group) => group.id), mistakesUsed: 1, completionRank: 1, elapsedMs: 12_000, pointsAwarded: 7 },
    p2: { status: 'TIMED_OUT' as const, foundGroups: 1, foundGroupIds: ['group-1'], mistakesUsed: 2, completionRank: null, elapsedMs: null, pointsAwarded: 1 },
  },
};

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', overrides: Partial<PokemonConnectionsPublicState> = {}): PokemonConnectionsPublicState {
  return {
    gameId: 'pokemon-connections', phase, roundNumber: 1, totalRounds: 5, groupSize: 4, groupCount: 4,
    board: pokemon, playerProgress: { p1: { foundGroups: phase === 'ROUND_ACTIVE' ? 1 : 4, status: phase === 'ROUND_ACTIVE' ? 'PLAYING' : 'SOLVED' }, p2: { foundGroups: 1, status: phase === 'ROUND_ACTIVE' ? 'PLAYING' : 'TIMED_OUT' } },
    scores: { p1: 7, p2: 1 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 121_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 31_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : result,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 7, won: true, stats: { roundsPlayed: 1, groupsFound: 4, boardsSolved: 1, mistakes: 1, nearMisses: 1, podiumFinishes: 1, solveTimeTotalMs: 12_000, bestSolveTimeMs: 12_000 } },
      { playerId: 'p2', position: 2, points: 1, won: false, stats: { roundsPlayed: 1, groupsFound: 1, boardsSolved: 0, mistakes: 2, nearMisses: 0, podiumFinishes: 0, solveTimeTotalMs: 0, bestSolveTimeMs: 0 } },
    ] } : null,
    ...overrides,
  };
}

function room(game: PokemonConnectionsPublicState, player: PokemonConnectionsPlayerState): RoomView {
  return {
    code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8,
    availableGames: [{ id: 'pokemon-connections', name: 'Pokémon Connections', icon: '🧩', description: 'Conexiones', minPlayers: 1, profileStats: { metrics: [] } }],
    selectedGameId: 'pokemon-connections', selectedGameConfig: { ...defaultPokemonConnectionsConfig, generations: [1] },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['pokemon-connections'] }, nextGameVote: null, gamesPlayed: 0,
    sessionStandings: [], sessionHistory: [], daily: null, serverNow: 1_000, game, gamePlayerState: player,
    members: [
      { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 7 },
      { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: false, presence: 'DISCONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 1 },
    ],
  } as RoomView;
}

const playing: PokemonConnectionsPlayerState = { role: 'PLAYER', canSubmit: true, foundGroups: [], mistakesUsed: 1, mistakesAllowed: 4, status: 'PLAYING', completionRank: null, roundPoints: 0, lastAttempt: { kind: 'INCORRECT', attemptedPokemonIds: ['pokemon-1', 'pokemon-2', 'pokemon-3', 'pokemon-5'], nearMiss: true, attemptedAt: 2_000 } };
const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(createElement(PokemonConnectionsGame, { room: view, selfId, onAction: async () => undefined }));

describe('PokemonConnectionsGame', () => {
  it('pinta 16 cartas conmutadoras, los errores en texto y el último intento', () => {
    const html = render(room(publicGame(), playing));
    expect(html.match(/data-connection-card=/g)).toHaveLength(16);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(16);
    expect(html).toContain('data-testid="connections-grid"');
    expect(html).toContain('--cols:4');
    expect(html).toContain('Quedan 3 errores de 4');
    expect(html).toContain('Te falta uno');
    expect(html).toContain('Comprobar 0/4');
    expect(html).toContain('Pokémon 16');
    // Una sola región viva y ningún heredado.
    expect(html.match(/aria-live=/g)).toHaveLength(1);
    expect(html).not.toMatch(/class="[^"]*\b(btn-primary|btn-ghost|card|chip|label|reveal-pop|connections-submit)\b/);
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });

  it('no pinta los temas de los grupos no encontrados antes de revelar, aunque llegara un lastRound', () => {
    // Un `lastRound` sobrante con todos los temas: en la ronda solo sale el grupo propio encontrado.
    const player: PokemonConnectionsPlayerState = { ...playing, foundGroups: [groups[0]!], roundPoints: 1, lastAttempt: { kind: 'CORRECT', attemptedPokemonIds: groups[0]!.pokemon.map((entry) => entry.id), nearMiss: false, attemptedAt: 3_000 } };
    const stale = publicGame('ROUND_ACTIVE', { lastRound: result });
    for (const [view, selfId] of [[room(stale, player), 'p1'], [room(stale, { role: 'SPECTATOR' }), 'watcher'], [room(stale, { ...playing, lastAttempt: null }), 'p2']] as const) {
      const html = render(view, selfId);
      for (const index of [1, 2, 3]) {
        expect(html).not.toContain(LABELS[index]);
        expect(html).not.toContain(`Explicación secreta ${index + 1}`);
      }
      expect(html).not.toContain('No encontrada');
      expect(html).not.toContain('la encontraron');
      expect(html).not.toContain('Estas eran las conexiones');
    }
    const own = render(room(stale, player));
    expect(own).toContain('Pokémon fósiles');
    expect(own).toContain('data-connection-group="group-1"');
    expect(own).toContain('Grupo encontrado');
    // Las cartas del grupo encontrado salen del tablero: quedan 12.
    expect(own.match(/data-connection-card=/g)).toHaveLength(12);
    const spectator = render(room(stale, { role: 'SPECTATOR' }), 'watcher');
    expect(spectator).not.toContain('Pokémon fósiles');
  });

  it('el espectador y el jugador sin intentos ven cartas quietas, sin conmutadores', () => {
    const spectator = render(room(publicGame(), { role: 'SPECTATOR' }), 'watcher');
    expect(spectator).toContain('Estás observando');
    expect(spectator).toContain('las soluciones de cada persona son privadas');
    expect(spectator).not.toContain('aria-pressed');
    expect(spectator).not.toContain('Comprobar');
    const out = render(room(publicGame(), { ...playing, canSubmit: false, status: 'ELIMINATED', mistakesUsed: 4 }));
    expect(out).toContain('Ya no quedan intentos');
    expect(out).toContain('Quedan 0 errores de 4');
    expect(out).not.toContain('aria-pressed');
    const solved = render(room(publicGame(), { ...playing, canSubmit: false, status: 'SOLVED', completionRank: 2, roundPoints: 6, foundGroups: groups }));
    expect(solved).toContain('Tablero completado · 2.º');
    expect(solved.match(/data-connection-group=/g)).toHaveLength(4);
  });

  it('al revelar enseña todos los grupos, si los encontraste y la clasificación de la ronda', () => {
    const reveal = render(room(publicGame('ROUND_RESULTS'), playing), 'p2');
    expect(reveal).toContain('Estas eran las conexiones');
    for (const label of LABELS) expect(reveal).toContain(label);
    expect(reveal.match(/data-connection-group=/g)).toHaveLength(4);
    expect(reveal).not.toContain('data-connection-card');
    expect(reveal.match(/>Encontrada</g)).toHaveLength(1);
    expect(reveal.match(/>No encontrada</g)).toHaveLength(3);
    expect(reveal).toContain('2 de 2 la encontraron');
    expect(reveal).toContain('Solución curada');
    expect(reveal).toContain('4/4 grupos · 12.0s · 1 error');
    expect(reveal).toContain('Completó · 1.º');
    expect(reveal).toContain('Sin tiempo');
    expect(reveal).toContain('Encontraste 1 de 4 grupos');
    expect(reveal).toContain('Avance automático');
    expect(reveal).not.toContain('Siguiente puzle</');
    const host = render(room(publicGame('ROUND_RESULTS'), playing), 'p1');
    expect(host).toContain('Siguiente puzle');
    const last = render(room(publicGame('ROUND_RESULTS', { roundNumber: 5 }), playing), 'p1');
    expect(last).toContain('Ver clasificación');
  });
});

describe('presentación de Pokémon Connections', () => {
  it('placas, foco, textos y anuncios', () => {
    expect(connectionsPlateKind('ROUND_ACTIVE', playing, false)).toBe('select');
    expect(connectionsPlateKind('ROUND_ACTIVE', { role: 'SPECTATOR' }, false)).toBe('watching');
    expect(connectionsPlateKind('ROUND_ACTIVE', { ...playing, status: 'ELIMINATED', canSubmit: false }, false)).toBe('eliminated');
    expect(connectionsPlateKind('ROUND_ACTIVE', { ...playing, status: 'SOLVED', canSubmit: false }, false)).toBe('solved');
    expect(connectionsPlateKind('ROUND_RESULTS', playing, true)).toBe('reveal');
    expect(connectionsPlateKind('GAME_STARTING', playing, false)).toBe('waiting');
    expect(connectionsFocusKey('select', 1, playing.lastAttempt)).toBe('attempt-1-2000');
    expect(connectionsFocusKey('select', 1, null)).toBeNull();
    expect(connectionsFocusKey('reveal', 2, null)).toBe('reveal-2');
    expect(connectionsFeedbackText({ kind: 'INCORRECT', attemptedPokemonIds: [], nearMiss: false, attemptedAt: 1 })).toBe('Ese grupo no conecta');
    expect(connectionsLivesText(3, 4)).toBe('Queda 1 error de 4');
    expect(connectionsAnnouncement({ kind: 'select', roundNumber: 1, groupSize: 4, player: playing, foundLabel: null, found: 0, groupCount: 4 })).toBe('Casi: te falta uno. Quedan 3 errores de 4.');
    expect(connectionsAnnouncement({ kind: 'select', roundNumber: 1, groupSize: 4, player: { ...playing, lastAttempt: { kind: 'CORRECT', attemptedPokemonIds: [], nearMiss: false, attemptedAt: 3 } }, foundLabel: 'Pokémon fósiles', found: 1, groupCount: 4 })).toBe('Correcto: Pokémon fósiles. Llevas 1 de 4.');
    expect(connectionsAnnouncement({ kind: 'reveal', roundNumber: 2, groupSize: 4, player: null, foundLabel: null, found: 0, groupCount: 4 })).toBe('Puzle 2 terminado: ya se ven todas las conexiones.');
    expect(connectionsRoundLine({ foundGroups: 2, elapsedMs: null, mistakesUsed: 1 }, 4)).toBe('2/4 grupos · 1 error');
    expect(connectionsRevealOrder(result.players).map(([id]) => id)).toEqual(['p1', 'p2']);
    expect(connectionsStatsLine({ groupsFound: 1, boardsSolved: 0, roundsPlayed: 1, mistakes: 2, nearMisses: 0, podiumFinishes: 1 })).toBe('1 grupo · 0/1 tableros · 2 errores · 0 a una · 1 podio');
    expect(connectionsTimeLabel(90)).toBe('1 min 30 s');
    expect(connectionsTimeLabel(120)).toBe('2 min');
    expect(connectionsTimeLabel(30)).toBe('30 s');
  });
});

describe('retoques de la revisión', () => {
  it('el tiempo antiguo fuera de la rejilla de 30 s se enseña en el paso más cercano sin tocar la configuración', () => {
    expect(connectionsSnapSeconds(45)).toBe(60);
    expect(connectionsSnapSeconds(44)).toBe(30);
    expect(connectionsSnapSeconds(100)).toBe(90);
    expect(connectionsSnapSeconds(120)).toBe(120);
    expect(connectionsSnapSeconds(299)).toBe(300);
    let committed = false;
    const config = { ...defaultPokemonConnectionsConfig, roundSeconds: 100 };
    const html = renderToStaticMarkup(createElement(PokemonConnectionsConfigPanel, { config, disabled: false, onChange: async () => { committed = true; } }));
    expect(html).toMatch(/min="30" max="300" step="30"[^>]*value="90"/);
    expect(html).toContain('1 min 30 s');
    expect(committed).toBe(false);
  });

  it('el foco solo va a la placa con un intento nuevo, no con el que había al montar o reconectar', () => {
    const mounted = nextAttemptFocus(null, 2_000);
    expect(mounted).toEqual({ seen: 2_000, fresh: null });
    const fresh = nextAttemptFocus(mounted, 3_000);
    expect(fresh.fresh).toBe(3_000);
    expect(nextAttemptFocus(fresh, 3_000).fresh).toBe(3_000);
    // El estado del jugador desaparece y vuelve con el mismo intento: no es nuevo.
    const gone = nextAttemptFocus(fresh, null);
    expect(nextAttemptFocus(gone, 3_000).fresh).toBeNull();
    expect(nextAttemptFocus(null, null)).toEqual({ seen: null, fresh: null });
    expect(nextAttemptFocus({ seen: null, fresh: null }, 1_000).fresh).toBe(1_000);
  });
});

describe('PokemonConnectionsResults y ajustes', () => {
  it('clasificación con métricas en texto, récords y sin medallas', () => {
    const results = renderToStaticMarkup(createElement(PokemonConnectionsResults, { room: room(publicGame('GAME_RESULTS'), playing), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(results).toContain('Mentes bien conectadas');
    expect(results).toContain('Continuar sesión');
    expect(results).toContain('4 grupos · 1/1 tableros · 1 error · 1 a una · 1 podio');
    expect(results).toContain('Más grupos');
    expect(results).toContain('Tablero más rápido');
    expect(results).toContain('12.0s');
    expect(results).not.toMatch(/🥇|🥈|🥉/);
  });

  it('ajustes con controles del catálogo y todo el rango del contrato', () => {
    const config = renderToStaticMarkup(createElement(PokemonConnectionsConfigPanel, { config: defaultPokemonConnectionsConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Pokémon por grupo');
    expect(config).toContain('Total del tablero');
    expect(config).toContain('Errores permitidos');
    expect(config).toContain('Tiempo por puzle');
    expect(config).toContain('Número de puzles');
    expect(config).toContain('Un intento con todos menos uno');
    expect(config).toMatch(/min="1" max="10"/);
    expect(config).toMatch(/min="30" max="300" step="30"/);
    expect(config.slice(config.indexOf('</section>'))).not.toMatch(/class="(field|label|chip)[ "]/);
  });
});
