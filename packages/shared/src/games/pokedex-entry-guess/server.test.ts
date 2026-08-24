import { describe, expect, it } from 'vitest';
import type { GameContext, PokedexEntry, PokedexEntryPokemonCatalog, Pokemon } from '../../index.js';
import { defaultPokedexEntryGuessConfig } from './config.js';
import { buildPokedexEntryHints, pokedexEntryReferenceGeneration, pokedexEntryRoundPoints, resolvePokedexEntry, sanitizePokedexEntry } from './rules.js';
import { POKEDEX_ENTRY_GUESS_COOLDOWN_MS, POKEDEX_ENTRY_GUESS_REVEAL_MS, pokedexEntryCandidatePool, pokedexEntryGuessGame } from './server.js';
import type { PokedexEntryGuessState } from './types.js';

const stats = { hp: 50, attack: 60, defense: 50, specialAttack: 70, specialDefense: 60, speed: 80, baseStatTotal: 370 };
function mon(id: string, dex: number, name: string, generation: number, types: Pokemon['types'], extra: Partial<Pokemon> = {}): Pokemon {
  return { ...stats, id, nationalDexNumber: dex, name, generation, isDefault: true, sprite: `/sprites/${id}.png`, types, evolutionStage: 1, evolutionStageCount: 2, legendaryStatus: 'NORMAL', names: { es: name }, ...extra };
}
function entry(pokemonId: string, generation: number, version: string, text: string): PokedexEntry {
  return { pokemonId, generation: generation as PokedexEntry['generation'], version, versionLabel: `Pokémon ${version}`, language: 'es', text };
}

const pokemon = [
  mon('pikachu', 25, 'Pikachu', 1, ['electric'], { evolutionStage: 2, evolutionStageCount: 3 }),
  mon('mr-mime', 122, 'Mr. Mime', 1, ['psychic', 'fairy']),
  mon('absol', 359, 'Absol', 3, ['dark'], { evolutionStage: 1, evolutionStageCount: 1 }),
  mon('vulpix-alola', 37, 'Vulpix de Alola', 1, ['ice'], { isDefault: false }),
  mon('missing', 999, 'Missing', 3, ['normal']),
];
const entries = [
  entry('pikachu', 1, 'yellow', 'PIKACHU almacena electricidad en sus mejillas.'),
  entry('pikachu', 3, 'emerald', 'Si Pikachu se enfada, libera la energía acumulada.'),
  entry('pikachu', 4, 'diamond', 'Pikachu vive en grupos.'),
  entry('mr-mime', 1, 'yellow', 'Mr. Mime crea paredes invisibles.'),
  entry('absol', 3, 'emerald', 'Se dice que Absol aparece para advertir de catástrofes.'),
  entry('absol', 3, 'ruby', 'Absol detecta cambios sutiles en el entorno.'),
  entry('vulpix-alola', 7, 'sun', 'Vulpix de Alola vive en montañas nevadas.'),
];
const catalog: PokedexEntryPokemonCatalog = {
  all: () => pokemon, byId: (id) => pokemon.find((item) => item.id === id), byDexNumber: (dex) => pokemon.find((item) => item.nationalDexNumber === dex && item.isDefault !== false),
  forGenerations: (generations, options) => pokemon.filter((item) => generations.includes(item.generation) && (options?.includeForms || item.isDefault !== false)),
  pokedexEntries: (pokemonId) => entries.filter((item) => item.pokemonId === pokemonId),
};

function setup(overrides: Partial<typeof defaultPokedexEntryGuessConfig> = {}, random = () => 0, playerCount = 2) {
  const players = Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `Player ${index + 1}`, connected: true, active: true }));
  const context: GameContext = { players, pokemon: catalog, now: 1_000, random, roomCode: 'ABC234' };
  const config = { ...defaultPokedexEntryGuessConfig, generations: [1, 3], rounds: 2, ...overrides };
  let state = pokedexEntryGuessGame.createInitialState(config, context); state = pokedexEntryGuessGame.start(state, context);
  return { state, context, setNow(now: number) { context.now = now; } };
}
function guess(state: PokedexEntryGuessState, playerId: string, pokemonId: string, context: GameContext) { return pokedexEntryGuessGame.handleAction(state, playerId, { type: 'GUESS_POKEMON', pokemonId }, context); }

