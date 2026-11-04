import { useEffect, useReducer, useRef } from 'react';
import { Slider } from '../ui';
import s from './ConfigRange.module.css';

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
  /** Sin efecto desde Arcade DS (el deslizador del catálogo tiene un solo tono); se conserva por compatibilidad. */
  accent?: 'berry' | 'aqua' | 'electric';
  formatValue?: (value: number) => string;
  hint?: string;
  onCommit(value: number): Promise<void>;
}

export function ConfigRange({ label, value, min, max, step = 1, disabled, formatValue = String, hint, onCommit }: Props) {
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

  const startEditing = () => { editingRef.current = true; dispatch({ type: 'START_EDITING' }); };
  const endEditing = () => commit(draftRef.current);

  // El deslizador del catálogo da el valor; el envoltorio recoge el arrastre (puntero) y la salida del foco, que suben
  // desde el rango, para confirmar al soltar. Con teclado, cada paso se confirma a los 160 ms.
  return (
    <div className={s.range} onPointerDown={startEditing} onPointerUp={endEditing} onPointerCancel={endEditing} onBlur={endEditing}>
      <Slider
        label={label}
        value={state.value}
        min={min}
        max={max}
        step={step}
        disabled={Boolean(disabled)}
        valueText={formatValue}
        {...(hint ? { hint } : {})}
        onChange={(next) => {
          draftRef.current = next;
          dispatch({ type: 'LOCAL_VALUE', value: next });
          if (!editingRef.current) {
            if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
            keyboardTimer.current = setTimeout(() => commit(draftRef.current), 160);
          }
        }}
      />
    </div>
  );
}
