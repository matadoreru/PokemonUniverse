import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import { defaultTypeChainConfig } from './config.js';
import { TYPE_CHAIN_MIN_TYPE_POKEMON, getValidTypeChainCandidates, hasTypeChainType, typeChainEligibleTypes, typeChainRanking } from './rules.js';
import { TYPE_CHAIN_INVALID_COOLDOWN_MS, TYPE_CHAIN_MAX_TURNS, selectTypeChainType, typeChainGame } from './server.js';
import type { TypeChainNode, TypeChainState } from './types.js';

const data = { hp: 70, attack: 80, defense: 70, specialAttack: 80, specialDefense: 70, speed: 80, baseStatTotal: 450 };
const pokemon: Pokemon[] = [];
function mon(id: string, types: Pokemon['types'], generation = 1, isDefault = true): Pokemon { return { ...data, id, name: id.charAt(0).toUpperCase() + id.slice(1), types, generation, isDefault, nationalDexNumber: pokemon.length + 1, sprite: `/${id}.png` }; }
// Gen 1: 10 de fuego (uno fuego/volador) y 10 de agua (uno agua/eléctrico); el resto no llega al mínimo de un tipo.
pokemon.push(
  ...['charmander', 'charmeleon', 'vulpix', 'ninetales', 'growlithe', 'arcanine', 'ponyta', 'rapidash', 'magmar'].map((id) => mon(id, ['fire'])), mon('charizard', ['fire', 'flying']),
  ...['squirtle', 'wartortle', 'blastoise', 'psyduck', 'golduck', 'poliwag', 'seel', 'horsea', 'goldeen'].map((id) => mon(id, ['water'])), mon('lanturn', ['water', 'electric']),
  mon('pikachu', ['electric']), mon('pidgey', ['normal', 'flying']), mon('raichu-alola', ['electric', 'psychic'], 1, false), mon('lucario', ['fighting', 'steel'], 4),
);
const catalog: PokemonCatalog = { all: () => pokemon, byId: (id) => pokemon.find((entry) => entry.id === id), byDexNumber: (dex) => pokemon.find((entry) => entry.nationalDexNumber === dex), forGenerations: (generations, options) => pokemon.filter((entry) => generations.includes(entry.generation) && (options?.includeForms || entry.isDefault !== false)) };
const fire = pokemon.filter((entry) => entry.types.includes('fire')).map((entry) => entry.id);

function setup(playerCount = 4, random = () => 0, generations = [1]) {
  const players = Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon: catalog, now: 1_000, random, roomCode: 'ABC234' };
  let state = typeChainGame.createInitialState({ ...defaultTypeChainConfig, generations }, context); state = typeChainGame.start(state, context);
  return { state, context, setNow(now: number) { context.now = now; } };
}
const view = (entry: Pokemon) => ({ id: entry.id, name: entry.name, sprite: entry.sprite, types: [...entry.types] });
/** Cadena de fuego con `ids` ya nombrados por `currentPlayerId`, en su turno. */
function forceChain(state: TypeChainState, currentPlayerId: string, ids: string[] = []): TypeChainState {
  const chain: TypeChainNode[] = ids.map((id, index) => ({ pokemon: view(catalog.byId(id)!), playedBy: currentPlayerId, turnNumber: index + 1 }));
  return { ...state, phase: 'TURN_ACTIVE', currentPlayerId, chainType: 'fire', usedChainTypes: ['fire'], chain, usedPokemonIds: [...ids], roundEndsAt: 20_000 };
}
function submit(state: TypeChainState, playerId: string, pokemonId: string, context: GameContext) { return typeChainGame.handleAction(state, playerId, { type: 'SUBMIT_POKEMON', pokemonId }, context); }
function timeout(state: TypeChainState, fixture: ReturnType<typeof setup>) { fixture.setNow(state.roundEndsAt!); return typeChainGame.handleTimeout(state, fixture.context); }

