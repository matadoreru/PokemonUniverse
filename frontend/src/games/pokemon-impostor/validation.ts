import { validateGameConfigReadiness, type PokemonImpostorMode, type RoomView } from '@pokemon-universe/shared/public';

/** Same parity rule as the server: counts the connected members, like the lobby does. */
export function validatePokemonImpostorConfig(config: unknown, room?: RoomView): string | null {
  const playerCount = room?.members.filter((member) => member.presence === 'CONNECTED').length ?? 0;
  return validateGameConfigReadiness('pokemon-impostor', config, { playerCount });
}

/** Mismo texto que el servidor: en `ONE_WORD`, la pista recortada no admite espacios. El campo es el único dueño del error. */
export const IMPOSTOR_ONE_WORD_ERROR = 'La pista debe ser una sola palabra.';

export function validateImpostorClue(text: string, mode: PokemonImpostorMode | undefined): string | null {
  return mode === 'ONE_WORD' && /\s/.test(text.trim()) ? IMPOSTOR_ONE_WORD_ERROR : null;
}
