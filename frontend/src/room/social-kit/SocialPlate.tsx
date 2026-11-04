import type { LucideIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { cx, Icon, Panel } from '../../ui';
import g from '../guess-kit/GuessPanel.module.css';
import s from './SocialPlate.module.css';

/** Lo que pinta la placa: icono y tono, kicker, título, ayuda y, a la derecha, la acción o los puntos. */
export interface SocialPlateContent {
  icon: LucideIcon;
  tone: 'ok' | 'bad' | 'info' | 'warn';
  kicker: ReactNode;
  title: string;
  text?: ReactNode;
  aside?: ReactNode;
}

export interface SocialPlateProps {
  /** Al título (`h2#social-plate-title`, `tabIndex -1`) va el foco al cambiar de fase (`useFocusOnTransition`). */
  titleRef: Ref<HTMLHeadingElement>;
  content: SocialPlateContent;
  /**
   * Debajo de la fila del título: el buscador (`search`), el campo de escritura o las opciones de la papeleta. Con
   * `search`, en escritorio el título va a la izquierda y el buscador a la derecha (como `GuessPanel`).
   */
  children?: ReactNode;
  search?: boolean;
  className?: string | undefined;
  /** Clase del contenedor de `children` (p. ej. la rejilla de la papeleta). */
  bodyClassName?: string | undefined;
  /** Clase de la ayuda (`content.text`), p. ej. para ocultarla donde falta alto. */
  textClassName?: string | undefined;
}

/**
 * Pantalla inferior de los juegos sociales (spec §2: abajo, la acción): una placa crema con el estado en texto (icono,
 * kicker, título y ayuda), la acción a la derecha y, debajo, lo que se usa para actuar. Tiene el mismo aspecto que la
 * placa del kit de adivinar (comparte su CSS). Sin región viva propia: lo que se anuncia lo dice la de `SocialScreen`.
 */
export function SocialPlate({ titleRef, content, children, search = false, className, bodyClassName, textClassName }: SocialPlateProps) {
  return <Panel variant="cream" as="section" {...(className ? { className } : {})} bodyClassName={cx(g.plate, search && g.plateSearch, s.plate)} aria-labelledby="social-plate-title">
    <div className={g.plateRow}>
      <span className={cx(g.plateIcon, g[`tone_${content.tone}`])}><Icon icon={content.icon} size={32} /></span>
      <div className={cx(g.plateText, s.text)}>
        <span className={g.kicker}>{content.kicker}</span>
        <h2 id="social-plate-title" ref={titleRef} tabIndex={-1} className={g.plateTitle}>{content.title}</h2>
        {content.text && <p className={cx(g.help, textClassName)}>{content.text}</p>}
      </div>
      {content.aside && <div className={g.plateAside}>{content.aside}</div>}
    </div>
    {children != null && children !== false && <div className={cx(search && g.search, s.body, bodyClassName)}>{children}</div>}
  </Panel>;
}
