import { defaultOneOfUsIsFakeConfig, type FakeRoundResult, type OneOfUsIsFakePlayerState, type OneOfUsIsFakePublicState, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OneOfUsIsFakeConfigPanel } from '../games/one-of-us-is-fake/ConfigPanel';
import { categoryErrorMessage } from '../games/one-of-us-is-fake/CustomCategoryManager';
import { OneOfUsIsFakeGame } from './OneOfUsIsFakeGame';
import { OneOfUsIsFakeResults } from './OneOfUsIsFakeResults';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [{ id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' }], error: '', loading: false, retry: () => undefined }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { kind: 'GUEST' } }) }));

const LEGACY = /class="[^"]*\b(btn-primary|btn-secondary|btn-ghost|card|chip|label|field|panel|reveal-pop|timer-pulse|text-electric|text-leaf|text-berry|text-aqua|text-ink|bg-berry|empty-state|status-error)\b/;

const MAIN = 'Pokémon que parecen mascotas';
const VARIANT = 'Pokémon guardaespaldas';
const lapras = { id: 'lapras', name: 'Lapras', sprite: '/lapras.png' };
const arcanine = { id: 'arcanine', name: 'Arcanine', sprite: '/arcanine.png' };
const snorlax = { id: 'snorlax', name: 'Snorlax', sprite: '/snorlax.png' };

/** Resultado: Leo (p3) era el fake; empate a 1 en la primera vuelta y sale Leo con 2 votos en la segunda. */
const result: FakeRoundResult = {
  fakePlayerId: 'p3', selectedPlayerId: 'p3', winner: 'NORMALS', mainCategory: MAIN, fakeCategory: VARIANT,
  players: [
    { playerId: 'p1', category: MAIN, pokemon: lapras, isFake: false },
    { playerId: 'p2', category: MAIN, pokemon: arcanine, isFake: false },
    { playerId: 'p3', category: VARIANT, pokemon: snorlax, isFake: true },
  ],
  voteRounds: [
    { number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p2: 'p3', p3: 'p1' } },
    { number: 2, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p3', p2: 'p3', p3: 'p1' } },
  ],
  pointsAwarded: { p1: 2, p2: 2, p3: 0 },
};

type Phase = OneOfUsIsFakePublicState['phase'];
function publicGame(phase: Phase = 'ROUND_ACTIVE', lastRound: FakeRoundResult | null = null, revealed = 3): OneOfUsIsFakePublicState {
  const all = [{ playerId: 'p2', pokemon: arcanine }, { playerId: 'p1', pokemon: lapras }, { playerId: 'p3', pokemon: snorlax }];
  return {
    gameId: 'one-of-us-is-fake', phase, roundNumber: 1, totalRounds: 5, playerIds: ['p1', 'p2', 'p3'],
    selectionCompletedIds: phase === 'ROUND_ACTIVE' ? ['p1'] : ['p1', 'p2', 'p3'],
    // Al elegir, el servidor no manda elecciones ajenas; aquí van de sobra para comprobar que la pantalla no las lee.
    revealedChoices: all.slice(0, revealed),
    votedPlayerIds: phase === 'DISCUSSION' || phase === 'REVOTE' ? ['p2'] : [], voteCandidates: ['p1', 'p2', 'p3'],
    voteRoundNumber: phase === 'REVOTE' ? 2 : 1, scores: { p1: 2, p2: 2, p3: 0 },
    roundEndsAt: phase === 'ROUND_ACTIVE' || phase === 'DISCUSSION' || phase === 'REVOTE' ? 31_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' || phase === 'CHOICE_REVEAL' ? 7_000 : null, lastRound,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 2, won: true, stats: { roundsPlayed: 1, victoriesAsFake: 0, victoriesAsNormal: 1, timesFake: 0, fakeDiscovered: 0, fakeUndiscovered: 0, correctVotes: 1, incorrectVotes: 1, normalWronglySelected: 0 } },
      { playerId: 'p2', position: 1, points: 2, won: true, stats: { roundsPlayed: 1, victoriesAsFake: 0, victoriesAsNormal: 1, timesFake: 0, fakeDiscovered: 0, fakeUndiscovered: 0, correctVotes: 2, incorrectVotes: 0, normalWronglySelected: 0 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { roundsPlayed: 1, victoriesAsFake: 0, victoriesAsNormal: 0, timesFake: 1, fakeDiscovered: 1, fakeUndiscovered: 0, correctVotes: 0, incorrectVotes: 2, normalWronglySelected: 0 } },
    ] } : null,
  };
}

