import { validateGameConfigReadiness, type PokemonImpostorMode, type RoomView } from '@pokemon-universe/shared/public';

/** Same parity rule as the server: counts the connected members, like the lobby does. */
export function validatePokemonImpostorConfig(config: unknown, room?: RoomView): string | null {
  const playerCount = room?.members.filter((member) => member.presence === 'CONNECTED').length ?? 0;
  return validateGameConfigReadiness('pokemon-impostor', config, { playerCount });
}

/** Mismo texto que el servidor: en `ONE_WORD`, la pista recortada no admite espacios. El campo es el único dueño del error. */
export const IMPOSTOR_ONE_WORD_ERROR = 'La pista debe ser una sola palabra.';

/** Mismo texto que el servidor, que solo lo comprueba con los inocentes (con el impostor sería un oráculo). */
export const IMPOSTOR_SECRET_NAME_ERROR = 'No puedes decir el nombre del Pokémon.';

/** Como `lettersOnly` del servidor: sin tildes, en minúsculas y solo letras («PIKACHÚ» → `pikachu`). */
function lettersOnly(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}]/gu, '');
}

/**
 * Primero la regla de `ONE_WORD` y después la del nombre (subcadena sobre solo letras). Sin `secretName` (el impostor
 * no lo recibe) no comprueba el nombre. Solo se conoce `name`: el nombre base de una forma regional lo rechaza el
 * servidor.
 */
export function validateImpostorClue(text: string, mode: PokemonImpostorMode | undefined, secretName?: string | null): string | null {
  if (mode === 'ONE_WORD' && /\s/.test(text.trim())) return IMPOSTOR_ONE_WORD_ERROR;
  const name = secretName ? lettersOnly(secretName) : '';
  return name && lettersOnly(text).includes(name) ? IMPOSTOR_SECRET_NAME_ERROR : null;
}
