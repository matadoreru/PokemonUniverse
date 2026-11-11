import type { RevealSkipView } from '@pokemon-universe/shared/public';
import { Check, ChevronsRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { Pill } from '../ui';
import s from './SkipGameControl.module.css';

interface RevealNextControlProps {
  reveal: RevealSkipView;
  selfId: string | null;
  connected: boolean;
  onNext(): Promise<void>;
}

/** Nombre accesible: la acción y el recuento («2 de 3 listos»). */
export function revealNextLabel(reveal: RevealSkipView, ready: boolean): string {
  const count = `${reveal.readyPlayerIds.length} de ${reveal.playerIds.length} listos`;
  return ready ? `Esperando al resto para pasar al siguiente: ${count}` : `Pasar al siguiente: ${count}`;
}

/**
 * «Siguiente» en los revelados (E2): cuando todos los jugadores conectados de la partida lo han pulsado, al revelado le
 * queda 1 s. Lleva el recuento «N/M»; pulsado, queda marcado hasta que cambia el revelado. Los espectadores no lo ven.
 * Sin región viva propia: la de la pantalla del juego es la única.
 */
export function RevealNextControl({ reveal, selfId, connected, onNext }: RevealNextControlProps) {
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  if (!selfId || !reveal.playerIds.includes(selfId)) return null;
  const ready = reveal.readyPlayerIds.includes(selfId);
  const next = async () => {
    if (ready || !connected || sending.current) return;
    sending.current = true;
    setPending(true);
    try { await onNext(); }
    catch { /* El fallo ya sale, traducido, en el aviso global de la sala (RoomContext). */ }
    finally { sending.current = false; setPending(false); }
  };
  return <div className={s.control} data-testid="reveal-next">
    <Pill variant={ready ? 'yellow' : 'blue'} icon={ready ? Check : ChevronsRight} aria-label={revealNextLabel(reveal, ready)} aria-pressed={ready}
      disabled={!connected || ready} loading={pending} onClick={() => void next()}>
      Siguiente
      <span className={s.count}>{reveal.readyPlayerIds.length}/{reveal.playerIds.length}</span>
    </Pill>
  </div>;
}
