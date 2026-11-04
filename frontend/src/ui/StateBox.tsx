import { Hourglass, Inbox, TriangleAlert } from 'lucide-react';
import { cx } from './cx';
import { Icon } from './Icon';
import { Pill } from './Pill';
import s from './StateBox.module.css';

export interface StateBoxProps {
  kind: 'empty' | 'loading' | 'error';
  title: string;
  text?: string;
  /** En error la acción es una píldora amarilla («Reintentar» la pone quien llama). */
  action?: { label: string; onClick(): void };
  /** Sobre fondo crema. */
  onCream?: boolean;
  /**
   * Vacío o carga como región viva (`role="status"`, por defecto). Con `false`, sin rol: para un vacío dentro de una
   * pantalla que ya tiene su única región viva (p. ej. los intentos de los juegos de adivinar). El error sigue siendo `alert`.
   */
  live?: boolean;
}

export function StateBox({ kind, title, text, action, onCream, live = true }: StateBoxProps) {
  if (kind === 'loading') {
    return (
      <div className={s.ghost} {...(live ? { role: 'status', 'aria-live': 'polite' as const, 'aria-label': title } : {})} aria-busy="true">
        {/* Sin rol, `aria-label` no vale en un elemento genérico: el título va como texto para lectores. */}
        {!live && <span className="sr-only">{title}</span>}
        {[0, 1, 2].map((i) => (
          <i key={i} className={cx(s.row, onCream && s.onCream)} />
        ))}
      </div>
    );
  }
  return (
    <div className={cx(s.box, onCream && s.onCream, kind === 'error' && s.error)} {...(kind === 'error' ? { role: 'alert' } : live ? { role: 'status' } : {})}>
      <Icon icon={kind === 'error' ? TriangleAlert : kind === 'empty' ? Inbox : Hourglass} size={32} className={s.icon} />
      <strong className={s.title}>{title}</strong>
      {text && <p className={s.text}>{text}</p>}
      {action && (
        <Pill size="small" variant={kind === 'error' ? 'yellow' : 'blue'} onClick={action.onClick} className={s.action}>
          {action.label}
        </Pill>
      )}
    </div>
  );
}