function room(game: OneOfUsIsFakePublicState, player: OneOfUsIsFakePlayerState | null): RoomView {
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => ({
    id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const,
    roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: 0,
  }));
  return {
    code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, members,
    availableGames: [{ id: 'one-of-us-is-fake', name: 'One of Us Is Fake', icon: '🕵️', description: 'Categorías', minPlayers: 3, profileStats: { metrics: [] } }],
    selectedGameId: 'one-of-us-is-fake', selectedGameConfig: defaultOneOfUsIsFakeConfig,
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['one-of-us-is-fake'] }, nextGameVote: null, gamesPlayed: 0,
    sessionStandings: [], sessionHistory: [], game, gamePlayerState: player, serverNow: 1_000,
  };
}

const normal = (overrides: Partial<Extract<OneOfUsIsFakePlayerState, { role: 'PLAYER' }>> = {}): OneOfUsIsFakePlayerState => ({ role: 'PLAYER', myCategory: MAIN, ownChoice: null, canSelect: true, canVote: false, ownVotePlayerId: null, ...overrides });
const render = (game: OneOfUsIsFakePublicState, player: OneOfUsIsFakePlayerState | null, selfId = 'p1') =>
  renderToStaticMarkup(createElement(OneOfUsIsFakeGame, { room: room(game, player), selfId, onAction: async () => undefined }));
/** Texto de lo que se pinta (sin etiquetas), con los `alt`, `title` y `aria-label`. */
const visible = (html: string) => `${html.replace(/<[^>]+>/g, ' ')} ${[...html.matchAll(/(?:alt|title|aria-label)="([^"]*)"/g)].map((match) => match[1]).join(' ')}`;

