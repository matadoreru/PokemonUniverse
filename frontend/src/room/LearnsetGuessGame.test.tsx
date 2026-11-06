import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LearnsetGuessPlayerState, LearnsetGuessPublicState, LearnsetRoundResult, RoomView } from '@pokemon-universe/shared';
import { learnsetAnnouncement, learnsetClueOrder, learnsetFocusKey, learnsetPlateKind, learnsetPositions, learnsetRecords, learnsetStatsLine, learnsetVerdict } from '../games/learnset-guess/presentation';
import { LearnsetGuessGame } from './LearnsetGuessGame';
import { LearnsetGuessResults } from './LearnsetGuessResults';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));

const member = (id: string, displayName: string, role: 'PLAYER' | 'SPECTATOR' = 'PLAYER') => ({ id, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: 'MEMBER' as const, role, isHost: false, ready: false, sessionPoints: 0 });
const move = (moveId: string, name: string, level: number | null, type: 'normal' | 'electric' | 'steel' = 'normal', category: 'physical' | 'special' | 'status' = 'physical') => ({ moveId, name, level, type, category });

const groups = [
  { level: 1, moves: [move('growl', 'Gruñido', 1, 'normal', 'status')], stage: 0 },
  { level: 5, moves: [move('thunder-shock', 'Impactrueno', 5, 'electric', 'special')], stage: 0 },
  { level: 20, moves: [move('iron-tail', 'Cola Férrea', 20, 'steel')], stage: 1 },
];

/** Respuesta de la ronda: solo debe salir en `ROUND_RESULTS`. */
const answer: LearnsetRoundResult = {
  pokemon: { id: 'pikachu', name: 'Pikachu', sprite: '/api/pokemon/pikachu/sprite', nationalDexNumber: 25, generation: 1 },
  referenceGeneration: 9, referenceSource: 'Pokémon Scarlet / Violet',
  revealedMoves: [groups[0]!.moves[0]!, groups[1]!.moves[0]!],
  learnset: [groups[0]!.moves[0]!, groups[1]!.moves[0]!, move('thunderbolt', 'Rayo', 36, 'electric', 'special')],
  solves: { p1: { solveOrder: 1, solvedAt: 2_000, revealStage: 0, points: 7 } }, absentIds: ['p3'],
};

type Phase = LearnsetGuessPublicState['phase'];
function room(phase: Phase, overrides: Partial<LearnsetGuessPublicState> = {}, player: Partial<LearnsetGuessPlayerState> = {}): RoomView {
  const game: LearnsetGuessPublicState = { gameId: 'learnset-guess', phase, mode: 'CLASSIC', roundNumber: 1, totalRounds: 3, referenceGeneration: 9, referenceSource: 'Pokémon Scarlet / Violet', visibleGroups: phase === 'ROUND_ACTIVE' ? groups : [], evolutionHint: null, attempts: [], solvedPlayers: [], roundStartedAt: 1_000, roundEndsAt: 61_000, nextTransitionAt: 8_000, lastWarning: false, lastRound: null, scores: { p1: 0, p2: 0, p3: 0 }, results: null, ...overrides };
  return { code: 'TEST11', phase, hostId: 'p1', maxPlayers: 8, members: [member('p1', 'Ana'), member('p2', 'Bruno'), member('p3', 'Carla'), member('s1', 'Sara', 'SPECTATOR')], availableGames: [], selectedGameId: 'learnset-guess', selectedGameConfig: { generations: [1], showLevels: true, showEvolution: true, roundSeconds: 60, rounds: 3 }, gameConfigs: {}, customizedGameIds: [], sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['learnset-guess'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game, gamePlayerState: { canGuess: phase === 'ROUND_ACTIVE', solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, ...player }, serverNow: 1_000, hostCustomCategoryCount: 0, hostWouldYouRatherPromptCount: 0 } as RoomView;
}
const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(<LearnsetGuessGame room={view} selfId={selfId} onAction={async () => undefined} />);

describe('LearnsetGuessGame: privacidad', () => {
  it('never paints the answer during the active round, even with a leftover lastRound (also for whoever solved)', () => {
    const guessing = render(room('ROUND_ACTIVE', { lastRound: answer }));
    const solved = render(room('ROUND_ACTIVE', { lastRound: answer, solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }], scores: { p1: 7, p2: 0, p3: 0 } }, { canGuess: false, solved: true, solveOrder: 1, roundPoints: 7 }));
    for (const html of [guessing, solved]) {
      expect(html).not.toContain('Pikachu');
      expect(html).not.toContain('/api/pokemon/pikachu/sprite');
      expect(html).not.toContain('Rayo');
    }
    expect(solved).toContain('¡Has acertado!');
    expect(solved).toContain('La respuesta sigue oculta para los demás.');
  });
  it('control: the answer appears once the server reveals the round', () => {
    const html = render(room('ROUND_RESULTS', { lastRound: answer, roundEndsAt: null, nextTransitionAt: 5_000 }));
    expect(html).toMatch(/<h1[^>]*>¡Era Pikachu!<\/h1>/);
    expect(html).toContain('pikachu/sprite');
    expect(html).toContain('Rayo');
  });
});

