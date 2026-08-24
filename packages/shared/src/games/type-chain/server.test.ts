import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultTypeChainConfig } from './config.js';
import { getValidTypeChainCandidates, isValidTypeChainTransition, sharedPokemonTypes } from './rules.js';
import { TYPE_CHAIN_INVALID_COOLDOWN_MS, TYPE_CHAIN_MAX_TURNS, selectTypeChainStarter, typeChainGame, typeChainStarterCandidates } from './server.js';
import type { TypeChainNode, TypeChainState } from './types.js';

const data = { hp: 70, attack: 80, defense: 70, specialAttack: 80, specialDefense: 70, speed: 80, baseStatTotal: 450 };
function mon(id: string, name: string, types: Pokemon['types'], generation = 1, isDefault = true): Pokemon { return { ...data, id, name, types, generation, isDefault, nationalDexNumber: pokemon.length + 1, sprite: `/${id}.png` }; }
const pokemon: Pokemon[] = [];
pokemon.push(
  mon('charizard', 'Charizard', ['fire', 'flying']), mon('staraptor', 'Staraptor', ['normal', 'flying']), mon('talonflame', 'Talonflame', ['fire', 'flying']),
  mon('arcanine', 'Arcanine', ['fire']), mon('vulpix', 'Vulpix', ['fire']), mon('blastoise', 'Blastoise', ['water']), mon('bibarel', 'Bibarel', ['normal', 'water']),
  mon('lanturn', 'Lanturn', ['water', 'electric']), mon('ampharos', 'Ampharos', ['electric']), mon('rotom', 'Rotom', ['electric', 'ghost']),
  mon('raichu-alola', 'Raichu de Alola', ['electric', 'psychic'], 1, false), mon('lucario', 'Lucario', ['fighting', 'steel'], 4),
);
const catalog: PokemonCatalog = { all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (dex) => pokemon.find((entry) => entry.nationalDexNumber === dex), forGenerations: (generations, options) => pokemon.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)) };

function setup(playerCount = 4, random = () => 0, generations = [1]) {
  const players = Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon: catalog, now: 1_000, random, roomCode: 'ABC234' };
  let state = typeChainGame.createInitialState({ ...defaultTypeChainConfig, generations }, context); state = typeChainGame.start(state, context);
  return { state, context, setNow(now: number) { context.now = now; } };
}
const view = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite, types: [...pokemon.types] });
function forceChain(state: TypeChainState, currentPlayerId: string, ids: string[], usedIds = ids): TypeChainState {
  const chain: TypeChainNode[] = ids.map((id, index) => ({ pokemon: view(catalog.byId(id)!), playedBy: index ? currentPlayerId : null, sharedType: index ? sharedPokemonTypes(catalog.byId(ids[index - 1]!)!, catalog.byId(id)!)[0] ?? null : null, turnNumber: index }));
  return { ...state, phase: 'TURN_ACTIVE', currentPlayerId, chain, usedPokemonIds: [...usedIds], roundEndsAt: 20_000 };
}
function submit(state: TypeChainState, playerId: string, pokemonId: string, context: GameContext) { return typeChainGame.handleAction(state, playerId, { type: 'SUBMIT_POKEMON', pokemonId }, context); }

describe('Type Chain exact-one-type rule', () => {
  it('accepts Fire/Flying → Normal/Flying and ignores type order', () => {
    expect(isValidTypeChainTransition(catalog.byId('charizard')!, catalog.byId('staraptor')!)).toBe(true);
    expect(sharedPokemonTypes({ ...catalog.byId('charizard')!, types: ['flying', 'fire'] }, catalog.byId('staraptor')!)).toEqual(['flying']);
  });
  it('accepts Fire/Flying → Fire and Fire → Fire monototype transitions', () => {
    expect(isValidTypeChainTransition(catalog.byId('charizard')!, catalog.byId('arcanine')!)).toBe(true);
    expect(isValidTypeChainTransition(catalog.byId('arcanine')!, catalog.byId('vulpix')!)).toBe(true);
  });
  it('rejects sharing two types and sharing none', () => {
    expect(isValidTypeChainTransition(catalog.byId('charizard')!, catalog.byId('talonflame')!)).toBe(false);
    expect(isValidTypeChainTransition(catalog.byId('charizard')!, catalog.byId('blastoise')!)).toBe(false);
  });
  it('filters allowed, unused and exact-one candidates in one reusable utility', () => {
    const candidates = getValidTypeChainCandidates({ previousPokemon: catalog.byId('charizard')!, allowedPokemon: pokemon, usedPokemonIds: new Set(['arcanine']) });
    expect(candidates.map((entry) => entry.id)).toContain('staraptor'); expect(candidates.map((entry) => entry.id)).not.toContain('arcanine'); expect(candidates.map((entry) => entry.id)).not.toContain('talonflame');
  });
});

