import type { PokemonLegendaryStatus, PokemonType } from './types.js';

/** Nombre en español de cada tipo Pokémon. */
export const POKEMON_TYPE_LABELS: Record<PokemonType, string> = { normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };

/** Nombre en español de cada categoría de legendario. */
export const LEGENDARY_STATUS_LABELS: Record<PokemonLegendaryStatus, string> = { NORMAL: 'No legendario', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' };