describe('One of Us Is Fake: pantalla', () => {
  it('elegir: la categoría propia en su panel, el buscador y solo quién ha elegido', () => {
    const html = render(publicGame(), normal({ ownChoice: lapras }));
    expect(html).toContain(MAIN);
    expect(html).toContain('Tu categoría · solo la ves tú');
    expect(html).toContain('Elige tu Pokémon');
    expect(html).toContain('Elección guardada');
    expect(html).toContain('Guardada<');
    expect(html).toContain('Buscar Pokémon para tu categoría');
    expect(html).toContain('Para elegir');
    expect(html).toContain('Eligió');
    expect(html).toContain('Eligiendo…');
    expect(html).toMatch(/aria-current="step"[^>]*data-phase="choose"|data-phase="choose"[^>]*aria-current="step"/);
    expect(html).not.toMatch(LEGACY);
  });

  it('privacidad: antes del resultado nadie ve al fake ni su categoría, ni votos, ni elecciones antes de revelarse', () => {
    for (const phase of ['ROUND_ACTIVE', 'CHOICE_REVEAL', 'DISCUSSION', 'REVOTE'] as const) {
      // Un `lastRound` sobrante (con el fake, su categoría y los votos) no debe llegar al DOM.
      const text = visible(render(publicGame(phase, result), normal({ canSelect: phase === 'ROUND_ACTIVE', canVote: phase === 'DISCUSSION' || phase === 'REVOTE' })));
      expect(text, phase).not.toContain(VARIANT);
      expect(text, phase).not.toMatch(/El fake era|Eres el fake|Fake ·|FAKE|era el fake|Categoría del fake|Votos de|\b\d+ votos?\b|Primera vuelta|Más votado/);
      expect(text, phase).not.toContain('tally-');
      if (phase === 'ROUND_ACTIVE') for (const name of ['Lapras', 'Arcanine', 'Snorlax']) expect(text, `${phase}: ${name}`).not.toContain(name);
    }
    // Revelación a medias: solo las ya reveladas; las demás, tapadas.
    const partial = visible(render(publicGame('CHOICE_REVEAL', null, 1), normal({ canSelect: false })));
    expect(partial).toContain('Arcanine');
    expect(partial).not.toContain('Lapras');
    expect(partial).not.toContain('Snorlax');
    expect(partial).toContain('Por revelar');
    expect(partial).toContain('Elecciones reveladas: 1 de 3');
    // Quien no eligió sale «Sin elección» desde el principio de la revelación (nunca «Por revelar» para siempre).
    const missing = render({ ...publicGame('CHOICE_REVEAL', null, 1), selectionCompletedIds: ['p1', 'p2'] }, normal({ canSelect: false }));
    expect(missing).toContain('Elecciones reveladas: 1 de 2');
    expect(missing).toMatch(/data-fake-choice="p1">(?:(?!<\/li>).)*Por revelar/);
    expect(missing).toMatch(/data-fake-choice="p3">(?:(?!<\/li>).)*Sin elección/);
    expect(missing).not.toMatch(/data-fake-choice="p3">(?:(?!<\/li>).)*Por revelar/);
  });

  it('el fake ve su categoría; solo con «El fake sabe» se le dice que lo es', () => {
    const unaware = visible(render(publicGame(), normal({ myCategory: VARIANT }), 'p3'));
    expect(unaware).toContain(VARIANT);
    expect(unaware).not.toMatch(/Eres el fake|diferente/);
    const informed = render(publicGame('DISCUSSION'), normal({ myCategory: VARIANT, isFake: true, canSelect: false, canVote: true }), 'p3');
    expect(informed).toContain('Eres el fake');
    expect(informed).toContain(VARIANT);
    expect(render(publicGame(), normal({ myCategory: VARIANT, isFake: true }), 'p3')).toContain('Tienes una categoría diferente al resto');
  });

  it('debate: las elecciones en cartas, la categoría propia y la papeleta con los jugadores (la propia, fija)', () => {
    const html = render(publicGame('DISCUSSION'), normal({ ownChoice: lapras, canSelect: false, canVote: true }));
    expect(html).toContain('¿Quién es el fake?');
    expect(html).toContain('Debate y voto');
    expect(html).toContain('Para debatir y votar');
    for (const name of ['Lapras', 'Arcanine', 'Snorlax']) expect(html).toContain(name);
    expect(html).toMatch(/data-fake-choice="p1".*?Lapras.*?Eru/);
    expect(html).toContain('data-testid="fake-category"');
    expect(html).toContain(MAIN);
    expect(html).toContain('data-testid="ballot-options"');
    expect(html).toContain('Eres tú');
    expect(html).toContain('No puedes votarte');
    expect(html).toContain('Votó');
    expect(html).not.toMatch(LEGACY);
  });

  it('segunda vuelta: su paso en las fases y la papeleta solo con los empatados', () => {
    const game = { ...publicGame('REVOTE'), voteCandidates: ['p2', 'p3'] };
    const html = render(game, normal({ canSelect: false, canVote: true }));
    expect(html).toContain('Segunda vuelta');
    expect(html).toContain('Para revotar');
    expect(html).toMatch(/data-phase="revote"/);
    expect(html).toContain('data-ballot-option="p2"');
    expect(html).toContain('data-ballot-option="p3"');
    expect(html).not.toContain('data-ballot-option="p1"');
    // Sin segunda vuelta, su paso no existe (nunca sale como hecho sin jugarse).
    expect(render(publicGame('DISCUSSION'), normal({ canSelect: false, canVote: true }))).not.toContain('data-phase="revote"');
  });

  it('resultado: quién era el fake, las dos categorías, el recuento con sus vueltas y los puntos', () => {
    const html = render(publicGame('ROUND_RESULTS', result), normal({ canSelect: false }));
    const text = visible(html);
    expect(html).toContain('Ganan los normales');
    expect(text).toContain('El fake era');
    expect(html).toMatch(/data-testid="fake-player">Leo</);
    expect(text).toContain('Descubierto por el grupo');
    expect(text).toContain(MAIN);
    expect(text).toContain(VARIANT);
    expect(html).toContain('Sale Leo con 2 votos tras la segunda vuelta. Leo era el fake.');
    expect(text).toContain('Más votado');
    expect(text).toContain('Primera vuelta');
    expect(text).toContain('Fake · descubierto');
    expect(text).toContain('¡El grupo descubrió al fake!');
    expect(text).toContain('+2');
    expect(html).toMatch(/data-phase="revote"/);
    expect(html).not.toMatch(LEGACY);
  });

  it('resultado por sorteo: el recuento lo dice y no corona a nadie con 0 votos', () => {
    const lot: FakeRoundResult = { ...result, selectedPlayerId: 'p1', winner: 'FAKE', pointsAwarded: { p1: 0, p2: 0, p3: 4 }, voteRounds: [result.voteRounds[0]!, { number: 2, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p2: 'p3', p3: 'p1' } }] };
    const html = render(publicGame('ROUND_RESULTS', lot), normal({ canSelect: false }));
    expect(html).toContain('Gana el fake');
    expect(html).toContain('Empate a 1 voto entre Eru, Ana y Leo tras la segunda vuelta: el sorteo eligió a Eru. Eru no era el fake: el fake era Leo.');
    expect(html).toContain('Empate · sorteo');
    expect(html).toContain('Sale por sorteo');
    expect(html).not.toContain('Más votado');
    expect(html).toContain('Expulsado siendo normal');
    const none: FakeRoundResult = { ...lot, voteRounds: [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: {} }, { number: 2, candidateIds: ['p1', 'p2', 'p3'], votes: {} }] };
    const empty = render(publicGame('ROUND_RESULTS', none), normal({ canSelect: false }));
    expect(empty).toContain('Nadie votó en la segunda vuelta: el sorteo eligió a Eru.');
    expect(empty).not.toContain('Más votado');
  });

  it('quien observa sigue el juego sin categoría ni controles', () => {
    const html = render(publicGame(), { role: 'SPECTATOR' }, 'p9');
    expect(html).toContain('Estás observando');
    expect(html).not.toContain('Tu categoría');
    expect(html).not.toContain('Buscar Pokémon para tu categoría');
    const debate = render(publicGame('DISCUSSION'), { role: 'SPECTATOR' }, 'p9');
    expect(debate).toContain('Las categorías siguen en secreto hasta el resultado');
    expect(debate).toContain('Puedes seguir el debate, pero no votas en esta ronda.');
  });

  it('una sola región viva', () => {
    for (const phase of ['ROUND_ACTIVE', 'CHOICE_REVEAL', 'DISCUSSION', 'ROUND_RESULTS'] as const) {
      const html = render(publicGame(phase, phase === 'ROUND_RESULTS' ? result : null), normal({ canSelect: phase === 'ROUND_ACTIVE' }));
      expect(html.match(/aria-live=/g)?.length, phase).toBe(1);
    }
  });
});

