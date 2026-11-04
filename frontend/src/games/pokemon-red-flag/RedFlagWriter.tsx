import { Send } from 'lucide-react';
import { useEffect, useRef, useState, type Ref } from 'react';
import { Pill, TextArea } from '../../ui';
import s from './PokemonRedFlag.module.css';

/** Máximo de la respuesta (el mismo que valida el motor). */
export const RED_FLAG_MAX = 100;

/**
 * Campo de escritura de Red Flag (dentro de la placa de abajo): el `TextArea` del catálogo con su contador `n / 100` y la
 * píldora «Bloquear respuesta». Guarda el borrador en el servidor a cada pulsación y, si al acabar el tiempo hay texto,
 * lo envía solo (150 ms antes del plazo). Si el envío falla, suelta la píldora para volver a intentarlo; el error ya lo
 * dice el aviso global de la sala (un dueño por error), así que aquí no se pinta.
 */
/** Cuánto esperar para el envío automático: 150 ms antes del plazo del servidor (nunca negativo). */
export function autoSendDelay(roundEndsAt: number, now: number, serverOffset: number): number {
  return Math.max(0, roundEndsAt - (now + serverOffset) - 150);
}

/**
 * Envío de la respuesta, sin React (para probarlo): uno solo a la vez y nunca dos veces la misma ronda; vacío, nada. Si
 * `onSubmit` rechaza, suelta el botón (`setBusy(false)`) y se puede volver a enviar; con éxito queda ocupado (el servidor
 * devuelve la respuesta bloqueada y la placa cambia).
 */
export function createAnswerSender(onSubmit: (text: string) => Promise<void>, setBusy: (busy: boolean) => void): { send(value: string): Promise<void> } {
  let sent = false;
  return {
    async send(value) {
      const trimmed = value.trim();
      if (!trimmed || sent) return;
      sent = true;
      setBusy(true);
      try {
        await onSubmit(trimmed);
      } catch {
        // Rechazado (o sin conexión): el aviso global ya lo dice; se puede volver a intentar.
        sent = false;
        setBusy(false);
      }
    },
  };
}

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
  textRef.current = text;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  // Un emisor por montaje (el campo va con `key` de la ronda): no envía dos veces.
  const [sender] = useState(() => createAnswerSender((value) => onSubmitRef.current(value), setBusy));

  // Envío automático al terminar el tiempo si hay texto (como antes).
  useEffect(() => {
    if (!canSubmit || !roundEndsAt) return undefined;
    const timer = window.setTimeout(() => { void sender.send(textRef.current); }, autoSendDelay(roundEndsAt, Date.now(), serverOffset));
    return () => window.clearTimeout(timer);
  }, [roundEndsAt, canSubmit, serverOffset, sender]);

  return <div className={s.writer}>
    <TextArea ref={fieldRef} label={label} value={text} maxLength={RED_FLAG_MAX} rows={2} disabled={!canSubmit || busy} className={s.writerField ?? ''}
      onChange={(value) => { setText(value); textRef.current = value; void onDraft(value).catch(() => undefined); }} />
    <Pill variant="yellow" icon={Send} loading={busy} disabled={!canSubmit || !text.trim()} className={s.writerSend} onClick={() => void sender.send(textRef.current)} data-testid="red-flag-send">Bloquear respuesta</Pill>
  </div>;
}
