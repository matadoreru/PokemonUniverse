import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { uiSound } from '../audio/uiSound';
import { Pill } from './Pill';
import type { PillVariant } from './Pill';
import s from './Dialog.module.css';

export type DialogCloseReason = 'escape' | 'backdrop' | 'action';

export interface DialogAction {
  label: string;
  /** Por defecto, amarilla la primera y azul el resto. La roja va en tamaño principal (regla de `Pill`). */
  variant?: PillVariant;
  onClick(): void;
  /** Recibe el foco al abrir. */
  autoFocus?: boolean;
}

export interface DialogProps {
  open: boolean;
  title: string;
  /** Se llama una sola vez por apertura: Esc, clic en el fondo o tras una acción. Quien lo usa pone `open` a `false`. */
  onClose(reason: DialogCloseReason): void;
  children?: ReactNode;
  actions?: DialogAction[];
  /** Ancho máximo en px (por defecto 520). */
  width?: number;
}

/** Motivo de cierre de un evento del `<dialog>`: Esc (`cancel`) o un clic en el propio elemento, que es el fondo. */
export function dialogCloseReason(e: { type: string; target: unknown; currentTarget: unknown }): 'escape' | 'backdrop' | null {
  if (e.type === 'cancel') return 'escape';
  if (e.type === 'click' && e.target === e.currentTarget) return 'backdrop';
  return null;
}

/** Lo que el controlador necesita del `<dialog>` (en los tests, un objeto simulado). */
export interface DialogLike {
  readonly open: boolean;
  showModal(): void;
  close(): void;
}

export interface DialogController {
  /** Abre en modal y guarda quién tenía el foco. Idempotente. */
  open(): void;
  /** Cierra y devuelve el foco a quien lo tenía al abrir. Sin abrir, no hace nada. */
  close(): void;
  /** Avisa a `onClose` una sola vez por apertura (Esc, fondo, acción o cierre nativo). */
  dismiss(reason: DialogCloseReason, onClose: (reason: DialogCloseReason) => void): void;
  /**
   * Evento `close` nativo (el segundo Esc de Chrome no se puede cancelar). Llega en una tarea aparte: si el
   * `<dialog>` vuelve a estar abierto (StrictMode cierra y reabre al montar), es un evento viejo y se ignora.
   */
  nativeClose(onClose: (reason: DialogCloseReason) => void): void;
}

/** El punto (coordenadas de cliente) cae fuera del rectángulo: el clic fue en el fondo y no en el borde de la caja. */
export function isOutsideRect(rect: { left: number; top: number; right: number; bottom: number }, x: number, y: number): boolean {
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
}

/**
 * Lógica del diálogo separada de React para poder probarla: abre y cierra el `<dialog>`, suena, devuelve el foco y
 * garantiza un único `onClose` aunque lleguen varios eventos antes de que React lo cierre.
 */
export function createDialogController(dialog: DialogLike, getActive: () => unknown): DialogController {
  let shown = false;
  let notified = false;
  let opener: unknown = null;
  return {
    open() {
      if (shown) return;
      shown = true;
      notified = false;
      opener = getActive();
      if (!dialog.open) dialog.showModal();
      uiSound('open');
    },
    close() {
      if (!shown) return;
      shown = false;
      if (dialog.open) dialog.close();
      uiSound('close');
      const target = opener as { focus?: () => void } | null;
      opener = null;
      target?.focus?.();
    },
    dismiss(reason, onClose) {
      if (!shown || notified) return;
      notified = true;
      onClose(reason);
    },
    nativeClose(onClose) {
      if (dialog.open) return;
      this.dismiss('escape', onClose);
    },
  };
}

/**
 * Diálogo modal sobre `<dialog>` nativo (`showModal()`: capa superior, foco atrapado e inerte el resto). Crema, con
 * rebote de entrada. El estado de React manda: Esc y el clic en el fondo no lo cierran por sí solos, piden `onClose`.
 */
