import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { describe, expect, it } from 'vitest';
import { defaultPokeTabooConfig } from './config.js';
import { containsTabooPokemonName, POKE_TABOO_DESCRIPTOR_POINTS } from './rules.js';
import { POKE_TABOO_GUESS_COOLDOWN_MS, POKE_TABOO_HINT_COOLDOWN_MS, POKE_TABOO_REVEAL_MS, pokeTabooGame } from './server.js';
import type { PokeTabooPlayerState, PokeTabooState } from './types.js';

const entries: Pokemon[] = [
  pokemon('bulbasaur', 'Bulbasaur', 1), pokemon('charizard', 'Charizard', 1), pokemon('vulpix', 'Vulpix', 1),
  { ...pokemon('vulpix-alola', 'Vulpix de Alola', 1), isDefault: false, types: ['ice'], names: { es: 'Vulpix', en: 'Vulpix' } },
  { ...pokemon('lucario', 'Lucario', 4), types: ['fighting', 'steel'], attack: 110, specialAttack: 115, baseStatTotal: 525 },
];

function pokemon(id: string, name: string, generation: number): Pokemon {
  return {
    id, name, generation, nationalDexNumber: { bulbasaur: 1, charizard: 6, vulpix: 37, lucario: 448 }[id.replace('-alola', '')] ?? 1, sprite: `/${id}.png`, hp: 70, attack: 70,
    defense: 70, specialAttack: 70, specialDefense: 70, speed: 70, baseStatTotal: 420,
    heightDecimeters: 10, weightHectograms: 100, evolutionStage: 1, evolutionStageCount: 2,
    legendaryStatus: 'NORMAL', abilities: ['inner-focus'], types: ['grass'],
  };
}

const catalog: PokemonCatalog = {
  all: () => entries,
  byId: (id) => entries.find((entry) => entry.id === id),
  byDexNumber: (number) => entries.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations, options) => entries.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)),
};

function setup(overrides: Partial<typeof defaultPokeTabooConfig> = {}) {
  let now = 1_000; const randomValues = [0.99, 0.99, 0, 0, 0, 0, 0, 0];
  const context: GameContext = {
    players: [{ id: 'p1', displayName: 'Pedro' }, { id: 'p2', displayName: 'Ana' }, { id: 'p3', displayName: 'Carlos' }],
    pokemon: catalog, now, random: () => randomValues.shift() ?? 0,
  };
  const config = { ...defaultPokeTabooConfig, generations: [1], includeRegionalForms: false, ...overrides };
  let state = pokeTabooGame.createInitialState(config, context); state = pokeTabooGame.start(state, context);
  return { state, context, setNow(value: number) { now = value; context.now = value; } };
}

function guess(state: PokeTabooState, playerId: string, pokemonId: string, context: GameContext) {
  return pokeTabooGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context);
}

function hint(state: PokeTabooState, playerId: string, text: string, context: GameContext) {
  return pokeTabooGame.handleAction(state, playerId, { type: 'SEND_HINT', text }, context);
}

function advanceResult(state: PokeTabooState, fixture: ReturnType<typeof setup>): PokeTabooState {
  fixture.setNow(state.nextTransitionAt!);
  return pokeTabooGame.handleTimeout(state, fixture.context);
}

