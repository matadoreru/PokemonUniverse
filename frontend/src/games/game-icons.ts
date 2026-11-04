import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpDown, Ban, BookOpen, BookText, Brain, Brush, ChartColumn, CircleHelp, Coins, Flag, Gamepad2, Gavel, Grid3x3,
  Link, ListOrdered, Palette, Pointer, Puzzle, Rows3, Scale, Spade, Sparkles, Swords, Target, UserRoundSearch, UserX,
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
  'pokemon-red-flag': Flag,
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
};

/** Icono del juego; si aparece uno nuevo sin entrada, un mando genérico (nunca su emoji). */
export function gameIcon(gameId: string): LucideIcon {
  return GAME_ICONS[gameId] ?? Gamepad2;
}
