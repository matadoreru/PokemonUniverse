import { useEffect, useRef, useState } from 'react';
import { Pill } from './Pill';
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
  /** Aviso discreto: se anuncia con cortesía (`status`) en vez de interrumpir (`alert`). */
  quiet?: boolean;
  /** Se llama al llegar `expiresAt`. */
  onExpire?(): void;
  /** Instante (ms desde epoch) en que caduca; si ya pasó, no se pinta. */
  expiresAt?: number;
}

/** Aviso con dos acciones (por ejemplo, una invitación). Va en su sitio: quien lo usa lo coloca. */
export function ActionToast({ title, text, primary, secondary, quiet, onExpire, expiresAt }: ActionToastProps) {
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
    <div className={s.toast} role={quiet ? 'status' : 'alert'}>
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