describe('Pokédex Entry Guess selection and Spanish entry resolution', () => {
  it('uses generation 9/25 seconds/10 rounds/hints off defaults and the highest selected reference', () => {
    expect(defaultPokedexEntryGuessConfig).toMatchObject({ roundSeconds: 25, rounds: 10, hintsEnabled: false });
    expect(pokedexEntryReferenceGeneration([1, 2, 4, 7])).toBe(7);
  });

  it('uses the reference generation, falls back backwards and never selects a future entry', () => {
    expect(resolvePokedexEntry(entries.filter((item) => item.pokemonId === 'pikachu'), 3, () => 0)?.version).toBe('emerald');
    expect(resolvePokedexEntry(entries.filter((item) => item.pokemonId === 'pikachu'), 2, () => 0)?.version).toBe('yellow');
    expect(resolvePokedexEntry(entries.filter((item) => item.pokemonId === 'pikachu'), 2, () => 0)?.generation).toBe(1);
  });

  it('selects deterministically among multiple Spanish entries at the newest eligible generation', () => {
    const absolEntries = entries.filter((item) => item.pokemonId === 'absol');
    expect(resolvePokedexEntry(absolEntries, 3, () => 0)?.version).toBe('emerald');
    expect(resolvePokedexEntry(absolEntries, 3, () => 0.999)?.version).toBe('ruby');
    expect(resolvePokedexEntry(absolEntries, 3, () => 0)?.language).toBe('es');
  });

  it('excludes Pokémon without an entry and every form lacking the supported distinct-entry policy', () => {
    const fixture = setup(); const ids = pokedexEntryCandidatePool(fixture.state.config, fixture.context).map((candidate) => candidate.pokemon.id);
    expect(ids).not.toContain('missing'); expect(ids).not.toContain('vulpix-alola');
  });

  it('prepares all rounds and avoids repeating a target while the pool has alternatives', () => {
    const fixture = setup({ rounds: 3 });
    expect(fixture.state.roundDeck).toHaveLength(3);
    expect(new Set(fixture.state.roundDeck.slice(0, 3).map((target) => target.pokemonId)).size).toBe(3);
  });
});

describe('server-side sanitization and public secrecy', () => {
  it('removes names case-insensitively while preserving the rest of the official text', () => {
    expect(sanitizePokedexEntry('PIKACHU almacena electricidad. A Pikachu le brillan las mejillas.', pokemon[0]!)).toBe('??? almacena electricidad. A ??? le brillan las mejillas.');
  });

  it('handles compound names and punctuation safely', () => {
    expect(sanitizePokedexEntry('MR. MIME crea paredes. Mr Mime también baila.', pokemon[1]!)).toBe('??? crea paredes. ??? también baila.');
  });

  it('never projects target id, name, sprite or raw answer on the active WebSocket state', () => {
    const fixture = setup(); const target = fixture.state.roundDeck[0]!; const view = pokedexEntryGuessGame.getPublicState(fixture.state, fixture.context); const privateView = pokedexEntryGuessGame.getPlayerState(fixture.state, 'p1', fixture.context);
    const serialized = JSON.stringify({ view, privateView });
    expect(serialized).not.toContain(target.pokemonId); expect(serialized).not.toContain(`/sprites/${target.pokemonId}.png`);
    expect(view.entryText).toContain('???'); expect(view.hints).toEqual([]);
  });
});

describe('authoritative attempts, order and points', () => {
  it('allows multiple public incorrect attempts and enforces cooldown on the server', () => {
    const fixture = setup(); const target = fixture.state.roundDeck[0]!.pokemonId; const wrongId = pokemon.find((item) => item.id !== target && item.isDefault !== false && fixture.state.config.generations.includes(item.generation))!.id;
    let result = guess(fixture.state, 'p1', wrongId, fixture.context); expect(result.accepted).toBe(true); expect(result.state.attempts[0]).toMatchObject({ playerId: 'p1', guessedPokemon: { id: wrongId } });
    expect(guess(result.state, 'p1', wrongId, fixture.context).accepted).toBe(false);
    fixture.setNow(fixture.context.now + POKEDEX_ENTRY_GUESS_COOLDOWN_MS); result = guess(result.state, 'p1', wrongId, fixture.context); expect(result.accepted).toBe(true); expect(result.state.attempts).toHaveLength(2);
  });

  it('assigns solve order in server processing order, hides the correct guess and awards dynamic position points', () => {
    const fixture = setup(); const target = fixture.state.roundDeck[0]!.pokemonId; fixture.setNow(2_000);
    let state = guess(fixture.state, 'p2', target, fixture.context).state; state = guess(state, 'p1', target, fixture.context).state;
    expect(state.solves.p2).toMatchObject({ solveOrder: 1, points: 4 }); expect(state.solves.p1).toMatchObject({ solveOrder: 2, points: 2 });
    expect(pokedexEntryRoundPoints(8, 1)).toBeGreaterThan(pokedexEntryRoundPoints(8, 2));
    const activeProjection = { ...state, phase: 'ROUND_ACTIVE' as const, lastRound: null };
    expect(JSON.stringify(pokedexEntryGuessGame.getPublicState(activeProjection, fixture.context))).not.toContain(target);
  });

  it('locks solved players and rejects spectators, disconnected players and forms', () => {
    const fixture = setup(); const target = fixture.state.roundDeck[0]!.pokemonId; const state = guess(fixture.state, 'p1', target, fixture.context).state;
    expect(guess(state, 'p1', target, fixture.context).accepted).toBe(false); expect(guess(state, 'spectator', target, fixture.context).accepted).toBe(false);
    fixture.context.players[1]!.connected = false; expect(guess(state, 'p2', target, fixture.context).accepted).toBe(false);
    fixture.context.players[1]!.connected = true; expect(guess(state, 'p2', 'vulpix-alola', fixture.context).accepted).toBe(false);
  });
});

