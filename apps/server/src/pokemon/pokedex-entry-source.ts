import type { Generation, PokedexEntry } from '@pokemon-universe/shared';

export interface SourceFlavorTextEntry {
  flavor_text: string;
  language: { name: string };
  version: { name: string };
}

const VERSION_GENERATIONS: Record<string, Generation> = {
  red: 1, blue: 1, yellow: 1,
  gold: 2, silver: 2, crystal: 2,
  ruby: 3, sapphire: 3, emerald: 3, firered: 3, leafgreen: 3,
  diamond: 4, pearl: 4, platinum: 4, heartgold: 4, soulsilver: 4,
  black: 5, white: 5, 'black-2': 5, 'white-2': 5,
  x: 6, y: 6, 'omega-ruby': 6, 'alpha-sapphire': 6,
  sun: 7, moon: 7, 'ultra-sun': 7, 'ultra-moon': 7, 'lets-go-pikachu': 7, 'lets-go-eevee': 7,
  sword: 8, shield: 8, 'brilliant-diamond': 8, 'shining-pearl': 8, 'legends-arceus': 8,
  scarlet: 9, violet: 9,
};

const VERSION_LABELS: Record<string, string> = {
  red: 'Pokémon Rojo', blue: 'Pokémon Azul', yellow: 'Pokémon Amarillo', gold: 'Pokémon Oro', silver: 'Pokémon Plata', crystal: 'Pokémon Cristal',
  ruby: 'Pokémon Rubí', sapphire: 'Pokémon Zafiro', emerald: 'Pokémon Esmeralda', firered: 'Pokémon Rojo Fuego', leafgreen: 'Pokémon Verde Hoja',
  diamond: 'Pokémon Diamante', pearl: 'Pokémon Perla', platinum: 'Pokémon Platino', heartgold: 'Pokémon HeartGold', soulsilver: 'Pokémon SoulSilver',
  black: 'Pokémon Negro', white: 'Pokémon Blanco', 'black-2': 'Pokémon Negro 2', 'white-2': 'Pokémon Blanco 2',
  x: 'Pokémon X', y: 'Pokémon Y', 'omega-ruby': 'Pokémon Rubí Omega', 'alpha-sapphire': 'Pokémon Zafiro Alfa',
  sun: 'Pokémon Sol', moon: 'Pokémon Luna', 'ultra-sun': 'Pokémon Ultrasol', 'ultra-moon': 'Pokémon Ultraluna',
  'lets-go-pikachu': "Pokémon Let's Go, Pikachu!", 'lets-go-eevee': "Pokémon Let's Go, Eevee!",
  sword: 'Pokémon Espada', shield: 'Pokémon Escudo', 'brilliant-diamond': 'Pokémon Diamante Brillante', 'shining-pearl': 'Pokémon Perla Reluciente', 'legends-arceus': 'Leyendas Pokémon: Arceus',
  scarlet: 'Pokémon Escarlata', violet: 'Pokémon Púrpura',
};

export function normalizePokedexEntryText(text: string): string {
  return text.replace(/[\n\f\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function extractSpanishPokedexEntries(pokemonId: string, source: readonly SourceFlavorTextEntry[]): PokedexEntry[] {
  const unique = new Map<string, PokedexEntry>();
  for (const item of source) {
    if (item.language.name !== 'es') continue;
    const generation = VERSION_GENERATIONS[item.version.name];
    const text = normalizePokedexEntryText(item.flavor_text);
    if (!generation || !text) continue;
    unique.set(item.version.name, {
      pokemonId, text, language: 'es', generation, version: item.version.name,
      versionLabel: VERSION_LABELS[item.version.name] ?? item.version.name,
    });
  }
  return [...unique.values()].sort((left, right) => left.generation - right.generation || left.version.localeCompare(right.version));
}
