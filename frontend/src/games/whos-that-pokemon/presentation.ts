import type { WhosThatPokemonHint } from '@pokemon-universe/shared/public';
import { LEGENDARY_STATUS_LABELS, POKEMON_TYPE_LABELS } from '@pokemon-universe/shared/public';

/** Texto de una pista adicional (los de siempre). */
export function describeWhosThatHint(hint: WhosThatPokemonHint): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.value}`;
  if (hint.kind === 'TYPE') return `Uno de sus tipos es ${POKEMON_TYPE_LABELS[hint.value]}`;
  if (hint.kind === 'TYPE_COUNT') return hint.value === 1 ? 'Es monotipo' : 'Tiene dos tipos';
  if (hint.kind === 'CATEGORY') return LEGENDARY_STATUS_LABELS[hint.value];
  if (hint.stages <= 1) return 'No evoluciona';
  if (hint.stage === 1) return 'Pokémon base';
  if (hint.stage >= hint.stages) return 'Evolución final';
  return 'Evolución intermedia';
}
