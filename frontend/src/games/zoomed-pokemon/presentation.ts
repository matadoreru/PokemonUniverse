import type { PokemonLegendaryStatus, ZoomedPokemonHint } from '@pokemon-universe/shared/public';
import { pokemonTypeLabels } from '../../components/PokemonTypeBadge';

const categoryLabels: Record<PokemonLegendaryStatus, string> = { NORMAL: 'No legendario', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' };

/** Texto de una pista adicional de Zoomed Pokémon (los de siempre). */
export function describeZoomedHint(hint: ZoomedPokemonHint): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.value}`;
  if (hint.kind === 'TYPE') return hint.values.map((type) => pokemonTypeLabels[type]).join(' / ');
  if (hint.kind === 'TYPE_COUNT') return hint.value === 1 ? 'Monotipo' : `${hint.value} tipos`;
  if (hint.kind === 'CATEGORY') return categoryLabels[hint.value];
  if (hint.stages <= 1) return 'No evoluciona';
  if (hint.stage === 1) return 'Pokémon base';
  if (hint.stage >= hint.stages) return 'Evolución final';
  return 'Evolución intermedia';
}

/** Aumento de una etapa («×5», «×3.5»). */
export const zoomLabel = (zoom: number) => `×${zoom}`;

/** De dónde sale la imagen de la ronda, en texto. */
export const zoomedSourceLabel = (source: 'SPRITE' | 'ARTWORK') => (source === 'ARTWORK' ? 'Artwork' : 'Sprite');
