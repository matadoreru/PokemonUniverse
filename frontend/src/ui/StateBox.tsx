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
}

export function StateBox({ kind, title, text, action, onCream }: StateBoxProps) {
  if (kind === 'loading') {
    return (
      <div className={s.ghost} role="status" aria-live="polite" aria-busy="true" aria-label={title}>
        {[0, 1, 2].map((i) => (
          <i key={i} className={cx(s.row, onCream && s.onCream)} />
        ))}
      </div>
    );
  }
  return (
    <div className={cx(s.box, onCream && s.onCream, kind === 'error' && s.error)} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon icon={kind === 'error' ? TriangleAlert : kind === 'empty' ? Inbox : Hourglass} size={32} />
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
