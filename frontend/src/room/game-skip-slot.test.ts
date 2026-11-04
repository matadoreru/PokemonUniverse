import { describe, expect, it } from 'vitest';
import { skipRowInLayout } from './game-skip-slot';

const skip = { gameInstanceId: 'g1', votes: 0, requiredVotes: 2, currentUserVoted: false, canVote: true } as never;
const base = { phase: 'ROUND_ACTIVE', gameIntro: null, gameSkipState: skip, selectedGameId: 'future-minigame', game: { gameId: 'future-minigame' } } as never;

describe('skipRowInLayout', () => {
  it('pone la fila encima de los juegos sin rediseñar', () => {
    expect(skipRowInLayout(base)).toBe(true);
  });
  it('sin votación no hay fila', () => {
    expect(skipRowInLayout({ ...(base as object), gameSkipState: null } as never)).toBe(false);
  });
  it('en la intro va dentro de su pantalla', () => {
    expect(skipRowInLayout({ ...(base as object), phase: 'GAME_STARTING', gameIntro: { gameInstanceId: 'g1' } } as never)).toBe(false);
  });
  it('Shiny Quiz también la lleva dentro salvo en los resultados', () => {
    const shiny = { ...(base as object), selectedGameId: 'shiny-vote', game: { gameId: 'shiny-vote' } };
    expect(skipRowInLayout(shiny as never)).toBe(false);
    expect(skipRowInLayout({ ...shiny, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...shiny, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Type Duel la lleva dentro de su pantalla salvo en los resultados', () => {
    const duel = { ...(base as object), selectedGameId: 'type-duel', game: { gameId: 'type-duel' } };
    expect(skipRowInLayout(duel as never)).toBe(false);
    expect(skipRowInLayout({ ...duel, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...duel, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Learnset Guess la lleva dentro de su pantalla salvo en los resultados', () => {
    const learnset = { ...(base as object), selectedGameId: 'learnset-guess', game: { gameId: 'learnset-guess' } };
    expect(skipRowInLayout(learnset as never)).toBe(false);
    expect(skipRowInLayout({ ...learnset, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...learnset, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('¿Quién es ese Pokémon? la lleva dentro de su pantalla salvo en los resultados', () => {
    const whos = { ...(base as object), selectedGameId: 'whos-that-pokemon', game: { gameId: 'whos-that-pokemon' } };
    expect(skipRowInLayout(whos as never)).toBe(false);
    expect(skipRowInLayout({ ...whos, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...whos, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Zoomed Pokémon la lleva dentro de su pantalla salvo en los resultados', () => {
    const zoomed = { ...(base as object), selectedGameId: 'zoomed-pokemon', game: { gameId: 'zoomed-pokemon' } };
    expect(skipRowInLayout(zoomed as never)).toBe(false);
    expect(skipRowInLayout({ ...zoomed, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...zoomed, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Adivina por la Paleta la lleva dentro de su pantalla salvo en los resultados', () => {
    const palette = { ...(base as object), selectedGameId: 'pokemon-palette-guess', game: { gameId: 'pokemon-palette-guess' } };
    expect(skipRowInLayout(palette as never)).toBe(false);
    expect(skipRowInLayout({ ...palette, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...palette, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Adivina el Grito la lleva dentro de su pantalla salvo en los resultados', () => {
    const cry = { ...(base as object), selectedGameId: 'pokemon-cry-quiz', game: { gameId: 'pokemon-cry-quiz' } };
    expect(skipRowInLayout(cry as never)).toBe(false);
    expect(skipRowInLayout({ ...cry, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...cry, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokédex Entry Guess la lleva dentro de su pantalla salvo en los resultados', () => {
    const entry = { ...(base as object), selectedGameId: 'pokedex-entry-guess', game: { gameId: 'pokedex-entry-guess' } };
    expect(skipRowInLayout(entry as never)).toBe(false);
    expect(skipRowInLayout({ ...entry, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...entry, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Guess from Stats la lleva dentro de su pantalla salvo en los resultados', () => {
    const stats = { ...(base as object), selectedGameId: 'guess-from-stats', game: { gameId: 'guess-from-stats' } };
    expect(skipRowInLayout(stats as never)).toBe(false);
    expect(skipRowInLayout({ ...stats, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...stats, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokédle Race la lleva dentro de su pantalla salvo en los resultados', () => {
    const race = { ...(base as object), selectedGameId: 'pokeddle-race', game: { gameId: 'pokeddle-race' } };
    expect(skipRowInLayout(race as never)).toBe(false);
    expect(skipRowInLayout({ ...race, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...race, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Type Chain la lleva dentro de su pantalla salvo en los resultados', () => {
    const chain = { ...(base as object), selectedGameId: 'type-chain', game: { gameId: 'type-chain' } };
    expect(skipRowInLayout(chain as never)).toBe(false);
    expect(skipRowInLayout({ ...chain, phase: 'TURN_ACTIVE' } as never)).toBe(false);
    expect(skipRowInLayout({ ...chain, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokémon Trivia la lleva dentro de su pantalla salvo en los resultados', () => {
    const trivia = { ...(base as object), selectedGameId: 'pokemon-trivia', game: { gameId: 'pokemon-trivia' } };
    expect(skipRowInLayout(trivia as never)).toBe(false);
    expect(skipRowInLayout({ ...trivia, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...trivia, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Higher or Lower: Cartas la lleva dentro de su pantalla salvo en los resultados', () => {
    const tcg = { ...(base as object), selectedGameId: 'tcg-higher-lower', game: { gameId: 'tcg-higher-lower' } };
    expect(skipRowInLayout(tcg as never)).toBe(false);
    expect(skipRowInLayout({ ...tcg, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...tcg, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokémon Connections la lleva dentro de su pantalla salvo en los resultados', () => {
    const connections = { ...(base as object), selectedGameId: 'pokemon-connections', game: { gameId: 'pokemon-connections' } };
    expect(skipRowInLayout(connections as never)).toBe(false);
    expect(skipRowInLayout({ ...connections, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...connections, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokémon Bingo la lleva dentro de su pantalla salvo en los resultados', () => {
    const bingo = { ...(base as object), selectedGameId: 'pokemon-bingo', game: { gameId: 'pokemon-bingo' } };
    expect(skipRowInLayout(bingo as never)).toBe(false);
    expect(skipRowInLayout({ ...bingo, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...bingo, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Most Likely To la lleva dentro de su pantalla en todas sus fases salvo en los resultados', () => {
    const mostLikely = { ...(base as object), selectedGameId: 'most-likely-to', game: { gameId: 'most-likely-to' } };
    for (const phase of ['ROUND_ACTIVE', 'VOTING', 'REVOTE', 'ROUND_RESULTS']) expect(skipRowInLayout({ ...mostLikely, phase } as never)).toBe(false);
    expect(skipRowInLayout({ ...mostLikely, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokémon Red Flag la lleva dentro de su pantalla en todas sus fases salvo en los resultados', () => {
    const redFlag = { ...(base as object), selectedGameId: 'pokemon-red-flag', game: { gameId: 'pokemon-red-flag' } };
    for (const phase of ['ROUND_ACTIVE', 'VOTING', 'REVOTE', 'ROUND_RESULTS']) expect(skipRowInLayout({ ...redFlag, phase } as never)).toBe(false);
    expect(skipRowInLayout({ ...redFlag, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Would You Rather la lleva dentro de su pantalla en la ronda y la revelación, no en los resultados', () => {
    const wyr = { ...(base as object), selectedGameId: 'would-you-rather', game: { gameId: 'would-you-rather' } };
    for (const phase of ['ROUND_ACTIVE', 'ROUND_RESULTS']) expect(skipRowInLayout({ ...wyr, phase } as never)).toBe(false);
    expect(skipRowInLayout({ ...wyr, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('One of Us Is Fake la lleva dentro de su pantalla en todas sus fases salvo en los resultados', () => {
    const fake = { ...(base as object), selectedGameId: 'one-of-us-is-fake', game: { gameId: 'one-of-us-is-fake' } };
    for (const phase of ['ROUND_ACTIVE', 'CHOICE_REVEAL', 'DISCUSSION', 'REVOTE', 'ROUND_RESULTS']) expect(skipRowInLayout({ ...fake, phase } as never)).toBe(false);
    expect(skipRowInLayout({ ...fake, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Secret Ranking la lleva dentro de su pantalla al ordenar y en la revelación, no en los resultados', () => {
    const ranking = { ...(base as object), selectedGameId: 'secret-ranking', game: { gameId: 'secret-ranking' } };
    for (const phase of ['ROUND_ACTIVE', 'ROUND_RESULTS']) expect(skipRowInLayout({ ...ranking, phase } as never)).toBe(false);
    expect(skipRowInLayout({ ...ranking, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Poké Taboo la lleva dentro de su pantalla en el turno y en la revelación, no en los resultados', () => {
    const taboo = { ...(base as object), selectedGameId: 'poke-taboo', game: { gameId: 'poke-taboo' } };
    for (const phase of ['ROUND_ACTIVE', 'ROUND_RESULTS']) expect(skipRowInLayout({ ...taboo, phase } as never)).toBe(false);
    expect(skipRowInLayout({ ...taboo, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Sketchmon la lleva dentro de su pantalla al dibujar y en la revelación, no en los resultados', () => {
    const sketch = { ...(base as object), selectedGameId: 'sketchmon', game: { gameId: 'sketchmon' } };
    for (const phase of ['ROUND_ACTIVE', 'ROUND_RESULTS']) expect(skipRowInLayout({ ...sketch, phase } as never)).toBe(false);
    expect(skipRowInLayout({ ...sketch, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokémon Team Auction la lleva dentro de su pantalla mientras se puja, no en los resultados', () => {
    const auction = { ...(base as object), selectedGameId: 'pokemon-team-auction', game: { gameId: 'pokemon-team-auction' } };
    expect(skipRowInLayout({ ...auction, phase: 'ROUND_ACTIVE' } as never)).toBe(false);
    expect(skipRowInLayout({ ...auction, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokémon Bluff Auction la lleva dentro de su pantalla en la subasta, la demostración y el resultado de ronda, no en los resultados', () => {
    const bluff = { ...(base as object), selectedGameId: 'pokemon-bluff-auction', game: { gameId: 'pokemon-bluff-auction' } };
    for (const phase of ['ROUND_ACTIVE', 'POKEMON_SEARCH', 'ROUND_RESULTS']) expect(skipRowInLayout({ ...bluff, phase } as never)).toBe(false);
    expect(skipRowInLayout({ ...bluff, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Quién es Quién la lleva dentro de su pantalla en los turnos, no en los resultados', () => {
    const who = { ...(base as object), selectedGameId: 'who-is-who-pokemon', game: { gameId: 'who-is-who-pokemon' } };
    expect(skipRowInLayout({ ...who, phase: 'TURN_ACTIVE' } as never)).toBe(false);
    expect(skipRowInLayout({ ...who, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
  it('Pokédex Distance la lleva dentro de su pantalla salvo en los resultados', () => {
    const distance = { ...(base as object), selectedGameId: 'pokedex-distance', game: { gameId: 'pokedex-distance' } };
    expect(skipRowInLayout(distance as never)).toBe(false);
    expect(skipRowInLayout({ ...distance, phase: 'ROUND_RESULTS' } as never)).toBe(false);
    expect(skipRowInLayout({ ...distance, phase: 'GAME_RESULTS' } as never)).toBe(true);
  });
});