export function Dialog({ open, title, onClose, children, actions = [], width }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const ctrl = useRef<DialogController | null>(null);
  const titleId = useId();
  // El clic de fondo solo vale si también se pulsó en el fondo (arrastrar desde la caja no cierra).
  const downOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const dismiss = (reason: DialogCloseReason) => ctrl.current?.dismiss(reason, (r) => onCloseRef.current(r));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = (ctrl.current ??= createDialogController(el, () => document.activeElement));
    if (!open) {
      c.close();
      return;
    }
    c.open();
    el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [open]);
  // Desmontado abierto: se cierra y devuelve el foco igualmente.
  useEffect(() => () => ctrl.current?.close(), []);

  const style = width ? ({ '--dialog-w': `${width}px` } as CSSProperties) : undefined;
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      style={style}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc: React decide; el `<dialog>` no se cierra solo.
        e.preventDefault();
        if (dialogCloseReason(e) === 'escape') dismiss('escape');
      }}
      onClose={() => ctrl.current?.nativeClose((r) => onCloseRef.current(r))}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget && isOutsideRect(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
      }}
      onClick={(e) => {
        // El destino es el `<dialog>` también al pulsar su borde de 3 px: solo cuenta fuera de su rectángulo.
        const outside = isOutsideRect(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
        if (dialogCloseReason(e) === 'backdrop' && outside && downOnBackdrop.current) dismiss('backdrop');
        downOnBackdrop.current = false;
      }}
    >
      {open && (
        <div className={s.box}>
          <h2 id={titleId} className={s.head}>
            {title}
          </h2>
          {children != null && <div className={s.body}>{children}</div>}
          {actions.length > 0 && (
            <div className={s.actions}>
              {actions.map((a, i) => {
                const onClick = () => {
                  a.onClick();
                  dismiss('action');
                };
                const focus = a.autoFocus ? { 'data-autofocus': '' } : {};
                const variant = a.variant ?? (i === 0 ? 'yellow' : 'blue');
                return variant === 'red' ? (
                  <Pill key={`${i}-${a.label}`} {...focus} variant="red" size="main" onClick={onClick}>
                    {a.label}
                  </Pill>
                ) : (
                  <Pill key={`${i}-${a.label}`} {...focus} variant={variant} onClick={onClick}>
                    {a.label}
                  </Pill>
                );
              })}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Se llama al cancelar, al confirmar (después de `onConfirm`), con Esc o con un clic en el fondo. */
  onClose(): void;
  onConfirm(): void;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` (por defecto) para lo que no se deshace: salir, expulsar, borrar; `yellow` para el resto. */
  tone?: 'danger' | 'yellow';
  /** Quién recibe el foco al abrir: «Cancelar» (por defecto) o la acción, si no hay peligro y se espera confirmar. */
  focus?: 'cancel' | 'confirm';
  width?: number;
  children?: ReactNode;
}

/**
 * Orden único de los diálogos de confirmación: «Cancelar» primero (a la izquierda; arriba en móvil, donde se apilan) y
 * la acción después, a la derecha, en rojo si no se deshace. El foco va a «Cancelar» salvo que se pida lo contrario.
 */
export function confirmDialogActions({ confirmLabel, cancelLabel = 'Cancelar', tone = 'danger', focus = 'cancel', onConfirm }: Pick<ConfirmDialogProps, 'confirmLabel' | 'cancelLabel' | 'tone' | 'focus' | 'onConfirm'>): DialogAction[] {
  return [
    { label: cancelLabel, variant: 'blue', autoFocus: focus === 'cancel', onClick: () => undefined },
    { label: confirmLabel, variant: tone, autoFocus: focus === 'confirm', onClick: onConfirm },
  ];
}

/** `Dialog` de confirmación con el orden de `confirmDialogActions`. */
export function ConfirmDialog({ open, title, onClose, width = 420, children, ...actions }: ConfirmDialogProps) {
  return <Dialog open={open} title={title} onClose={onClose} width={width} actions={confirmDialogActions(actions)}>{children}</Dialog>;
}