describe('LearnsetGuessGame: pantalla', () => {
  it('lists the clues newest first, each with its type written out and the category', () => {
    const html = render(room('ROUND_ACTIVE'));
    expect(html.indexOf('Cola Férrea')).toBeLessThan(html.indexOf('Gruñido'));
    expect(html.indexOf('Gruñido')).toBeLessThan(html.indexOf('Impactrueno'));
    expect(html).toContain('data-type="steel"');
    expect(html).toMatch(/data-type="steel"[^>]*>Acero</);
    expect(html).toContain('Especial');
    expect(html).toContain('Nv. 20');
    // Solo la pista recién llegada lleva «Nueva» y la entrada animada.
    expect(html.match(/>Nueva</g)).toHaveLength(1);
    expect(html.match(/data-highlight="true"/g)).toHaveLength(1);
    expect(html.indexOf('>Nueva<')).toBeLessThan(html.indexOf('title="Cola Férrea"'));
    expect(html.match(/motion-enter-up/g)).toHaveLength(1);
  });
  it('puts the evolution hint in the hints strip below the revealed clues (not in the round plate), and not in the reveal', () => {
    const html = render(room('ROUND_ACTIVE', { evolutionHint: 'No evoluciona' }));
    const strip = html.indexOf('aria-label="Pistas adicionales"');
    expect(strip).toBeGreaterThan(html.indexOf('aria-label="Movimientos conocidos"'));
    expect(html.indexOf('Pista evolutiva: No evoluciona')).toBeGreaterThan(strip);
    expect(html.indexOf('Pista evolutiva')).toBeGreaterThan(html.indexOf('</h1>'));
    const reveal = render(room('ROUND_RESULTS', { evolutionHint: 'No evoluciona', lastRound: answer, roundEndsAt: null, nextTransitionAt: 5_000 }));
    expect(reveal).not.toContain('Pistas adicionales');
    expect(reveal).not.toContain('Pista evolutiva');
  });
  it('shows what a solve is worth, the next clue and the search with its usual label', () => {
    const html = render(room('ROUND_ACTIVE'));
    expect(html).toMatch(/data-testid="learnset-stake"[^]*Ahora vale 6 pts/);
    expect(html).toMatch(/Nueva pista en \d+s/);
    expect(html).toContain('aria-label="Buscar Pokémon"');
  });
  it('has exactly one live region, with the last warning and the solver notice but not the E2E texts', () => {
    const html = render(room('ROUND_ACTIVE', { lastWarning: true, solvedPlayers: [{ playerId: 'p2', solveOrder: 1 }], scores: { p1: 0, p2: 7, p3: 0 } }));
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toMatch(/role="status"[^]*¡Último aviso! Solo faltas tú: \d+ segundos?\./);
    // El chip visible cuenta los segundos y no se anuncia; para los lectores, un texto fijo.
    expect(html).toMatch(/aria-hidden="true"><span[^>]*>[^]*?¡Último aviso! Solo faltas tú: \d+ segundos?\./);
    expect(html).toContain('<span class="sr-only">¡Último aviso! Solo faltas tú: la ronda se cierra en unos segundos.</span>');
    expect(html).toContain('Bruno ha acertado');
  });
  it('keeps a live scoreboard: one row per player (no spectators), by points, with the solve order', () => {
    const html = render(room('ROUND_ACTIVE', { solvedPlayers: [{ playerId: 'p2', solveOrder: 1 }], scores: { p1: 0, p2: 7, p3: 0 } }));
    expect(html.match(/data-testid="learnset-score-row"/g)).toHaveLength(3);
    expect(html.indexOf('Bruno')).toBeLessThan(html.indexOf('Carla'));
    expect(html).toContain('Acertó · 1.º');
    expect(html).toMatch(/data-testid="learnset-score">7<small> pts<\/small>/);
    expect(html).not.toContain('Sara');
  });
  it('gives spectators a watching plate and no search or stake', () => {
    const html = render(room('ROUND_ACTIVE', {}, { canGuess: false }), 's1');
    expect(html).toContain('Estás observando');
    expect(html).not.toContain('aria-label="Buscar Pokémon"');
    expect(html).not.toContain('learnset-stake');
  });
  it('lists public attempts newest first and the cooldown with its exact text', () => {
    const attempts = [{ playerId: 'p2', pokemonId: 'raichu', pokemonName: 'Raichu', sprite: '/api/pokemon/raichu/sprite', attemptedAt: 2_000 }, { playerId: 'p1', pokemonId: 'pichu', pokemonName: 'Pichu', sprite: '/api/pokemon/pichu/sprite', attemptedAt: 3_000 }];
    const html = render(room('ROUND_ACTIVE', { attempts }, { cooldownUntil: 1_800 }));
    expect(html.indexOf('Pichu')).toBeLessThan(html.indexOf('Raichu'));
    expect(html).toMatch(/>Espera 0\.8s para confirmar otro intento\.</);
  });
  it('reveals each player once: order, missed and offline (not counted as a miss)', () => {
    const html = render(room('ROUND_RESULTS', { lastRound: answer, roundEndsAt: null, nextTransitionAt: 5_000 }));
    expect(html.match(/data-testid="learnset-reveal-row"/g)).toHaveLength(3);
    expect(html).toContain('Acertó · 1.º');
    expect(html).toContain('Pistas iniciales');
    expect(html).toContain('✗ No acertó');
    expect(html.match(/Sin conexión/g)).toHaveLength(1);
    expect(html).toContain('Pistas que llegaron a verse');
    expect(html).toContain('Sin revelar · 1');
    expect(html).toMatch(/Siguiente ronda en \d+s/);
  });
});

