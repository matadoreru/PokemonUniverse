import type { ZoomedPokemonHint } from '@pokemon-universe/shared/public';
import { LEGENDARY_STATUS_LABELS, POKEMON_TYPE_LABELS } from '@pokemon-universe/shared/public';

/** Texto de una pista adicional de Zoomed Pokémon (los de siempre). */
export function describeZoomedHint(hint: ZoomedPokemonHint): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.value}`;
  if (hint.kind === 'TYPE') return hint.values.map((type) => POKEMON_TYPE_LABELS[type]).join(' / ');
  if (hint.kind === 'TYPE_COUNT') return hint.value === 1 ? 'Monotipo' : `${hint.value} tipos`;
  if (hint.kind === 'CATEGORY') return LEGENDARY_STATUS_LABELS[hint.value];
  if (hint.stages <= 1) return 'No evoluciona';
  if (hint.stage === 1) return 'Pokémon base';
  if (hint.stage >= hint.stages) return 'Evolución final';
  return 'Evolución intermedia';
}

/** Aumento de una etapa («×5», «×3.5»). */
export const zoomLabel = (zoom: number) => `×${zoom}`;

/** De dónde sale la imagen de la ronda, en texto. */
export const zoomedSourceLabel = (source: 'SPRITE' | 'ARTWORK') => (source === 'ARTWORK' ? 'Artwork' : 'Sprite');
