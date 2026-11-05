import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import { Icon } from './Icon';
import { Pill } from './Pill';
import s from './Toast.module.css';

export type ToastKind = 'ok' | 'error' | 'info';

export interface ToastData {
  id: number;
  kind: ToastKind;
  text: string;
}

export interface ToastStackProps {
  toasts: ToastData[];
  onClose(id: number): void;
}

const ICON: Record<ToastKind, LucideIcon> = {
  ok: CheckCircle2,
  error: XCircle,
  info: Info,
};

/** Un error interrumpe (`alert`); el resto se anuncia con cortesía (`status`). */
export function toastRole(kind: ToastKind): 'alert' | 'status' {
  return kind === 'error' ? 'alert' : 'status';
}

/** Texto del último aviso que no es error: lo repite la región viva fija (los errores ya son `alert`). */
export function latestStatusText(toasts: ToastData[]): string {
  for (let i = toasts.length - 1; i >= 0; i--) if (toasts[i]!.kind !== 'error') return toasts[i]!.text;
  return '';
}

/** Hay algún aviso que no estaba en `seen`. */
export function hasNewToast(toasts: ToastData[], seen: ReadonlySet<number>): boolean {
  return toasts.some((t) => !seen.has(t.id));
}

/**
 * Dónde se monta la pila: dentro del último `<dialog>` modal abierto (un diálogo modal deja inerte el resto del
 * documento, así que un aviso fuera de él se vería pero no se anunciaría ni se podría cerrar) o, sin él, en su sitio
 * (`null`). Un `<dialog>` abierto con `show()` no es modal ni deja nada inerte: no se lleva los avisos.
 */
export function toastHost(doc: Pick<Document, 'querySelectorAll'>): Element | null {
  const open = doc.querySelectorAll('dialog[open]:modal');
  return open.length > 0 ? (open[open.length - 1] ?? null) : null;
}

/** Sigue el anfitrión de la pila mientras hay avisos: se recalcula al abrirse, cerrarse o quitarse un diálogo. */
export function useToastHost(active: boolean): Element | null {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    if (!active) return;
    const update = () => setHost(toastHost(document));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, [active]);
  return active ? host : null;
}

/** El navegador tiene la API Popover (si no, la pila queda en `position: fixed` con `--z-toast`). */
export function hasPopover(el: HTMLElement): el is HTMLElement & { showPopover(): void; hidePopover(): void } {
  return typeof (el as { showPopover?: unknown }).showPopover === 'function';
}

/**
 * Pila de avisos abajo en el centro, en un `popover="manual"` (capa superior, por encima de un diálogo abierto). Se
 * muestra con `showPopover()` cuando hay avisos y se oculta cuando no queda ninguno; si llega uno nuevo con la pila ya
 * abierta, se oculta y se vuelve a mostrar para quedar encima de un diálogo abierto después. Los errores son `alert`;
 * el resto se anuncia en una región `status` fija fuera del popover (un aviso que aparece ya lleno en un contenedor
 * oculto puede no anunciarse). Suena `error` al llegar uno de error. Con un `<dialog>` modal abierto, todo (pila y
 * región viva) se monta dentro de él (`toastHost`): sigue en la capa superior por ser `popover`, pero ya no es inerte.
 */
export function ToastStack({ toasts, onClose }: ToastStackProps) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<number>());
  const host = useToastHost(toasts.length > 0);

  // Depende también de `host`: al cambiar de anfitrión el portal crea un elemento nuevo, que hay que volver a mostrar.
  useEffect(() => {
    const fresh = hasNewToast(toasts, seen.current);
    for (const t of toasts) if (!seen.current.has(t.id) && t.kind === 'error') uiSound('error');
    seen.current = new Set(toasts.map((t) => t.id));
    const el = ref.current;
    // Un anfitrión viejo (diálogo ya quitado del DOM) deja el elemento fuera del documento: `showPopover()` lanzaría.
    if (!el || !el.isConnected || !hasPopover(el)) return;
    const shown = el.matches(':popover-open');
    if (toasts.length === 0) {
      if (shown) el.hidePopover();
      return;
    }
    if (!shown) el.showPopover();
    else if (fresh) {
      // Volver a la cima de la capa superior (un diálogo abierto después taparía la pila).
      el.hidePopover();
      el.showPopover();
    }
  }, [toasts, host]);

  const content = (
    <>
      <div className={s.srOnly} role="status" aria-live="polite">
        {latestStatusText(toasts)}
      </div>
      <div ref={ref} popover="manual" className={s.stack}>
        {toasts.map((t) => (
          <div key={t.id} className={cx(s.toast, s[t.kind])} role={t.kind === 'error' ? 'alert' : undefined}>
            <span className={s.icon}>
              <Icon icon={ICON[t.kind]} size={22} />
            </span>
            <span className={s.text}>{t.text}</span>
            <Pill size="round" variant="ghost" icon={X} aria-label="Cerrar aviso" className={s.close} onClick={() => onClose(t.id)} />
          </div>
        ))}
      </div>
    </>
  );
  return host ? createPortal(content, host) : content;
}

/** Estado de avisos: `push` devuelve el id y lo cierra solo a los `ms` (0 = no se cierra solo). */
export function useToasts(): {
  toasts: ToastData[];
  push(kind: ToastKind, text: string, ms?: number): number;
  close(id: number): void;
} {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const close = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, text: string, ms = 4000) => {
      const id = ++seq.current;
      setToasts((list) => [...list, { id, kind, text }]);
      if (ms > 0)
        timers.current.set(
          id,
          setTimeout(() => close(id), ms),
        );
      return id;
    },
    [close],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { toasts, push, close };
}