describe('Type Chain: un tipo fijo por cadena', () => {
  it('vale cualquier Pokémon que tenga el tipo entre los suyos, en cualquier posición', () => {
    expect(hasTypeChainType(catalog.byId('charizard')!, 'fire')).toBe(true);
    expect(hasTypeChainType(catalog.byId('charizard')!, 'flying')).toBe(true);
    expect(hasTypeChainType(catalog.byId('blastoise')!, 'fire')).toBe(false);
  });
  it('solo pueden ser de cadena los tipos con el mínimo de Pokémon en el pool, en el orden canónico', () => {
    expect(TYPE_CHAIN_MIN_TYPE_POKEMON).toBe(10);
    expect(typeChainEligibleTypes(pokemon)).toEqual(['fire', 'water']);
    expect(typeChainEligibleTypes(pokemon.filter((entry) => entry.id !== 'magmar'))).toEqual(['water']);
  });
  it('filtra los candidatos del tipo que no se han usado', () => {
    const candidates = getValidTypeChainCandidates({ chainType: 'fire', allowedPokemon: pokemon, usedPokemonIds: new Set(['arcanine']) }).map((entry) => entry.id);
    expect(candidates).toContain('charizard'); expect(candidates).not.toContain('arcanine'); expect(candidates).not.toContain('blastoise');
  });
  it('elige el tipo nuevo al azar entre los que aún no han salido; si salieron todos, otro distinto del actual', () => {
    expect(selectTypeChainType(pokemon, [], null, () => 0)).toBe('fire');
    expect(selectTypeChainType(pokemon, [], null, () => 0.99)).toBe('water');
    expect(selectTypeChainType(pokemon, ['fire'], 'fire', () => 0)).toBe('water');
    expect(selectTypeChainType(pokemon, ['fire', 'water'], 'water', () => 0.99)).toBe('fire');
    expect(selectTypeChainType(pokemon.filter((entry) => !entry.types.includes('water')), ['fire'], 'fire', () => 0)).toBe('fire');
    expect(selectTypeChainType([catalog.byId('pikachu')!], [], null, () => 0)).toBeNull();
  });
});

describe('pool, primera cadena y orden de turnos', () => {
  it('usa las generaciones configuradas con sus formas y empieza con una cadena vacía de un tipo con Pokémon suficientes', () => {
    expect(defaultTypeChainConfig.turnSeconds).toBe(15); const fixture = setup();
    expect(fixture.state.poolIds).toContain('raichu-alola'); expect(fixture.state.poolIds).not.toContain('lucario'); expect(new Set(fixture.state.poolIds).size).toBe(fixture.state.poolIds.length);
    expect(fixture.state).toMatchObject({ phase: 'TURN_ACTIVE', chainNumber: 1, chainType: 'fire', usedChainTypes: ['fire'], chain: [], usedPokemonIds: [], turnNumber: 1 });
    expect(typeChainGame.getPublicState(fixture.state, fixture.context)).toMatchObject({ chainType: 'fire', chain: [] });
  });
  it('crea una permutación barajada y solo deja actuar al jugador del turno', () => {
    const fixture = setup(); expect(new Set(fixture.state.turnOrder)).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
    const other = fixture.state.turnOrder.find((id) => id !== fixture.state.currentPlayerId)!; expect(submit(fixture.state, other, 'vulpix', fixture.context)).toMatchObject({ accepted: false, error: 'No es tu turno.' });
  });
  it('rechaza una configuración sin ningún tipo con Pokémon suficientes antes de abrir un turno', () => {
    const few = pokemon.slice(0, 5); const impossibleCatalog: PokemonCatalog = { ...catalog, all: () => few, forGenerations: () => few, byId: (id) => few.find((entry) => entry.id === id) };
    const context = { ...setup().context, pokemon: impossibleCatalog };
    expect(() => typeChainGame.createInitialState({ ...defaultTypeChainConfig, generations: [1] }, context)).toThrow(/No hay suficientes Pokémon/);
  });
});

