import { validateGameConfigReadiness, type RoomView } from '@pokemon-universe/shared/public';

/** Same parity rule as the server: counts the connected members, like the lobby does. */
export function validatePokemonImpostorConfig(config: unknown, room?: RoomView): string | null {
  const playerCount = room?.members.filter((member) => member.presence === 'CONNECTED').length ?? 0;
  return validateGameConfigReadiness('pokemon-impostor', config, { playerCount });
}