describe('LearnsetGuessGame: Revelación manual', () => {
  /** El jugador ve sus dos primeros grupos (de 3); la proyección pública no trae ninguno. */
  const own = [{ ...groups[0]!, stage: 0 }, { ...groups[1]!, stage: 1 }];
  const ownAttempts = [{ playerId: 'p1', pokemonId: 'raichu', pokemonName: 'Raichu', sprite: '/api/pokemon/raichu/sprite', attemptedAt: 2_000 }];
  const manualRoom = (phase: Phase, overrides: Partial<LearnsetGuessPublicState> = {}, player: Partial<LearnsetGuessPlayerState> = {}) =>
    room(phase, { mode: 'MANUAL_REVEAL', visibleGroups: [], nextTransitionAt: null, ...overrides }, { revealedGroups: own, attempts: ownAttempts, totalGroups: 3, ...player });

  it('paints only the own unlocked groups with «N de M grupos» and no next-clue countdown', () => {
    const html = render(manualRoom('ROUND_ACTIVE'));
    expect(html).toContain('Impactrueno');
    expect(html).toContain('Gruñido');
    expect(html).not.toContain('Cola Férrea');
    expect(html).toContain('2 de 3 grupos');
    expect(html).not.toMatch(/Nueva pista en/);
    // max(1, 3 − 2 + 1) × 10
    expect(html).toMatch(/data-testid="learnset-stake"[^]*Ahora vale 20 pts/);
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });
  it('never uses public groups in this mode and lists only the own attempts', () => {
    const html = render(manualRoom('ROUND_ACTIVE', { visibleGroups: groups }));
    expect(html).not.toContain('Cola Férrea');
    expect(html).toContain('Tus intentos');
    expect(html).toContain('Raichu');
    expect(html).not.toContain('Intentos públicos');
  });
  it('tells a player who used every group to wait for the reveal', () => {
    const attempts = [1, 2, 3].map((index) => ({ ...ownAttempts[0]!, attemptedAt: index * 1_000 }));
    const html = render(manualRoom('ROUND_ACTIVE', {}, { canGuess: false, attempts, revealedGroups: [...own, groups[2]!], totalGroups: 3 }));
    expect(html).toContain('Has agotado los grupos');
    expect(html).toContain('3 de 3 grupos');
    expect(html).not.toContain('aria-label="Buscar Pokémon"');
    expect(html).not.toContain('Estás observando');
  });
  it('gives spectators no groups, with a text that explains why', () => {
    const view = manualRoom('ROUND_ACTIVE', {}, { canGuess: false });
    view.gamePlayerState = { canGuess: false, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0 };
    const html = render(view, 's1');
    expect(html).toContain('Cada jugador ve solo sus pistas');
    expect(html).not.toContain('Gruñido');
    expect(html).toContain('Estás observando');
  });
  it('shows in the reveal how many groups each player saw', () => {
    const lastRound = { ...answer, solves: { p1: { solveOrder: 1, solvedAt: 2_000, revealStage: 1, points: 20 } }, groupsSeen: { p1: 2, p2: 3, p3: 1 }, totalGroups: 3 };
    const html = render(manualRoom('ROUND_RESULTS', { lastRound, roundEndsAt: null, nextTransitionAt: 5_000 }));
    expect(html).toContain('Con 2 de 3 grupos');
    expect(html).toContain('Vio 3 de 3 grupos');
    expect(html).not.toContain('Después de 1 reveal');
  });
  it('names the mode in the results and words the first-group record for it', () => {
    const results = { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 30, stats: { correct: 1, missed: 0, initialSolves: 1, pointsFromSolves: 30, bestRoundPoints: 30 } }] };
    const html = renderToStaticMarkup(<LearnsetGuessResults room={room('GAME_RESULTS', { mode: 'MANUAL_REVEAL', results } as never)} selfId="p1" onLobby={() => undefined} onEnd={() => undefined} />);
    expect(html).toContain('Learnset Guess · Revelación manual · 3 rondas');
    expect(html).toContain('A la primera');
    expect(html).toContain('aciertos con el primer grupo');
  });
});

