import type { PokemonLegendaryStatus, PokemonType } from '../pokemon/types.js';

/** Pokémon que eligió un intento, tal como se publica. */
export interface GuessedPokemon { id: string; name: string; sprite: string }

/** Resultado del último intento propio en los juegos de adivinar un Pokémon. */
export interface GuessAttemptOutcome { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number }

type PokemonGuessCommonHint =
  | { kind: 'GENERATION'; value: number }
  | { kind: 'TYPE_COUNT'; value: number }
  | { kind: 'EVOLUTION'; stage: number; stages: number }
  | { kind: 'CATEGORY'; value: PokemonLegendaryStatus };

/** Pista de los juegos de adivinar en la que `TYPE` revela uno de los tipos. */
export type PokemonGuessHint = PokemonGuessCommonHint | { kind: 'TYPE'; value: PokemonType };

/** Pista de los juegos de adivinar en la que `TYPE` revela todos los tipos. */
export type PokemonGuessHintWithTypes = PokemonGuessCommonHint | { kind: 'TYPE'; values: PokemonType[] };
