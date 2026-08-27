import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultWhosThatPokemonConfig } from './config.js';
import { buildWhoPokemonHints, isUsableWhoPokemonSprite, whoPokemonHintSchedule, whoPokemonScore } from './rules.js';
import { WHOS_THAT_POKEMON_COOLDOWN_MS, WHOS_THAT_POKEMON_REVEAL_MS, whosThatPokemonGame, whosThatPokemonPool } from './server.js';
import type { WhosThatPokemonPlayerState, WhosThatPokemonState } from './types.js';

function mon(id: string, dex: number, name: string, generation: number, types: Pokemon['types'], extra: Partial<Pokemon> = {}): Pokemon {
  return { id, nationalDexNumber: dex, name, generation, isDefault: true, sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`, hp: 70, attack: 90, defense: 75, specialAttack: 85, specialDefense: 70, speed: 90, baseStatTotal: 480, types, evolutionStage: 2, evolutionStageCount: 2, legendaryStatus: 'NORMAL', ...extra };
}

const pokemon = [
  mon('lucario', 448, 'Lucario', 4, ['fighting', 'steel']),
  mon('raichu', 26, 'Raichu', 1, ['electric']),
  mon('pikachu', 25, 'Pikachu', 1, ['electric'], { evolutionStage: 2, evolutionStageCount: 3 }),
  mon('vulpix', 37, 'Vulpix', 1, ['fire'], { evolutionStage: 1 }),
  mon('vulpix-alola', 10103, 'Vulpix de Alola', 1, ['ice'], { nationalDexNumber: 37, isDefault: false }),
  mon('broken', 999, 'Broken', 2, ['normal'], { sprite: '' }),
];
const catalog: PokemonCatalog = {
  all: () => pokemon,
  byId: (id) => pokemon.find((entry) => entry.id === id),
  byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number && entry.isDefault !== false),
  forGenerations: (generations, options) => pokemon.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)),
};

function setup(overrides: Partial<typeof defaultWhosThatPokemonConfig> = {}, random = () => 0, playerCount = 2) {
  const players = Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon: catalog, now: 1_000, random, roomCode: 'ABC234' };
  const config = { ...defaultWhosThatPokemonConfig, generations: [1, 4], rounds: 2, ...overrides };
  let state = whosThatPokemonGame.createInitialState(config, context); state = whosThatPokemonGame.start(state, context);
  return { state, context, setNow(now: number) { context.now = now; } };
}

function guess(state: WhosThatPokemonState, playerId: string, pokemonId: string, context: GameContext) {
  return whosThatPokemonGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context);
}

describe('¿Quién es ese Pokémon? configuration and selection', () => {
  it('uses the requested defaults and validates timer, rounds and generations', () => {
    expect(defaultWhosThatPokemonConfig).toMatchObject({ roundSeconds: 20, rounds: 10, hintsEnabled: false, includeRegionalForms: true });
    expect(() => whosThatPokemonGame.configSchema.parse({ ...defaultWhosThatPokemonConfig, generations: [] })).toThrow();
    expect(() => whosThatPokemonGame.configSchema.parse({ ...defaultWhosThatPokemonConfig, roundSeconds: 9 })).toThrow();
    expect(() => whosThatPokemonGame.configSchema.parse({ ...defaultWhosThatPokemonConfig, rounds: 21 })).toThrow();
  });

  it('selects one shared target from enabled generations and requires a trusted sprite', () => {
    const fixture = setup({ generations: [4] });
    expect(fixture.state.targetPokemonId).toBe('lucario');
    expect(fixture.state.playerIds).toEqual(['p1', 'p2']);
    expect(fixture.state.poolIds).toEqual(['lucario']);
    expect(fixture.state.poolIds).not.toContain('broken');
    expect(isUsableWhoPokemonSprite(pokemon[0]!)).toBe(true);
    expect(isUsableWhoPokemonSprite(pokemon.at(-1)!)).toBe(false);
  });

  it('centralizes regional form inclusion and exact form identity', () => {
    const withoutForms = setup({ generations: [1], includeRegionalForms: false });
    expect(withoutForms.state.poolIds).not.toContain('vulpix-alola');
    const withForms = setup({ generations: [1], includeRegionalForms: true }, () => 0.999);
    expect(withForms.state.targetPokemonId).toBe('vulpix-alola');
    const wrongForm = guess(withForms.state, 'p1', 'vulpix', withForms.context).state;
    expect(wrongForm.solves.p1).toBeUndefined();
    withForms.context.now += WHOS_THAT_POKEMON_COOLDOWN_MS;
    expect(guess(wrongForm, 'p1', 'vulpix-alola', withForms.context).accepted).toBe(true);
  });

  it('recycles only after exhausting unused valid targets', () => {
    const fixture = setup({ generations: [4], rounds: 2 }); fixture.setNow(fixture.state.roundEndsAt!);
    let state = whosThatPokemonGame.handleTimeout(fixture.state, fixture.context); fixture.setNow(state.nextTransitionAt!);
    state = whosThatPokemonGame.handleTimeout(state, fixture.context);
    expect(state.targetPokemonId).toBe('lucario');
  });

  it('builds simple non-name hints and proportional reveal times', () => {
    expect(buildWhoPokemonHints(pokemon[0]!)).toEqual([
      { kind: 'GENERATION', value: 4 }, { kind: 'TYPE', value: 'fighting' }, { kind: 'EVOLUTION', stage: 2, stages: 2 },
    ]);
    expect(whoPokemonHintSchedule(1_000, 20, 3)).toEqual([6_000, 11_000, 16_000]);
    expect(JSON.stringify(buildWhoPokemonHints(pokemon[0]!))).not.toMatch(/lucario/i);
    expect(whosThatPokemonPool({ ...defaultWhosThatPokemonConfig, generations: [1], includeRegionalForms: false }, setup().context).every((entry) => entry.generation === 1 && entry.isDefault !== false)).toBe(true);
  });
});

describe('secure silhouette and reveal projection', () => {
  it('never exposes target identity, source URL or colour asset during an active round or reconnection', () => {
    const fixture = setup({ generations: [4], hintsEnabled: false });
    const publicState = whosThatPokemonGame.getPublicState(fixture.state, fixture.context);
    const privateState = whosThatPokemonGame.getPlayerState(fixture.state, 'p1', fixture.context);
    const serialized = JSON.stringify({ publicState, privateState });
    expect(serialized).not.toMatch(/lucario|448\.png|targetPokemon|correctPokemon/i);
    expect(publicState.silhouetteSprite).toMatch(/\/options\/shadow\/sprite$/);
    expect(publicState.visibleHints).toEqual([]);
    expect(whosThatPokemonGame.resolveAsset!(fixture.state, { assetToken: fixture.state.assetToken, roundNumber: 1, assetId: 'shadow' }, fixture.context)).toMatchObject({ transform: 'SILHOUETTE' });
    expect(whosThatPokemonGame.resolveAsset!(fixture.state, { assetToken: fixture.state.assetToken, roundNumber: 1, assetId: 'reveal' }, fixture.context)).toBeNull();
  });

  it('reveals name and opaque real sprite only after round resolution', () => {
    const fixture = setup({ generations: [4] }); fixture.setNow(fixture.state.roundEndsAt!);
    const state = whosThatPokemonGame.handleTimeout(fixture.state, fixture.context); const view = whosThatPokemonGame.getPublicState(state, fixture.context);
    expect(view.lastRound?.pokemon).toMatchObject({ name: 'Lucario', sprite: expect.stringMatching(/\/options\/reveal\/sprite$/) });
    expect(view.silhouetteSprite).toBeNull();
    expect(whosThatPokemonGame.resolveAsset!(state, { assetToken: state.assetToken, roundNumber: 1, assetId: 'reveal' }, fixture.context)).toMatchObject({ transform: 'ORIGINAL' });
    expect(state.nextTransitionAt).toBe(fixture.context.now + WHOS_THAT_POKEMON_REVEAL_MS);
  });
});

describe('authoritative attempts, cooldown and simultaneous solving', () => {
  it('publishes multiple incorrect attempts without ending participation', () => {
    const fixture = setup({ generations: [1, 4] });
    let result = guess(fixture.state, 'p1', 'raichu', fixture.context); expect(result.accepted).toBe(true); expect(result.state.phase).toBe('ROUND_ACTIVE');
    let view = whosThatPokemonGame.getPublicState(result.state, fixture.context); expect(view.attempts[0]).toMatchObject({ playerId: 'p1', guessedPokemon: { id: 'raichu', name: 'Raichu' } });
    fixture.setNow(fixture.context.now + WHOS_THAT_POKEMON_COOLDOWN_MS); result = guess(result.state, 'p1', 'pikachu', fixture.context);
    view = whosThatPokemonGame.getPublicState(result.state, fixture.context); expect(view.attempts).toHaveLength(2); expect((whosThatPokemonGame.getPlayerState(result.state, 'p1', fixture.context) as WhosThatPokemonPlayerState).canGuess).toBe(true);
  });

  it('enforces cooldown on the server and exposes compact private feedback', () => {
    const fixture = setup(); const wrong = guess(fixture.state, 'p1', 'raichu', fixture.context);
    expect(wrong.state.cooldownUntil.p1).toBe(1_000 + WHOS_THAT_POKEMON_COOLDOWN_MS);
    expect(guess(wrong.state, 'p1', 'pikachu', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/Espera/) });
    expect(whosThatPokemonGame.getPlayerState(wrong.state, 'p1', fixture.context)).toMatchObject({ canGuess: true, lastAttempt: { result: 'INCORRECT' } });
  });

  it('marks a correct player publicly without revealing the answer and lets others continue', () => {
    const fixture = setup({ generations: [4] }); fixture.setNow(2_000);
    const solved = guess(fixture.state, 'p1', 'lucario', fixture.context).state; const view = whosThatPokemonGame.getPublicState(solved, fixture.context);
    expect(solved.phase).toBe('ROUND_ACTIVE'); expect(view.solvedPlayers).toEqual([{ playerId: 'p1', solveOrder: 1 }]); expect(JSON.stringify(view)).not.toMatch(/lucario|448\.png/i);
    expect(whosThatPokemonGame.getPlayerState(solved, 'p1', fixture.context)).toMatchObject({ solved: true, canGuess: false, solveOrder: 1, roundPoints: 13 });
    expect((whosThatPokemonGame.getPlayerState(solved, 'p2', fixture.context) as WhosThatPokemonPlayerState).canGuess).toBe(true);
    expect(guess(solved, 'p1', 'lucario', fixture.context).accepted).toBe(false);
  });

  it('rejects spectators, disconnected players and Pokémon outside the configured pool', () => {
    const fixture = setup({ generations: [4] });
    expect(guess(fixture.state, 'spectator', 'lucario', fixture.context).accepted).toBe(false);
    expect(guess(fixture.state, 'p1', 'raichu', fixture.context).accepted).toBe(false);
    fixture.context.players[0]!.connected = false;
    expect(guess(fixture.state, 'p1', 'lucario', fixture.context).accepted).toBe(false);
  });

  it('ends early after every connected player solves and does not wait for a disconnect', () => {
    const all = setup({ generations: [4] }); let state = guess(all.state, 'p1', 'lucario', all.context).state; state = guess(state, 'p2', 'lucario', all.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
    const disconnected = setup({ generations: [4] }); disconnected.context.players[1]!.connected = false;
    state = guess(disconnected.state, 'p1', 'lucario', disconnected.context).state;
    expect(state.phase).toBe('ROUND_RESULTS');
  });
});

describe('timer, points, hints and final statistics', () => {
  it('awards a continuous speed score plus a clear podium bonus and zero for timeout', () => {
    expect(whoPokemonScore(0, 20, 1_000, 1)).toEqual({ speedPoints: 10, placementBonus: 3, totalPoints: 13 });
    expect(whoPokemonScore(0, 20, 3_000, 2)).toEqual({ speedPoints: 9, placementBonus: 2, totalPoints: 11 });
    expect(whoPokemonScore(0, 20, 10_000, 3)).toEqual({ speedPoints: 5, placementBonus: 1, totalPoints: 6 });
    expect(whoPokemonScore(0, 20, 19_500, 4)).toEqual({ speedPoints: 1, placementBonus: 0, totalPoints: 1 });
    const timeout = setup({ generations: [4], rounds: 1 }); timeout.setNow(timeout.state.roundEndsAt!);
    const state = whosThatPokemonGame.handleTimeout(timeout.state, timeout.context); expect(state.scores).toEqual({ p1: 0, p2: 0 }); expect(state.playerStats.p1?.missed).toBe(1);
  });

  it('reveals enabled hints progressively while keeping the silhouette black', () => {
    const fixture = setup({ generations: [4], hintsEnabled: true }); let state = fixture.state;
    expect(whosThatPokemonGame.getPublicState(state, fixture.context).visibleHints).toEqual([]);
    fixture.setNow(state.nextTransitionAt!); state = whosThatPokemonGame.handleTimeout(state, fixture.context);
    expect(whosThatPokemonGame.getPublicState(state, fixture.context).visibleHints).toEqual([{ kind: 'GENERATION', value: 4 }]);
    expect(whosThatPokemonGame.resolveAsset!(state, { assetToken: state.assetToken, roundNumber: 1, assetId: 'shadow' }, fixture.context)).toMatchObject({ transform: 'SILHOUETTE' });
  });

  it('restores attempts, solve lock, timer and hints without leaking target', () => {
    const fixture = setup({ generations: [4], hintsEnabled: true }); fixture.setNow(2_000);
    let state = guess(fixture.state, 'p1', 'lucario', fixture.context).state;
    fixture.setNow(state.nextTransitionAt!); state = whosThatPokemonGame.handleTimeout(state, fixture.context);
    const restored = { game: whosThatPokemonGame.getPublicState(state, fixture.context), player: whosThatPokemonGame.getPlayerState(state, 'p1', fixture.context) };
    expect(restored).toMatchObject({ game: { roundNumber: 1, roundEndsAt: expect.any(Number), solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }], visibleHints: [{ kind: 'GENERATION' }] }, player: { solved: true, canGuess: false, solveOrder: 1 } });
    expect(JSON.stringify(restored)).not.toMatch(/lucario|448\.png/i);
  });

  it('advances automatically after four seconds and finishes with aggregate profile metrics', () => {
    const fixture = setup({ generations: [1, 4], rounds: 1 });
    let state = guess(fixture.state, 'p1', 'raichu', fixture.context).state; fixture.setNow(3_000); state = guess(state, 'p2', 'lucario', fixture.context).state;
    fixture.setNow(10_000); state = guess(state, 'p1', 'lucario', fixture.context).state; expect(state.phase).toBe('ROUND_RESULTS');
    fixture.setNow(state.nextTransitionAt!); state = whosThatPokemonGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('GAME_RESULTS');
    const results = whosThatPokemonGame.getResults(state); expect(results.standings.map((entry) => entry.playerId)).toEqual(['p2', 'p1']);
    expect(results.standings.find((entry) => entry.playerId === 'p1')?.stats).toMatchObject({ correct: 1, missed: 0, totalAttempts: 2, firstTry: 0, roundFirsts: 0, bestTimeMs: 9000, pointsFromRounds: 8 });
  });

  it('uses solve order to break otherwise simultaneous answers', () => {
    const fixture = setup({ generations: [4], rounds: 1 });
    fixture.setNow(2_000);
    let state = guess(fixture.state, 'p1', 'lucario', fixture.context).state;
    state = guess(state, 'p2', 'lucario', fixture.context).state;
    fixture.setNow(state.nextTransitionAt!);
    state = whosThatPokemonGame.handleTimeout(state, fixture.context);

    const results = whosThatPokemonGame.getResults(state);
    expect(state.lastRound?.solves).toMatchObject({ p1: { solveOrder: 1 }, p2: { solveOrder: 2 } });
    expect(results.standings.map(({ position, points, won }) => ({ position, points, won }))).toEqual([
      { position: 1, points: 13, won: true },
      { position: 2, points: 12, won: false },
    ]);
    expect(results.winnerId).toBe('p1');
  });
});
