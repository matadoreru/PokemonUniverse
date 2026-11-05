import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { createDialogController } from './Dialog';
import type { DialogController } from './Dialog';
import { Pill } from './Pill';
import s from './Drawer.module.css';

export interface DrawerProps {
  open: boolean;
  title: string;
  /** Esc, clic en el fondo o el botón de cerrar. Quien lo usa pone `open` a `false`. */
  onClose(): void;
  children?: ReactNode;
  side?: 'right';
}

/**
 * Panel lateral modal sobre `<dialog>` nativo (`showModal()`: foco atrapado y resto inerte). Al abrir, el foco va al
 * título; al cerrar, vuelve a quien lo abrió. Por debajo de `sm` ocupa toda la pantalla. Esc y el fondo piden `onClose`.
 */
export function Drawer({ open, title, onClose, children, side = 'right' }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const ctrl = useRef<DialogController | null>(null);
  const titleId = useId();
  const downOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const dismiss = () => ctrl.current?.dismiss('action', () => onCloseRef.current());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = (ctrl.current ??= createDialogController(el, () => document.activeElement));
    if (!open) {
      c.close();
      return;
    }
    c.open();
    titleRef.current?.focus();
  }, [open]);
  useEffect(() => () => ctrl.current?.close(), []);

  return (
    <dialog
      ref={ref}
      className={`${s.drawer} ${s[side]}`}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClose={() => ctrl.current?.nativeClose(() => onCloseRef.current())}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        downOnBackdrop.current = e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) dismiss();
        downOnBackdrop.current = false;
      }}
    >
      {open && (
        <div className={s.box}>
          <div className={s.head}>
            <h2 id={titleId} ref={titleRef} tabIndex={-1} className={s.title}>
              {title}
            </h2>
            <Pill size="round" variant="ghost" icon={X} aria-label="Cerrar" onClick={dismiss} />
          </div>
          <div className={s.body}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
