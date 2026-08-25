import { GENERATIONS } from '@pokemon-universe/shared';

interface GenerationSelectorProps {
  selected: readonly number[];
  onChange(generations: number[]): void;
  label?: string;
  description?: string;
  accent?: 'aqua' | 'electric';
}

/** Shared non-empty generation picker used by minigame configuration strategies. */
export function GenerationSelector({ selected, onChange, label = 'Generaciones', description, accent = 'aqua' }: GenerationSelectorProps) {
  function toggle(generation: number) {
    const next = selected.includes(generation) ? selected.filter((value) => value !== generation) : [...selected, generation];
    if (next.length) onChange([...next].sort((left, right) => left - right));
  }
  return <section><span className="label">{label}</span>{description && <p className="mb-3 text-sm font-bold text-ink/65">{description}</p>}<div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{GENERATIONS.map((generation) => { const active = selected.includes(generation); return <button type="button" key={generation} aria-pressed={active} onClick={() => toggle(generation)} className={`min-h-11 rounded-xl border py-2 font-bold ${active ? accent === 'electric' ? 'border-electric bg-electric text-night' : 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised text-ink/65'}`}>Gen {generation}</button>; })}</div></section>;
}