describe('PokéTaboo', () => {
  it('shuffles once and lets everyone describe before the order repeats across laps', () => {
    const fixture = setup({ laps: 2 }); let state = fixture.state; const descriptors: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      descriptors.push(state.descriptorId!); fixture.setNow(state.roundEndsAt!);
      state = pokeTabooGame.handleTimeout(state, fixture.context);
      state = advanceResult(state, fixture);
    }
    expect(descriptors).toEqual(['p1', 'p2', 'p3', 'p1', 'p2', 'p3']);
    expect(state.phase).toBe('GAME_RESULTS');
    expect(Object.values(state.playerStats).map((stats) => stats.descriptorRounds)).toEqual([2, 2, 2]);
  });

  it('keeps the descriptor from guessing and normal players from writing hints', () => {
    const fixture = setup(); const target = fixture.state.targetPokemonId!;
    expect(guess(fixture.state, 'p1', target, fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/descriptor/) });
    expect(hint(fixture.state, 'p2', 'Tiene hojas', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/Solo el descriptor/) });
  });

  it('allows multiple attempts, publishes wrong guesses and enforces the cooldown server-side', () => {
    const fixture = setup(); const wrong = guess(fixture.state, 'p2', 'charizard', fixture.context);
    expect(wrong.accepted).toBe(true); expect(wrong.state.phase).toBe('ROUND_ACTIVE');
    expect(pokeTabooGame.getPublicState(wrong.state, fixture.context).attempts[0]).toMatchObject({ playerId: 'p2', guessedPokemon: { id: 'charizard', name: 'Charizard' } });
    expect(guess(wrong.state, 'p2', 'vulpix', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/Espera/) });
    fixture.setNow(fixture.context.now + POKE_TABOO_GUESS_COOLDOWN_MS);
    const second = guess(wrong.state, 'p2', 'vulpix', fixture.context);
    expect(second.accepted).toBe(true); expect(second.state.attemptCounts.p2).toBe(2); expect(second.state.playerStats.p2?.totalAttempts).toBe(2);
  });

  it('ends immediately on the first correct answer and awards only the guesser and descriptor', () => {
    const fixture = setup(); const solved = guess(fixture.state, 'p2', fixture.state.targetPokemonId!, fixture.context);
    expect(solved.accepted).toBe(true); expect(solved.state.phase).toBe('ROUND_RESULTS');
    expect(solved.state.lastRound).toMatchObject({ winnerId: 'p2', descriptorId: 'p1', descriptorPoints: POKE_TABOO_DESCRIPTOR_POINTS, winnerAttemptCount: 1 });
    expect(solved.state.scores.p2).toBeGreaterThan(0); expect(solved.state.scores.p1).toBe(POKE_TABOO_DESCRIPTOR_POINTS); expect(solved.state.scores.p3).toBe(0);
    expect(guess(solved.state, 'p3', solved.state.targetPokemonId!, fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/ronda activa/) });
    expect(solved.state.playerStats.p2).toMatchObject({ guessedPokemon: 1, firstTry: 1, firstCorrectResponses: 1, totalAttempts: 1 });
    expect(solved.state.playerStats.p1).toMatchObject({ descriptorRounds: 1, descriptorSuccesses: 1, descriptorFailures: 0, pointsFromDescribing: POKE_TABOO_DESCRIPTOR_POINTS });
  });

  it('times out with zero points, reveals for four seconds and advances automatically', () => {
    const fixture = setup(); fixture.setNow(fixture.state.roundEndsAt!);
    let state = pokeTabooGame.handleTimeout(fixture.state, fixture.context); const view = pokeTabooGame.getPublicState(state, fixture.context);
    expect(state.phase).toBe('ROUND_RESULTS'); expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(view.lastRound).toMatchObject({ reason: 'TIMEOUT', winnerId: null, guesserPoints: 0, descriptorPoints: 0, pokemon: { id: fixture.state.targetPokemonId } });
    expect(state.playerStats.p1).toMatchObject({ descriptorRounds: 1, descriptorFailures: 1 });
    expect(state.nextTransitionAt).toBe(fixture.context.now + POKE_TABOO_REVEAL_MS);
    state = advanceResult(state, fixture); expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.descriptorId).toBe('p2');
  });

  it('blocks normalized secret names in text and publishes only accepted descriptor hints', () => {
    const fixture = setup(); const target = catalog.byId(fixture.state.targetPokemonId!)!;
    expect(containsTabooPokemonName('Se parece a B.u.l.b.a.s.a.u.r', target)).toBe(true);
    expect(hint(fixture.state, 'p1', `Es ${target.name}`, fixture.context)).toMatchObject({ accepted: false, error: 'No puedes escribir el nombre del Pokémon.' });
    const accepted = hint(fixture.state, 'p1', 'Lleva una planta sobre el lomo', fixture.context);
    expect(accepted.accepted).toBe(true); expect(pokeTabooGame.getPublicState(accepted.state, fixture.context).hints).toEqual([{ id: 1, text: 'Lleva una planta sobre el lomo', sentAt: 1_000 }]);
    expect(hint(accepted.state, 'p1', 'Otra pista', fixture.context)).toMatchObject({ accepted: false, error: expect.stringMatching(/Espera/) });
    fixture.setNow(fixture.context.now + POKE_TABOO_HINT_COOLDOWN_MS);
    expect(hint(accepted.state, 'p1', 'Es de los primeros juegos', fixture.context).accepted).toBe(true);
  });

  it('never leaks the target through public or guesser state and gives it only to the descriptor', () => {
    const fixture = setup(); const publicState = pokeTabooGame.getPublicState(fixture.state, fixture.context);
    const descriptor = pokeTabooGame.getPlayerState(fixture.state, 'p1', fixture.context) as PokeTabooPlayerState;
    const guesser = pokeTabooGame.getPlayerState(fixture.state, 'p2', fixture.context) as PokeTabooPlayerState;
    expect(JSON.stringify(publicState)).not.toContain(fixture.state.targetPokemonId!);
    expect(JSON.stringify(guesser)).not.toContain(fixture.state.targetPokemonId!);
    expect(descriptor).toMatchObject({ role: 'DESCRIPTOR', canSendHint: true, secretPokemon: { id: fixture.state.targetPokemonId, hp: 70, baseStatTotal: 420 } });
    expect(guesser).toEqual({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 0 });
  });

  it('uses the configured generations and requires the exact supported form id', () => {
    const generation = setup({ generations: [4] }); expect(generation.state.poolIds).toEqual(['lucario']); expect(generation.state.targetPokemonId).toBe('lucario');
    const forms = setup({ includeRegionalForms: true }); expect(forms.state.poolIds).toContain('vulpix-alola');
    const regionalState = { ...forms.state, targetPokemonId: 'vulpix-alola' };
    const base = guess(regionalState, 'p2', 'vulpix', forms.context); expect(base.accepted).toBe(true); expect(base.state.phase).toBe('ROUND_ACTIVE');
    forms.setNow(forms.context.now + POKE_TABOO_GUESS_COOLDOWN_MS);
    const exact = guess(base.state, 'p2', 'vulpix-alola', forms.context); expect(exact.state.phase).toBe('ROUND_RESULTS'); expect(exact.state.lastRound?.pokemon.name).toBe('Vulpix de Alola');
    expect(containsTabooPokemonName('Se parece mucho a Vulpix', entries.find((entry) => entry.id === 'vulpix-alola')!)).toBe(true);
  });

  it('cancels a disconnected descriptor, moves on without rewarding anyone and lets them guess after reconnecting', () => {
    const fixture = setup(); fixture.context.players[0]!.connected = false;
    const state = pokeTabooGame.handlePresenceChange!(fixture.state, fixture.context);
    expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.roundNumber).toBe(2); expect(state.descriptorId).toBe('p2');
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0 }); expect(state.playerStats.p1).toMatchObject({ descriptorRounds: 1, descriptorFailures: 1 });
    fixture.context.players[0]!.connected = true;
    const restored = pokeTabooGame.getPlayerState(state, 'p1', fixture.context);
    expect(restored).toMatchObject({ role: 'GUESSER', canGuess: true });
    expect(guess(state, 'p1', state.targetPokemonId!, fixture.context).state.phase).toBe('ROUND_RESULTS');
  });

  it('does not let a disconnected guesser block the round and restores eligibility on reconnect', () => {
    const fixture = setup(); fixture.context.players[1]!.connected = false;
    const unchanged = pokeTabooGame.handlePresenceChange!(fixture.state, fixture.context); expect(unchanged).toBe(fixture.state);
    expect(pokeTabooGame.getPlayerState(unchanged, 'p2', fixture.context)).toEqual({ role: 'SPECTATOR' });
    fixture.context.players[1]!.connected = true;
    expect(pokeTabooGame.getPlayerState(unchanged, 'p2', fixture.context)).toMatchObject({ role: 'GUESSER', canGuess: true });
  });

  it('finishes with generic standings and all requested profile metrics', () => {
    const fixture = setup({ laps: 1 }); let state = fixture.state;
    for (let round = 0; round < 3; round += 1) {
      const winner = state.playerIds.find((id) => id !== state.descriptorId)!;
      state = guess(state, winner, state.targetPokemonId!, fixture.context).state;
      state = advanceResult(state, fixture);
    }
    expect(state.phase).toBe('GAME_RESULTS'); const results = pokeTabooGame.getResults(state);
    expect(results.standings).toHaveLength(3);
    expect(results.standings[0]?.stats).toEqual(expect.objectContaining({
      guessedPokemon: expect.any(Number), firstTry: expect.any(Number), totalAttempts: expect.any(Number),
      firstCorrectResponses: expect.any(Number), descriptorRounds: 1, descriptorSuccesses: 1,
      descriptorFailures: 0, pointsFromGuessing: expect.any(Number), pointsFromDescribing: POKE_TABOO_DESCRIPTOR_POINTS,
    }));
  });
});
