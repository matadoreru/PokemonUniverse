import { Send } from 'lucide-react';
import { useEffect, useRef, useState, type Ref } from 'react';
import { cx, Pill, TextArea } from '../../ui';
import s from './PokemonRedFlag.module.css';

/** Máximo de la respuesta (el mismo que valida el motor). */
export const RED_FLAG_MAX = 100;

/**
 * Campo de escritura de Red Flag (dentro de la placa de abajo): el `TextArea` del catálogo con su contador `n / 100` y la
 * píldora «Bloquear respuesta». Guarda el borrador en el servidor a cada pulsación y, si al acabar el tiempo hay texto,
 * lo envía solo (150 ms antes del plazo). Si el envío falla, suelta la píldora para volver a intentarlo; el error ya lo
 * dice el aviso global de la sala (un dueño por error), así que aquí no se pinta.
 */
export function RedFlagWriter({ label, initialDraft, canSubmit, roundEndsAt, serverOffset, fieldRef, onDraft, onSubmit }: {
  /** Etiqueta del campo («Tu red flag para Gengar»). */
  label: string;
  initialDraft: string;
  canSubmit: boolean;
  roundEndsAt: number | null;
  serverOffset: number;
  /** Destino del foco al empezar a escribir. */
  fieldRef: Ref<HTMLTextAreaElement>;
  onDraft(text: string): Promise<void>;
  onSubmit(text: string): Promise<void>;
}) {
  const [text, setText] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const textRef = useRef(text);
  const sentRef = useRef(false);
  textRef.current = text;

  const send = async (value = textRef.current) => {
    const trimmed = value.trim();
    if (!trimmed || sentRef.current) return;
    sentRef.current = true;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } catch {
      // Rechazado (o sin conexión): se puede volver a intentar.
      sentRef.current = false;
      setBusy(false);
    }
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  // Envío automático al terminar el tiempo si hay texto (como antes).
  useEffect(() => {
    if (!canSubmit || !roundEndsAt) return undefined;
    const delay = Math.max(0, roundEndsAt - (Date.now() + serverOffset) - 150);
    const timer = window.setTimeout(() => { if (textRef.current.trim()) void sendRef.current(textRef.current); }, delay);
    return () => window.clearTimeout(timer);
  }, [roundEndsAt, canSubmit, serverOffset]);

  return <div className={s.writer}>
    <TextArea ref={fieldRef} label={label} value={text} maxLength={RED_FLAG_MAX} rows={2} disabled={!canSubmit || busy} className={cx(s.writerField)}
      onChange={(value) => { setText(value); textRef.current = value; void onDraft(value).catch(() => undefined); }} />
    <Pill variant="yellow" icon={Send} loading={busy} disabled={!canSubmit || !text.trim()} className={s.writerSend} onClick={() => void send()} data-testid="red-flag-send">Bloquear respuesta</Pill>
  </div>;
}
