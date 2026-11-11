import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import type { ForcedState } from './cx';
import s from './Segmented.module.css';
import { focusByIndex, nextTab } from './Tabs';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string | number> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  label: string;
  /** Pinta `label` encima del grupo, que lo toma como nombre (`aria-labelledby`); sin ella es solo `aria-label`. */
  showLabel?: boolean;
  /** Ayuda debajo del grupo, que la lee como descripción (`aria-describedby`). */
  hint?: string | undefined;
  /** Con `showLabel` o `hint`, va en el envoltorio que agrupa etiqueta, grupo y ayuda; si no, en el propio grupo. */
  className?: string;
  /** A todo el ancho: las opciones se reparten el sitio y un texto largo («Muy grande») parte en dos líneas. */
  block?: boolean;
  /** Solo galería: estado forzado de la opción activa. */
  forced?: ForcedState;
}

/** Selector de un valor entre 2–5: grupo de radio con foco itinerante y flechas circulares. */
export function Segmented<T extends string | number>({ value, options, onChange, label, showLabel, hint, className, block = false, forced }: SegmentedProps<T>) {
  const labelId = useId();
  const hintId = useId();
  const wrapped = Boolean(showLabel || hint);
  const items = options.map((o) => ({ key: o.value, disabled: o.disabled }));
  const pick = (v: T) => {
    if (v === value) return;
    uiSound('tick');
    onChange(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = nextTab(items, value, e.key);
    if (v === null) return;
    e.preventDefault();
    pick(v);
    focusByIndex(e.currentTarget, 'radio', options.findIndex((o) => o.value === v));
  };
  const group = (
    <div
      className={cx(s.seg, block && s.block, !wrapped && className)}
      role="radiogroup"
      {...(showLabel ? { 'aria-labelledby': labelId } : { 'aria-label': label })}
      {...(hint ? { 'aria-describedby': hintId } : {})}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          tabIndex={o.value === value ? 0 : -1}
          className={cx(s.opt, o.value === value && s.on, o.value === value && forced && s[forced])}
          onClick={() => pick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  if (!wrapped) return group;
  return (
    <div className={cx(s.field, className)}>
      {showLabel && <span id={labelId} className={s.label}>{label}</span>}
      {group}
      {hint && <p id={hintId} className={s.hint}>{hint}</p>}
    </div>
  );
}
