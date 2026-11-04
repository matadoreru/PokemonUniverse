import type { GuessFromStatsHint, GuessFromStatsPokemonReveal, GuessFromStatsVisibleStat, PokemonLegendaryStatus } from '@pokemon-universe/shared/public';
import { pokemonTypeLabels } from '../../components/PokemonTypeBadge';

type StatKey = GuessFromStatsVisibleStat['key'];

/** Nombre de cada estadística (abreviaturas del sistema). */
export const statLabels: Record<StatKey, string> = { hp: 'PS', attack: 'Ataque', defense: 'Defensa', specialAttack: 'At. Esp.', specialDefense: 'Def. Esp.', speed: 'Velocidad', bst: 'Total' };
/** Orden de la ficha completa. */
export const STAT_ORDER: readonly StatKey[] = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'bst'];
/** Escala fija de las barras: 255 por estadística y 780 para el total (las barras se comparan entre rondas). */
export function statMax(key: StatKey): number {
  return key === 'bst' ? 780 : 255;
}

const categoryLabels: Record<PokemonLegendaryStatus, string> = { NORMAL: 'No legendario', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' };
const evolutionLabels = { BASE: 'Pokémon base', MIDDLE: 'Evolución intermedia', FINAL: 'Evolución final', NO_EVOLUTION: 'No evoluciona' } as const;

/** Texto de una pista adicional de Guess from Stats (los de siempre). */
export function describeStatsHint(hint: GuessFromStatsHint): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.value}`;
  if (hint.kind === 'TYPES') return `Tipo ${hint.value.map((type) => pokemonTypeLabels[type]).join(' / ')}`;
  if (hint.kind === 'TYPE_COUNT') return hint.value === 1 ? 'Monotipo' : 'Doble tipo';
  if (hint.kind === 'EVOLUTION') return evolutionLabels[hint.value];
  if (hint.kind === 'HEIGHT') return `Altura ${(hint.decimeters / 10).toFixed(1)} m`;
  if (hint.kind === 'WEIGHT') return `Peso ${(hint.hectograms / 10).toFixed(1)} kg`;
  return categoryLabels[hint.value];
}

/** Las siete estadísticas de una respuesta, en el orden de la ficha. */
export function fullStats(pokemon: GuessFromStatsPokemonReveal): GuessFromStatsVisibleStat[] {
  return STAT_ORDER.map((key) => ({ key, value: key === 'bst' ? pokemon.bst : pokemon[key] }));
}

/** Lo que era, para la región viva: un nombre, «A o B» (hasta tres) o «una de N respuestas válidas». */
export function statsAnswerText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} o ${names.at(-1)}`;
  return `una de ${names.length} respuestas válidas`;
}
