import { useEffect, useReducer, useRef } from 'react';

export interface RangeDraftState {
  value: number;
  editing: boolean;
}

export type RangeDraftAction =
  | { type: 'REMOTE_VALUE'; value: number }
  | { type: 'START_EDITING' }
  | { type: 'LOCAL_VALUE'; value: number }
  | { type: 'END_EDITING' };

export function rangeDraftReducer(state: RangeDraftState, action: RangeDraftAction): RangeDraftState {
  if (action.type === 'REMOTE_VALUE') return state.editing ? state : { ...state, value: action.value };
  if (action.type === 'START_EDITING') return { ...state, editing: true };
  if (action.type === 'LOCAL_VALUE') return { value: action.value, editing: true };
  return { ...state, editing: false };
}

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  accent?: 'berry' | 'aqua' | 'electric';
  formatValue?: (value: number) => string;
  hint?: string;
  onCommit(value: number): Promise<void>;
}

export function ConfigRange({ label, value, min, max, step = 1, disabled, accent = 'berry', formatValue = String, hint, onCommit }: Props) {
  const [state, dispatch] = useReducer(rangeDraftReducer, { value, editing: false });
  const editingRef = useRef(false);
  const draftRef = useRef(value);
  const committedRef = useRef(value);
  const keyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    committedRef.current = value;
    if (!editingRef.current) draftRef.current = value;
    dispatch({ type: 'REMOTE_VALUE', value });
  }, [value]);

  useEffect(() => () => { if (keyboardTimer.current) clearTimeout(keyboardTimer.current); }, []);

  const commit = (next: number) => {
    if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    keyboardTimer.current = null;
    editingRef.current = false;
    dispatch({ type: 'END_EDITING' });
    if (next === committedRef.current) return;
    committedRef.current = next;
    void onCommit(next).catch(() => {
      committedRef.current = value;
      draftRef.current = value;
      dispatch({ type: 'REMOTE_VALUE', value });
    });
  };

  return (
    <label className="block min-w-0 rounded-2xl border border-ink/10 bg-surface-raised/55 p-4">
      <span className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-sm font-extrabold text-ink/65">{label}</span>
        <output className="shrink-0 font-display text-lg font-bold text-ink" aria-live="polite">{formatValue(state.value)}</output>
      </span>
      <input
        className={`config-range config-range-${accent}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={state.value}
        disabled={disabled}
        aria-label={label}
        onPointerDown={() => { editingRef.current = true; dispatch({ type: 'START_EDITING' }); }}
        onPointerUp={() => commit(draftRef.current)}
        onPointerCancel={() => commit(draftRef.current)}
        onBlur={() => commit(draftRef.current)}
        onChange={(event) => {
          const next = Number(event.target.value);
          draftRef.current = next;
          dispatch({ type: 'LOCAL_VALUE', value: next });
          if (!editingRef.current) {
            if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
            keyboardTimer.current = setTimeout(() => commit(draftRef.current), 160);
          }
        }}
      />
      {hint && <span className="mt-2 block text-xs font-bold text-ink/45">{hint}</span>}
    </label>
  );
}