describe('pool, starter and turn order', () => {
  it('uses the requested defaults, configured generations and supported unique forms', () => {
    expect(defaultTypeChainConfig.turnSeconds).toBe(15); const fixture = setup();
    expect(fixture.state.poolIds).toContain('raichu-alola'); expect(fixture.state.poolIds).not.toContain('lucario'); expect(new Set(fixture.state.poolIds).size).toBe(fixture.state.poolIds.length);
  });
  it('selects a starter from the pool with at least one real continuation', () => {
    const fixture = setup(); const starter = catalog.byId(fixture.state.chain[0]!.pokemon.id)!;
    expect(typeChainStarterCandidates(pokemon).some((entry) => entry.pokemon.id === starter.id)).toBe(true);
    expect(getValidTypeChainCandidates({ previousPokemon: starter, allowedPokemon: pokemon.filter((entry) => entry.generation === 1), usedPokemonIds: new Set([starter.id]) }).length).toBeGreaterThan(0);
    expect(selectTypeChainStarter([catalog.byId('charizard')!, catalog.byId('talonflame')!], () => 0)).toBeNull();
  });
  it('creates a shuffled permutation and only lets the current player act', () => {
    const fixture = setup(); expect(new Set(fixture.state.turnOrder)).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
    const other = fixture.state.turnOrder.find((id) => id !== fixture.state.currentPlayerId)!; expect(submit(fixture.state, other, 'staraptor', fixture.context).accepted).toBe(false);
  });
  it('rejects impossible configurations before opening a timer', () => {
    const impossibleCatalog: PokemonCatalog = { ...catalog, all: () => [pokemon[0]!, pokemon[2]!], forGenerations: () => [pokemon[0]!, pokemon[2]!], byId: (id) => [pokemon[0]!, pokemon[2]!].find((entry) => entry.id === id) };
    const context = { ...setup().context, pokemon: impossibleCatalog };
    expect(() => typeChainGame.createInitialState({ ...defaultTypeChainConfig, generations: [1] }, context)).toThrow(/No hay suficientes Pokémon/);
  });
});

describe('authoritative submissions, cooldown and atomic turns', () => {
  it('keeps the turn after an invalid public attempt and distinguishes zero/two/used errors', () => {
    const fixture = setup(); const current = fixture.state.currentPlayerId!; let state = forceChain(fixture.state, current, ['charizard']);
    let result = submit(state, current, 'blastoise', fixture.context); expect(result.accepted).toBe(true); expect(result.state.currentPlayerId).toBe(current); expect(result.state.invalidAttempts.at(-1)?.reason).toBe('NO_SHARED_TYPE');
    fixture.setNow(fixture.context.now + TYPE_CHAIN_INVALID_COOLDOWN_MS); state = result.state; result = submit(state, current, 'talonflame', fixture.context); expect(result.state.invalidAttempts.at(-1)?.reason).toBe('MULTIPLE_SHARED_TYPES');
    fixture.setNow(fixture.context.now + TYPE_CHAIN_INVALID_COOLDOWN_MS); result = submit(result.state, current, 'charizard', fixture.context); expect(result.state.invalidAttempts.at(-1)?.reason).toBe('ALREADY_USED');
  });
  it('enforces cooldown server-side without changing the current player', () => {
    const fixture = setup(); const current = fixture.state.currentPlayerId!; const state = forceChain(fixture.state, current, ['charizard']); const wrong = submit(state, current, 'blastoise', fixture.context);
    expect(wrong.state.cooldownUntil[current]).toBe(fixture.context.now + TYPE_CHAIN_INVALID_COOLDOWN_MS); expect(submit(wrong.state, current, 'arcanine', fixture.context).accepted).toBe(false); expect(wrong.state.currentPlayerId).toBe(current);
  });
  it('accepts one Pokémon atomically, appends the shared type and immediately starts the next timer', () => {
    const fixture = setup(); const current = fixture.state.currentPlayerId!; const priorDeadline = fixture.state.roundEndsAt; fixture.setNow(2_000);
    const result = submit(forceChain(fixture.state, current, ['charizard']), current, 'staraptor', fixture.context); expect(result.accepted).toBe(true); expect(result.state.chain.at(-1)).toMatchObject({ pokemon: { id: 'staraptor' }, playedBy: current, sharedType: 'flying' });
    expect(result.state.currentPlayerId).not.toBe(current); expect(result.state.roundEndsAt).toBe(2_000 + result.state.config.turnSeconds * 1_000); expect(result.state.roundEndsAt).not.toBe(priorDeadline);
    expect(submit(result.state, current, 'bibarel', fixture.context).accepted).toBe(false);
  });
  it('cycles through remaining players in order', () => {
    const fixture = setup(2); const first = fixture.state.currentPlayerId!; const second = fixture.state.turnOrder.find((id) => id !== first)!; let state = forceChain(fixture.state, first, ['charizard']);
    state = submit(state, first, 'staraptor', fixture.context).state; expect(state.currentPlayerId).toBe(second);
    state = submit(state, second, 'bibarel', fixture.context).state; expect(state.currentPlayerId).toBe(first);
  });
});

