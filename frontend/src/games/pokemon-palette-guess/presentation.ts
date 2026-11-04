import type { PokemonLegendaryStatus, PokemonPaletteHint } from '@pokemon-universe/shared/public';
import { pokemonTypeLabels } from '../../components/PokemonTypeBadge';

const categoryLabels: Record<PokemonLegendaryStatus, string> = { NORMAL: 'No legendario', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' };

/** Texto de una pista adicional de Adivina por la Paleta (los de siempre). */
export function describePaletteHint(hint: PokemonPaletteHint): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.value}`;
  if (hint.kind === 'TYPE') return hint.values.map((type) => pokemonTypeLabels[type]).join(' / ');
  if (hint.kind === 'TYPE_COUNT') return hint.value === 1 ? 'Monotipo' : 'Dos tipos';
  if (hint.kind === 'CATEGORY') return categoryLabels[hint.value];
  if (hint.stages <= 1) return 'No evoluciona';
  if (hint.stage <= 1) return 'Pokémon base';
  if (hint.stage >= hint.stages) return 'Evolución final';
  return 'Evolución intermedia';
}

/** Nombre aproximado de un color `#rrggbb` en español (tono y luminosidad): la paleta nunca va solo en color. */
export function colorName(hex: string): string {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  const delta = max - min;
  if (light < 0.12) return 'negro';
  if (light > 0.9 && delta < 0.12) return 'blanco';
  if (delta < 0.1) return light < 0.38 ? 'gris oscuro' : light > 0.7 ? 'gris claro' : 'gris';
  let hue = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const name = hue < 15 || hue >= 345 ? 'rojo' : hue < 45 ? 'naranja' : hue < 70 ? 'amarillo' : hue < 165 ? 'verde' : hue < 195 ? 'turquesa' : hue < 255 ? 'azul' : hue < 290 ? 'morado' : 'rosa';
  return `${name}${light < 0.32 ? ' oscuro' : light > 0.72 ? ' claro' : ''}`;
}

/** Un color de la paleta listo para pintar: su nombre, su peso (0–1, normalizado) y su porcentaje redondeado. */
export interface PaletteSwatch { color: string; name: string; weight: number; percent: number }

/** Colores con su peso; sin pesos válidos (longitud distinta), el peso se reparte por igual, como hace el motor. */
export function paletteSwatches(colors: readonly string[], weights: readonly number[]): PaletteSwatch[] {
  const normalized = weights.length === colors.length ? weights : colors.map(() => 1 / Math.max(1, colors.length));
  return colors.map((color, index) => {
    const weight = normalized[index] ?? 0;
    return { color, name: colorName(color), weight, percent: Math.round(weight * 100) };
  });
}
