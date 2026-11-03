import type { KeyboardEvent, ReactNode } from 'react';
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
  className?: string;
  /** Solo galería: estado forzado de la opción activa. */
  forced?: ForcedState;
}

/** Selector de un valor entre 2–5: grupo de radio con foco itinerante y flechas circulares. */
export function Segmented<T extends string | number>({ value, options, onChange, label, className, forced }: SegmentedProps<T>) {
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
  return (
    <div className={cx(s.seg, className)} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
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
}