describe('blocking, elimination, presence and final results', () => {
  it('resets a blocked chain before the next turn without eliminating anyone', () => {
    const fixture = setup(3); const current = fixture.state.currentPlayerId!; const allExceptVulpix = fixture.state.poolIds.filter((id) => id !== 'vulpix');
    const state = forceChain(fixture.state, current, ['arcanine'], allExceptVulpix); const result = submit(state, current, 'vulpix', fixture.context).state;
    expect(result.activePlayerIds).toEqual(state.activePlayerIds); expect(result.eliminations).toEqual([]); expect(result.chain).toHaveLength(1); expect(result.usedPokemonIds).toEqual([result.chain[0]!.pokemon.id]);
    expect(result.events.at(-1)).toMatchObject({ kind: 'CHAIN_RESET', previousLength: 2 });
    const starter = catalog.byId(result.chain[0]!.pokemon.id)!; expect(getValidTypeChainCandidates({ previousPokemon: starter, allowedPokemon: pokemon.filter((entry) => result.poolIds.includes(entry.id)), usedPokemonIds: new Set(result.usedPokemonIds) }).length).toBeGreaterThan(0);
  });
  it('timeout eliminates the current player, removes the ghost turn and continues with the same reference', () => {
    const fixture = setup(3); const eliminated = fixture.state.currentPlayerId!; const reference = fixture.state.chain.at(-1)!.pokemon.id; fixture.setNow(fixture.state.roundEndsAt!);
    const state = typeChainGame.handleTimeout(fixture.state, fixture.context); expect(state.activePlayerIds).not.toContain(eliminated); expect(state.spectatorIds).toContain(eliminated); expect(state.currentPlayerId).not.toBe(eliminated); expect(state.chain.at(-1)!.pokemon.id).toBe(reference); expect(state.playerStats[eliminated]?.timeoutEliminations).toBe(1);
  });
  it('eliminates a disconnected current player immediately and restores safe spectator state', () => {
    const fixture = setup(3); const disconnected = fixture.state.currentPlayerId!; fixture.context.players.find((entry) => entry.id === disconnected)!.connected = false;
    const state = typeChainGame.handlePresenceChange!(fixture.state, fixture.context); expect(state.spectatorIds).toContain(disconnected); expect(state.currentPlayerId).not.toBe(disconnected);
    const publicState = typeChainGame.getPublicState(state, fixture.context); const privateState = typeChainGame.getPlayerState(state, disconnected, fixture.context); expect(publicState.chain).toEqual(state.chain); expect(privateState).toMatchObject({ eliminated: true, canSubmit: false });
  });
  it('finishes with one survivor and ranks eliminated players in reverse elimination order', () => {
    const fixture = setup(3); let state = fixture.state; const firstOut = state.currentPlayerId!; fixture.setNow(state.roundEndsAt!); state = typeChainGame.handleTimeout(state, fixture.context);
    const secondOut = state.currentPlayerId!; fixture.setNow(state.roundEndsAt!); state = typeChainGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('GAME_RESULTS'); expect(state.winnerId).toBe(state.activePlayerIds[0]);
    const results = typeChainGame.getResults(state); expect(results.standings.map((entry) => entry.playerId)).toEqual([state.winnerId, secondOut, firstOut]); expect(results.standings[0]!.points).toBeGreaterThan(results.standings[1]!.points); expect(results.standings[0]!.won).toBe(true);
  });
  it('uses valid turns and fewer errors only as the extraordinary max-turn failsafe', () => {
    const fixture = setup(2); const current = fixture.state.currentPlayerId!; const forced = { ...forceChain(fixture.state, current, ['charizard']), completedTurns: TYPE_CHAIN_MAX_TURNS - 1 };
    const state = submit(forced, current, 'staraptor', fixture.context).state; expect(state.phase).toBe('GAME_RESULTS'); expect(state.finishReason).toBe('MAX_TURNS'); expect(state.winnerId).toBe(current);
  });
});
