import { POKEMON_TYPES, type Pokemon, type PokemonType } from '../../pokemon/types.js';
import type { GameContext } from '../contracts.js';
import type { ConnectionAnswerGroup } from './types.js';

interface CategoryDefinition {
  id: string;
  label: string;
  explanation: string;
  pokemonIds?: readonly string[];
  matches?: (pokemon: Pokemon) => boolean;
}

interface CuratedTemplate {
  id: string;
  groups: Array<{ categoryId: string; pokemonIds: readonly string[] }>;
}

export interface GeneratedConnectionsPuzzle {
  key: string;
  source: 'CURATED' | 'DYNAMIC';
  groups: ConnectionAnswerGroup[];
}

const typeLabels: Record<PokemonType, string> = {
  normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo',
  fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
  rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
};

const colorLabels: Record<string, string> = {
  black: 'negro', blue: 'azul', brown: 'marrón', gray: 'gris', green: 'verde', pink: 'rosa',
  purple: 'morado', red: 'rojo', white: 'blanco', yellow: 'amarillo',
};

export const connectionCategoryCatalog: readonly CategoryDefinition[] = [
  {
    id: 'eevee-family', label: 'Evoluciones de Eevee', explanation: 'Todas son evoluciones posibles de Eevee.',
    pokemonIds: ['vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon'],
  },
  {
    id: 'fossils', label: 'Pokémon fósiles', explanation: 'Proceden de fósiles que pueden revivirse.',
    pokemonIds: ['omanyte', 'kabuto', 'aerodactyl', 'lileep', 'anorith', 'cranidos', 'shieldon', 'tirtouga', 'archen', 'tyrunt', 'amaura', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish'],
  },
  {
    id: 'dogs', label: 'Pokémon con aspecto canino', explanation: 'Su diseño está inspirado en perros o cánidos.',
    pokemonIds: ['growlithe', 'arcanine', 'houndour', 'houndoom', 'electrike', 'manectric', 'lillipup', 'herdier', 'stoutland', 'rockruff', 'lycanroc-midday', 'yamper', 'boltund', 'fidough', 'dachsbun', 'greavard', 'houndstone', 'mabosstiff'],
  },
  {
    id: 'food', label: 'Relacionados con comida', explanation: 'Su diseño o concepto está relacionado con alimentos o bebidas.',
    pokemonIds: ['vanillite', 'vanillish', 'vanilluxe', 'slurpuff', 'applin', 'flapple', 'appletun', 'sinistea', 'polteageist', 'alcremie', 'smoliv', 'dolliv', 'arboliva', 'tatsugiri'],
  },
  {
    id: 'cats', label: 'Pokémon con aspecto felino', explanation: 'Su diseño está inspirado en gatos o felinos.',
    pokemonIds: ['meowth', 'persian', 'skitty', 'delcatty', 'glameow', 'purugly', 'purrloin', 'liepard', 'espurr', 'meowstic-male', 'litten', 'torracat', 'sprigatito', 'floragato'],
  },
  {
    id: 'bears', label: 'Pokémon con aspecto de oso', explanation: 'Su diseño está inspirado en osos.',
    pokemonIds: ['teddiursa', 'ursaring', 'cubchoo', 'beartic', 'stufful', 'bewear', 'kubfu', 'urshifu-single-strike'],
  },
  {
    id: 'baby', label: 'Pokémon bebé', explanation: 'Pertenecen al grupo oficial de Pokémon bebé.',
    pokemonIds: ['pichu', 'cleffa', 'igglybuff', 'togepi', 'tyrogue', 'smoochum', 'elekid', 'magby', 'azurill', 'wynaut', 'budew', 'chingling', 'bonsly', 'mime-jr', 'happiny', 'munchlax', 'riolu', 'mantyke', 'toxel'],
  },
  {
    id: 'pseudo-final', label: 'Pseudolegendarios finales', explanation: 'Son la fase final de una familia considerada pseudolegendaria.',
    pokemonIds: ['dragonite', 'tyranitar', 'salamence', 'metagross', 'garchomp', 'hydreigon', 'goodra', 'kommo-o', 'dragapult', 'baxcalibur'],
  },
  {
    id: 'electric-rodents', label: 'Roedores eléctricos', explanation: 'Forman el grupo informal de roedores eléctricos de cada generación.',
    pokemonIds: ['pikachu', 'raichu', 'pichu', 'plusle', 'minun', 'pachirisu', 'emolga', 'dedenne', 'togedemaru', 'morpeko', 'pawmi', 'pawmo', 'pawmot'],
  },
  {
    id: 'artificial-objects', label: 'Objetos animados', explanation: 'Su diseño convierte un objeto cotidiano en Pokémon.',
    pokemonIds: ['magnemite', 'voltorb', 'electrode', 'klink', 'litwick', 'chandelure', 'trubbish', 'vanillite', 'honedge', 'klefki', 'sinistea', 'polteageist'],
  },
  {
    id: 'grass-partners', label: 'Compañeros iniciales de tipo Planta', explanation: 'Se pueden elegir como primer compañero de una región y empiezan con tipo Planta.',
    pokemonIds: ['bulbasaur', 'chikorita', 'treecko', 'turtwig', 'snivy', 'chespin', 'rowlet', 'grookey', 'sprigatito'],
  },
  {
    id: 'fire-partners', label: 'Compañeros iniciales de tipo Fuego', explanation: 'Se pueden elegir como primer compañero de una región y empiezan con tipo Fuego.',
    pokemonIds: ['charmander', 'cyndaquil', 'torchic', 'chimchar', 'tepig', 'fennekin', 'litten', 'scorbunny', 'fuecoco'],
  },
  {
    id: 'water-partners', label: 'Compañeros iniciales de tipo Agua', explanation: 'Se pueden elegir como primer compañero de una región y empiezan con tipo Agua.',
    pokemonIds: ['squirtle', 'totodile', 'mudkip', 'piplup', 'oshawott', 'froakie', 'popplio', 'sobble', 'quaxly'],
  },
  {
    id: 'regional-birds', label: 'Aves de las primeras rutas', explanation: 'Pertenecen a familias de aves que aparecen al principio de sus regiones.',
    pokemonIds: ['pidgeot', 'noctowl', 'swellow', 'staraptor', 'unfezant', 'talonflame', 'toucannon', 'corviknight', 'kilowattrel'],
  },
  {
    id: 'trade-evolution', label: 'Evolucionan al intercambiarlos', explanation: 'Su método evolutivo clásico requiere un intercambio.',
    pokemonIds: ['kadabra', 'machoke', 'graveler', 'haunter', 'boldore', 'gurdurr', 'phantump', 'pumpkaboo'],
  },
  {
    id: 'branch-evolution', label: 'Tienen una evolución ramificada', explanation: 'Pueden evolucionar en especies diferentes según las condiciones.',
    pokemonIds: ['gloom', 'poliwhirl', 'slowpoke', 'tyrogue', 'wurmple', 'snorunt', 'clamperl', 'kirlia'],
  },
  {
    id: 'friendship-evolution', label: 'Evolucionan con amistad', explanation: 'Una amistad alta forma parte de su método de evolución.',
    pokemonIds: ['golbat', 'chansey', 'togetic', 'azurill', 'budew', 'buneary', 'riolu', 'snom'],
  },
  {
    id: 'stone-evolution', label: 'Evolucionan con una piedra', explanation: 'Necesitan una piedra evolutiva para alcanzar su siguiente fase.',
    pokemonIds: ['vulpix', 'growlithe', 'staryu', 'gloom', 'sunkern', 'minccino', 'helioptile', 'charjabug'],
  },
  {
    id: 'turtles', label: 'Pokémon con aspecto de tortuga', explanation: 'Su diseño está inspirado en tortugas terrestres o marinas.',
    pokemonIds: ['squirtle', 'torkoal', 'turtwig', 'carracosta', 'turtonator', 'chewtle'],
  },
  {
    id: 'snakes', label: 'Pokémon con aspecto de serpiente', explanation: 'Tienen un cuerpo y diseño inspirados en serpientes.',
    pokemonIds: ['ekans', 'arbok', 'dunsparce', 'seviper', 'snivy', 'silicobra'],
  },
  {
    id: 'monkeys', label: 'Pokémon con aspecto de simio', explanation: 'Su diseño está inspirado en monos u otros simios.',
    pokemonIds: ['mankey', 'aipom', 'chimchar', 'pansage', 'grookey'],
  },
  {
    id: 'horses', label: 'Pokémon con aspecto equino', explanation: 'Su diseño está inspirado en caballos, cebras o asnos.',
    pokemonIds: ['ponyta', 'blitzle', 'mudbray', 'glastrier', 'spectrier'],
  },
  {
    id: 'crustaceans', label: 'Pokémon crustáceos', explanation: 'Su diseño toma rasgos de cangrejos u otros crustáceos.',
    pokemonIds: ['krabby', 'corphish', 'dwebble', 'clauncher', 'crabrawler', 'klawf'],
  },
  {
    id: 'frogs', label: 'Pokémon con aspecto de rana', explanation: 'Su diseño está inspirado en ranas, sapos o renacuajos.',
    pokemonIds: ['poliwag', 'politoed', 'croagunk', 'tympole', 'froakie', 'greninja', 'bellibolt'],
  },
  {
    id: 'mythical-balanced-stats', label: 'Singulares con 100 en cada estadística', explanation: 'Sus seis estadísticas base tienen exactamente 100 puntos.',
    pokemonIds: ['mew', 'celebi', 'jirachi', 'manaphy', 'shaymin-land'],
  },
];

const curatedTemplates: readonly CuratedTemplate[] = [
  {
    id: 'classic-connections',
    groups: [
      { categoryId: 'eevee-family', pokemonIds: ['vaporeon', 'jolteon', 'flareon', 'espeon'] },
      { categoryId: 'fossils', pokemonIds: ['omanyte', 'kabuto', 'aerodactyl', 'lileep'] },
      { categoryId: 'dogs', pokemonIds: ['growlithe', 'houndour', 'electrike', 'lillipup'] },
      { categoryId: 'food', pokemonIds: ['vanillite', 'slurpuff', 'appletun', 'alcremie'] },
    ],
  },
  {
    id: 'companions-connections',
    groups: [
      { categoryId: 'cats', pokemonIds: ['meowth', 'skitty', 'glameow', 'purrloin'] },
      { categoryId: 'bears', pokemonIds: ['teddiursa', 'cubchoo', 'stufful', 'kubfu'] },
      { categoryId: 'baby', pokemonIds: ['pichu', 'togepi', 'riolu', 'toxel'] },
      { categoryId: 'pseudo-final', pokemonIds: ['dragonite', 'tyranitar', 'metagross', 'garchomp'] },
    ],
  },
  {
    id: 'first-partners-connections',
    groups: [
      { categoryId: 'grass-partners', pokemonIds: ['bulbasaur', 'chikorita', 'treecko', 'turtwig'] },
      { categoryId: 'fire-partners', pokemonIds: ['charmander', 'cyndaquil', 'torchic', 'chimchar'] },
      { categoryId: 'water-partners', pokemonIds: ['squirtle', 'totodile', 'mudkip', 'piplup'] },
      { categoryId: 'regional-birds', pokemonIds: ['pidgeot', 'noctowl', 'swellow', 'staraptor'] },
    ],
  },
  {
    id: 'evolution-methods-connections',
    groups: [
      { categoryId: 'trade-evolution', pokemonIds: ['kadabra', 'machoke', 'graveler', 'haunter'] },
      { categoryId: 'branch-evolution', pokemonIds: ['poliwhirl', 'slowpoke', 'snorunt', 'kirlia'] },
      { categoryId: 'friendship-evolution', pokemonIds: ['golbat', 'chansey', 'buneary', 'riolu'] },
      { categoryId: 'stone-evolution', pokemonIds: ['vulpix', 'growlithe', 'staryu', 'sunkern'] },
    ],
  },
  {
    id: 'animal-shapes-connections',
    groups: [
      { categoryId: 'turtles', pokemonIds: ['squirtle', 'torkoal', 'carracosta', 'chewtle'] },
      { categoryId: 'snakes', pokemonIds: ['ekans', 'dunsparce', 'seviper', 'silicobra'] },
      { categoryId: 'monkeys', pokemonIds: ['mankey', 'aipom', 'pansage', 'grookey'] },
      { categoryId: 'horses', pokemonIds: ['ponyta', 'blitzle', 'mudbray', 'spectrier'] },
    ],
  },
  {
    id: 'nature-connections',
    groups: [
      { categoryId: 'crustaceans', pokemonIds: ['krabby', 'corphish', 'dwebble', 'klawf'] },
      { categoryId: 'frogs', pokemonIds: ['politoed', 'croagunk', 'greninja', 'bellibolt'] },
      { categoryId: 'mythical-balanced-stats', pokemonIds: ['mew', 'celebi', 'jirachi', 'manaphy'] },
      { categoryId: 'electric-rodents', pokemonIds: ['plusle', 'pachirisu', 'dedenne', 'togedemaru'] },
    ],
  },
];

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  if (values.length === 0) return [];
  const start = offset % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

function resolvedCategoryDefinitions(pool: readonly Pokemon[]): CategoryDefinition[] {
  const availableGenerations = new Set(pool.map((pokemon) => pokemon.generation));
  const dynamic: CategoryDefinition[] = [
    ...POKEMON_TYPES.map((type) => ({
      id: `type-${type}`,
      label: `Comparten el tipo ${typeLabels[type]}`,
      explanation: `Todos incluyen el tipo ${typeLabels[type]} entre sus tipos.`,
      matches: (pokemon: Pokemon) => pokemon.types.includes(type),
    })),
    ...Object.entries(colorLabels).map(([color, label]) => ({
      id: `color-${color}`,
      label: `Color oficial ${label}`,
      explanation: `La Pokédex clasifica oficialmente su color como ${label}.`,
      matches: (pokemon: Pokemon) => pokemon.color === color,
    })),
    {
      id: 'evolution-first', label: 'Primera fase evolutiva', explanation: 'Ocupan la primera fase de una familia con varias etapas.',
      matches: (pokemon) => pokemon.evolutionStage === 1 && (pokemon.evolutionStageCount ?? 1) > 1,
    },
    {
      id: 'evolution-final', label: 'Evoluciones finales', explanation: 'Ocupan la última fase de su familia evolutiva.',
      matches: (pokemon) => (pokemon.evolutionStageCount ?? 1) > 1 && pokemon.evolutionStage === pokemon.evolutionStageCount,
    },
    {
      id: 'single-stage', label: 'Sin evoluciones', explanation: 'No evolucionan ni proceden de otro Pokémon.',
      matches: (pokemon) => (pokemon.evolutionStageCount ?? 1) === 1,
    },
    {
      id: 'legendary', label: 'Pokémon legendarios', explanation: 'Tienen la clasificación oficial de Pokémon legendario.',
      matches: (pokemon) => pokemon.legendaryStatus === 'LEGENDARY',
    },
    {
      id: 'mythical', label: 'Pokémon singulares', explanation: 'Tienen la clasificación oficial de Pokémon singular.',
      matches: (pokemon) => pokemon.legendaryStatus === 'MYTHICAL',
    },
    {
      id: 'ordinary', label: 'No son legendarios ni singulares', explanation: 'Tienen la clasificación oficial de Pokémon común.',
      matches: (pokemon) => pokemon.legendaryStatus === 'NORMAL',
    },
    ...(availableGenerations.size > 1 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : []).map((generation) => ({
      id: `generation-${generation}`,
      label: `Debutaron en la generación ${generation}`,
      explanation: `Todos aparecieron por primera vez en la generación ${generation}.`,
      matches: (pokemon: Pokemon) => pokemon.generation === generation,
    })),
  ];
  return [...connectionCategoryCatalog, ...dynamic].filter((definition, index, all) => all.findIndex((item) => item.id === definition.id) === index);
}

function membersFor(definition: CategoryDefinition, pool: readonly Pokemon[]): Pokemon[] {
  const ids = definition.pokemonIds ? new Set(definition.pokemonIds) : null;
  return pool.filter((pokemon) => ids?.has(pokemon.id) || definition.matches?.(pokemon));
}

function answerGroup(definition: CategoryDefinition, pokemon: readonly Pokemon[], index: number): ConnectionAnswerGroup {
  return {
    id: `group-${index + 1}`,
    categoryId: definition.id,
    label: definition.label,
    explanation: definition.explanation,
    pokemon: pokemon.map(({ id, name, sprite }) => ({ id, name, sprite })),
  };
}

function curatedCandidates(pool: readonly Pokemon[], groupCount: number): GeneratedConnectionsPuzzle[] {
  const byId = new Map(pool.map((pokemon) => [pokemon.id, pokemon]));
  const definitions = new Map(connectionCategoryCatalog.map((definition) => [definition.id, definition]));
  return curatedTemplates.flatMap((template) => {
    const offsets = template.groups.length === groupCount ? [0] : template.groups.length > groupCount ? template.groups.map((_, index) => index) : [];
    return offsets.flatMap((offset) => {
      const chosen = rotate(template.groups, offset).slice(0, groupCount);
      const resolved = chosen.map((group) => ({ definition: definitions.get(group.categoryId), pokemon: group.pokemonIds.map((id) => byId.get(id)) }));
      if (resolved.some((group) => !group.definition || group.pokemon.some((pokemon) => !pokemon))) return [];
      const groups = resolved.map((group, index) => answerGroup(group.definition!, group.pokemon as Pokemon[], index));
      return [{ key: `${template.id}-${chosen.map((group) => group.categoryId).join('-')}`, source: 'CURATED' as const, groups }];
    });
  });
}

function dynamicPuzzle(pool: readonly Pokemon[], groupSize: number, groupCount: number, context: GameContext, excludedCategoryIds: ReadonlySet<string>): GeneratedConnectionsPuzzle | null {
  const candidates = resolvedCategoryDefinitions(pool)
    .map((definition) => ({ definition, members: shuffled(membersFor(definition, pool), context.random) }))
    .filter(({ members }) => members.length >= groupSize);
  const randomized = [
    ...shuffled(candidates.filter(({ definition }) => !excludedCategoryIds.has(definition.id)), context.random),
    ...shuffled(candidates.filter(({ definition }) => excludedCategoryIds.has(definition.id)), context.random),
  ];
  for (let attempt = 0; attempt < Math.max(1, randomized.length * 4); attempt += 1) {
    const used = new Set<string>();
    const groups: ConnectionAnswerGroup[] = [];
    for (const candidate of rotate(randomized, attempt)) {
      const available = rotate(candidate.members, attempt + groups.length).filter((pokemon) => !used.has(pokemon.id));
      if (available.length < groupSize) continue;
      const selected = available.slice(0, groupSize);
      selected.forEach((pokemon) => used.add(pokemon.id));
      groups.push(answerGroup(candidate.definition, selected, groups.length));
      if (groups.length === groupCount) {
        return {
          key: `dynamic-${groups.map((group) => `${group.categoryId}:${group.pokemon.map((pokemon) => pokemon.id).join(',')}`).join('|')}`,
          source: 'DYNAMIC',
          groups,
        };
      }
    }
  }
  return null;
}

export function generateConnectionsPuzzle(
  context: GameContext,
  options: { groupSize: number; pokemonCount: number; generations: readonly number[]; usedPuzzleKeys?: readonly string[]; excludedCategoryIds?: readonly string[] },
): GeneratedConnectionsPuzzle {
  const pool = context.pokemon.forGenerations(options.generations).filter((pokemon) => pokemon.isDefault !== false && pokemon.sprite);
  const groupCount = options.pokemonCount / options.groupSize;
  if (!Number.isInteger(groupCount)) throw new Error('El tamaño del tablero no forma grupos completos.');
  const used = new Set(options.usedPuzzleKeys ?? []);
  const excludedCategoryIds = new Set(options.excludedCategoryIds ?? []);
  let curatedFallback: GeneratedConnectionsPuzzle[] = [];
  if (options.groupSize === 4 && (options.pokemonCount === 12 || options.pokemonCount === 16)) {
    const curated = curatedCandidates(pool, groupCount);
    const fresh = curated.filter((puzzle) => !used.has(puzzle.key));
    const candidates = fresh.filter((puzzle) => puzzle.groups.every((group) => !excludedCategoryIds.has(group.categoryId)));
    if (candidates.length > 0) return candidates[Math.floor(context.random() * candidates.length)]!;
    curatedFallback = fresh.length > 0 ? fresh : curated;
  }
  const generated = dynamicPuzzle(pool, options.groupSize, groupCount, context, excludedCategoryIds);
  if (!generated && curatedFallback.length > 0) return curatedFallback[Math.floor(context.random() * curatedFallback.length)]!;
  if (!generated) {
    throw new Error('No se puede construir un puzle válido con estas generaciones y tamaño. Amplía las generaciones o reduce el tablero.');
  }
  return generated;
}

export function shuffledConnectionsBoard(groups: readonly ConnectionAnswerGroup[], random: () => number) {
  return shuffled(groups.flatMap((group) => group.pokemon), random);
}