describe('envíos con autoridad, espera y turnos atómicos', () => {
  it('mantiene el turno tras un intento público que no vale y distingue otro tipo, ya usado y fuera del pool', () => {
    const fixture = setup(); const current = fixture.state.currentPlayerId!; const state = forceChain(fixture.state, current, ['vulpix']);
    let result = submit(state, current, 'blastoise', fixture.context); expect(result.accepted).toBe(true); expect(result.state.currentPlayerId).toBe(current); expect(result.state.invalidAttempts.at(-1)?.reason).toBe('WRONG_TYPE');
    fixture.setNow(fixture.context.now + TYPE_CHAIN_INVALID_COOLDOWN_MS); result = submit(result.state, current, 'vulpix', fixture.context); expect(result.state.invalidAttempts.at(-1)?.reason).toBe('ALREADY_USED');
    fixture.setNow(fixture.context.now + TYPE_CHAIN_INVALID_COOLDOWN_MS); result = submit(result.state, current, 'lucario', fixture.context); expect(result.state.invalidAttempts.at(-1)?.reason).toBe('OUT_OF_POOL');
    expect(result.state.lastAttempt[current]).toMatchObject({ reason: 'OUT_OF_POOL', pokemonName: 'Lucario' }); expect(result.state.playerStats[current]?.invalidAttempts).toBe(3);
  });
  it('aplica la espera en el servidor sin cambiar de jugador', () => {
    const fixture = setup(); const current = fixture.state.currentPlayerId!; const wrong = submit(forceChain(fixture.state, current), current, 'blastoise', fixture.context);
    expect(wrong.state.cooldownUntil[current]).toBe(fixture.context.now + TYPE_CHAIN_INVALID_COOLDOWN_MS); expect(submit(wrong.state, current, 'arcanine', fixture.context).accepted).toBe(false); expect(wrong.state.currentPlayerId).toBe(current);
  });
  it('acepta un Pokémon del tipo (también con otro tipo más), lo añade a la cadena y abre el siguiente turno', () => {
    const fixture = setup(); const current = fixture.state.currentPlayerId!; fixture.setNow(2_000);
    const result = submit(forceChain(fixture.state, current), current, 'charizard', fixture.context); expect(result.accepted).toBe(true);
    expect(result.state.chain).toEqual([{ pokemon: view(catalog.byId('charizard')!), playedBy: current, turnNumber: fixture.state.turnNumber }]);
    expect(result.state.events.at(-1)).toEqual({ kind: 'SUCCESS', playerId: current, pokemon: view(catalog.byId('charizard')!), chainType: 'fire', at: 2_000 });
    expect(result.state.playerStats[current]).toMatchObject({ validSubmissions: 1, turnsSurvived: 1 });
    expect(result.state.currentPlayerId).not.toBe(current); expect(result.state.roundEndsAt).toBe(2_000 + result.state.config.turnSeconds * 1_000);
    expect(submit(result.state, current, 'vulpix', fixture.context).accepted).toBe(false);
  });
  it('recorre a los jugadores en su orden', () => {
    const fixture = setup(2); const first = fixture.state.currentPlayerId!; const second = fixture.state.turnOrder.find((id) => id !== first)!; let state = forceChain(fixture.state, first);
    state = submit(state, first, 'vulpix', fixture.context).state; expect(state.currentPlayerId).toBe(second);
    state = submit(state, second, 'ponyta', fixture.context).state; expect(state.currentPlayerId).toBe(first);
  });
});

