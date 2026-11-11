import type { LucideIcon } from 'lucide-react';
import type { Tone } from './Badge';
import { cx } from './cx';
import { Icon } from './Icon';
import s from './Notice.module.css';

export interface NoticeProps {
  icon: LucideIcon;
  /** Tono de la insignia: `warn` mientras se espera (reconectando), `bad` cuando algo se ha perdido. */
  tone: Extract<Tone, 'warn' | 'bad' | 'info'>;
  title: string;
  text?: string;
  /** Anillo que gira alrededor de la insignia mientras algo está en marcha (solo transform; sin movimiento, quieto). */
  busy?: boolean;
  /** Ventana flotante sobre la página (el aviso de conexión): entra deslizándose y deja pasar los clics. */
  floating?: boolean;
  className?: string | undefined;
}

/**
 * Aviso de estado: franja crema con contorno, insignia redonda del tono, título y una línea. Sin región viva propia:
 * lo anuncia la región `status` de quien lo usa, que ya está montada antes de que aparezca.
 */
export function Notice({ icon, tone, title, text, busy = false, floating = false, className }: NoticeProps) {
  return <div className={cx(s.notice, floating && s.floating, className)}>
    <span className={cx(s.badge, s[`tone_${tone}`])}>
      <Icon icon={icon} size={22} />
      {busy && <span className={s.spinner} aria-hidden="true" />}
    </span>
    <span className={s.text}>
      <strong className={s.title}>{title}</strong>
      {text && <span className={s.line}>{text}</span>}
    </span>
  </div>;
}
