/**
 * Espejo de tokens.css (spec Arcade DS §3). `tokens.test.ts` comprueba que cada valor coincide con
 * el CSS y que las parejas de texto de §3.1 cumplen AA.
 */
export const colors = {
  navy: '#13235C',
  navy2: '#0B1640',
  navy3: '#1B2F78',
  blue: '#2F6BE0',
  blueD: '#1E4FB8',
  blueL: '#6FA2FF',
  sky: '#8FD0FF',
  sky2: '#CFEBFF',
  cream: '#FFF8E1',
  cream2: '#F3E6BE',
  ink: '#1E2238',
  ink2: '#4A4F6A',
  white: '#FFFFFF',
  band: '#060B22',
  yellow: '#FFD23F',
  yellowD: '#E0A900',
  yellowL: '#FFF0A8',
  red: '#EF3B4A',
  redD: '#B91E2C',
  redL: '#FF8B95',
  redText: '#D22F3E',
  orange: '#FF8A2B',
  ok: '#39B54A',
  warn: '#FFC247',
  bad: '#FF5A5A',
  info: '#37B6FF',
} as const;

/** Nombre CSS de cada color del espejo (`--navy-2`, `--blue-d`…). */
export const cssName: Record<keyof typeof colors, string> = {
  navy: '--navy',
  navy2: '--navy-2',
  navy3: '--navy-3',
  blue: '--blue',
  blueD: '--blue-d',
  blueL: '--blue-l',
  sky: '--sky',
  sky2: '--sky-2',
  cream: '--cream',
  cream2: '--cream-2',
  ink: '--ink',
  ink2: '--ink-2',
  white: '--white',
  band: '--band',
  yellow: '--yellow',
  yellowD: '--yellow-d',
  yellowL: '--yellow-l',
  red: '--red',
  redD: '--red-d',
  redL: '--red-l',
  redText: '--red-text',
  orange: '--orange',
  ok: '--ok',
  warn: '--warn',
  bad: '--bad',
  info: '--info',
};

/** Los 18 tipos Pokémon, en inglés y minúscula. */
export type PokemonType = 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice' | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

/** Color de cada tipo (`--type-<t>`). */
export const typeColors: Record<PokemonType, string> = {
  normal: '#A8A77A',
  fire: '#EE8130',
  water: '#6390F0',
  electric: '#F7D02C',
  grass: '#7AC74C',
  ice: '#96D9D6',
  fighting: '#C22E28',
  poison: '#A33EA1',
  ground: '#E2BF65',
  flying: '#A98FF3',
  psychic: '#F95587',
  bug: '#A6B91A',
  rock: '#B6A136',
  ghost: '#735797',
  dragon: '#6F35FC',
  dark: '#705746',
  steel: '#B7B7CE',
  fairy: '#D685AD',
};

/** Tinta de cada tipo (`--type-<t>-ink`): blanco o azul noche, el de más contraste. */
export const typeInk: Record<PokemonType, string> = {
  normal: colors.navy,
  fire: colors.navy,
  water: colors.navy,
  electric: colors.navy,
  grass: colors.navy,
  ice: colors.navy,
  fighting: colors.white,
  poison: colors.white,
  ground: colors.navy,
  flying: colors.navy,
  psychic: colors.navy,
  bug: colors.navy,
  rock: colors.navy,
  ghost: colors.white,
  dragon: colors.white,
  dark: colors.white,
  steel: colors.navy,
  fairy: colors.navy,
};

/** Escala tipográfica cerrada (§3.2): 8 tamaños. */
export const fontSizes = [13, 15, 18, 22, 26, 34, 44, 68] as const;
/** Capas (§3.5). */
export const layers = { content: 1, hud: 5, sticky: 10, cutin: 25, toast: 40 } as const;

/** Luminancia relativa (WCAG 2.1) de un color `#rrggbb`. */
export function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const ch = (i: number): number => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

/** Ratio de contraste WCAG 2.1 entre dos colores `#rrggbb`. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Regla de texto sobre el color del jugador (§3.1): azul noche si la luminancia es >= 0,30; si no, blanco. */
export function inkOn(hex: string): string {
  return luminance(hex) >= 0.3 ? colors.navy : colors.white;
}

/** Tinta de un glifo o letra sobre un color (§3.1): blanco o azul noche, el de más contraste. */
export function bestInk(bg: string): string {
  return contrast(colors.navy, bg) >= contrast(colors.white, bg) ? colors.navy : colors.white;
}