describe('round lifecycle, hints, reconnection and results', () => {
  it('shows configured simple hints from the first second without name or sprite', () => {
    const fixture = setup({ hintsEnabled: true, hints: { generation: true, type: true, evolution: true, typeCount: true, category: true } }); const target = catalog.byId(fixture.state.roundDeck[0]!.pokemonId)!;
    const hints = buildPokedexEntryHints(target, fixture.state.config); expect(hints.map((hint) => hint.kind)).toEqual(['GENERATION', 'TYPE', 'EVOLUTION', 'TYPE_COUNT', 'CATEGORY']); expect(JSON.stringify(hints)).not.toMatch(/name|sprite/i);
    expect(pokedexEntryGuessGame.getPublicState(fixture.state, fixture.context).hints).toEqual(hints);
  });

  it('ends early when all connected players solve and a disconnect never blocks', () => {
    const fixture = setup(); const target = fixture.state.roundDeck[0]!.pokemonId; fixture.context.players[1]!.connected = false;
    const state = guess(fixture.state, 'p1', target, fixture.context).state; expect(state.phase).toBe('ROUND_RESULTS');
  });

  it('times out unsolved players, reveals for four seconds and advances to a different prepared target', () => {
    const fixture = setup(); const first = fixture.state.roundDeck[0]!.pokemonId; fixture.setNow(fixture.state.roundEndsAt!);
    let state = pokedexEntryGuessGame.handleTimeout(fixture.state, fixture.context); expect(state.phase).toBe('ROUND_RESULTS'); expect(state.playerStats.p1?.missed).toBe(1); expect(state.nextTransitionAt).toBe(fixture.context.now + POKEDEX_ENTRY_GUESS_REVEAL_MS);
    const reveal = pokedexEntryGuessGame.getPublicState(state, fixture.context); expect(reveal.lastRound?.pokemon.name).toBe(catalog.byId(first)?.name); expect(reveal.lastRound?.entry.versionLabel).toBeTruthy();
    fixture.setNow(state.nextTransitionAt!); state = pokedexEntryGuessGame.handleTimeout(state, fixture.context); expect(state.phase).toBe('ROUND_ACTIVE'); expect(state.roundDeck[1]!.pokemonId).not.toBe(first);
  });

  it('restores entry, attempts, solve order, timer and lock without leaking the target', () => {
    const fixture = setup(); const target = fixture.state.roundDeck[0]!.pokemonId; fixture.setNow(2_000); const state = guess(fixture.state, 'p1', target, fixture.context).state;
    const restored = { game: pokedexEntryGuessGame.getPublicState(state, fixture.context), player: pokedexEntryGuessGame.getPlayerState(state, 'p1', fixture.context) };
    expect(restored).toMatchObject({ game: { roundNumber: 1, roundEndsAt: expect.any(Number), solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }, player: { solved: true, canGuess: false, solveOrder: 1 } });
    expect(JSON.stringify(restored)).not.toContain(target);
  });

  it('finishes with aggregate statistics and deterministic tie breakers', () => {
    const fixture = setup({ rounds: 1 }); const target = fixture.state.roundDeck[0]!.pokemonId; fixture.setNow(2_000);
    let state = guess(fixture.state, 'p1', target, fixture.context).state; fixture.setNow(3_000); state = guess(state, 'p2', target, fixture.context).state;
    fixture.setNow(state.nextTransitionAt!); state = pokedexEntryGuessGame.handleTimeout(state, fixture.context); const results = pokedexEntryGuessGame.getResults(state);
    expect(results.standings.map((standing) => standing.playerId)).toEqual(['p1', 'p2']);
    expect(results.standings[0]?.stats).toMatchObject({ correct: 1, missed: 0, totalAttempts: 1, firstTry: 1, roundFirsts: 1, bestTimeMs: 1000, pointsFromRounds: 4 });
  });
});
