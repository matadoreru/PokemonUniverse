import type { LucideIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { ActionPlate, cx } from '../../ui';
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
 * kicker, título y ayuda), la acción a la derecha y, debajo, lo que se usa para actuar: la `ui/ActionPlate` del kit de
 * adivinar. Sin región viva propia: lo que se anuncia lo dice la de `SocialScreen`.
 */
export function SocialPlate({ titleRef, content, children, search = false, className, bodyClassName, textClassName }: SocialPlateProps) {
  return <ActionPlate titleId="social-plate-title" titleRef={titleRef} icon={content.icon} tone={content.tone} kicker={content.kicker} title={content.title} text={content.text} aside={content.aside}
    body={children} search={search} className={className} plateClassName={s.plate} textClassName={s.text} helpClassName={textClassName} bodyClassName={cx(s.body, bodyClassName)} />;
}
