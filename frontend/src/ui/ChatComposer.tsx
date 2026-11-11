import { SendHorizontal } from 'lucide-react';
import { useId, useRef } from 'react';
import type { FormEvent } from 'react';
import { cx } from './cx';
import { Field } from './Field';
import { Pill } from './Pill';
import s from './ChatComposer.module.css';

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Etiqueta del campo («Escribe un mensaje»). */
  label: string;
  maxLength: number;
  /** Esperando el ack del servidor: no se puede enviar otra vez. */
  busy?: boolean;
  /** Estado, no error: el motivo sustituye al campo y al botón. */
  disabledReason?: string | null;
  className?: string;
}

/** Desde cuántos caracteres se ve el contador. */
const COUNTER_FROM = 160;

/** Envía solo si hay texto (recortado) y no se espera un ack; devuelve si llamó a `onSubmit`. */
export function submitChat(value: string, busy: boolean, onSubmit: () => void): boolean {
  if (busy || value.trim() === '') return false;
  onSubmit();
  return true;
}

/** Campo de escribir del chat: Intro (o el botón) envía; el contador aparece al acercarse al límite. */
export function ChatComposer({ value, onChange, onSubmit, label, maxLength, busy = false, disabledReason, className }: ChatComposerProps) {
  const counterId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  if (disabledReason) {
    return <p className={cx(s.reason, className)}>{disabledReason}</p>;
  }
  const showCounter = value.length >= COUNTER_FROM;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Con el botón el foco se iría a él (y se perdería al deshabilitarse): se devuelve al campo para no cerrar el teclado.
    if (submitChat(value, busy, onSubmit)) formRef.current?.querySelector('input')?.focus();
  };
  return (
    <form ref={formRef} className={cx(s.composer, className)} onSubmit={submit} noValidate>
      <div className={s.field}>
        <Field
          label={label}
          hideLabel
          placeholder={label}
          value={value}
          maxLength={maxLength}
          enterKeyHint="send"
          autoComplete="off"
          aria-describedby={showCounter ? counterId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {showCounter && (
          <span id={counterId} className={cx(s.counter, value.length >= maxLength && s.full)}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <Pill type="submit" variant="blue" size="round" icon={SendHorizontal} aria-label="Enviar" loading={busy} />
    </form>
  );
}
