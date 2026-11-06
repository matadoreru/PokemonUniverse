import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Pill } from './Pill';
import { hasPopover, useToastHost } from './Toast';
import s from './ActionToast.module.css';

export interface ActionToastAction {
  label: string;
  onClick(): void;
}

export interface ActionToastProps {
  title: string;
  text?: string;
  primary: ActionToastAction;
  secondary: ActionToastAction;
  /**
   * Aviso discreto (durante una partida): no es región viva ni interrumpe, para no competir con la única región viva de
   * la pantalla de juego. Sin `quiet` es `alert`.
   */
  quiet?: boolean;
  /**
   * `status`: región viva educada (`role="status"`, `aria-live="polite"`) en vez de `alert`, para avisos que no urgen
   * fuera de una partida (los logros). `quiet` manda sobre él.
   */
  live?: 'status';
  /** Se llama al llegar `expiresAt`. */
  onExpire?(): void;
  /** Instante (ms desde epoch) en que caduca; si ya pasó, no se pinta. */
  expiresAt?: number;
}

/** Aviso con dos acciones (por ejemplo, una invitación). Va en su sitio: quien lo usa lo coloca. */
export function ActionToast({ title, text, primary, secondary, quiet, live, onExpire, expiresAt }: ActionToastProps) {
  const [expired, setExpired] = useState(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    setExpired(false);
    if (expiresAt === undefined) return;
    const left = expiresAt - Date.now();
    const done = () => {
      setExpired(true);
      onExpireRef.current?.();
    };
    if (left <= 0) {
      done();
      return;
    }
    const timer = setTimeout(done, left);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  if (expired || (expiresAt !== undefined && expiresAt <= Date.now())) return null;
  return (
    <div className={s.toast} {...(quiet ? {} : live === 'status' ? { role: 'status', 'aria-live': 'polite' as const } : { role: 'alert' })}>
      <div className={s.copy}>
        <p className={s.title}>{title}</p>
        {text && <p className={s.text}>{text}</p>}
      </div>
      <div className={s.actions}>
        <Pill size="small" variant="yellow" className={s.action} onClick={primary.onClick}>
          {primary.label}
        </Pill>
        <Pill size="small" variant="ghost" className={s.action} onClick={secondary.onClick}>
          {secondary.label}
        </Pill>
      </div>
    </div>
  );
}

export interface ActionToastStackProps {
  /** Los `ActionToast`, cada uno con su `key`. Sin ninguno no se pinta nada. */
  children?: ReactNode;
  /** Nombre accesible del grupo. */
  label: string;
}

/**
 * Pila de `ActionToast` abajo a la derecha (centrada en el móvil), en un `popover="manual"`: va en la capa superior, por
 * encima de un diálogo o un `Drawer` abierto. Como `ToastStack`, con un `<dialog>` modal abierto se monta dentro de él
 * (`toastHost`), porque fuera quedaría inerte (se vería, pero no se podría pulsar). Al llegar un aviso nuevo con la pila
 * ya abierta, se oculta y se vuelve a mostrar para quedar encima de un diálogo abierto después. Sin la API Popover queda
 * en `position: fixed` con `--z-toast`. No ocupa sitio en el documento.
 */
export function ActionToastStack({ children, label }: ActionToastStackProps) {
  const items = Children.toArray(children);
  const active = items.length > 0;
  const keys = items.map((item) => (isValidElement(item) ? String(item.key) : '')).join('\n');
  const host = useToastHost(active);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const current = keys ? keys.split('\n') : [];
    const fresh = current.some((key) => !seen.current.has(key));
    seen.current = new Set(current);
    const el = ref.current;
    if (!el || !el.isConnected || !hasPopover(el)) return;
    const shown = el.matches(':popover-open');
    if (!shown) el.showPopover();
    else if (fresh) {
      el.hidePopover();
      el.showPopover();
    }
  }, [keys, host]);

  if (!active) return null;
  const content = (
    <div ref={ref} popover="manual" className={s.stack} role="group" aria-label={label} data-layer="action-toasts">
      {items}
    </div>
  );
  return host ? createPortal(content, host) : content;
}