describe('One of Us Is Fake: resultados, ajustes y gestor', () => {
  it('resultados: clasificación con métricas en texto, récords y la regla sin medallas', () => {
    const html = renderToStaticMarkup(createElement(OneOfUsIsFakeResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Una partida de sospechas');
    expect(html).toContain('1 victoria como normal · 0 como fake · 1 voto correcto · fake 0 veces · 0 descubiertos');
    expect(html).toContain('Mejor detective');
    expect(html).toContain('Más veces fake');
    expect(html).toContain('cada normal gana 2 puntos');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
    expect(html).not.toMatch(LEGACY);
  });

  it('ajustes con los controles del catálogo', () => {
    const html = renderToStaticMarkup(createElement(OneOfUsIsFakeConfigPanel, { config: defaultOneOfUsIsFakeConfig, disabled: false, room: room(publicGame(), null), selfId: 'p1', onChange: async () => undefined }));
    for (const label of ['Número de rondas', 'Tiempo para elegir', 'Tiempo de debate y voto', 'El fake sabe que es fake', 'Fuente de categorías', 'Formas regionales']) expect(html).toContain(label);
    expect(html).toContain('3 min');
    expect(html).toContain('Crea una cuenta para guardar categorías personales');
    expect(html).not.toMatch(/class="[^"]*\b(btn-primary|btn-secondary|btn-ghost|chip|field)\b/);
  });

  it('los errores del gestor salen en castellano', () => {
    expect(categoryErrorMessage(new Error('Ya tienes una categoría igual o equivalente.'), 'x')).toBe('Ya tienes una categoría igual o equivalente.');
    expect(categoryErrorMessage(new Error('Request failed'), 'No se pudo guardar.')).toBe('No se pudo guardar.');
    expect(categoryErrorMessage(new Error('Bad Request'), 'No se pudo guardar.')).toBe('No se pudo guardar.');
    expect(categoryErrorMessage(new TypeError('Failed to fetch'), 'Sin conexión.')).toBe('Sin conexión.');
    expect(categoryErrorMessage('raro', 'Sin conexión.')).toBe('Sin conexión.');
  });
});
