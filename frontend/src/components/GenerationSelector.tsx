import { GENERATIONS } from '@pokemon-universe/shared/public';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { Pill } from '../ui';
import s from './GenerationSelector.module.css';

interface GenerationSelectorProps {
  selected: readonly number[];
  onChange(generations: number[]): void;
  label?: string;
  description?: string;
}

/** La selección tras pulsar una generación, ordenada; `null` si dejaría la lista vacía (siempre queda al menos una). */
export function toggleGeneration(selected: readonly number[], generation: number): number[] | null {
  const next = selected.includes(generation) ? selected.filter((value) => value !== generation) : [...selected, generation];
  return next.length ? [...next].sort((left, right) => left - right) : null;
}

/**
 * Selector de generaciones de los `ConfigPanel` (nunca vacío): un grupo con su etiqueta y una píldora conmutadora por
 * generación (`aria-pressed`). Elegida: amarilla y con ✓ (el color nunca va solo); sin elegir: crema. La última que
 * queda elegida no se puede quitar. Va dentro de un `fieldset`: si está deshabilitado, las píldoras también.
 */
export function GenerationSelector({ selected, onChange, label = 'Generaciones', description }: GenerationSelectorProps) {
  const labelId = useId();
  const helpId = useId();
  function toggle(generation: number) {
    const next = toggleGeneration(selected, generation);
    if (next) onChange(next);
  }
  return <div className={s.group} role="group" aria-labelledby={labelId} {...(description ? { 'aria-describedby': helpId } : {})}>
    <span id={labelId} className={s.label}>{label}</span>
    {description && <p id={helpId} className={s.help}>{description}</p>}
    <div className={s.options}>
      {GENERATIONS.map((generation) => {
        const active = selected.includes(generation);
        return <Pill key={generation} size="small" block variant={active ? 'yellow' : 'cream'} aria-pressed={active} className={s.option}
          {...(active ? { icon: Check } : {})} onClick={() => toggle(generation)}>Gen {generation}</Pill>;
      })}
    </div>
  </div>;
}
