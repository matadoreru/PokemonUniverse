import type { PokeddleClueKey, PokeddleFeedbackEntry } from '@pokemon-universe/shared';

export type PokeddleColumnGroup = 'IDENTITY' | 'STATS' | 'PHYSICAL' | 'OTHER';
export type PokeddleFeedbackSemantic = 'higher' | 'lower' | 'match' | 'partial' | 'none';

export interface PokeddleColumn {
  key: PokeddleClueKey;
  label: string;
  fullLabel: string;
  group: PokeddleColumnGroup;
  minWidth: string;
}

export interface PokeddleFeedbackPresentation {
  value: string | number;
  result: string;
  accessibleResult: string;
  symbol: '↑' | '↓' | '=' | '~' | '×';
  semantic: PokeddleFeedbackSemantic;
  tone: string;
}

export const POKEDDLE_GROUP_LABELS: Record<PokeddleColumnGroup, string> = {
  IDENTITY: 'Identidad',
  STATS: 'Stats',
  PHYSICAL: 'Físico',
  OTHER: 'Otros',
};

const definitions: Record<PokeddleClueKey, Omit<PokeddleColumn, 'key'>> = {
  generation: { label: 'Gen', fullLabel: 'Generación', group: 'IDENTITY', minWidth: 'min-w-20' },
  dexNumber: { label: 'Dex', fullLabel: 'Número Pokédex', group: 'IDENTITY', minWidth: 'min-w-24' },
  types: { label: 'Tipos', fullLabel: 'Tipos', group: 'IDENTITY', minWidth: 'min-w-40' },
  typeCount: { label: 'Nº tipos', fullLabel: 'Número de tipos', group: 'IDENTITY', minWidth: 'min-w-24' },
  hp: { label: 'HP', fullLabel: 'Puntos de salud', group: 'STATS', minWidth: 'min-w-20' },
  attack: { label: 'Atq', fullLabel: 'Ataque', group: 'STATS', minWidth: 'min-w-20' },
  defense: { label: 'Def', fullLabel: 'Defensa', group: 'STATS', minWidth: 'min-w-20' },
  specialAttack: { label: 'At. Esp.', fullLabel: 'Ataque especial', group: 'STATS', minWidth: 'min-w-24' },
  specialDefense: { label: 'Def. Esp.', fullLabel: 'Defensa especial', group: 'STATS', minWidth: 'min-w-24' },
  speed: { label: 'Vel', fullLabel: 'Velocidad', group: 'STATS', minWidth: 'min-w-20' },
  baseStatTotal: { label: 'Total', fullLabel: 'Total de estadísticas', group: 'STATS', minWidth: 'min-w-24' },
  height: { label: 'Alt.', fullLabel: 'Altura', group: 'PHYSICAL', minWidth: 'min-w-24' },
  weight: { label: 'Peso', fullLabel: 'Peso', group: 'PHYSICAL', minWidth: 'min-w-24' },
  evolutionStage: { label: 'Evol.', fullLabel: 'Etapa evolutiva', group: 'OTHER', minWidth: 'min-w-32' },
  legendaryStatus: { label: 'Categoría', fullLabel: 'Legendario o mítico', group: 'OTHER', minWidth: 'min-w-28' },
  color: { label: 'Color', fullLabel: 'Color principal', group: 'OTHER', minWidth: 'min-w-24' },
  abilities: { label: 'Habilidades', fullLabel: 'Habilidades', group: 'OTHER', minWidth: 'min-w-40' },
};

const legendaryLabels: Record<string, string> = {
  NORMAL: 'Normal',
  LEGENDARY: 'Legendario',
  MYTHICAL: 'Mítico',
};

export const pokemonTypeLabels: Record<string, string> = {
  normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo',
  fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
  rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
};

export const pokemonTypeIcons: Record<string, string> = {
  normal: '●', fire: '🔥', water: '💧', electric: '⚡', grass: '🌿', ice: '❄️', fighting: '✊', poison: '☠️',
  ground: '⛰️', flying: '🪽', psychic: '◉', bug: '🐛', rock: '◆', ghost: '👻', dragon: '🐉', dark: '🌙', steel: '⬡', fairy: '✦',
};

