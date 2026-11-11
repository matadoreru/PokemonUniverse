import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpDown, Ban, BookOpen, BookText, Brain, Brush, ChartColumn, CircleHelp, Coins, Gamepad2, Gavel, Grid3x3,
  Languages, Link, ListOrdered, MessageSquareQuote, Palette, Pointer, Puzzle, Rows3, Scale, ScanFace, ScrollText, Spade, Sparkles, Swords, Target, UserRoundSearch, UserX,
  VenetianMask, Volume2, ZoomIn,
} from 'lucide-react';

/**
 * Icono de línea de cada minijuego. El registro compartido trae un emoji (`manifest.icon`, lo lee también el backend):
 * la web no lo pinta y usa este mapa para que los iconos sean del mismo sistema que el resto de la interfaz.
 */
export const GAME_ICONS: Readonly<Record<string, LucideIcon>> = {
  'shiny-vote': Sparkles,
  'pokemon-impostor': VenetianMask,
  'type-duel': Swords,
  'zoomed-pokemon': ZoomIn,
  'pokemon-team-auction': Coins,
  'pokemon-red-flag': MessageSquareQuote,
  'tcg-higher-lower': Spade,
  'pokemon-cry-quiz': Volume2,
  'pokemon-trivia': Brain,
  'pokemon-palette-guess': Palette,
  'pokedex-distance': Target,
  'higher-lower': ArrowUpDown,
  'learnset-guess': BookOpen,
  'pokeddle-race': Rows3,
  'pokemon-bingo': Grid3x3,
  'whos-that-pokemon': CircleHelp,
  'pokedex-entry-guess': BookText,
  'type-chain': Link,
  'guess-from-stats': ChartColumn,
  'poke-taboo': Ban,
  'one-of-us-is-fake': UserX,
  'most-likely-to': Pointer,
  sketchmon: Brush,
  'pokemon-bluff-auction': Gavel,
  'pokemon-connections': Puzzle,
  'would-you-rather': Scale,
  'secret-ranking': ListOrdered,
  'who-is-who-pokemon': UserRoundSearch,
  'absurd-pokedex': ScrollText,
  'unown-translator': Languages,
  'who-am-i': ScanFace,
};

/** Icono del juego; si aparece uno nuevo sin entrada, un mando genérico (nunca su emoji). */
export function gameIcon(gameId: string): LucideIcon {
  return GAME_ICONS[gameId] ?? Gamepad2;
}

/**
 * Objeto de Pokémon que representa a cada juego (nombre del sprite en PokeAPI, `sprites/items/<nombre>.png`). Es la
 * imagen del juego; el icono de línea de arriba es el respaldo si el sprite no carga. PokeAPI no tiene sprite de la
 * Pokédex: Pokédex Distance usa el Pokéradar.
 */
export const GAME_ITEMS: Readonly<Record<string, string>> = {
  'shiny-vote': 'shiny-charm',
  'pokemon-impostor': 'dubious-disc',
  'type-duel': 'expert-belt',
  'zoomed-pokemon': 'zoom-lens',
  'pokemon-team-auction': 'amulet-coin',
  'pokemon-red-flag': 'red-card',
  'tcg-higher-lower': 'big-nugget',
  'pokemon-cry-quiz': 'poke-flute',
  'pokemon-trivia': 'twisted-spoon',
  'pokemon-palette-guess': 'rainbow-wing',
  'pokedex-distance': 'poke-radar',
  'higher-lower': 'rare-candy',
  'learnset-guess': 'tm-normal',
  'pokeddle-race': 'bicycle',
  'pokemon-bingo': 'lucky-egg',
  'whos-that-pokemon': 'silph-scope',
  'pokedex-entry-guess': 'journal',
  'type-chain': 'red-chain',
  'guess-from-stats': 'hp-up',
  'poke-taboo': 'throat-spray',
  'one-of-us-is-fake': 'smoke-ball',
  'most-likely-to': 'destiny-knot',
  sketchmon: 'pal-pad',
  'pokemon-bluff-auction': 'bright-powder',
  'pokemon-connections': 'linking-cord',
  'would-you-rather': 'choice-scarf',
  'secret-ranking': 'relic-crown',
  'who-is-who-pokemon': 'scope-lens',
  'absurd-pokedex': 'tiny-mushroom',
  'unown-translator': 'unown-report',
  'who-am-i': 'reveal-glass',
};

const ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';

/** URL del sprite del objeto del juego, o `null` si el juego no tiene objeto (entonces se ve el icono). */
export function gameSpriteUrl(gameId: string): string | null {
  const item = GAME_ITEMS[gameId];
  return item ? `${ITEM_SPRITES}/${item}.png` : null;
}