describe('tipo agotado, eliminación, presencia y clasificación', () => {
  it('si no queda ningún Pokémon sin usar del tipo, empieza otra cadena con otro tipo sin eliminar a nadie', () => {
    const fixture = setup(3); const current = fixture.state.currentPlayerId!; const state = forceChain(fixture.state, current, fire.filter((id) => id !== 'magmar'));
    const result = submit(state, current, 'magmar', fixture.context).state;
    expect(result.activePlayerIds).toEqual(state.activePlayerIds); expect(result.eliminations).toEqual([]);
    expect(result).toMatchObject({ chainNumber: 2, chainType: 'water', usedChainTypes: ['fire', 'water'], chain: [], usedPokemonIds: [], longestChain: 10 });
    expect(result.events.at(-1)).toMatchObject({ kind: 'CHAIN_RESET', previousLength: 10, previousType: 'fire', chainType: 'water' });
    expect(result.currentPlayerId).not.toBe(current);
  });
  it('agotar el tiempo elimina al jugador del turno y la cadena sigue con el mismo tipo', () => {
    const fixture = setup(3); const eliminated = fixture.state.currentPlayerId!;
    const state = timeout(fixture.state, fixture); expect(state.activePlayerIds).not.toContain(eliminated); expect(state.spectatorIds).toContain(eliminated); expect(state.currentPlayerId).not.toBe(eliminated);
    expect(state.chainType).toBe(fixture.state.chainType); expect(state.chainNumber).toBe(1); expect(state.playerStats[eliminated]?.timeoutEliminations).toBe(1);
  });
  it('elimina en el acto al jugador del turno que se desconecta', () => {
    const fixture = setup(3); const disconnected = fixture.state.currentPlayerId!; fixture.context.players.find((entry) => entry.id === disconnected)!.connected = false;
    const state = typeChainGame.handlePresenceChange!(fixture.state, fixture.context); expect(state.spectatorIds).toContain(disconnected); expect(state.currentPlayerId).not.toBe(disconnected);
    expect(typeChainGame.getPlayerState(state, disconnected, fixture.context)).toMatchObject({ eliminated: true, canSubmit: false });
  });
  it('clasifica por Pokémon nombrados aunque el que más nombró cayera antes', () => {
    const fixture = setup(3); const [a, b, c] = fixture.state.turnOrder as [string, string, string];
    let state = forceChain(fixture.state, a); fixture.setNow(2_000);
    state = submit(state, a, 'vulpix', fixture.context).state; state = submit(state, b, 'ponyta', fixture.context).state; state = submit(state, c, 'magmar', fixture.context).state;
    state = submit(state, a, 'arcanine', fixture.context).state; // a: 2, b: 1, c: 1; turno de b.
    state = timeout(state, fixture); // cae b
    state = submit(state, c, 'charizard', fixture.context).state; // c: 2; turno de a.
    state = timeout(state, fixture); // cae a: queda c.
    expect(state).toMatchObject({ phase: 'GAME_RESULTS', finishReason: 'SURVIVOR', winnerId: c });
    const results = typeChainGame.getResults(state); expect(results.standings.map((entry) => [entry.playerId, entry.position])).toEqual([[c, 1], [a, 2], [b, 3]]);
    expect(results.standings[0]!.won).toBe(true); expect(results.standings[0]!.points).toBeGreaterThan(results.standings[1]!.points);
  });
  it('quien nombra más gana aunque no sea el superviviente; a igualdad, gana quien aguantó más', () => {
    const fixture = setup(2); const [a, b] = fixture.state.turnOrder as [string, string];
    let state = submit(forceChain(fixture.state, a), a, 'vulpix', fixture.context).state; // a: 1; turno de b.
    state = timeout(state, fixture); // b cae con 0: gana a.
    expect(state.winnerId).toBe(a);
    let tie = timeout(forceChain(fixture.state, a), fixture); // a cae con 0, b sigue con 0: el empate lo deshace la supervivencia.
    expect(tie.winnerId).toBe(b); expect(typeChainRanking(tie)).toEqual([{ playerId: b, position: 1 }, { playerId: a, position: 2 }]);
    tie = { ...forceChain(fixture.state, a), completedTurns: TYPE_CHAIN_MAX_TURNS - 1, playerStats: { [a]: { validSubmissions: 3, invalidAttempts: 0, turnsSurvived: 3, timeoutEliminations: 0 }, [b]: { validSubmissions: 4, invalidAttempts: 0, turnsSurvived: 4, timeoutEliminations: 0 } } };
    fixture.setNow(2_000); const capped = submit(tie, a, 'vulpix', fixture.context).state; // a llega a 4: empate total entre dos en pie.
    expect(capped).toMatchObject({ phase: 'GAME_RESULTS', finishReason: 'MAX_TURNS', winnerId: null });
    expect(typeChainRanking(capped).map((entry) => entry.position)).toEqual([1, 1]);
  });
});
