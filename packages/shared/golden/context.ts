// Contexto de motor de una fixture dorada: el mismo que monta GoldenContexts.java en el replayer. Cada catálogo
// opcional solo aparece si el escenario lo trae, para que un motor distinga "sin catálogo" de "catálogo vacío".
import { compareTcgPrices } from '../dist/index.js';
import type {
  GameContext, PokemonAudioCatalog, PokemonCatalog, PokemonCryVersion, PokemonVisualCatalog, TcgCardCatalog, TcgComparableCard,
} from '../dist/index.js';
import { mulberry32 } from './prng.js';
import type { GoldenContextData, GoldenScenario } from './types.js';

function visualCatalog(assets: NonNullable<GoldenContextData['pokemonVisuals']>): PokemonVisualCatalog {
  return {
    artworkFor: (pokemonId) => assets[pokemonId] ?? null,
    artworkPokemonIds: () => Object.keys(assets),
  };
}

function audioCatalog(cries: NonNullable<GoldenContextData['pokemonAudio']>): PokemonAudioCatalog {
  const cryFor = (pokemonId: string, version: PokemonCryVersion): string | null => {
    const entry = cries[pokemonId];
    return (version === 'LATEST' ? entry?.latest : entry?.legacy) ?? null;
  };
  return {
    cryFor,
    pokemonIds: (version) => Object.keys(cries).filter((pokemonId) =>
      version ? cryFor(pokemonId, version) !== null : cryFor(pokemonId, 'LATEST') !== null || cryFor(pokemonId, 'LEGACY') !== null),
  };
}

/**
 * Filtrado de `comparable-price.ts` sobre cartas ya comparables: sets, rarezas y límites de precio comparados como
 * decimales. Las generaciones no se filtran (`TcgComparableCard` no las trae) ni se eligen carriles de precio.
 */
function tcgCatalog(cards: readonly TcgComparableCard[]): TcgCardCatalog {
  return {
    cardsFor: (filters) => cards.filter((card) =>
      (filters.setIds.length === 0 || filters.setIds.includes(card.setId))
      && (filters.rarities.length === 0 || card.rarity !== null && filters.rarities.includes(card.rarity))
      && (filters.minPrice === null || compareTcgPrices(card.price, filters.minPrice) >= 0)
      && (filters.maxPrice === null || compareTcgPrices(card.price, filters.maxPrice) <= 0)),
    options: () => ({ ready: cards.length >= 2, cardCount: cards.length, generations: [], sets: [], rarities: [] }),
  };
}

/** Contexto inicial (`now` = `startNow`, 1000 por defecto); `players[0]` es el anfitrión. */
export function buildGoldenContext(scenario: GoldenScenario, catalog: PokemonCatalog): GameContext {
  return {
    players: scenario.players,
    pokemon: catalog,
    now: scenario.startNow ?? 1000,
    random: mulberry32(scenario.seed),
    roomCode: scenario.roomCode ?? 'GOLD01',
    ...(scenario.players[0] ? { hostId: scenario.players[0].id } : {}),
    preloadImage: () => {},
    ...(scenario.hostCustomCategories ? { hostCustomCategories: scenario.hostCustomCategories } : {}),
    ...(scenario.hostWouldYouRatherPrompts ? { hostWouldYouRatherPrompts: scenario.hostWouldYouRatherPrompts } : {}),
    ...(scenario.pokemonVisuals ? { pokemonVisuals: visualCatalog(scenario.pokemonVisuals) } : {}),
    ...(scenario.pokemonAudio ? { pokemonAudio: audioCatalog(scenario.pokemonAudio) } : {}),
    ...(scenario.tcgCards ? { tcgCards: tcgCatalog(scenario.tcgCards) } : {}),
  };
}
