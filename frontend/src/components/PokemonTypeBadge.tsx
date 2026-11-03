import type { PokemonType } from '@pokemon-universe/shared/public';

export const pokemonTypeLabels: Record<PokemonType, string> = { normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };
export const pokemonTypeVisuals: Record<PokemonType, { icon: string }> = {
  normal: { icon: '◉' }, fire: { icon: '🔥' }, water: { icon: '💧' }, electric: { icon: '⚡' },
  grass: { icon: '🍃' }, ice: { icon: '❄️' }, fighting: { icon: '✊' }, poison: { icon: '☠️' },
  ground: { icon: '⛰️' }, flying: { icon: '🪽' }, psychic: { icon: '🔮' }, bug: { icon: '🐛' },
  rock: { icon: '🪨' }, ghost: { icon: '👻' }, dragon: { icon: '🐉' }, dark: { icon: '🌙' },
  steel: { icon: '⚙️' }, fairy: { icon: '✨' },
};

export function PokemonTypeBadge({ type, compact = false, highlighted = false }: { type: PokemonType; compact?: boolean; highlighted?: boolean }) {
  const visual = pokemonTypeVisuals[type];
  return <span aria-label={`Tipo ${pokemonTypeLabels[type]}`} className={`type-badge type-badge-${type} inline-flex items-center gap-1.5 rounded-xl border font-extrabold ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5'} ${highlighted ? 'ring-2 ring-electric/70' : ''}`}><span aria-hidden="true">{visual.icon}</span>{pokemonTypeLabels[type]}</span>;
}
