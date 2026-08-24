import type { PokemonType } from '@pokemon-universe/shared';

export const pokemonTypeLabels: Record<PokemonType, string> = { normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };
export const pokemonTypeVisuals: Record<PokemonType, { icon: string; color: string }> = {
  normal: { icon: '◉', color: '#a8a77a' }, fire: { icon: '🔥', color: '#ee8130' }, water: { icon: '💧', color: '#6390f0' }, electric: { icon: '⚡', color: '#f7d02c' },
  grass: { icon: '🍃', color: '#7ac74c' }, ice: { icon: '❄️', color: '#96d9d6' }, fighting: { icon: '✊', color: '#c22e28' }, poison: { icon: '☠️', color: '#a33ea1' },
  ground: { icon: '⛰️', color: '#e2bf65' }, flying: { icon: '🪽', color: '#a98ff3' }, psychic: { icon: '🔮', color: '#f95587' }, bug: { icon: '🐛', color: '#a6b91a' },
  rock: { icon: '🪨', color: '#b6a136' }, ghost: { icon: '👻', color: '#735797' }, dragon: { icon: '🐉', color: '#6f35fc' }, dark: { icon: '🌙', color: '#705746' },
  steel: { icon: '⚙️', color: '#b7b7ce' }, fairy: { icon: '✨', color: '#d685ad' },
};

export function PokemonTypeBadge({ type, compact = false, highlighted = false }: { type: PokemonType; compact?: boolean; highlighted?: boolean }) {
  const visual = pokemonTypeVisuals[type];
  return <span aria-label={`Tipo ${pokemonTypeLabels[type]}`} className={`inline-flex items-center gap-1.5 rounded-xl border font-extrabold ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5'} ${highlighted ? 'ring-2 ring-electric/70' : ''}`} style={{ borderColor: `${visual.color}80`, backgroundColor: `${visual.color}1f` }}><span aria-hidden="true">{visual.icon}</span>{pokemonTypeLabels[type]}</span>;
}