describe('learnset presentation', () => {
  it('orders clues by stage, newest first, keeping the initial ones by level', () => {
    expect(learnsetClueOrder(groups).map((group) => group.level)).toEqual([20, 1, 5]);
  });
  it('picks the plate and the focus key', () => {
    expect(learnsetPlateKind('ROUND_ACTIVE', { canGuess: true, solved: false }, false)).toBe('guess');
    expect(learnsetPlateKind('ROUND_ACTIVE', { canGuess: false, solved: true }, false)).toBe('solved');
    expect(learnsetPlateKind('ROUND_ACTIVE', { canGuess: false, solved: false }, false)).toBe('watching');
    expect(learnsetPlateKind('ROUND_RESULTS', null, true)).toBe('reveal');
    expect(learnsetFocusKey('guess', 2)).toBeNull();
    expect(learnsetFocusKey('solved', 2)).toBe('solved-2');
  });
  it('announces the newest clue, the own solve and the reveal', () => {
    const game = { roundNumber: 2, visibleGroups: groups, lastRound: answer };
    expect(learnsetAnnouncement({ kind: 'guess', game, roundPoints: 0 })).toBe('Nueva pista: Nv. 20 · Cola Férrea.');
    expect(learnsetAnnouncement({ kind: 'solved', game, roundPoints: 7 })).toBe('Acierto: 7 puntos esta ronda.');
    expect(learnsetAnnouncement({ kind: 'reveal', game, roundPoints: 0 })).toBe('Ronda 2 terminada: era Pikachu.');
  });
  it('gives the verdict of the reveal', () => {
    expect(learnsetVerdict(answer, 'p1', true)).toEqual({ tone: 'ok', text: '¡Acertaste! 1.º en acertar', points: 7 });
    expect(learnsetVerdict(answer, 'p2', true).tone).toBe('bad');
    expect(learnsetVerdict(answer, 's1', false).text).toBe('Estás observando');
  });
  it('shares positions on equal points', () => {
    expect(learnsetPositions([7, 3, 3, 0])).toEqual([1, 2, 2, 4]);
  });
  it('builds the stats line and the records (ties together, null when nobody scored)', () => {
    expect(learnsetStatsLine({ correct: 2, missed: 1, pointsFromSolves: 11 })).toBe('2 aciertos · 1 fallo · 67% · media 5.5 pts');
    const records = learnsetRecords([{ name: 'Ana', stats: { correct: 2, initialSolves: 1, bestRoundPoints: 7 } }, { name: 'Bruno', stats: { correct: 2, initialSolves: 0, bestRoundPoints: 5 } }]);
    expect(records.correct).toEqual({ value: '2', names: ['Ana', 'Bruno'] });
    expect(records.initial).toEqual({ value: '1', names: ['Ana'] });
    expect(records.bestRound).toEqual({ value: '+7', names: ['Ana'] });
    expect(learnsetRecords([{ name: 'Ana', stats: {} }]).correct).toBeNull();
  });
});

describe('LearnsetGuessResults', () => {
  it('ranks with the stats line, records and the host actions', () => {
    const results = { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 12, stats: { correct: 2, missed: 1, initialSolves: 1, pointsFromSolves: 12, bestRoundPoints: 7 } }, { playerId: 'p2', position: 2, points: 0, stats: { correct: 0, missed: 3 } }] };
    const html = renderToStaticMarkup(<LearnsetGuessResults room={room('GAME_RESULTS', { results } as never)} selfId="p1" onLobby={() => undefined} onEnd={() => undefined} />);
    expect(html).toContain('Clasificación Learnset Guess');
    expect(html).toContain('Learnset Guess · 3 rondas');
    expect(html).toContain('2 aciertos · 1 fallo · 67% · media 6.0 pts');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('Continuar sesión');
    expect(html).toContain('Terminar sesión');
  });
});
