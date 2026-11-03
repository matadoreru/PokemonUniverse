import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import type { ForcedState } from './cx';
import s from './Toggle.module.css';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
  forced?: ForcedState;
}

/** Interruptor: botón `role="switch"` de al menos 44 px de alto. */
export function Toggle({ label, checked, onChange, hint, disabled, className, forced }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cx(s.toggle, checked && s.on, forced && s[forced], className)}
      onClick={() => {
        uiSound('tick');
        onChange(!checked);
      }}
    >
      <span className={s.text}>
        <span className={s.label}>{label}</span>
        {hint && <span className={s.hint}>{hint}</span>}
      </span>
      <span className={s.switch} aria-hidden="true">
        <span className={s.knob} />
      </span>
    </button>
  );
}
