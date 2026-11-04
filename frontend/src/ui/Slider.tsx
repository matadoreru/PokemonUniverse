import { useId } from 'react';
import type { CSSProperties } from 'react';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import type { ForcedState } from './cx';
import s from './Slider.module.css';

export interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Texto del valor (por defecto el número). */
  valueText?: (v: number) => string;
  disabled?: boolean;
  /** Ayuda bajo el deslizador, ligada al rango con `aria-describedby`. */
  hint?: string;
  className?: string;
  forced?: ForcedState;
}

/** Deslizador: el rango nativo (transparente, encima) para accesibilidad y una pista pintada debajo. */
export function Slider({ label, value, onChange, min, max, step, valueText, disabled, hint, className, forced }: SliderProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const text = valueText ? valueText(value) : String(value);
  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  return (
    <div className={cx(s.slider, disabled && s.disabled, forced && s[forced], className)}>
      <div className={s.head}>
        <label htmlFor={id} className={s.label}>
          {label}
        </label>
        <output htmlFor={id} className={s.value}>
          {text}
        </output>
      </div>
      <div className={s.control}>
        <span className={s.track} aria-hidden="true">
          {/* Relleno por escala: solo transform. */}
          <span className={s.fill} style={{ '--ratio': ratio } as CSSProperties} />
        </span>
        <input
          id={id}
          type="range"
          className={s.range}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={text}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (next === value) return;
            uiSound('tick');
            onChange(next);
          }}
        />
      </div>
      {hint && (
        <span id={hintId} className={s.hint}>
          {hint}
        </span>
      )}
    </div>
  );
}