const semanticStyles: Record<PokeddleFeedbackSemantic, Pick<PokeddleFeedbackPresentation, 'symbol' | 'result' | 'accessibleResult' | 'tone'>> = {
  higher: { symbol: '↑', result: 'Mayor', accessibleResult: 'El objetivo es mayor', tone: 'bg-aqua/[0.07] text-aqua' },
  lower: { symbol: '↓', result: 'Menor', accessibleResult: 'El objetivo es menor', tone: 'bg-violet-400/[0.09] text-violet-300' },
  match: { symbol: '=', result: 'Coincide', accessibleResult: 'Coincidencia exacta', tone: 'bg-leaf/[0.09] text-leaf' },
  partial: { symbol: '~', result: 'Parcial', accessibleResult: 'Coincidencia parcial', tone: 'bg-electric/[0.09] text-electric' },
  none: { symbol: '×', result: 'Ninguno', accessibleResult: 'Ninguna coincidencia', tone: 'bg-berry/[0.08] text-berry' },
};

export function getPokeddleColumns(clues: readonly PokeddleClueKey[]): PokeddleColumn[] {
  return clues.map((key) => ({ key, ...definitions[key] }));
}

export function isPokeddleGroupStart(columns: readonly PokeddleColumn[], index: number): boolean {
  return index > 0 && columns[index - 1]?.group !== columns[index]?.group;
}

export function formatPokemonWords(value: string): string {
  return value.split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

function numericValue(key: PokeddleClueKey, value: number): string | number {
  if (key === 'height') return `${(value / 10).toFixed(1)} m`;
  if (key === 'weight') return `${(value / 10).toFixed(1)} kg`;
  if (key === 'dexNumber') return `#${String(value).padStart(3, '0')}`;
  return value;
}

function comparisonSemantic(result: string): PokeddleFeedbackSemantic {
  if (result === 'HIGHER') return 'higher';
  if (result === 'LOWER') return 'lower';
  if (result === 'PARTIAL') return 'partial';
  if (result === 'NONE') return 'none';
  return 'match';
}

export function formatPokeddleFeedback(key: PokeddleClueKey, entry: PokeddleFeedbackEntry): PokeddleFeedbackPresentation {
  const semantic = comparisonSemantic(entry.result);
  const style = semanticStyles[semantic];
  let value: string | number;
  let result = style.result;

  if (entry.kind === 'NUMERIC') value = numericValue(key, entry.value);
  else if (entry.kind === 'TYPES') value = entry.value.map((type) => pokemonTypeLabels[type] ?? formatPokemonWords(type)).join(' / ');
  else if (entry.kind === 'EVOLUTION') value = entry.value.stages <= 1 ? 'Sin evolución · No tiene etapas evolutivas' : `Etapa ${entry.value.stage}/${entry.value.stages}`;
  else if (entry.kind === 'ABILITIES') {
    value = entry.value.map(formatPokemonWords).join(', ');
    result = entry.matches ? `${entry.matches} coincide${entry.matches === 1 ? '' : 'n'}` : 'Ninguna';
  } else {
    value = key === 'legendaryStatus' ? legendaryLabels[entry.value] ?? entry.value : formatPokemonWords(entry.value);
  }

  return { value, result: `${style.symbol} ${result}`, accessibleResult: style.accessibleResult, symbol: style.symbol, semantic, tone: style.tone };
}

export function latestGuessRound(rows: readonly { round: number; status: 'GUESS' | 'NO_GUESS' }[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) if (rows[index]?.status === 'GUESS') return rows[index]!.round;
  return null;
}

export function resolveRivalSelection(rivalIds: readonly string[], selectedId: string | null): string | null {
  return selectedId && rivalIds.includes(selectedId) ? selectedId : rivalIds[0] ?? null;
}
